import { eq, and, inArray, notInArray } from 'drizzle-orm';
import { getDatabase, type Database } from '../../db';
import { waveTasks, activityEvents } from '../../db/schema';
import { toActivityEventType, type WaveSSEEvent } from './types';
import { IN_FLIGHT_WAVE_TASK_STATUSES, TERMINAL_WAVE_TASK_STATUSES } from './wave-state';

/**
 * Where an attempt's work is and what it changed, as its completion report
 * said. The four `wave_tasks` columns of the same names.
 */
export interface TaskWork {
  branch: string | null;
  baseSha: string | null;
  commitSha: string | null;
  /** NULL is "the report did not say", which is not `[]`. */
  filesChanged: string[] | null;
}

/**
 * Read a task's work out of whatever arrived as its completion report.
 *
 * The payload is JSON a runner posted, typed here but not checked on the way
 * in, so each field is taken only if it is what it should be:
 *
 * - `branch` and `baseSha` are sent for an isolated task and for nothing else.
 * - `commitSha` is kept ONLY alongside a branch. Without one it is the shared
 *   checkout's HEAD when the session ended — a commit the task may have had
 *   nothing to do with — and storing that as the task's commit would be a
 *   claim nobody checked.
 * - `filesChanged` is the union of the three file lists, when the report has
 *   any of them. A payload with none (a `job:error` that carries only an error
 *   string) recorded nothing, and that is NULL rather than an empty list.
 */
export function workFromReport(report: unknown): TaskWork {
  const r = (report && typeof report === 'object' ? report : {}) as Record<string, unknown>;
  const text = (value: unknown): string | null =>
    typeof value === 'string' && value.length > 0 ? value : null;

  const lists = [r.filesModified, r.filesCreated, r.filesDeleted];
  const filesChanged = lists.some(Array.isArray)
    ? [
        ...new Set(
          lists.flatMap((list) =>
            Array.isArray(list) ? list.filter((f): f is string => typeof f === 'string') : []
          )
        ),
      ]
    : null;

  const branch = text(r.branch);
  return {
    branch,
    baseSha: branch ? text(r.baseSha) : null,
    commitSha: branch ? text(r.commitSha) : null,
    filesChanged,
  };
}

/** True when a report carried nothing worth a write. */
function nothingRecorded(work: TaskWork): boolean {
  return !work.branch && !work.baseSha && !work.commitSha && work.filesChanged === null;
}

/**
 * CompletionListener records what the orchestrator reports about a wave task —
 * that it started, that it completed — and emits the matching activity event.
 *
 * It records; it does not decide. It used to be handed two callbacks,
 * `onWaveComplete` and `onCapacityFreed`, and called them from inside the
 * completion write, which made "a task finished" and "start the next wave" one
 * indivisible act owned by whoever constructed the listener. With a second
 * component — the conductor graph — also starting waves, that is two drivers.
 * What happens *because* a task changed is now the `ExecutionBridge`'s call
 * (`settle`), which asks who owns the plan first.
 *
 * Failure is not handled here either: the retry-once rule and the failure
 * policy live in `WaveExecutionController.onTaskFailed`, and a second
 * implementation of them here (`handleTaskFailed`, which nothing called and
 * which wrote the status unconditionally) could only disagree with it.
 *
 * Every write is conditional on the state it expects to find, so the same
 * report delivered twice — a retried callback, or a callback racing the
 * reconciler — is applied once. Each method returns whether it changed the row.
 */
export class CompletionListener {
  private db: Database;

  constructor() {
    this.db = getDatabase();
  }

  /**
   * Handle task started event: `dispatched → running`.
   *
   * Only from `dispatched`, and only for the session the task is currently
   * linked to — a late `job:started` for an attempt that has since been
   * retried, or for a task that already finished, changes nothing.
   *
   * It does not touch `startedAt`. The dispatch claim recorded when the attempt
   * began; overwriting it here is how a task's start time came to be the moment
   * of its most recent event rather than of its first attempt.
   */
  async handleTaskStarted(
    wavePlanId: string,
    taskCode: string,
    sessionId: string
  ): Promise<boolean> {
    const started = await this.db
      .update(waveTasks)
      .set({ status: 'running' })
      .where(
        and(
          eq(waveTasks.wavePlanId, wavePlanId),
          eq(waveTasks.taskCode, taskCode),
          eq(waveTasks.status, 'dispatched'),
          eq(waveTasks.assignedSessionId, sessionId)
        )
      )
      .returning({ id: waveTasks.id });

    if (started.length === 0) {
      return false;
    }

    await this.emitEvent({
      type: 'wave_task_dispatched',
      wavePlanId,
      taskCode,
      sessionId,
    });
    return true;
  }

