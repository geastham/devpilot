import type { Model, Complexity } from '../db/schema/enums';

// ============================================================================
// Parser Output Types (intermediate representations from Claude response)
// ============================================================================

export interface ParsedWavePlan {
  waves: ParsedWave[];
  dependencyEdges: ParsedEdge[];
  criticalPath: string[];
  statistics: ParsedStatistics;
  rawMarkdown: string;
}

export interface ParsedWave {
  waveIndex: number;
  label: string;
  tasks: ParsedTask[];
}

export interface ParsedTask {
  taskCode: string; // "1.1", "4.3", etc.
  description: string;
  filePaths: string[];
  dependencies: string[]; // Task codes this depends on
  canRunInParallel: boolean;
  recommendedModel: 'haiku' | 'sonnet' | 'opus';
  complexity: 'S' | 'M' | 'L' | 'XL';
}

export interface ParsedEdge {
  from: string; // Task code
  to: string; // Task code
  type: 'hard' | 'soft';
}

export interface ParsedStatistics {
  totalTasks: number;
  totalWaves: number;
  maxParallelism: number;
  criticalPathLength: number;
  sequentialChains: number;
}

// ============================================================================
// Validation Types
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  correctedPlan?: ParsedWavePlan; // If auto-corrections were applied
}

export interface ValidationError {
  code: ValidationErrorCode;
  message: string;
  taskCodes?: string[];
  detail?: string;
}

export type ValidationErrorCode =
  | 'CYCLE_DETECTED'
  | 'MISSING_DEPENDENCY'
  | 'NO_ROOT_TASK'
  | 'EMPTY_PLAN'
  | 'DUPLICATE_TASK_CODE';

export interface ValidationWarning {
  code: ValidationWarningCode;
  message: string;
  taskCodes?: string[];
  detail?: string;
}

export type ValidationWarningCode =
  | 'FILE_OVERLAP_SAME_WAVE'
  | 'DANGLING_DEPENDENCY'
  | 'ORPHAN_SUBGRAPH'
  | 'STATISTICS_MISMATCH';

// ============================================================================
// Critical Path Types
// ============================================================================

export interface CriticalPathResult {
  path: string[]; // Ordered task codes on critical path
  length: number; // Number of tasks
  annotations: Map<string, CriticalPathAnnotation>;
}

export interface CriticalPathAnnotation {
  taskCode: string;
  isOnCriticalPath: boolean;
  distanceFromRoot: number; // Longest path from any root to this task
  distanceToEnd: number; // Longest path from this task to any terminal
  slack: number; // How much this task can be delayed without affecting total time
}

// ============================================================================
// Wave Assignment Types
// ============================================================================

export interface WaveAssignmentResult {
  waves: AssignedWave[];
  totalWaves: number;
  maxParallelism: number;
  adjustments: WaveAdjustment[]; // Record of any corrections made
}

export interface AssignedWave {
  waveIndex: number;
  label: string;
  tasks: ParsedTask[];
}

export interface WaveAdjustment {
  type: 'FILE_CONFLICT_BUMP' | 'CAPACITY_SPLIT';
  taskCode: string;
  fromWave: number;
  toWave: number;
  reason: string;
}

// ============================================================================
// Plan Scoring Types
// ============================================================================

export interface PlanScore {
  parallelizationScore: number; // 0-1, ratio of parallelizable work
  maxParallelism: number; // Peak tasks in any wave
  waveEfficiency: number; // Average tasks per wave
  dependencyDensity: number; // How interconnected the DAG is
  fileConflictScore: number; // How well conflicts are avoided (0-1)
  confidenceSignals: ConfidenceSignalUpdate;
}

export interface ConfidenceSignalUpdate {
  parallelization: 'HIGH' | 'MEDIUM' | 'LOW';
  conflictRisk: 'HIGH' | 'MEDIUM' | 'LOW';
}

// ============================================================================
// Graph Utility Types
// ============================================================================

export interface DAGNode {
  taskCode: string;
  inDegree: number;
  outDegree: number;
  dependencies: Set<string>;
  dependents: Set<string>;
  filePaths: Set<string>;
}

export interface TopologicalSortResult {
  order: string[];
  valid: boolean;
  cycleParticipants?: string[];
}

// ============================================================================
// Engine Configuration
// ============================================================================

