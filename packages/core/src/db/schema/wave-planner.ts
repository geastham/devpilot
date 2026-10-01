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
  /**
   * Why the plan is `failed`, in words a person can act on — the task that
   * ended it and that task's error.
   *
   * `status = 'failed'` used to be the whole record. Everything that reports a
   * failed run outward (the conductor route, and through it the bridge watcher
   * and Linear) had to reconstruct the cause from task rows, and a plan failed
   * by anything other than a task had no cause to find. Written once, by the
   * first thing that fails the plan; later failures do not overwrite it.
   *
   * It also carries why a plan is `paused`, in the one case where nobody
   * pressed pause: a plan that was `executing` when the cockpit last stopped
   * and had been idle too long to restart on its own (see `holdStalePlans` in
   * the execution bridge). Resuming the plan clears it.
   */
  failureReason: text('failure_reason'),
  /**
   * The run's name: `<ticket>-<last six of this id>`, e.g. `AVA-12-k3x9qd`.
   *
   * Fixed by the plan's first dispatch and never recomputed, because the
   * session runner names branches after it — `devpilot/<run>/run` and
   * `devpilot/<run>/task-<code>` — and a second wave that computed a different
   * name would be merged into a different branch from the first.
   */
  runId: text('run_id'),
  /**
   * Whether this plan's tasks each run in their own git worktree, on their own
   * branch, and are merged wave by wave.
   *
   * Decided once, with `runId`, at the plan's first dispatch, from what the
   * runner says it can do — and then never again. A plan must not be half
   * isolated: wave 2's tasks are cut from a run branch that only exists, and
   * only contains wave 1, if wave 1 was isolated too.
   *
   * NULL is "not decided": the plan has not dispatched, or it predates the
   * column. FALSE is a decision, and `isolationNote` says why it went that way.
   */
  isolated: integer('isolated', { mode: 'boolean' }),
  /** Why `isolated` is false, in words for the person reading the run. */
  isolationNote: text('isolation_note'),
  /**
   * The run branch, as the runner named it, and its head after the most recent
   * merge. Both NULL until the first wave has been merged: the name is the
   * runner's to give (it reduces the run id to ref-safe characters), so it is
   * recorded from the runner's answer rather than guessed here.
   *
   * Local to the machine the runner is on. Nothing pushes it.
   */
  runBranch: text('run_branch'),
  runHeadSha: text('run_head_sha'),
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
  /**
   * When the task's FIRST attempt was dispatched. Set once and never moved.
   *
   * It used to be rewritten by every dispatch and again by `job:started`, so a
   * retried task reported the start of its last attempt and there was no stable
   * instant to measure the task from. `lastAttemptAt` carries the moving one;
   * `retryCount + 1` is which attempt that is.
   */
  startedAt: integer('started_at', { mode: 'timestamp' }),
  /** When the current (most recent) attempt was dispatched. */
  lastAttemptAt: integer('last_attempt_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  errorMessage: text('error_message'),
  completionSummary: text('completion_summary'),
  retryCount: integer('retry_count').notNull().default(0),
  /**
   * Where the current attempt's work is, for an isolated task: its branch, the
   * commit that branch was cut from, and the branch's head. From the runner's
   * completion report — for a failed attempt too, whose partial work the runner
   * commits. All three NULL for a task that was not isolated, and for one whose
   * completion was applied from the session row after a restart (the row does
   * not carry them); `branch` and `commitSha` are then filled in when the wave
   * is merged, from the runner's answer.
   *
   * Cleared when a new attempt claims the task: the runner renames the previous
   * attempt's branch, so these would name a branch that has moved.
   */
  branch: text('branch'),
  baseSha: text('base_sha'),
  commitSha: text('commit_sha'),
  /**
   * The files the attempt changed: modified ∪ created ∪ deleted from its
   * completion report. For an isolated task that is git's diff from `baseSha`
   * to `commitSha`, and exact.
   *
   * NULL is "no report recorded them", which is not `[]` — a task that ran and
   * changed nothing.
   */
  filesChanged: text('files_changed', { mode: 'json' }).$type<string[]>(),
  /**
   * When this attempt's branch was merged into the run branch. NULL is "not
   * merged": the wave has not ended yet, the branch conflicted, the plan is not
   * isolated, or the run ended before this task did.
   *
   * It is what makes merging a wave safe to repeat. A wave is asked to be
   * merged only while it has a completed task without this, so a restart
   * between the merge and the next wave neither skips the merge nor asks for
   * it again.
   */
  mergedAt: integer('merged_at', { mode: 'timestamp' }),
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
