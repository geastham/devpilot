/**
 * Resume a suspended conductor run when its current wave has something to say.
 *
 * The graph `interrupt()`s after dispatching a wave rather than holding a
 * promise open for the hour a fleet of agents might take. Something has to wake
 * it, and that something is the execution bridge: this module is the
 * `WaveDriver` the bridge notifies (see `src/lib/orchestrator.ts`) after it has
 * recorded a task's new state, and again whenever its reconciler checks in.
 *
 * It is deliberately thin. WHETHER a wave is over, needs a backfill pass, or
 * should be left alone is decided in core (`signalForDriver`), where it is
 * tested against a real database — and where, for a plan whose tasks each have
 * their own branch, the wave is merged before it is called over. This file
 * only checks that the run is in fact waiting on that wave, asks, and resumes
 * it with the answer. It never throws into
 * the callback path: a completion report that fails to advance a graph must
 * still record the session, release its file locks and return 200; the
 * alternative is an agent that finished successfully being reported as a failed
 * callback and retried for ten minutes.
 */

import { Command } from '@devpilot.sh/conductor-agent';
import { WaveDispatchCoordinator, WaveExecutionController } from '@devpilot.sh/core/wave-planner';
import { db, wavePlans, eq } from '@/lib/db';
import { getConductorGraph, threadFor } from './conductor-graph';
import { getServerOrchestrator, getWaveExecutionConfig } from './orchestrator';
import { recordRun } from './conductor-memory';

export interface WaveSettlement {
  resumed: boolean;
  reason?: string;
}

const globalForRuns = globalThis as unknown as {
  devpilotConductorRuns?: Map<string, Promise<unknown>>;
  devpilotConductorReentered?: Set<string>;
};

/**
 * The nodes a run may be re-entered at after it was cut off inside one.
 *
 * Everything from `dispatch` onwards: each is safe to run again (dispatch is
 * idempotent, the rest move a counter or record an ending conditionally).
 * Nothing before it is listed. `generate` and `refine` are paid model calls and
 * `persist` writes a new wave plan every time it runs; a run cut off there is
 * left for a person to restart.
 */
const REENTERABLE_NODES = new Set(['dispatch', 'awaitWave', 'advance', 'retryWave', 'finish', 'fail']);

/**
 * Run one thing at a time per conductor run.
 *
 * A LangGraph thread is not safe to invoke concurrently, and this app invokes
 * it from several places that know nothing of each other: the conductor route
 * (start, review decision), the execution bridge on every task that settles,
 * and the reconciler's timer. Two completions landing together used to mean two
 * `getState` calls that both saw the run waiting on the wave, and two resumes.
 *
 * The check "is the run waiting on this wave?" is only meaningful if nothing
 * else can move the run between the check and the resume, so the check has to
 * happen inside the lock — and so does every other invoke, which is why the
 * route takes it too. Held on `globalThis` for the reason the graph is: Next's
 * route isolation would otherwise give each route its own map.
 *
 * In-process only. That is sufficient because the graph is: one cockpit, one
 * process, one checkpointer.
 */
export function withConductorRun<T>(itemId: string, run: () => Promise<T>): Promise<T> {
  const runs = (globalForRuns.devpilotConductorRuns ??= new Map());

  // `previous` is the settled tail stored below, which never rejects: whatever
  // the previous holder did, including throw, the next one runs.
  const previous = runs.get(itemId) ?? Promise.resolve();
  const result = previous.then(() => run());
  const settled = result.then(
    () => undefined,
    () => undefined
  );

  runs.set(itemId, settled);
  void settled.then(() => {
    if (runs.get(itemId) === settled) runs.delete(itemId);
  });

  return result;
}

/**
 * Whether the conductor graph is running this wave plan — the `owns` half of
 * the bridge's `WaveDriver`.
 *
 * Answered from the checkpoint, not from memory: the run for the plan's item
 * names the wave plan it is executing, and that survives a restart. A run that
 * has already ended still owns its plan, so that a straggling completion is
 * never handed to the legacy path to "advance".
 *
 * It throws if the checkpoint cannot be read. The bridge then does nothing for
 * that task change and records the fault, which is right: answering "not
 * owned" on a failed read would hand a graph-run plan to a second driver.
 */
export async function conductorOwns(wavePlanId: string): Promise<boolean> {
  const plan = await db.query.wavePlans.findFirst({ where: eq(wavePlans.id, wavePlanId) });
  if (!plan?.horizonItemId) return false;

  const snapshot = await getConductorGraph().getState(threadFor(plan.horizonItemId));
  return (snapshot.values as { wavePlanId?: string | null }).wavePlanId === wavePlanId;
}

/**
 * Look at a wave and, if the run is waiting on it and it has something to say,
 * resume the run with that — the `notify` half of the bridge's `WaveDriver`.
 *
 *  - The wave (or the whole plan) is over  → resume with how it ended. The
 *    graph advances, finishes, or fails.
 *  - The wave is still going but a dispatch pass could start something → resume
 *    with `in-flight`. The graph dispatches the same wave again and suspends
 *    again. This is the backfill that drains a wave larger than the concurrency
 *    cap, and the retry of a task that failed once; both are dispatches, and
 *    for a plan the graph runs, the graph makes them.
 *  - The run is not suspended at all, because it was cut off in the middle of
 *    a node (a restart during dispatch) → re-enter it at that node, once.
 *  - Otherwise → nothing.
 *
 * Idempotent, and called redundantly on purpose.
 */
