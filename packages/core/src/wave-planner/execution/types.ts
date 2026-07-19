import type { EventType } from '../../db/schema/enums';
import type { WaveSSEEvent } from '../types';

// ============================================================================
// Execution Configuration Types
// ============================================================================

export interface WaveExecutionConfig {
  maxConcurrentSubagents: number; // default: 4 - max tasks per wave plan
  maxTotalActiveTasks: number; // default: 8 - max tasks across all plans
  subagentDispatchDelayMs: number; // default: 500 - delay between dispatches
  waveAdvanceDelayMs: number; // default: 2000 - delay before advancing waves
  retryLimit: number; // default: 1 - max retries per task
  failurePolicy: 'halt' | 'continue'; // default: 'halt' - how to handle failures
  autoAdvance: boolean; // default: true - auto-advance to next wave
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
  linearTicketId?: string | null;
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
