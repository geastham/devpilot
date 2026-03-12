import { getDatabase } from '../../db';
import { wavePlans, waves, waveTasks } from '../../db/schema/wave-planner';
import { eq, and } from 'drizzle-orm';
import type {
  WaveExecutionConfig,
  DispatchResult,
  WaveDispatchRequest,
} from './types';
import type { WaveTask } from '../../db/schema/wave-planner';
import { WaveDispatchCoordinator } from './dispatch-coordinator';

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
   * Dispatches current wave if not complete
   */
  async resume(wavePlanId: string): Promise<void> {
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

    // Update status to 'executing'
    await this.db.update(wavePlans)
      .set({
        status: 'executing',
        updatedAt: new Date(),
      })
      .where(eq(wavePlans.id, wavePlanId));

    // Dispatch current wave if not complete
    const currentWave = wavePlan.waves.find(w => w.waveIndex === wavePlan.currentWaveIndex);
    if (currentWave && currentWave.status !== 'completed') {
      await this.dispatchWave(wavePlanId, wavePlan.currentWaveIndex);
    }
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
   * Dispatch a wave
   * Gets wave tasks and uses dispatch coordinator to dispatch batch
   * Updates wave status: pending → dispatching → active
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

    // Update wave plan status to 'executing' if approved
    if (wavePlan.status === 'approved') {
      await this.db.update(wavePlans)
        .set({
          status: 'executing',
          startedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(wavePlans.id, wavePlanId));
    }

    // Update wave status to 'dispatching'
    await this.db.update(waves)
      .set({
        status: 'dispatching',
        startedAt: new Date(),
      })
      .where(eq(waves.id, wave.id));

    // Use dispatch coordinator to dispatch batch
    const result = await this.dispatchCoordinator.dispatchWave(
      wavePlanId,
      waveIndex,
      wave.tasks
    );

    // Update wave status to 'active'
    await this.db.update(waves)
      .set({
        status: 'active',
      })
      .where(eq(waves.id, wave.id));

    return result;
  }

  /**
   * Handle task completion
   * Updates task status, checks if wave is complete, and advances if autoAdvance is enabled
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

    // Check if wave is complete
    const task = await this.db.query.waveTasks.findFirst({
      where: and(
        eq(waveTasks.wavePlanId, wavePlanId),
        eq(waveTasks.taskCode, taskCode)
      ),
    });

    if (!task) {
      return;
    }

    const waveIndex = task.waveIndex;
    const isWaveComplete = await this.checkWaveComplete(wavePlanId, waveIndex);

    if (isWaveComplete) {
      // Mark wave as completed
      await this.db.update(waves)
        .set({
          status: 'completed',
          completedAt: new Date(),
        })
        .where(
          and(
            eq(waves.wavePlanId, wavePlanId),
            eq(waves.waveIndex, waveIndex)
          )
        );

      // Check if this is the last wave
      const wavePlan = await this.db.query.wavePlans.findFirst({
        where: eq(wavePlans.id, wavePlanId),
      });

      if (!wavePlan) {
        return;
      }

      const isLastWave = waveIndex === wavePlan.totalWaves - 1;

      if (isLastWave) {
        // Mark wave plan as completed
        await this.db.update(wavePlans)
          .set({
            status: 'completed',
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(wavePlans.id, wavePlanId));
      } else if (this.config.autoAdvance) {
        // Advance to next wave
        const nextWaveIndex = waveIndex + 1;
        await this.db.update(wavePlans)
          .set({
            currentWaveIndex: nextWaveIndex,
            updatedAt: new Date(),
          })
          .where(eq(wavePlans.id, wavePlanId));

        // Wait before dispatching next wave
        await this.delay(this.config.waveAdvanceDelayMs);

        // Dispatch next wave
        await this.dispatchWave(wavePlanId, nextWaveIndex);
      }
    }
  }

  /**
   * Handle task failure
   * Implements retry logic or marks as failed based on policy
   */
  async onTaskFailed(wavePlanId: string, taskCode: string, error: string): Promise<void> {
    // Get current task
    const task = await this.db.query.waveTasks.findFirst({
      where: and(
        eq(waveTasks.wavePlanId, wavePlanId),
        eq(waveTasks.taskCode, taskCode)
      ),
    });

    if (!task) {
      throw new Error(`Task ${taskCode} not found in plan ${wavePlanId}`);
    }

    // Check if we should retry
    if (task.retryCount < this.config.retryLimit) {
      // Mark as retrying and increment retry count
      await this.db.update(waveTasks)
        .set({
          status: 'retrying',
          retryCount: task.retryCount + 1,
          errorMessage: error,
        })
        .where(
          and(
            eq(waveTasks.wavePlanId, wavePlanId),
            eq(waveTasks.taskCode, taskCode)
          )
        );

      // TODO: Re-dispatch task to orchestrator
    } else {
      // Mark as failed
      await this.db.update(waveTasks)
        .set({
          status: 'failed',
          completedAt: new Date(),
          errorMessage: error,
        })
        .where(
          and(
            eq(waveTasks.wavePlanId, wavePlanId),
            eq(waveTasks.taskCode, taskCode)
          )
        );

      // Handle based on failure policy
      if (this.config.failurePolicy === 'halt') {
        // Mark wave plan as failed
        await this.db.update(wavePlans)
          .set({
            status: 'failed',
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(wavePlans.id, wavePlanId));

        // Mark wave as failed
        await this.db.update(waves)
          .set({
            status: 'failed',
            completedAt: new Date(),
          })
          .where(
            and(
              eq(waves.wavePlanId, wavePlanId),
              eq(waves.waveIndex, task.waveIndex)
            )
          );

        // Skip remaining tasks
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
      // If policy is 'continue', just mark task as failed and continue
    }
  }

  /**
   * Check if all tasks in a wave are complete
   */
  private async checkWaveComplete(wavePlanId: string, waveIndex: number): Promise<boolean> {
    const tasks = await this.db.query.waveTasks.findMany({
      where: and(
        eq(waveTasks.wavePlanId, wavePlanId),
        eq(waveTasks.waveIndex, waveIndex)
      ),
    });

    return tasks.every(task =>
      task.status === 'completed' || task.status === 'skipped' || task.status === 'failed'
    );
  }

  /**
   * Delay helper for wave advancement
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
