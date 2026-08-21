import chalk from 'chalk';
import type { BridgeClient } from '@devpilot.sh/bridge-client';
import { runScanPipeline } from '../sessions/scan-pipeline';

/**
 * Keeping the cockpit live — TRD 22 §8.
 *
 * The bridge re-scans this machine on a cadence and reports what it sees. That
 * is the whole of what makes "turn it on and your sessions are there" true:
 * without a sweep, observation is a snapshot taken at connect time that decays
 * into a list of agents that finished hours ago.
 *
 * ## Why this is safe to run by default, and adoption is not
 *
 * An observation writes to the caller's own organization and creates nothing
 * outside it: no Linear issue, no queue row, no routing decision, no capability.
 * Adoption creates issues on a board a whole team reads, which is why it stays
 * behind a flag and a confirmation.
 *
 * ## Why it reports endings explicitly
 *
 * A session that stops between two sweeps would otherwise stay `running` in the
 * cockpit forever. Each sweep sends the keys it no longer sees live, so the
 * board reflects the machine rather than the high-water mark of the machine. A
 * confidently wrong "11 agents running" is worse than an empty page.
 */

export interface ObserverConfig {
  client: BridgeClient;
  machineName: string;
  repos: string[];
  /** Observe every repo, not only routed ones. Default true — see below. */
  allRepos?: boolean;
  intervalMs?: number;
  /** How far back a session counts as worth reporting. */
  sinceMs?: number;
  onLog?: (line: string) => void;
}

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_SINCE_MS = 24 * 60 * 60 * 1000;

export class SessionObserver {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  /** Adoption keys reported live on the previous sweep. */
  private lastLive = new Set<string>();
  private readonly intervalMs: number;
  private readonly sinceMs: number;

  constructor(private readonly config: ObserverConfig) {
    this.intervalMs = config.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.sinceMs = config.sinceMs ?? DEFAULT_SINCE_MS;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.sweep(), this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * One pass. Never throws, and never overlaps itself.
   *
   * A scan on a large machine takes most of a second and `git status` can take
   * longer; without the guard a slow sweep would stack behind the interval and
   * the machine would spend its life scanning itself.
   */
  async sweep(): Promise<{ observed: number; ended: number } | null> {
    if (this.running) return null;
    this.running = true;

    try {
      const result = await runScanPipeline({
        machineName: this.config.machineName,
        repos: this.config.repos,
        /**
         * Observation defaults to EVERY repo, unlike placement.
         *
         * TRD 21 §3.5 narrowed adoption to routed repos because it pushes repo
         * names onto a shared Linear board, and one client's names must not
         * reach another client's workspace. Observation has no such reach: it
         * writes only into the org that already receives the full repo
         * inventory from discovery, so restricting it here would buy no privacy
         * and would leave the cockpit empty for anyone who has not routed
         * anything yet — which is everyone, on day one.
         */
        allRepos: this.config.allRepos !== false,
        sinceMs: this.sinceMs,
        includePaths: true,
        maxSummaries: 0,
        // No model call on a sweep that runs every minute. The client's own
        // session titles are already good, and paying per minute for a nicer
        // one would be an absurd trade.
        summarize: false,
      });

      const live = new Set(result.candidates.filter((c) => c.live).map((c) => c.adoptionKey));
      const ended = [...this.lastLive].filter((key) => !live.has(key));

      const response = await this.config.client.reportObservations({
        machineName: this.config.machineName,
        sessions: result.candidates,
        endedKeys: ended,
      });

      this.lastLive = live;

      if (response) {
        return { observed: response.observed, ended: response.ended };
      }
      return null;
    } catch (err) {
      this.config.onLog?.(
        chalk.gray(`observation sweep failed: ${err instanceof Error ? err.message : err}`),
      );
      return null;
    } finally {
      this.running = false;
    }
  }
}
