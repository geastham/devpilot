import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AdoptionCandidate, DiscoveredRepo } from '@devpilot.sh/bridge-protocol';
import { ADOPTION_LIMITS } from '@devpilot.sh/bridge-protocol';
import { probeTranscript, type ProbeOptions, type SessionObservation } from './transcript';
import { resolveBranch, resolveRepo, resolveTouchedPaths } from './repo';

/**
 * The walk — TRD 21 §6.3.
 *
 * Enumerates every Claude Code session on this machine, resolves each to a
 * repository, decides which are adoptable, and produces both halves of the
 * output: `candidates` for the board, and `discovered` for the inventory.
 *
 * ## Every exclusion is reported
 *
 * `skipped` is not a debug affordance. A user who expects to see a session and
 * does not must be able to find out why from the preview — a scanner whose
 * skips are invisible is indistinguishable from one that is broken, and the
 * conclusion a user reaches is "this doesn't work", not "that session was
 * outside the window".
 */

export type SkipReason =
  | 'devpilot-owned'
  | 'not-routed'
  | 'no-repo'
  | 'too-old'
  | 'sidechain'
  | 'empty'
  | 'unreadable';

export interface SkippedSession {
  sessionUuid: string;
  reason: SkipReason;
  /** Present when known — lets the preview say WHICH repo was withheld. */
  repo?: string;
  owner?: string;
}

export interface ScanOptions {
  /** Defaults to `~/.claude/projects`. */
  root?: string;
  /**
   * Repos this machine routes. A session outside this set is skipped as
   * `not-routed` unless `allRepos` is set.
   *
   * TRD 21 §3.5: the default is narrow because `~/.claude/projects` holds every
   * project on the machine, which on the reference machine meant four unrelated
   * clients in one directory.
   */
  repos?: string[];
  /** Widen to every repo found. The caller is responsible for consent. */
  allRepos?: boolean;
  /** Still-running window. Default 15 minutes. */
  liveWithinMs?: number;
  /** Adoptable window. Default 24 hours. */
  sinceMs?: number;
  /** Claude session UUIDs DevPilot itself started (TRD 21 §4.4 mechanism 1). */
  excludeSessionUuids?: Set<string>;
  /** Include changed file paths. Default true; `--no-paths` clears it. */
  includePaths?: boolean;
  machineName: string;
  now?: Date;
  probe?: ProbeOptions;
  /** Test seam for the scratchpad liveness probe. */
  existsImpl?: (path: string) => boolean;
}

export interface ScanResult {
  candidates: AdoptionCandidate[];
  discovered: DiscoveredRepo[];
  /** Sessions in directories with no resolvable git remote. */
  unmappedProjectCount: number;
  skipped: SkippedSession[];
  /** Project directories walked. The denominator in "scanned N projects". */
  projectDirCount: number;
  /** Observations that survived probing, before any filtering. */
  observedCount: number;
  /**
   * `adoptionKey → where that session lives on disk`. LOCAL ONLY.
   *
   * Exists so the summarizer can re-read the one transcript it needs without
   * the scan holding every `headSample` in memory — and, more importantly,
   * without `SessionObservation` (which carries transcript text) ever becoming
   * part of the value that gets uploaded. The scan's return type is one
   * careless `JSON.stringify` away from the network; keeping transcript samples
   * out of it is structural, not stylistic.
   */
  transcriptPaths: Map<string, { transcriptPath: string; sessionUuid: string }>;
}

const DEFAULT_LIVE_WITHIN_MS = 15 * 60 * 1000;
const DEFAULT_SINCE_MS = 24 * 60 * 60 * 1000;

export function defaultProjectsRoot(): string {
  return join(homedir(), '.claude', 'projects');
}

/**
 * `sha256(machineName + ':' + sessionUuid)`, hex — TRD 21 §4.1.
 *
 * The machine name is in the hash because two laptops share a session UUID only
 * if someone copied a `~/.claude` directory between them, and if they did,
 * those are genuinely two observations of two different machines rather than
 * one thing seen twice.
 */
export function adoptionKeyFor(machineName: string, sessionUuid: string): string {
  return createHash('sha256').update(`${machineName}:${sessionUuid}`).digest('hex');
}

/**
 * Sessions DevPilot's own runner started, recorded from `claude`'s JSON
 * envelope — TRD 21 §4.4 mechanism 1.
 *
 * Never throws: a missing or corrupt ledger must degrade to "we don't know",
 * where mechanism 2 (the prompt marker) still applies, rather than failing a
 * scan.
 */
