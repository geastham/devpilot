import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * Working directory → repository — TRD 21 §6.2.
 *
 * This is the join that makes adoption possible at all: a transcript knows its
 * `cwd`, `repo_routes` is keyed on `owner/name`, and `git remote get-url` is
 * the bridge between them. No configuration, no registry, no agent cooperation.
 *
 * `execFileSync` and not `exec`: a `cwd` comes from a transcript on disk, and
 * putting it through a shell would make a directory named `; rm -rf ~` a
 * remote-code-execution vector in a tool whose entire job is to walk directories
 * it did not create. There is no shell here, ever.
 *
 * Everything is memoized per process. A machine with 38 project directories has
 * far fewer distinct repos, and `git status` on a large repo is the single most
 * expensive call in the scan.
 */

export interface RepoIdentity {
  /** `owner/name`. */
  repo: string;
  owner: string;
  name: string;
  /** `github.com`, `gitlab.com`, … Never a path. */
  host: string;
}

const GIT_TIMEOUT_MS = 5_000;

const remoteCache = new Map<string, RepoIdentity | null>();
const branchCache = new Map<string, string | null>();
const statusCache = new Map<string, string[]>();

/** Test seam and long-lived-process hygiene. */
export function clearRepoCache(): void {
  remoteCache.clear();
  branchCache.clear();
  statusCache.clear();
}

function git(cwd: string, args: string[], maxBuffer = 4 * 1024 * 1024): string | null {
  try {
    return execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      timeout: GIT_TIMEOUT_MS,
      maxBuffer,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    // Not a repo, no remote, git absent, timeout, permissions. All of these mean
    // the same thing to the caller — nothing to route — and none is worth a throw.
    return null;
  }
}

/**
 * Normalize a git remote URL to `host` + `owner/name`.
 *
 * The four forms that actually occur:
 *
 *     git@github.com:openconjecture/devpilot.git
 *     https://github.com/openconjecture/devpilot.git
 *     ssh://git@github.com/openconjecture/devpilot
 *     https://user:token@github.com/openconjecture/devpilot
 *
 * Credentials in the third and fourth forms are discarded here and never
 * returned, which matters because this value is about to cross the network.
 */
export function parseRemoteUrl(raw: string): RepoIdentity | null {
  const url = raw.trim();
  if (!url) return null;

  let host: string;
  let path: string;

  const scp = url.match(/^(?:([^@/]+)@)?([^:/@]+):(.+)$/);
  if (scp && !url.includes('://')) {
    host = scp[2];
    path = scp[3];
  } else {
    try {
      const parsed = new URL(url);
      // `parsed.host` would carry a port; `hostname` never carries credentials.
      host = parsed.hostname;
      path = parsed.pathname;
    } catch {
      return null;
    }
  }

  const segments = path
    .replace(/\.git$/, '')
    .split('/')
    .filter(Boolean);

  if (segments.length < 2) return null;

  // Take the LAST two segments: self-hosted GitLab nests groups arbitrarily
  // deep (`gitlab.acme.com/platform/team/service`), and the routable identity is
  // the immediate parent plus the name.
  const name = segments[segments.length - 1];
  const owner = segments[segments.length - 2];
  if (!owner || !name) return null;
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(name)) return null;

  return { repo: `${owner}/${name}`, owner, name, host: host.toLowerCase() };
}

/**
 * The repo a directory belongs to, or null when it belongs to none.
 *
 * A worktree resolves to the same repo as its parent checkout, which is
 * correct: `…--claude-worktrees-work-2026-08-09` is the same project as the
 * directory it was cut from, and adoption should attach both to the same board.
 */
export function resolveRepo(cwd: string): RepoIdentity | null {
  const cached = remoteCache.get(cwd);
  if (cached !== undefined) return cached;

  let identity: RepoIdentity | null = null;
  if (existsSync(cwd)) {
    const remote = git(cwd, ['remote', 'get-url', 'origin']);
    identity = remote ? parseRemoteUrl(remote) : null;
  }

  remoteCache.set(cwd, identity);
  return identity;
}

/**
 * The branch a directory is on right now.
 *
 * Preferred over the transcript's `gitBranch`, which records the branch at the
 * moment an entry was written — usually session start. Branch matching against
 * Linear (`AVA-31-…`) wants the branch the work is actually on, and an agent
 * that created a branch mid-session would otherwise be matched against `main`.
 *
 * Returns null on a detached HEAD, where `rev-parse --abbrev-ref` answers
 * `HEAD` and there is no branch name to match on.
 */
export function resolveBranch(cwd: string): string | null {
  const cached = branchCache.get(cwd);
  if (cached !== undefined) return cached;

  let branch: string | null = null;
  if (existsSync(cwd)) {
    const out = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const trimmed = out?.trim();
    branch = trimmed && trimmed !== 'HEAD' ? trimmed : null;
  }

  branchCache.set(cwd, branch);
  return branch;
}

/**
 * Paths with uncommitted changes in a directory.
 *
 * PATHS ONLY. This function must never return, log, or read file contents —
 * `--porcelain` is parsed for its path column and nothing else. It exists so
 * the in-flight-file guard is correct for sessions DevPilot did not start
 * (TRD 21 §1.1), which needs the names and never the bodies.
 *
 * `-uall` lists untracked files individually; without it a session that creates
 * `src/new/a.ts` and `src/new/b.ts` reports the single path `src/new/`.
 */
export function resolveTouchedPaths(cwd: string, limit = 50): string[] {
  const cached = statusCache.get(cwd);
  if (cached !== undefined) return cached.slice(0, limit);

  let paths: string[] = [];
  if (existsSync(cwd)) {
    const out = git(cwd, ['status', '--porcelain', '-uall']);
    if (out) {
      paths = out
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          // `XY <path>` or `XY <old> -> <new>` for renames. The new path is the
          // one a conflicting agent would collide on.
          const body = line.slice(3);
          const arrow = body.indexOf(' -> ');
          return (arrow === -1 ? body : body.slice(arrow + 4)).replace(/^"|"$/g, '');
        })
        .filter(Boolean);
    }
  }

  statusCache.set(cwd, paths);
  return paths.slice(0, limit);
}
