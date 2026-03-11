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
] as const;
export type EventType = (typeof eventTypeValues)[number];
