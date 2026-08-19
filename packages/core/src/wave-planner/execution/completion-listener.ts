import { eq, and } from 'drizzle-orm';
import { getDatabase, type Database } from '../../db';
import { waveTasks, activityEvents, type WaveTask } from '../../db/schema';
import { toActivityEventType, type WaveSSEEvent } from './types';

export interface CompletionListenerOptions {
  /** Max retries per task before terminal failure. Default 1. */
  retryLimit?: number;

  /**
   * Called when a task reaches a terminal state but its wave has not finished —
   * i.e. a concurrency slot just freed and pending tasks may now be dispatchable.
   *
   * Without this the executor was a **deadlock for any wave larger than
   * `maxConcurrentSubagents`**. `dispatchWave` dispatches up to the cap and
   * leaves the remainder `pending`; nothing ever dispatched them, and
   * `checkWaveCompletion` requires *every* task to be terminal — so the wave
   * could never complete and the run hung forever with the fleet idle.
   *
   * It stayed hidden because the only wave plan ever executed end to end had
   * fewer tasks per wave than the cap. Real plans do not: the first live plan
   * generated after this was found had waves of 8, 9 and 9 against a default cap
   * of 4, so every wave of it would have hung.
   */
  onCapacityFreed?: (wavePlanId: string, waveIndex: number) => Promise<void>;
}

const TERMINAL_TASK_STATUSES = new Set(['completed', 'failed', 'skipped']);

/**
 * CompletionListener handles task completion events from the orchestrator.
 * It updates task statuses, tracks completion, and determines when waves are complete.
 */
export class CompletionListener {
  private db: Database;
  private retryLimit: number;
  private onCapacityFreed?: (wavePlanId: string, waveIndex: number) => Promise<void>;

  constructor(
    private onWaveComplete: (wavePlanId: string, waveIndex: number) => Promise<void>,
    options?: CompletionListenerOptions
  ) {
    this.db = getDatabase();
    this.retryLimit = options?.retryLimit ?? 1;
    this.onCapacityFreed = options?.onCapacityFreed;
  }

  /**
   * A task reached a terminal state: either the wave is done, or a slot just
   * freed and the remaining pending tasks deserve a dispatch attempt.
   *
   * Centralised so completion and failure share it — a wave whose tasks *fail*
   * frees capacity exactly as one whose tasks succeed, and handling only the
   * success path would leave the same deadlock behind a different door.
   */
  private async settleWave(wavePlanId: string, waveIndex: number): Promise<void> {
    if (await this.checkWaveCompletion(wavePlanId, waveIndex)) {
      await this.onWaveComplete(wavePlanId, waveIndex);
      return;
    }

    if (this.onCapacityFreed) {
      // Backfill must never resurface as a task-completion failure: the
      // completion itself is already committed.
      try {
        await this.onCapacityFreed(wavePlanId, waveIndex);
      } catch {
        // Swallowed deliberately; the next terminal task retries the backfill.
      }
    }
  }

  /**
   * Handle task started event.
   * Idempotently marks the wave task 'running'; a task already in a terminal
   * state is not resurrected (a late job:started after completion is ignored).
   */
  async handleTaskStarted(
    wavePlanId: string,
    taskCode: string,
    sessionId: string
  ): Promise<void> {
    const task = await this.db.query.waveTasks.findFirst({
      where: and(
        eq(waveTasks.wavePlanId, wavePlanId),
        eq(waveTasks.taskCode, taskCode)
      ),
    });
    if (!task || TERMINAL_TASK_STATUSES.has(task.status)) {
      return;
    }

    await this.db
      .update(waveTasks)
      .set({
        status: 'running',
        assignedSessionId: sessionId,
        startedAt: new Date(),
      })
      .where(
        and(
          eq(waveTasks.wavePlanId, wavePlanId),
          eq(waveTasks.taskCode, taskCode)
        )
      );

    await this.emitEvent({
      type: 'wave_task_dispatched',
      wavePlanId,
      taskCode,
      sessionId,
    });
  }

  /**
   * Handle task completion event.
   * Updates task status, stores completion summary, and checks if wave is complete.
   */
  async handleTaskComplete(
    wavePlanId: string,
    taskCode: string,
    completionSummary?: string
  ): Promise<void> {
    // Get the task to find its wave index
    const task = await this.db.query.waveTasks.findFirst({
      where: and(
        eq(waveTasks.wavePlanId, wavePlanId),
        eq(waveTasks.taskCode, taskCode)
      ),
    });

    if (!task) {
      throw new Error(`Task ${taskCode} not found in wave plan ${wavePlanId}`);
    }

    // Idempotency guard: a duplicate completion callback is a no-op (§9.5).
    if (task.status === 'completed') {
      return;
    }

    // Update task status to completed; store the summary in its own column
    // (not errorMessage).
    await this.db
      .update(waveTasks)
      .set({
        status: 'completed',
        completedAt: new Date(),
        completionSummary: completionSummary ?? null,
      })
      .where(
        and(
          eq(waveTasks.wavePlanId, wavePlanId),
          eq(waveTasks.taskCode, taskCode)
        )
      );

    await this.emitEvent({
      type: 'wave_task_complete',
      wavePlanId,
      taskCode,
      waveIndex: task.waveIndex,
    });

    await this.settleWave(wavePlanId, task.waveIndex);
  }

  /**
   * Handle task failure event.
   * Updates task status based on retry count and emits failure event.
   */
  async handleTaskFailed(
    wavePlanId: string,
    taskCode: string,
    error: string,
    retryCount: number
  ): Promise<void> {
    // Retry within the configured limit, else terminal failure.
    const status = retryCount < this.retryLimit ? 'retrying' : 'failed';

    await this.db
      .update(waveTasks)
      .set({
        status,
        errorMessage: error,
        retryCount,
      })
      .where(
        and(
          eq(waveTasks.wavePlanId, wavePlanId),
          eq(waveTasks.taskCode, taskCode)
        )
      );

    await this.emitEvent({
      type: 'wave_task_failed',
      wavePlanId,
      taskCode,
      error,
    });

    // A failed task frees its slot exactly as a completed one does, and a
    // `retrying` task is itself re-dispatch-eligible — so settle here too.
    // Previously this path checked nothing at all: a wave whose last outstanding
    // task failed would never be recognised as finished.
    const failed = await this.db.query.waveTasks.findFirst({
      where: and(
        eq(waveTasks.wavePlanId, wavePlanId),
        eq(waveTasks.taskCode, taskCode)
      ),
    });
    if (failed) {
      await this.settleWave(wavePlanId, failed.waveIndex);
    }
  }

  /**
   * Check if all tasks in a wave are complete.
   * Returns true if all tasks are in a terminal state (completed, failed, or skipped).
   */
  private async checkWaveCompletion(
    wavePlanId: string,
    waveIndex: number
  ): Promise<boolean> {
    const tasks = await this.db.query.waveTasks.findMany({
      where: and(
        eq(waveTasks.wavePlanId, wavePlanId),
        eq(waveTasks.waveIndex, waveIndex)
      ),
    });

    // Wave is complete if all tasks are in a terminal state
    return tasks.every(
      (task: WaveTask) =>
        task.status === 'completed' ||
        task.status === 'failed' ||
        task.status === 'skipped'
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
      case 'wave_task_failed':
        message = `Task ${event.taskCode} failed: ${event.error}`;
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
