import { openSync, readSync, fstatSync, closeSync } from 'node:fs';
import {
  countUsage,
  initialUsageMeter,
  type RawUsage,
  type UsageMeterState,
} from '../../utils/usage-meter.js';

/**
 * Derive stream events from a Claude Code transcript, incrementally.
 *
 * The transcript is the machine's full record and never leaves the machine.
 * What leaves is what this extracts: tool name, repo-relative path, and a time
 * offset — the derived-facts line the telemetry schema draws, applied at event
 * granularity. Tool INPUTS are deliberately never read beyond the two path
 * fields, because a Write tool's input IS the file contents.
 *
 * Incremental by byte offset: the adoption watcher already ticks on transcript
 * growth, so each tick reads only the appended region. A partial trailing line
 * (the writer mid-append) is carried to the next tick rather than parsed.
 *
 * Idle collapse mirrors the hosted view's contract: `t` is active seconds, not
 * wall clock. A session left overnight resumes seconds after it paused, so the
 * strip reads as work instead of as one long silence.
 *
 * ## What the session cost, in the same pass
 *
 * Every assistant line also carries the token usage of the response it belongs
 * to. Nothing read it, so an observed session — which is nearly every session
 * on a real fleet — reported no tokens at all and the hosted efficiency
 * readings stayed dark. The tailer now meters usage as it goes (see
 * utils/usage-meter for why that is not a plain sum) and keeps the set of files
 * the session has actually written, which is the numerator those readings need.
 * Both are counts and paths. Neither is content.
 */

const IDLE_MS = 5 * 60 * 1000;
/** A long pause is shown as one beat, not erased entirely. */
const PAUSE_BEAT_MS = 30 * 1000;

/** Tools whose path means "this file changed". Mirrors the session runner. */
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

/** The hosted schema's ceiling on `filesTouched`; past it the list stops growing. */
const MAX_WRITTEN = 500;
const MAX_PATH_LENGTH = 500;
/**
 * The hosted stream route's limit on a tool name.
 *
 * MCP tool names are `mcp__<server>__<tool>` and run past it easily — 71
 * characters, on this fleet. The route refuses the whole batch for one
 * over-long name, so a session that used such a tool stopped streaming at that
 * point and every later batch failed with it. Truncated here: which server and
 * roughly which tool is all the strip needs, and it is better than no strip.
 */
const MAX_TOOL_LENGTH = 64;

export interface DerivedEvent {
  seq: number;
  /** Active seconds since the first observed event. */
  t: number;
  tool: string;
  path: string | null;
}

export interface TailState {
  byteOffset: number;
  /** Carried partial line from the previous read. */
  remainder: string;
  seq: number;
  lastEventMs: number | null;
  activeMs: number;
  /**
   * Token usage so far. Absent on a ledger written before usage was derived,
   * which is the signal to backfill it from the part already read.
   */
  usage?: UsageMeterState;
  /** Distinct repo-relative files written or edited, in first-touch order. */
  written?: string[];
  /**
   * How many tool calls changed a file. Counted here rather than left to be
   * inferred from the event stream, which the hosted plane keeps only the
   * recent tail of — a long session would lose its early edits from the count.
   */
  writeCalls?: number;
}

export function initialTailState(): TailState {
  return {
    byteOffset: 0,
    remainder: '',
    seq: 0,
    lastEventMs: null,
    activeMs: 0,
    usage: initialUsageMeter(),
    written: [],
    writeCalls: 0,
  };
}

/** Recover a path from a Bash command without keeping the command. */
function pathFromCommand(command: unknown): string | null {
  if (typeof command !== 'string') return null;
  const m = command.match(/[\w./-]+\.(?:ts|tsx|js|jsx|py|sql|md|json|css|sh|mjs|go|rs)\b/);
  return m ? m[0] : null;
}

interface TranscriptLine {
  type?: string;
  timestamp?: string;
  message?: {
    id?: string;
    model?: string;
    usage?: RawUsage;
    content?: Array<{ type?: string; name?: string; input?: Record<string, unknown> }>;
  };
}

function parse(line: string): TranscriptLine | null {
  if (!line) return null;
  try {
    return JSON.parse(line) as TranscriptLine;
  } catch {
    return null; // a torn line mid-file; nothing recoverable
  }
}

/** Repo-relative or nothing. */
function relativePath(
  tool: string,
  input: Record<string, unknown>,
  cwd?: string | null,
): string | null {
  let path =
    (typeof input.file_path === 'string' && input.file_path) ||
    (typeof input.path === 'string' && input.path) ||
    (typeof input.notebook_path === 'string' && input.notebook_path) ||
    null;
  if (!path && tool === 'Bash') path = pathFromCommand(input.command);

  // An absolute path outside the repo is someone else's filesystem detail, not
  // this session's work.
  if (path && cwd && path.startsWith(cwd)) path = path.slice(cwd.length + 1);
  if (path && path.startsWith('/')) path = null;
  return path;
}

