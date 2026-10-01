import { getDatabase } from '../../db';
import { wavePlans, waves, waveTasks, type WaveTask } from '../../db/schema/wave-planner';
import { horizonItems } from '../../db/schema/horizon';
import { activityEvents } from '../../db/schema/events';
import { eq, and, inArray, notInArray, isNull, lte, sql, type SQL } from 'drizzle-orm';
import { getOrchestratorServiceOrNull } from '../../orchestrator';
import { toActivityEventType } from './types';
import type { WaveExecutionConfig, DispatchResult, WaveSSEEvent } from './types';
import { WaveDispatchCoordinator } from './dispatch-coordinator';
import { collectFinalMetrics } from './auto-advance';
import {
  IN_FLIGHT_WAVE_TASK_STATUSES,
  TERMINAL_WAVE_PLAN_STATUSES,
  compareTaskCodes,
  isWaveOver,
  waveSignalFor,
  type SettledWave,
  type WaveSignal,
} from './wave-state';

/**
 * What a wave dispatch reports to the component driving the plan: the usual
 * counts, plus — when the wave is already over as dispatch returns — how it
 * ended. See `WaveExecutionController.driveWave`.
 */
export interface DrivenWave extends DispatchResult {
  settled?: SettledWave;
}

/** Which attempt a failure report is about. Pins the write to that attempt. */
export interface TaskAttemptRef {
  /** `wave_tasks.assignedSessionId` of the attempt that is reporting. */
  sessionId?: string;
  /**
   * When the attempt actually ended, if that is not "now".
   *
   * A failure applied by the reconciler is being RECORDED now, but it happened
   * when the session row says it did — possibly weeks ago, on a database that
   * was left with tasks in flight. Stamping it with the time of recording gave
   * such a task a duration of however long the cockpit had been switched off.
   */
  endedAt?: Date;
}

/**
 * What recording a failure did: the task is owed a retry, the task is
 * terminally failed, or the report changed nothing (a duplicate, or about an
 * attempt that is no longer the current one).
 */
export type TaskFailureOutcome = 'retrying' | 'failed' | 'ignored';

/**
 * WaveExecutionController
 *
 * Manages the lifecycle of wave plan execution with state machine transitions:
 * - draft → approved (on approve)
 * - approved → executing (on first dispatch)
 * - executing → paused (on pause)
 * - executing → completed (all waves done)
 * - executing → failed (task failure with halt policy)
 * - paused → executing (on resume)
 * - any → re-optimizing (on reoptimize request)
 *
 * WHO ADVANCES A PLAN. This class contains two kinds of method, and it matters
 * which is which:
 *
 *  - Effects, safe for anyone to call: `dispatchWave`, `driveWave`,
 *    `onTaskFailed`, `cancelTask`, `recordWaveIfOver`, `signalForDriver`,
 *    `completePlan`, `failPlan`. They record what happened and dispatch what
 *    they are asked to. None of them decides that a wave is over and the next
 *    one should start. (`signalForDriver` is how a driver finds out that one
 *    is; for an isolated plan it merges the wave before it says so.)
 *  - One decision: `handleWaveComplete`, which does decide that — it starts the
 *    next wave when `autoAdvance` is set and completes the plan after the last.
 *    It is the LEGACY driver, for a plan dispatched through
 *    `/api/wave-plans/:id/dispatch` with nothing else sequencing it. Its only
 *    callers are the `ExecutionBridge`, for a plan no `WaveDriver` owns, and
 *    `onTaskComplete` below, which itself has no caller.
 *
 * A plan the conductor graph is running is advanced by the graph, through
 * `driveWave` / `completePlan` / `failPlan`, and `handleWaveComplete` is never
 * called for it. Two components advancing one plan is how a task came to be
 * dispatched twice; see `WaveDriver` in `execution-bridge.ts`.
 */
export class WaveExecutionController {
  private config: WaveExecutionConfig;
  private dispatchCoordinator: WaveDispatchCoordinator;
  private db = getDatabase();

  constructor(config: WaveExecutionConfig, dispatchCoordinator: WaveDispatchCoordinator) {
    this.config = config;
    this.dispatchCoordinator = dispatchCoordinator;
  }

  /**
   * Approve a wave plan and dispatch wave 0
   * Transitions: draft → approved → executing
   */
  async approve(wavePlanId: string): Promise<void> {
    // Validate status is 'draft'
    const wavePlan = await this.db.query.wavePlans.findFirst({
      where: eq(wavePlans.id, wavePlanId),
    });

    if (!wavePlan) {
      throw new Error(`Wave plan ${wavePlanId} not found`);
    }

    if (wavePlan.status !== 'draft') {
      throw new Error(`Cannot approve wave plan in status: ${wavePlan.status}`);
    }

    // Update status to 'approved'
    await this.db.update(wavePlans)
      .set({
        status: 'approved',
        updatedAt: new Date(),
      })
      .where(eq(wavePlans.id, wavePlanId));

    // Dispatch wave 0
    await this.dispatchWave(wavePlanId, 0);
  }