export function loadOwnedSessionIds(path?: string): Set<string> {
  const file = path ?? join(homedir(), '.devpilot', 'owned-sessions.json');
  try {
    if (!existsSync(file)) return new Set();
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { sessionIds?: unknown };
    if (!Array.isArray(parsed.sessionIds)) return new Set();
    return new Set(parsed.sessionIds.filter((v): v is string => typeof v === 'string'));
  } catch {
    return new Set();
  }
}

/**
 * Candidate scratchpad roots for the liveness check.
 *
 * A live session owns `<tmp>/claude-<uid>/<project-slug>/<session-uuid>/`, and
 * the project-slug segment is the SAME directory name used under
 * `~/.claude/projects` — which is what makes this a usable join rather than a
 * guess. macOS reports `/private/tmp`; Linux uses `/tmp`.
 */
function scratchpadRoots(): string[] {
  const override = process.env.DEVPILOT_SCRATCHPAD_ROOT;
  if (override) return [override];
  const uid = typeof process.getuid === 'function' ? process.getuid() : null;
  if (uid === null) return [];
  return [`/private/tmp/claude-${uid}`, `/tmp/claude-${uid}`];
}

/**
 * Is this session still running?
 *
 * mtime alone is not enough. A session that is *thinking* — a long model call,
 * a slow test run — writes nothing for minutes and would read as ended. The
 * scratchpad directory exists for the lifetime of the session, so its presence
 * is the stronger signal and mtime is the fallback.
 */
function isLive(
  observation: SessionObservation,
  projectSlug: string,
  liveWithinMs: number,
  nowMs: number,
  existsImpl: (p: string) => boolean,
): boolean {
  if (nowMs - observation.lastActivityMs <= liveWithinMs) return true;
  return scratchpadRoots().some((root) =>
    existsImpl(join(root, projectSlug, observation.sessionUuid)),
  );
}

