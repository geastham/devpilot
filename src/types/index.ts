// ============================================================================
// DevPilot Core Types - Based on TRD v0.4
// ============================================================================

// Enums
export type Zone = 'READY' | 'REFINING' | 'SHAPING' | 'DIRECTIONAL';
export type Complexity = 'S' | 'M' | 'L' | 'XL';
export type Model = 'haiku' | 'sonnet' | 'opus';
export type SessionStatus = 'active' | 'needs-spec' | 'complete' | 'error';
export type FileStatus = 'available' | 'in-flight' | 'recently-modified';
export type RunwayStatus = 'healthy' | 'amber' | 'critical';
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type EventType =
  | 'session_progress'
  | 'session_complete'
  | 'session_needs_spec'
  | 'file_unlocked'
  | 'plan_ready'
  | 'plan_approved'
  | 'item_dispatched'
  | 'runway_update'
  | 'score_update'
  | 'wave_advance'
  | 'wave_task_complete'
  | 'wave_plan_complete'
  | 'wave_plan_paused'
  | 'wave_plan_resumed';

// ============================================================================
// Core Data Models
// ============================================================================

export interface HorizonItem {
  id: string;
  title: string;
  zone: Zone;
  repo: string;
  complexity: Complexity | null;
  priority: number;
  plan: Plan | null;
  linearTicketId: string | null;
  createdAt: Date;
  updatedAt: Date;
  conflictingFiles: InFlightFile[];
  /**
   * Live conductor run state, present on REFINING items that have been through
   * the planning agent. Distinct from `plan`, which is the legacy workstream
   * shape and stays null for conductor runs until a plan is approved and
   * persisted. See `conductorSummary` in /api/items.
   */
  conductor?: ConductorSummary | null;
}

/** What the board needs to show about an in-flight conductor run. */
export interface ConductorSummary {
  status: string;
  /** 'review' means a human is the blocker; 'wave' means agents are running. */
  awaiting: 'review' | 'wave' | null;
  waveCount: number;
  taskCount: number;
  waveNames: string[];
  parallelizationScore: number | null;
  currentWaveIndex: number;
  wavePlanId: string | null;
  /**
   * How the run stands, from its wave plan row once it has one: `completed`,
   * `failed`, `paused`, `executing`… Null before approval, when the plan lives
   * only in the graph's checkpoint.
   */
  planStatus: string | null;
  /** Why a plan is failed, or paused when nobody paused it. */
  planReason: string | null;
  /**
   * The local branch the run's work was merged into, for a run whose tasks
   * each had their own branch. Null until the first wave is merged, and for a
   * run that could not be isolated — whose changes are uncommitted edits in the
   * checkout instead.
   */
  runBranch: string | null;
}

export interface Plan {
  id: string;
  version: number;
  previousPlan: Plan | null;
  workstreams: Workstream[];
  sequentialTasks: Task[];
  estimatedCostUsd: number;
  baselineCostUsd: number;
  acceptanceCriteria: string[];
  filesTouched: TouchedFile[];
  fleetContextSnapshot: FleetContextSnapshot;
  memorySessionsUsed: MemorySession[];
  confidenceSignals: ConfidenceSignals;
  generatedAt: Date;
}

export interface Workstream {
  id: string;
  label: string;
  repo: string;
  workerCount: number;
  tasks: Task[];
}

export interface Task {
  id: string;
  label: string;
  model: Model;
  modelOverride: Model | null;
  complexity: Complexity;
  estimatedCostUsd: number;
  filePaths: string[];
  conflictWarning: string | null;
  dependsOn: string[];
}

// ============================================================================
// Fleet Models
// ============================================================================

export interface RufloSession {
  id: string;
  repo: string;
  linearTicketId: string;
  ticketTitle: string;
  currentWorkstream: string;
  progressPercent: number;
  elapsedMinutes: number;
  estimatedRemainingMinutes: number;
  status: SessionStatus;
  inFlightFiles: string[];
  completedTasks: CompletedTask[];
  /**
   * What the agent is doing right now, streamed from the session runner.
   *
   * Absent for sessions that predate telemetry, or when the runner is an older
   * build — every reader must treat it as optional rather than assuming the
   * instrument is always lit.
   */
  telemetry?: AgentTelemetry | null;
}

/** The live picture of one agent. Mirrors the runner's `SessionTelemetry`. */
export interface AgentTelemetry {
  toolCalls?: number;
  filesTouched?: string[];
  filesRead?: string[];
  commands?: string[];
  lastText?: string;
  lastAction?: { tool: string; path?: string; atMs: number };
  actions?: { tool: string; path?: string; atMs: number }[];
  costUsd?: number;
  tokensIn?: number;
  tokensOut?: number;
  turns?: number;
  elapsedMs?: number;
  idleMs?: number;
}

export interface CompletedTask {
  label: string;
  completedAt: Date;
  model?: Model;
  durationMinutes?: number;
}

export interface FleetState {
  sessions: RufloSession[];
  runwayHours: number;
  runwayStatus: RunwayStatus;
  conductorScore: ConductorScore;
  avgVelocityTasksPerHour: number;
  planningVelocityPerHour: number;
  velocityRatio: number;
}

// ============================================================================
// Supporting Types
// ============================================================================

export interface InFlightFile {
  path: string;
  activeSessionId: string;
  linearTicketId: string;
  estimatedMinutesRemaining: number;
}

