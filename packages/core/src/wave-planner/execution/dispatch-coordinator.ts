import { getDatabase } from '../../db';
import { waveTasks, wavePlans } from '../../db/schema/wave-planner';
import { horizonItems } from '../../db/schema/horizon';
import { rufloSessions } from '../../db/schema/fleet';
import { eq, and } from 'drizzle-orm';
import {
  getOrchestratorServiceOrNull,
  buildSessionPrompt,
  type DispatchRequest,
} from '../../orchestrator';
import type {
  WaveExecutionConfig,
  DispatchResult,
  WaveDispatchRequest,
  PredecessorSummary,
  WaveDispatchContext,
  TaskDispatchOutcome,
} from './types';
import type { WaveTask } from '../../db/schema/wave-planner';

/**
 * WaveDispatchCoordinator
 *
 * Handles batch dispatching of wave tasks with:
 * - Fleet capacity checking
 * - Batch processing with staggering
 * - Predecessor context gathering
 * - Real dispatch to the OrchestratorService (session-native / ao-cli / http)
 */
export class WaveDispatchCoordinator {
  private config: WaveExecutionConfig;
  private db = getDatabase();

  constructor(config: WaveExecutionConfig) {
    this.config = config;
  }

  /**
   * Dispatch a wave of tasks.
   * Checks fleet capacity, builds dispatch requests, dispatches in batches with
   * staggering. Tasks that can't reach an orchestrator (unconfigured/disabled)
   * are left pending and counted as queued — never burned as failures (§9.1).
   */
  async dispatchWave(
    wavePlanId: string,
    _waveIndex: number,
    tasks: WaveTask[]
  ): Promise<DispatchResult> {
    const result: DispatchResult = {
      dispatched: 0,
      queued: 0,
      errors: [],
    };

    // Pending OR retrying tasks are eligible (resume re-dispatches retrying).
    const pendingTasks = tasks.filter(
      (t) => t.status === 'pending' || t.status === 'retrying'
    );

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

    // Load repo/title/ticket once per wave dispatch.
    const ctx = await this.loadDispatchContext(wavePlanId);

    // Dispatch tasks with staggering
    for (let i = 0; i < maxDispatch; i++) {
      const task = pendingTasks[i];

      try {
        const predecessorContext = await this.getPredecessorContext(wavePlanId, task.taskCode);
        const dispatchRequest = this.buildDispatchRequest(task, predecessorContext);
        const outcome = await this.dispatchToOrchestrator(task, dispatchRequest, ctx);

        // Commit assignedSessionId and status together.
        await this.db.update(waveTasks)
          .set({
            status: 'dispatched',
            startedAt: new Date(),
            assignedSessionId: outcome.sessionId,
          })
          .where(eq(waveTasks.id, task.id));

        result.dispatched++;

        // Add delay between dispatches (staggering)
        if (i < maxDispatch - 1) {
          await this.delay(this.config.subagentDispatchDelayMs);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // Back-pressure is not failure. Two cases leave the task `pending` so a
        // later dispatch pass picks it up:
        //
        //  - ORCHESTRATOR_UNAVAILABLE — dispatch is disabled/unconfigured; the
        //    work is retried once it is enabled.
        //  - CAPACITY — the runner answered 429 because its own concurrency cap
        //    was saturated. §7 of the session-runner contract is explicit that
        //    DevPilot *queues* here. It instead marked the task permanently
        //    `failed` with `retryCount` still 0, so a wave silently lost tasks
        //    whenever the fleet was busy — precisely the steady state when
        //    running 5–10 concurrent sessions, and observed live: two tasks of
        //    an eight-task wave died as `CAPACITY` while the wave itself stayed
        //    `active`, because this path bypasses the failure policy entirely.
        if (
          errorMessage === 'ORCHESTRATOR_UNAVAILABLE' ||
          errorMessage === 'CAPACITY' ||
          /\b429\b/.test(errorMessage)
        ) {
          result.queued++;
          continue;
        }

        result.errors.push({ taskCode: task.taskCode, error: errorMessage });

        await this.db.update(waveTasks)
          .set({
            status: 'failed',
            errorMessage,
            completedAt: new Date(),
          })
          .where(eq(waveTasks.id, task.id));
      }
    }

    // Queue tasks beyond this batch's capacity
    result.queued += pendingTasks.length - maxDispatch;

    return result;
  }

  /**
   * Re-dispatch a single task previously marked 'retrying' (controller retry
   * path). Honours the pause guard: if the plan is no longer executing, the
   * task stays 'retrying' and is counted as queued.
   */
  async redispatchTask(wavePlanId: string, taskCode: string): Promise<DispatchResult> {
    const result: DispatchResult = { dispatched: 0, queued: 0, errors: [] };

    const task = await this.db.query.waveTasks.findFirst({
      where: and(eq(waveTasks.wavePlanId, wavePlanId), eq(waveTasks.taskCode, taskCode)),
    });

    if (!task) {
      result.errors.push({ taskCode, error: 'NOT_FOUND' });
      return result;
    }

    if (task.status !== 'retrying') {
      result.errors.push({ taskCode, error: 'NOT_RETRYING' });
      return result;
    }

    // Pause guard (§9.4): only re-dispatch while the plan is executing.
    const plan = await this.db.query.wavePlans.findFirst({
      where: eq(wavePlans.id, wavePlanId),
    });
    if (plan?.status !== 'executing') {
      result.queued++;
      return result;
    }

    const ctx = await this.loadDispatchContext(wavePlanId);

    try {
      const predecessorContext = await this.getPredecessorContext(wavePlanId, taskCode);
      const request = this.buildDispatchRequest(task, predecessorContext);
      const outcome = await this.dispatchToOrchestrator(task, request, ctx);

      await this.db.update(waveTasks)
        .set({
          status: 'dispatched',
          startedAt: new Date(),
          assignedSessionId: outcome.sessionId,
        })
        .where(eq(waveTasks.id, task.id));

      result.dispatched++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage === 'ORCHESTRATOR_UNAVAILABLE') {
        result.queued++;
        return result;
      }
      await this.db.update(waveTasks)
        .set({ status: 'failed', errorMessage, completedAt: new Date() })
        .where(eq(waveTasks.id, task.id));
      result.errors.push({ taskCode, error: errorMessage });
    }

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
    const filePaths = task.filePaths || [];
    return {
      wavePlanId: task.wavePlanId,
      waveIndex: task.waveIndex,
      taskCode: task.taskCode,
      taskDescription: task.description,
      fileScope: filePaths,
      model: this.mapModelToDispatchModel(task.recommendedModel),
      predecessorContext,
      // File-scope guard rails so the session doesn't touch out-of-scope files.
      constraints:
        filePaths.length > 0
          ? [`Only modify files within: ${filePaths.join(', ')}`]
          : [],
    };
  }

