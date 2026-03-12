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
