import type { BridgeClient } from '@devpilot.sh/bridge-client';

/**
 * Closes the loop: a conductor run that finishes reports completion to the
 * bridge, which is what makes the hosted side write back to Linear.
 *
 * ## Why this exists separately from the handler
 *
 * The single-session path reports completion through the orchestrator's status
 * poller, which lives in the bridge process for exactly as long as the session
 * does. The planned path has no equivalent: the handler must RETURN at the
 * review gate (holding a queue claim while a human deliberates is invisible work
 * that the stale sweep re-runs), and the run then continues under the cockpit
 * for minutes or hours afterwards. So without something watching, a planned
 * ticket runs to completion and Linear is never told — the loop the user sees
 * simply stops.
 *
 * `POST /api/sessions/:id/complete` already calls `syncSessionCompletionToLinear`
 * hosted-side. This is the missing caller, not a new mechanism.
 *
 * ## What it deliberately does not do
 *
 * It does not persist. A watcher lost to a process restart is a run whose
 * completion is never reported, and the honest fix for that is reconciliation on
 * startup against the bridge's own list of non-terminal sessions — a larger
 * change that belongs with the bridge client, not smuggled in here. Until then
 * `onLost` fires for anything still being watched at shutdown so the gap is
 * visible rather than silent.
 */

export interface ConductorState {
  status?: string;
  awaiting?: 'review' | 'wave' | null;
  completedWaves?: number[];
  errors?: string[];
  review?: { plan?: { waves?: { tasks?: unknown[] }[] } } | null;
}

export interface WatchedRun {
  /** Bridge session id — what completion is reported against. */
  sessionId: string;
  /** Cockpit horizon item whose conductor run this is. */
  itemId: string;
  linearIdentifier: string;
}

export interface ConductorWatcherOptions {
  client: BridgeClient;
  cockpitUrl: string;
  /** How often to ask the cockpit for run state. Default 30s. */
  pollIntervalMs?: number;
  onLog?: (line: string) => void;
  /** Called for runs still unfinished when the watcher stops. */
  onLost?: (run: WatchedRun) => void;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

const TERMINAL = new Set(['complete', 'failed']);

export class ConductorWatcher {
  private readonly runs = new Map<string, WatchedRun>();
  private timer: NodeJS.Timeout | null = null;
  private readonly base: string;
  private readonly interval: number;
  private readonly log: (line: string) => void;
  private readonly doFetch: typeof fetch;

  constructor(private readonly opts: ConductorWatcherOptions) {
    this.base = opts.cockpitUrl.replace(/\/$/, '');
    this.interval = opts.pollIntervalMs ?? 30_000;
    this.log = opts.onLog ?? (() => {});
    this.doFetch = opts.fetchImpl ?? fetch;
  }

  /** Begin watching a run. Idempotent per bridge session. */
  watch(run: WatchedRun): void {
    if (this.runs.has(run.sessionId)) return;
    this.runs.set(run.sessionId, run);
    this.log(`watching ${run.linearIdentifier} (${this.runs.size} tracked)`);
    this.start();
  }

  private start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.sweep(), this.interval);
    // Never hold the process open on this timer alone.
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    for (const run of this.runs.values()) this.opts.onLost?.(run);
    this.runs.clear();
  }

  /** Exposed for tests and for an immediate check after handing off a run. */
  async sweep(): Promise<void> {
    for (const run of [...this.runs.values()]) {
      try {
        await this.check(run);
      } catch (err) {
        // A cockpit that is down or restarting must not kill the watcher; the
        // next sweep retries. Losing the loop is worse than a noisy log.
        this.log(
          `${run.linearIdentifier}: state check failed (${
            err instanceof Error ? err.message : String(err)
          })`
        );
      }
    }
    if (this.runs.size === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async check(run: WatchedRun): Promise<void> {
    const res = await this.doFetch(`${this.base}/api/items/${run.itemId}/conductor`);
    if (!res.ok) throw new Error(`conductor state → ${res.status}`);

    const state = (await res.json()) as ConductorState;
    if (!state.status || !TERMINAL.has(state.status)) return;

    const success = state.status === 'complete';
    const waves = state.completedWaves?.length ?? 0;
    const tasks =
      state.review?.plan?.waves?.reduce((n, w) => n + (w.tasks?.length ?? 0), 0) ?? 0;

    const summary = success
      ? `DevPilot completed ${waves} wave${waves === 1 ? '' : 's'}` +
        (tasks ? ` covering ${tasks} task${tasks === 1 ? '' : 's'}.` : '.')
      : `DevPilot run failed: ${state.errors?.[state.errors.length - 1] ?? 'unknown error'}`;

    // Remove BEFORE reporting: if the report throws, the run is not re-reported
    // on the next sweep. Linear comments are not idempotent, and a flapping
    // cockpit would otherwise post the same comment repeatedly.
    this.runs.delete(run.sessionId);

    await this.opts.client.reportSessionComplete(run.sessionId, {
      success,
      summary,
      ...(success ? {} : { errorMessage: summary }),
    });

    this.log(`${run.linearIdentifier}: reported ${success ? 'complete' : 'failed'} to the bridge`);
  }

  /** Test/introspection helper. */
  get tracked(): number {
    return this.runs.size;
  }
}
