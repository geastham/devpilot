// Shared enum values for both SQLite and Postgres
// Note: SQLite doesn't have native enums, so we use text with constraints

export const zoneValues = ['READY', 'REFINING', 'SHAPING', 'DIRECTIONAL'] as const;
export type Zone = (typeof zoneValues)[number];

export const complexityValues = ['S', 'M', 'L', 'XL'] as const;
export type Complexity = (typeof complexityValues)[number];

export const modelValues = ['HAIKU', 'SONNET', 'OPUS'] as const;
export type Model = (typeof modelValues)[number];

export const sessionStatusValues = ['ACTIVE', 'NEEDS_SPEC', 'COMPLETE', 'ERROR'] as const;
export type SessionStatus = (typeof sessionStatusValues)[number];

export const fileStatusValues = ['AVAILABLE', 'IN_FLIGHT', 'RECENTLY_MODIFIED'] as const;
export type FileStatus = (typeof fileStatusValues)[number];

export const eventTypeValues = [
  'SESSION_PROGRESS',
  'SESSION_COMPLETE',
  'PLAN_GENERATED',
  'PLAN_APPROVED',
  'ITEM_CREATED',
  'ITEM_DISPATCHED',
  'RUNWAY_UPDATE',
  'FILE_UNLOCKED',
  'SCORE_UPDATE',
  // Wave Planner events
  'WAVE_PLAN_CREATED',
  'WAVE_DISPATCHING',
  'WAVE_TASK_DISPATCHED',
  'WAVE_TASK_COMPLETE',
  'WAVE_TASK_FAILED',
  'WAVE_COMPLETE',
  'WAVE_ADVANCE',
  'WAVE_PLAN_COMPLETE',
  'WAVE_PLAN_FAILED',
  'WAVE_PLAN_REOPTIMIZING',
] as const;
export type EventType = (typeof eventTypeValues)[number];

export const orchestratorModeValues = ['http', 'ao-cli', 'manual', 'disabled'] as const;
export type OrchestratorMode = (typeof orchestratorModeValues)[number];

// Wave Planner enums
export const wavePlanStatusValues = [
  'draft',
  'approved',
  'executing',
  'paused',
  'completed',
  'failed',
  're-optimizing',
] as const;
export type WavePlanStatus = (typeof wavePlanStatusValues)[number];

export const waveStatusValues = [
  'pending',
  'dispatching',
  'active',
  'completed',
  'failed',
  'skipped',
] as const;
export type WaveStatus = (typeof waveStatusValues)[number];

export const waveTaskStatusValues = [
  'pending',
  'dispatched',
  'running',
  'completed',
  'failed',
  'retrying',
  'skipped',
] as const;
export type WaveTaskStatus = (typeof waveTaskStatusValues)[number];

export const dependencyEdgeTypeValues = ['hard', 'soft'] as const;
export type DependencyEdgeType = (typeof dependencyEdgeTypeValues)[number];
