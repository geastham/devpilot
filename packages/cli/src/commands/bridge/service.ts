import { spawn, spawnSync } from 'node:child_process';
import {
  accessSync,
  appendFileSync,
  closeSync,
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, isAbsolute, join } from 'node:path';
import {
  DEFAULT_BRIDGE_URL,
  bridgeCredentialsPath,
  clearBridgeCredentials,
  loadBridgeCredentials,
  resolveBridgeCredentials,
  saveBridgeCredentials,
} from '@devpilot.sh/bridge-client';

/**
 * The bridge as something that keeps running: a background process, and a
 * login service.
 *
 * `devpilot bridge connect` is a foreground process. Close the terminal, or
 * restart the machine, and the cockpit stops hearing about this machine's
 * sessions — with nothing on the machine to say so. "Install it once and it
 * keeps monitoring" was only true for someone who never closed a window.
 *
 * Two ways to keep it running live here, and they are deliberately exclusive:
 *
 *   - `start` / `stop`: a detached child of this CLI. It survives the terminal;
 *     it does not survive a restart.
 *   - `install` / `uninstall`: a launchd LaunchAgent (macOS) or a systemd user
 *     unit (Linux). The system starts it at login and restarts it if it exits.
 *
 * Exclusive because two bridges on one machine both report every session, and
 * the cockpit then shows each one twice. Each side refuses while the other is
 * in place and names the command to run instead.
 *
 * Both run exactly `devpilot bridge connect <args>` — the same code a person
 * runs in the foreground, with nothing reimplemented — and both write to one
 * log, so `status` and `logs` do not need to know which is in use.
 *
 * THE TOKEN IS NEVER IN ARGV, A PLIST, A UNIT FILE, OR THE STATE FILE. A
 * command line is readable by every process on the machine (`ps`), a plist by
 * anything that can read the home directory, and both end up in bug reports.
 * `connect` already reads the pair saved in `~/.devpilot/bridge.json`
 * (owner-only), so a token handed to `start` or `install` is saved there
 * first and the child is started without it.
 *
 * SHAPE. Everything that touches the system — spawning, signalling, `ps`,
 * `launchctl`, `systemctl` — goes through `BridgeSystem`, and every function
 * returns what happened rather than printing it. That is what lets the tests
 * run the real start/stop path against a stub child, and the install path
 * without a launchd to install into. The commander actions that print are in
 * `background.ts`, `install.ts` and `status.ts`.
 */

export const LAUNCHD_LABEL = 'sh.devpilot.bridge';
export const SYSTEMD_UNIT = 'devpilot-bridge.service';

/** Moves `state.json`, `service.json` and `bridge.log`; tests and sandboxes set it. */
export const STATE_DIR_ENV = 'DEVPILOT_BRIDGE_STATE_DIR';

/** What `connect` prints once the hosted side has accepted this machine. */
const REGISTERED_MARK = '✓ Registered';

/** Past this, the log is moved aside to `bridge.log.1` (one generation kept). */
export const LOG_CAP_BYTES = 5 * 1024 * 1024;

// ─────────────────────────────────────────────────────────────────────────────
// Paths
// ─────────────────────────────────────────────────────────────────────────────

export interface BridgePaths {
  home: string;
  /** `~/.devpilot/bridge`, or `$DEVPILOT_BRIDGE_STATE_DIR`. */
  stateDir: string;
  /** The background process `start` recorded. */
  statePath: string;
  /** What the login service was installed with. The plist or unit is the truth; this is for `status`. */
  serviceRecordPath: string;
  logPath: string;
  plistPath: string;
  unitPath: string;
  /** `~/.devpilot/bridge.json` — the only file here that holds the token. */
  credentialsPath: string;
}