/** One line, no newlines, cut on a word boundary. */
export function condenseTitle(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  // Only respect a word boundary if it is not absurdly early — a single
  // 200-character token would otherwise collapse to nothing.
  const body = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${body.trimEnd()}…`;
}

/**
 * The title used when no model call is made.
 *
 * The client's own `custom-title` is genuinely good — the reference transcript
 * carries `"DevPilot: Claude Code Bootstrap"` — which is why the heuristic tier
 * is a floor rather than a degraded mode (TRD 21 §6.4).
 */
export function heuristicTitle(observation: SessionObservation): string {
  if (observation.customTitle) {
    return condenseTitle(observation.customTitle, ADOPTION_LIMITS.MAX_TITLE_CHARS);
  }
  if (observation.firstHumanPrompt) {
    return condenseTitle(observation.firstHumanPrompt, ADOPTION_LIMITS.MAX_TITLE_CHARS);
  }
  return `Agent session ${observation.sessionUuid.slice(0, 8)}`;
}

/**
 * Walk `~/.claude/projects` and classify everything in it.
 *
 * Pure with respect to the network: this function reads the filesystem and runs
 * `git`, and does nothing else. Summarization and upload are the caller's.
 */
export function scanSessions(options: ScanOptions): ScanResult {
  const root = options.root ?? defaultProjectsRoot();
  const nowMs = (options.now ?? new Date()).getTime();
  const liveWithinMs = options.liveWithinMs ?? DEFAULT_LIVE_WITHIN_MS;
  const sinceMs = options.sinceMs ?? DEFAULT_SINCE_MS;
  const includePaths = options.includePaths !== false;
  const excluded = options.excludeSessionUuids ?? new Set<string>();
  const existsImpl = options.existsImpl ?? existsSync;
  const routed = new Set((options.repos ?? []).map((r) => r.toLowerCase()));

  const candidates: AdoptionCandidate[] = [];
  const skipped: SkippedSession[] = [];
  const transcriptPaths = new Map<string, { transcriptPath: string; sessionUuid: string }>();
  const inventory = new Map<
    string,
    DiscoveredRepo & { cwds: Set<string> }
  >();
  let unmappedProjectCount = 0;
  let projectDirCount = 0;
  let observedCount = 0;

  let projectDirs: string[];
  try {
    projectDirs = readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    // No transcript store at all. A machine that has never run Claude Code is
    // not an error condition — it is a completely normal first install.
    return {
      candidates: [],
      discovered: [],
      unmappedProjectCount: 0,
      skipped: [],
      projectDirCount: 0,
      observedCount: 0,
      transcriptPaths: new Map(),
    };
  }

  for (const projectSlug of projectDirs) {
    projectDirCount++;
    const dir = join(root, projectSlug);

    let files: string[];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
    } catch {
      continue;
    }

    for (const file of files) {
      const sessionUuid = file.replace(/\.jsonl$/, '');
      const transcriptPath = join(dir, file);

      const observation = probeTranscript(transcriptPath, sessionUuid, options.probe);
      if (!observation) {
        skipped.push({ sessionUuid, reason: 'empty' });
        continue;
      }
      observedCount++;

      if (observation.sidechainOnly) {
        // A subagent's own transcript. Its parent session is the unit of work
        // anyone would recognise on a board; adopting both would double-count.
        skipped.push({ sessionUuid, reason: 'sidechain' });
        continue;
      }

      if (excluded.has(sessionUuid) || observation.looksDevPilotOwned) {
        skipped.push({ sessionUuid, reason: 'devpilot-owned' });
        continue;
      }

      if (!observation.cwd) {
        skipped.push({ sessionUuid, reason: 'unreadable' });
        continue;
      }

      const identity = resolveRepo(observation.cwd);
      if (!identity) {
        unmappedProjectCount++;
        skipped.push({ sessionUuid, reason: 'no-repo' });
        continue;
      }

      // Inventory counts EVERY session with a repo, including ones that will be
      // skipped for adoption below. That is the point of discovery: "you have
      // seven sessions in openconjecture/devpilot" is exactly the fact that
      // makes routing it worth doing.
      const live = isLive(observation, projectSlug, liveWithinMs, nowMs, existsImpl);
      const entry = inventory.get(identity.repo) ?? {
        repo: identity.repo,
        owner: identity.owner,
        host: identity.host,
        projectCount: 0,
        sessionCount: 0,
        liveSessionCount: 0,
        lastActivityAt: null,
        cwds: new Set<string>(),
      };
      entry.cwds.add(observation.cwd);
      entry.sessionCount++;
      if (live) entry.liveSessionCount++;
      if (!entry.lastActivityAt || observation.lastActivityAt > entry.lastActivityAt) {
        entry.lastActivityAt = observation.lastActivityAt;
      }
      inventory.set(identity.repo, entry);

      if (!options.allRepos && !routed.has(identity.repo.toLowerCase())) {
        skipped.push({
          sessionUuid,
          reason: 'not-routed',
          repo: identity.repo,
          owner: identity.owner,
        });
        continue;
      }

      if (!live && nowMs - observation.lastActivityMs > sinceMs) {
        skipped.push({ sessionUuid, reason: 'too-old', repo: identity.repo, owner: identity.owner });
        continue;
      }

      const startedAt = observation.startedAt ?? observation.lastActivityAt;
      const touchedPaths = includePaths
        ? resolveTouchedPaths(observation.cwd, ADOPTION_LIMITS.MAX_TOUCHED_PATHS)
        : [];

      const adoptionKey = adoptionKeyFor(options.machineName, sessionUuid);
      transcriptPaths.set(adoptionKey, { transcriptPath, sessionUuid });

      candidates.push({
        adoptionKey,
        agent: 'claude-code',
        title: heuristicTitle(observation),
        repo: identity.repo,
        // Live branch beats the transcript's, which records session start.
        branch: resolveBranch(observation.cwd) ?? observation.gitBranch ?? undefined,
        startedAt: new Date(startedAt).toISOString(),
        lastActivityAt: observation.lastActivityAt,
        messageCount: observation.messageCount,
        live,
        ...(touchedPaths.length > 0 ? { touchedPaths } : {}),
        ...(observation.webUrl ? { webUrl: observation.webUrl } : {}),
      });
    }
  }

  const discovered: DiscoveredRepo[] = [...inventory.values()]
    .map(({ cwds, ...repo }) => ({ ...repo, projectCount: cwds.size }))
    .sort((a, b) => b.sessionCount - a.sessionCount || a.repo.localeCompare(b.repo));

  // Newest first: the sessions a person is most likely to recognise are the
  // ones they were just working in.
  candidates.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));

  return {
    candidates,
    discovered,
    unmappedProjectCount,
    skipped,
    projectDirCount,
    observedCount,
    transcriptPaths,
  };
}

/** `{ owner → [repo, …] }`, for the preview's "3 not routed (arthaus, …)" line. */
export function groupByOwner(repos: DiscoveredRepo[]): Map<string, DiscoveredRepo[]> {
  const groups = new Map<string, DiscoveredRepo[]>();
  for (const repo of repos) {
    const list = groups.get(repo.owner) ?? [];
    list.push(repo);
    groups.set(repo.owner, list);
  }
  return groups;
}

/** Distinct owners behind a set of skips, for naming what is being withheld. */
export function withheldOwners(skipped: SkippedSession[]): string[] {
  const owners = new Set<string>();
  for (const skip of skipped) {
    if (skip.reason === 'not-routed' && skip.owner) owners.add(skip.owner);
  }
  return [...owners].sort();
}
