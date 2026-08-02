import type { BridgeClient } from './client';

export interface HeartbeatConfig {
  client: BridgeClient;
  intervalMs?: number;
  /** Reports current load so the bridge can respect concurrency limits. */
  activeJobs?: () => number;
  onError?: (err: Error) => void;
}

/**
 * Periodic liveness. The portal derives online/offline from heartbeat recency
 * rather than trusting a boolean, so stopping this makes a machine go stale
 * rather than lying about being online forever.
 */
export class HeartbeatService {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly config: HeartbeatConfig) {}

  start(): void {
    if (this.timer) return;
    const interval = this.config.intervalMs ?? 30_000;
    const beat = async () => {
      try {
        await this.config.client.heartbeat(this.config.activeJobs?.());
      } catch (err) {
        // Never throw out of a timer: an unhandled rejection here would take
        // down a long-running connect session over a transient network blip.
        this.config.onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    };
    this.timer = setInterval(beat, interval);
    void beat();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
