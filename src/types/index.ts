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

export interface ConductorScore {
  total: number;
  fleetUtilization: number;
  runwayHealth: number;
  planAccuracy: number;
  costEfficiency: number;
  velocityTrend: number;
  leaderboardRank: number | null;
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
