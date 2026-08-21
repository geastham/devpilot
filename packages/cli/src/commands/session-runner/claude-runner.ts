import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { TelemetryCollector, type SessionTelemetry } from './stream-events';

const execFileAsync = promisify(execFile);

/**
 * Runs one Claude Code session and turns it into ground truth.
 *
 * The prompt DevPilot composes (`session-prompt.ts` §7.3) asks the *session* to
 * curl its own status and completion callbacks. This runner does not rely on
 * that, and TRD-01 §7.2 explicitly permits the alternative: "the session (or
 * runner on its behalf) POSTs".
 *
 * Reporting on its behalf is the honest option. A model may forget the final
 * callback, may send it twice, and — worst — will happily invent `tokensUsed`
 * and `costUsd`, because it has no way to know them. Every number in the report
 * this module produces comes from something observable: the process exit code,
 * `claude`'s own `--output-format json` envelope, and the repo's git state.
 */

/** The fields of `claude -p --output-format json` this runner depends on. */
interface ClaudeResultEnvelope {
  is_error?: boolean;
  subtype?: string;
  result?: string;
  total_cost_usd?: number;
  duration_ms?: number;
  session_id?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

export interface ClaudeRunOutcome {
  success: boolean;
  summary: string;
  error?: string;
  tokensUsed: number;
  costUsd: number;
  durationMinutes: number;
  filesModified: string[];
  filesCreated: string[];
  filesDeleted: string[];
  commitSha?: string;
}

/** `path -> two-letter porcelain code`, e.g. `src/a.ts -> ' M'`. */
type GitState = Map<string, string>;

async function git(workdir: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd: workdir,
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout;
}

/**
 * Snapshot the working tree. `-uall` lists untracked files individually rather
 * than collapsing them into a directory entry, without which a session that
 * creates `src/new/a.ts` and `src/new/b.ts` reports the single path `src/new/`.
 */
async function snapshot(workdir: string): Promise<GitState> {
  const state: GitState = new Map();
  try {
    const out = await git(workdir, ['status', '--porcelain', '-uall']);
    for (const line of out.split('\n')) {
      if (line.length < 4) continue;
      state.set(line.slice(3).trim(), line.slice(0, 2));
    }
  } catch {
    // Not a git repo, or git missing. File attribution degrades to empty rather
    // than failing the session — the work still happened.
  }
  return state;
}

async function headSha(workdir: string): Promise<string | undefined> {
  try {
    return (await git(workdir, ['rev-parse', 'HEAD'])).trim();
  } catch {
    return undefined;
  }
}

/**
 * Classify what the session did to the tree by diffing two snapshots.
 *
 * KNOWN LIMITATION: a file that was already dirty in the same way before the
 * session and edited further during it has an unchanged porcelain code, so it
 * is not attributed. Dispatch onto a clean tree and this is exact; dispatch onto
 * a dirty one and it under-reports rather than inventing. Under-reporting is the
 * right direction — DevPilot releases in-flight file locks from this list.
 */
function classify(before: GitState, after: GitState) {
  const filesModified: string[] = [];
  const filesCreated: string[] = [];
  const filesDeleted: string[] = [];

  for (const [path, code] of after) {
    if (before.get(path) === code) continue;
    if (code.includes('?')) filesCreated.push(path);
    else if (code.includes('D')) filesDeleted.push(path);
    else if (code.includes('A')) filesCreated.push(path);
    else filesModified.push(path);
  }

  // Present before, gone after: staged-and-committed, or reverted. Either way it
  // is no longer pending, so it is not a change the session leaves behind.
  return { filesModified, filesCreated, filesDeleted };
}

/**
 * Pull the last JSON object out of claude's stdout.
 *
 * With `--output-format stream-json` stdout is newline-delimited events and the
 * envelope is the final `result` object — which carries the same fields the old
 * single-object format did (`total_cost_usd`, `num_turns`, `usage`, `result`,
 * `is_error`), so everything downstream reads unchanged.
 *
 * Scanning backwards for the last balanced object handles both shapes, and also
 * the case this was originally written for: MCP servers and plugins that print
 * to stdout before the envelope. `JSON.parse(stdout)` handles neither.
 */
function parseEnvelope(stdout: string): ClaudeResultEnvelope | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed) as ClaudeResultEnvelope;
  } catch {
    // Fall through to the scan.
  }

  const start = trimmed.lastIndexOf('\n{');
  if (start !== -1) {
    try {
      return JSON.parse(trimmed.slice(start + 1)) as ClaudeResultEnvelope;
    } catch {
      // Fall through.
    }
  }
  return null;
}

