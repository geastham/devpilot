import { execFile } from 'child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'fs';
import { dirname, isAbsolute, join, resolve } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * The code graph indexer, as a thing DevPilot may find on a machine.
 *
 * The index is built by `codegraph` (github.com/colbymchenry/codegraph, MIT),
 * which this CLI does not bundle and never installs: its platform package is
 * about 295 MB, and whether to put it on a machine is the owner's decision.
 * Everything here therefore starts from "is it there?", and every caller has a
 * path for "no" that is exactly what happened before the graph existed.
 *
 * READING the index is not done here — that is `@devpilot.sh/core/code-graph`,
 * which opens the SQLite file directly. This module is the part that needs the
 * binary: building and refreshing an index, and the MCP server entry an agent
 * is given.
 *
 * Every invocation DevPilot makes sets `DO_NOT_TRACK=1`. The tool collects
 * anonymous usage statistics by default; what a person answered when they
 * installed it for themselves is theirs, but DevPilot running it on their
 * behalf — inside a task they did not watch — is not a use they were asked
 * about, so it does not contribute.
 */

/** The version this integration was verified against. Printed in the install hint. */
export const INDEXER_VERSION = '1.6.1';
export const INDEXER_PACKAGE = '@colbymchenry/codegraph';
export const GRAPH_DIR = '.codegraph';

/** Environment for every run of the indexer DevPilot starts. */
export function indexerEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...base,
    DO_NOT_TRACK: '1',
    CODEGRAPH_TELEMETRY: '0',
    // The MCP server otherwise checks GitHub for a newer release once a day.
    CODEGRAPH_NO_UPDATE_CHECK: '1',
  };
}

export interface Indexer {
  /** Absolute path, or a bare name resolved through PATH. */
  bin: string;
  version: string | null;
}

/**
 * Find the indexer: `DEVPILOT_CODEGRAPH_BIN` if set, else `codegraph` on PATH.
 * Returns null when it is not installed or does not answer `--version` — which
 * is the ordinary case, not an error.
 */
export async function findIndexer(env: NodeJS.ProcessEnv = process.env): Promise<Indexer | null> {
  const bin = env.DEVPILOT_CODEGRAPH_BIN?.trim() || 'codegraph';
  try {
    const { stdout } = await execFileAsync(bin, ['--version'], { env: indexerEnv(env), timeout: 10_000 });
    const version = stdout.trim().match(/\d+\.\d+\.\d+\S*/)?.[0] ?? null;
    return { bin, version };
  } catch {
    return null;
  }
}

export function installHint(): string {
  return `npm install -g ${INDEXER_PACKAGE}@${INDEXER_VERSION}`;
}

export function hasIndex(dir: string): boolean {
  return existsSync(join(dir, GRAPH_DIR, 'codegraph.db'));
}

/** Build the index for a directory from scratch. Slow on a large repository; never called inside a task. */
export async function buildIndex(indexer: Indexer, dir: string): Promise<void> {
  await execFileAsync(indexer.bin, ['init', '--yes', dir], {
    cwd: dir,
    env: indexerEnv(),
    timeout: 30 * 60_000,
    maxBuffer: 32 * 1024 * 1024,
  });
}

/** Bring an existing index up to date with the files on disk. */
export async function syncIndex(indexer: Indexer, dir: string, timeoutMs = 120_000): Promise<void> {
  await execFileAsync(indexer.bin, ['sync', dir], {
    cwd: dir,
    env: indexerEnv(),
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
  });
}

/**
 * Give a new working tree the main checkout's index.
 *
 * The index is per directory, so a fresh `git worktree` has none. Indexing a
 * whole repository inside a task's time budget is not acceptable; copying the
 * main checkout's index in and syncing the difference is — measured on this
 * repository (400 files, 24 MB index): 0.4 s.
 *
 * Only the database is copied. The directory also holds a daemon's pid file,
 * its socket and a lock, which belong to the process serving the main
 * checkout and would be wrong in any other tree.
 */
export function seedIndex(fromDir: string, toDir: string): boolean {
  const source = join(fromDir, GRAPH_DIR);
  if (!existsSync(join(source, 'codegraph.db'))) return false;

  const target = join(toDir, GRAPH_DIR);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  for (const name of ['codegraph.db', '.gitignore']) {
    if (existsSync(join(source, name))) cpSync(join(source, name), join(target, name));
  }
  return true;
}

/**
 * Keep the index out of every commit made in this repository.
 *
 * REQUIRED, not tidy. The tool writes `.codegraph/.gitignore` containing `*`
 * and `!.gitignore` — it ignores its contents and un-ignores itself. The
 * session runner ends each task with `git add -A`, which would therefore
 * commit `.codegraph/.gitignore` into every task branch and, through the merge,
 * into the run branch. `info/exclude` is the repository's own untracked ignore
 * list and is shared by all of its worktrees, so one line there covers them
 * all without touching a tracked file.
 */
export async function excludeIndexFromGit(repoDir: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--git-path', 'info/exclude'], { cwd: repoDir });
    const raw = stdout.trim();
    if (!raw) return false;
    const path = isAbsolute(raw) ? raw : resolve(repoDir, raw);
    const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
    if (current.split('\n').some((line) => line.trim() === `${GRAPH_DIR}/` || line.trim() === GRAPH_DIR)) return true;
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${current.endsWith('\n') || current === '' ? '' : '\n'}${GRAPH_DIR}/\n`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Stop the background daemon the indexer leaves behind.
 *
 * `codegraph serve --mcp` with its file watcher starts a daemon that OUTLIVES
 * the MCP process: after the agent exits it is still running, holding the
 * index open, with its pid in `.codegraph/daemon.pid`. Verified by hand — and
 * with a worktree per task it would mean one orphan per task, each watching a
 * directory that is about to be deleted.
 *
 * So the runner stops it when the agent is done. The pid comes from the tool's
 * own file, and is only signalled if that process is in fact the indexer: a
 * pid file can outlive its process, and the number can be reused by something
 * else entirely. SIGTERM is enough — the daemon and its watchdog both exit and
 * remove their pid files.
 */
export async function stopIndexDaemon(dir: string): Promise<boolean> {
  try {
    const raw = readFileSync(join(dir, GRAPH_DIR, 'daemon.pid'), 'utf8');
    const pid = Number((JSON.parse(raw) as { pid?: unknown }).pid);
    if (!Number.isInteger(pid) || pid <= 1) return false;

    const { stdout } = await execFileAsync('ps', ['-o', 'command=', '-p', String(pid)]);
    if (!/codegraph/i.test(stdout)) return false;

    process.kill(pid, 'SIGTERM');
    return true;
  } catch {
    // No pid file (no daemon was started), or it has already gone.
    return false;
  }
}

/** The MCP server entry an agent is given: one server, one tool. */
export function mcpServerFor(indexer: Indexer, dir: string): {
  command: string;
  args: string[];
  env: Record<string, string>;
} {
  return {
    command: indexer.bin,
    // The watcher stays on: the index must follow the agent's own edits, or
    // it would describe the tree as it was when the task began.
    args: ['serve', '--mcp', '--path', dir],
    env: { DO_NOT_TRACK: '1', CODEGRAPH_TELEMETRY: '0', CODEGRAPH_NO_UPDATE_CHECK: '1' },
  };
}