  /**
   * Pause execution of a wave plan
   * Transitions: executing → paused
   * Does not cancel running tasks, just stops new dispatches
   */
  async pause(wavePlanId: string): Promise<void> {
    // Validate status is 'executing'
    const wavePlan = await this.db.query.wavePlans.findFirst({
      where: eq(wavePlans.id, wavePlanId),
    });

    if (!wavePlan) {
      throw new Error(`Wave plan ${wavePlanId} not found`);
    }

    if (wavePlan.status !== 'executing') {
      throw new Error(`Cannot pause wave plan in status: ${wavePlan.status}`);
    }

    // Update status to 'paused'
    await this.db.update(wavePlans)
      .set({
        status: 'paused',
        updatedAt: new Date(),
      })
      .where(eq(wavePlans.id, wavePlanId));
  }

  /**
   * Resume execution of a paused wave plan
   * Transitions: paused → executing
   * Dispatches current wave if not complete.
   * @returns the DispatchResult of the re-dispatched current wave, or null if
   *          the current wave was already complete (nothing re-dispatched).
   */
  async resume(wavePlanId: string): Promise<DispatchResult | null> {
    // Validate status is 'paused'
    const wavePlan = await this.db.query.wavePlans.findFirst({
      where: eq(wavePlans.id, wavePlanId),
      with: {
        waves: {
          with: {
            tasks: true,
          },
        },
      },
    });

    if (!wavePlan) {
      throw new Error(`Wave plan ${wavePlanId} not found`);
    }

    if (wavePlan.status !== 'paused') {
      throw new Error(`Cannot resume wave plan in status: ${wavePlan.status}`);
    }

    // Update status to 'executing'. The reason goes with the pause: the only
    // thing that writes one on a paused plan is `holdStalePlan`, and a person
    // resuming the plan is the answer to it.
    await this.db.update(wavePlans)
      .set({
        status: 'executing',
        failureReason: null,
        updatedAt: new Date(),
      })
      .where(eq(wavePlans.id, wavePlanId));

    // Dispatch current wave if not complete
    const currentWave = wavePlan.waves.find(w => w.waveIndex === wavePlan.currentWaveIndex);
    if (currentWave && currentWave.status !== 'completed') {
      return this.dispatchWave(wavePlanId, wavePlan.currentWaveIndex);
    }

    return null;
  }

