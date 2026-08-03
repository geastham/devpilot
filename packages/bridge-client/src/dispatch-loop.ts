import type { TaskDispatchMessage } from '@devpilot.sh/bridge-protocol';
import type { BridgeClient } from './client';
import { RealtimeSubscriber } from './realtime';

export type DispatchHandler = (message: TaskDispatchMessage) => Promise<void>;

export interface DispatchLoopConfig {
  client: BridgeClient;
  orchestratorId: string;
  handler: DispatchHandler;
  /** Realtime credentials from register(). Absent => poll-only. */
  realtime?: { supabaseUrl: string; anonKey: string; jwt: string } | null;
  /** Safety-net sweep interval. Also the poll interval when Realtime is off. */
  sweepIntervalMs?: number;
  maxConcurrent?: number;
  onLog?: (line: string) => void;
  onError?: (err: Error) => void;
}

/**
 * Where the delivery guarantee lives — TRD 05 §3.2, §6.5.
 *
 * Realtime tells us to look sooner. The SWEEP is what makes delivery
 * at-least-once: on start, on every reconnect, and on a timer, we ask the
 * bridge for unclaimed rows. A dispatch that arrived while the process was
 * down, or whose Realtime event was dropped, is still sitting in the table.
 *
 * Turn Realtime off entirely and this class is still correct — only slower.
 * That property is why `--transport poll` is a supported mode rather than a
 * degraded fallback.
 */
export class DispatchLoop {
  private subscriber: RealtimeSubscriber | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private sweeping = false;
  /** Claimed and not yet settled — used only to respect maxConcurrent. */
  private readonly inFlight = new Set<string>();

  constructor(private readonly config: DispatchLoopConfig) {}

  get activeJobs(): number {
    return this.inFlight.size;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    if (this.config.realtime) {
      this.subscriber = new RealtimeSubscriber({
        supabaseUrl: this.config.realtime.supabaseUrl,
        anonKey: this.config.realtime.anonKey,
        jwt: this.config.realtime.jwt,
        orchestratorId: this.config.orchestratorId,
        onNotify: (queueId) => void this.take(queueId),
        onReconnect: () => void this.sweep(),
        onError: (err) => {
          // A Realtime failure is a latency problem, not a correctness one:
          // the sweep timer keeps running and work still gets picked up.
          this.config.onLog?.(`realtime: ${err.message} — continuing on the sweep timer`);
        },
      });

      try {
        await this.subscriber.start();
      } catch (err) {
        this.config.onLog?.(
          `realtime unavailable (${err instanceof Error ? err.message : String(err)}); polling instead`,
        );
        this.subscriber = null;
      }
    }

    const interval = this.config.sweepIntervalMs ?? (this.subscriber ? 30_000 : 5_000);
    this.timer = setInterval(() => void this.sweep(), interval);
    await this.sweep();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.subscriber) await this.subscriber.stop();
    this.subscriber = null;
  }

  /** Ask for unclaimed work and take what we have capacity for. */
  async sweep(): Promise<void> {
    if (!this.running || this.sweeping) return;
    this.sweeping = true;
    try {
      const messages = await this.config.client.poll();
      for (const message of messages) {
        if (!this.hasCapacity()) break;
        await this.take(message.queueId);
      }
    } catch (err) {
      this.config.onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.sweeping = false;
    }
  }

  private hasCapacity(): boolean {
    return this.inFlight.size < (this.config.maxConcurrent ?? 4);
  }

  /**
   * Claim then run. The claim is server-side and conditional, so losing a race
   * is a normal outcome (null) rather than an error — that is how two machines
   * can watch the same queue safely.
   */
  private async take(queueId: string): Promise<void> {
    if (!this.running || !this.hasCapacity() || this.inFlight.has(queueId)) return;

    let message: TaskDispatchMessage | null;
    try {
      message = await this.config.client.claim(queueId);
    } catch (err) {
      this.config.onError?.(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    if (!message) return; // someone else won it

    this.inFlight.add(queueId);
    try {
      await this.config.handler(message);
    } catch (err) {
      // The handler is contracted never to throw. If one does anyway, release
      // the row rather than leaving it claimed until the stale sweep — a
      // stranded claim is invisible work.
      const reason = err instanceof Error ? err.message : String(err);
      this.config.onError?.(new Error(`handler threw for ${message.linearIdentifier}: ${reason}`));
      try {
        await this.config.client.release(queueId, reason);
      } catch {
        /* the server-side stale sweep will reclaim it */
      }
    } finally {
      this.inFlight.delete(queueId);
    }
  }
}
