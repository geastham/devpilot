/**
 * What state a wave is in, decided in one place.
 *
 * "Is this wave over?" used to be answered five times, by five lists that did
 * not agree. The Next app's resume bridge counted `completed`, `failed` and
 * `cancelled` — the last of which is not a wave-task status at all — and left
 * out `skipped`. The completion listener and the controller counted
 * `completed`, `failed` and `skipped`. So a wave the controller considered
 * finished (a task failed its retry, the rest were skipped) was one the resume
 * bridge considered still running, and the conductor graph was never woken:
 * the run sat at "executing" until someone noticed.
 *
 * Everything that needs the answer imports it from here. A status added to the
 * enum without being classified below is a compile error, not a hang.
 */

import { and, eq, sql, type SQL } from 'drizzle-orm';
import { getDatabase, type Database } from '../../db';
import { wavePlans, waveTasks } from '../../db/schema/wave-planner';
import type { WavePlanStatus, WaveTaskStatus } from '../../db/schema/enums';

// ============================================================================
// Status sets
// ============================================================================

/** A task that will not change again. A wave is over when every task is one of these. */
export const TERMINAL_WAVE_TASK_STATUSES = [
  'completed',
  'failed',
  'skipped',
] as const satisfies readonly WaveTaskStatus[];

/**
 * A task an agent is (as far as the database knows) working on right now.
 *
 * `dispatched` is claimed-and-sent; `running` is the same task once the
 * orchestrator has confirmed the job started. Both occupy a worker, so both
 * count against the concurrency caps — counting only `running` is how the cap
 * came to cap nothing (see `freeDispatchSlots`).
 */
export const IN_FLIGHT_WAVE_TASK_STATUSES = [
  'dispatched',
  'running',
] as const satisfies readonly WaveTaskStatus[];

/** A task the next dispatch pass may claim. `retrying` failed once and is owed another attempt. */
export const DISPATCHABLE_WAVE_TASK_STATUSES = [
  'pending',
  'retrying',
] as const satisfies readonly WaveTaskStatus[];

/** A plan nothing will be dispatched for again. */
export const TERMINAL_WAVE_PLAN_STATUSES = [
  'completed',
  'failed',
] as const satisfies readonly WavePlanStatus[];

/**
 * Exhaustiveness guard: every task status is terminal, in flight or
 * dispatchable. Adding a member to `waveTaskStatusValues` without classifying it
 * makes this line fail to compile.
 */
type Classified =
  | (typeof TERMINAL_WAVE_TASK_STATUSES)[number]
  | (typeof IN_FLIGHT_WAVE_TASK_STATUSES)[number]
  | (typeof DISPATCHABLE_WAVE_TASK_STATUSES)[number];
const _everyStatusIsClassified: [WaveTaskStatus] extends [Classified] ? true : never = true;
void _everyStatusIsClassified;

const includes = (set: readonly string[], status: string): boolean => set.includes(status);

export function isTerminalWaveTaskStatus(status: string): boolean {
  return includes(TERMINAL_WAVE_TASK_STATUSES, status);
}

export function isInFlightWaveTaskStatus(status: string): boolean {
  return includes(IN_FLIGHT_WAVE_TASK_STATUSES, status);
}

export function isDispatchableWaveTaskStatus(status: string): boolean {
  return includes(DISPATCHABLE_WAVE_TASK_STATUSES, status);
}

export function isTerminalWavePlanStatus(status: string): boolean {
  return includes(TERMINAL_WAVE_PLAN_STATUSES, status);
}

/**
 * A wave is over when every task in it is terminal.
 *
 * A wave with no tasks is over: there is nothing to wait for, and treating it
 * as "not over" is a wait that nothing can ever end.
 */
export function isWaveOver(tasks: readonly { status: string }[]): boolean {
  return tasks.every((task) => isTerminalWaveTaskStatus(task.status));
}

// ============================================================================
// Concurrency
// ============================================================================

/** The two caps from `WaveExecutionConfig`, which is assignable to this. */
export interface DispatchLimits {
  /** At most this many of ONE plan's tasks in flight. */
  maxConcurrentSubagents: number;
  /** At most this many tasks in flight across every live plan. */
  maxTotalActiveTasks: number;
}

const quoted = (values: readonly string[]): SQL => sql.raw(values.map((v) => `'${v}'`).join(', '));

