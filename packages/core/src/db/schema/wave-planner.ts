import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import {
  wavePlanStatusValues,
  waveStatusValues,
  waveTaskStatusValues,
  dependencyEdgeTypeValues,
  modelValues,
  complexityValues,
} from './enums';
import { plans, horizonItems, tasks } from './horizon';

// ============================================================================
// Wave Plans
// ============================================================================

export const wavePlans = sqliteTable('wave_plans', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  planId: text('plan_id').notNull(),
  horizonItemId: text('horizon_item_id').notNull(),
  totalWaves: integer('total_waves').notNull(),
  totalTasks: integer('total_tasks').notNull(),
  maxParallelism: integer('max_parallelism').notNull(),
  criticalPath: text('critical_path', { mode: 'json' }).$type<string[]>().notNull(),
  criticalPathLength: integer('critical_path_length').notNull(),
  parallelizationScore: real('parallelization_score').notNull(),
  status: text('status', { enum: wavePlanStatusValues }).notNull().default('draft'),
  currentWaveIndex: integer('current_wave_index').notNull().default(0),
  version: integer('version').notNull().default(1),
  previousWavePlanId: text('previous_wave_plan_id'),
  rawMarkdown: text('raw_markdown'),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const wavePlansRelations = relations(wavePlans, ({ one, many }) => ({
  plan: one(plans, {
    fields: [wavePlans.planId],
    references: [plans.id],
  }),
  horizonItem: one(horizonItems, {
    fields: [wavePlans.horizonItemId],
    references: [horizonItems.id],
  }),
  previousWavePlan: one(wavePlans, {
    fields: [wavePlans.previousWavePlanId],
    references: [wavePlans.id],
    relationName: 'wavePlanHistory',
  }),
  waves: many(waves),
  waveTasks: many(waveTasks),
  dependencyEdges: many(dependencyEdges),
  metrics: one(wavePlanMetrics, {
    fields: [wavePlans.id],
    references: [wavePlanMetrics.wavePlanId],
  }),
}));

// ============================================================================
// Waves
// ============================================================================

export const waves = sqliteTable('waves', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  wavePlanId: text('wave_plan_id').notNull(),
  waveIndex: integer('wave_index').notNull(),
  label: text('label').notNull(),
  maxParallelTasks: integer('max_parallel_tasks').notNull(),
  status: text('status', { enum: waveStatusValues }).notNull().default('pending'),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
});

export const wavesRelations = relations(waves, ({ one, many }) => ({
  wavePlan: one(wavePlans, {
    fields: [waves.wavePlanId],
    references: [wavePlans.id],
  }),
  tasks: many(waveTasks),
}));

// ============================================================================
// Wave Tasks
// ============================================================================

export const waveTasks = sqliteTable('wave_tasks', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  waveId: text('wave_id').notNull(),
  wavePlanId: text('wave_plan_id').notNull(),
  taskId: text('task_id'), // FK to existing tasks table (nullable)
  waveIndex: integer('wave_index').notNull(),
  taskCode: text('task_code').notNull(), // e.g., "1.1", "4.3"
  label: text('label').notNull(),
  description: text('description').notNull().default(''),
  filePaths: text('file_paths', { mode: 'json' }).$type<string[]>().notNull().default([]),
  dependencies: text('dependencies', { mode: 'json' }).$type<string[]>().notNull().default([]),
  recommendedModel: text('recommended_model', { enum: modelValues }),
  complexity: text('complexity', { enum: complexityValues }),
  isOnCriticalPath: integer('is_on_critical_path', { mode: 'boolean' }).notNull().default(false),
  canRunInParallel: integer('can_run_in_parallel', { mode: 'boolean' }).notNull().default(true),
  status: text('status', { enum: waveTaskStatusValues }).notNull().default('pending'),
  assignedSessionId: text('assigned_session_id'),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  errorMessage: text('error_message'),
  retryCount: integer('retry_count').notNull().default(0),
});

export const waveTasksRelations = relations(waveTasks, ({ one }) => ({
  wave: one(waves, {
    fields: [waveTasks.waveId],
    references: [waves.id],
  }),
  wavePlan: one(wavePlans, {
    fields: [waveTasks.wavePlanId],
    references: [wavePlans.id],
  }),
  task: one(tasks, {
    fields: [waveTasks.taskId],
    references: [tasks.id],
  }),
}));

// ============================================================================
// Dependency Edges
// ============================================================================

export const dependencyEdges = sqliteTable('dependency_edges', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  wavePlanId: text('wave_plan_id').notNull(),
  fromTaskCode: text('from_task_code').notNull(),
  toTaskCode: text('to_task_code').notNull(),
  edgeType: text('edge_type', { enum: dependencyEdgeTypeValues }).notNull().default('hard'),
});

export const dependencyEdgesRelations = relations(dependencyEdges, ({ one }) => ({
  wavePlan: one(wavePlans, {
    fields: [dependencyEdges.wavePlanId],
    references: [wavePlans.id],
  }),
}));

// ============================================================================
// Wave Plan Metrics
// ============================================================================

export const wavePlanMetrics = sqliteTable('wave_plan_metrics', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  wavePlanId: text('wave_plan_id').notNull().unique(),
  totalWallClockMs: integer('total_wall_clock_ms'),
  theoreticalMinMs: integer('theoretical_min_ms'),
  parallelizationEfficiency: real('parallelization_efficiency'),
  wavesExecuted: integer('waves_executed').notNull().default(0),
  tasksCompleted: integer('tasks_completed').notNull().default(0),
  tasksFailed: integer('tasks_failed').notNull().default(0),
  tasksRetried: integer('tasks_retried').notNull().default(0),
  avgTaskDurationMs: integer('avg_task_duration_ms'),
  maxWaveWaitMs: integer('max_wave_wait_ms'),
  fileConflictsAvoided: integer('file_conflicts_avoided').notNull().default(0),
  reOptimizationCount: integer('re_optimization_count').notNull().default(0),
  recordedAt: integer('recorded_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const wavePlanMetricsRelations = relations(wavePlanMetrics, ({ one }) => ({
  wavePlan: one(wavePlans, {
    fields: [wavePlanMetrics.wavePlanId],
    references: [wavePlans.id],
  }),
}));

// ============================================================================
// Type Exports
// ============================================================================

export type WavePlan = typeof wavePlans.$inferSelect;
export type NewWavePlan = typeof wavePlans.$inferInsert;

export type Wave = typeof waves.$inferSelect;
export type NewWave = typeof waves.$inferInsert;

export type WaveTask = typeof waveTasks.$inferSelect;
export type NewWaveTask = typeof waveTasks.$inferInsert;

export type DependencyEdge = typeof dependencyEdges.$inferSelect;
export type NewDependencyEdge = typeof dependencyEdges.$inferInsert;

export type WavePlanMetric = typeof wavePlanMetrics.$inferSelect;
export type NewWavePlanMetric = typeof wavePlanMetrics.$inferInsert;
