import { eq, and } from 'drizzle-orm';
import { getDatabase, type Database } from '../../db';
import { waveTasks, activityEvents, type WaveTask } from '../../db/schema';
import { toActivityEventType, type WaveSSEEvent } from './types';

export interface CompletionListenerOptions {
  /** Max retries per task before terminal failure. Default 1. */
  retryLimit?: number;
}

const TERMINAL_TASK_STATUSES = new Set(['completed', 'failed', 'skipped']);

/**
 * CompletionListener handles task completion events from the orchestrator.
 * It updates task statuses, tracks completion, and determines when waves are complete.
 */
export class CompletionListener {
  private db: Database;
  private retryLimit: number;

  constructor(
    private onWaveComplete: (wavePlanId: string, waveIndex: number) => Promise<void>,
    options?: CompletionListenerOptions
  ) {
    this.db = getDatabase();
    this.retryLimit = options?.retryLimit ?? 1;
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

    // Check if the entire wave is complete
    const isWaveComplete = await this.checkWaveCompletion(wavePlanId, task.waveIndex);

    if (isWaveComplete) {
      await this.onWaveComplete(wavePlanId, task.waveIndex);
    }
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