/**
 * SQL for "tasks in flight across every plan that is still live".
 *
 * Tasks of a terminal plan are deliberately not counted. A plan that was failed
 * or abandoned can leave tasks `dispatched` forever — the reconciler only
 * settles tasks of live plans — and counting those would let a dead run hold a
 * worker slot permanently. The cost is that the siblings a halted plan leaves
 * running are briefly invisible to this count; the session runner's own
 * `--max-concurrent` still answers 429 for them, which queues rather than fails.
 *
 * Exported as SQL rather than run here because the dispatch claim embeds it in
 * its `UPDATE … WHERE`: a count read in one statement and acted on in the next
 * is a cap two concurrent dispatchers can both pass.
 */
export function inFlightEverywhereSql(): SQL {
  return sql`(select count(*) from wave_tasks t inner join wave_plans p on p.id = t.wave_plan_id where t.status in (${quoted(
    IN_FLIGHT_WAVE_TASK_STATUSES
  )}) and p.status not in (${quoted(TERMINAL_WAVE_PLAN_STATUSES)}))`;
}

/** SQL for "tasks of this plan in flight". */
export function inFlightInPlanSql(wavePlanId: string): SQL {
  return sql`(select count(*) from wave_tasks t where t.wave_plan_id = ${wavePlanId} and t.status in (${quoted(
    IN_FLIGHT_WAVE_TASK_STATUSES
  )}))`;
}

/**
 * How many more tasks of this plan could be dispatched right now.
 *
 * This is advice — whether a backfill pass is worth starting. The cap itself is
 * enforced by the claim in `WaveDispatchCoordinator`, which re-evaluates the
 * same two counts inside the statement that takes the task.
 */
export async function freeDispatchSlots(
  wavePlanId: string,
  limits: DispatchLimits,
  db: Database = getDatabase()
): Promise<number> {
  const [row] = await db
    .select({
      everywhere: sql<number>`${inFlightEverywhereSql()}`.mapWith(Number),
      inPlan: sql<number>`${inFlightInPlanSql(wavePlanId)}`.mapWith(Number),
    })
    .from(wavePlans)
    .where(eq(wavePlans.id, wavePlanId))
    .limit(1);

  if (!row) return 0;

  return Math.max(
    0,
    Math.min(
      limits.maxTotalActiveTasks - row.everywhere,
      limits.maxConcurrentSubagents - row.inPlan
    )
  );
}

// ============================================================================
// The signal a wave sends its driver
// ============================================================================

/**
 * How a finished wave ended. Structurally the conductor agent's settled
 * `WaveOutcome`, declared here because core must not import that package (it is
 * what carries the langchain dependency).
 */
export type SettledWave =
  | { state: 'complete' }
  | { state: 'failed'; failures: { taskCode: string; error: string }[] };

export type WaveSignal =
  /** Stop waiting: the wave — or the whole run — has ended. */
  | { kind: 'over'; outcome: SettledWave }
  /**
   * Every task has finished, and the wave is still not over: the plan gives
   * each task its own branch, and work that completed has not been merged into
   * the run branch yet. `taskCodes` is every completed task of the wave, in
   * task-code order — what the runner is to be asked to merge.
   *
   * Nothing may act on this as if it were `over`. The next wave's tasks are cut
   * from the run branch, so starting them now would start them without the
   * work they depend on. Only `WaveExecutionController.signalForDriver` turns
   * it into something a driver acts on, by doing the merge.
   */
  | { kind: 'merge'; taskCodes: string[] }
  /** The wave is still going and has tasks a dispatch pass could start now. */
  | { kind: 'backfill'; dispatchable: number; freeSlots: number }
  /** Nothing to do yet. `reason` is for a log line, not for branching. */
  | { kind: 'wait'; reason: string };

/**
 * Task codes in the order a person would list them: `1.2` before `1.10`.
 *
 * It is the order a wave's branches are merged in. The order decides which of
 * two conflicting tasks goes in and which is sent back, so it has to be the
 * same every time the same wave is merged, and a plain string sort would put
 * `1.10` ahead of `1.2`.
 */
export function compareTaskCodes(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true });
}

