import { statSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { BridgeClient } from '@devpilot.sh/bridge-client';

/**
 * Keeping an adopted session's status honest — TRD 21 §6.6.
 *
 * The counterpart to `ConductorWatcher`, and deliberately the same shape: a
 * disk-backed set of things to check, restored on start, where a restored entry
 * is a CLAIM TO VERIFY rather than truth. That posture exists because the
 * alternative was observed in production — a restarted bridge orphaned every
 * in-flight run and Linear was never told how any of it ended.
 *
 * ## What this watcher can and cannot know
 *
 * It has no session handle. It cannot ask the agent anything. All it observes is
 * a file's mtime, so it reports exactly two things:
 *
 *   - the transcript grew → the session is still going
 *   - the transcript has been still for a while → the session stopped
 *
 * "Stopped" is not "finished", and §3.4 turns that distinction into behaviour:
 * the completion this posts carries `moveToDone: false` at the hosted end, so
 * a settling session comments on the ticket and leaves its state alone.
 *
 * ## Why progress is always zero
 *
 * A dispatched session has a plan, so a percentage has a denominator. An adopted
 * session has none. Reporting a made-up fraction would put a number on the board
 * that looks measured and is not, so elapsed time goes in the message and
 * `progressPercent` stays 0.
 */

export interface AdoptionLedgerEntry {
  adoptionKey: string;
  /** `dispatch_sessions.id` on the hosted plane. */
  sessionId: string;
  identifier: string;
  transcriptPath: string;
  repo: string;
  startedAt: string;
  lastMtimeMs: number;
  lastReportedAt: string;
  settled: boolean;
}

interface Ledger {
  version: 1;
  entries: Record<string, AdoptionLedgerEntry>;
}

export interface AdoptionWatcherConfig {
  client: BridgeClient;
  statePath: string;
  /** How long a transcript must be still before the session is called stopped. */
  settleAfterMs?: number;
  tickMs?: number;
  onLog?: (line: string) => void;
}

const DEFAULT_SETTLE_MS = 30 * 60 * 1000;
const DEFAULT_TICK_MS = 60_000;

export class AdoptionWatcher {
  private entries = new Map<string, AdoptionLedgerEntry>();
  private timer: NodeJS.Timeout | null = null;
  private readonly settleAfterMs: number;
  private readonly tickMs: number;

  constructor(private readonly config: AdoptionWatcherConfig) {
    this.settleAfterMs = config.settleAfterMs ?? DEFAULT_SETTLE_MS;
    this.tickMs = config.tickMs ?? DEFAULT_TICK_MS;
  }

  /** Begin watching a freshly adopted session. */
  track(entry: AdoptionLedgerEntry): void {
    this.entries.set(entry.adoptionKey, entry);
    this.persist();
    this.start();
  }

  /**
   * Re-adopt entries left behind by a previous process.
   *
   * Entries whose transcript no longer exists are dropped rather than polled
   * forever: stale local state must not outlive the thing it describes.
   */
  restore(): number {
    try {
      if (!existsSync(this.config.statePath)) return 0;
      const parsed = JSON.parse(readFileSync(this.config.statePath, 'utf8')) as Ledger;
      if (parsed?.version !== 1 || !parsed.entries) return 0;

      let restored = 0;
      for (const entry of Object.values(parsed.entries)) {
        if (entry.settled) continue;
        if (!existsSync(entry.transcriptPath)) continue;
        this.entries.set(entry.adoptionKey, entry);
        restored++;
      }
      if (restored > 0) this.start();
      return restored;
    } catch {
      // A corrupt ledger must not stop a bridge from connecting.
      return 0;
    }
  }

  size(): number {
    return [...this.entries.values()].filter((e) => !e.settled).length;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.sweep(), this.tickMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.persist();
  }

  /** One pass. Never throws: a reporting failure is retried on the next tick. */
  async sweep(now = Date.now()): Promise<void> {
    for (const entry of [...this.entries.values()]) {
      if (entry.settled) continue;

      let mtimeMs: number;
      try {
        mtimeMs = statSync(entry.transcriptPath).mtimeMs;
      } catch {
        // The transcript is gone — the session's history was deleted. There is
        // nothing left to observe and nothing truthful left to say about it.
        this.entries.delete(entry.adoptionKey);
        this.persist();
        continue;
      }

      if (mtimeMs > entry.lastMtimeMs) {
        entry.lastMtimeMs = mtimeMs;
        entry.lastReportedAt = new Date(now).toISOString();
        this.persist();

        try {
          await this.config.client.reportSessionStatus(entry.sessionId, {
            status: 'running',
            progressPercent: 0,
            message: `Still running on this machine — ${elapsed(entry.startedAt, now)} so far`,
          });
        } catch (err) {
          this.config.onLog?.(
            `could not report ${entry.identifier}: ${err instanceof Error ? err.message : err}`,
          );
        }
        continue;
      }

      if (now - mtimeMs < this.settleAfterMs) continue;

      try {
        await this.config.client.reportSessionComplete(entry.sessionId, {
          success: true,
          summary:
            `The session stopped writing after ${elapsed(entry.startedAt, mtimeMs)}. ` +
            'DevPilot observed it rather than running it, so whether the work is finished ' +
            'is not something it can say.',
        });
        entry.settled = true;
        this.persist();
        this.config.onLog?.(`${entry.identifier} went quiet — reported, ticket left as it was`);
      } catch (err) {
        this.config.onLog?.(
          `could not settle ${entry.identifier}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    if (this.size() === 0) this.stop();
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.config.statePath), { recursive: true });
      const ledger: Ledger = { version: 1, entries: Object.fromEntries(this.entries) };
      writeFileSync(this.config.statePath, JSON.stringify(ledger, null, 2), 'utf8');
    } catch {
      // Unwritable state means a restart loses track, which the hosted stale
      // view already tolerates. It must never break a live run.
    }
  }
}

function elapsed(startedAt: string, endMs: number): string {
  const ms = endMs - Date.parse(startedAt);
  if (!Number.isFinite(ms) || ms < 0) return 'an unknown time';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hour${hours === 1 ? '' : 's'}` : `${hours}h ${rest}m`;
}