  /**
   * Abort a wave plan execution
   * Transitions: any → failed
   * Marks pending tasks as 'skipped'
   */
  async abort(wavePlanId: string): Promise<void> {
    const wavePlan = await this.db.query.wavePlans.findFirst({
      where: eq(wavePlans.id, wavePlanId),
    });

    if (!wavePlan) {
      throw new Error(`Wave plan ${wavePlanId} not found`);
    }

    // Update status to 'failed'
    await this.db.update(wavePlans)
      .set({
        status: 'failed',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(wavePlans.id, wavePlanId));

    // Mark pending tasks as 'skipped'
    await this.db.update(waveTasks)
      .set({
        status: 'skipped',
      })
      .where(
        and(
          eq(waveTasks.wavePlanId, wavePlanId),
          eq(waveTasks.status, 'pending')
        )
      );
  }

  /**
   * Pause an executing plan that was found idle when the cockpit started, and
   * say why on the plan. Returns whether this call paused it.
   *
   * The plan is otherwise left exactly as it was — tasks, waves, wave pointer
   * and `updatedAt` included, so the time it has been idle stays readable from
   * the row. Paused is enough to stop anything being dispatched: the dispatch
   * claim requires an `executing` plan. It is the ordinary pause, undone the
   * ordinary way (`resume`), which also clears the reason.
   *
   * Called by the execution bridge's start-up pass and by nothing else; see
   * `ExecutionBridge.holdStalePlans` for why it exists.
   */
  async holdStalePlan(wavePlanId: string, lastActivity: Date): Promise<boolean> {
    const reason =
      `not resumed after a restart: no activity since ${lastActivity.toISOString()}. ` +
      `Resume it from the cockpit to continue.`;

    const held = await this.db.update(wavePlans)
      .set({ status: 'paused', failureReason: reason })
      .where(and(eq(wavePlans.id, wavePlanId), eq(wavePlans.status, 'executing')))
      .returning({ id: wavePlans.id });

    if (held.length === 0) {
      return false;
    }

    // In the feed as well as on the row. No wave event means "paused", so this
    // uses the type the cockpit's own pause writes.
    await this.db.insert(activityEvents).values({
      type: 'RUNWAY_UPDATE',
      message: `Wave plan paused — ${reason}`,
      metadata: { wavePlanId, held: 'stale', lastActivity: lastActivity.toISOString() },
    });

    return true;
  }

  /**
   * Dispatch a wave
   * Gets wave tasks and uses dispatch coordinator to dispatch what it can.
   * Updates wave status: pending → dispatching → active
   *
   * Safe to call repeatedly and concurrently for the same wave: it is also the
   * backfill pass (run again each time a slot frees) and the retry pass, and
   * the coordinator's per-task claim is what keeps a task from being sent
   * twice. Every write here is therefore conditional on being the FIRST — a
   * second call must not move the wave's status or its start time.
   */
  async dispatchWave(wavePlanId: string, waveIndex: number): Promise<DispatchResult> {
    // Get wave tasks
    const wavePlan = await this.db.query.wavePlans.findFirst({
      where: eq(wavePlans.id, wavePlanId),
      with: {
        waves: {
          with: {
            tasks: true,
          },
        },
      },
    });

    if (!wavePlan) {
      throw new Error(`Wave plan ${wavePlanId} not found`);
    }

    const wave = wavePlan.waves.find(w => w.waveIndex === waveIndex);
    if (!wave) {
      throw new Error(`Wave ${waveIndex} not found in plan ${wavePlanId}`);
    }

    // approved → executing, once. Conditional rather than "if the row I read
    // said approved": two callers can both have read `approved`.
    await this.db.update(wavePlans)
      .set({
        status: 'executing',
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(wavePlans.id, wavePlanId), eq(wavePlans.status, 'approved')));

    // pending → dispatching, on the wave's first dispatch only. This used to be
    // unconditional and to stamp `startedAt` with it, so every backfill pass
    // reset the wave's start time and flipped an `active` wave back to
    // `dispatching` — and re-dispatching a wave that had already failed
    // resurrected it. The start time is now written by the coordinator, once,
    // when the first task is actually dispatched.
    await this.db.update(waves)
      .set({ status: 'dispatching' })
      .where(and(eq(waves.id, wave.id), eq(waves.status, 'pending')));

    // Use dispatch coordinator to dispatch batch
    const result = await this.dispatchCoordinator.dispatchWave(
      wavePlanId,
      waveIndex,
      wave.tasks
    );

    // dispatching → active
    await this.db.update(waves)
      .set({ status: 'active' })
      .where(and(eq(waves.id, wave.id), eq(waves.status, 'dispatching')));

    // A task the orchestrator refused outright (not back-pressure — that is
    // queued) is terminally failed, and the coordinator has recorded it as
    // such. Whether it fails the plan is the failure policy's decision, and
    // this path used to skip it: the task was `failed`, the plan stayed
    // `executing`, and the wave could neither complete nor be reported.
    for (const failure of result.errors) {
      await this.applyFailurePolicy(wavePlanId, failure.taskCode, failure.error);
    }

    return result;
  }

  /**
   * Dispatch a wave on behalf of whoever is driving the plan, and say whether
   * there is anything to wait for.
   *
   * This is `dispatchWave` plus the two things a driver needs and the legacy
   * path does for itself: the plan's wave pointer is moved to this wave (the
   * cockpit and the hosted plane read the row, not a graph checkpoint), and the
   * result carries `settled` when the wave is ALREADY over.
   *
   * `settled` exists because "dispatch, then wait to be told the wave ended"
   * has a hole: if nothing was dispatched there is nothing that will ever
   * report, and the driver waits forever. That is exactly what happened when a
   * task failed its retry — the graph re-dispatched the wave, found no task
   * left to dispatch, and suspended on a wave whose every task was already
   * terminal. It is equally what would happen to a wave whose every task is
   * refused at dispatch, or to an empty one.
   */
  async driveWave(wavePlanId: string, waveIndex: number): Promise<DrivenWave> {
    const result = await this.dispatchWave(wavePlanId, waveIndex);

    // Any live plan, not only an executing one. A PAUSED plan dispatches
    // nothing here (the claim refuses), but the driver has still moved on to
    // this wave and will wait on it — and `resume()` re-dispatches whichever
    // wave the pointer names. Left pointing at the previous, finished wave,
    // resume would find nothing to do and the run would never move again. A
    // terminal plan keeps the pointer where it ended.
    await this.db.update(wavePlans)
      .set({ currentWaveIndex: waveIndex, updatedAt: new Date() })
      .where(
        and(
          eq(wavePlans.id, wavePlanId),
          notInArray(wavePlans.status, [...TERMINAL_WAVE_PLAN_STATUSES])
        )
      );

    await this.recordWaveIfOver(wavePlanId, waveIndex);

    // Through the gate, not straight from the rows: `settled` is the driver
    // being told the wave is over, and for an isolated plan that may only be
    // said once the wave is merged. This is the path a run takes when it comes
    // back from a restart to find its wave finished and not yet merged.
    const asked = await this.settleSignal(wavePlanId, waveIndex);
    let signal = asked.signal;

    // The merge just done found a conflict and put a task back in the queue.
    // Nothing is in flight to report on this wave, so nothing would bring the
    // driver back to dispatch that retry — it is dispatched now.
    if (asked.merged && signal.kind === 'backfill') {
      const retried = await this.dispatchWave(wavePlanId, waveIndex);
      result.dispatched += retried.dispatched;
      result.queued = retried.queued;
      result.errors.push(...retried.errors);
      signal = await this.signalForDriver(wavePlanId, waveIndex);
    }

    return signal.kind === 'over' ? { ...result, settled: signal.outcome } : result;
  }

  /**
   * What a wave's driver is told about it: the reading `waveSignalFor` gives,
   * with the wave's merge done first when one is due.
   *
   * THIS IS THE ONLY WAY A DRIVER LEARNS THAT A WAVE IS OVER, and that is why
   * the merge lives here. Every component that advances a plan asks this —
   * `driveWave` for the conductor graph's dispatch, the Next app's
   * `resumeConductorForTask` before it resumes the graph, and the execution
   * bridge for a plan nothing else drives — and none of them reads the rows
   * for itself. So the merge has one caller, it happens before anyone is told
   * "complete", and the next wave cannot be dispatched until it has returned:
   * whoever would dispatch it is waiting on this call.
   *
   * It could not go in the graph's nodes, because the graph is not the only
   * driver (the legacy path advances plans too) and core cannot import it. It
   * could not go in the execution bridge's settling of a task, because a wave
   * can be found already over by a dispatch that no task report preceded.
   *
   * What it does with a wave that is due a merge (`merge` from the reading):
   *
   *  - asks the runner to merge the wave's completed tasks, in task-code order;
   *  - records which were merged, and the run branch and its head on the plan;
   *  - fails a task whose branch conflicted, with the files — by the same
   *    retry-once rule as any failed task. Its retry is cut from the merged
   *    head, the wave comes back here when it completes, and the wave is
   *    merged again. A task that conflicts on its retry fails the plan;
   *  - fails the plan when the merge itself could not be done, with the
   *    runner's message. That is not a task's fault and no task is retried.
   *
   * and then reads the wave again, which is the answer.
   *
   * A wave whose tasks all failed or were skipped has nothing to merge. The
   * reading never says `merge` for it, the runner is not asked, and it is over
   * (failed) exactly as it was before isolation existed.
   *
   * When the run has ended in failure, what did complete in this wave is
   * merged too, so the run branch holds it — see `mergeDue`.
   *
   * Safe to call twice, and across a restart: the runner's merge is
   * idempotent, a wave is only due one while it has a completed task not yet
   * recorded as merged, and every write below is conditional on the attempt
   * it read.
   */
  async signalForDriver(wavePlanId: string, waveIndex: number): Promise<WaveSignal> {
    return (await this.settleSignal(wavePlanId, waveIndex)).signal;
  }

  /** `signalForDriver`, also saying whether a wave-ending merge was carried out. */
  private async settleSignal(
    wavePlanId: string,
    waveIndex: number
  ): Promise<{ signal: WaveSignal; merged: boolean }> {
    const signal = await waveSignalFor(wavePlanId, waveIndex, this.config, this.db);

    const due = await this.mergeDue(wavePlanId, waveIndex, signal);
    if (!due) {
      return { signal, merged: false };
    }

    // The one call. Nothing else in the codebase merges a run.
    const asked = await this.integrateWave(wavePlanId, waveIndex, due.taskCodes, due.conflicts);

    // The run had already ended; the merge was to keep what completed, and
    // changes nothing about how it ended.
    if (signal.kind !== 'merge') {
      return { signal, merged: false };
    }

    if (!asked) {
      // No orchestrator to ask (dispatch disabled since the wave ran). The
      // wave stays unmerged and un-advanced, and says why.
      return {
        signal: {
          kind: 'wait',
          reason: `${due.taskCodes.length} completed task(s) to merge, and no session runner to ask`,
        },
        merged: false,
      };
    }

    // A conflict reopened the wave; if nothing did, this is a no-op.
    await this.recordWaveIfOver(wavePlanId, waveIndex);

    const after = await waveSignalFor(wavePlanId, waveIndex, this.config, this.db);
    return {
      // Still due a merge after one: a write here lost a race it should not
      // have been in. Not over, and the next check-in asks again.
      signal:
        after.kind === 'merge'
          ? { kind: 'wait', reason: 'the wave still has unmerged work; it will be merged again' }
          : after,
      merged: true,
    };
  }

  /**
   * Whether this wave should be merged now, with which tasks, and what a
   * conflict means.
   *
   *  - The reading says `merge`: the wave has ended and its completed tasks
   *    are not all in the run branch. A conflict fails the task.
   *  - The plan has FAILED and this wave has completed work that is not
   *    merged: merge it, so the run branch holds everything that succeeded.
   *    Here a conflict is left alone — the run is over, there is no retry to
   *    give, and the task stays `completed` on its own branch, unmerged, which
   *    the conductor route reports as exactly that. A failure of the merge
   *    itself is left alone too; the plan keeps the reason it already has.
   *
   * The second case merges only what had completed when the driver was told
   * the run failed. A sibling still running at that moment finishes later, on
   * its own branch, and is NOT merged for a plan the conductor graph runs:
   * the graph has stopped waiting on the wave, so nothing asks again. Doing
   * that would mean a second way into the merge, and it was not worth one.
   */
  private async mergeDue(
    wavePlanId: string,
    waveIndex: number,
    signal: WaveSignal
  ): Promise<{ taskCodes: string[]; conflicts: 'fail-task' | 'leave' } | null> {
    if (signal.kind === 'merge') {
      return { taskCodes: signal.taskCodes, conflicts: 'fail-task' };
    }

    if (signal.kind !== 'over' || signal.outcome.state !== 'failed') {
      return null;
    }

    const plan = await this.db.query.wavePlans.findFirst({ where: eq(wavePlans.id, wavePlanId) });
    if (!plan?.isolated || plan.status !== 'failed') {
      return null;
    }

    const completed = await this.db.query.waveTasks.findMany({
      where: and(
        eq(waveTasks.wavePlanId, wavePlanId),
        eq(waveTasks.waveIndex, waveIndex),
        eq(waveTasks.status, 'completed')
      ),
    });
    if (!completed.some((task) => !task.mergedAt)) {
      return null;
    }

    return {
      taskCodes: completed.map((task) => task.taskCode).sort(compareTaskCodes),
      conflicts: 'leave',
    };
  }

  /**
   * Ask the runner to merge these tasks into the run branch, and write down
   * what it answered. Returns false when there was nobody to ask.
   *
   * ONE CALLER: `settleSignal`. Do not add another — see `signalForDriver`.
   */
  private async integrateWave(
    wavePlanId: string,
    waveIndex: number,
    taskCodes: string[],
    conflicts: 'fail-task' | 'leave'
  ): Promise<boolean> {
    const service = getOrchestratorServiceOrNull();
    if (!service || !service.isEnabled) {
      return false;
    }

    const plan = await this.db.query.wavePlans.findFirst({ where: eq(wavePlans.id, wavePlanId) });
    const item = plan
      ? await this.db.query.horizonItems.findFirst({ where: eq(horizonItems.id, plan.horizonItemId) })
      : undefined;
    if (!plan?.runId || !item) {
      throw new Error(`Wave plan ${wavePlanId} has no run to merge into`);
    }

    // The attempts as they are BEFORE the runner is asked. Everything written
    // afterwards is pinned to these — so an answer about an attempt that has
    // since been retried, or already recorded by another caller, changes
    // nothing.
    const attempts = new Map(
      (
        await this.db.query.waveTasks.findMany({
          where: and(
            eq(waveTasks.wavePlanId, wavePlanId),
            eq(waveTasks.waveIndex, waveIndex),
            eq(waveTasks.status, 'completed')
          ),
        })
      ).map((task) => [task.taskCode, task])
    );

    const outcome = await service.integrate({ repo: item.repo, runId: plan.runId, taskCodes });

    if (!outcome.ok) {
      // Not a task's fault, so no task is failed or retried for it: the run
      // branch is checked out somewhere, the runner is gone, git refused. The
      // runner's message says which, and what to do.
      if (conflicts === 'fail-task') {
        await this.failPlan(
          wavePlanId,
          `Wave ${waveIndex + 1} could not be merged into the run branch: ${outcome.message}`
        );
      }
      return true;
    }

    const { result } = outcome;
    const now = new Date();

    await this.db.update(wavePlans)
      .set({ runBranch: result.runBranch, runHeadSha: result.headSha, updatedAt: now })
      .where(eq(wavePlans.id, wavePlanId));

    for (const merged of result.merged) {
      const attempt = attempts.get(merged.taskCode);
      if (!attempt) continue;

      await this.db.update(waveTasks)
        .set({
          mergedAt: now,
          // Kept when the completion report recorded them. A completion applied
          // from the session row after a restart recorded neither, and the
          // runner has just said both.
          branch: sql`coalesce(branch, ${merged.branch})`,
          commitSha: sql`coalesce(commit_sha, ${merged.commitSha})`,
        })
        .where(and(...this.unmergedAttempt(attempt)));
    }

    if (conflicts === 'leave') {
      return true;
    }

    for (const conflict of result.conflicts) {
      await this.failUnmerged(
        attempts.get(conflict.taskCode),
        `merge conflict with the run branch in: ${conflict.files.join(', ')}`
      );
    }
    for (const taskCode of result.missing) {
      await this.failUnmerged(attempts.get(taskCode), 'no branch was recorded for this task');
    }

    return true;
  }

  /** A completed attempt that has not been merged — the one that was read. */
  private unmergedAttempt(attempt: WaveTask): SQL[] {
    return [
      eq(waveTasks.id, attempt.id),
      eq(waveTasks.status, 'completed'),
      isNull(waveTasks.mergedAt),
      attempt.assignedSessionId
        ? eq(waveTasks.assignedSessionId, attempt.assignedSessionId)
        : isNull(waveTasks.assignedSessionId),
    ];
  }

  /**
   * A task that completed, and whose work could not be merged: fail it, by the
   * same rule as a task whose agent failed.
   *
   * The wave was recorded as ended when its last task settled. It has not
   * ended — a task is about to run again, or has just failed for good — so it
   * is reopened first, and whichever of those happens is then recorded on it
   * the ordinary way.
   */
  private async failUnmerged(attempt: WaveTask | undefined, error: string): Promise<void> {
    if (!attempt) return;

    await this.db.update(waves)
      .set({ status: 'active', completedAt: null })
      .where(and(eq(waves.wavePlanId, attempt.wavePlanId), eq(waves.waveIndex, attempt.waveIndex)));

    await this.recordFailure(
      attempt.wavePlanId,
      attempt.taskCode,
      error,
      this.unmergedAttempt(attempt)
    );
  }

  /**
   * Handle task completion
   *
   * Legacy, and it has no caller: completions are recorded by
   * `CompletionListener.handleTaskComplete` (conditionally, with the summary)
   * and settled by the `ExecutionBridge`. Kept only because
   * docs/CONDUCTOR-AGENT.md schedules its removal with `approve` once the old
   * routes are gone; do not add a caller.
   */
  async onTaskComplete(wavePlanId: string, taskCode: string): Promise<void> {
    // Update task status
    await this.db.update(waveTasks)
      .set({
        status: 'completed',
        completedAt: new Date(),
      })
      .where(
        and(
          eq(waveTasks.wavePlanId, wavePlanId),
          eq(waveTasks.taskCode, taskCode)
        )
      );

    const task = await this.db.query.waveTasks.findFirst({
      where: and(
        eq(waveTasks.wavePlanId, wavePlanId),
        eq(waveTasks.taskCode, taskCode)
      ),
    });

    if (!task) {
      return;
    }

    // A no-op unless the wave is over.
    await this.handleWaveComplete(wavePlanId, task.waveIndex);
  }

  /**
   * If every task in the wave is terminal, record that on the wave row — its
   * final status and the moment it ended — and return true.
   *
   * `completedAt` is the instant the LAST task settled, written once. It used
   * to be written when a task failed its retry, with siblings still running,
   * and then again (with status `completed`) when they finished; a failed wave
   * therefore read as completed and its end time moved.
   *
   * Records only. It does not start the next wave or complete the plan.
   */
  async recordWaveIfOver(wavePlanId: string, waveIndex: number): Promise<boolean> {
    const tasks = await this.db.query.waveTasks.findMany({
      where: and(
        eq(waveTasks.wavePlanId, wavePlanId),
        eq(waveTasks.waveIndex, waveIndex)
      ),
    });

    if (!isWaveOver(tasks)) {
      return false;
    }

    const wave = and(eq(waves.wavePlanId, wavePlanId), eq(waves.waveIndex, waveIndex));

    // A wave none of whose tasks ever ran did not end; it was skipped. It gets
    // the status and no end time.
    if (tasks.length > 0 && tasks.every(task => task.status === 'skipped')) {
      await this.db.update(waves).set({ status: 'skipped' }).where(wave);
      return true;
    }

    await this.db.update(waves)
      .set({
        status: tasks.every(task => task.status === 'completed') ? 'completed' : 'failed',
        completedAt: new Date(),
      })
      .where(and(wave, isNull(waves.completedAt)));

    return true;
  }

  /**
   * LEGACY DRIVER. A wave of a plan that nothing else is sequencing has ended:
   * finish the plan (last wave) or, when `autoAdvance` is set, start the next
   * wave. Invoked by the ExecutionBridge (§6.5) for plans no `WaveDriver` owns.
   *
   * Never call this for a plan the conductor graph is running. The graph makes
   * this same decision itself, and the two used to both make it: the graph
   * resumed and dispatched wave N+1, and about two seconds later this method
   * dispatched it again.
   *
   * Idempotent. It does nothing unless the wave really is over and the plan is
   * still executing, and only the call that moves the plan's wave pointer goes
   * on to dispatch.
   */
  async handleWaveComplete(wavePlanId: string, waveIndex: number): Promise<void> {
    if (!(await this.recordWaveIfOver(wavePlanId, waveIndex))) {
      return;
    }

    const wavePlan = await this.db.query.wavePlans.findFirst({
      where: eq(wavePlans.id, wavePlanId),
    });
    if (!wavePlan) {
      return;
    }

    const isLastWave = waveIndex === wavePlan.totalWaves - 1;

    if (isLastWave) {
      // Conditional inside: a failed plan whose last siblings have now finished
      // stays failed. This used to be an unconditional write of `completed`.
      await this.completePlan(wavePlanId);
      return;
    }

    if (this.config.autoAdvance) {
      const nextWaveIndex = waveIndex + 1;

      // Pause guard (§9.4): never auto-advance a plan that is no longer
      // executing. And advance once: the pointer moves only if it has not
      // already moved past this wave, and only the caller that moved it
      // dispatches.
      const advanced = await this.db.update(wavePlans)
        .set({ currentWaveIndex: nextWaveIndex, updatedAt: new Date() })
        .where(
          and(
            eq(wavePlans.id, wavePlanId),
            eq(wavePlans.status, 'executing'),
            lte(wavePlans.currentWaveIndex, waveIndex)
          )
        )
        .returning({ id: wavePlans.id });
      if (advanced.length === 0) {
        return;
      }

      await this.delay(this.config.waveAdvanceDelayMs);
      await this.dispatchWave(wavePlanId, nextWaveIndex);
    }
  }

  /**
   * Mark a plan `completed` and record its final metrics.
   *
   * Only from `executing` or `paused` — never from `failed`. Returns whether
   * this call was the one that completed it, so the metrics are collected once.
   *
   * Called by the legacy driver after the last wave, and by the conductor
   * graph's `endRun` port when the graph reaches `finish`.
   */
  async completePlan(wavePlanId: string): Promise<boolean> {
    const now = new Date();
    const completed = await this.db.update(wavePlans)
      .set({ status: 'completed', completedAt: now, updatedAt: now })
      .where(
        and(
          eq(wavePlans.id, wavePlanId),
          inArray(wavePlans.status, ['executing', 'paused'])
        )
      )
      .returning({ id: wavePlans.id });

    if (completed.length === 0) {
      return false;
    }

    // Metrics describe a finished run; they must not be able to un-finish it.
    // `collectFinalMetrics` existed, was correct, and had never been called.
    try {
      await collectFinalMetrics(wavePlanId);
    } catch (error) {
      console.error(
        `Wave plan ${wavePlanId} completed, but its final metrics were not recorded:`,
        error instanceof Error ? error.message : error
      );
    }

    return true;
  }

  /**
   * Fail a plan, loudly, and stop anything further being dispatched for it.
   *
   *  - The plan goes to `failed` with `reason` recorded. The FIRST reason
   *    stands: the write is conditional on the plan not already being terminal,
   *    and returns false (changing nothing) when it is.
   *  - Tasks never dispatched (`pending`) become `skipped`.
   *  - Tasks that failed once and were waiting for their retry (`retrying`)
   *    become `failed`, keeping the error they already carry. They are not
   *    "skipped" — they ran and failed — and left as `retrying` they would be
   *    non-terminal forever with nothing allowed to dispatch them.
   *  - Tasks already in flight are LEFT ALONE. Their agents are mid-edit;
   *    killing them leaves a worse working tree than letting them land, and
   *    their completions are still recorded when they arrive. Nothing new is
   *    dispatched meanwhile: the dispatch claim requires an `executing` plan.
   *  - The failing wave is marked `failed`; waves never started, `skipped`.
   *
   * `cause` names the task that ended the plan, when a task did.
   */
  async failPlan(
    wavePlanId: string,
    reason: string,
    cause?: { waveIndex: number; taskCode: string }
  ): Promise<boolean> {
    const now = new Date();

    const failed = await this.db.update(wavePlans)
      .set({ status: 'failed', failureReason: reason, completedAt: now, updatedAt: now })
      .where(
        and(
          eq(wavePlans.id, wavePlanId),
          notInArray(wavePlans.status, [...TERMINAL_WAVE_PLAN_STATUSES])
        )
      )
      .returning({ currentWaveIndex: wavePlans.currentWaveIndex });

    if (failed.length === 0) {
      return false;
    }

    const skipped = await this.db.update(waveTasks)
      .set({ status: 'skipped' })
      .where(
        and(
          eq(waveTasks.wavePlanId, wavePlanId),
          eq(waveTasks.status, 'pending')
        )
      )
      .returning({ id: waveTasks.id });

    await this.db.update(waveTasks)
      .set({ status: 'failed', completedAt: now })
      .where(
        and(
          eq(waveTasks.wavePlanId, wavePlanId),
          eq(waveTasks.status, 'retrying')
        )
      );

    const failedWave = cause?.waveIndex ?? failed[0].currentWaveIndex;

    await this.db.update(waves)
      .set({ status: 'failed' })
      .where(
        and(
          eq(waves.wavePlanId, wavePlanId),
          eq(waves.waveIndex, failedWave),
          notInArray(waves.status, ['completed', 'failed'])
        )
      );

    await this.db.update(waves)
      .set({ status: 'skipped' })
      .where(and(eq(waves.wavePlanId, wavePlanId), eq(waves.status, 'pending')));

    // If nothing in the failing wave is still running, it ended just now.
    await this.recordWaveIfOver(wavePlanId, failedWave);

    await this.emitEvent(
      {
        type: 'wave_plan_failed',
        wavePlanId,
        failedWave,
        failedTask: cause?.taskCode ?? '',
      },
      `Wave plan failed: ${reason}` +
        (skipped.length > 0 ? ` (${skipped.length} task(s) not started were skipped)` : '')
    );

    return true;
  }

  /**
   * Record that a task's current attempt failed.
   *
   * Within the retry limit the task becomes `retrying` and is owed another
   * attempt; beyond it the task is terminally failed and the failure policy
   * applies. Returns which, or `'ignored'` when the report changed nothing.
   *
   * It does NOT re-dispatch. It used to — calling the coordinator directly the
   * moment the task was marked — which made this a third place a dispatch
   * could originate. A `retrying` task is dispatchable, so the next dispatch
   * pass over its wave picks it up: the conductor graph's, when the graph owns
   * the plan, or the bridge's backfill when nothing does. A paused plan
   * dispatches nothing, so the retry waits for resume, as before.
   *
   * Only an attempt that is in flight can fail. A report about a task that is
   * already terminal, or already waiting for its retry, or (when `attempt`
   * names a session) about an attempt that has since been superseded, is
   * ignored — which is what makes a callback and the reconciler reporting the
   * same failure spend one retry rather than two.
   */
  async onTaskFailed(
    wavePlanId: string,
    taskCode: string,
    error: string,
    attempt: TaskAttemptRef = {}
  ): Promise<TaskFailureOutcome> {
    return this.recordFailure(
      wavePlanId,
      taskCode,
      error,
      this.inFlightAttempt(attempt),
      attempt.endedAt
    );
  }

  /** The attempt a failure report may change: in flight, and the one named. */
  private inFlightAttempt(attempt: TaskAttemptRef): SQL[] {
    return [
      inArray(waveTasks.status, [...IN_FLIGHT_WAVE_TASK_STATUSES]),
      ...(attempt.sessionId ? [eq(waveTasks.assignedSessionId, attempt.sessionId)] : []),
    ];
  }

  /**
   * The retry-once rule, for whichever attempt `only` selects.
   *
   * There are two kinds of failure and one rule. An agent that fails is an
   * attempt in flight (`onTaskFailed`); a branch that will not merge is an
   * attempt that completed (`failUnmerged`). Both spend the task's one retry,
   * and both fail the plan when there is none left — a task that conflicts on
   * its retry ends the run exactly as a task that fails twice does.
   */
  private async recordFailure(
    wavePlanId: string,
    taskCode: string,
    error: string,
    only: SQL[],
    endedAt?: Date
  ): Promise<TaskFailureOutcome> {
    const task = await this.db.query.waveTasks.findFirst({
      where: and(
        eq(waveTasks.wavePlanId, wavePlanId),
        eq(waveTasks.taskCode, taskCode)
      ),
    });

    if (!task) {
      throw new Error(`Task ${taskCode} not found in plan ${wavePlanId}`);
    }

    if (task.retryCount >= this.config.retryLimit) {
      return this.failTask(wavePlanId, taskCode, error, only, endedAt);
    }

    // Mark as retrying and increment retry count — if, and only if, this is
    // still the attempt we read.
    const retrying = await this.db.update(waveTasks)
      .set({
        status: 'retrying',
        retryCount: task.retryCount + 1,
        errorMessage: error,
      })
      .where(
        and(
          eq(waveTasks.id, task.id),
          eq(waveTasks.retryCount, task.retryCount),
          ...only
        )
      )
      .returning({ id: waveTasks.id });

    if (retrying.length === 0) {
      return 'ignored';
    }

    await this.emitEvent(
      { type: 'wave_task_failed', wavePlanId, taskCode, error },
      `Task ${taskCode} failed (attempt ${task.retryCount + 1}), will retry: ${error}`
    );

    return 'retrying';
  }

  /**
   * Terminally fail a task with no retry — used by the ExecutionBridge for
   * cancellations (job:cancelled is terminal). Applies the failure policy.
   */
  async cancelTask(
    wavePlanId: string,
    taskCode: string,
    reason: string,
    attempt: TaskAttemptRef = {}
  ): Promise<TaskFailureOutcome> {
    return this.failTask(
      wavePlanId,
      taskCode,
      reason,
      this.inFlightAttempt(attempt),
      attempt.endedAt
    );
  }

  /**
   * Terminally fail the attempt `only` selects and apply the failure policy.
   */
  private async failTask(
    wavePlanId: string,
    taskCode: string,
    error: string,
    only: SQL[],
    endedAt?: Date
  ): Promise<TaskFailureOutcome> {
    const failed = await this.db.update(waveTasks)
      .set({ status: 'failed', completedAt: endedAt ?? new Date(), errorMessage: error })
      .where(
        and(
          eq(waveTasks.wavePlanId, wavePlanId),
          eq(waveTasks.taskCode, taskCode),
          ...only
        )
      )
      .returning({ id: waveTasks.id });

    if (failed.length === 0) {
      const exists = await this.db.query.waveTasks.findFirst({
        where: and(
          eq(waveTasks.wavePlanId, wavePlanId),
          eq(waveTasks.taskCode, taskCode)
        ),
      });
      if (!exists) {
        throw new Error(`Task ${taskCode} not found in plan ${wavePlanId}`);
      }
      return 'ignored';
    }

    await this.emitEvent(
      { type: 'wave_task_failed', wavePlanId, taskCode, error },
      `Task ${taskCode} failed: ${error}`
    );

    await this.applyFailurePolicy(wavePlanId, taskCode, error);
    return 'failed';
  }

  /**
   * Apply the failure policy for a task that is terminally failed: 'halt'
   * fails the plan (see `failPlan`); 'continue' leaves other tasks running.
   *
   * The plan's recorded reason names the task and its error, because "failed"
   * with nothing attached sends whoever reads it to a log.
   */
  private async applyFailurePolicy(
    wavePlanId: string,
    taskCode: string,
    error: string
  ): Promise<void> {
    if (this.config.failurePolicy !== 'halt') {
      // 'continue' policy: only this task is failed; the wave proceeds.
      return;
    }

    const task = await this.db.query.waveTasks.findFirst({
      where: and(
        eq(waveTasks.wavePlanId, wavePlanId),
        eq(waveTasks.taskCode, taskCode)
      ),
    });
    if (!task) {
      throw new Error(`Task ${taskCode} not found in plan ${wavePlanId}`);
    }

    const retries =
      task.retryCount > 0
        ? ` after ${task.retryCount} ${task.retryCount === 1 ? 'retry' : 'retries'}`
        : '';

    await this.failPlan(wavePlanId, `Task ${taskCode} failed${retries}: ${error}`, {
      waveIndex: task.waveIndex,
      taskCode,
    });
  }

  /**
   * Emit a wave execution event to the activity_events table.
   *
   * The failure path used to emit nothing at all — a task could be retried and
   * a plan failed without a single row saying so.
   */
  private async emitEvent(event: WaveSSEEvent, message: string): Promise<void> {
    await this.db.insert(activityEvents).values({
      // Uppercase enum value required by the activity_events CHECK constraint.
      type: toActivityEventType(event.type),
      message,
      metadata: event as unknown as Record<string, unknown>,
    });
  }

  /**
   * Delay helper for wave advancement
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