/**
 * Decide what a wave's rows mean for whoever is driving the plan.
 *
 * Pure, so the decision is testable without a graph and the Next app's resume
 * bridge can stay a thin wrapper around it.
 *
 * The order of the checks is the policy:
 *
 * 1. **A failed plan is over, whatever its tasks are doing.** Under the `halt`
 *    policy a task that fails its retry fails the plan and skips everything not
 *    yet started, but siblings already running are left to finish — killing an
 *    agent mid-edit leaves a worse tree than letting it land. Those siblings
 *    must not hold the run open: the outcome is already decided, nothing new
 *    will be dispatched, and one of them going silent would otherwise leave the
 *    driver waiting on a plan the reconciler no longer looks at.
 * 2. **An isolated plan's wave is not over until what completed is merged.**
 *    Every task terminal, and a completed one not yet in the run branch, is
 *    `merge` — not `over`. This sits here, in the reading itself, rather than
 *    in each caller's handling of `over`, so that there is no way to ask "is
 *    the wave over?" and be told yes about work the next wave would not find.
 *    A wave with nothing completed has nothing to merge and falls through:
 *    every task failed or was skipped, and it is over (failed) as it always
 *    was.
 * 3. **Otherwise a wave is over when every task is terminal** — complete if all
 *    of them completed, failed if any did not.
 * 4. **Otherwise, backfill** when the plan is executing, a task is dispatchable
 *    and a slot is free.
 * 5. **Otherwise wait.**
 */
export function readWaveSignal(
  plan: { status: string; failureReason?: string | null; isolated?: boolean | null },
  tasks: readonly {
    taskCode: string;
    status: string;
    errorMessage?: string | null;
    mergedAt?: Date | null;
  }[],
  freeSlots: number
): WaveSignal {
  if (plan.status === 'failed') {
    const failed = tasks.filter((task) => task.status === 'failed');
    return {
      kind: 'over',
      outcome: {
        state: 'failed',
        failures:
          failed.length > 0
            ? failed.map((task) => ({
                taskCode: task.taskCode,
                error: task.errorMessage ?? 'failed',
              }))
            : // The plan was failed by something other than a task in this wave
              // (an abort, a failure in another wave). Say what is recorded
              // rather than report a failure with no cause.
              [{ taskCode: '(plan)', error: plan.failureReason ?? 'the wave plan was failed' }],
      },
    };
  }

  if (isWaveOver(tasks)) {
    if (plan.isolated) {
      const completed = tasks.filter((task) => task.status === 'completed');
      if (completed.some((task) => !task.mergedAt)) {
        return {
          kind: 'merge',
          taskCodes: completed.map((task) => task.taskCode).sort(compareTaskCodes),
        };
      }
    }

    const unfinished = tasks.filter((task) => task.status !== 'completed');
    return {
      kind: 'over',
      outcome:
        unfinished.length === 0
          ? { state: 'complete' }
          : {
              state: 'failed',
              failures: unfinished.map((task) => ({
                taskCode: task.taskCode,
                error: task.errorMessage ?? task.status,
              })),
            },
    };
  }

  const inFlight = tasks.filter((task) => isInFlightWaveTaskStatus(task.status)).length;
  const dispatchable = tasks.filter((task) => isDispatchableWaveTaskStatus(task.status)).length;

  // Pause guard: a paused plan dispatches nothing until it is resumed.
  if (plan.status !== 'executing') {
    return { kind: 'wait', reason: `plan is ${plan.status}; ${inFlight} task(s) in flight` };
  }

  if (dispatchable > 0 && freeSlots > 0) {
    return { kind: 'backfill', dispatchable, freeSlots };
  }

  return {
    kind: 'wait',
    reason:
      dispatchable > 0
        ? `${inFlight} task(s) in flight, ${dispatchable} queued behind the concurrency cap`
        : `${inFlight} task(s) still in flight`,
  };
}

/** `readWaveSignal` over the rows as they are in the database right now. */
export async function waveSignalFor(
  wavePlanId: string,
  waveIndex: number,
  limits: DispatchLimits,
  db: Database = getDatabase()
): Promise<WaveSignal> {
  const plan = await db.query.wavePlans.findFirst({ where: eq(wavePlans.id, wavePlanId) });
  if (!plan) {
    return { kind: 'wait', reason: `no wave plan ${wavePlanId}` };
  }

  const tasks = await db.query.waveTasks.findMany({
    where: and(eq(waveTasks.wavePlanId, wavePlanId), eq(waveTasks.waveIndex, waveIndex)),
  });

  return readWaveSignal(plan, tasks, await freeDispatchSlots(wavePlanId, limits, db));
}
