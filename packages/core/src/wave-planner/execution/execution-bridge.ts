/**
 * ExecutionBridge (spec/trd/01-TIER1-EXECUTION-LOOP.md §6.5).
 *
 * Subscribes to the OrchestratorService event stream and routes job:* events to
 * the wave execution machinery, correlating each event's DevPilot sessionId to
 * its owning wave task via waveTasks.assignedSessionId. This is what lets a
 * finished session advance its wave (and survives process restarts, since the
 * correlation lives in the DB rather than the service's in-memory mappings).
 */

import { eq } from 'drizzle-orm';
import { getDatabase, type Database } from '../../db';
import { waveTasks, activityEvents } from '../../db/schema';
import type {
  OrchestratorService,
  OrchestratorEvent,
  CompletionReport,
} from '../../orchestrator';
import { WaveDispatchCoordinator } from './dispatch-coordinator';
import { WaveExecutionController } from './controller';
import { CompletionListener } from './completion-listener';
import type { WaveExecutionConfig } from './types';

export interface ExecutionBridgeOptions {
  execution: WaveExecutionConfig;
}

let bridgeInstance: ExecutionBridge | null = null;

export class ExecutionBridge {
  private db: Database;
  private coordinator: WaveDispatchCoordinator;
  private controller: WaveExecutionController;
  private listener: CompletionListener;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private orchestrator: OrchestratorService,
    options: ExecutionBridgeOptions
  ) {
    this.db = getDatabase();
    this.coordinator = new WaveDispatchCoordinator(options.execution);
    this.controller = new WaveExecutionController(options.execution, this.coordinator);
    this.listener = new CompletionListener(
      (wavePlanId, waveIndex) => this.controller.handleWaveComplete(wavePlanId, waveIndex),
      {
        retryLimit: options.execution.retryLimit,
        // Re-run the wave's dispatcher whenever a slot frees. `dispatchWave`
        // re-selects pending/retrying tasks and respects the concurrency cap, so
        // calling it again is safe and is what drains a wave larger than the cap.
        onCapacityFreed: (wavePlanId, waveIndex) =>
          this.controller.dispatchWave(wavePlanId, waveIndex).then(() => undefined),
      }
    );
  }

  /** Subscribe to orchestrator events. Idempotent. */
  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.orchestrator.onEvent((event) => {
      // Fire-and-forget: the handler isolates its own faults.
      void this.handleEvent(event);
    });
  }

  /** Unsubscribe. */
  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  /** Resolve a DevPilot sessionId to its owning wave task, if any. */
  private async resolveTask(
    sessionId: string
  ): Promise<{ wavePlanId: string; taskCode: string } | null> {
    const task = await this.db.query.waveTasks.findFirst({
      where: eq(waveTasks.assignedSessionId, sessionId),
    });
    if (!task) return null;
    return { wavePlanId: task.wavePlanId, taskCode: task.taskCode };
  }

  private async handleEvent(event: OrchestratorEvent): Promise<void> {
    try {
      // Session-level progress lives on rufloSessions via callbacks/poller.
      if (event.type === 'job:progress') return;

      const found = await this.resolveTask(event.sessionId);
      if (!found) return; // non-wave session (plain fleet dispatch) — ignore.
      const { wavePlanId, taskCode } = found;

      switch (event.type) {
        case 'job:started':
          await this.listener.handleTaskStarted(wavePlanId, taskCode, event.sessionId);
          break;
        case 'job:complete': {
          const report = event.data as CompletionReport;
          await this.listener.handleTaskComplete(wavePlanId, taskCode, report.summary);
          break;
        }
        case 'job:error':
          await this.controller.onTaskFailed(wavePlanId, taskCode, this.errorMessage(event.data));
          break;
        case 'job:cancelled':
          // Cancellation is terminal — skip retry, go straight to failure.
          await this.controller.cancelTask(wavePlanId, taskCode, 'cancelled');
          break;
      }
    } catch (err) {
      // Fault isolation: one bad event must not tear down the subscription.
      try {
        await this.db.insert(activityEvents).values({
          type: 'WAVE_TASK_FAILED',
          message: `ExecutionBridge handler error for session ${event.sessionId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
          metadata: { sessionId: event.sessionId, eventType: event.type },
        });
      } catch {
        // Nothing more we can do if even the error insert fails.
      }
    }
  }

  /** Extract a human-readable error from a job:error payload. */
  private errorMessage(data: OrchestratorEvent['data']): string {
    if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>;
      if (typeof d.error === 'string') return d.error;
      if (d.error && typeof d.error === 'object' && 'message' in d.error) {
        return String((d.error as { message: unknown }).message);
      }
      if (typeof d.summary === 'string') return d.summary;
      if (typeof d.message === 'string') return d.message;
    }
    return 'error';
  }
}

/** Initialize (or replace) the process-wide ExecutionBridge singleton. */
export function initExecutionBridge(
  orchestrator: OrchestratorService,
  options: ExecutionBridgeOptions
): ExecutionBridge {
  if (bridgeInstance) {
    bridgeInstance.stop();
  }
  bridgeInstance = new ExecutionBridge(orchestrator, options);
  return bridgeInstance;
}

export function getExecutionBridgeOrNull(): ExecutionBridge | null {
  return bridgeInstance;
}