  /**
   * Handle task completion event: store the summary and mark the task
   * `completed`.
   *
   * Applies to any task that is not already terminal. That is wider than "in
   * flight" on purpose: a task that was judged lost and is waiting for its
   * retry (`retrying`), or that a pause reset to `pending`, still names the
   * session that is now reporting success — the dispatch claim clears
   * `assignedSessionId` the moment a new attempt takes the task — and work that
   * was actually done should not be done again. A terminal task stays as it is:
   * a duplicate callback is a no-op (§9.5), and a task already `failed` may
   * have failed its plan, which a late success cannot un-fail.
   *
   * `sessionId`, when given, pins the write to the attempt that is reporting.
   *
   * `work` is where the attempt's work is and what it changed, taken from the
   * report that is being applied and written in the same statement as the
   * status — so a task is never `completed` with its branch still to come, and
   * the merge that may follow immediately finds the commit. It is absent when
   * the completion is applied from the session row by the reconciler: that row
   * does not carry a branch, a base, a commit or a file list, so those four
   * columns stay NULL for such a task, which reads — correctly — as "not
   * recorded".
   */
  async handleTaskComplete(
    wavePlanId: string,
    taskCode: string,
    completionSummary?: string,
    sessionId?: string,
    work?: TaskWork,
    /**
     * When the task actually finished, if that is not "now". The reconciler
     * passes the session row's own end time: it is recording a completion that
     * happened earlier — possibly weeks earlier, on a database left with tasks
     * in flight — and stamping it with the time of recording gave such a task
     * a duration of however long the cockpit had been switched off. Run
     * against a real database, six tasks that took minutes in August read as
     * forty-one days each.
     */
    completedAt?: Date
  ): Promise<boolean> {
    const completed = await this.db
      .update(waveTasks)
      .set({
        status: 'completed',
        completedAt: completedAt ?? new Date(),
        // Stored in its own column (not errorMessage).
        completionSummary: completionSummary ?? null,
        ...(work && !nothingRecorded(work) ? work : {}),
      })
      .where(
        and(
          eq(waveTasks.wavePlanId, wavePlanId),
          eq(waveTasks.taskCode, taskCode),
          notInArray(waveTasks.status, [...TERMINAL_WAVE_TASK_STATUSES]),
          ...(sessionId ? [eq(waveTasks.assignedSessionId, sessionId)] : [])
        )
      )
      .returning({ waveIndex: waveTasks.waveIndex });

    if (completed.length === 0) {
      // Either a duplicate, or there is no such task. Only the second is a
      // fault, and it is one the caller should hear about.
      const exists = await this.db.query.waveTasks.findFirst({
        where: and(eq(waveTasks.wavePlanId, wavePlanId), eq(waveTasks.taskCode, taskCode)),
      });
      if (!exists) {
        throw new Error(`Task ${taskCode} not found in wave plan ${wavePlanId}`);
      }
      return false;
    }

    await this.emitEvent({
      type: 'wave_task_complete',
      wavePlanId,
      taskCode,
      waveIndex: completed[0].waveIndex,
    });
    return true;
  }

  /**
   * Record where a FAILED attempt's work is.
   *
   * The runner commits what a failed agent left and reports the branch it is
   * on, so the person deciding what went wrong can read it. Whether the task
   * is retried or the plan fails is not decided here — this only writes the
   * four columns, and only for the attempt that is reporting while it is still
   * the one in flight. Call it before the failure is applied.
   */
  async recordTaskWork(
    wavePlanId: string,
    taskCode: string,
    sessionId: string,
    work: TaskWork
  ): Promise<void> {
    if (nothingRecorded(work)) return;

    await this.db
      .update(waveTasks)
      .set(work)
      .where(
        and(
          eq(waveTasks.wavePlanId, wavePlanId),
          eq(waveTasks.taskCode, taskCode),
          eq(waveTasks.assignedSessionId, sessionId),
          inArray(waveTasks.status, [...IN_FLIGHT_WAVE_TASK_STATUSES])
        )
      );
  }

  /**
   * Emit a wave execution event to the activity_events table.
   */
  private async emitEvent(event: WaveSSEEvent): Promise<void> {
    let message = '';
    switch (event.type) {
      case 'wave_task_dispatched':
        message = `Task ${event.taskCode} dispatched with session ${event.sessionId}`;
        break;
      case 'wave_task_complete':
        message = `Task ${event.taskCode} completed in wave ${event.waveIndex}`;
        break;
      default:
        message = `Wave event: ${event.type}`;
    }

    await this.db.insert(activityEvents).values({
      // Map the lowercase SSE type to the uppercase activity_events enum value
      // (the CHECK constraint only accepts uppercase members).
      type: toActivityEventType(event.type),
      message,
      metadata: event as unknown as Record<string, unknown>,
    });
  }
}
