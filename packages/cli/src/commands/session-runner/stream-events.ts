/**
 * What an agent is doing, while it is doing it.
 *
 * `claude -p --output-format json` returns a single blob when the run ends, so
 * a dispatched agent was opaque for its entire life. The cockpit compensated
 * with a fake progress bar — five percent every ninety seconds, capped at
 * ninety — which is why three agents sat at 0% for ten minutes and then snapped
 * to 100%. The conductor was reading painted dials.
 *
 * `--output-format stream-json --verbose` emits newline-delimited JSON as the
 * work happens: every tool call, its result, the assistant's text, and a final
 * `result` carrying real cost, turns and duration. This module turns that
 * firehose into something a person can be shown.
 *
 * ## Why this aggregates rather than forwards
 *
 * A long task emits hundreds of events. Forwarding each one to SQLite and out
 * through SSE would make the instrument itself the load. What a conductor needs
 * is not every keystroke but the shape of the work: which files are being
 * touched, how many tool calls have completed, what it has cost so far, and —
 * the question no wall-clock timer can answer — whether anything has happened
 * recently at all.
 */

/** One decoded line from the stream. Shapes are Claude Code's, not ours. */
interface StreamEvent {
  type?: string;
  subtype?: string;
  message?: {
    content?: {
      type?: string;
      name?: string;
      text?: string;
      input?: Record<string, unknown>;
    }[];
  };
  total_cost_usd?: number;
  num_turns?: number;
  duration_ms?: number;
  usage?: TokenUsage;
}

interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/**
 * Per-million token prices, to put a number on the dial while work is running.
 *
 * `total_cost_usd` only arrives in the final `result` event, so the money
 * reading was $0.0000 for the entire life of a run — dark at exactly the moment
 * a conductor could still act on it. Each assistant turn carries its own usage,
 * including cache tokens, so the spend can be accumulated as it happens.
 *
 * These are Opus rates and this is an ESTIMATE. The authoritative number
 * replaces it the moment `result` lands, and `costIsEstimate` says which one
 * you are looking at — a made-up figure presented as fact is worse than a blank
 * dial, which is the whole reason the old progress bar had to go.
 */
const PRICE_PER_MTOK = {
  input: 5,
  output: 25,
  cacheWrite: 6.25,
  cacheRead: 0.5,
} as const;

function priceUsage(usage: TokenUsage): number {
  const m = 1_000_000;
  return (
    ((usage.input_tokens ?? 0) * PRICE_PER_MTOK.input) / m +
    ((usage.output_tokens ?? 0) * PRICE_PER_MTOK.output) / m +
    ((usage.cache_creation_input_tokens ?? 0) * PRICE_PER_MTOK.cacheWrite) / m +
    ((usage.cache_read_input_tokens ?? 0) * PRICE_PER_MTOK.cacheRead) / m
  );
}

/** A single observed action, kept for the session timeline. */
export interface AgentAction {
  /** Tool name as Claude reports it: Write, Edit, Bash, Read, Grep… */
  tool: string;
  /** The file it acted on, when the tool names one. */
  path?: string;
  /** Milliseconds since the session started, so the UI can lay out a timeline. */
  atMs: number;
}

/** The live picture of one agent, rebuilt on every event. */
export interface SessionTelemetry {
  /** Tool calls the agent has issued. The honest denominator for progress. */
  toolCalls: number;
  /** Distinct files it has written to or edited, in the order first touched. */
  filesTouched: string[];
  /** Files it only read. Useful for seeing an agent orienting vs. producing. */
  filesRead: string[];
  /** Shell commands run, most recent last. */
  commands: string[];
  /** The most recent thing it said, which is usually what it is about to do. */
  lastText?: string;
  /** The most recent tool, for a "currently: Editing scheduler.ts" readout. */
  lastAction?: AgentAction;
  /** Timeline of actions, bounded — see MAX_ACTIONS. */
  actions: AgentAction[];
  /**
   * Spend so far. Estimated from per-turn usage while running, then replaced by
   * the authoritative figure when the run ends.
   */
  costUsd: number;
  /** True while `costUsd` is our arithmetic rather than Claude's own number. */
  costIsEstimate: boolean;
  tokensIn: number;
  tokensOut: number;
  turns: number;
  /** Wall-clock ms since the first event; the fake "elapsed 0m" is gone. */
  elapsedMs: number;
  /** Ms since anything last happened. The stall signal. */
  idleMs: number;
}