function noteWritten(state: TailState, tool: string, path: string | null): void {
  if (!WRITE_TOOLS.has(tool)) return;
  // The call counts whether or not its path can be shown: an edit outside the
  // repo is still an edit.
  state.writeCalls = (state.writeCalls ?? 0) + 1;
  if (!path) return;
  // One over-long path would fail the whole reading's validation upstream.
  if (path.length > MAX_PATH_LENGTH) return;
  const written = (state.written ??= []);
  if (written.length >= MAX_WRITTEN || written.includes(path)) return;
  written.push(path);
}

/**
 * Meter the region a previous version already consumed.
 *
 * A bridge upgraded mid-session restores a tail whose byte offset is past
 * everything the session has done so far. Counting only from there would
 * report a ten-hour session as having spent whatever it spent since the
 * upgrade — a number that looks measured and is wrong. So the consumed region
 * is read once more, for usage and written files only: the events it produced
 * were already streamed and must not be sent again under new ordinals.
 */
function backfill(fd: number, state: TailState, cwd?: string | null): void {
  state.usage = initialUsageMeter();
  state.written = [];
  state.writeCalls = 0;
  if (state.byteOffset === 0) return;

  const buf = Buffer.alloc(state.byteOffset);
  readSync(fd, buf, 0, buf.length, 0);
  const lines = buf.toString('utf8').split('\n');
  // The trailing piece is the carried remainder; the forward read owns it.
  lines.pop();

  for (const line of lines) {
    const o = parse(line);
    if (!o || o.type !== 'assistant') continue;
    countUsage(state.usage, o.message?.id, o.message?.usage, o.message?.model);
    for (const block of o.message?.content ?? []) {
      if (block.type !== 'tool_use' || !block.name) continue;
      noteWritten(state, block.name, relativePath(block.name, block.input ?? {}, cwd));
    }
  }
}

export function tailTranscript(
  transcriptPath: string,
  state: TailState,
  cwd?: string | null,
): DerivedEvent[] {
  let fd: number;
  try {
    fd = openSync(transcriptPath, 'r');
  } catch {
    return [];
  }

  let chunk: string;
  try {
    const size = fstatSync(fd).size;
    // Truncated or rotated: start over rather than reading garbage offsets.
    // The counts described the file that is gone, so they start over with it.
    if (size < state.byteOffset) {
      state.byteOffset = 0;
      state.remainder = '';
      state.usage = initialUsageMeter();
      state.written = [];
      state.writeCalls = 0;
    }
    if (state.usage === undefined) backfill(fd, state, cwd);
    if (size === state.byteOffset) {
      return []; // the finally below owns the close
    }
    const buf = Buffer.alloc(size - state.byteOffset);
    readSync(fd, buf, 0, buf.length, state.byteOffset);
    state.byteOffset = size;
    chunk = state.remainder + buf.toString('utf8');
  } finally {
    closeSync(fd);
  }

  const lines = chunk.split('\n');
  // The last element is either '' (chunk ended on a newline) or a partial
  // line still being written; both belong to the next tick.
  state.remainder = lines.pop() ?? '';

  const usage = (state.usage ??= initialUsageMeter());
  const events: DerivedEvent[] = [];
  for (const line of lines) {
    const o = parse(line);
    if (!o || o.type !== 'assistant') continue;

    // Before the timestamp check: usage is real whether or not the line can be
    // placed on a timeline.
    countUsage(usage, o.message?.id, o.message?.usage, o.message?.model);

    const ms = o.timestamp ? Date.parse(o.timestamp) : NaN;
    if (!Number.isFinite(ms)) continue;

    for (const block of o.message?.content ?? []) {
      if (block.type !== 'tool_use' || !block.name) continue;
      let path = relativePath(block.name, block.input ?? {}, cwd);
      noteWritten(state, block.name, path);
      // Same reasoning as the tool name: one over-long path must not cost the
      // batch. The event still counts; it just does not say where.
      if (path && path.length > MAX_PATH_LENGTH) path = null;

      if (state.lastEventMs !== null) {
        const gap = ms - state.lastEventMs;
        // Zero gap is real: several tool calls in one assistant turn share a
        // timestamp. Only a LONG gap becomes the pause beat.
        state.activeMs += gap >= IDLE_MS ? PAUSE_BEAT_MS : Math.max(gap, 0);
      }
      state.lastEventMs = ms;

      events.push({
        seq: state.seq++,
        t: Math.round(state.activeMs / 1000),
        tool: block.name.slice(0, MAX_TOOL_LENGTH),
        path,
      });
    }
  }
  return events;
}
