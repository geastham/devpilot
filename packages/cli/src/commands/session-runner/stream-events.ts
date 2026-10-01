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

import {
  countUsage,
  dominantModel,
  initialUsageMeter,
  emptyUsage,
  priceAtReference,
  priceMeter,
  type UsageTotals,
  type UsageMeterState,
} from '../../utils/usage-meter.js';

/** One decoded line from the stream. Shapes are Claude Code's, not ours. */
interface StreamEvent {
  type?: string;
  subtype?: string;
  message?: {
    id?: string;
    model?: string;
    usage?: TokenUsage;
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
  /** On the final `result` only: the run's usage, split by the model that used it. */
  modelUsage?: Record<
    string,
    {
      inputTokens?: number;
      outputTokens?: number;
      cacheReadInputTokens?: number;
      cacheCreationInputTokens?: number;
    }
  >;
}

interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
  };
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
  /** Of those, how many changed a file. */
  writeCalls: number;
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
  /**
   * The tokens counted so far at their own models' API list prices, and the
   * same tokens at the most expensive model's — see `priceAtReference`.
   *
   * A pair, from one price table, so that the only thing differing between
   * them is the model. `costUsd` is not used for this: once the run ends it is
   * Claude's own figure, which can cover calls the stream never showed, and a
   * saving computed across two sources would partly measure their difference.
   * Absent until a response with usage has been seen.
   */
  listCostUsd?: number;
  referenceCostUsd?: number;
  /** Which model `referenceCostUsd` was priced at. */
  referenceModel?: string;
  /** Input tokens processed fresh — not served from the prompt cache. */
  tokensIn: number;
  tokensOut: number;
  /** Input tokens served from the prompt cache. */
  tokensCacheRead: number;
  /** Input tokens written to the prompt cache. */
  tokensCacheWrite: number;
  turns: number;
  /** The model that processed most of the tokens, once one has answered. */
  model?: string;
  /** Which harness profile launched this agent, e.g. `lean@1`. Set by the runner. */
  harness?: string;
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
  private writeCalls = 0;
  private costUsd = 0;
  private costIsEstimate = true;
  /**
   * Counted once per response. The stream repeats a response's usage on every
   * content block it emits, exactly as the transcript does, so adding each
   * event's usage inflated the running estimate by the number of blocks.
   */
  private readonly meter: UsageMeterState = initialUsageMeter();
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
      const usage = event.message?.usage;
      if (usage && this.costIsEstimate) {
        countUsage(this.meter, event.message?.id, usage, event.message?.model);
        this.costUsd = priceMeter(this.meter);
        this.turns = this.meter.turns;
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
      if (event.usage) {
        const t = this.meter.totals;
        t.input = event.usage.input_tokens ?? t.input;
        t.output = event.usage.output_tokens ?? t.output;
        t.cacheRead = event.usage.cache_read_input_tokens ?? t.cacheRead;
        t.cacheWrite = event.usage.cache_creation_input_tokens ?? t.cacheWrite;
        const hour = event.usage.cache_creation?.ephemeral_1h_input_tokens;
        if (typeof hour === 'number') t.cacheWrite1h = Math.min(hour, t.cacheWrite);
      }
      this.reconcileModels(event.modelUsage);
    }
  }

  /**
   * Replace the per-model split with the one in the final result.
   *
   * WHY IT CANNOT BE LEFT AS COUNTED. While a run is in flight the stream
   * reports each response's usage as it BEGINS: the input side is right, and
   * the output count is a placeholder of a few tokens. The real output arrives
   * only in the final result. Measured on a live run: 11 output tokens counted
   * from the stream against 567 in the result.
   *
   * The totals above are corrected from the result, but the per-model buckets
   * were not, so a finished session's tokens no longer added up to its total —
   * and the difference, which is nearly all of the output, was priced as
   * "tokens no model was named for", at the default rate. A Haiku run's output
   * was being priced as Opus: $0.033 reported against Claude's own $0.018.
   *
   * The result names every model and what it used, so the buckets are rebuilt
   * from it, and the totals with them when more than one model ran — the
   * top-level usage can omit a model that only did background work.
   *
   * The one thing the per-model figures do not carry is how a cache write
   * splits by lifetime. That is known for the run as a whole, so it is shared
   * out in proportion to each model's cache writes.
   */
  private reconcileModels(modelUsage: StreamEvent['modelUsage']): void {
    const entries = Object.entries(modelUsage ?? {});
    if (entries.length === 0) {
      this.attributeRemainder();
      return;
    }

    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
    const byModel: Record<string, UsageTotals> = {};
    const sum = emptyUsage();
    for (const [model, usage] of entries) {
      const bucket: UsageTotals = {
        input: n(usage.inputTokens),
        output: n(usage.outputTokens),
        cacheRead: n(usage.cacheReadInputTokens),
        cacheWrite: n(usage.cacheCreationInputTokens),
        cacheWrite1h: 0,
      };
      byModel[model.slice(0, 80)] = bucket;
      sum.input += bucket.input;
      sum.output += bucket.output;
      sum.cacheRead += bucket.cacheRead;
      sum.cacheWrite += bucket.cacheWrite;
    }

    const hourShare =
      sum.cacheWrite > 0
        ? Math.min(1, (this.meter.totals.cacheWrite1h ?? 0) / Math.max(1, this.meter.totals.cacheWrite))
        : 0;
    for (const bucket of Object.values(byModel)) bucket.cacheWrite1h = bucket.cacheWrite * hourShare;
    sum.cacheWrite1h = sum.cacheWrite * hourShare;

    this.meter.byModel = byModel;
    this.meter.totals = sum;
  }

  /**
   * The same repair for a result that names no models — an older Claude Code.
   *
   * There is no authoritative split to rebuild from, so whatever the corrected
   * totals hold beyond what was counted per model is given to the model that
   * did most of the work, rather than left unattributed and priced at the
   * default. For a run on one model, which is nearly all of them, that is
   * exact.
   */
  private attributeRemainder(): void {
    const model = dominantModel(this.meter);
    const buckets = this.meter.byModel;
    if (!model || !buckets) return;
    // `dominantModel` drops a context-window suffix; find the bucket it named.
    const key = Object.keys(buckets).find((k) => k === model || k.replace(/\[[^\]]*\]$/, '') === model);
    if (!key) return;

    const counted = emptyUsage();
    for (const b of Object.values(buckets)) {
      counted.input += b.input;
      counted.output += b.output;
      counted.cacheRead += b.cacheRead;
      counted.cacheWrite += b.cacheWrite;
      counted.cacheWrite1h = (counted.cacheWrite1h ?? 0) + (b.cacheWrite1h ?? 0);
    }
    const t = this.meter.totals;
    const bucket = buckets[key];
    bucket.input += Math.max(0, t.input - counted.input);
    bucket.output += Math.max(0, t.output - counted.output);
    bucket.cacheRead += Math.max(0, t.cacheRead - counted.cacheRead);
    bucket.cacheWrite += Math.max(0, t.cacheWrite - counted.cacheWrite);
    bucket.cacheWrite1h =
      (bucket.cacheWrite1h ?? 0) + Math.max(0, (t.cacheWrite1h ?? 0) - (counted.cacheWrite1h ?? 0));
  }

  private recordTool(tool: string, input: Record<string, unknown>): void {
    this.toolCalls++;
    if (WRITE_TOOLS.has(tool)) this.writeCalls++;

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

  private referencePricing(): Pick<SessionTelemetry, 'listCostUsd' | 'referenceCostUsd' | 'referenceModel'> {
    const reference = priceAtReference(this.meter.totals);
    if (!reference) return {};
    return {
      listCostUsd: priceMeter(this.meter),
      referenceCostUsd: reference.costUsd,
      referenceModel: reference.model,
    };
  }

  snapshot(): SessionTelemetry {
    const now = this.now();
    return {
      toolCalls: this.toolCalls,
      writeCalls: this.writeCalls,
      filesTouched: [...this.touched],
      filesRead: [...this.read],
      commands: [...this.commands],
      lastText: this.lastText,
      lastAction: this.lastAction,
      actions: [...this.actions],
      costUsd: this.costUsd,
      costIsEstimate: this.costIsEstimate,
      ...this.referencePricing(),
      tokensIn: this.meter.totals.input,
      tokensOut: this.meter.totals.output,
      tokensCacheRead: this.meter.totals.cacheRead,
      tokensCacheWrite: this.meter.totals.cacheWrite,
      turns: this.turns,
      model: dominantModel(this.meter) ?? undefined,
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