export interface WavePlannerConfig {
  maxTasksPerWave?: number; // Fleet capacity limit
  minParallelizationScore?: number; // Threshold for iterative refinement
  enableAutoCorrection?: boolean; // Auto-fix minor validation issues
  strictFileOwnership?: boolean; // Fail on any file overlap vs. auto-bump
}

// ============================================================================
// Pipeline Result
// ============================================================================

export interface OptimizationResult {
  success: boolean;
  wavePlan?: ParsedWavePlan;
  criticalPath?: CriticalPathResult;
  waveAssignment?: WaveAssignmentResult;
  score?: PlanScore;
  validation?: ValidationResult;
  error?: string;
}

// ============================================================================
// Prompt Context Types (for AI integration)
// ============================================================================

export interface PromptContext {
  specContent: string;
  itemTitle: string;
  itemId: string;
  repo: string;
  fleetContext: FleetContextBlock;
  codebaseContext: CodebaseContextBlock;
  constraints: ConstraintBlock;
  memoryContext?: MemoryContextBlock;
  completedWork?: CompletedWorkBlock;
  remainingWork?: RemainingWorkBlock;
}

export interface FleetContextBlock {
  availableWorkers: Record<string, number>;
  inFlightFiles: {
    path: string;
    sessionId: string;
    ticketId: string;
    estimatedMinutesRemaining: number;
  }[];
  activeSessions: {
    repo: string;
    ticketId: string;
    progressPercent: number;
    estimatedRemainingMinutes: number;
  }[];
}

export interface CodebaseContextBlock {
  fileTree: string;
  recentlyModifiedFiles: string[];
  moduleStructure?: string;
}

export interface ConstraintBlock {
  avoidFiles: string[];
  preferModel?: 'haiku' | 'sonnet' | 'opus';
  maxCost?: number;
  maxConcurrency?: number;
  customConstraints: string[];
}

export interface MemoryContextBlock {
  relevantSessions: {
    date: string;
    ticketId: string;
    summary: string;
    constraintApplied?: string;
  }[];
}

export interface CompletedWorkBlock {
  tasks: {
    taskCode: string;
    description: string;
    filesModified: string[];
    completionSummary: string;
  }[];
}

export interface RemainingWorkBlock {
  tasks: {
    taskCode: string;
    description: string;
    originalDependencies: string[];
    originalFiles: string[];
  }[];
}

// ============================================================================
// AI Client Types
// ============================================================================

export interface GenerationResult {
  content: string;
  tokensInput: number;
  tokensOutput: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  durationMs: number;
  model: string;
}

// ============================================================================
// Execution Types
// ============================================================================

export interface WaveDispatchRequest {
  wavePlanId: string;
  waveIndex: number;
  taskCode: string;
  taskDescription: string;
  fileScope: string[];
  model: 'haiku' | 'sonnet' | 'opus';
  predecessorContext: PredecessorSummary[];
  constraints: string[];
}

export interface PredecessorSummary {
  taskCode: string;
  description: string;
  filesModified: string[];
  completionSummary: string;
}

export interface WavePlanExecutionState {
  wavePlanId: string;
  status: 'draft' | 'approved' | 'executing' | 'paused' | 'completed' | 'failed' | 're-optimizing';
  currentWaveIndex: number;
  activeTasks: Map<string, ActiveTaskInfo>;
  completedWaves: number[];
}

export interface ActiveTaskInfo {
  taskCode: string;
  wavePlanId: string;
  sessionId: string;
  startedAt: Date;
}

// ============================================================================
// SSE Event Types
// ============================================================================

export type WaveSSEEvent =
  | { type: 'wave_plan_created'; wavePlanId: string; itemId: string; totalWaves: number }
  | { type: 'wave_dispatching'; wavePlanId: string; waveIndex: number; taskCount: number }
  | { type: 'wave_task_dispatched'; wavePlanId: string; taskCode: string; sessionId: string }
  | { type: 'wave_task_complete'; wavePlanId: string; taskCode: string; waveIndex: number }
  | { type: 'wave_task_failed'; wavePlanId: string; taskCode: string; error: string }
  | { type: 'wave_complete'; wavePlanId: string; waveIndex: number; nextWaveIndex: number | null }
  | { type: 'wave_advance'; wavePlanId: string; fromWave: number; toWave: number }
  | { type: 'wave_plan_complete'; wavePlanId: string; metrics: object }
  | { type: 'wave_plan_failed'; wavePlanId: string; failedWave: number; failedTask: string }
  | { type: 'wave_plan_reoptimizing'; wavePlanId: string; reason: string };
