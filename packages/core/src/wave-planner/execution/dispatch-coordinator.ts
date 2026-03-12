import { getDatabase } from '../../db';
import { waveTasks } from '../../db/schema/wave-planner';
import { eq, and } from 'drizzle-orm';
import type {
  WaveExecutionConfig,
  DispatchResult,
  DispatchError,
  WaveDispatchRequest,
  PredecessorSummary,
} from './types';
import type { WaveTask } from '../../db/schema/wave-planner';

/**
 * WaveDispatchCoordinator
 *
 * Handles batch dispatching of wave tasks with:
 * - Fleet capacity checking
 * - Batch processing with staggering
 * - Predecessor context gathering
 * - Dispatch request building
 */
export class WaveDispatchCoordinator {
  private config: WaveExecutionConfig;
  private db = getDatabase();

  constructor(config: WaveExecutionConfig) {
    this.config = config;
  }

  /**
   * Dispatch a wave of tasks
   * Checks fleet capacity, builds dispatch requests, and dispatches in batches with staggering
   */
  async dispatchWave(
    wavePlanId: string,
    waveIndex: number,
    tasks: WaveTask[]
  ): Promise<DispatchResult> {
    const result: DispatchResult = {
      dispatched: 0,
      queued: 0,
      errors: [],
    };

    // Filter only pending tasks
    const pendingTasks = tasks.filter(t => t.status === 'pending');

    if (pendingTasks.length === 0) {
      return result;
    }

    // Check fleet capacity
    const capacity = await this.checkFleetCapacity();
    if (!capacity.canDispatch) {
      // Queue all tasks
      result.queued = pendingTasks.length;
      return result;
    }

    // Determine how many tasks we can dispatch
    const maxDispatch = Math.min(
      pendingTasks.length,
      capacity.availableWorkers,
      this.config.maxConcurrentSubagents
    );

    // Dispatch tasks with staggering
    for (let i = 0; i < maxDispatch; i++) {
      const task = pendingTasks[i];

      try {
        // Get predecessor context
        const predecessorContext = await this.getPredecessorContext(wavePlanId, task.taskCode);

        // Build dispatch request
        const dispatchRequest = this.buildDispatchRequest(task, predecessorContext);

        // Dispatch to orchestrator
        await this.dispatchToOrchestrator(dispatchRequest);

        // Mark task as dispatched
        await this.db.update(waveTasks)
          .set({
            status: 'dispatched',
            startedAt: new Date(),
          })
          .where(eq(waveTasks.id, task.id));

        result.dispatched++;

        // Add delay between dispatches (staggering)
        if (i < maxDispatch - 1) {
          await this.delay(this.config.subagentDispatchDelayMs);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push({
          taskCode: task.taskCode,
          error: errorMessage,
        });

        // Mark task as failed
        await this.db.update(waveTasks)
          .set({
            status: 'failed',
            errorMessage: errorMessage,
            completedAt: new Date(),
          })
          .where(eq(waveTasks.id, task.id));
      }
    }

    // Queue remaining tasks
    result.queued = pendingTasks.length - maxDispatch;

    return result;
  }

  /**
   * Build a dispatch request for a task
   * Includes task details, file scope, model, predecessor context, and constraints
   */
  buildDispatchRequest(
    task: WaveTask,
    predecessorContext: PredecessorSummary[]
  ): WaveDispatchRequest {
    return {
      wavePlanId: task.wavePlanId,
      waveIndex: task.waveIndex,
      taskCode: task.taskCode,
      taskDescription: task.description,
      fileScope: task.filePaths || [],
      model: this.mapModelToDispatchModel(task.recommendedModel),
      predecessorContext,
      constraints: [], // TODO: Add constraints from wave plan or task
    };
  }

  /**
   * Get predecessor context for a task
   * Fetches completion summaries for task's dependencies
   */
  async getPredecessorContext(
    wavePlanId: string,
    taskCode: string
  ): Promise<PredecessorSummary[]> {
    // Get the task to find its dependencies
    const task = await this.db.query.waveTasks.findFirst({
      where: and(
        eq(waveTasks.wavePlanId, wavePlanId),
        eq(waveTasks.taskCode, taskCode)
      ),
    });

    if (!task || !task.dependencies || task.dependencies.length === 0) {
      return [];
    }

    // Get completed predecessor tasks
    const predecessorSummaries: PredecessorSummary[] = [];

    for (const depTaskCode of task.dependencies) {
      const depTask = await this.db.query.waveTasks.findFirst({
        where: and(
          eq(waveTasks.wavePlanId, wavePlanId),
          eq(waveTasks.taskCode, depTaskCode),
          eq(waveTasks.status, 'completed')
        ),
      });

      if (depTask) {
        predecessorSummaries.push({
          taskCode: depTask.taskCode,
          description: depTask.description,
          filesModified: depTask.filePaths || [],
          completionSummary: '', // TODO: Fetch from task completion data when available
        });
      }
    }

    return predecessorSummaries;
  }

  /**
   * Check fleet capacity
   * Returns available workers and whether new tasks can be dispatched
   */
  private async checkFleetCapacity(): Promise<{
    totalWorkers: number;
    activeWorkers: number;
    availableWorkers: number;
    canDispatch: boolean;
  }> {
    // Get count of currently running tasks across all wave plans
    const runningTasks = await this.db.query.waveTasks.findMany({
      where: eq(waveTasks.status, 'running'),
    });

    const activeWorkers = runningTasks.length;
    const totalWorkers = this.config.maxTotalActiveTasks;
    const availableWorkers = Math.max(0, totalWorkers - activeWorkers);
    const canDispatch = availableWorkers > 0;

    return {
      totalWorkers,
      activeWorkers,
      availableWorkers,
      canDispatch,
    };
  }

  /**
   * Dispatch to orchestrator
   * Placeholder for integration with external orchestrator
   * TODO: Implement actual dispatch to orchestrator service
   */
  private async dispatchToOrchestrator(request: WaveDispatchRequest): Promise<void> {
    // Placeholder for orchestrator integration
    // In production, this would call the orchestrator API to spawn a subagent

    // Example implementation:
    // const response = await fetch(`${orchestratorUrl}/dispatch`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(request),
    // });
    //
    // if (!response.ok) {
    //   throw new Error(`Failed to dispatch task ${request.taskCode}`);
    // }
    //
    // const { sessionId } = await response.json();
    // return sessionId;

    // For now, just log and simulate success
    console.log(`[WaveDispatchCoordinator] Would dispatch task ${request.taskCode}`);
  }

  /**
   * Map database model enum to dispatch model format
   */
  private mapModelToDispatchModel(model: string | null): 'haiku' | 'sonnet' | 'opus' {
    if (!model) {
      return 'sonnet'; // default
    }

    const modelLower = model.toLowerCase();
    if (modelLower === 'haiku') return 'haiku';
    if (modelLower === 'opus') return 'opus';
    return 'sonnet';
  }

  /**
   * Delay helper for staggering dispatches
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