export function bridgePaths(home: string = homedir(), env: NodeJS.ProcessEnv = process.env): BridgePaths {
  const stateDir = env[STATE_DIR_ENV]?.trim() || join(home, '.devpilot', 'bridge');
  // systemd reads user units from $XDG_CONFIG_HOME when it is set; a unit
  // written to ~/.config on such a machine would simply not be found.
  const configHome = env.XDG_CONFIG_HOME?.trim() || join(home, '.config');
  return {
    home,
    stateDir,
    statePath: join(stateDir, 'state.json'),
    serviceRecordPath: join(stateDir, 'service.json'),
    logPath: join(stateDir, 'bridge.log'),
    plistPath: join(home, 'Library', 'LaunchAgents', `${LAUNCHD_LABEL}.plist`),
    unitPath: join(configHome, 'systemd', 'user', SYSTEMD_UNIT),
    credentialsPath: bridgeCredentialsPath(home),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The system, behind an interface
// ─────────────────────────────────────────────────────────────────────────────

export interface RunResult {
  /** Exit status, or null when the tool could not be run at all. */
  status: number | null;
  stdout: string;
  stderr: string;
}

export interface BridgeSystem {
  platform: NodeJS.Platform;
  uid: number;
  /** Start a process that outlives this one, with its output appended to a file. Null when it could not be started. */
  spawnDetached(
    command: string,
    args: string[],
    options: { logPath: string; env: NodeJS.ProcessEnv; cwd: string },
  ): number | null;
  isAlive(pid: number): boolean;
  /** The process's full command line, or null when there is no such process or it cannot be read. */
  commandLine(pid: number): string | null;
  /** When the process started, as an ISO timestamp, or null. */
  startTime(pid: number): string | null;
  kill(pid: number, signal: 'SIGTERM' | 'SIGKILL'): boolean;
  /** Pids of this user's processes that are running `devpilot bridge connect`. Empty when that cannot be listed. */
  bridgeProcesses(): number[];
  /** Run `launchctl` / `systemctl`. Never throws. */
  run(command: string, args: string[]): RunResult;
}

export function realSystem(): BridgeSystem {
  const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
  return {
    platform: process.platform,
    uid,

    spawnDetached(command, args, options) {
      mkdirSync(dirname(options.logPath), { recursive: true, mode: 0o700 });
      // Appended, never truncated: the lines from the run before are usually
      // the ones that say why this one is being started.
      const fd = openSync(options.logPath, 'a');
      try {
        const child = spawn(command, args, {
          // Its own session, so closing the terminal (SIGHUP to the
          // foreground process group) does not take it down with it.
          detached: true,
          stdio: ['ignore', fd, fd],
          env: options.env,
          cwd: options.cwd,
          windowsHide: true,
        });
        // A command that does not exist is reported as an 'error' event, and
        // an unhandled one would throw out of the event loop.
        child.on('error', () => undefined);
        child.unref();
        return child.pid ?? null;
      } finally {
        closeSync(fd);
      }
    },

    isAlive(pid) {
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        // EPERM: it exists and belongs to someone else. Still a live pid —
        // the command-line check is what decides whether it is ours.
        return (error as NodeJS.ErrnoException).code === 'EPERM';
      }
    },

    commandLine(pid) {
      const result =
        process.platform === 'win32'
          ? spawnSync(
              'powershell.exe',
              ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`],
              { encoding: 'utf8', timeout: 10_000 },
            )
          : // `-ww`: without it `ps` may cut the line at the terminal's width,
            // and the part cut off is the part being looked for.
            spawnSync('ps', ['-ww', '-o', 'command=', '-p', String(pid)], { encoding: 'utf8', timeout: 10_000 });
      if (result.error || result.status !== 0) return null;
      return result.stdout.trim() || null;
    },

    startTime(pid) {
      if (process.platform === 'win32') return null;
      const result = spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
        encoding: 'utf8',
        timeout: 10_000,
        // `lstart` is formatted in the user's locale; pin it so Date can read it.
        env: { ...process.env, LC_ALL: 'C' },
      });
      if (result.error || result.status !== 0) return null;
      const at = new Date(result.stdout.trim());
      return Number.isNaN(at.getTime()) ? null : at.toISOString();
    },

    kill(pid, signal) {
      try {
        process.kill(pid, signal);
        return true;
      } catch {
        return false;
      }
    },

    bridgeProcesses() {
      if (process.platform === 'win32') return [];
      // `-U`, not `-a`: another user's bridge is another user's business, and
      // selecting by user also lists processes with no terminal — which is
      // what a detached bridge is.
      const result = spawnSync('ps', ['-ww', '-U', String(uid), '-o', 'pid=,command='], {
        encoding: 'utf8',
        timeout: 10_000,
        maxBuffer: 16 * 1024 * 1024,
      });
      if (result.error || result.status !== 0) return [];
      return result.stdout.split('\n').flatMap((line) => {
        const match = /^\s*(\d+)\s+(.*)$/.exec(line);
        return match && /devpilot\S*\s+bridge\s+connect\b/.test(match[2]) ? [Number(match[1])] : [];
      });
    },

    run(command, args) {
      const result = spawnSync(command, args, { encoding: 'utf8', timeout: 30_000 });
      if (result.error) return { status: null, stdout: '', stderr: result.error.message };
      return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
    },
  };
}

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

// ─────────────────────────────────────────────────────────────────────────────
// Arguments: what may be forwarded, and what may not
// ─────────────────────────────────────────────────────────────────────────────

export interface SplitArgs {
  url?: string;
  token?: string;
  /** `--session-api-key`: the session runner's bearer token. A secret too. */
  sessionApiKey?: string;
  noSave: boolean;
  /** Everything else, in the order given. Safe in argv and on disk. */
  forwarded: string[];
  /** Set when a flag that needs a value was given none. */
  invalid?: string;
}

/**
 * Take `--url`, `--token` and `--session-api-key` out of a `connect` argument
 * list, in every form commander accepts (`--token x`, `--token=x`, `-t x`,
 * `-tx`), and pass the rest through untouched.
 *
 * Done by hand rather than by declaring the options on `start`: commander
 * would then own the parsing of a list it only half understands, and the one
 * property that has to hold — no token in what is forwarded — would depend on
 * how it treats an unknown flag sitting next to a known one.
 */
export function splitConnectArgs(args: string[]): SplitArgs {
  const out: SplitArgs = { noSave: false, forwarded: [] };
  const taken: Array<{ key: 'url' | 'token' | 'sessionApiKey'; long: string; short?: string }> = [
    { key: 'url', long: '--url', short: '-u' },
    { key: 'token', long: '--token', short: '-t' },
    { key: 'sessionApiKey', long: '--session-api-key' },
  ];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--no-save') {
      out.noSave = true;
      continue;
    }

    const flag = taken.find(
      (t) =>
        arg === t.long ||
        arg.startsWith(`${t.long}=`) ||
        (t.short !== undefined && arg.startsWith(t.short) && !arg.startsWith('--')),
    );
    if (!flag) {
      out.forwarded.push(arg);
      continue;
    }

    let value: string | undefined;
    if (arg === flag.long || arg === flag.short) {
      value = args[i + 1];
      i += 1;
    } else if (arg.startsWith(`${flag.long}=`)) {
      value = arg.slice(flag.long.length + 1);
    } else {
      value = arg.slice(flag.short!.length);
    }
    if (!value || value.startsWith('-')) {
      out.invalid = `${flag.long} needs a value.`;
      return out;
    }
    out[flag.key] = value;
  }

  // Whatever the flag was called, nothing token-shaped is forwarded. A typo
  // like `--tokn dp_orch_…` would otherwise put the token in the child's
  // argv for as long as it took `connect` to reject the flag.
  if (out.forwarded.some((arg) => /dp_orch_/.test(arg))) {
    out.invalid = 'A token was given to an option other than --token. Nothing was started.';
    out.forwarded = [];
  }
  return out;
}

/** A token-shaped string, anywhere in text that is about to be shown. */
export function redact(text: string): string {
  return text.replace(/dp_orch_[A-Za-z0-9_-]+/g, 'dp_orch_…');
}

// ─────────────────────────────────────────────────────────────────────────────
// State on disk
// ─────────────────────────────────────────────────────────────────────────────

/** The background bridge `start` launched. Holds no secret. */
export interface BridgeState {
  pid: number;
  startedAt: string;
  url: string;
  /** The `connect` arguments it was started with, token removed. */
  args: string[];
  node: string;
  script: string;
  logPath: string;
  cliVersion: string;
}

export type ServiceKind = 'launchd' | 'systemd';

export interface ServiceRecord {
  kind: ServiceKind;
  path: string;
  installedAt: string;
  url: string;
  args: string[];
  node: string;
  script: string;
  cliVersion: string;
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  // Written whole or not at all: `status` reads this while `start` writes it.
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  renameSync(tmp, path);
}

export function readState(paths: BridgePaths): BridgeState | null {
  const state = readJson<BridgeState>(paths.statePath);
  return state && typeof state.pid === 'number' && state.pid > 0 ? state : null;
}

/**
 * Is this pid still the bridge that was started?
 *
 * A state file outlives its process — a crash, a restart, a `kill` — and the
 * kernel hands the number out again. Asking only "is pid N alive?" would then
 * report some unrelated process as the bridge, and `stop` would signal it. So
 * the process's command line has to say `bridge connect` as well.
 */
export function isBridgeProcess(pid: number, sys: BridgeSystem): boolean {
  if (!sys.isAlive(pid)) return false;
  const command = sys.commandLine(pid);
  return command !== null && /\bbridge\s+connect\b/.test(command);
}

/**
 * Bridges running on this machine that neither `start` nor the login service
 * accounts for: a `connect` left running in a terminal, or one that something
 * else detached.
 *
 * `start` and `install` refuse each other, but neither can refuse on these —
 * a bridge run under another HOME for a test is also a `bridge connect`, and
 * is no reason to block the real one. So they are reported, by pid only, and
 * the person decides. Without this the first `devpilot bridge start` on a
 * machine that already has a bridge in a terminal quietly makes two, and
 * `status` says "not running" about a machine that is being watched.
 *
 * Only pids leave this function. The command lines are not kept: a bridge
 * started with `--token` on its command line has its token there.
 */
export function unmanagedBridges(sys: BridgeSystem, managed: Array<number | null>): number[] {
  return sys.bridgeProcesses().filter((pid) => pid !== process.pid && !managed.includes(pid));
}

/** The recorded background bridge, only if it is still running and still ours. */
function liveState(paths: BridgePaths, sys: BridgeSystem): BridgeState | null {
  const state = readState(paths);
  return state && isBridgeProcess(state.pid, sys) ? state : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// The log
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Keep the log from growing without bound: past the cap, the current file
 * becomes `bridge.log.1` and a new one starts.
 *
 * Copied and truncated, not renamed. Under the login service the file is held
 * open by a process that is still writing; after a rename it would go on
 * writing to `bridge.log.1` and `bridge.log` would stay empty. Truncating
 * under a writer is safe when the writer appends: `start` opens the file with
 * `a`, and the systemd unit says `append:`. How launchd opens StandardOutPath
 * is launchd's business and was not tested here.
 */
export function rotateLog(logPath: string, capBytes: number = LOG_CAP_BYTES): boolean {
  try {
    if (statSync(logPath).size <= capBytes) return false;
    copyFileSync(logPath, `${logPath}.1`);
    truncateSync(logPath, 0);
    return true;
  } catch {
    // No log yet, or not ours to move. Neither is a reason to stop.
    return false;
  }
}

/**
 * Get the log ready for a new run, and return where that run's output begins.
 *
 * Only what the new run writes counts as evidence it registered — the log
 * still holds `✓ Registered` from every run before it — so the caller reads
 * from the returned offset. The line written here is what separates the runs
 * for a person reading the file.
 */
function openLog(logPath: string, heading: string): number {
  rotateLog(logPath);
  // Owner-only when this creates it: the log names repos and sessions.
  appendFileSync(logPath, `[${new Date().toISOString()}] ${heading}\n`, { mode: 0o600 });
  return logSize(logPath);
}

function logSize(logPath: string): number {
  try {
    return statSync(logPath).size;
  } catch {
    return 0;
  }
}

const stripAnsi = (text: string) => text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');

/** The log from a byte offset on. A file shorter than the offset was rotated: read all of it. */
export function readLogFrom(logPath: string, offset: number): { text: string; offset: number } {
  let fd: number | undefined;
  try {
    const size = statSync(logPath).size;
    const from = size < offset ? 0 : offset;
    if (size === from) return { text: '', offset: size };
    fd = openSync(logPath, 'r');
    const buffer = Buffer.alloc(size - from);
    const read = readSync(fd, buffer, 0, buffer.length, from);
    return { text: stripAnsi(buffer.subarray(0, read).toString('utf8')), offset: from + read };
  } catch {
    return { text: '', offset };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/**
 * The last `count` lines of the log, without reading a large file whole.
 *
 * `skipBlank` is for `status`, which shows five lines: `connect` spaces its
 * output with empty ones, and two of five being empty tells nobody anything.
 */
export function tailLog(logPath: string, count: number, options: { skipBlank?: boolean } = {}): string[] {
  if (count <= 0) return [];
  const size = logSize(logPath);
  const window = 256 * 1024;
  const { text } = readLogFrom(logPath, Math.max(0, size - window));
  let lines = text.split('\n');
  // Starting mid-file, the first line is the tail end of one.
  if (size > window) lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  if (options.skipBlank) lines = lines.filter((line) => line.trim() !== '');
  return lines.slice(-count).map(redact);
}

/**
 * The lines worth showing when a bridge did not come up: from the first error
 * `connect` printed, or, when it died without one (a crash, a bad flag
 * rejected by commander's parser), whatever it said last.
 */
export function failureLines(text: string, max: number = 8): string[] {
  const lines = text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '');
  const first = lines.findIndex((line) => /^\s*(✗|error:)/.test(line));
  return (first === -1 ? lines.slice(-max) : lines.slice(first, first + max)).map(redact);
}

export interface WaitOptions {
  /** How long to wait for `✓ Registered`. */
  waitMs: number;
  pollMs: number;
  /** How long it must stay up after registering before it is called started. */
  settleMs: number;
}

const DEFAULT_WAIT: WaitOptions = { waitMs: 30_000, pollMs: 250, settleMs: 1_500 };

type Registration = { ok: true } | { ok: false; reason: 'exited' | 'timeout'; lines: string[] };

/**
 * Wait until the bridge has registered — and is still there a moment later.
 *
 * Spawning succeeds for almost anything: a revoked token, an unknown flag, a
 * mode that needs a URL it was not given. Each of those ends the process
 * within a second. Reporting "started" on the strength of a pid would be
 * reporting the one thing that did not happen, to someone who then closes
 * the terminal believing their sessions are being watched.
 *
 * `alive` is asked with the log so far, because the two callers know about
 * liveness differently: `start` owns a pid; `install` has only the log, the
 * process being launchd's.
 */
async function awaitRegistered(
  logPath: string,
  offset: number,
  alive: (logSoFar: string) => boolean,
  wait: WaitOptions,
): Promise<Registration> {
  const deadline = Date.now() + wait.waitMs;
  for (;;) {
    const { text } = readLogFrom(logPath, offset);
    if (text.includes(REGISTERED_MARK)) {
      await sleep(wait.settleMs);
      const after = readLogFrom(logPath, offset).text;
      return alive(after) ? { ok: true } : { ok: false, reason: 'exited', lines: failureLines(after) };
    }
    if (!alive(text)) {
      // Read again: its last lines can land after the exit is noticed.
      return { ok: false, reason: 'exited', lines: failureLines(readLogFrom(logPath, offset).text) };
    }
    if (Date.now() >= deadline) return { ok: false, reason: 'timeout', lines: failureLines(text) };
    await sleep(wait.pollMs);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Credentials
// ─────────────────────────────────────────────────────────────────────────────

type CredentialStep =
  | { ok: true; url: string; saved: boolean; rollback: () => void }
  | { ok: false; outcome: { status: 'no-credentials'; url?: string } | { status: 'credentials-unwritable'; path: string } };

/**
 * Make sure the saved file holds what the bridge should connect with.
 *
 * Flag, then environment, then the file — the same order `connect` uses. A
 * pair that came from a flag or the environment is written to the file now,
 * because the file is the only place a detached child (and, after a restart,
 * a login service with no shell environment at all) can read it from.
 *
 * `connect` saves a token only after the bridge has accepted it, so that a
 * mistyped one is never what is remembered. Saving first would break that —
 * so the caller gets `rollback`, and uses it when the child fails to
 * register: the file goes back to exactly what it held before.
 */
function prepareCredentials(split: SplitArgs, env: NodeJS.ProcessEnv, credentialsPath: string): CredentialStep {
  const resolved = resolveBridgeCredentials({ url: split.url, token: split.token }, env, credentialsPath);
  if (!resolved.token) return { ok: false, outcome: { status: 'no-credentials', url: resolved.url } };

  const url = resolved.url ?? DEFAULT_BRIDGE_URL;
  if (resolved.source === 'saved') return { ok: true, url, saved: false, rollback: () => undefined };

  const previous = loadBridgeCredentials(credentialsPath);
  if (!saveBridgeCredentials({ url, token: resolved.token }, credentialsPath)) {
    return { ok: false, outcome: { status: 'credentials-unwritable', path: credentialsPath } };
  }
  return {
    ok: true,
    url,
    saved: true,
    rollback: () => {
      if (previous) saveBridgeCredentials(previous, credentialsPath);
      else clearBridgeCredentials(credentialsPath);
    },
  };
}

/**
 * The environment the background bridge runs in.
 *
 * `DEVPILOT_BRIDGE_URL` and `DEVPILOT_BRIDGE_TOKEN` are removed on purpose.
 * `connect` prefers the environment to the saved file, so a shell that still
 * exports last month's token would have the child connect with that one, not
 * the one just given to `start` and saved. With them gone the child reads the
 * file — which is also exactly what it will read after a restart.
 */
export function childEnv(env: NodeJS.ProcessEnv, sessionApiKey?: string): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...env };
  delete out.DEVPILOT_BRIDGE_URL;
  delete out.DEVPILOT_BRIDGE_TOKEN;
  // Its output goes to a file. Colour codes there are noise in every later read.
  out.FORCE_COLOR = '0';
  if (sessionApiKey) out.DEVPILOT_SESSION_API_KEY = sessionApiKey;
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// The login service: text and paths, as pure functions
// ─────────────────────────────────────────────────────────────────────────────

export function serviceKind(platform: NodeJS.Platform): ServiceKind | null {
  if (platform === 'darwin') return 'launchd';
  if (platform === 'linux') return 'systemd';
  return null;
}

export interface ServiceSpec {
  home: string;
  /** Absolute path to node. */
  node: string;
  /** Absolute path to this CLI's bin script. */
  script: string;
  /** `connect` arguments, token removed. */
  args: string[];
  logPath: string;
  /** The PATH the service runs with — see `servicePathEnv`. */
  path: string;
}

/** First executable called `name` on a PATH, or null. */
export function findOnPath(name: string, envPath: string | undefined): string | null {
  for (const dir of (envPath ?? '').split(delimiter)) {
    if (!dir || !isAbsolute(dir)) continue;
    const candidate = join(dir, name);
    try {
      accessSync(candidate, constants.X_OK);
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Not here.
    }
  }
  return null;
}

/**
 * The PATH a login service is given.
 *
 * A service is not started from a shell, so it gets the system's default
 * PATH, not the one a terminal has. The bridge shells out to `git` and
 * `claude`, and node itself is usually wherever a version manager put it —
 * none of which the default covers. A service that works when started from a
 * terminal and finds nothing at login is the usual way these fail, so: node's
 * directory first, then `claude`'s, then the PATH `install` was run with, then
 * the standard locations.
 */
export function servicePathEnv(input: { node: string; claude?: string | null; envPath?: string }): string {
  const entries = [
    dirname(input.node),
    input.claude ? dirname(input.claude) : '',
    ...(input.envPath ?? '').split(':'),
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ];
  const seen = new Set<string>();
  return entries
    .filter((entry) => entry.startsWith('/') && !seen.has(entry) && Boolean(seen.add(entry)))
    .join(':');
}

const xml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/**
 * The LaunchAgent.
 *
 * `KeepAlive` restarts the bridge whenever it exits, for any reason —
 * including a token that has since been revoked, which exits at once.
 * `ThrottleInterval` keeps that from becoming a registration attempt every
 * ten seconds (launchd's default, per launchd.plist(5)) for as long as the
 * machine is on.
 */
export function launchdPlist(spec: ServiceSpec): string {
  const programArguments = [spec.node, spec.script, 'bridge', 'connect', ...spec.args]
    .map((arg) => `    <string>${xml(arg)}</string>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${programArguments}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>30</integer>
  <key>WorkingDirectory</key>
  <string>${xml(spec.home)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${xml(spec.path)}</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${xml(spec.logPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(spec.logPath)}</string>
</dict>
</plist>
`;
}

/**
 * One word of a systemd command line. `%` is a specifier and `$` a variable
 * to systemd, so both are doubled; anything that is not a plain word is
 * double-quoted with C-style escapes.
 */
function systemdWord(value: string, options: { dollars: boolean } = { dollars: true }): string {
  let escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%');
  if (options.dollars) escaped = escaped.replace(/\$/g, '$$$$');
  return /^[\w@%+=:,./-]+$/.test(escaped) ? escaped : `"${escaped}"`;
}

/** The systemd user unit. `Restart=always` with `RestartSec` for the reason given on the plist. */
export function systemdUnit(spec: ServiceSpec): string {
  const exec = [spec.node, spec.script, 'bridge', 'connect', ...spec.args].map((arg) => systemdWord(arg)).join(' ');
  const literal = (value: string) => value.replace(/%/g, '%%');
  return `[Unit]
Description=DevPilot bridge (devpilot bridge connect)

[Service]
ExecStart=${exec}
WorkingDirectory=${literal(spec.home)}
Environment=${systemdWord(`PATH=${spec.path}`, { dollars: false })}
Restart=always
RestartSec=30
StandardOutput=append:${literal(spec.logPath)}
StandardError=append:${literal(spec.logPath)}

[Install]
WantedBy=default.target
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// The login service: what is installed, and is it loaded
// ─────────────────────────────────────────────────────────────────────────────

export interface ServiceInfo {
  /** False on a platform with no login service this CLI knows how to write. */
  supported: boolean;
  kind: ServiceKind | null;
  path: string | null;
  /** The plist or unit file exists. */
  installed: boolean;
  /** launchd or systemd has it loaded. */
  loaded: boolean;
  /** The process it is running, when it is running one. */
  pid: number | null;
  /** What it was installed with. */
  args: string[] | null;
  url: string | null;
}

/**
 * Ask whether the login service is installed and loaded.
 *
 * `launchctl` / `systemctl` are consulted only when the file is there. With no
 * file there is nothing of ours to be loaded, and every `status` and `start`
 * on a machine that never installed the service would otherwise pay for a
 * subprocess to be told so.
 */
export function inspectService(paths: BridgePaths, sys: BridgeSystem): ServiceInfo {
  const kind = serviceKind(sys.platform);
  if (!kind) {
    return { supported: false, kind: null, path: null, installed: false, loaded: false, pid: null, args: null, url: null };
  }
  const path = kind === 'launchd' ? paths.plistPath : paths.unitPath;
  if (!existsSync(path)) {
    return { supported: true, kind, path, installed: false, loaded: false, pid: null, args: null, url: null };
  }

  const record = readJson<ServiceRecord>(paths.serviceRecordPath);
  const info: ServiceInfo = {
    supported: true,
    kind,
    path,
    installed: true,
    loaded: false,
    pid: null,
    args: record?.args ?? null,
    url: record?.url ?? null,
  };

  if (kind === 'launchd') {
    // Whether it is loaded is the exit status, which is dependable. The pid is
    // read out of the text, and launchctl(1) says of that text that it "is NOT
    // API in any sense at all" and may change between releases. launchd offers
    // no other way to ask. So nothing that acts depends on it: `start` refuses
    // on the file, `uninstall` boots out by label. If the line ever changes
    // shape, the cost is `status` reporting a loaded service with no process.
    const result = sys.run('launchctl', ['print', `gui/${sys.uid}/${LAUNCHD_LABEL}`]);
    info.loaded = result.status === 0;
    const pid = /^\s*pid = (\d+)/m.exec(result.stdout);
    if (info.loaded && pid) info.pid = Number(pid[1]);
  } else {
    const result = sys.run('systemctl', ['--user', 'show', SYSTEMD_UNIT, '--property=ActiveState,MainPID,UnitFileState']);
    const field = (name: string) => new RegExp(`^${name}=(.*)$`, 'm').exec(result.stdout)?.[1]?.trim() ?? '';
    const active = field('ActiveState');
    info.loaded = result.status === 0 && (field('UnitFileState') === 'enabled' || active === 'active' || active === 'activating');
    const pid = Number(field('MainPID'));
    if (info.loaded && pid > 0) info.pid = pid;
  }
  return info;
}

// ─────────────────────────────────────────────────────────────────────────────
// start
// ─────────────────────────────────────────────────────────────────────────────

export interface LaunchInput {
  paths: BridgePaths;
  /** The arguments after `bridge start` / `bridge install`, as typed. */
  args: string[];
  /** `process.execPath`. */
  node: string;
  /** This CLI's bin script, absolute. */
  script: string;
  env: NodeJS.ProcessEnv;
  cliVersion: string;
  wait?: Partial<WaitOptions>;
}

export type StartOutcome =
  | {
      status: 'started';
      pid: number;
      url: string;
      args: string[];
      logPath: string;
      savedCredentials: boolean;
      /** Other bridges already running on this machine — see `unmanagedBridges`. */
      others: number[];
    }
  | { status: 'invalid-args'; message: string }
  | { status: 'already-running'; pid: number; startedAt: string }
  | { status: 'service-installed'; kind: ServiceKind; path: string; loaded: boolean }
  | { status: 'no-credentials'; url?: string }
  | { status: 'credentials-unwritable'; path: string }
  | { status: 'spawn-failed'; node: string }
  | { status: 'failed'; reason: 'exited' | 'timeout'; lines: string[]; logPath: string };

/** First line is the refusal; the rest is printed under it. */
const NO_SAVE_MESSAGE = [
  '--no-save cannot be used with a background bridge',
  'It reads its token from the saved file, so there is nowhere else to keep it.',
  '`devpilot bridge connect --no-save` runs one in the foreground without saving.',
].join('\n');

/** SIGTERM, wait, then SIGKILL. Returns whether it had to be forced. */
async function terminate(pid: number, sys: BridgeSystem, termWaitMs: number, pollMs: number): Promise<{ forced: boolean; gone: boolean }> {
  const goneWithin = async (ms: number) => {
    const deadline = Date.now() + ms;
    while (sys.isAlive(pid)) {
      if (Date.now() >= deadline) return false;
      await sleep(pollMs);
    }
    return true;
  };

  sys.kill(pid, 'SIGTERM');
  if (await goneWithin(termWaitMs)) return { forced: false, gone: true };
  // `connect` shuts down by stopping its dispatch loop, which waits on work
  // in flight. That is allowed its ten seconds and no longer.
  sys.kill(pid, 'SIGKILL');
  return { forced: true, gone: await goneWithin(2_000) };
}

/**
 * Start `devpilot bridge connect` detached from the terminal.
 *
 * Either a registered bridge is running when this returns `started`, or
 * nothing is: a child that exits, or does not register in time, is cleaned up
 * and its first error lines are returned instead.
 */
export async function startBridge(input: LaunchInput, sys: BridgeSystem): Promise<StartOutcome> {
  const { paths } = input;
  const wait = { ...DEFAULT_WAIT, ...input.wait };

  const split = splitConnectArgs(input.args);
  if (split.invalid) return { status: 'invalid-args', message: split.invalid };
  if (split.noSave) return { status: 'invalid-args', message: NO_SAVE_MESSAGE };

  const running = liveState(paths, sys);
  if (running) return { status: 'already-running', pid: running.pid, startedAt: running.startedAt };

  // Installed is enough to refuse, loaded or not: a service that is installed
  // but not loaded right now will be loaded at the next login, and that is
  // when the second bridge would appear.
  const service = inspectService(paths, sys);
  if (service.installed) {
    return { status: 'service-installed', kind: service.kind!, path: service.path!, loaded: service.loaded };
  }

  const credentials = prepareCredentials(split, input.env, paths.credentialsPath);
  if (!credentials.ok) return credentials.outcome;

  // Looked for before the child exists, so the child is not among them.
  const others = unmanagedBridges(sys, []);

  mkdirSync(paths.stateDir, { recursive: true, mode: 0o700 });
  rmSync(paths.statePath, { force: true });
  const offset = openLog(paths.logPath, `devpilot bridge start (cli ${input.cliVersion})`);

  const pid = sys.spawnDetached(input.node, [input.script, 'bridge', 'connect', ...split.forwarded], {
    logPath: paths.logPath,
    env: childEnv(input.env, split.sessionApiKey),
    // Not the directory `start` happened to be run in: that one can be
    // deleted under a process meant to run for weeks.
    cwd: paths.home,
  });
  if (pid === null) {
    credentials.rollback();
    return { status: 'spawn-failed', node: input.node };
  }

  const state: BridgeState = {
    pid,
    startedAt: new Date().toISOString(),
    url: credentials.url,
    args: split.forwarded,
    node: input.node,
    script: input.script,
    logPath: paths.logPath,
    cliVersion: input.cliVersion,
  };
  writeJson(paths.statePath, state);

  const registration = await awaitRegistered(paths.logPath, offset, () => sys.isAlive(pid), wait);
  if (!registration.ok) {
    // Still running but silent: a bridge that has not registered in this long
    // is not one to leave behind unannounced.
    if (sys.isAlive(pid)) await terminate(pid, sys, 5_000, wait.pollMs);
    rmSync(paths.statePath, { force: true });
    credentials.rollback();
    return { status: 'failed', reason: registration.reason, lines: registration.lines, logPath: paths.logPath };
  }

  return {
    status: 'started',
    pid,
    url: credentials.url,
    args: split.forwarded,
    logPath: paths.logPath,
    savedCredentials: credentials.saved,
    others,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// stop
// ─────────────────────────────────────────────────────────────────────────────

export type StopOutcome =
  | { status: 'stopped'; pid: number; forced: boolean }
  /** Nothing recorded, or what was recorded has already exited. */
  | { status: 'not-running'; stalePid?: number }
  /** The recorded pid is alive but is no longer a bridge. It was not signalled. */
  | { status: 'not-ours'; pid: number }
  /** The login service is running the bridge; `stop` does not manage it. */
  | { status: 'service-managed'; kind: ServiceKind }
  | { status: 'still-running'; pid: number };

export async function stopBridge(
  paths: BridgePaths,
  sys: BridgeSystem,
  options: { termWaitMs?: number; pollMs?: number } = {},
): Promise<StopOutcome> {
  const state = readState(paths);
  if (state && isBridgeProcess(state.pid, sys)) {
    const { forced, gone } = await terminate(state.pid, sys, options.termWaitMs ?? 10_000, options.pollMs ?? 100);
    if (!gone) return { status: 'still-running', pid: state.pid };
    rmSync(paths.statePath, { force: true });
    return { status: 'stopped', pid: state.pid, forced };
  }

  // Nothing of `start`'s is running. Whatever was recorded is wrong, and
  // would only get in the way of the next `start`.
  rmSync(paths.statePath, { force: true });

  // A pid that is alive and not a bridge is said first: it is the one case
  // where something was nearly signalled that should not have been.
  if (state && sys.isAlive(state.pid)) return { status: 'not-ours', pid: state.pid };

  const service = inspectService(paths, sys);
  // Stopping a service's process would only make launchd start another.
  if (service.installed && service.loaded) return { status: 'service-managed', kind: service.kind! };
  return state ? { status: 'not-running', stalePid: state.pid } : { status: 'not-running' };
}

// ─────────────────────────────────────────────────────────────────────────────
// status
// ─────────────────────────────────────────────────────────────────────────────

export interface BridgeStatus {
  /** A bridge is running on this machine, by either route. */
  running: boolean;
  managedBy: 'background' | 'service' | null;
  pid: number | null;
  since: string | null;
  /** The `connect` arguments the running bridge was started with. */
  args: string[] | null;
  /** Never the token: only whether one is saved, and for which bridge. */
  credentials: { saved: boolean; url: string | null; path: string };
  background: { pid: number; startedAt: string; url: string; args: string[]; cliVersion: string } | null;
  /** A background bridge that was recorded and is no longer running. */
  stale: { pid: number; startedAt: string } | null;
  /**
   * Pids running `bridge connect` that neither `start` nor the login service
   * started. Reported, and not counted in `running`: this command cannot tell
   * a bridge in a terminal from one under a sandbox HOME.
   */
  unmanaged: number[];
  service: ServiceInfo;
  log: { path: string; exists: boolean; tail: string[] };
}

/** Everything `status` reports. Reads; changes nothing. */
export function bridgeStatus(paths: BridgePaths, sys: BridgeSystem, options: { tail?: number } = {}): BridgeStatus {
  const saved = loadBridgeCredentials(paths.credentialsPath);
  const recorded = readState(paths);
  const live = recorded && isBridgeProcess(recorded.pid, sys) ? recorded : null;
  const service = inspectService(paths, sys);
  const servicePid = service.pid !== null && sys.isAlive(service.pid) ? service.pid : null;

  const managedBy = live ? 'background' : servicePid !== null ? 'service' : null;
  return {
    running: managedBy !== null,
    managedBy,
    pid: live ? live.pid : servicePid,
    since: live ? live.startedAt : servicePid !== null ? sys.startTime(servicePid) : null,
    args: live ? live.args : servicePid !== null ? service.args : null,
    credentials: { saved: saved !== null, url: saved?.url ?? null, path: paths.credentialsPath },
    background: live
      ? { pid: live.pid, startedAt: live.startedAt, url: live.url, args: live.args, cliVersion: live.cliVersion }
      : null,
    stale: recorded && !live ? { pid: recorded.pid, startedAt: recorded.startedAt } : null,
    unmanaged: unmanagedBridges(sys, [live?.pid ?? null, service.pid]),
    service,
    log: { path: paths.logPath, exists: existsSync(paths.logPath), tail: tailLog(paths.logPath, options.tail ?? 5, { skipBlank: true }) },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// install / uninstall
// ─────────────────────────────────────────────────────────────────────────────

export interface InstallInput extends LaunchInput {
  /** Where `claude` is, when it is on the PATH `install` was run with. */
  claudePath?: string | null;
}

export type InstallOutcome =
  | {
      status: 'installed';
      kind: ServiceKind;
      path: string;
      url: string;
      args: string[];
      logPath: string;
      savedCredentials: boolean;
      /** Other bridges already running on this machine — see `unmanagedBridges`. */
      others: number[];
    }
  | { status: 'unsupported'; platform: NodeJS.Platform }
  | { status: 'invalid-args'; message: string }
  | { status: 'already-installed'; kind: ServiceKind; path: string; loaded: boolean }
  | { status: 'background-running'; pid: number }
  | { status: 'no-credentials'; url?: string }
  | { status: 'credentials-unwritable'; path: string }
  /** launchd or systemd would not take it. Nothing was left installed. */
  | { status: 'load-failed'; kind: ServiceKind; message: string }
  /** It loaded, and the bridge it started did not register. It was removed again. */
  | { status: 'failed'; reason: 'exited' | 'timeout'; lines: string[]; logPath: string };

const SESSION_KEY_MESSAGE = [
  '--session-api-key cannot be given to the login service',
  'A service has no shell environment to carry it in, so the key would have to be',
  'written into the service file. `devpilot bridge start` takes it, and passes it to',
  'the bridge in its environment without writing it anywhere.',
].join('\n');

function loadService(kind: ServiceKind, path: string, sys: BridgeSystem): RunResult {
  if (kind === 'launchd') {
    const bootstrap = sys.run('launchctl', ['bootstrap', `gui/${sys.uid}`, path]);
    if (bootstrap.status === 0) return bootstrap;
    // launchctl(1) lists `load` as the verb `bootstrap` replaced, and it is
    // still there. `-w` also clears a Disabled flag left on the label, which
    // is one of the reasons a bootstrap is refused.
    const legacy = sys.run('launchctl', ['load', '-w', path]);
    return legacy.status === 0 ? legacy : { ...legacy, stderr: `${bootstrap.stderr.trim()}\n${legacy.stderr.trim()}`.trim() };
  }
  const reload = sys.run('systemctl', ['--user', 'daemon-reload']);
  if (reload.status !== 0) return reload;
  return sys.run('systemctl', ['--user', 'enable', '--now', SYSTEMD_UNIT]);
}

function unloadService(kind: ServiceKind, path: string, sys: BridgeSystem): RunResult {
  if (kind === 'launchd') {
    const bootout = sys.run('launchctl', ['bootout', `gui/${sys.uid}/${LAUNCHD_LABEL}`]);
    if (bootout.status === 0) return bootout;
    // Without `-w`: that flag would mark the label Disabled, which persists
    // across restarts and would make the next `install` be refused.
    return sys.run('launchctl', ['unload', path]);
  }
  return sys.run('systemctl', ['--user', 'disable', '--now', SYSTEMD_UNIT]);
}

function removeServiceFile(kind: ServiceKind, path: string, paths: BridgePaths, sys: BridgeSystem): void {
  rmSync(path, { force: true });
  rmSync(paths.serviceRecordPath, { force: true });
  // systemd keeps a deleted unit in memory until told to look again.
  if (kind === 'systemd') sys.run('systemctl', ['--user', 'daemon-reload']);
}

/**
 * Install the login service and load it.
 *
 * Like `start`: when this returns `installed`, a registered bridge is running
 * under launchd or systemd. A service that loads and then cannot register is
 * taken out again — left in place it would be restarted every thirty seconds
 * for as long as the machine is on, failing each time.
 */
export async function installService(input: InstallInput, sys: BridgeSystem): Promise<InstallOutcome> {
  const { paths } = input;
  const wait = { ...DEFAULT_WAIT, ...input.wait };

  const kind = serviceKind(sys.platform);
  if (!kind) return { status: 'unsupported', platform: sys.platform };
  const path = kind === 'launchd' ? paths.plistPath : paths.unitPath;

  const split = splitConnectArgs(input.args);
  if (split.invalid) return { status: 'invalid-args', message: split.invalid };
  if (split.noSave) return { status: 'invalid-args', message: NO_SAVE_MESSAGE };
  if (split.sessionApiKey) return { status: 'invalid-args', message: SESSION_KEY_MESSAGE };

  const running = liveState(paths, sys);
  if (running) return { status: 'background-running', pid: running.pid };

  const existing = inspectService(paths, sys);
  if (existing.installed) return { status: 'already-installed', kind, path, loaded: existing.loaded };

  const credentials = prepareCredentials(split, input.env, paths.credentialsPath);
  if (!credentials.ok) return credentials.outcome;

  const spec: ServiceSpec = {
    home: paths.home,
    node: input.node,
    script: input.script,
    args: split.forwarded,
    logPath: paths.logPath,
    path: servicePathEnv({ node: input.node, claude: input.claudePath, envPath: input.env.PATH }),
  };

  const others = unmanagedBridges(sys, []);

  mkdirSync(paths.stateDir, { recursive: true, mode: 0o700 });
  const offset = openLog(paths.logPath, `devpilot bridge install (${kind}, cli ${input.cliVersion})`);

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, kind === 'launchd' ? launchdPlist(spec) : systemdUnit(spec), { mode: 0o644 });

  const loaded = loadService(kind, path, sys);
  if (loaded.status !== 0) {
    removeServiceFile(kind, path, paths, sys);
    credentials.rollback();
    return {
      status: 'load-failed',
      kind,
      message: redact(loaded.stderr.trim() || `${kind === 'launchd' ? 'launchctl' : 'systemctl'} could not be run`),
    };
  }

  const record: ServiceRecord = {
    kind,
    path,
    installedAt: new Date().toISOString(),
    url: credentials.url,
    args: split.forwarded,
    node: input.node,
    script: input.script,
    cliVersion: input.cliVersion,
  };
  writeJson(paths.serviceRecordPath, record);

  // The process is launchd's, not ours, so there is no pid to watch: what
  // `connect` printed is the evidence. Every way it gives up starts with ✗,
  // and commander rejects an unknown flag with `error:`.
  const registration = await awaitRegistered(paths.logPath, offset, (log) => !/^\s*(✗|error:)/m.test(log), wait);
  if (!registration.ok) {
    unloadService(kind, path, sys);
    removeServiceFile(kind, path, paths, sys);
    credentials.rollback();
    return { status: 'failed', reason: registration.reason, lines: registration.lines, logPath: paths.logPath };
  }

  return {
    status: 'installed',
    kind,
    path,
    url: credentials.url,
    args: split.forwarded,
    logPath: paths.logPath,
    savedCredentials: credentials.saved,
    others,
  };
}

export type UninstallOutcome =
  | { status: 'uninstalled'; kind: ServiceKind; path: string }
  | { status: 'not-installed'; kind: ServiceKind; path: string }
  /** launchd or systemd still has it loaded. The file was left, so `status` still sees it. */
  | { status: 'unload-failed'; kind: ServiceKind; path: string; message: string }
  | { status: 'unsupported'; platform: NodeJS.Platform };

export function uninstallService(paths: BridgePaths, sys: BridgeSystem): UninstallOutcome {
  const kind = serviceKind(sys.platform);
  if (!kind) return { status: 'unsupported', platform: sys.platform };
  const path = kind === 'launchd' ? paths.plistPath : paths.unitPath;
  if (!existsSync(path)) {
    rmSync(paths.serviceRecordPath, { force: true });
    return { status: 'not-installed', kind, path };
  }

  const unloaded = unloadService(kind, path, sys);
  // Asked rather than inferred from the exit status: "it was not loaded" is
  // also a failure to `bootout`, and is the one case where nothing is wrong.
  if (unloaded.status !== 0 && inspectService(paths, sys).loaded) {
    return {
      status: 'unload-failed',
      kind,
      path,
      message: redact(unloaded.stderr.trim() || `${kind === 'launchd' ? 'launchctl' : 'systemctl'} did not unload it`),
    };
  }

  removeServiceFile(kind, path, paths, sys);
  return { status: 'uninstalled', kind, path };
}
