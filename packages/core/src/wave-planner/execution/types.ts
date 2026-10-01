import type { EventType } from '../../db/schema/enums';
import type { WaveSSEEvent } from '../types';

// ============================================================================
// Execution Configuration Types
// ============================================================================

export interface WaveExecutionConfig {
  /**
   * default: 4 — at most this many of ONE plan's tasks in flight
   * (`dispatched` + `running`). A cap, enforced by the dispatch claim; it used
   * to be the size of one dispatch call's batch, so two calls two seconds apart
   * put eight agents on a plan capped at four.
   */
  maxConcurrentSubagents: number;
  /**
   * default: 8 — at most this many tasks in flight across every live plan.
   * Counts `dispatched` + `running`; it used to count `running` alone, a status
   * nothing ever set, so the count was always zero.
   */
  maxTotalActiveTasks: number;
  subagentDispatchDelayMs: number; // default: 500 - delay between dispatches
  waveAdvanceDelayMs: number; // default: 2000 - delay before advancing waves
  retryLimit: number; // default: 1 - max retries per task
  failurePolicy: 'halt' | 'continue'; // default: 'halt' - how to handle failures
  /**
   * default: true — LEGACY PATH ONLY.
   *
   * Whether `WaveExecutionController.handleWaveComplete` starts the next wave
   * by itself. That method is the only reader of this flag, and the
   * `ExecutionBridge` calls it only for a plan that no `WaveDriver` owns — a
   * plan dispatched through `/api/wave-plans/:id/dispatch` with nothing else
   * sequencing it. A plan the conductor graph is running is advanced by the
   * graph and by nothing else, whatever this says; see `WaveDriver` in
   * `execution-bridge.ts` for why there must be exactly one.
   */
  autoAdvance: boolean;
  /** Base URL the executing agent POSTs callbacks to, e.g. "http://localhost:3000/api/orchestrator". */
  callbackUrl: string;
}

// ============================================================================
// Dispatch Context Types
// ============================================================================

/** Per-wave dispatch context loaded once from wavePlan → horizonItem. */
export interface WaveDispatchContext {
  repo: string;
  itemTitle: string;
  /** The item's ticket description, when it has one. Untrusted text. */
  itemDescription?: string | null;
  linearTicketId?: string | null;
  /**
   * The run the plan's tasks belong to (`wave_plans.run_id`), and whether each
   * task gets its own worktree and branch (`wave_plans.isolated`). Decided at
   * the plan's first dispatch; see `WaveDispatchCoordinator.ensureRun`.
   */
  run: { id: string; isolated: boolean };
}

/** Result of a single successful task dispatch. */
export interface TaskDispatchOutcome {
  sessionId: string; // rufloSessions.id
  externalJobId: string; // adapter job/session id
  mode: string; // OrchestratorMode
}

// ============================================================================
// Event Type Mapping
// ============================================================================

/**
 * Map a lowercase WaveSSEEvent type to its uppercase activity-event enum member.
 * The Record is exhaustive over WaveSSEEvent['type'], so adding an SSE event
 * without a mapping is a compile error, and every value is a valid EventType.
 */
const WAVE_SSE_TO_EVENT_TYPE: Record<WaveSSEEvent['type'], EventType> = {
  wave_plan_created: 'WAVE_PLAN_CREATED',
  wave_dispatching: 'WAVE_DISPATCHING',
  wave_task_dispatched: 'WAVE_TASK_DISPATCHED',
  wave_task_complete: 'WAVE_TASK_COMPLETE',
  wave_task_failed: 'WAVE_TASK_FAILED',
  wave_complete: 'WAVE_COMPLETE',
  wave_advance: 'WAVE_ADVANCE',
  wave_plan_complete: 'WAVE_PLAN_COMPLETE',
  wave_plan_failed: 'WAVE_PLAN_FAILED',
  wave_plan_reoptimizing: 'WAVE_PLAN_REOPTIMIZING',
};

/** Translate a WaveSSEEvent type to the activity_events enum value (uppercase). */
export function toActivityEventType(t: WaveSSEEvent['type']): EventType {
  return WAVE_SSE_TO_EVENT_TYPE[t];
}

// ============================================================================
// Dispatch Result Types
// ============================================================================

export interface DispatchResult {
  dispatched: number;
  queued: number;
  errors: DispatchError[];
}

export interface DispatchError {
  taskCode: string;
  error: string;
}

// ============================================================================
// Fleet Capacity Types
// ============================================================================

export interface FleetCapacity {
  totalWorkers: number;
  activeWorkers: number;
  availableWorkers: number;
  canDispatch: boolean;
}

// ============================================================================
// Wave Progress Tracking
// ============================================================================

export interface WaveProgress {
  waveIndex: number;
  totalTasks: number;
  completedTasks: number;
  runningTasks: number;
  failedTasks: number;
  status: 'pending' | 'dispatching' | 'active' | 'completed' | 'failed';
}

// ============================================================================
// Re-export relevant types from parent types.ts
// ============================================================================

export type {
  WaveDispatchRequest,
  PredecessorSummary,
  ActiveTaskInfo,
  WavePlanExecutionState,
  ParsedWavePlan,
  ParsedWave,
  ParsedTask,
  WaveSSEEvent,
} from '../types';
