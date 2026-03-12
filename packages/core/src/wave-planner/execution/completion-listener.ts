import { eq, and } from 'drizzle-orm';
import { getDatabase, type Database } from '../../db';
import { waveTasks, activityEvents, type WaveTask } from '../../db/schema';
import type { WaveSSEEvent } from './types';

/**
 * CompletionListener handles task completion events from the orchestrator.
 * It updates task statuses, tracks completion, and determines when waves are complete.
 */
export class CompletionListener {
  private db: Database;

  constructor(
    private onWaveComplete: (wavePlanId: string, waveIndex: number) => Promise<void>
  ) {
    this.db = getDatabase();
  }

  /**
   * Handle task started event.
   * Updates the wave task status to 'running' and records start time.
   */
  async handleTaskStarted(
    wavePlanId: string,
    taskCode: string,
    sessionId: string
  ): Promise<void> {
    await (this.db as any)
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

    // Update task status to completed
    await (this.db as any)
      .update(waveTasks)
      .set({
        status: 'completed',
        completedAt: new Date(),
        errorMessage: completionSummary || null,
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
    // Determine if we should mark as retrying or failed
    // Assuming retryLimit from config - for now, use a simple threshold
    const status = retryCount < 1 ? 'retrying' : 'failed';

    await (this.db as any)
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

    await (this.db as any).insert(activityEvents).values({
      type: event.type,
      message,
      metadata: event as unknown as Record<string, unknown>,
    });
  }
}