/**
 * The timeline is for showing shape, not for forensics. A runaway agent can
 * emit thousands of actions, and an unbounded array in a long-lived process is
 * how a session runner starts leaking.
 */
const MAX_ACTIONS = 200;

/** Tools whose `input.file_path` means "this file changed". */
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const READ_TOOLS = new Set(['Read', 'Glob', 'Grep']);

/**
 * Make a path readable to a human who knows the repository.
 *
 * Claude reports `file_path` as an absolute path, so every surface that showed
 * a file showed
 * `/private/tmp/claude-501/-Users-…/scratchpad/fleet-a/src/lru.ts`. On a Linear
 * ticket that is unreadable, and it publishes the directory layout of whoever
 * happened to run the agent to everyone who can see the issue.
 *
 * Stripped here rather than at each display site: the cockpit HUD, the graph
 * node labels and the Linear summary all read the same field, and three
 * independent trimmings would drift.
 */
function relativize(path: string, workdir?: string): string {
  if (!workdir) return path;
  const root = workdir.endsWith('/') ? workdir : `${workdir}/`;
  if (path.startsWith(root)) return path.slice(root.length);

  // Symlinked temp dirs mean the agent may report /private/var/… for a workdir
  // given as /var/…, and vice versa. Compare both ways before giving up.
  const alt = root.startsWith('/private/') ? root.slice('/private'.length) : `/private${root}`;
  if (path.startsWith(alt)) return path.slice(alt.length);

  return path;
}

export class TelemetryCollector {
  private readonly startedAt: number;
  private lastEventAt: number;
  private readonly touched: string[] = [];
  private readonly read: string[] = [];
  private readonly commands: string[] = [];
  private readonly actions: AgentAction[] = [];
  private toolCalls = 0;
  private costUsd = 0;
  private costIsEstimate = true;
  private tokensIn = 0;
  private tokensOut = 0;
  private turns = 0;
  private lastText?: string;
  private lastAction?: AgentAction;

  constructor(now: () => number = Date.now, workdir?: string) {
    this.now = now;
    this.workdir = workdir;
    this.startedAt = now();
    this.lastEventAt = this.startedAt;
  }

  private readonly now: () => number;
  /** The repo root, so reported paths are relative to it. */
  private readonly workdir?: string;

  /**
   * Feed one raw line. Malformed lines are ignored rather than thrown:
   * telemetry must never be able to kill the session it is describing.
   */
  ingestLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    let event: StreamEvent;
    try {
      event = JSON.parse(trimmed) as StreamEvent;
    } catch {
      return;
    }
    this.ingest(event);
  }

  ingest(event: StreamEvent): void {
    this.lastEventAt = this.now();

    if (event.type === 'assistant') {
      // Each turn prices itself, so the dial moves during the run instead of
      // staying dark until it ends.
      const usage = (event.message as { usage?: TokenUsage } | undefined)?.usage;
      if (usage && this.costIsEstimate) {
        this.costUsd += priceUsage(usage);
        this.tokensIn += usage.input_tokens ?? 0;
        this.tokensOut += usage.output_tokens ?? 0;
      }

      for (const block of event.message?.content ?? []) {
        if (block.type === 'tool_use' && block.name) {
          this.recordTool(block.name, block.input ?? {});
        } else if (block.type === 'text' && block.text?.trim()) {
          // Kept short: this is a status line, not a transcript.
          this.lastText = block.text.trim().slice(0, 240);
        }
      }
    }

    if (event.type === 'result') {
      // Authoritative from here: stop estimating and stop accumulating, or the
      // real figure would be added to the guess.
      if (typeof event.total_cost_usd === 'number') this.costIsEstimate = false;
      this.costUsd = event.total_cost_usd ?? this.costUsd;
      this.turns = event.num_turns ?? this.turns;
      this.tokensIn = event.usage?.input_tokens ?? this.tokensIn;
      this.tokensOut = event.usage?.output_tokens ?? this.tokensOut;
    }
  }

  private recordTool(tool: string, input: Record<string, unknown>): void {
    this.toolCalls++;

    const raw =
      typeof input.file_path === 'string'
        ? input.file_path
        : typeof input.path === 'string'
          ? input.path
          : undefined;
    const path = raw ? relativize(raw, this.workdir) : undefined;

    if (path) {
      const list = WRITE_TOOLS.has(tool) ? this.touched : READ_TOOLS.has(tool) ? this.read : null;
      // First-touch order, not frequency: a conductor reads this as "what has
      // this agent been into", and re-listing a file it edited eight times
      // would drown out the other seven files.
      if (list && !list.includes(path)) list.push(path);
    }

    if (tool === 'Bash' && typeof input.command === 'string') {
      this.commands.push(input.command.slice(0, 200));
    }

    const action: AgentAction = { tool, path, atMs: this.now() - this.startedAt };
    this.lastAction = action;
    this.actions.push(action);
    if (this.actions.length > MAX_ACTIONS) this.actions.shift();
  }

  snapshot(): SessionTelemetry {
    const now = this.now();
    return {
      toolCalls: this.toolCalls,
      filesTouched: [...this.touched],
      filesRead: [...this.read],
      commands: [...this.commands],
      lastText: this.lastText,
      lastAction: this.lastAction,
      actions: [...this.actions],
      costUsd: this.costUsd,
      costIsEstimate: this.costIsEstimate,
      tokensIn: this.tokensIn,
      tokensOut: this.tokensOut,
      turns: this.turns,
      elapsedMs: now - this.startedAt,
      idleMs: now - this.lastEventAt,
    };
  }
}