  /**
   * Get predecessor context for a task
   * Fetches completion summaries for task's completed dependencies.
   */
  async getPredecessorContext(
    wavePlanId: string,
    taskCode: string
  ): Promise<PredecessorSummary[]> {
    const task = await this.db.query.waveTasks.findFirst({
      where: and(
        eq(waveTasks.wavePlanId, wavePlanId),
        eq(waveTasks.taskCode, taskCode)
      ),
    });

    if (!task || !task.dependencies || task.dependencies.length === 0) {
      return [];
    }

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
          completionSummary: depTask.completionSummary ?? '',
        });
      }
    }

    return predecessorSummaries;
  }

  /**
   * Load repo / item title / linear ticket for a wave plan (wavePlans →
   * horizonItems). Cached per dispatchWave call by the caller.
   */
  private async loadDispatchContext(wavePlanId: string): Promise<WaveDispatchContext> {
    const wavePlan = await this.db.query.wavePlans.findFirst({
      where: eq(wavePlans.id, wavePlanId),
    });
    if (!wavePlan) {
      throw new Error(`Wave plan ${wavePlanId} not found`);
    }

    const item = await this.db.query.horizonItems.findFirst({
      where: eq(horizonItems.id, wavePlan.horizonItemId),
    });
    if (!item) {
      throw new Error(`Horizon item ${wavePlan.horizonItemId} not found`);
    }

    return {
      repo: item.repo,
      itemTitle: item.title,
      linearTicketId: item.linearTicketId,
    };
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
   * Dispatch a single task to the orchestrator service.
   *
   * Creates a rufloSessions row, builds the session prompt + DispatchRequest,
   * dispatches through the active adapter, and records the session ↔ task
   * correlation on success. Throws 'ORCHESTRATOR_UNAVAILABLE' when no
   * orchestrator is configured (caller queues rather than fails the task).
   */
  private async dispatchToOrchestrator(
    task: WaveTask,
    request: WaveDispatchRequest,
    ctx: WaveDispatchContext
  ): Promise<TaskDispatchOutcome> {
    const service = getOrchestratorServiceOrNull();
    if (!service || !service.isEnabled) {
      throw new Error('ORCHESTRATOR_UNAVAILABLE');
    }

    // Create the DevPilot session row first so its id can seed the prompt and
    // correlate pushed callbacks.
    const [session] = await this.db.insert(rufloSessions)
      .values({
        repo: ctx.repo,
        linearTicketId: ctx.linearTicketId ?? `DP-${task.taskCode}-${Date.now()}`,
        ticketTitle: `${ctx.itemTitle} — ${task.taskCode} ${task.label}`,
        currentWorkstream: `Wave ${task.waveIndex}`,
        status: 'ACTIVE',
        progressPercent: 0,
        inFlightFiles: task.filePaths ?? [],
      })
      .returning();

    const prompt = buildSessionPrompt({
      taskDescription: request.taskDescription,
      repo: ctx.repo,
      fileScope: request.fileScope,
      predecessorContext: request.predecessorContext.map((p) => ({
        taskCode: p.taskCode,
        description: p.description,
        filesModified: p.filesModified,
        completionSummary: p.completionSummary,
      })),
      constraints: request.constraints,
      callbackUrl: this.config.callbackUrl,
      sessionId: session.id,
    });

    const dispatchReq: DispatchRequest = {
      sessionId: session.id,
      repo: ctx.repo,
      callbackUrl: this.config.callbackUrl,
      taskSpec: {
        prompt,
        filePaths: request.fileScope,
        model: request.model,
        workstream: `wave-${request.waveIndex}`,
        constraints: request.constraints,
      },
      linearTicketId: ctx.linearTicketId ?? undefined,
      metadata: {
        wavePlanId: request.wavePlanId,
        waveIndex: request.waveIndex,
        taskCode: request.taskCode,
      },
    };

    const response = await service.dispatch(dispatchReq);

    if (!response.accepted) {
      // Roll back the orphaned session row.
      await this.db.delete(rufloSessions).where(eq(rufloSessions.id, session.id));
      throw new Error(response.error ?? 'DISPATCH_REJECTED');
    }

    await this.db.update(rufloSessions)
      .set({
        externalSessionId: response.orchestratorJobId ?? null,
        orchestratorMode: service.mode,
        updatedAt: new Date(),
      })
      .where(eq(rufloSessions.id, session.id));

    return {
      sessionId: session.id,
      externalJobId: response.orchestratorJobId ?? '',
      mode: service.mode,
    };
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
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
