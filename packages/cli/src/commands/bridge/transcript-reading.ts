import type { BridgeClient } from '@devpilot.sh/bridge-client';
import { tailTranscript, initialTailState, type TailState } from './transcript-tail.js';
import { dominantModel, priceMeter, totalTokens } from '../../utils/usage-meter.js';

/**
 * One instrument reading from one transcript, sent up.
 *
 * Two things watch transcripts — the adoption watcher, for sessions placed on a
 * board, and the observer, for every other session on the machine — and both
 * need exactly this: derive what was appended, stream the events, send the
 * cumulative reading. It lived inside the adoption watcher, which is why a
 * session that was merely observed (the default, and so nearly every session
 * on a real fleet) appeared in the cockpit with no instruments at all.
 *
 * What crosses is what `transcript-tail` derives and nothing else: tool names,
 * repo-relative paths, time offsets, and counts.
 */

/** The state a caller keeps per transcript. Plain data; safe to persist. */
export interface ReadingTarget {
  /** `dispatch_sessions.id` on the hosted plane. */
  sessionId: string;
  /** For log lines only. */
  label: string;
  transcriptPath: string;
  /** Working directory the session runs in, for repo-relative paths. */
  cwd?: string | null;
  tail?: TailState;
  /** The last thing it was seen doing, kept so every reading can carry it. */
  lastAction?: string;
  /**
   * The events landed and the reading did not, so one is owed.
   *
   * Kept apart from rewinding the read position: the events are already on the
   * hosted side and need not be derived again, but the cumulative reading is
   * what every dial reads from, and without this it would stay stale until the
   * session next did something — which for a session that just finished is
   * never.
   */
  readingOwed?: boolean;
}

type ReadingClient = Pick<BridgeClient, 'streamEvents' | 'reportTelemetry'>;

/** An older installed bridge-client simply has no streaming. */
export function canSendReadings(client: Partial<ReadingClient>): client is ReadingClient {
  return typeof client.streamEvents === 'function' && typeof client.reportTelemetry === 'function';
}

/**
 * `failed` is distinct from `nothing` because the caller has to act on it: a
 * watcher that only looks again when the file grows would otherwise never
 * retry a batch that failed on a session's last write.
 */
export type ReadingOutcome = 'sent' | 'nothing' | 'failed';

/**
 * Derive, stream, report.
 *
 * Never throws: an instrument frame must not be able to disturb the session it
 * describes, or the sweep that is carrying it.
 */
export async function sendTranscriptReading(
  client: ReadingClient,
  target: ReadingTarget,
  at: { now: number; mtimeMs: number },
  onLog?: (line: string) => void,
): Promise<ReadingOutcome> {
  const before = target.tail ? structuredClone(target.tail) : undefined;
  target.tail ??= initialTailState();
  const tokensBefore = before?.usage ? totalTokens(before.usage.totals) : -1;

  const derived = tailTranscript(target.transcriptPath, target.tail, target.cwd);

  if (derived.length > 0) {
    const sent = await client.streamEvents(target.sessionId, derived);
    if (!sent) {
      /**
       * Put the read position back.
       *
       * The tailer advances its byte offset as it derives, so a batch that
       * failed to land was simply gone: the next tick started after it and
       * the log line promising to "catch up" was not true. Rewinding makes it
       * true — the same events are derived again under the same ordinals, and
       * the hosted side already treats a redelivered ordinal as a no-op.
       */
      target.tail = before;
      onLog?.(`stream for ${target.label} did not land; will catch up next tick`);
      return 'failed';
    }
  }

  /**
   * The reading is sent when there is something new to read, and tokens count
   * as new. A response that only thinks and writes prose derives no events, and
   * gating this on events alone would leave the token figure stale for exactly
   * the turns that spend the most.
   *
   * Every field is CUMULATIVE for the session. `filesTouched` used to be the
   * files in this tick's batch, so the hosted row — one per session,
   * overwritten — showed whatever the last minute happened to touch rather
   * than what the session had changed.
   */
  const usage = target.tail.usage?.totals;
  const tokensNow = usage ? totalTokens(usage) : -1;
  if (derived.length === 0 && tokensNow === tokensBefore && !target.readingOwed) return 'nothing';

  const latest = derived[derived.length - 1];
  if (latest) {
    target.lastAction = latest.path
      ? `${latest.tool} · ${latest.path.split('/').slice(-2).join('/')}`
      : latest.tool;
  }

  const landed = await client.reportTelemetry(target.sessionId, {
    toolCalls: target.tail.seq,
    writeCalls: target.tail.writeCalls ?? 0,
    filesTouched: target.tail.written ?? [],
    // Remembered, not re-derived: the hosted row is replaced whole, so a
    // tokens-only update that omitted this would blank the line that says what
    // the session is doing.
    ...(target.lastAction ? { currentAction: target.lastAction } : {}),
    ...(usage
      ? {
          tokensIn: usage.input,
          tokensOut: usage.output,
          tokensCacheRead: usage.cacheRead,
          tokensCacheWrite: usage.cacheWrite,
          turns: target.tail.usage?.turns,
          // Our arithmetic at API list prices, each model's tokens at its own
          // rate. Not a bill: a subscription was not charged this, and the
          // hosted plane labels it so.
          costUsd: Math.min(Number(priceMeter(target.tail.usage!).toFixed(4)), 10_000),
          costEstimated: true,
          ...(dominantModel(target.tail.usage!) ? { model: dominantModel(target.tail.usage!)! } : {}),
        }
      : {}),
    elapsedMs: Math.round(target.tail.activeMs),
    // mtimeMs is fractional on macOS; the schema's int() refuses a float and
    // the client swallows the 400 — a silently empty table.
    idleMs: Math.round(Math.max(0, at.now - at.mtimeMs)),
  });
  target.readingOwed = !landed;
  if (!landed) {
    onLog?.(`reading for ${target.label} did not land; will send it again next tick`);
    return 'failed';
  }
  return 'sent';
}