/**
 * Progress from evidence rather than from a timer.
 *
 * The plan states which files a task will touch. Once an agent has written to
 * all of them it is, by its own contract, essentially done — so the ratio is a
 * real measurement instead of a countdown. Both bounds matter: it never claims
 * completion (the agent decides that), and it never claims zero once work has
 * started, because an agent five tool calls in is visibly not at nothing.
 *
 * With no declared files there is nothing to measure against, so this falls
 * back to a coarse tool-call curve — still evidence, just weaker evidence, and
 * it is capped low enough that nobody mistakes it for a real reading.
 */
export function estimateProgress(
  telemetry: SessionTelemetry,
  declaredFiles: string[] = []
): number {
  if (declaredFiles.length > 0) {
    const declared = declaredFiles.map(normalize);
    const done = declared.filter((f) =>
      telemetry.filesTouched.some((t) => normalize(t).endsWith(f) || f.endsWith(normalize(t)))
    ).length;
    const ratio = done / declared.length;
    // 10 as a floor once anything has happened, 90 as a ceiling because the
    // agent is the only thing that can declare itself finished.
    return Math.max(telemetry.toolCalls > 0 ? 10 : 0, Math.min(90, Math.round(ratio * 90)));
  }

  if (telemetry.toolCalls === 0) return 0;
  // Diminishing curve: 1 call ≈ 12%, 5 ≈ 40%, 20 ≈ 65%, never past 70 without
  // file evidence to back it.
  return Math.min(70, Math.round(70 * (1 - Math.exp(-telemetry.toolCalls / 8))));
}

function normalize(p: string): string {
  return p.replace(/^\.\//, '').replace(/\\/g, '/');
}

/** A short human phrase for what the agent is doing right now. */
export function describeActivity(telemetry: SessionTelemetry): string {
  const a = telemetry.lastAction;
  if (!a) return 'starting up';

  const file = a.path ? a.path.split('/').slice(-1)[0] : undefined;
  switch (a.tool) {
    case 'Write':
      return file ? `writing ${file}` : 'writing';
    case 'Edit':
    case 'MultiEdit':
      return file ? `editing ${file}` : 'editing';
    case 'Read':
      return file ? `reading ${file}` : 'reading';
    case 'Bash':
      return `running ${(telemetry.commands.at(-1) ?? '').split(/\s+/)[0] || 'a command'}`;
    case 'Grep':
    case 'Glob':
      return 'searching';
    default:
      return a.tool.toLowerCase();
  }
}

/**
 * Has this agent stopped making progress?
 *
 * The one question a wall-clock timer cannot answer, and the reason a conductor
 * would look at this screen at all. Silence is not the same as slowness: a long
 * Bash step is quiet and healthy, so the threshold is generous by default and
 * the caller decides what to do about it.
 */
export function isStalled(telemetry: SessionTelemetry, thresholdMs = 180_000): boolean {
  return telemetry.toolCalls > 0 && telemetry.idleMs > thresholdMs;
}