export interface TouchedFile {
  path: string;
  status: FileStatus;
  inFlightVia?: string;
}

export interface MemorySession {
  date: Date;
  ticketId: string;
  summary: string;
  constraintApplied: string;
}

export interface FleetContextSnapshot {
  availableWorkers: Record<string, number>;
  avoidedFiles: string[];
  deferredReason: string | null;
}

export interface ConfidenceSignals {
  parallelization: ConfidenceLevel;
  conflictRisk: ConfidenceLevel;
  complexityCalibration: ConfidenceLevel;
  costEstimateAccuracy: ConfidenceLevel;
}

// ============================================================================
// Conductor Score
// ============================================================================

/** One dimension of the score, as the cockpit renders it. */
export interface ConductorScoreDimension {
  key: string;
  label: string;
  meaning: string;
  max: number;
  /** Whole points, or null when the events to measure it were not recorded. */
  value: number | null;
  /** Why it is unmeasured, in one sentence. Null when it was measured. */
  unmeasured: string | null;
}

/**
 * The Conductor Score as computed by `/api/fleet/state`.
 *
 * `total` is out of `measuredMax`, NOT out of `max`: a dimension that could
 * not be measured adds nothing to either. Showing `total / 1000` would present
 * every unmeasured dimension as a zero.
 */
export interface ConductorScore {
  total: number;
  measuredMax: number;
  max: number;
  /** True only when all dimensions were measured. Only then is it comparable. */
  complete: boolean;
  dimensions: ConductorScoreDimension[];
  windowHours: number;
  modelVersion: number;
}

export interface ScoreHistory {
  date: Date;
  total: number;
  fleetUtilization: number;
  runwayHealth: number;
  planAccuracy: number;
  costEfficiency: number;
  velocityTrend: number;
}

// ============================================================================
// Activity Events
// ============================================================================

export interface ActivityEvent {
  id: string;
  type: EventType;
  message: string;
  repo?: string;
  ticketId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

// ============================================================================
// WebSocket/SSE Message Types
// ============================================================================

export type FleetUpdate =
  | { type: 'session_progress'; sessionId: string; progress: number }
  | { type: 'session_complete'; sessionId: string; ticketId: string }
  | { type: 'session_needs_spec'; sessionId: string }
  | { type: 'file_unlocked'; filePath: string; sessionId: string }
  | { type: 'plan_ready'; itemId: string; plan: Plan }
  | { type: 'runway_update'; runwayHours: number; status: RunwayStatus };

// ============================================================================
// UI State Types
// ============================================================================

export type LayoutVariant = 'gradient-strip' | 'mission-control' | 'three-panel' | 'timeline';

export interface AssistSuggestion {
  id: string;
  type: 'urgent' | 'warning' | 'confirmation' | 'info';
  message: string;
  chips: SuggestionChip[];
  action?: {
    label: string;
    handler: () => void;
  };
  timestamp: Date;
}

export interface SuggestionChip {
  label: string;
  type: 'ticket' | 'repo' | 'keyword';
  onClick?: () => void;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T> {
  data: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ============================================================================
// Wave Plan Types
// ============================================================================

export type WavePlanStatus = 'draft' | 'approved' | 'executing' | 'paused' | 're-optimizing' | 'completed' | 'failed';
export type WaveStatus = 'pending' | 'ready' | 'executing' | 'completed' | 'blocked';
export type WaveTaskStatus = 'pending' | 'ready' | 'dispatched' | 'running' | 'completed' | 'failed' | 'blocked';
export type DependencyEdgeType = 'file' | 'logical' | 'external';

export interface WavePlan {
  id: string;
  horizonItemId: string;
  planId: string;
  version: number;
  status: WavePlanStatus;
  totalWaves: number;
  currentWaveIndex: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  estimatedTotalMinutes: number;
  actualElapsedMinutes: number;
  createdAt: Date;
  updatedAt: Date;
  previousWavePlanId: string | null;
  waves: Wave[];
  waveTasks: WaveTask[];
  dependencyEdges: DependencyEdge[];
  metrics?: WavePlanMetric;
}

export interface Wave {
  id: string;
  wavePlanId: string;
  waveIndex: number;
  status: WaveStatus;
  taskCount: number;
  completedTaskCount: number;
  estimatedMinutes: number;
  actualMinutes: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  tasks: WaveTask[];
}

export interface WaveTask {
  id: string;
  wavePlanId: string;
  waveId: string | null;
  taskId: string;
  waveIndex: number;
  status: WaveTaskStatus;
  dispatchedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  rufloSessionId: string | null;
  errorMessage: string | null;
}

export interface DependencyEdge {
  id: string;
  wavePlanId: string;
  sourceTaskId: string;
  targetTaskId: string;
  edgeType: DependencyEdgeType;
  blockerFilePath: string | null;
  strengthScore: number;
}

export interface WavePlanMetric {
  id: string;
  wavePlanId: string;
  parallelismEfficiency: number;
  waveUtilization: number;
  criticalPathLength: number;
  avgWaveSize: number;
  taskDistributionVariance: number;
  estimatedCompletionTimeMinutes: number;
  createdAt: Date;
}

export interface WavePlanHeartbeat {
  id: string;
  horizonItemId: string;
  status: WavePlanStatus;
  currentWaveIndex: number;
  totalWaves: number;
  completedTasks: number;
  activeTasks: number;
  failedTasks: number;
  totalTasks: number;
}