/**
 * Wire the spawned agent into a DevPilot shared session (TRD-15 §3.1/§3.2).
 *
 * The join link carries the session key, so it must not be observable. It is
 * written into a `0600` MCP config file and passed BY PATH — never as an argv
 * element, because `ps` on a shared machine shows argv to every user on it, and
 * never through the environment, which `/proc/<pid>/environ` exposes on Linux.
 *
 * The caller deletes the directory when the process exits; `finally` in
 * `runClaudeSession` guarantees it even on a throw.
 */
function writeSessionMcpConfig(sessionLink: string): { dir: string; file: string } {
  const dir = mkdtempSync(join(tmpdir(), 'devpilot-mcp-'));
  const file = join(dir, 'mcp.json');

  writeFileSync(
    file,
    JSON.stringify(
      {
        mcpServers: {
          'devpilot-session': {
            command: 'npx',
            args: ['-y', '@devpilot.sh/mcp-session'],
            env: { DEVPILOT_SESSION_LINK: sessionLink },
          },
        },
      },
      null,
      2
    ),
    { mode: 0o600 }
  );

  return { dir, file };
}

/**
 * Instructions prepended when the dispatch belongs to a shared session.
 *
 * The link is NOT interpolated here. The MCP server reads it from its own env;
 * putting it in the prompt would place the key in the transcript, which is the
 * one place guaranteed to be replayed.
 */
function sessionPreamble(): string {
  return [
    '# Shared session',
    '',
    'You are working inside a DevPilot shared session. Your collaborators can',
    'watch this session and join it while you work.',
    '',
    '1. Call `devpilot_session_join` FIRST, with no `url` argument — the runner',
    '   has already supplied the link out of band.',
    '2. Post a short plan before you change anything.',
    '3. Post a summary of what you did and why when you finish.',
    '',
    'Never print the join link or any key material into the transcript.',
    '',
    '---',
    '',
  ].join('\n');
}

export interface RunClaudeOptions {
  workdir: string;
  prompt: string;
  /** Join link for the shared session, if this dispatch belongs to one. */
  sessionLink?: string;
  model?: string;
  claudePath: string;
  permissionMode: string;
  timeoutMs: number;
  /** Called with each chunk of stderr, for operator visibility. */
  onLog?: (line: string) => void;
  /** Receives the kill handle so the HTTP `stop` route can cancel the run. */
  onSpawn?: (kill: () => void) => void;
  /**
   * Called as the agent works, with the running picture of what it is doing.
   *
   * This is the difference between a status board and an instrument. Without it
   * a dispatched agent is opaque until it exits, and the only honest thing the
   * cockpit can show is a timer pretending to be a progress bar.
   */
  onTelemetry?: (telemetry: SessionTelemetry) => void;
}

