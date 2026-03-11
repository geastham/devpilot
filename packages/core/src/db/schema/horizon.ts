import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { zoneValues, complexityValues, modelValues, fileStatusValues } from './enums';

// ============================================================================
// Horizon Items
// ============================================================================

export const horizonItems = sqliteTable('horizon_items', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  title: text('title').notNull(),
  zone: text('zone', { enum: zoneValues }).notNull().default('DIRECTIONAL'),
  repo: text('repo').notNull(),
  complexity: text('complexity', { enum: complexityValues }),
  priority: integer('priority').notNull().default(0),
  linearTicketId: text('linear_ticket_id'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const horizonItemsRelations = relations(horizonItems, ({ one, many }) => ({
  plan: one(plans, {
    fields: [horizonItems.id],
    references: [plans.horizonItemId],
  }),
  conflictingFiles: many(inFlightFiles),
}));

// ============================================================================
// Plans
// ============================================================================

export const plans = sqliteTable('plans', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  version: integer('version').notNull().default(1),
  horizonItemId: text('horizon_item_id').notNull().unique(),
  estimatedCostUsd: real('estimated_cost_usd').notNull(),
  baselineCostUsd: real('baseline_cost_usd').notNull(),
  acceptanceCriteria: text('acceptance_criteria', { mode: 'json' }).$type<string[]>().notNull(),
  confidenceSignals: text('confidence_signals', { mode: 'json' }).$type<{
    parallelization?: string;
    conflictRisk?: string;
    complexityCalibration?: string;
    costEstimateAccuracy?: string;
    hasMemory?: boolean;
    recentlyModifiedFiles?: number;
    similarTasksCompleted?: number;
    overallConfidence?: number;
  }>().notNull(),
  fleetContextSnapshot: text('fleet_context_snapshot', { mode: 'json' }).$type<{
    activeSessions?: number;
    availableWorkers?: Record<string, number>;
    avoidedFiles?: string[];
    deferredReason?: string | null;
    inFlightFiles?: { path: string; sessionId: string; eta: number }[];
    timestamp?: string;
  }>().notNull(),
  memorySessionsUsed: text('memory_sessions_used', { mode: 'json' }).$type<{
    date: string;
    ticketId: string;
    summary: string;
    constraintApplied: string;
  }[]>().default([]),
  previousPlanId: text('previous_plan_id'),
  generatedAt: integer('generated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const plansRelations = relations(plans, ({ one, many }) => ({
  horizonItem: one(horizonItems, {
    fields: [plans.horizonItemId],
    references: [horizonItems.id],
  }),
  workstreams: many(workstreams),
  sequentialTasks: many(tasks, { relationName: 'sequentialTasks' }),
  filesTouched: many(touchedFiles),
  previousPlan: one(plans, {
    fields: [plans.previousPlanId],
    references: [plans.id],
    relationName: 'planHistory',
  }),
}));

// ============================================================================
// Workstreams
// ============================================================================

export const workstreams = sqliteTable('workstreams', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  planId: text('plan_id').notNull(),
  label: text('label').notNull(),
  repo: text('repo').notNull(),
  workerCount: integer('worker_count').notNull().default(1),
  orderIndex: integer('order_index').notNull().default(0),
});

export const workstreamsRelations = relations(workstreams, ({ one, many }) => ({
  plan: one(plans, {
    fields: [workstreams.planId],
    references: [plans.id],
  }),
  tasks: many(tasks),
}));

// ============================================================================
// Tasks
// ============================================================================

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  label: text('label').notNull(),
  model: text('model', { enum: modelValues }).notNull().default('SONNET'),
  modelOverride: text('model_override', { enum: modelValues }),
  complexity: text('complexity', { enum: complexityValues }).notNull(),
  estimatedCostUsd: real('estimated_cost_usd').notNull(),
  filePaths: text('file_paths', { mode: 'json' }).$type<string[]>().notNull(),
  conflictWarning: text('conflict_warning'),
  dependsOn: text('depends_on', { mode: 'json' }).$type<string[]>().default([]),
  orderIndex: integer('order_index').notNull().default(0),
  // Either belongs to a workstream OR is a sequential task on a plan
  workstreamId: text('workstream_id'),
  planId: text('plan_id'),
});

export const tasksRelations = relations(tasks, ({ one }) => ({
  workstream: one(workstreams, {
    fields: [tasks.workstreamId],
    references: [workstreams.id],
  }),
  plan: one(plans, {
    fields: [tasks.planId],
    references: [plans.id],
    relationName: 'sequentialTasks',
  }),
}));

// ============================================================================
// Touched Files
// ============================================================================

export const touchedFiles = sqliteTable('touched_files', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  planId: text('plan_id').notNull(),
  path: text('path').notNull(),
  status: text('status', { enum: fileStatusValues }).notNull().default('AVAILABLE'),
  inFlightVia: text('in_flight_via'),
});

export const touchedFilesRelations = relations(touchedFiles, ({ one }) => ({
  plan: one(plans, {
    fields: [touchedFiles.planId],
    references: [plans.id],
  }),
}));

// ============================================================================
// In-Flight Files (for conflict tracking)
// ============================================================================

export const inFlightFiles = sqliteTable('in_flight_files', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  path: text('path').notNull(),
  activeSessionId: text('active_session_id').notNull(),
  linearTicketId: text('linear_ticket_id').notNull(),
  estimatedMinutesRemaining: integer('estimated_minutes_remaining').notNull().default(30),
  horizonItemId: text('horizon_item_id'),
  lockedAt: integer('locked_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const inFlightFilesRelations = relations(inFlightFiles, ({ one }) => ({
  horizonItem: one(horizonItems, {
    fields: [inFlightFiles.horizonItemId],
    references: [horizonItems.id],
  }),
}));

// ============================================================================
// Conflicting Files (for blocking tracking)
// ============================================================================

export const conflictingFiles = sqliteTable('conflicting_files', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  horizonItemId: text('horizon_item_id').notNull(),
  path: text('path').notNull(),
  blockedBySessionId: text('blocked_by_session_id'),
  blockedByTicketId: text('blocked_by_ticket_id'),
  estimatedUnlockMinutes: integer('estimated_unlock_minutes'),
});

export const conflictingFilesRelations = relations(conflictingFiles, ({ one }) => ({
  horizonItem: one(horizonItems, {
    fields: [conflictingFiles.horizonItemId],
    references: [horizonItems.id],
  }),
}));

// ============================================================================
// Type Exports
// ============================================================================

export type HorizonItem = typeof horizonItems.$inferSelect;
export type NewHorizonItem = typeof horizonItems.$inferInsert;

export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;

export type Workstream = typeof workstreams.$inferSelect;
export type NewWorkstream = typeof workstreams.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export type TouchedFile = typeof touchedFiles.$inferSelect;
export type NewTouchedFile = typeof touchedFiles.$inferInsert;

export type InFlightFile = typeof inFlightFiles.$inferSelect;
export type NewInFlightFile = typeof inFlightFiles.$inferInsert;

export type ConflictingFile = typeof conflictingFiles.$inferSelect;
export type NewConflictingFile = typeof conflictingFiles.$inferInsert;
