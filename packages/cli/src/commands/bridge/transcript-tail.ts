import { openSync, readSync, fstatSync, closeSync } from 'node:fs';

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
 */

const IDLE_MS = 5 * 60 * 1000;
/** A long pause is shown as one beat, not erased entirely. */
const PAUSE_BEAT_MS = 30 * 1000;

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
}

export function initialTailState(): TailState {
  return { byteOffset: 0, remainder: '', seq: 0, lastEventMs: null, activeMs: 0 };
}

/** Recover a path from a Bash command without keeping the command. */
function pathFromCommand(command: unknown): string | null {
  if (typeof command !== 'string') return null;
  const m = command.match(/[\w./-]+\.(?:ts|tsx|js|jsx|py|sql|md|json|css|sh|mjs|go|rs)\b/);
  return m ? m[0] : null;
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
    if (size < state.byteOffset) {
      state.byteOffset = 0;
      state.remainder = '';
    }
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

  const events: DerivedEvent[] = [];
  for (const line of lines) {
    if (!line) continue;
    let o: {
      type?: string;
      timestamp?: string;
      message?: { content?: Array<{ type?: string; name?: string; input?: Record<string, unknown> }> };
    };
    try {
      o = JSON.parse(line);
    } catch {
      continue; // a torn line mid-file; nothing recoverable
    }
    if (o.type !== 'assistant') continue;
    const ms = o.timestamp ? Date.parse(o.timestamp) : NaN;
    if (!Number.isFinite(ms)) continue;

    for (const block of o.message?.content ?? []) {
      if (block.type !== 'tool_use' || !block.name) continue;
      const input = block.input ?? {};

      let path =
        (typeof input.file_path === 'string' && input.file_path) ||
        (typeof input.path === 'string' && input.path) ||
        (typeof input.notebook_path === 'string' && input.notebook_path) ||
        null;
      if (!path && block.name === 'Bash') path = pathFromCommand(input.command);

      // Repo-relative or nothing. An absolute path outside the repo is
      // someone else's filesystem detail, not this session's work.
      if (path && cwd && path.startsWith(cwd)) path = path.slice(cwd.length + 1);
      if (path && path.startsWith('/')) path = null;

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
        tool: block.name,
        path,
      });
    }
  }
  return events;
}