export async function runClaudeSession(
  options: RunClaudeOptions
): Promise<ClaudeRunOutcome> {
  const { workdir, prompt, sessionLink, model, claudePath, permissionMode, timeoutMs, onLog, onSpawn } =
    options;

  const before = await snapshot(workdir);
  const startedAt = Date.now();

  /**
   * `stream-json`, not `json`.
   *
   * `json` buffers everything and returns one object when the run ends, which
   * is why an agent was a black box for its entire life. `stream-json` emits
   * newline-delimited events as the work happens — every tool call, its result,
   * and a final `result` carrying real cost and turns. `--verbose` is required
   * for it to include the assistant turns at all.
   *
   * The final `result` event is still a superset of what `json` returned, so
   * everything downstream that parsed the old envelope keeps working.
   */
  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--permission-mode',
    permissionMode,
  ];
  if (model) args.push('--model', model);

  // Shared-session wiring. `--strict-mcp-config` keeps the agent to exactly this
  // server: a dispatched agent should not inherit whatever MCP servers happen to
  // be configured on the machine, which would vary per operator and could reach
  // systems the dispatch never intended to touch.
  let mcpDir: string | undefined;
  let effectivePrompt = prompt;
  if (sessionLink) {
    const cfg = writeSessionMcpConfig(sessionLink);
    mcpDir = cfg.dir;
    args.push('--mcp-config', cfg.file, '--strict-mcp-config');
    effectivePrompt = sessionPreamble() + prompt;
  }

  const outcome = await new Promise<{
    code: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    killed: boolean;
  }>((resolve) => {
    const child = spawn(claudePath, args, {
      cwd: workdir,
      // The prompt goes in on stdin, not argv. A composed prompt carries
      // newlines, backticks and quotes, and is easily tens of kilobytes — well
      // past ARG_MAX on a long file scope.
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    /** Partial trailing line between chunks; NDJSON does not respect chunk boundaries. */
    let pending = '';
    const collector = new TelemetryCollector();
    let timedOut = false;
    let killed = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      // SIGKILL if it ignores the polite request.
      setTimeout(() => child.kill('SIGKILL'), 5_000).unref();
    }, timeoutMs);

    onSpawn?.(() => {
      killed = true;
      child.kill('SIGTERM');
    });

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;

      /**
       * Split on newlines and keep the remainder. A chunk boundary lands in the
       * middle of a JSON object often enough that parsing per-chunk silently
       * drops events — and dropped events are exactly the tool calls the
       * instrument exists to show.
       */
      pending += text;
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) collector.ingestLine(line);
      if (lines.length > 0) options.onTelemetry?.(collector.snapshot());
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      onLog?.(text.trimEnd());
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr: `${stderr}\n${error.message}`, timedOut, killed });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut, killed });
    });

    child.stdin.write(effectivePrompt);
    child.stdin.end();
  }).finally(() => {
    // The config holds the session key. Remove it as soon as the process is
    // gone, whether it exited, timed out, was killed, or threw.
    if (mcpDir) rmSync(mcpDir, { recursive: true, force: true });
  });

  const after = await snapshot(workdir);
  const files = classify(before, after);
  const envelope = parseEnvelope(outcome.stdout);

  const usage = envelope?.usage ?? {};
  const tokensUsed =
    (usage.input_tokens ?? 0) +
    (usage.output_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0);

  const durationMs = envelope?.duration_ms ?? Date.now() - startedAt;

  // Success needs BOTH the process and the envelope to agree. `claude` exits 0
  // on an in-band error (`is_error: true`), so exit code alone would report a
  // refused or errored turn as a completed task.
  const processOk = outcome.code === 0 && !outcome.timedOut && !outcome.killed;
  const envelopeOk = envelope ? envelope.is_error !== true : false;
  const success = processOk && envelopeOk;

  let error: string | undefined;
  if (outcome.timedOut) error = `Session exceeded ${Math.round(timeoutMs / 1000)}s timeout`;
  else if (outcome.killed) error = 'Session stopped by operator';
  else if (!envelope) error = `No JSON result from claude. stderr: ${outcome.stderr.slice(-2000)}`;
  else if (envelope.is_error) error = envelope.result ?? `claude reported ${envelope.subtype}`;
  else if (outcome.code !== 0) error = `claude exited ${outcome.code}. stderr: ${outcome.stderr.slice(-2000)}`;

  return {
    success,
    summary: envelope?.result?.trim() || (success ? 'Session completed.' : error || 'Session failed.'),
    error,
    tokensUsed,
    costUsd: envelope?.total_cost_usd ?? 0,
    durationMinutes: Math.round((durationMs / 60_000) * 100) / 100,
    ...files,
    commitSha: await headSha(workdir),
  };
}
