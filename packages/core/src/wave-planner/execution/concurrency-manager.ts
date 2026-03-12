import type { ActiveTaskInfo } from './types';

/**
 * ConcurrencyManager
 *
 * Manages concurrency limits for wave plan execution:
 * - Tracks active tasks across all wave plans
 * - Enforces maxTotalActiveTasks (global limit)
 * - Enforces maxConcurrentSubagents (per-plan limit)
 * - Provides checks before dispatching new tasks
 */
export class ConcurrencyManager {
  private activeTasks: Map<string, ActiveTaskInfo>;
  private config: {
    maxConcurrentSubagents: number;
    maxTotalActiveTasks: number;
  };

  constructor(config: { maxConcurrentSubagents: number; maxTotalActiveTasks: number }) {
    this.activeTasks = new Map();
    this.config = config;
  }

  /**
   * Check if we can dispatch additional tasks globally
   * @param count - Number of tasks to dispatch (default: 1)
   * @returns true if dispatch is allowed
   */
  canDispatch(count: number = 1): boolean {
    return this.activeTasks.size + count <= this.config.maxTotalActiveTasks;
  }

  /**
   * Check if a specific wave plan can accept more dispatches
   * @param wavePlanId - The wave plan to check
   * @returns true if the plan can accept more tasks
   */
  canDispatchToWave(wavePlanId: string): boolean {
    const activeForPlan = this.getActiveTasksForPlan(wavePlanId);
    return activeForPlan.length < this.config.maxConcurrentSubagents;
  }

  /**
   * Register a new active task
   * @param taskCode - Unique task identifier
   * @param wavePlanId - Parent wave plan ID
   * @param sessionId - Execution session ID
   */
  registerTask(taskCode: string, wavePlanId: string, sessionId: string): void {
    this.activeTasks.set(taskCode, {
      taskCode,
      wavePlanId,
      sessionId,
      startedAt: new Date(),
    });
  }

  /**
   * Unregister a completed or failed task
   * @param taskCode - Task identifier to remove
   */
  unregisterTask(taskCode: string): void {
    this.activeTasks.delete(taskCode);
  }

  /**
   * Get total number of active tasks across all plans
   * @returns Count of active tasks
   */
  getActiveTasks(): number {
    return this.activeTasks.size;
  }

  /**
   * Get all active task codes for a specific wave plan
   * @param wavePlanId - Wave plan to query
   * @returns Array of task codes
   */
  getActiveTasksForPlan(wavePlanId: string): string[] {
    const result: string[] = [];
    this.activeTasks.forEach((info, taskCode) => {
      if (info.wavePlanId === wavePlanId) {
        result.push(taskCode);
      }
    });
    return result;
  }

  /**
   * Get detailed info for a specific active task
   * @param taskCode - Task to query
   * @returns Task info or undefined if not active
   */
  getActiveTaskInfo(taskCode: string): ActiveTaskInfo | undefined {
    return this.activeTasks.get(taskCode);
  }

  /**
   * Get all active tasks (for debugging/monitoring)
   * @returns Map of all active tasks
   */
  getAllActiveTasks(): Map<string, ActiveTaskInfo> {
    return new Map(this.activeTasks);
  }

  /**
   * Reset the manager (useful for testing)
   */
  reset(): void {
    this.activeTasks.clear();
  }
}
