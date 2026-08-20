import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
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
 * ## Surviving a restart
 *
 * It used to hold runs in memory only, so a restarted bridge orphaned anything
 * in flight: the run kept going in the cockpit, and Linear was never told how it
 * ended. Observed on AVA-10 — the bridge was restarted to pick up a new CLI, the
 * session was never re-claimed, and the ticket was left showing an error for a
 * run that had not actually failed.
 *
 * The tracked set is now mirrored to disk. The bridge is the only party that
 * can do this: the hosted plane records the session but never learns the cockpit
 * item id, so it cannot reconstruct what to poll.
 *
 * Restored entries are treated as claims to verify, not as truth. A run whose
 * item the cockpit no longer knows about is dropped rather than polled forever,
 * because stale local state must not outlive the thing it describes.
 */

export interface ConductorState {
  status?: string;
  awaiting?: 'review' | 'wave' | null;
  completedWaves?: number[];
  errors?: string[];
  review?: { plan?: { waves?: { tasks?: unknown[] }[] } } | null;
  currentWaveIndex?: number;
  score?: { parallelizationScore?: number } | null;
  lastDispatch?: { dispatched?: number; queued?: number } | null;
}

/**
 * A one-line description of where a run currently is, plus a signature used to
 * suppress repeats. Returns null when there is nothing worth saying.
 */
function progressReport(
  state: ConductorState
): { signature: string; message: string; percent: number } | null {
  if (state.awaiting === 'review') {
    const waves = state.review?.plan?.waves?.length ?? 0;
    const tasks =
      state.review?.plan?.waves?.reduce((n, w) => n + (w.tasks?.length ?? 0), 0) ?? 0;
    const pct = Math.round((state.score?.parallelizationScore ?? 0) * 100);
    return {
      signature: 'review',
      message:
        `Plan ready — ${waves} wave${waves === 1 ? '' : 's'}, ${tasks} task${tasks === 1 ? '' : 's'}, ` +
        `${pct}% parallel. Approve it in the DevPilot cockpit to dispatch, or reply here with ` +
        `constraints to re-plan. Awaiting review.`,
      percent: 40,
    };
  }

  if (state.status === 'executing') {
    const wave = state.currentWaveIndex ?? 0;
    const done = state.completedWaves?.length ?? 0;
    const d = state.lastDispatch?.dispatched ?? 0;
    const q = state.lastDispatch?.queued ?? 0;
    return {
      signature: `wave:${wave}:${done}:${d}:${q}`,
      message:
        `Dispatching wave ${wave + 1}` +
        (d || q ? ` — ${d} agent${d === 1 ? '' : 's'} running, ${q} queued.` : '.'),
      percent: Math.min(60 + done * 15, 95),
    };
  }

  return null;
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
  /**
   * File the tracked set is mirrored to. Omit to keep the old in-memory-only
   * behaviour, which is what the tests use unless they are testing persistence.
   */
  statePath?: string;
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
  /** Last progress signature reported per session, so we do not repeat ourselves. */
  private readonly reported = new Map<string, string>();
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
    this.persist();
    this.log(`watching ${run.linearIdentifier} (${this.runs.size} tracked)`);
    this.start();
  }

  /**
   * Re-adopt runs left behind by a previous process.
   *
   * Restored runs are claims, not facts — `check` verifies each against the
   * cockpit on the next sweep and drops any whose item has gone. Returns how
   * many were adopted so the caller can say so.
   */
  restore(): number {
    const path = this.opts.statePath;
    if (!path || !existsSync(path)) return 0;

    let entries: WatchedRun[] = [];
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
      // A corrupt or hand-edited file must not stop the bridge from starting;
      // losing the watch list degrades write-back, refusing to boot loses
      // everything.
      if (Array.isArray(parsed)) {
        entries = parsed.filter(
          (e): e is WatchedRun =>
            Boolean(e) &&
            typeof (e as WatchedRun).sessionId === 'string' &&
            typeof (e as WatchedRun).itemId === 'string'
        );
      }
    } catch {
      return 0;
    }

    let adopted = 0;
    for (const run of entries) {
      if (this.runs.has(run.sessionId)) continue;
      this.runs.set(run.sessionId, run);
      adopted++;
    }
    if (adopted > 0) this.start();
    return adopted;
  }

  /** Mirror the tracked set to disk. Never throws — this is bookkeeping. */
  private persist(): void {
    const path = this.opts.statePath;
    if (!path) return;
    try {
      if (this.runs.size === 0) {
        if (existsSync(path)) unlinkSync(path);
        return;
      }
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify([...this.runs.values()], null, 2), 'utf8');
    } catch {
      // A bridge that cannot write its watch list still works for this process.
    }
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

    if (res.status === 404) {
      /**
       * The cockpit has no run for this item. For a restored entry that means
       * the item is gone — the database was reset, or the run was cleaned up
       * while this bridge was down. Polling it forever would keep a dead
       * session on the books and re-log the same failure every sweep.
       *
       * Drop it and say so. Reporting completion would be worse: we do not
       * know how it ended, and inventing an outcome for a Linear ticket is
       * exactly the kind of confident wrongness this write-back must not do.
       */
      this.runs.delete(run.sessionId);
      this.reported.delete(run.sessionId);
      this.persist();
      this.log(
        `${run.linearIdentifier}: no conductor run on the cockpit — dropped (was it reset?)`
      );
      return;
    }

    if (!res.ok) throw new Error(`conductor state → ${res.status}`);

    const state = (await res.json()) as ConductorState;

    if (!state.status || !TERMINAL.has(state.status)) {
      /**
       * Report progress while the run is still going.
       *
       * This used to return here, saying nothing until the run reached a
       * terminal state. A conductor run takes minutes to hours, so the Linear
       * agent session sat silent from the moment it was claimed — and Linear
       * marks an agent that stops emitting activities as unresponsive.
       * Observed on AVA-10: one "picking this up" thought, then thirty minutes
       * of nothing, then "Stopped responding" on the ticket while the planner
       * was working normally the whole time.
       *
       * The review gate matters most. The run is blocked on a human, and the
       * person who delegated the issue is reading the issue, not watching a
       * cockpit they may not know exists. Saying so there turns a dead-looking
       * session into a question they can answer.
       */
      const progress = progressReport(state);
      if (progress && this.reported.get(run.sessionId) !== progress.signature) {
        this.reported.set(run.sessionId, progress.signature);
        try {
          await this.opts.client.reportSessionStatus(run.sessionId, {
            status: 'running',
            progressPercent: progress.percent,
            message: progress.message,
          });
          this.log(`${run.linearIdentifier}: ${progress.message}`);
        } catch (err) {
          // Never let a failed narration drop the run from tracking.
          this.reported.delete(run.sessionId);
          this.log(
            `${run.linearIdentifier}: progress report failed (${
              err instanceof Error ? err.message : String(err)
            })`
          );
        }
      }
      return;
    }

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
    this.reported.delete(run.sessionId);
    this.persist();

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