export async function resumeConductorForTask(
  wavePlanId: string,
  waveIndex: number
): Promise<WaveSettlement> {
  try {
    const plan = await db.query.wavePlans.findFirst({
      where: eq(wavePlans.id, wavePlanId),
    });
    if (!plan?.horizonItemId) {
      return { resumed: false, reason: 'no owning horizon item' };
    }
    const itemId = plan.horizonItemId;

    return await withConductorRun(itemId, async () => {
      const graph = getConductorGraph();
      const thread = threadFor(itemId);

      const snapshot = await graph.getState(thread);
      const pending = snapshot.tasks.flatMap((t) => t.interrupts ?? []);

      /**
       * A run that was cut off INSIDE a node — the cockpit stopped while the
       * graph was dispatching a wave — has no pending interrupt, because it
       * never reached the node that waits. It is not waiting on anything, so
       * the check below would leave it alone, and so would everything else:
       * the tasks it had dispatched finished and were recorded, and the run
       * never moved again.
       *
       * It is re-entered here, where the check-in for its wave arrives — which
       * after a restart is the reconciler's start-up pass, and after a person
       * resumes a held plan is the next pass. Invoking with no input continues
       * from the last checkpoint, which re-runs the node that was cut off; that
       * is safe now that dispatch claims each task (a task already with an
       * agent is not sent to a second one).
       *
       * Inside the run lock, "no interrupt and a next node" can only mean the
       * run was abandoned mid-node: nothing else is invoking it. Once per run
       * per process — a node that fails for a reason that is still true would
       * otherwise be re-run, and fail, at every check-in.
       *
       * The start-up guard against waking an old run applies here without
       * being repeated: this is reached from the bridge's `settle`, which the
       * start-up pass does not call for a plan it has held as stale.
       */
      const cutOff =
        pending.length === 0 &&
        snapshot.next.length > 0 &&
        snapshot.next.every((node) => REENTERABLE_NODES.has(node)) &&
        (snapshot.values as { wavePlanId?: string | null }).wavePlanId === wavePlanId;

      if (cutOff) {
        const reentered = (globalForRuns.devpilotConductorReentered ??= new Set());
        if (reentered.has(wavePlanId)) {
          return {
            resumed: false,
            reason: `run was cut off at ${snapshot.next.join(', ')} and has already been re-entered once`,
          };
        }
        reentered.add(wavePlanId);

        const result = (await graph.invoke(null, thread)) as Record<string, unknown>;
        if (result.status === 'complete' || result.status === 'failed') {
          void recordRun(wavePlanId);
        }
        return { resumed: true, reason: `re-entered at ${snapshot.next.join(', ')} after being cut off` };
      }

      // Only resume a run that is actually suspended waiting for THIS wave.
      // Without this check a late duplicate callback would push a second resume
      // into a graph that had already advanced, and re-dispatch the next wave.
      //
      // It comes BEFORE the wave is asked about, and that order matters now.
      // Asking can merge the wave (see below), and a late callback about a wave
      // the run left behind must not start a merge of it: the operator may by
      // then have that run branch checked out, the runner would refuse, and a
      // harmless duplicate would have failed the plan.
      const waitingFor = pending
        .map((i) => (i.value as { waveIndex?: number } | undefined)?.waveIndex)
        .find((v) => v !== undefined);

      if (waitingFor !== waveIndex) {
        return {
          resumed: false,
          reason:
            waitingFor === undefined
              ? 'run is not waiting on a wave'
              : `run is waiting on wave ${waitingFor}, not ${waveIndex}`,
        };
      }

      // Asked inside the lock: the previous holder may have been the resume
      // that already acted on what this call was notified about.
      //
      // `signalForDriver`, not a reading of the rows. For a plan whose tasks
      // each have their own branch this is where the wave is merged into the
      // run branch — before the graph is told the wave is complete, and so
      // before it can dispatch the next one. A conflict comes back as
      // `backfill` (the task is owed a retry); a merge that could not be done
      // comes back as `over`/failed, the plan already failed with the reason.
      const executionConfig = getWaveExecutionConfig();
      const signal = await new WaveExecutionController(
        executionConfig,
        new WaveDispatchCoordinator(executionConfig)
      ).signalForDriver(wavePlanId, waveIndex);

      if (signal.kind === 'wait') {
        return { resumed: false, reason: signal.reason };
      }
      if (signal.kind === 'merge') {
        // `signalForDriver` resolves this itself; it is not an answer a driver
        // is ever given. Named so that a new kind cannot fall through to a
        // resume.
        return { resumed: false, reason: 'the wave is waiting to be merged' };
      }

      // A backfill pass with no orchestrator to dispatch to starts nothing —
      // and the reconciler asks again every minute, so resuming for it would
      // write a round of checkpoints a minute, for as long as dispatch stays
      // disabled, to record that nothing happened.
      if (signal.kind === 'backfill' && !getServerOrchestrator().isEnabled) {
        return {
          resumed: false,
          reason: `${signal.dispatchable} task(s) queued; the orchestrator is disabled`,
        };
      }

      const result = (await graph.invoke(
        new Command({
          resume: signal.kind === 'over' ? signal.outcome : { state: 'in-flight' as const },
        }),
        thread
      )) as Record<string, unknown>;

      // The last wave's completion callback is what finishes most runs, so this
      // is the path that actually writes most run records.
      if (result.status === 'complete' || result.status === 'failed') {
        void recordRun(wavePlanId);
      }

      return { resumed: true, reason: signal.kind === 'over' ? signal.outcome.state : 'backfill' };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Conductor resume failed:', message);
    return { resumed: false, reason: message };
  }
}
