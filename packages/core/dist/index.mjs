var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/db/config.ts
import { z } from "zod";
var databaseConfigSchema = z.object({
  type: z.enum(["sqlite", "postgres"]).default("sqlite"),
  // SQLite options
  sqlitePath: z.string().optional(),
  // Postgres options
  postgresUrl: z.string().optional()
});
function getDatabaseConfig() {
  const type = process.env.DEVPILOT_DB_TYPE || "sqlite";
  return {
    type,
    sqlitePath: process.env.DEVPILOT_SQLITE_PATH || ".devpilot/data.db",
    postgresUrl: process.env.DATABASE_URL
  };
}

// src/db/adapters/sqlite.ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

// src/db/schema/index.ts
var schema_exports = {};
__export(schema_exports, {
  activityEvents: () => activityEvents,
  completedTasks: () => completedTasks,
  completedTasksRelations: () => completedTasksRelations,
  complexityValues: () => complexityValues,
  conductorScores: () => conductorScores,
  conductorScoresRelations: () => conductorScoresRelations,
  conflictingFiles: () => conflictingFiles,
  conflictingFilesRelations: () => conflictingFilesRelations,
  dependencyEdgeTypeValues: () => dependencyEdgeTypeValues,
  dependencyEdges: () => dependencyEdges,
  dependencyEdgesRelations: () => dependencyEdgesRelations,
  eventTypeValues: () => eventTypeValues,
  fileStatusValues: () => fileStatusValues,
  horizonItems: () => horizonItems,
  horizonItemsRelations: () => horizonItemsRelations,
  inFlightFiles: () => inFlightFiles,
  inFlightFilesRelations: () => inFlightFilesRelations,
  modelValues: () => modelValues,
  orchestratorModeValues: () => orchestratorModeValues,
  palaceClosets: () => palaceClosets,
  palaceClosetsRelations: () => palaceClosetsRelations,
  palaceDiary: () => palaceDiary,
  palaceDrawers: () => palaceDrawers,
  palaceDrawersRelations: () => palaceDrawersRelations,
  palaceHalls: () => palaceHalls,
  palaceKgTriples: () => palaceKgTriples,
  palaceRooms: () => palaceRooms,
  palaceRoomsRelations: () => palaceRoomsRelations,
  palaceTunnels: () => palaceTunnels,
  palaceWings: () => palaceWings,
  palaceWingsRelations: () => palaceWingsRelations,
  plans: () => plans,
  plansRelations: () => plansRelations,
  rufloSessions: () => rufloSessions,
  rufloSessionsRelations: () => rufloSessionsRelations,
  scoreHistory: () => scoreHistory,
  scoreHistoryRelations: () => scoreHistoryRelations,
  sessionStatusValues: () => sessionStatusValues,
  tasks: () => tasks,
  tasksRelations: () => tasksRelations,
  touchedFiles: () => touchedFiles,
  touchedFilesRelations: () => touchedFilesRelations,
  wavePlanMetrics: () => wavePlanMetrics,
  wavePlanMetricsRelations: () => wavePlanMetricsRelations,
  wavePlanStatusValues: () => wavePlanStatusValues,
  wavePlans: () => wavePlans,
  wavePlansRelations: () => wavePlansRelations,
  waveStatusValues: () => waveStatusValues,
  waveTaskStatusValues: () => waveTaskStatusValues,
  waveTasks: () => waveTasks,
  waveTasksRelations: () => waveTasksRelations,
  waves: () => waves,
  wavesRelations: () => wavesRelations,
  wikiArticleStatusValues: () => wikiArticleStatusValues,
  wikiArticles: () => wikiArticles,
  wikiArticlesRelations: () => wikiArticlesRelations,
  wikiLog: () => wikiLog,
  wikiLogActionValues: () => wikiLogActionValues,
  wikiLogRelations: () => wikiLogRelations,
  wikiSourceTypeValues: () => wikiSourceTypeValues,
  wikiSources: () => wikiSources,
  wikiSourcesRelations: () => wikiSourcesRelations,
  workstreams: () => workstreams,
  workstreamsRelations: () => workstreamsRelations,
  zoneValues: () => zoneValues
});

// src/db/schema/enums.ts
var zoneValues = ["READY", "REFINING", "SHAPING", "DIRECTIONAL"];
var complexityValues = ["S", "M", "L", "XL"];
var modelValues = ["HAIKU", "SONNET", "OPUS"];
var sessionStatusValues = ["ACTIVE", "NEEDS_SPEC", "COMPLETE", "ERROR"];
var fileStatusValues = ["AVAILABLE", "IN_FLIGHT", "RECENTLY_MODIFIED"];
var eventTypeValues = [
  "SESSION_PROGRESS",
  "SESSION_COMPLETE",
  "PLAN_GENERATED",
  "PLAN_APPROVED",
  "ITEM_CREATED",
  "ITEM_DISPATCHED",
  "RUNWAY_UPDATE",
  "FILE_UNLOCKED",
  "SCORE_UPDATE",
  // Wave Planner events
  "WAVE_PLAN_CREATED",
  "WAVE_DISPATCHING",
  "WAVE_TASK_DISPATCHED",
  "WAVE_TASK_COMPLETE",
  "WAVE_TASK_FAILED",
  "WAVE_COMPLETE",
  "WAVE_ADVANCE",
  "WAVE_PLAN_COMPLETE",
  "WAVE_PLAN_FAILED",
  "WAVE_PLAN_REOPTIMIZING"
];
var orchestratorModeValues = ["claude-session", "http", "ao-cli", "manual", "disabled"];
var wavePlanStatusValues = [
  "draft",
  "approved",
  "executing",
  "paused",
  "completed",
  "failed",
  "re-optimizing"
];
var waveStatusValues = [
  "pending",
  "dispatching",
  "active",
  "completed",
  "failed",
  "skipped"
];
var waveTaskStatusValues = [
  "pending",
  "dispatched",
  "running",
  "completed",
  "failed",
  "retrying",
  "skipped"
];
var dependencyEdgeTypeValues = ["hard", "soft"];
var wikiSourceTypeValues = [
  "session_log",
  "commit",
  "spec",
  "decision",
  "manual"
];
var wikiArticleStatusValues = ["active", "stale", "archived"];
var wikiLogActionValues = [
  "ingest",
  "compile",
  "query",
  "lint",
  "update"
];

// src/db/schema/horizon.ts
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
var horizonItems = sqliteTable("horizon_items", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  title: text("title").notNull(),
  zone: text("zone", { enum: zoneValues }).notNull().default("DIRECTIONAL"),
  repo: text("repo").notNull(),
  complexity: text("complexity", { enum: complexityValues }),
  priority: integer("priority").notNull().default(0),
  linearTicketId: text("linear_ticket_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var horizonItemsRelations = relations(horizonItems, ({ one, many }) => ({
  plan: one(plans, {
    fields: [horizonItems.id],
    references: [plans.horizonItemId]
  }),
  conflictingFiles: many(inFlightFiles)
}));
var plans = sqliteTable("plans", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  version: integer("version").notNull().default(1),
  horizonItemId: text("horizon_item_id").notNull().unique(),
  estimatedCostUsd: real("estimated_cost_usd").notNull(),
  baselineCostUsd: real("baseline_cost_usd").notNull(),
  acceptanceCriteria: text("acceptance_criteria", { mode: "json" }).$type().notNull(),
  confidenceSignals: text("confidence_signals", { mode: "json" }).$type().notNull(),
  fleetContextSnapshot: text("fleet_context_snapshot", { mode: "json" }).$type().notNull(),
  memorySessionsUsed: text("memory_sessions_used", { mode: "json" }).$type().default([]),
  previousPlanId: text("previous_plan_id"),
  generatedAt: integer("generated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var plansRelations = relations(plans, ({ one, many }) => ({
  horizonItem: one(horizonItems, {
    fields: [plans.horizonItemId],
    references: [horizonItems.id]
  }),
  workstreams: many(workstreams),
  sequentialTasks: many(tasks, { relationName: "sequentialTasks" }),
  filesTouched: many(touchedFiles),
  previousPlan: one(plans, {
    fields: [plans.previousPlanId],
    references: [plans.id],
    relationName: "planHistory"
  })
}));
var workstreams = sqliteTable("workstreams", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  planId: text("plan_id").notNull(),
  label: text("label").notNull(),
  repo: text("repo").notNull(),
  workerCount: integer("worker_count").notNull().default(1),
  orderIndex: integer("order_index").notNull().default(0)
});
var workstreamsRelations = relations(workstreams, ({ one, many }) => ({
  plan: one(plans, {
    fields: [workstreams.planId],
    references: [plans.id]
  }),
  tasks: many(tasks)
}));
var tasks = sqliteTable("tasks", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  label: text("label").notNull(),
  model: text("model", { enum: modelValues }).notNull().default("SONNET"),
  modelOverride: text("model_override", { enum: modelValues }),
  complexity: text("complexity", { enum: complexityValues }).notNull(),
  estimatedCostUsd: real("estimated_cost_usd").notNull(),
  filePaths: text("file_paths", { mode: "json" }).$type().notNull(),
  conflictWarning: text("conflict_warning"),
  dependsOn: text("depends_on", { mode: "json" }).$type().default([]),
  orderIndex: integer("order_index").notNull().default(0),
  // Either belongs to a workstream OR is a sequential task on a plan
  workstreamId: text("workstream_id"),
  planId: text("plan_id")
});
var tasksRelations = relations(tasks, ({ one }) => ({
  workstream: one(workstreams, {
    fields: [tasks.workstreamId],
    references: [workstreams.id]
  }),
  plan: one(plans, {
    fields: [tasks.planId],
    references: [plans.id],
    relationName: "sequentialTasks"
  })
}));
var touchedFiles = sqliteTable("touched_files", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  planId: text("plan_id").notNull(),
  path: text("path").notNull(),
  status: text("status", { enum: fileStatusValues }).notNull().default("AVAILABLE"),
  inFlightVia: text("in_flight_via")
});
var touchedFilesRelations = relations(touchedFiles, ({ one }) => ({
  plan: one(plans, {
    fields: [touchedFiles.planId],
    references: [plans.id]
  })
}));
var inFlightFiles = sqliteTable("in_flight_files", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  path: text("path").notNull(),
  activeSessionId: text("active_session_id").notNull(),
  linearTicketId: text("linear_ticket_id").notNull(),
  estimatedMinutesRemaining: integer("estimated_minutes_remaining").notNull().default(30),
  horizonItemId: text("horizon_item_id"),
  lockedAt: integer("locked_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var inFlightFilesRelations = relations(inFlightFiles, ({ one }) => ({
  horizonItem: one(horizonItems, {
    fields: [inFlightFiles.horizonItemId],
    references: [horizonItems.id]
  })
}));
var conflictingFiles = sqliteTable("conflicting_files", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  horizonItemId: text("horizon_item_id").notNull(),
  path: text("path").notNull(),
  blockedBySessionId: text("blocked_by_session_id"),
  blockedByTicketId: text("blocked_by_ticket_id"),
  estimatedUnlockMinutes: integer("estimated_unlock_minutes")
});
var conflictingFilesRelations = relations(conflictingFiles, ({ one }) => ({
  horizonItem: one(horizonItems, {
    fields: [conflictingFiles.horizonItemId],
    references: [horizonItems.id]
  })
}));

// src/db/schema/fleet.ts
import { sqliteTable as sqliteTable2, text as text2, integer as integer2 } from "drizzle-orm/sqlite-core";
import { relations as relations2 } from "drizzle-orm";
import { createId as createId2 } from "@paralleldrive/cuid2";
var rufloSessions = sqliteTable2("ruflo_sessions", {
  id: text2("id").primaryKey().$defaultFn(() => createId2()),
  repo: text2("repo").notNull(),
  linearTicketId: text2("linear_ticket_id").notNull(),
  ticketTitle: text2("ticket_title").notNull(),
  currentWorkstream: text2("current_workstream").notNull().default("Main"),
  progressPercent: integer2("progress_percent").notNull().default(0),
  elapsedMinutes: integer2("elapsed_minutes").notNull().default(0),
  estimatedRemainingMinutes: integer2("estimated_remaining_minutes").notNull().default(30),
  status: text2("status", { enum: sessionStatusValues }).notNull().default("ACTIVE"),
  inFlightFiles: text2("in_flight_files", { mode: "json" }).$type().default([]),
  prUrl: text2("pr_url"),
  // External orchestrator tracking
  externalSessionId: text2("external_session_id"),
  orchestratorMode: text2("orchestrator_mode", { enum: orchestratorModeValues }),
  tokensUsed: integer2("tokens_used"),
  costUsd: integer2("cost_usd"),
  createdAt: integer2("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  updatedAt: integer2("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var rufloSessionsRelations = relations2(rufloSessions, ({ many }) => ({
  completedTasks: many(completedTasks)
}));
var completedTasks = sqliteTable2("completed_tasks", {
  id: text2("id").primaryKey().$defaultFn(() => createId2()),
  sessionId: text2("session_id").notNull(),
  label: text2("label").notNull(),
  model: text2("model", { enum: modelValues }),
  durationMinutes: integer2("duration_minutes"),
  completedAt: integer2("completed_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var completedTasksRelations = relations2(completedTasks, ({ one }) => ({
  session: one(rufloSessions, {
    fields: [completedTasks.sessionId],
    references: [rufloSessions.id]
  })
}));

// src/db/schema/score.ts
import { sqliteTable as sqliteTable3, text as text3, integer as integer3 } from "drizzle-orm/sqlite-core";
import { relations as relations3 } from "drizzle-orm";
import { createId as createId3 } from "@paralleldrive/cuid2";
var conductorScores = sqliteTable3("conductor_scores", {
  id: text3("id").primaryKey().$defaultFn(() => createId3()),
  userId: text3("user_id").notNull().unique(),
  total: integer3("total").notNull().default(500),
  fleetUtilization: integer3("fleet_utilization").notNull().default(100),
  runwayHealth: integer3("runway_health").notNull().default(100),
  planAccuracy: integer3("plan_accuracy").notNull().default(100),
  costEfficiency: integer3("cost_efficiency").notNull().default(100),
  velocityTrend: integer3("velocity_trend").notNull().default(100),
  leaderboardRank: integer3("leaderboard_rank"),
  createdAt: integer3("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  updatedAt: integer3("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var conductorScoresRelations = relations3(conductorScores, ({ many }) => ({
  history: many(scoreHistory)
}));
var scoreHistory = sqliteTable3("score_history", {
  id: text3("id").primaryKey().$defaultFn(() => createId3()),
  scoreId: text3("score_id").notNull(),
  total: integer3("total").notNull(),
  fleetUtilization: integer3("fleet_utilization").notNull(),
  runwayHealth: integer3("runway_health").notNull(),
  planAccuracy: integer3("plan_accuracy").notNull(),
  costEfficiency: integer3("cost_efficiency").notNull(),
  velocityTrend: integer3("velocity_trend").notNull(),
  recordedAt: integer3("recorded_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var scoreHistoryRelations = relations3(scoreHistory, ({ one }) => ({
  score: one(conductorScores, {
    fields: [scoreHistory.scoreId],
    references: [conductorScores.id]
  })
}));

// src/db/schema/events.ts
import { sqliteTable as sqliteTable4, text as text4, integer as integer4 } from "drizzle-orm/sqlite-core";
import { createId as createId4 } from "@paralleldrive/cuid2";
var activityEvents = sqliteTable4("activity_events", {
  id: text4("id").primaryKey().$defaultFn(() => createId4()),
  type: text4("type", { enum: eventTypeValues }).notNull(),
  message: text4("message").notNull(),
  repo: text4("repo"),
  ticketId: text4("ticket_id"),
  metadata: text4("metadata", { mode: "json" }).$type(),
  createdAt: integer4("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});

// src/db/schema/wave-planner.ts
import { sqliteTable as sqliteTable5, text as text5, integer as integer5, real as real2 } from "drizzle-orm/sqlite-core";
import { relations as relations4 } from "drizzle-orm";
import { createId as createId5 } from "@paralleldrive/cuid2";
var wavePlans = sqliteTable5("wave_plans", {
  id: text5("id").primaryKey().$defaultFn(() => createId5()),
  planId: text5("plan_id").notNull(),
  horizonItemId: text5("horizon_item_id").notNull(),
  totalWaves: integer5("total_waves").notNull(),
  totalTasks: integer5("total_tasks").notNull(),
  maxParallelism: integer5("max_parallelism").notNull(),
  criticalPath: text5("critical_path", { mode: "json" }).$type().notNull(),
  criticalPathLength: integer5("critical_path_length").notNull(),
  parallelizationScore: real2("parallelization_score").notNull(),
  status: text5("status", { enum: wavePlanStatusValues }).notNull().default("draft"),
  currentWaveIndex: integer5("current_wave_index").notNull().default(0),
  version: integer5("version").notNull().default(1),
  previousWavePlanId: text5("previous_wave_plan_id"),
  rawMarkdown: text5("raw_markdown"),
  startedAt: integer5("started_at", { mode: "timestamp" }),
  completedAt: integer5("completed_at", { mode: "timestamp" }),
  createdAt: integer5("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  updatedAt: integer5("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var wavePlansRelations = relations4(wavePlans, ({ one, many }) => ({
  plan: one(plans, {
    fields: [wavePlans.planId],
    references: [plans.id]
  }),
  horizonItem: one(horizonItems, {
    fields: [wavePlans.horizonItemId],
    references: [horizonItems.id]
  }),
  previousWavePlan: one(wavePlans, {
    fields: [wavePlans.previousWavePlanId],
    references: [wavePlans.id],
    relationName: "wavePlanHistory"
  }),
  waves: many(waves),
  waveTasks: many(waveTasks),
  dependencyEdges: many(dependencyEdges),
  metrics: one(wavePlanMetrics, {
    fields: [wavePlans.id],
    references: [wavePlanMetrics.wavePlanId]
  })
}));
var waves = sqliteTable5("waves", {
  id: text5("id").primaryKey().$defaultFn(() => createId5()),
  wavePlanId: text5("wave_plan_id").notNull(),
  waveIndex: integer5("wave_index").notNull(),
  label: text5("label").notNull(),
  maxParallelTasks: integer5("max_parallel_tasks").notNull(),
  status: text5("status", { enum: waveStatusValues }).notNull().default("pending"),
  startedAt: integer5("started_at", { mode: "timestamp" }),
  completedAt: integer5("completed_at", { mode: "timestamp" })
});
var wavesRelations = relations4(waves, ({ one, many }) => ({
  wavePlan: one(wavePlans, {
    fields: [waves.wavePlanId],
    references: [wavePlans.id]
  }),
  tasks: many(waveTasks)
}));
var waveTasks = sqliteTable5("wave_tasks", {
  id: text5("id").primaryKey().$defaultFn(() => createId5()),
  waveId: text5("wave_id").notNull(),
  wavePlanId: text5("wave_plan_id").notNull(),
  taskId: text5("task_id"),
  // FK to existing tasks table (nullable)
  waveIndex: integer5("wave_index").notNull(),
  taskCode: text5("task_code").notNull(),
  // e.g., "1.1", "4.3"
  label: text5("label").notNull(),
  description: text5("description").notNull().default(""),
  filePaths: text5("file_paths", { mode: "json" }).$type().notNull().default([]),
  dependencies: text5("dependencies", { mode: "json" }).$type().notNull().default([]),
  recommendedModel: text5("recommended_model", { enum: modelValues }),
  complexity: text5("complexity", { enum: complexityValues }),
  isOnCriticalPath: integer5("is_on_critical_path", { mode: "boolean" }).notNull().default(false),
  canRunInParallel: integer5("can_run_in_parallel", { mode: "boolean" }).notNull().default(true),
  status: text5("status", { enum: waveTaskStatusValues }).notNull().default("pending"),
  assignedSessionId: text5("assigned_session_id"),
  startedAt: integer5("started_at", { mode: "timestamp" }),
  completedAt: integer5("completed_at", { mode: "timestamp" }),
  errorMessage: text5("error_message"),
  completionSummary: text5("completion_summary"),
  retryCount: integer5("retry_count").notNull().default(0)
});
var waveTasksRelations = relations4(waveTasks, ({ one }) => ({
  wave: one(waves, {
    fields: [waveTasks.waveId],
    references: [waves.id]
  }),
  wavePlan: one(wavePlans, {
    fields: [waveTasks.wavePlanId],
    references: [wavePlans.id]
  }),
  task: one(tasks, {
    fields: [waveTasks.taskId],
    references: [tasks.id]
  })
}));
var dependencyEdges = sqliteTable5("dependency_edges", {
  id: text5("id").primaryKey().$defaultFn(() => createId5()),
  wavePlanId: text5("wave_plan_id").notNull(),
  fromTaskCode: text5("from_task_code").notNull(),
  toTaskCode: text5("to_task_code").notNull(),
  edgeType: text5("edge_type", { enum: dependencyEdgeTypeValues }).notNull().default("hard")
});
var dependencyEdgesRelations = relations4(dependencyEdges, ({ one }) => ({
  wavePlan: one(wavePlans, {
    fields: [dependencyEdges.wavePlanId],
    references: [wavePlans.id]
  })
}));
var wavePlanMetrics = sqliteTable5("wave_plan_metrics", {
  id: text5("id").primaryKey().$defaultFn(() => createId5()),
  wavePlanId: text5("wave_plan_id").notNull().unique(),
  totalWallClockMs: integer5("total_wall_clock_ms"),
  theoreticalMinMs: integer5("theoretical_min_ms"),
  parallelizationEfficiency: real2("parallelization_efficiency"),
  wavesExecuted: integer5("waves_executed").notNull().default(0),
  tasksCompleted: integer5("tasks_completed").notNull().default(0),
  tasksFailed: integer5("tasks_failed").notNull().default(0),
  tasksRetried: integer5("tasks_retried").notNull().default(0),
  avgTaskDurationMs: integer5("avg_task_duration_ms"),
  maxWaveWaitMs: integer5("max_wave_wait_ms"),
  fileConflictsAvoided: integer5("file_conflicts_avoided").notNull().default(0),
  reOptimizationCount: integer5("re_optimization_count").notNull().default(0),
  recordedAt: integer5("recorded_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var wavePlanMetricsRelations = relations4(wavePlanMetrics, ({ one }) => ({
  wavePlan: one(wavePlans, {
    fields: [wavePlanMetrics.wavePlanId],
    references: [wavePlans.id]
  })
}));

// src/db/schema/wiki.ts
import { sqliteTable as sqliteTable6, text as text6, integer as integer6 } from "drizzle-orm/sqlite-core";
import { relations as relations5 } from "drizzle-orm";
import { createId as createId6 } from "@paralleldrive/cuid2";
var wikiSources = sqliteTable6("wiki_sources", {
  id: text6("id").primaryKey().$defaultFn(() => createId6()),
  /** Source type: session_log, commit, spec, decision, manual */
  sourceType: text6("source_type", { enum: wikiSourceTypeValues }).notNull(),
  /** Human-readable title */
  title: text6("title").notNull(),
  /** Raw content of the source material */
  content: text6("content").notNull(),
  /** Origin identifier (e.g. session ID, commit SHA, file path) */
  origin: text6("origin"),
  /** Repository this source belongs to */
  repo: text6("repo"),
  /** Hash of content for deduplication */
  contentHash: text6("content_hash").notNull(),
  createdAt: integer6("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var wikiArticles = sqliteTable6("wiki_articles", {
  id: text6("id").primaryKey().$defaultFn(() => createId6()),
  /** URL-safe slug for the article (e.g. "authentication-flow") */
  slug: text6("slug").notNull().unique(),
  /** Article title */
  title: text6("title").notNull(),
  /** Category for organization (e.g. "architecture", "patterns", "decisions") */
  category: text6("category").notNull(),
  /** Compiled markdown content with backlinks */
  content: text6("content").notNull(),
  /** Status: active, stale, archived */
  status: text6("status", { enum: wikiArticleStatusValues }).notNull().default("active"),
  /** Backlinks — slugs of related articles */
  backlinks: text6("backlinks", { mode: "json" }).$type().default([]),
  /** Source IDs that contributed to this article */
  sourceIds: text6("source_ids", { mode: "json" }).$type().default([]),
  /** Repository this article belongs to */
  repo: text6("repo"),
  /** Version counter — incremented on each recompile */
  version: integer6("version").notNull().default(1),
  createdAt: integer6("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  updatedAt: integer6("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var wikiLog = sqliteTable6("wiki_log", {
  id: text6("id").primaryKey().$defaultFn(() => createId6()),
  /** Action type: ingest, compile, query, lint, update */
  action: text6("action", { enum: wikiLogActionValues }).notNull(),
  /** Summary of what happened */
  summary: text6("summary").notNull(),
  /** IDs of articles affected */
  articleIds: text6("article_ids", { mode: "json" }).$type().default([]),
  /** IDs of sources involved */
  sourceIds: text6("source_ids", { mode: "json" }).$type().default([]),
  /** Repository context */
  repo: text6("repo"),
  /** Token usage for this operation */
  tokensUsed: integer6("tokens_used"),
  createdAt: integer6("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var wikiSourcesRelations = relations5(wikiSources, ({ many }) => ({}));
var wikiArticlesRelations = relations5(wikiArticles, ({ many }) => ({}));
var wikiLogRelations = relations5(wikiLog, ({ many }) => ({}));

// src/db/schema/mempalace.ts
import { sqliteTable as sqliteTable7, text as text7, integer as integer7, index } from "drizzle-orm/sqlite-core";
import { relations as relations6 } from "drizzle-orm";
import { createId as createId7 } from "@paralleldrive/cuid2";
var palaceWings = sqliteTable7("palace_wings", {
  id: text7("id").primaryKey().$defaultFn(() => createId7()),
  /** Wing slug, e.g. "devpilot-core" or "persona-architect" */
  slug: text7("slug").notNull().unique(),
  /** Human-readable wing name */
  name: text7("name").notNull(),
  /** Wing type: project | persona | scratch */
  wingType: text7("wing_type").notNull().default("project"),
  /** Repository this wing is bound to, if any */
  repo: text7("repo"),
  /** Free-form description */
  description: text7("description"),
  createdAt: integer7("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  updatedAt: integer7("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var palaceRooms = sqliteTable7(
  "palace_rooms",
  {
    id: text7("id").primaryKey().$defaultFn(() => createId7()),
    wingId: text7("wing_id").notNull().references(() => palaceWings.id, { onDelete: "cascade" }),
    /** Room slug, unique within a wing, e.g. "auth-flow" */
    slug: text7("slug").notNull(),
    /** Human-readable room name */
    name: text7("name").notNull(),
    /** Topic label for routing retrieval */
    topic: text7("topic").notNull(),
    /** Free-form description of what belongs in this room */
    description: text7("description"),
    createdAt: integer7("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
    updatedAt: integer7("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
  },
  (table) => ({
    wingSlugIdx: index("palace_rooms_wing_slug_idx").on(table.wingId, table.slug)
  })
);
var palaceDrawers = sqliteTable7(
  "palace_drawers",
  {
    id: text7("id").primaryKey().$defaultFn(() => createId7()),
    roomId: text7("room_id").notNull().references(() => palaceRooms.id, { onDelete: "cascade" }),
    /** Memory type: fact | event | discovery | preference | advice | decision */
    memoryType: text7("memory_type").notNull().default("fact"),
    /** Short label for the drawer */
    label: text7("label").notNull(),
    /** Verbatim content — never summarized */
    content: text7("content").notNull(),
    /** Optional AAAK-compressed form (populated when the MCP server is used) */
    aaakContent: text7("aaak_content"),
    /** SHA256 of content for deduplication */
    contentHash: text7("content_hash").notNull(),
    /** Source provenance — e.g. wiki article slug, session id, commit sha */
    sourceKind: text7("source_kind"),
    sourceRef: text7("source_ref"),
    /** Free-form tags for filtering */
    tags: text7("tags", { mode: "json" }).$type().default([]),
    /** Rough salience score 0-1 controlling L0/L1 eligibility */
    salience: integer7("salience").notNull().default(0),
    createdAt: integer7("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
  },
  (table) => ({
    hashIdx: index("palace_drawers_hash_idx").on(table.contentHash),
    roomIdx: index("palace_drawers_room_idx").on(table.roomId)
  })
);
var palaceClosets = sqliteTable7(
  "palace_closets",
  {
    id: text7("id").primaryKey().$defaultFn(() => createId7()),
    roomId: text7("room_id").notNull().references(() => palaceRooms.id, { onDelete: "cascade" }),
    /** Compressed summary (AAAK-dialect or plain) */
    summary: text7("summary").notNull(),
    /** Which drawers this closet summarizes */
    drawerIds: text7("drawer_ids", { mode: "json" }).$type().default([]),
    /** Tier — 0 (identity), 1 (critical), 2 (room), 3 (deep) */
    tier: integer7("tier").notNull().default(2),
    /** Approximate token cost when injected */
    tokenCost: integer7("token_cost").notNull().default(0),
    createdAt: integer7("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
    updatedAt: integer7("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
  },
  (table) => ({
    tierIdx: index("palace_closets_tier_idx").on(table.tier)
  })
);
var palaceHalls = sqliteTable7("palace_halls", {
  id: text7("id").primaryKey().$defaultFn(() => createId7()),
  wingId: text7("wing_id").notNull().references(() => palaceWings.id, { onDelete: "cascade" }),
  fromRoomId: text7("from_room_id").notNull().references(() => palaceRooms.id, { onDelete: "cascade" }),
  toRoomId: text7("to_room_id").notNull().references(() => palaceRooms.id, { onDelete: "cascade" }),
  /** Relationship type: depends_on | related_to | supersedes | contradicts */
  relation: text7("relation").notNull().default("related_to"),
  weight: integer7("weight").notNull().default(1),
  createdAt: integer7("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var palaceTunnels = sqliteTable7("palace_tunnels", {
  id: text7("id").primaryKey().$defaultFn(() => createId7()),
  fromRoomId: text7("from_room_id").notNull().references(() => palaceRooms.id, { onDelete: "cascade" }),
  toRoomId: text7("to_room_id").notNull().references(() => palaceRooms.id, { onDelete: "cascade" }),
  reason: text7("reason"),
  createdAt: integer7("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var palaceKgTriples = sqliteTable7(
  "palace_kg_triples",
  {
    id: text7("id").primaryKey().$defaultFn(() => createId7()),
    wingId: text7("wing_id").notNull().references(() => palaceWings.id, { onDelete: "cascade" }),
    subject: text7("subject").notNull(),
    predicate: text7("predicate").notNull(),
    object: text7("object").notNull(),
    /** Validity window start — when this fact became true */
    validFrom: integer7("valid_from", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
    /** Validity window end — null if still valid */
    validUntil: integer7("valid_until", { mode: "timestamp" }),
    /** Source drawer that asserted this fact */
    sourceDrawerId: text7("source_drawer_id"),
    /** Confidence 0-100 */
    confidence: integer7("confidence").notNull().default(100),
    createdAt: integer7("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
  },
  (table) => ({
    spIdx: index("palace_kg_sp_idx").on(table.subject, table.predicate),
    wingIdx: index("palace_kg_wing_idx").on(table.wingId)
  })
);
var palaceDiary = sqliteTable7("palace_diary", {
  id: text7("id").primaryKey().$defaultFn(() => createId7()),
  wingId: text7("wing_id").notNull().references(() => palaceWings.id, { onDelete: "cascade" }),
  agentId: text7("agent_id").notNull(),
  entry: text7("entry").notNull(),
  createdAt: integer7("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var palaceWingsRelations = relations6(palaceWings, ({ many }) => ({
  rooms: many(palaceRooms),
  halls: many(palaceHalls),
  kgTriples: many(palaceKgTriples)
}));
var palaceRoomsRelations = relations6(palaceRooms, ({ one, many }) => ({
  wing: one(palaceWings, {
    fields: [palaceRooms.wingId],
    references: [palaceWings.id]
  }),
  drawers: many(palaceDrawers),
  closets: many(palaceClosets)
}));
var palaceDrawersRelations = relations6(palaceDrawers, ({ one }) => ({
  room: one(palaceRooms, {
    fields: [palaceDrawers.roomId],
    references: [palaceRooms.id]
  })
}));
var palaceClosetsRelations = relations6(palaceClosets, ({ one }) => ({
  room: one(palaceRooms, {
    fields: [palaceClosets.roomId],
    references: [palaceRooms.id]
  })
}));

// src/db/adapters/sqlite.ts
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";
var sqliteDb = null;
var sqliteConnection = null;
function ensureColumn(connection, table, column, ddl) {
  const cols = connection.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    connection.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
var createTableStatements = `
-- Horizon Items
CREATE TABLE IF NOT EXISTS horizon_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  zone TEXT NOT NULL CHECK(zone IN ('READY', 'REFINING', 'SHAPING', 'DIRECTIONAL')),
  repo TEXT NOT NULL,
  complexity TEXT CHECK(complexity IN ('S', 'M', 'L', 'XL')),
  priority INTEGER NOT NULL DEFAULT 0,
  linear_ticket_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Plans
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  horizon_item_id TEXT NOT NULL UNIQUE REFERENCES horizon_items(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  estimated_cost_usd REAL NOT NULL,
  baseline_cost_usd REAL NOT NULL,
  acceptance_criteria TEXT NOT NULL,
  confidence_signals TEXT NOT NULL,
  fleet_context_snapshot TEXT NOT NULL,
  memory_sessions_used TEXT DEFAULT '[]',
  previous_plan_id TEXT,
  generated_at INTEGER NOT NULL
);

-- Workstreams
CREATE TABLE IF NOT EXISTS workstreams (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  repo TEXT NOT NULL,
  worker_count INTEGER NOT NULL DEFAULT 1,
  order_index INTEGER NOT NULL DEFAULT 0
);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  plan_id TEXT REFERENCES plans(id) ON DELETE CASCADE,
  workstream_id TEXT REFERENCES workstreams(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  model TEXT NOT NULL CHECK(model IN ('HAIKU', 'SONNET', 'OPUS')),
  model_override TEXT CHECK(model_override IN ('HAIKU', 'SONNET', 'OPUS')),
  complexity TEXT NOT NULL CHECK(complexity IN ('S', 'M', 'L', 'XL')),
  estimated_cost_usd REAL NOT NULL,
  file_paths TEXT NOT NULL,
  conflict_warning TEXT,
  depends_on TEXT NOT NULL DEFAULT '[]',
  order_index INTEGER NOT NULL DEFAULT 0
);

-- Touched Files
CREATE TABLE IF NOT EXISTS touched_files (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK(status IN ('AVAILABLE', 'IN_FLIGHT', 'RECENTLY_MODIFIED')),
  in_flight_via TEXT
);

-- Conflicting Files
CREATE TABLE IF NOT EXISTS conflicting_files (
  id TEXT PRIMARY KEY,
  horizon_item_id TEXT NOT NULL REFERENCES horizon_items(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  blocked_by_session_id TEXT,
  blocked_by_ticket_id TEXT,
  estimated_unlock_minutes INTEGER
);

-- Fleet Sessions
CREATE TABLE IF NOT EXISTS ruflo_sessions (
  id TEXT PRIMARY KEY,
  repo TEXT NOT NULL,
  linear_ticket_id TEXT NOT NULL,
  ticket_title TEXT NOT NULL,
  current_workstream TEXT NOT NULL DEFAULT 'Main',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'NEEDS_SPEC', 'COMPLETE', 'ERROR')),
  progress_percent INTEGER NOT NULL DEFAULT 0,
  elapsed_minutes INTEGER NOT NULL DEFAULT 0,
  estimated_remaining_minutes INTEGER NOT NULL DEFAULT 30,
  in_flight_files TEXT NOT NULL DEFAULT '[]',
  pr_url TEXT,
  external_session_id TEXT,
  orchestrator_mode TEXT CHECK(orchestrator_mode IN ('claude-session', 'http', 'ao-cli', 'manual', 'disabled')),
  tokens_used INTEGER,
  cost_usd INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Completed Tasks
CREATE TABLE IF NOT EXISTS completed_tasks (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES ruflo_sessions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  model TEXT CHECK(model IN ('HAIKU', 'SONNET', 'OPUS')),
  duration_minutes INTEGER,
  completed_at INTEGER NOT NULL
);

-- In-Flight Files
CREATE TABLE IF NOT EXISTS in_flight_files (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  active_session_id TEXT NOT NULL,
  linear_ticket_id TEXT NOT NULL,
  horizon_item_id TEXT,
  estimated_minutes_remaining INTEGER NOT NULL DEFAULT 30,
  locked_at INTEGER NOT NULL
);

-- Conductor Scores
CREATE TABLE IF NOT EXISTS conductor_scores (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 500,
  fleet_utilization INTEGER NOT NULL DEFAULT 100,
  runway_health INTEGER NOT NULL DEFAULT 100,
  plan_accuracy INTEGER NOT NULL DEFAULT 100,
  cost_efficiency INTEGER NOT NULL DEFAULT 100,
  velocity_trend INTEGER NOT NULL DEFAULT 100,
  leaderboard_rank INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Score History
CREATE TABLE IF NOT EXISTS score_history (
  id TEXT PRIMARY KEY,
  score_id TEXT NOT NULL REFERENCES conductor_scores(id) ON DELETE CASCADE,
  total INTEGER NOT NULL,
  fleet_utilization INTEGER NOT NULL,
  runway_health INTEGER NOT NULL,
  plan_accuracy INTEGER NOT NULL,
  cost_efficiency INTEGER NOT NULL,
  velocity_trend INTEGER NOT NULL,
  recorded_at INTEGER NOT NULL
);

-- Activity Events
CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('SESSION_PROGRESS', 'SESSION_COMPLETE', 'PLAN_GENERATED', 'PLAN_APPROVED', 'ITEM_CREATED', 'ITEM_DISPATCHED', 'RUNWAY_UPDATE', 'FILE_UNLOCKED', 'SCORE_UPDATE', 'WAVE_PLAN_CREATED', 'WAVE_DISPATCHING', 'WAVE_TASK_DISPATCHED', 'WAVE_TASK_COMPLETE', 'WAVE_TASK_FAILED', 'WAVE_COMPLETE', 'WAVE_ADVANCE', 'WAVE_PLAN_COMPLETE', 'WAVE_PLAN_FAILED', 'WAVE_PLAN_REOPTIMIZING')),
  message TEXT NOT NULL,
  repo TEXT,
  ticket_id TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL
);

-- Wave Plans
CREATE TABLE IF NOT EXISTS wave_plans (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  horizon_item_id TEXT NOT NULL REFERENCES horizon_items(id) ON DELETE CASCADE,
  total_waves INTEGER NOT NULL,
  total_tasks INTEGER NOT NULL,
  max_parallelism INTEGER NOT NULL,
  critical_path TEXT NOT NULL,
  critical_path_length INTEGER NOT NULL,
  parallelization_score REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'approved', 'executing', 'paused', 'completed', 'failed', 're-optimizing')),
  current_wave_index INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  previous_wave_plan_id TEXT REFERENCES wave_plans(id),
  raw_markdown TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Waves
CREATE TABLE IF NOT EXISTS waves (
  id TEXT PRIMARY KEY,
  wave_plan_id TEXT NOT NULL REFERENCES wave_plans(id) ON DELETE CASCADE,
  wave_index INTEGER NOT NULL,
  label TEXT NOT NULL,
  max_parallel_tasks INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'dispatching', 'active', 'completed', 'failed', 'skipped')),
  started_at INTEGER,
  completed_at INTEGER
);

-- Wave Tasks
CREATE TABLE IF NOT EXISTS wave_tasks (
  id TEXT PRIMARY KEY,
  wave_id TEXT NOT NULL REFERENCES waves(id) ON DELETE CASCADE,
  wave_plan_id TEXT NOT NULL REFERENCES wave_plans(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES tasks(id),
  wave_index INTEGER NOT NULL,
  task_code TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  file_paths TEXT NOT NULL DEFAULT '[]',
  dependencies TEXT NOT NULL DEFAULT '[]',
  recommended_model TEXT CHECK(recommended_model IN ('HAIKU', 'SONNET', 'OPUS')),
  complexity TEXT CHECK(complexity IN ('S', 'M', 'L', 'XL')),
  is_on_critical_path INTEGER NOT NULL DEFAULT 0,
  can_run_in_parallel INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'dispatched', 'running', 'completed', 'failed', 'retrying', 'skipped')),
  assigned_session_id TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  error_message TEXT,
  completion_summary TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0
);

-- Dependency Edges
CREATE TABLE IF NOT EXISTS dependency_edges (
  id TEXT PRIMARY KEY,
  wave_plan_id TEXT NOT NULL REFERENCES wave_plans(id) ON DELETE CASCADE,
  from_task_code TEXT NOT NULL,
  to_task_code TEXT NOT NULL,
  edge_type TEXT NOT NULL DEFAULT 'hard' CHECK(edge_type IN ('hard', 'soft'))
);

-- Wave Plan Metrics
CREATE TABLE IF NOT EXISTS wave_plan_metrics (
  id TEXT PRIMARY KEY,
  wave_plan_id TEXT NOT NULL UNIQUE REFERENCES wave_plans(id) ON DELETE CASCADE,
  total_wall_clock_ms INTEGER,
  theoretical_min_ms INTEGER,
  parallelization_efficiency REAL,
  waves_executed INTEGER NOT NULL DEFAULT 0,
  tasks_completed INTEGER NOT NULL DEFAULT 0,
  tasks_failed INTEGER NOT NULL DEFAULT 0,
  tasks_retried INTEGER NOT NULL DEFAULT 0,
  avg_task_duration_ms INTEGER,
  max_wave_wait_ms INTEGER,
  file_conflicts_avoided INTEGER NOT NULL DEFAULT 0,
  re_optimization_count INTEGER NOT NULL DEFAULT 0,
  recorded_at INTEGER NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_horizon_items_zone ON horizon_items(zone);
CREATE INDEX IF NOT EXISTS idx_horizon_items_repo ON horizon_items(repo);
CREATE INDEX IF NOT EXISTS idx_ruflo_sessions_status ON ruflo_sessions(status);
CREATE INDEX IF NOT EXISTS idx_ruflo_sessions_repo ON ruflo_sessions(repo);
CREATE INDEX IF NOT EXISTS idx_activity_events_type ON activity_events(type);
CREATE INDEX IF NOT EXISTS idx_activity_events_created_at ON activity_events(created_at);
CREATE INDEX IF NOT EXISTS idx_wave_plans_plan_id ON wave_plans(plan_id);
CREATE INDEX IF NOT EXISTS idx_wave_plans_horizon_item_id ON wave_plans(horizon_item_id);
CREATE INDEX IF NOT EXISTS idx_wave_plans_status ON wave_plans(status);
CREATE INDEX IF NOT EXISTS idx_waves_wave_plan_id ON waves(wave_plan_id);
CREATE INDEX IF NOT EXISTS idx_waves_status ON waves(status);
CREATE INDEX IF NOT EXISTS idx_wave_tasks_wave_id ON wave_tasks(wave_id);
CREATE INDEX IF NOT EXISTS idx_wave_tasks_wave_plan_id ON wave_tasks(wave_plan_id);
CREATE INDEX IF NOT EXISTS idx_wave_tasks_status ON wave_tasks(status);
CREATE INDEX IF NOT EXISTS idx_wave_tasks_task_code ON wave_tasks(task_code);
CREATE INDEX IF NOT EXISTS idx_dependency_edges_wave_plan_id ON dependency_edges(wave_plan_id);
`;
function createSQLiteAdapter(path) {
  if (sqliteDb) {
    return sqliteDb;
  }
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  sqliteConnection = new Database(path);
  sqliteConnection.pragma("journal_mode = WAL");
  sqliteConnection.exec(createTableStatements);
  ensureColumn(sqliteConnection, "wave_tasks", "completion_summary", "completion_summary TEXT");
  ensureColumn(sqliteConnection, "ruflo_sessions", "external_session_id", "external_session_id TEXT");
  ensureColumn(
    sqliteConnection,
    "ruflo_sessions",
    "orchestrator_mode",
    "orchestrator_mode TEXT CHECK(orchestrator_mode IN ('claude-session', 'http', 'ao-cli', 'manual', 'disabled'))"
  );
  ensureColumn(sqliteConnection, "ruflo_sessions", "tokens_used", "tokens_used INTEGER");
  ensureColumn(sqliteConnection, "ruflo_sessions", "cost_usd", "cost_usd INTEGER");
  sqliteDb = drizzle(sqliteConnection, { schema: schema_exports });
  return sqliteDb;
}
function closeSQLiteConnection() {
  if (sqliteConnection) {
    sqliteConnection.close();
    sqliteConnection = null;
    sqliteDb = null;
  }
}

// src/db/adapters/postgres.ts
import { drizzle as drizzle2 } from "drizzle-orm/postgres-js";
import postgres from "postgres";
var pgDb = null;
var pgConnection = null;
function createPostgresAdapter(connectionString) {
  if (pgDb) {
    return pgDb;
  }
  pgConnection = postgres(connectionString, {
    max: 10,
    // Connection pool size
    idle_timeout: 20,
    connect_timeout: 10
  });
  pgDb = drizzle2(pgConnection, { schema: schema_exports });
  return pgDb;
}
async function closePostgresConnection() {
  if (pgConnection) {
    await pgConnection.end();
    pgConnection = null;
    pgDb = null;
  }
}

// src/db/adapters/index.ts
function createDatabase(config) {
  switch (config.type) {
    case "sqlite":
      if (!config.sqlitePath) {
        throw new Error("SQLite path is required for SQLite database");
      }
      return createSQLiteAdapter(config.sqlitePath);
    case "postgres":
      if (!config.postgresUrl) {
        throw new Error("Postgres connection URL is required for Postgres database");
      }
      return createPostgresAdapter(config.postgresUrl);
    default:
      throw new Error(`Unsupported database type: ${config.type}`);
  }
}
async function closeDatabase(config) {
  switch (config.type) {
    case "sqlite":
      closeSQLiteConnection();
      break;
    case "postgres":
      await closePostgresConnection();
      break;
  }
}

// src/db/client.ts
var db = null;
function getDatabase() {
  if (!db) {
    const config = getDatabaseConfig();
    db = createDatabase(config);
  }
  return db;
}
function initDatabase(config) {
  const baseConfig = getDatabaseConfig();
  const mergedConfig = { ...baseConfig, ...config };
  db = createDatabase(mergedConfig);
  return db;
}
function resetDatabase() {
  db = null;
}

// src/wave-planner/index.ts
var wave_planner_exports = {};
__export(wave_planner_exports, {
  CodebaseContextService: () => CodebaseContextService,
  CompletionListener: () => CompletionListener,
  ConcurrencyManager: () => ConcurrencyManager,
  FleetContextService: () => FleetContextService,
  PlanRefinementService: () => PlanRefinementService,
  PromptConstructor: () => PromptConstructor,
  WaveDispatchCoordinator: () => WaveDispatchCoordinator,
  WaveExecutionController: () => WaveExecutionController,
  WavePlanGenerator: () => WavePlanGenerator,
  WavePlannerAIClient: () => WavePlannerAIClient,
  advanceToNextWave: () => advanceToNextWave,
  assignWaves: () => assignWaves,
  autoAdvanceWave: () => autoAdvanceWave,
  buildDAGGraph: () => buildDAGGraph,
  collectFinalMetrics: () => collectFinalMetrics,
  computeCriticalPath: () => computeCriticalPath,
  createFlatPlan: () => createFlatPlan,
  createFlatPlanFromDescriptions: () => createFlatPlanFromDescriptions,
  createPlanRefinementService: () => createPlanRefinementService,
  createPromptConstructor: () => createPromptConstructor,
  createWavePlanGenerator: () => createWavePlanGenerator,
  defaultTemplate: () => defaultTemplate,
  extractAllTaskCodes: () => extractAllTaskCodes,
  extractWaveFromTaskCode: () => extractWaveFromTaskCode,
  findCommonTheme: () => findCommonTheme,
  findTaskByCode: () => findTaskByCode,
  generateWaveLabel: () => generateWaveLabel,
  generateWavePlan: () => generateWavePlan,
  getTasksInWave: () => getTasksInWave,
  groupBy: () => groupBy,
  markWavePlanComplete: () => markWavePlanComplete,
  normalizeComplexity: () => normalizeComplexity,
  normalizeModel: () => normalizeModel,
  parseDependencies: () => parseDependencies,
  parseFilePaths: () => parseFilePaths,
  parseWavePlanResponse: () => parseWavePlanResponse,
  refinementTemplate: () => refinementTemplate,
  scorePlan: () => scorePlan,
  simplifiedTemplate: () => simplifiedTemplate,
  sleep: () => sleep,
  toActivityEventType: () => toActivityEventType,
  topologicalSort: () => topologicalSort,
  validateDAG: () => validateDAG
});

// src/wave-planner/utils.ts
function topologicalSort(graph) {
  const inDegree = /* @__PURE__ */ new Map();
  const adjacency = /* @__PURE__ */ new Map();
  for (const [taskCode, node] of graph) {
    inDegree.set(taskCode, node.dependencies.size);
    adjacency.set(taskCode, node.dependents);
  }
  const queue = [];
  for (const [taskCode, degree] of inDegree) {
    if (degree === 0) {
      queue.push(taskCode);
    }
  }
  const order = [];
  while (queue.length > 0) {
    const current = queue.shift();
    order.push(current);
    for (const dependent of adjacency.get(current) || []) {
      const newDegree = (inDegree.get(dependent) || 0) - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) {
        queue.push(dependent);
      }
    }
  }
  const valid = order.length === graph.size;
  if (!valid) {
    const cycleParticipants = [...inDegree.entries()].filter(([_, degree]) => degree > 0).map(([taskCode]) => taskCode);
    return { order, valid: false, cycleParticipants };
  }
  return { order, valid: true };
}
function buildDAGGraph(tasks2, edges) {
  const graph = /* @__PURE__ */ new Map();
  for (const task of tasks2) {
    graph.set(task.taskCode, {
      taskCode: task.taskCode,
      inDegree: 0,
      outDegree: 0,
      dependencies: /* @__PURE__ */ new Set(),
      dependents: /* @__PURE__ */ new Set(),
      filePaths: new Set(task.filePaths)
    });
  }
  for (const edge of edges) {
    const fromNode = graph.get(edge.from);
    const toNode = graph.get(edge.to);
    if (fromNode && toNode) {
      fromNode.dependents.add(edge.to);
      fromNode.outDegree++;
      toNode.dependencies.add(edge.from);
      toNode.inDegree++;
    }
  }
  return graph;
}
function groupBy(items, keyFn) {
  const map = /* @__PURE__ */ new Map();
  for (const item of items) {
    const key = keyFn(item);
    const existing = map.get(key) || [];
    existing.push(item);
    map.set(key, existing);
  }
  return map;
}
function extractWaveFromTaskCode(taskCode) {
  const match = taskCode.match(/^(\d+)\./);
  return match ? parseInt(match[1], 10) : 0;
}
function normalizeModel(raw) {
  const normalized = raw?.toLowerCase().trim();
  if (normalized === "haiku") return "haiku";
  if (normalized === "opus") return "opus";
  return "sonnet";
}
function normalizeComplexity(raw) {
  const normalized = raw?.toUpperCase().trim();
  if (normalized === "S" || normalized === "SMALL") return "S";
  if (normalized === "M" || normalized === "MEDIUM") return "M";
  if (normalized === "L" || normalized === "LARGE") return "L";
  if (normalized === "XL" || normalized === "EXTRA LARGE" || normalized === "EXTRA-LARGE") return "XL";
  return "M";
}
function parseDependencies(raw) {
  if (!raw || raw.toLowerCase() === "none" || raw.trim() === "" || raw.trim() === "-") {
    return [];
  }
  return raw.split(/[,;\n]/).map((s) => s.trim()).filter((s) => s.length > 0 && /^\d+\.\d+$/.test(s));
}
function parseFilePaths(raw) {
  if (!raw || raw.toLowerCase() === "none" || raw.trim() === "" || raw.trim() === "-") {
    return [];
  }
  return raw.split(/[,;\n]/).map((s) => s.trim()).filter((s) => s.length > 0);
}
function findCommonTheme(descriptions) {
  if (descriptions.length === 0) return null;
  const themes = [
    "setup",
    "initialize",
    "bootstrap",
    "foundation",
    "core",
    "base",
    "api",
    "endpoint",
    "route",
    "component",
    "ui",
    "view",
    "test",
    "testing",
    "unit test",
    "integration",
    "wire",
    "connect",
    "refactor",
    "cleanup",
    "optimize",
    "database",
    "schema",
    "migration"
  ];
  const descLower = descriptions.map((d) => d.toLowerCase());
  for (const theme of themes) {
    if (descLower.every((d) => d.includes(theme))) {
      return theme.charAt(0).toUpperCase() + theme.slice(1);
    }
  }
  const wordCounts = /* @__PURE__ */ new Map();
  for (const desc3 of descLower) {
    const words = desc3.split(/\s+/).filter((w) => w.length > 3);
    for (const word of words) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }
  }
  let maxWord = null;
  let maxCount = 0;
  for (const [word, count] of wordCounts) {
    if (count > maxCount && count >= descriptions.length * 0.5) {
      maxCount = count;
      maxWord = word;
    }
  }
  if (maxWord) {
    return maxWord.charAt(0).toUpperCase() + maxWord.slice(1);
  }
  return null;
}
function generateWaveLabel(originalIndex, tasks2, subIndex) {
  const subSuffix = subIndex !== void 0 ? ` (Part ${subIndex + 1})` : "";
  const commonTheme = findCommonTheme(tasks2.map((t) => t.description));
  if (commonTheme) {
    return `Wave ${originalIndex + 1}: ${commonTheme}${subSuffix}`;
  }
  return `Wave ${originalIndex + 1}${subSuffix}`;
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// src/wave-planner/parser.ts
function parseWavePlanResponse(markdown) {
  const waves2 = parseWaves(markdown);
  const allTasks = waves2.flatMap((w) => w.tasks);
  const dependencyEdges2 = extractDependencyEdges(allTasks);
  const criticalPath = parseCriticalPath(markdown);
  const statistics = parseStatistics(markdown, allTasks.length, waves2.length, criticalPath.length);
  return {
    waves: waves2,
    dependencyEdges: dependencyEdges2,
    criticalPath,
    statistics,
    rawMarkdown: markdown
  };
}
function parseWaves(markdown) {
  const waves2 = [];
  const waveHeaderRegex = /^##\s+Wave\s+(\d+):\s*(.+?)(?:\s*\((\d+)\s+tasks?\))?$/gim;
  const sections = splitIntoSections(markdown);
  for (const section of sections) {
    const headerMatch = waveHeaderRegex.exec(section.header);
    if (headerMatch) {
      const waveIndex = parseInt(headerMatch[1], 10);
      const label = headerMatch[2].trim();
      const tasks2 = parseTaskTable(section.content);
      waves2.push({
        waveIndex,
        label,
        tasks: tasks2
      });
    }
    waveHeaderRegex.lastIndex = 0;
  }
  return waves2.sort((a, b) => a.waveIndex - b.waveIndex);
}
function splitIntoSections(markdown) {
  const sections = [];
  const lines = markdown.split("\n");
  let currentHeader = "";
  let currentContent = [];
  for (const line of lines) {
    if (line.match(/^##\s+/)) {
      if (currentHeader) {
        sections.push({
          header: currentHeader,
          content: currentContent.join("\n")
        });
      }
      currentHeader = line;
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }
  if (currentHeader) {
    sections.push({
      header: currentHeader,
      content: currentContent.join("\n")
    });
  }
  return sections;
}
function parseTaskTable(tableContent) {
  const tasks2 = [];
  const lines = tableContent.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  let headerIndex = -1;
  let separatorIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("Task ID") || line.includes("Task Code")) {
      headerIndex = i;
    } else if (line.match(/^\|[\s\-:]+\|/)) {
      separatorIndex = i;
      break;
    }
  }
  if (headerIndex === -1 || separatorIndex === -1) {
    return tasks2;
  }
  const headerCells = parseTableRow(lines[headerIndex]);
  const columnMap = buildColumnMap(headerCells);
  for (let i = separatorIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("|")) break;
    const cells = parseTableRow(line);
    if (cells.length === 0) continue;
    const task = parseTaskRow(cells, columnMap);
    if (task) {
      tasks2.push(task);
    }
  }
  return tasks2;
}
function parseTableRow(line) {
  return line.split("|").slice(1, -1).map((cell) => cell.trim());
}
function buildColumnMap(headers) {
  const map = {
    taskId: -1,
    description: -1,
    files: -1,
    dependencies: -1,
    parallel: -1,
    model: -1,
    complexity: -1
  };
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i].toLowerCase();
    if (header.includes("task id") || header.includes("task code")) {
      map.taskId = i;
    } else if (header.includes("description")) {
      map.description = i;
    } else if (header.includes("file")) {
      map.files = i;
    } else if (header.includes("depend")) {
      map.dependencies = i;
    } else if (header.includes("parallel")) {
      map.parallel = i;
    } else if (header.includes("model")) {
      map.model = i;
    } else if (header.includes("complex")) {
      map.complexity = i;
    }
  }
  return map;
}
function parseTaskRow(cells, columnMap) {
  if (columnMap.taskId === -1 || !cells[columnMap.taskId]) {
    return null;
  }
  const taskCode = cells[columnMap.taskId].trim();
  if (!taskCode.match(/^\d+\.\d+$/)) {
    return null;
  }
  const description = columnMap.description !== -1 ? cells[columnMap.description]?.trim() || "" : "";
  const filePaths = columnMap.files !== -1 ? parseFilePaths(cells[columnMap.files]) : [];
  const dependencies = columnMap.dependencies !== -1 ? parseDependencies(cells[columnMap.dependencies]) : [];
  const canRunInParallel = columnMap.parallel !== -1 ? parseBoolean(cells[columnMap.parallel]) : false;
  const recommendedModel = columnMap.model !== -1 ? normalizeModel(cells[columnMap.model]) : "sonnet";
  const complexity = columnMap.complexity !== -1 ? normalizeComplexity(cells[columnMap.complexity]) : "M";
  return {
    taskCode,
    description,
    filePaths,
    dependencies,
    canRunInParallel,
    recommendedModel,
    complexity
  };
}
function parseBoolean(value) {
  if (!value) return false;
  const normalized = value.toLowerCase().trim();
  return normalized === "yes" || normalized === "true" || normalized === "y" || normalized === "1" || normalized === "parallel";
}
function extractDependencyEdges(tasks2) {
  const edges = [];
  for (const task of tasks2) {
    for (const dep of task.dependencies) {
      edges.push({
        from: dep,
        to: task.taskCode,
        type: "hard"
      });
    }
  }
  return edges;
}
function parseCriticalPath(markdown) {
  const sections = splitIntoSections(markdown);
  for (const section of sections) {
    if (section.header.match(/^##\s+Critical\s+Path/i)) {
      const content = section.content.trim();
      if (content.includes("->")) {
        return content.split("->").map((s) => s.trim()).filter((s) => s.match(/^\d+\.\d+$/));
      }
      const lines = content.split("\n");
      const path = [];
      for (const line of lines) {
        const match = line.match(/\b(\d+\.\d+)\b/);
        if (match) {
          path.push(match[1]);
        }
      }
      if (path.length > 0) {
        return path;
      }
    }
  }
  return [];
}
function parseStatistics(markdown, totalTasksCalculated, totalWavesCalculated, criticalPathLengthCalculated) {
  const sections = splitIntoSections(markdown);
  let totalTasks = totalTasksCalculated;
  let totalWaves = totalWavesCalculated;
  let maxParallelism = 0;
  let criticalPathLength = criticalPathLengthCalculated;
  let sequentialChains = 0;
  for (const section of sections) {
    if (section.header.match(/^##\s+Statistics/i)) {
      const lines = section.content.split("\n");
      for (const line of lines) {
        const cells = parseTableRow(line);
        if (cells.length < 2) continue;
        const metric = cells[0].toLowerCase();
        const value = cells[1];
        if (metric.includes("total tasks")) {
          totalTasks = parseInt(value, 10) || totalTasks;
        } else if (metric.includes("total waves")) {
          totalWaves = parseInt(value, 10) || totalWaves;
        } else if (metric.includes("max parallelism")) {
          maxParallelism = parseInt(value, 10) || maxParallelism;
        } else if (metric.includes("critical path")) {
          criticalPathLength = parseInt(value, 10) || criticalPathLength;
        } else if (metric.includes("sequential chains")) {
          sequentialChains = parseInt(value, 10) || sequentialChains;
        }
      }
    }
  }
  return {
    totalTasks,
    totalWaves,
    maxParallelism,
    criticalPathLength,
    sequentialChains
  };
}
function extractAllTaskCodes(plan) {
  return plan.waves.flatMap((w) => w.tasks.map((t) => t.taskCode));
}
function findTaskByCode(plan, taskCode) {
  for (const wave of plan.waves) {
    const task = wave.tasks.find((t) => t.taskCode === taskCode);
    if (task) return task;
  }
  return void 0;
}
function getTasksInWave(plan, waveIndex) {
  const wave = plan.waves.find((w) => w.waveIndex === waveIndex);
  return wave?.tasks || [];
}

// src/wave-planner/dag-validator.ts
function validateDAG(tasks2, edges, config) {
  const errors = [];
  const warnings = [];
  if (tasks2.length === 0) {
    errors.push({
      code: "EMPTY_PLAN",
      message: "Wave plan contains no tasks",
      detail: "A valid wave plan must contain at least one task"
    });
    return {
      valid: false,
      errors,
      warnings
    };
  }
  const taskCodeCounts = /* @__PURE__ */ new Map();
  const duplicateTaskCodes = [];
  for (const task of tasks2) {
    const count = (taskCodeCounts.get(task.taskCode) || 0) + 1;
    taskCodeCounts.set(task.taskCode, count);
    if (count === 2) {
      duplicateTaskCodes.push(task.taskCode);
    }
  }
  if (duplicateTaskCodes.length > 0) {
    errors.push({
      code: "DUPLICATE_TASK_CODE",
      message: "Duplicate task codes detected",
      taskCodes: duplicateTaskCodes,
      detail: `Task codes must be unique. Found duplicates: ${duplicateTaskCodes.join(", ")}`
    });
  }
  const validTaskCodes = new Set(tasks2.map((t) => t.taskCode));
  const danglingDependencies = /* @__PURE__ */ new Map();
  for (const task of tasks2) {
    const missing = [];
    for (const dep of task.dependencies) {
      if (!validTaskCodes.has(dep)) {
        missing.push(dep);
      }
    }
    if (missing.length > 0) {
      danglingDependencies.set(task.taskCode, missing);
    }
  }
  for (const edge of edges) {
    if (!validTaskCodes.has(edge.from)) {
      const existing = danglingDependencies.get(edge.to) || [];
      if (!existing.includes(edge.from)) {
        existing.push(edge.from);
        danglingDependencies.set(edge.to, existing);
      }
    }
    if (!validTaskCodes.has(edge.to)) {
      const existing = danglingDependencies.get(edge.from) || [];
      if (!existing.includes(edge.to)) {
        existing.push(edge.to);
        danglingDependencies.set(edge.from, existing);
      }
    }
  }
  if (danglingDependencies.size > 0) {
    for (const [taskCode, missingDeps] of danglingDependencies) {
      warnings.push({
        code: "DANGLING_DEPENDENCY",
        message: `Task ${taskCode} references non-existent dependencies`,
        taskCodes: [taskCode],
        detail: `Missing dependencies: ${missingDeps.join(", ")}`
      });
    }
  }
  const graph = buildDAGGraph(tasks2, edges);
  const topoResult = topologicalSort(graph);
  if (!topoResult.valid && topoResult.cycleParticipants) {
    errors.push({
      code: "CYCLE_DETECTED",
      message: "Circular dependency detected in task graph",
      taskCodes: topoResult.cycleParticipants,
      detail: `The following tasks form a cycle: ${topoResult.cycleParticipants.join(" -> ")}`
    });
  }
  const rootTasks = tasks2.filter((t) => t.dependencies.length === 0);
  if (rootTasks.length === 0) {
    errors.push({
      code: "NO_ROOT_TASK",
      message: "No root tasks found (all tasks have dependencies)",
      detail: "At least one task must have no dependencies to serve as a starting point"
    });
  }
  const fileOverlapWarnings = checkFileOverlapInWaves(tasks2);
  warnings.push(...fileOverlapWarnings);
  const valid = errors.length === 0;
  return {
    valid,
    errors,
    warnings,
    // TODO: Implement auto-correction if config.enableAutoCorrection is true
    correctedPlan: void 0
  };
}
function checkFileOverlapInWaves(tasks2) {
  const warnings = [];
  const tasksByWave = groupBy(tasks2, (task) => extractWaveFromTaskCode(task.taskCode));
  for (const [waveIndex, waveTasks2] of tasksByWave) {
    const fileToTasks = /* @__PURE__ */ new Map();
    for (const task of waveTasks2) {
      for (const filePath of task.filePaths) {
        const existing = fileToTasks.get(filePath) || [];
        existing.push(task.taskCode);
        fileToTasks.set(filePath, existing);
      }
    }
    for (const [filePath, taskCodes] of fileToTasks) {
      if (taskCodes.length > 1) {
        warnings.push({
          code: "FILE_OVERLAP_SAME_WAVE",
          message: `Multiple tasks in wave ${waveIndex} modify the same file`,
          taskCodes,
          detail: `File "${filePath}" is modified by tasks: ${taskCodes.join(", ")}`
        });
      }
    }
  }
  return warnings;
}

// src/wave-planner/critical-path.ts
function computeCriticalPath(tasks2, edges) {
  if (tasks2.length === 0) {
    return {
      path: [],
      length: 0,
      annotations: /* @__PURE__ */ new Map()
    };
  }
  const graph = buildDAGGraph(tasks2, edges);
  const sortResult = topologicalSort(graph);
  if (!sortResult.valid) {
    const annotations2 = /* @__PURE__ */ new Map();
    for (const task of tasks2) {
      annotations2.set(task.taskCode, {
        taskCode: task.taskCode,
        isOnCriticalPath: false,
        distanceFromRoot: 0,
        distanceToEnd: 0,
        slack: 0
      });
    }
    return {
      path: [],
      length: 0,
      annotations: annotations2
    };
  }
  const order = sortResult.order;
  const distanceFromRoot = /* @__PURE__ */ new Map();
  const predecessor = /* @__PURE__ */ new Map();
  for (const taskCode of order) {
    const node = graph.get(taskCode);
    if (node.dependencies.size === 0) {
      distanceFromRoot.set(taskCode, 0);
      predecessor.set(taskCode, null);
    } else {
      let maxDist = -1;
      let maxPred = null;
      for (const depCode of node.dependencies) {
        const depDist = distanceFromRoot.get(depCode) ?? 0;
        if (depDist >= maxDist) {
          maxDist = depDist;
          maxPred = depCode;
        }
      }
      distanceFromRoot.set(taskCode, maxDist + 1);
      predecessor.set(taskCode, maxPred);
    }
  }
  let maxDistance = -1;
  let terminalNode = null;
  for (const taskCode of order) {
    const dist = distanceFromRoot.get(taskCode);
    if (dist > maxDistance) {
      maxDistance = dist;
      terminalNode = taskCode;
    }
  }
  const path = [];
  let current = terminalNode;
  while (current !== null) {
    path.unshift(current);
    current = predecessor.get(current) ?? null;
  }
  const criticalPathLength = path.length;
  const distanceToEnd = /* @__PURE__ */ new Map();
  for (let i = order.length - 1; i >= 0; i--) {
    const taskCode = order[i];
    const node = graph.get(taskCode);
    if (node.dependents.size === 0) {
      distanceToEnd.set(taskCode, 0);
    } else {
      let maxDist = -1;
      for (const depCode of node.dependents) {
        const depDist = distanceToEnd.get(depCode) ?? 0;
        maxDist = Math.max(maxDist, depDist);
      }
      distanceToEnd.set(taskCode, maxDist + 1);
    }
  }
  const criticalPathSet = new Set(path);
  const annotations = /* @__PURE__ */ new Map();
  for (const task of tasks2) {
    const taskCode = task.taskCode;
    const distFromRoot = distanceFromRoot.get(taskCode) ?? 0;
    const distToEnd = distanceToEnd.get(taskCode) ?? 0;
    const slack = Math.max(0, criticalPathLength - 1 - (distFromRoot + distToEnd));
    annotations.set(taskCode, {
      taskCode,
      isOnCriticalPath: criticalPathSet.has(taskCode),
      distanceFromRoot: distFromRoot,
      distanceToEnd: distToEnd,
      slack
    });
  }
  return {
    path,
    length: criticalPathLength,
    annotations
  };
}

// src/wave-planner/wave-assigner.ts
function assignWaves(tasks2, edges, config) {
  if (tasks2.length === 0) {
    return {
      waves: [],
      totalWaves: 0,
      maxParallelism: 0,
      adjustments: []
    };
  }
  const graph = buildDAGGraph(tasks2, edges);
  const sortResult = topologicalSort(graph);
  if (!sortResult.valid) {
    throw new Error(
      `Cannot assign waves: cycle detected in dependency graph involving tasks: ${sortResult.cycleParticipants?.join(", ")}`
    );
  }
  const depths = computeWaveDepths(graph, sortResult.order);
  const tasksByDepth = groupTasksByDepth(tasks2, depths);
  const { wavesAfterConflicts, conflictAdjustments } = resolveFileConflicts(
    tasksByDepth
  );
  const { finalWaves, capacityAdjustments } = applyCapacityConstraints(
    wavesAfterConflicts,
    config?.maxTasksPerWave
  );
  const totalWaves = finalWaves.length;
  const maxParallelism = Math.max(
    ...finalWaves.map((w) => w.tasks.length),
    0
  );
  return {
    waves: finalWaves,
    totalWaves,
    maxParallelism,
    adjustments: [...conflictAdjustments, ...capacityAdjustments]
  };
}
function computeWaveDepths(graph, topologicalOrder) {
  const depths = /* @__PURE__ */ new Map();
  for (const taskCode of topologicalOrder) {
    depths.set(taskCode, 0);
  }
  for (const taskCode of topologicalOrder) {
    const node = graph.get(taskCode);
    let maxDepth = 0;
    for (const depTaskCode of node.dependencies) {
      const depDepth = depths.get(depTaskCode) || 0;
      maxDepth = Math.max(maxDepth, depDepth + 1);
    }
    depths.set(taskCode, maxDepth);
  }
  return depths;
}
function groupTasksByDepth(tasks2, depths) {
  const grouped = /* @__PURE__ */ new Map();
  for (const task of tasks2) {
    const depth = depths.get(task.taskCode) || 0;
    const existing = grouped.get(depth) || [];
    existing.push(task);
    grouped.set(depth, existing);
  }
  return grouped;
}
function resolveFileConflicts(tasksByDepth) {
  const adjustments = [];
  const result = /* @__PURE__ */ new Map();
  const depths = Array.from(tasksByDepth.keys()).sort((a, b) => a - b);
  for (const depth of depths) {
    const tasksAtDepth = tasksByDepth.get(depth) || [];
    const remainingTasks = [];
    const bumpedTasks = [];
    const claimedFiles = /* @__PURE__ */ new Set();
    for (const task of tasksAtDepth) {
      const hasConflict = task.filePaths.some((file) => claimedFiles.has(file));
      if (hasConflict) {
        bumpedTasks.push(task);
        const conflictingFiles2 = task.filePaths.filter(
          (file) => claimedFiles.has(file)
        );
        adjustments.push({
          type: "FILE_CONFLICT_BUMP",
          taskCode: task.taskCode,
          fromWave: depth,
          toWave: depth + 1,
          reason: `File conflict detected with files: ${conflictingFiles2.join(", ")}`
        });
      } else {
        remainingTasks.push(task);
        for (const file of task.filePaths) {
          claimedFiles.add(file);
        }
      }
    }
    if (remainingTasks.length > 0) {
      result.set(depth, remainingTasks);
    }
    if (bumpedTasks.length > 0) {
      const nextDepth = depth + 1;
      const existingAtNext = result.get(nextDepth) || [];
      result.set(nextDepth, [...existingAtNext, ...bumpedTasks]);
    }
  }
  return {
    wavesAfterConflicts: result,
    conflictAdjustments: adjustments
  };
}
function applyCapacityConstraints(tasksByDepth, maxTasksPerWave) {
  const adjustments = [];
  const waves2 = [];
  const depths = Array.from(tasksByDepth.keys()).sort((a, b) => a - b);
  for (const depth of depths) {
    const tasksAtDepth = tasksByDepth.get(depth) || [];
    if (!maxTasksPerWave || tasksAtDepth.length <= maxTasksPerWave) {
      waves2.push({
        waveIndex: waves2.length,
        label: generateWaveLabel(depth, tasksAtDepth),
        tasks: tasksAtDepth
      });
    } else {
      const subWaveCount = Math.ceil(tasksAtDepth.length / maxTasksPerWave);
      for (let subIndex = 0; subIndex < subWaveCount; subIndex++) {
        const startIdx = subIndex * maxTasksPerWave;
        const endIdx = Math.min(
          startIdx + maxTasksPerWave,
          tasksAtDepth.length
        );
        const subWaveTasks = tasksAtDepth.slice(startIdx, endIdx);
        waves2.push({
          waveIndex: waves2.length,
          label: generateWaveLabel(depth, subWaveTasks, subIndex),
          tasks: subWaveTasks
        });
        if (subIndex > 0) {
          for (const task of subWaveTasks) {
            adjustments.push({
              type: "CAPACITY_SPLIT",
              taskCode: task.taskCode,
              fromWave: depth,
              toWave: waves2.length - 1,
              reason: `Wave split due to capacity constraint (max ${maxTasksPerWave} tasks per wave)`
            });
          }
        }
      }
    }
  }
  return {
    finalWaves: waves2,
    capacityAdjustments: adjustments
  };
}

// src/wave-planner/plan-scorer.ts
function scorePlan(assignment, criticalPathLength, edges, tasks2) {
  const totalTasks = tasks2.length;
  if (totalTasks === 0) {
    return {
      parallelizationScore: 0,
      maxParallelism: 0,
      waveEfficiency: 0,
      dependencyDensity: 0,
      fileConflictScore: 1,
      confidenceSignals: {
        parallelization: "LOW",
        conflictRisk: "LOW"
      }
    };
  }
  const parallelizationScore = criticalPathLength > 0 ? 1 - criticalPathLength / totalTasks : 0;
  const maxParallelism = assignment.maxParallelism;
  const waveEfficiency = assignment.totalWaves > 0 ? totalTasks / assignment.totalWaves : 0;
  const maxPossibleEdges = totalTasks * (totalTasks - 1) / 2;
  const dependencyDensity = maxPossibleEdges > 0 ? edges.length / maxPossibleEdges : 0;
  const fileConflictScore = computeFileConflictScore(
    assignment,
    tasks2
  );
  const confidenceSignals = computeConfidenceSignals(
    parallelizationScore,
    fileConflictScore
  );
  return {
    parallelizationScore,
    maxParallelism,
    waveEfficiency,
    dependencyDensity,
    fileConflictScore,
    confidenceSignals
  };
}
function computeFileConflictScore(assignment, tasks2) {
  const totalFileRefs = tasks2.reduce(
    (sum, task) => sum + task.filePaths.length,
    0
  );
  if (totalFileRefs === 0) {
    return 1;
  }
  const fileConflictAdjustments = assignment.adjustments.filter(
    (adj) => adj.type === "FILE_CONFLICT_BUMP"
  ).length;
  const conflictRatio = fileConflictAdjustments / totalFileRefs;
  const score = Math.max(0, 1 - conflictRatio);
  return score;
}
function computeConfidenceSignals(parallelizationScore, fileConflictScore) {
  let parallelization;
  if (parallelizationScore > 0.7) {
    parallelization = "HIGH";
  } else if (parallelizationScore > 0.4) {
    parallelization = "MEDIUM";
  } else {
    parallelization = "LOW";
  }
  let conflictRisk;
  if (fileConflictScore > 0.9) {
    conflictRisk = "LOW";
  } else if (fileConflictScore > 0.6) {
    conflictRisk = "MEDIUM";
  } else {
    conflictRisk = "HIGH";
  }
  return {
    parallelization,
    conflictRisk
  };
}

// src/wave-planner/ai-client.ts
import Anthropic from "@anthropic-ai/sdk";
var WavePlannerAIClient = class {
  constructor(config) {
    this.config = config;
    this.client = new Anthropic({
      apiKey: config.apiKey,
      timeout: config.timeout
    });
  }
  /**
   * Generate a wave plan by calling Claude API
   * @param prompt - The constructed prompt for wave planning
   * @returns Generation result with content and metadata
   */
  async generatePlan(prompt) {
    const startTime = Date.now();
    try {
      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      });
      const durationMs = Date.now() - startTime;
      const textContent = response.content.filter((block) => block.type === "text").map((block) => "text" in block ? block.text : "").join("\n");
      return {
        content: textContent,
        tokensInput: response.usage.input_tokens,
        tokensOutput: response.usage.output_tokens,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        durationMs,
        model: response.model
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      throw new Error(
        `Claude API call failed after ${durationMs}ms: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  /**
   * Generate a wave plan with retry logic and exponential backoff
   * @param prompt - The constructed prompt for wave planning
   * @param maxRetries - Maximum number of retry attempts (default: 3)
   * @returns Generation result with content and metadata
   */
  async generateWithRetry(prompt, maxRetries = 3) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.generatePlan(prompt);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt === maxRetries) {
          break;
        }
        const delayMs = Math.pow(2, attempt) * 1e3;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw new Error(
      `Failed to generate plan after ${maxRetries + 1} attempts: ${lastError?.message || "Unknown error"}`
    );
  }
};

// src/wave-planner/fallback.ts
function createFlatPlan(tasks2) {
  if (tasks2.length === 0) {
    throw new Error("Cannot create flat plan from empty task list");
  }
  const flatTasks = tasks2.map((task, index2) => ({
    ...task,
    taskCode: `1.${index2 + 1}`,
    dependencies: [],
    // Clear all dependencies for flat plan
    canRunInParallel: true
    // All tasks can run in parallel
  }));
  const wave = {
    waveIndex: 1,
    label: "Wave 1",
    tasks: flatTasks
  };
  const criticalPath = [flatTasks[0].taskCode];
  const statistics = {
    totalTasks: flatTasks.length,
    totalWaves: 1,
    maxParallelism: flatTasks.length,
    // All tasks can run in parallel
    criticalPathLength: 1,
    // Only one task on critical path
    sequentialChains: 0
    // No sequential dependencies
  };
  return {
    waves: [wave],
    dependencyEdges: [],
    // No dependencies in flat plan
    criticalPath,
    statistics,
    rawMarkdown: "(Fallback flat plan - no markdown available)"
  };
}
function createFlatPlanFromDescriptions(descriptions) {
  if (descriptions.length === 0) {
    throw new Error("Cannot create flat plan from empty descriptions list");
  }
  const tasks2 = descriptions.map((description, index2) => ({
    taskCode: `1.${index2 + 1}`,
    description,
    filePaths: [],
    // No file paths available
    dependencies: [],
    canRunInParallel: true,
    recommendedModel: "sonnet",
    // Default to balanced model
    complexity: "M"
    // Default to medium complexity
  }));
  return createFlatPlan(tasks2);
}

// src/wave-planner/fleet-context.ts
import { eq, or } from "drizzle-orm";
var FleetContextService = class {
  /**
   * Assemble fleet context for a target repository
   * Queries active sessions and in-flight files to determine available capacity
   *
   * @param targetRepo - The repository to check fleet context for
   * @returns FleetContextBlock with available workers, in-flight files, and active sessions
   */
  async assembleContext(targetRepo) {
    const db2 = getDatabase();
    const activeSessions = await db2.select().from(rufloSessions).where(
      or(
        eq(rufloSessions.status, "ACTIVE"),
        eq(rufloSessions.status, "NEEDS_SPEC")
      )
    );
    const inFlightFilesData = await db2.select().from(inFlightFiles);
    const availableWorkers = {};
    const repoSessionCounts = {};
    for (const session of activeSessions) {
      repoSessionCounts[session.repo] = (repoSessionCounts[session.repo] || 0) + 1;
    }
    const MAX_WORKERS_PER_REPO = 4;
    const allReposArray = [targetRepo, ...activeSessions.map((s) => s.repo)];
    const uniqueRepos = Array.from(new Set(allReposArray));
    for (const repo of uniqueRepos) {
      const activeCount = repoSessionCounts[repo] || 0;
      availableWorkers[repo] = Math.max(0, MAX_WORKERS_PER_REPO - activeCount);
    }
    const formattedInFlightFiles = inFlightFilesData.map((file) => ({
      path: file.path,
      sessionId: file.activeSessionId,
      ticketId: file.linearTicketId,
      estimatedMinutesRemaining: file.estimatedMinutesRemaining
    }));
    const formattedActiveSessions = activeSessions.map((session) => ({
      repo: session.repo,
      ticketId: session.linearTicketId,
      progressPercent: session.progressPercent,
      estimatedRemainingMinutes: session.estimatedRemainingMinutes
    }));
    return {
      availableWorkers,
      inFlightFiles: formattedInFlightFiles,
      activeSessions: formattedActiveSessions
    };
  }
  /**
   * Extract file paths that should be avoided from fleet context
   * These files are currently being worked on by other sessions
   *
   * @param fleetContext - The fleet context block
   * @returns Array of file paths to avoid
   */
  getAvoidFiles(fleetContext) {
    return fleetContext.inFlightFiles.map((file) => file.path);
  }
};

// src/wave-planner/codebase-context.ts
import { promises as fs } from "fs";
import { join, relative } from "path";
import { exec } from "child_process";
import { promisify } from "util";
var execAsync = promisify(exec);
var CodebaseContextService = class {
  /**
   * Assemble codebase context for a repository
   * Generates file tree and identifies recently modified files
   *
   * @param repo - The repository identifier
   * @param workingDir - The working directory path for the repository
   * @returns CodebaseContextBlock with file tree and recently modified files
   */
  async assembleContext(repo, workingDir) {
    const fileTree = await this.generateFileTree(workingDir, 3);
    const recentlyModifiedFiles = await this.getRecentlyModifiedFiles(workingDir, 20);
    return {
      fileTree,
      recentlyModifiedFiles
    };
  }
  /**
   * Generate an ASCII file tree representation of the directory
   * Excludes common build artifacts and dependencies
   *
   * @param dir - The directory to generate the tree for
   * @param maxDepth - Maximum depth to traverse (default: 3)
   * @returns ASCII file tree string
   */
  async generateFileTree(dir, maxDepth = 3) {
    const excludeDirs = /* @__PURE__ */ new Set(["node_modules", ".git", "dist", "build", "coverage", ".next", "out", ".cache"]);
    const tree = [];
    const traverse = async (currentPath, depth, prefix = "") => {
      if (depth > maxDepth) return;
      try {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });
        const sortedEntries = entries.sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        });
        for (let i = 0; i < sortedEntries.length; i++) {
          const entry = sortedEntries[i];
          const isLast = i === sortedEntries.length - 1;
          if (excludeDirs.has(entry.name)) continue;
          if (entry.name.startsWith(".") && !["..env.example", ".gitignore"].includes(entry.name)) {
            continue;
          }
          const connector = isLast ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 ";
          const newPrefix = isLast ? "    " : "\u2502   ";
          if (entry.isDirectory()) {
            tree.push(`${prefix}${connector}${entry.name}/`);
            await traverse(join(currentPath, entry.name), depth + 1, prefix + newPrefix);
          } else {
            tree.push(`${prefix}${connector}${entry.name}`);
          }
        }
      } catch (error) {
        console.error(`Error reading directory ${currentPath}:`, error);
      }
    };
    try {
      const dirName = dir.split("/").pop() || "root";
      tree.push(`${dirName}/`);
      await traverse(dir, 0);
    } catch (error) {
      tree.push(`Error generating file tree: ${error}`);
    }
    return tree.join("\n");
  }
  /**
   * Get recently modified files using git or file system stats
   * Prefers git for better accuracy
   *
   * @param dir - The directory to check
   * @param limit - Maximum number of files to return (default: 20)
   * @returns Array of file paths (relative to the working directory)
   */
  async getRecentlyModifiedFiles(dir, limit = 20) {
    try {
      const { stdout } = await execAsync(
        `git -C "${dir}" log --pretty=format: --name-only --since="1 week ago" | sort | uniq`,
        { maxBuffer: 1024 * 1024 }
      );
      const files = stdout.split("\n").filter((line) => line.trim().length > 0).filter((file) => {
        const lowerFile = file.toLowerCase();
        return !lowerFile.includes("node_modules") && !lowerFile.includes(".git") && !lowerFile.includes("dist/") && !lowerFile.includes("build/") && !lowerFile.includes("coverage/") && !lowerFile.endsWith(".lock") && !lowerFile.endsWith(".log");
      }).slice(0, limit);
      if (files.length > 0) {
        return files;
      }
    } catch (error) {
      console.warn("Git not available, falling back to file stats");
    }
    return this.getRecentlyModifiedFilesByStats(dir, limit);
  }
  /**
   * Fallback method to get recently modified files using file system stats
   *
   * @param dir - The directory to check
   * @param limit - Maximum number of files to return
   * @returns Array of file paths (relative to the working directory)
   */
  async getRecentlyModifiedFilesByStats(dir, limit) {
    const excludeDirs = /* @__PURE__ */ new Set(["node_modules", ".git", "dist", "build", "coverage", ".next", "out"]);
    const files = [];
    const traverse = async (currentPath, depth = 0) => {
      if (depth > 5) return;
      try {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });
        for (const entry of entries) {
          if (excludeDirs.has(entry.name)) continue;
          if (entry.name.startsWith(".")) continue;
          const fullPath = join(currentPath, entry.name);
          if (entry.isDirectory()) {
            await traverse(fullPath, depth + 1);
          } else {
            const stats = await fs.stat(fullPath);
            const relativePath = relative(dir, fullPath);
            files.push({ path: relativePath, mtime: stats.mtime });
          }
        }
      } catch (error) {
      }
    };
    await traverse(dir);
    return files.sort((a, b) => b.mtime.getTime() - a.mtime.getTime()).slice(0, limit).map((f) => f.path);
  }
};

// src/wave-planner/prompt-templates/default.ts
var defaultTemplate = {
  name: "default",
  version: "1.0.0",
  render(context) {
    return `# Wave-Decomposed Execution Plan Generator

You are an expert software architect generating a wave-decomposed execution plan. Your goal is to break down the specification into parallel-executable tasks organized into waves.

## Specification
\`\`\`
${context.specContent}
\`\`\`

## Context

### Item Metadata
- **Title**: ${context.itemTitle}
- **Item ID**: ${context.itemId}
- **Repository**: ${context.repo}

${renderFleetContext(context)}

${renderCodebaseContext(context)}

${renderConstraints(context)}

${renderMemoryContext(context)}

${renderWorkContext(context)}

## Wave Planning Rules

### Wave Structure
1. **Waves are execution phases**: All tasks within a wave can run in parallel
2. **Dependencies define wave boundaries**: A task cannot start until all its dependencies complete
3. **File conflicts prevent parallelism**: Tasks touching the same file MUST be in different waves
4. **Maximize parallelization**: Break work into the smallest independent units possible
5. **Minimize critical path**: Reduce the longest chain of dependent tasks

### Task Granularity
- **Small tasks (S)**: Single function/component changes, 5-15 minutes
- **Medium tasks (M)**: Multiple related files, 15-30 minutes
- **Large tasks (L)**: Cross-cutting changes, 30-60 minutes
- **Extra Large (XL)**: Major refactors or migrations, 60+ minutes

### Model Selection
- **Haiku**: Simple changes, clear specifications, low complexity (S-M tasks)
- **Sonnet**: Moderate complexity, requires reasoning, most tasks (M-L tasks)
- **Opus**: Complex architecture changes, ambiguous requirements (L-XL tasks)

### Dependency Types
- **Hard dependencies**: Task B requires outputs from Task A (code, types, interfaces)
- **Soft dependencies**: Task B benefits from Task A context but can technically run independently
- Use hard dependencies sparingly; prefer file-based sequencing

## Output Format

Generate your plan using the following structure:

### Wave Tables

For each wave, create a markdown table with these columns:

| Task ID | Description | Files | Dependencies | Parallel? | Model | Complexity |
|---------|-------------|-------|--------------|-----------|-------|------------|

**Column specifications:**
- **Task ID**: Format as \`W.T\` (e.g., 1.1, 1.2, 2.1) where W=wave number, T=task number
- **Description**: Clear, actionable task description (1-2 sentences)
- **Files**: Comma-separated list of files this task will modify/create
- **Dependencies**: Comma-separated list of Task IDs this task depends on (empty if none)
- **Parallel?**: "Yes" if can run with other tasks in wave, "No" if sequential
- **Model**: "haiku", "sonnet", or "opus"
- **Complexity**: "S", "M", "L", or "XL"

**Example:**
\`\`\`markdown
## Wave 1: Foundation

| Task ID | Description | Files | Dependencies | Parallel? | Model | Complexity |
|---------|-------------|-------|--------------|-----------|-------|------------|
| 1.1 | Create base type definitions | src/types.ts | - | Yes | haiku | S |
| 1.2 | Set up database schema | src/db/schema.ts | - | Yes | sonnet | M |
| 1.3 | Initialize config module | src/config.ts | - | Yes | haiku | S |

## Wave 2: Core Implementation

| Task ID | Description | Files | Dependencies | Parallel? | Model | Complexity |
|---------|-------------|-------|--------------|-----------|-------|------------|
| 2.1 | Implement user service | src/services/user.ts | 1.1, 1.2 | Yes | sonnet | M |
| 2.2 | Implement auth service | src/services/auth.ts | 1.1, 1.2 | Yes | sonnet | M |
\`\`\`

### Dependency Graph

After all wave tables, include a dependency graph section:

\`\`\`markdown
## Dependency Graph

\`\`\`mermaid
graph TD
  1.1[Task 1.1: Base types]
  1.2[Task 1.2: Database schema]
  1.3[Task 1.3: Config]
  2.1[Task 2.1: User service]
  2.2[Task 2.2: Auth service]

  1.1 --> 2.1
  1.2 --> 2.1
  1.1 --> 2.2
  1.2 --> 2.2
\`\`\`
\`\`\`

### Critical Path

Identify the longest chain of dependent tasks:

\`\`\`markdown
## Critical Path

**Path**: 1.1 \u2192 2.1 \u2192 3.1 \u2192 4.1
**Length**: 4 tasks
**Description**: This represents the minimum time to completion if all parallel work executes optimally.
\`\`\`

### Statistics

Provide high-level metrics:

\`\`\`markdown
## Statistics

- **Total Tasks**: 12
- **Total Waves**: 4
- **Max Parallelism**: 5 tasks (Wave 2)
- **Critical Path Length**: 4 tasks
- **Sequential Chains**: 2
- **Parallelization Ratio**: 67% (8 parallel tasks / 12 total)
\`\`\`

## Planning Strategy

1. **Identify foundations**: What types, schemas, or configs must exist first?
2. **Find natural boundaries**: Group related work that shares context
3. **Detect conflicts**: Ensure no two tasks in the same wave touch the same file
4. **Minimize dependencies**: Only add dependencies when truly required
5. **Balance waves**: Aim for similar amounts of work per wave
6. **Verify critical path**: Ensure the longest chain is as short as possible

## Important Notes

- If the specification is unclear, make reasonable assumptions and note them in task descriptions
- Prefer creating new files over modifying existing files when possible (less conflict)
- Break large tasks into smaller subtasks across multiple waves
- Consider test files as separate tasks that depend on implementation tasks
- Documentation tasks can often run in parallel with implementation

Generate the complete wave-decomposed plan now.`;
  }
};
function renderFleetContext(context) {
  const { fleetContext } = context;
  let output = "### Fleet Context\n\n";
  const workers = Object.entries(fleetContext.availableWorkers).map(([model, count]) => `- **${model}**: ${count} worker${count !== 1 ? "s" : ""}`).join("\n");
  output += "**Available Workers:**\n" + (workers || "- No workers available");
  output += "\n\n";
  if (fleetContext.inFlightFiles.length > 0) {
    output += "**Files Currently Being Modified:**\n";
    fleetContext.inFlightFiles.forEach((file) => {
      output += `- \`${file.path}\` (${file.ticketId}, ~${file.estimatedMinutesRemaining}min remaining)
`;
    });
    output += "\n**Important**: Do not schedule tasks that modify these files until they complete.\n\n";
  }
  if (fleetContext.activeSessions.length > 0) {
    output += "**Active Sessions:**\n";
    fleetContext.activeSessions.forEach((session) => {
      output += `- ${session.ticketId} (${session.progressPercent}% complete, ~${session.estimatedRemainingMinutes}min remaining)
`;
    });
    output += "\n";
  }
  return output;
}
function renderCodebaseContext(context) {
  const { codebaseContext } = context;
  let output = "### Codebase Context\n\n";
  if (codebaseContext.fileTree) {
    output += "**Project Structure:**\n```\n";
    output += codebaseContext.fileTree;
    output += "\n```\n\n";
  }
  if (codebaseContext.recentlyModifiedFiles.length > 0) {
    output += "**Recently Modified Files:**\n";
    codebaseContext.recentlyModifiedFiles.forEach((file) => {
      output += `- \`${file}\`
`;
    });
    output += "\nConsider these files when planning changes to maintain consistency.\n\n";
  }
  if (codebaseContext.moduleStructure) {
    output += "**Module Structure:**\n```\n";
    output += codebaseContext.moduleStructure;
    output += "\n```\n\n";
  }
  return output;
}
function renderConstraints(context) {
  const { constraints } = context;
  let output = "### Constraints\n\n";
  if (constraints.avoidFiles.length > 0) {
    output += "**Files to Avoid:**\n";
    constraints.avoidFiles.forEach((file) => {
      output += `- \`${file}\`
`;
    });
    output += "\nDo not schedule tasks that modify these files.\n\n";
  }
  if (constraints.preferModel) {
    output += `**Preferred Model**: ${constraints.preferModel}
`;
    output += "Use this model for tasks when appropriate.\n\n";
  }
  if (constraints.maxCost) {
    output += `**Maximum Cost**: $${constraints.maxCost}
`;
    output += "Optimize for cost by preferring smaller models when possible.\n\n";
  }
  if (constraints.maxConcurrency) {
    output += `**Maximum Concurrency**: ${constraints.maxConcurrency} tasks
`;
    output += "Ensure no wave exceeds this parallelism limit.\n\n";
  }
  if (constraints.customConstraints.length > 0) {
    output += "**Additional Constraints:**\n";
    constraints.customConstraints.forEach((constraint) => {
      output += `- ${constraint}
`;
    });
    output += "\n";
  }
  return output;
}
function renderMemoryContext(context) {
  if (!context.memoryContext) return "";
  const { relevantSessions, palace } = context.memoryContext;
  const hasSessions = relevantSessions && relevantSessions.length > 0;
  const hasPalace = palace && (palace.identity || palace.criticalFacts.length > 0 || palace.topicalClosets.length > 0);
  if (!hasSessions && !hasPalace) return "";
  let output = "### Memory Context\n\n";
  if (hasPalace && palace) {
    if (palace.identity) {
      output += "**Identity (L0):**\n";
      output += palace.identity + "\n\n";
    }
    if (palace.criticalFacts.length > 0) {
      output += "**Critical Facts (L1):**\n";
      palace.criticalFacts.forEach((fact) => {
        output += `- ${fact}
`;
      });
      output += "\n";
    }
    if (palace.topicalClosets.length > 0) {
      output += "**Topical Recall (L2):**\n";
      palace.topicalClosets.forEach((closet) => {
        output += `- *[${closet.topic}]* ${closet.summary}
`;
      });
      output += "\n";
    }
    output += `_Palace context: ~${palace.tokenEstimate} tokens \xB7 wing \`${palace.wingSlug}\`_

`;
  }
  if (hasSessions) {
    output += "**Relevant Past Sessions:**\n";
    relevantSessions.forEach((session) => {
      output += `- **${session.date}** (${session.ticketId}): ${session.summary}
`;
      if (session.constraintApplied) {
        output += `  *Constraint*: ${session.constraintApplied}
`;
      }
    });
    output += "\n";
  }
  output += "Use these insights to inform your planning decisions.\n\n";
  return output;
}
function renderWorkContext(context) {
  let output = "";
  if (context.completedWork && context.completedWork.tasks.length > 0) {
    output += "### Completed Work\n\n";
    output += "The following tasks have already been completed:\n\n";
    context.completedWork.tasks.forEach((task) => {
      output += `**${task.taskCode}**: ${task.description}
`;
      output += `- Files modified: ${task.filesModified.join(", ")}
`;
      output += `- Summary: ${task.completionSummary}

`;
    });
  }
  if (context.remainingWork && context.remainingWork.tasks.length > 0) {
    output += "### Remaining Work\n\n";
    output += "Focus your plan on these remaining tasks:\n\n";
    context.remainingWork.tasks.forEach((task) => {
      output += `**${task.taskCode}**: ${task.description}
`;
      output += `- Original dependencies: ${task.originalDependencies.join(", ") || "None"}
`;
      output += `- Original files: ${task.originalFiles.join(", ")}

`;
    });
    output += "Adjust dependencies based on completed work and current codebase state.\n\n";
  }
  return output;
}

// src/wave-planner/prompt-templates/simplified.ts
var simplifiedTemplate = {
  name: "simplified",
  version: "1.0.0",
  render(context) {
    return `# Generate Wave Execution Plan

Break down this specification into tasks organized into waves.

## Specification
\`\`\`
${context.specContent}
\`\`\`

## Repository
${context.repo}

${renderSimplifiedConstraints(context)}

## Instructions

1. **Create waves**: Group tasks that can run in parallel
2. **No file conflicts**: Tasks in the same wave cannot modify the same file
3. **Add dependencies**: Only when task B needs outputs from task A
4. **Keep it simple**: Focus on clear task breakdown

## Output Format

Use this exact format:

\`\`\`markdown
## Wave 1: [Wave Name]

| Task ID | Description | Files | Dependencies | Parallel? | Model | Complexity |
|---------|-------------|-------|--------------|-----------|-------|------------|
| 1.1 | [Task description] | [file1.ts, file2.ts] | - | Yes | sonnet | M |
| 1.2 | [Task description] | [file3.ts] | - | Yes | haiku | S |

## Wave 2: [Wave Name]

| Task ID | Description | Files | Dependencies | Parallel? | Model | Complexity |
|---------|-------------|-------|--------------|-----------|-------|------------|
| 2.1 | [Task description] | [file4.ts] | 1.1 | Yes | sonnet | M |

## Critical Path

**Path**: 1.1 \u2192 2.1 \u2192 3.1
**Length**: 3 tasks

## Statistics

- **Total Tasks**: 6
- **Total Waves**: 3
- **Max Parallelism**: 3
- **Critical Path Length**: 3
- **Sequential Chains**: 1
\`\`\`

### Field Values

- **Task ID**: Format as \`wave.task\` (e.g., 1.1, 2.3)
- **Description**: 1-2 sentences
- **Files**: Comma-separated file paths
- **Dependencies**: Task IDs (e.g., "1.1, 1.2") or "-" for none
- **Parallel?**: "Yes" or "No"
- **Model**: "haiku", "sonnet", or "opus"
- **Complexity**: "S", "M", "L", or "XL"

## Guidelines

- **Complexity**: S=5-15min, M=15-30min, L=30-60min, XL=60+min
- **Model**: haiku=simple, sonnet=moderate, opus=complex
- **Wave boundaries**: Determined by dependencies and file conflicts
- **Maximize parallelism**: More tasks per wave = faster completion

Generate the plan now. Use the exact format shown above.`;
  }
};
function renderSimplifiedConstraints(context) {
  const { constraints, fleetContext } = context;
  let output = "";
  const criticalConstraints = [];
  if (constraints.avoidFiles.length > 0) {
    criticalConstraints.push(`Do not modify: ${constraints.avoidFiles.join(", ")}`);
  }
  if (fleetContext.inFlightFiles.length > 0) {
    const inFlightPaths = fleetContext.inFlightFiles.map((f) => f.path);
    criticalConstraints.push(`Currently being modified: ${inFlightPaths.join(", ")}`);
  }
  if (constraints.maxConcurrency) {
    criticalConstraints.push(`Maximum ${constraints.maxConcurrency} tasks per wave`);
  }
  if (constraints.preferModel) {
    criticalConstraints.push(`Prefer ${constraints.preferModel} model when appropriate`);
  }
  if (criticalConstraints.length > 0) {
    output += "## Constraints\n\n";
    criticalConstraints.forEach((constraint) => {
      output += `- ${constraint}
`;
    });
    output += "\n";
  }
  return output;
}

// src/wave-planner/prompt-templates/refinement.ts
var refinementTemplate = {
  name: "refinement",
  version: "1.0.0",
  render(context) {
    return `# Optimize Wave Execution Plan

Analyze this specification and generate a highly parallelized wave execution plan.

## Specification
\`\`\`
${context.specContent}
\`\`\`

## Optimization Goals

1. **Maximize parallelization**: Break work into the smallest independent units
2. **Minimize critical path**: Reduce the longest chain of dependent tasks
3. **Reduce dependencies**: Only add dependencies when truly required
4. **Balance waves**: Distribute work evenly across waves

Generate an optimized wave plan following the standard format.`;
  },
  renderRefinement(context, currentPlan, currentScore) {
    return `# Improve Wave Execution Plan

You are refining an existing wave execution plan to increase parallelization and reduce execution time.

## Original Specification
\`\`\`
${context.specContent}
\`\`\`

## Current Plan
\`\`\`markdown
${currentPlan}
\`\`\`

## Current Quality Metrics

**Overall Score**: ${(currentScore * 100).toFixed(1)}% (Target: 80%+)

The current plan has optimization opportunities. Your goal is to improve parallelization while maintaining correctness.

## Refinement Strategies

### 1. Break Large Tasks into Smaller Subtasks

**Bad** (sequential bottleneck):
\`\`\`
Wave 1:
- 1.1: Implement entire user module [XL] (src/user/*.ts)
  Dependencies: -

Wave 2:
- 2.1: Implement entire auth module [XL] (src/auth/*.ts)
  Dependencies: 1.1
\`\`\`

**Good** (parallel subtasks):
\`\`\`
Wave 1:
- 1.1: Create user types [S] (src/user/types.ts)
  Dependencies: -
- 1.2: Create auth types [S] (src/auth/types.ts)
  Dependencies: -

Wave 2:
- 2.1: Implement user service [M] (src/user/service.ts)
  Dependencies: 1.1
- 2.2: Implement auth service [M] (src/auth/service.ts)
  Dependencies: 1.2
- 2.3: Implement user repository [M] (src/user/repository.ts)
  Dependencies: 1.1
\`\`\`

### 2. Reduce Unnecessary Dependencies

**Bad** (false dependency):
\`\`\`
Wave 1:
- 1.1: Create user types [S]
  Dependencies: -

Wave 2:
- 2.1: Create auth types [S]
  Dependencies: 1.1  \u2190 Unnecessary!
\`\`\`

**Good** (independent):
\`\`\`
Wave 1:
- 1.1: Create user types [S]
  Dependencies: -
- 1.2: Create auth types [S]
  Dependencies: -  \u2190 Can run in parallel
\`\`\`

### 3. Identify Tasks That Can Start Earlier

**Bad** (late start):
\`\`\`
Wave 1:
- 1.1: Create shared types [S]

Wave 2:
- 2.1: Implement feature A [M]
  Dependencies: 1.1

Wave 3:
- 3.1: Write tests for feature A [M]
  Dependencies: 2.1
- 3.2: Write documentation [S]
  Dependencies: 2.1  \u2190 Could have started earlier!
\`\`\`

**Good** (early documentation):
\`\`\`
Wave 1:
- 1.1: Create shared types [S]
- 1.2: Write documentation structure [S]
  Dependencies: -  \u2190 Can start immediately

Wave 2:
- 2.1: Implement feature A [M]
  Dependencies: 1.1
- 2.2: Update documentation content [S]
  Dependencies: 1.2

Wave 3:
- 3.1: Write tests for feature A [M]
  Dependencies: 2.1
\`\`\`

### 4. Split Cross-Cutting Changes

**Bad** (monolithic task):
\`\`\`
Wave 1:
- 1.1: Update all API endpoints [XL]
  Files: api/users.ts, api/auth.ts, api/products.ts, api/orders.ts
  Dependencies: -
\`\`\`

**Good** (split by module):
\`\`\`
Wave 1:
- 1.1: Update user API endpoints [M] (api/users.ts)
  Dependencies: -
- 1.2: Update auth API endpoints [M] (api/auth.ts)
  Dependencies: -
- 1.3: Update product API endpoints [M] (api/products.ts)
  Dependencies: -
- 1.4: Update order API endpoints [M] (api/orders.ts)
  Dependencies: -
\`\`\`

### 5. Parallelize Independent Features

**Bad** (sequential features):
\`\`\`
Wave 1:
- 1.1: Implement feature A [L]

Wave 2:
- 2.1: Implement feature B [L]
  Dependencies: 1.1  \u2190 Why?
\`\`\`

**Good** (parallel features):
\`\`\`
Wave 1:
- 1.1: Implement feature A [L]
  Dependencies: -
- 1.2: Implement feature B [L]
  Dependencies: -  \u2190 Independent features run in parallel
\`\`\`

## Refinement Checklist

Before generating the improved plan, verify:

- [ ] All XL tasks are broken into M or smaller subtasks
- [ ] Dependencies exist only when task B needs outputs from task A
- [ ] No artificial sequencing (tasks waiting unnecessarily)
- [ ] Independent features run in parallel
- [ ] Each wave has multiple tasks when possible
- [ ] Critical path is as short as possible
- [ ] File conflicts are properly handled (no same-file tasks in one wave)

## Important Constraints

${renderRefinementConstraints(context)}

## Output Format

Generate the complete improved plan using the standard wave plan format:

- Wave tables with all columns (Task ID, Description, Files, Dependencies, Parallel?, Model, Complexity)
- Dependency graph (mermaid)
- Critical path identification
- Statistics section

Focus on maximizing parallelization while maintaining correctness and respecting all constraints.

Generate the improved plan now.`;
  }
};
function renderRefinementConstraints(context) {
  const { constraints, fleetContext } = context;
  const constraintsList = [];
  if (fleetContext.inFlightFiles.length > 0) {
    const inFlightPaths = fleetContext.inFlightFiles.map((f) => `\`${f.path}\``).join(", ");
    constraintsList.push(`Files currently locked: ${inFlightPaths}`);
  }
  if (constraints.avoidFiles.length > 0) {
    const avoidPaths = constraints.avoidFiles.map((f) => `\`${f}\``).join(", ");
    constraintsList.push(`Files to avoid: ${avoidPaths}`);
  }
  if (constraints.maxConcurrency) {
    constraintsList.push(`Maximum tasks per wave: ${constraints.maxConcurrency}`);
  }
  const totalWorkers = Object.values(fleetContext.availableWorkers).reduce((a, b) => a + b, 0);
  if (totalWorkers > 0) {
    constraintsList.push(`Available workers: ${totalWorkers} total`);
  }
  if (constraints.preferModel) {
    constraintsList.push(`Preferred model: ${constraints.preferModel}`);
  }
  if (constraints.maxCost) {
    constraintsList.push(`Maximum cost: $${constraints.maxCost} (prefer smaller models)`);
  }
  if (constraints.customConstraints.length > 0) {
    constraintsList.push(...constraints.customConstraints);
  }
  if (constraintsList.length === 0) {
    return "- No specific constraints\n";
  }
  return constraintsList.map((c) => `- ${c}`).join("\n") + "\n";
}

// src/wave-planner/prompt-constructor.ts
var PromptConstructor = class {
  constructor(options) {
    this.fleetContextService = new FleetContextService();
    this.codebaseContextService = new CodebaseContextService();
    this.memPalaceService = options?.memPalaceService;
    this.templates = /* @__PURE__ */ new Map([
      ["default", defaultTemplate],
      ["simplified", simplifiedTemplate],
      ["refinement", refinementTemplate]
    ]);
  }
  /**
   * Attach (or replace) the MemPalace service after construction.
   * Useful for wiring in dependency-injection-style contexts.
   */
  setMemPalaceService(service) {
    this.memPalaceService = service;
  }
  /**
   * Assemble full prompt context from services and configuration.
   *
   * @param specContent - The specification content to plan
   * @param itemTitle - Title of the horizon item
   * @param itemId - ID of the horizon item
   * @param repo - Repository identifier
   * @param config - Constructor configuration
   * @returns Complete PromptContext ready for template rendering
   */
  async assembleContext(specContent, itemTitle, itemId, repo, config) {
    const fleetContext = await this.fleetContextService.assembleContext(repo);
    const codebaseContext = await this.codebaseContextService.assembleContext(
      repo,
      config.workingDir
    );
    const constraints = this.assembleConstraints(config, fleetContext);
    const memoryContext = await this.assembleMemoryContext(
      specContent,
      itemTitle,
      repo,
      config
    );
    return {
      specContent,
      itemTitle,
      itemId,
      repo,
      fleetContext,
      codebaseContext,
      constraints,
      memoryContext
    };
  }
  /**
   * Assemble MemoryContextBlock. Currently produces only the palace
   * portion; the legacy `relevantSessions` list is left empty for
   * callers that don't supply one (the wave planner then only renders
   * the palace block).
   */
  async assembleMemoryContext(specContent, itemTitle, repo, config) {
    if (!this.memPalaceService || !this.memPalaceService.enabled) {
      return void 0;
    }
    const topicHints = config.memPalaceTopicHints ?? deriveTopicHints(itemTitle, specContent);
    const block = await this.memPalaceService.assemblePromptContext({
      wingSlug: config.memPalaceWingSlug ?? repo,
      topicHints,
      maxTokens: config.memPalaceMaxTokens
    });
    if (!block) return void 0;
    return {
      relevantSessions: [],
      palace: {
        identity: block.identity,
        criticalFacts: block.criticalFacts,
        topicalClosets: block.topicalClosets,
        tokenEstimate: block.tokenEstimate,
        wingSlug: block.wingSlug
      }
    };
  }
  /**
   * Assemble constraints from configuration and fleet context.
   */
  assembleConstraints(config, fleetContext) {
    const avoidFiles = this.fleetContextService.getAvoidFiles(fleetContext);
    return {
      avoidFiles,
      preferModel: config.preferModel,
      maxCost: config.maxCost,
      maxConcurrency: config.maxConcurrency,
      customConstraints: config.customConstraints || []
    };
  }
  /**
   * Construct a full prompt for wave plan generation.
   *
   * @param specContent - The specification content to plan
   * @param itemTitle - Title of the horizon item
   * @param itemId - ID of the horizon item
   * @param repo - Repository identifier
   * @param config - Constructor configuration
   * @returns Rendered prompt string ready for Claude API
   */
  async constructPrompt(specContent, itemTitle, itemId, repo, config) {
    const context = await this.assembleContext(
      specContent,
      itemTitle,
      itemId,
      repo,
      config
    );
    const templateName = config.template || "default";
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Unknown template: ${templateName}`);
    }
    return template.render(context);
  }
  /**
   * Construct a refinement prompt for improving an existing plan.
   *
   * @param specContent - The specification content
   * @param itemTitle - Title of the horizon item
   * @param itemId - ID of the horizon item
   * @param repo - Repository identifier
   * @param config - Constructor configuration
   * @param currentPlan - Current plan markdown to refine
   * @param currentScore - Current parallelization score (0-1)
   * @returns Rendered refinement prompt
   */
  async constructRefinementPrompt(specContent, itemTitle, itemId, repo, config, currentPlan, currentScore) {
    const context = await this.assembleContext(
      specContent,
      itemTitle,
      itemId,
      repo,
      config
    );
    const template = refinementTemplate;
    return template.renderRefinement(context, currentPlan, currentScore);
  }
  /**
   * Construct a reoptimization prompt for mid-execution replanning.
   *
   * @param specContent - The specification content
   * @param itemTitle - Title of the horizon item
   * @param itemId - ID of the horizon item
   * @param repo - Repository identifier
   * @param config - Constructor configuration
   * @param completedTasks - Summary of completed tasks
   * @param remainingTasks - Remaining tasks to replan
   * @returns Rendered reoptimization prompt
   */
  async constructReoptimizePrompt(specContent, itemTitle, itemId, repo, config, completedTasks2, remainingTasks) {
    const context = await this.assembleContext(
      specContent,
      itemTitle,
      itemId,
      repo,
      config
    );
    const fullContext = {
      ...context,
      completedWork: { tasks: completedTasks2 },
      remainingWork: { tasks: remainingTasks }
    };
    return defaultTemplate.render(fullContext);
  }
  /**
   * Get available template names.
   */
  getAvailableTemplates() {
    return Array.from(this.templates.keys());
  }
  /**
   * Register a custom template.
   */
  registerTemplate(name, template) {
    this.templates.set(name, template);
  }
};
function createPromptConstructor(options) {
  return new PromptConstructor(options);
}
function deriveTopicHints(itemTitle, specContent) {
  const text8 = `${itemTitle}
${specContent}`.toLowerCase();
  const candidates = /* @__PURE__ */ new Set();
  for (const match of itemTitle.matchAll(/\b([A-Z][a-z]{3,})/g)) {
    candidates.add(match[1].toLowerCase());
  }
  const domainKeywords = [
    "auth",
    "authentication",
    "authorization",
    "billing",
    "payments",
    "api",
    "database",
    "schema",
    "migration",
    "frontend",
    "backend",
    "deploy",
    "deployment",
    "test",
    "testing",
    "architecture",
    "refactor",
    "performance",
    "security",
    "cache"
  ];
  for (const kw of domainKeywords) {
    if (text8.includes(kw)) candidates.add(kw);
  }
  return Array.from(candidates).slice(0, 5);
}

// src/wave-planner/plan-refinement-service.ts
var DEFAULT_REFINEMENT_CONFIG = {
  minParallelizationScore: 0.3,
  maxRefinementIterations: 2,
  useSimplifiedOnRetry: true,
  maxTasksPerWave: void 0
};
var PlanRefinementService = class {
  constructor(aiClientConfig, refinementConfig) {
    this.promptConstructor = new PromptConstructor();
    this.aiClient = new WavePlannerAIClient(aiClientConfig);
    this.config = { ...DEFAULT_REFINEMENT_CONFIG, ...refinementConfig };
  }
  /**
   * Generate and refine a wave plan until quality threshold is met.
   *
   * @param specContent - Specification content to plan
   * @param itemTitle - Title of the horizon item
   * @param itemId - ID of the horizon item
   * @param repo - Repository identifier
   * @param constructorConfig - Prompt constructor configuration
   * @returns Refinement result with final plan and metrics
   */
  async generateAndRefine(specContent, itemTitle, itemId, repo, constructorConfig) {
    let currentPlan = null;
    let currentScore = null;
    let iterationsPerformed = 0;
    let totalTokensUsed = 0;
    try {
      const initialResult = await this.generateInitialPlan(
        specContent,
        itemTitle,
        itemId,
        repo,
        constructorConfig
      );
      currentPlan = initialResult.plan;
      currentScore = initialResult.score;
      totalTokensUsed += initialResult.tokensUsed;
      iterationsPerformed = 1;
      if (currentScore.parallelizationScore >= this.config.minParallelizationScore) {
        return {
          plan: currentPlan,
          score: currentScore,
          iterationsPerformed,
          totalTokensUsed,
          success: true
        };
      }
      for (let i = 0; i < this.config.maxRefinementIterations; i++) {
        const refinementResult = await this.refineplan(
          specContent,
          itemTitle,
          itemId,
          repo,
          constructorConfig,
          currentPlan,
          currentScore.parallelizationScore
        );
        totalTokensUsed += refinementResult.tokensUsed;
        iterationsPerformed++;
        if (refinementResult.score.parallelizationScore > currentScore.parallelizationScore) {
          currentPlan = refinementResult.plan;
          currentScore = refinementResult.score;
        }
        if (currentScore.parallelizationScore >= this.config.minParallelizationScore) {
          return {
            plan: currentPlan,
            score: currentScore,
            iterationsPerformed,
            totalTokensUsed,
            success: true
          };
        }
      }
      return {
        plan: currentPlan,
        score: currentScore,
        iterationsPerformed,
        totalTokensUsed,
        success: currentScore.parallelizationScore >= this.config.minParallelizationScore,
        error: currentScore.parallelizationScore < this.config.minParallelizationScore ? `Parallelization score ${(currentScore.parallelizationScore * 100).toFixed(1)}% is below threshold ${(this.config.minParallelizationScore * 100).toFixed(1)}%` : void 0
      };
    } catch (error) {
      const fallbackPlan = this.createFallbackPlan(specContent);
      if (fallbackPlan) {
        const fallbackScore = this.scorePlan(fallbackPlan);
        return {
          plan: fallbackPlan,
          score: fallbackScore,
          iterationsPerformed,
          totalTokensUsed,
          success: false,
          error: `AI generation failed, using fallback plan: ${error instanceof Error ? error.message : String(error)}`
        };
      }
      throw error;
    }
  }
  /**
   * Generate initial plan without refinement.
   */
  async generateInitialPlan(specContent, itemTitle, itemId, repo, constructorConfig) {
    const prompt = await this.promptConstructor.constructPrompt(
      specContent,
      itemTitle,
      itemId,
      repo,
      constructorConfig
    );
    const response = await this.aiClient.generateWithRetry(prompt);
    const tokensUsed = response.tokensInput + response.tokensOutput;
    const plan = parseWavePlanResponse(response.content);
    const validation = validateDAG(
      plan.waves.flatMap((w) => w.tasks),
      plan.dependencyEdges
    );
    if (!validation.valid) {
      throw new Error(
        `Generated plan has validation errors: ${validation.errors.map((e) => e.message).join("; ")}`
      );
    }
    const score = this.scorePlan(plan);
    return { plan, score, tokensUsed };
  }
  /**
   * Refine an existing plan to improve parallelization.
   */
  async refineplan(specContent, itemTitle, itemId, repo, constructorConfig, currentPlan, currentScore) {
    const prompt = await this.promptConstructor.constructRefinementPrompt(
      specContent,
      itemTitle,
      itemId,
      repo,
      constructorConfig,
      currentPlan.rawMarkdown,
      currentScore
    );
    const response = await this.aiClient.generateWithRetry(prompt);
    const tokensUsed = response.tokensInput + response.tokensOutput;
    const plan = parseWavePlanResponse(response.content);
    const validation = validateDAG(
      plan.waves.flatMap((w) => w.tasks),
      plan.dependencyEdges
    );
    if (!validation.valid) {
      throw new Error(
        `Refined plan has validation errors: ${validation.errors.map((e) => e.message).join("; ")}`
      );
    }
    const score = this.scorePlan(plan);
    return { plan, score, tokensUsed };
  }
  /**
   * Score a parsed wave plan.
   */
  scorePlan(plan) {
    const allTasks = plan.waves.flatMap((w) => w.tasks);
    const criticalPathResult = computeCriticalPath(allTasks, plan.dependencyEdges);
    const waveAssignment = assignWaves(
      allTasks,
      plan.dependencyEdges,
      { maxTasksPerWave: this.config.maxTasksPerWave }
    );
    return scorePlan(
      waveAssignment,
      criticalPathResult.length,
      plan.dependencyEdges,
      allTasks
    );
  }
  /**
   * Create a fallback flat plan from specification.
   * This is a last resort when AI generation completely fails.
   */
  createFallbackPlan(specContent) {
    try {
      const taskDescriptions = this.extractTasksFromSpec(specContent);
      if (taskDescriptions.length === 0) {
        return null;
      }
      const tasks2 = taskDescriptions.map((description, index2) => ({
        taskCode: `1.${index2 + 1}`,
        description,
        filePaths: [],
        dependencies: [],
        canRunInParallel: true,
        recommendedModel: "sonnet",
        complexity: "M"
      }));
      return createFlatPlan(tasks2);
    } catch {
      return null;
    }
  }
  /**
   * Extract task descriptions from specification text.
   * Simple heuristic parser for numbered/bulleted lists.
   */
  extractTasksFromSpec(specContent) {
    const tasks2 = [];
    const lines = specContent.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      const numberedMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
      if (numberedMatch) {
        tasks2.push(numberedMatch[1]);
        continue;
      }
      const bulletMatch = trimmed.match(/^[-*•]\s+(.+)$/);
      if (bulletMatch) {
        tasks2.push(bulletMatch[1]);
        continue;
      }
    }
    return tasks2;
  }
};
function createPlanRefinementService(aiClientConfig, refinementConfig) {
  return new PlanRefinementService(aiClientConfig, refinementConfig);
}

// src/wave-planner/generator.ts
import { eq as eq2 } from "drizzle-orm";
var WavePlanGenerator = class {
  constructor(config) {
    this.config = config;
    this.refinementService = new PlanRefinementService(
      config.aiClient,
      config.refinement
    );
  }
  /**
   * Generate a complete wave plan for a horizon item.
   *
   * @param horizonItemId - ID of the horizon item
   * @param planId - ID of the associated plan
   * @param specContent - Specification content to plan
   * @param itemTitle - Title of the horizon item
   * @param repo - Repository identifier
   * @param constructorConfig - Prompt constructor configuration
   * @returns Complete generation result with persisted plan
   */
  async generate(horizonItemId, planId, specContent, itemTitle, repo, constructorConfig) {
    const startTime = Date.now();
    try {
      const refinementResult = await this.refinementService.generateAndRefine(
        specContent,
        itemTitle,
        horizonItemId,
        repo,
        constructorConfig
      );
      const allTasks = refinementResult.plan.waves.flatMap((w) => w.tasks);
      const edges = refinementResult.plan.dependencyEdges;
      const criticalPath = computeCriticalPath(allTasks, edges);
      const waveAssignment = assignWaves(allTasks, edges, this.config.waveAssigner);
      let wavePlanId;
      if (this.config.autoPersist !== false) {
        wavePlanId = await this.persistWavePlan(
          horizonItemId,
          planId,
          refinementResult.plan,
          criticalPath,
          waveAssignment,
          refinementResult.score
        );
      }
      const generationDurationMs = Date.now() - startTime;
      return {
        wavePlanId,
        wavePlan: refinementResult.plan,
        criticalPath,
        waveAssignment,
        score: refinementResult.score,
        metrics: {
          totalTokensUsed: refinementResult.totalTokensUsed,
          refinementIterations: refinementResult.iterationsPerformed,
          generationDurationMs
        },
        success: refinementResult.success,
        message: refinementResult.error
      };
    } catch (error) {
      const generationDurationMs = Date.now() - startTime;
      const fallbackResult = await this.generateFallbackPlan(
        horizonItemId,
        planId,
        specContent
      );
      if (fallbackResult) {
        return {
          ...fallbackResult,
          metrics: {
            totalTokensUsed: 0,
            refinementIterations: 0,
            generationDurationMs
          },
          success: false,
          message: `AI generation failed, using fallback: ${error instanceof Error ? error.message : String(error)}`
        };
      }
      throw error;
    }
  }
  /**
   * Generate a fallback flat plan when AI generation fails.
   */
  async generateFallbackPlan(horizonItemId, planId, specContent) {
    try {
      const descriptions = this.extractTaskDescriptions(specContent);
      if (descriptions.length === 0) {
        return null;
      }
      const wavePlan = createFlatPlanFromDescriptions(descriptions);
      const allTasks = wavePlan.waves.flatMap((w) => w.tasks);
      const criticalPath = computeCriticalPath(allTasks, wavePlan.dependencyEdges);
      const waveAssignment = {
        waves: wavePlan.waves.map((w, i) => ({
          waveIndex: i,
          label: w.label,
          tasks: w.tasks
        })),
        totalWaves: wavePlan.waves.length,
        maxParallelism: allTasks.length,
        adjustments: []
      };
      const score = scorePlan(
        waveAssignment,
        criticalPath.length,
        wavePlan.dependencyEdges,
        allTasks
      );
      let wavePlanId;
      if (this.config.autoPersist !== false) {
        wavePlanId = await this.persistWavePlan(
          horizonItemId,
          planId,
          wavePlan,
          criticalPath,
          waveAssignment,
          score
        );
      }
      return {
        wavePlanId,
        wavePlan,
        criticalPath,
        waveAssignment,
        score,
        success: false
      };
    } catch {
      return null;
    }
  }
  /**
   * Persist a wave plan to the database.
   */
  async persistWavePlan(horizonItemId, planId, wavePlan, criticalPath, waveAssignment, score) {
    const db2 = getDatabase();
    const existingPlans = await db2.select().from(wavePlans).where(eq2(wavePlans.horizonItemId, horizonItemId)).orderBy(wavePlans.version);
    const version = existingPlans.length > 0 ? existingPlans[existingPlans.length - 1].version + 1 : 1;
    const previousWavePlanId = existingPlans.length > 0 ? existingPlans[existingPlans.length - 1].id : null;
    const [insertedWavePlan] = await db2.insert(wavePlans).values({
      planId,
      horizonItemId,
      totalWaves: waveAssignment.totalWaves,
      totalTasks: wavePlan.statistics.totalTasks,
      maxParallelism: waveAssignment.maxParallelism,
      criticalPath: criticalPath.path,
      criticalPathLength: criticalPath.length,
      parallelizationScore: score.parallelizationScore,
      status: "draft",
      currentWaveIndex: 0,
      version,
      previousWavePlanId,
      rawMarkdown: wavePlan.rawMarkdown
    }).returning();
    const wavePlanId = insertedWavePlan.id;
    for (const wave of waveAssignment.waves) {
      const [insertedWave] = await db2.insert(waves).values({
        wavePlanId,
        waveIndex: wave.waveIndex,
        label: wave.label,
        maxParallelTasks: wave.tasks.length,
        status: "pending"
      }).returning();
      for (const task of wave.tasks) {
        const isOnCriticalPath = criticalPath.path.includes(task.taskCode);
        await db2.insert(waveTasks).values({
          waveId: insertedWave.id,
          wavePlanId,
          waveIndex: wave.waveIndex,
          taskCode: task.taskCode,
          label: task.description.slice(0, 100),
          // Truncate for label
          description: task.description,
          filePaths: task.filePaths,
          dependencies: task.dependencies,
          recommendedModel: task.recommendedModel.toUpperCase(),
          complexity: task.complexity,
          isOnCriticalPath,
          canRunInParallel: task.canRunInParallel,
          status: "pending"
        });
      }
    }
    for (const edge of wavePlan.dependencyEdges) {
      await db2.insert(dependencyEdges).values({
        wavePlanId,
        fromTaskCode: edge.from,
        toTaskCode: edge.to,
        edgeType: edge.type
      });
    }
    await db2.insert(wavePlanMetrics).values({
      wavePlanId,
      wavesExecuted: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      tasksRetried: 0,
      fileConflictsAvoided: waveAssignment.adjustments.filter(
        (a) => a.type === "FILE_CONFLICT_BUMP"
      ).length,
      reOptimizationCount: 0
    });
    return wavePlanId;
  }
  /**
   * Extract task descriptions from specification text.
   */
  extractTaskDescriptions(specContent) {
    const tasks2 = [];
    const lines = specContent.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      const numberedMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
      if (numberedMatch) {
        tasks2.push(numberedMatch[1]);
        continue;
      }
      const bulletMatch = trimmed.match(/^[-*•]\s+(.+)$/);
      if (bulletMatch) {
        tasks2.push(bulletMatch[1]);
        continue;
      }
    }
    return tasks2;
  }
  /**
   * Reoptimize an existing wave plan mid-execution.
   *
   * @param wavePlanId - ID of the wave plan to reoptimize
   * @param specContent - Original specification content
   * @param itemTitle - Title of the horizon item
   * @param repo - Repository identifier
   * @param constructorConfig - Prompt constructor configuration
   * @returns New wave plan generation result
   */
  async reoptimize(wavePlanId, specContent, itemTitle, repo, constructorConfig) {
    const db2 = getDatabase();
    const existingPlan = await db2.select().from(wavePlans).where(eq2(wavePlans.id, wavePlanId)).limit(1);
    if (existingPlan.length === 0) {
      throw new Error(`Wave plan not found: ${wavePlanId}`);
    }
    const wavePlan = existingPlan[0];
    const existingTasks = await db2.select().from(waveTasks).where(eq2(waveTasks.wavePlanId, wavePlanId));
    const completedTasks2 = existingTasks.filter((t) => t.status === "completed").map((t) => ({
      taskCode: t.taskCode,
      description: t.description,
      filesModified: t.filePaths || [],
      completionSummary: `Completed task: ${t.label}`
    }));
    const remainingTasks = existingTasks.filter((t) => t.status !== "completed" && t.status !== "skipped").map((t) => ({
      taskCode: t.taskCode,
      description: t.description,
      originalDependencies: t.dependencies || [],
      originalFiles: t.filePaths || []
    }));
    return this.generate(
      wavePlan.horizonItemId,
      wavePlan.planId,
      specContent,
      itemTitle,
      repo,
      {
        ...constructorConfig,
        customConstraints: [
          ...constructorConfig.customConstraints || [],
          `This is a reoptimization. ${completedTasks2.length} tasks are already complete.`,
          `Focus only on the ${remainingTasks.length} remaining tasks.`
        ]
      }
    );
  }
};
function createWavePlanGenerator(config) {
  return new WavePlanGenerator(config);
}
async function generateWavePlan(horizonItemId, planId, specContent, itemTitle, repo, workingDir, apiKey) {
  const generator = createWavePlanGenerator({
    aiClient: {
      apiKey,
      model: process.env.WAVE_PLANNER_MODEL || "claude-sonnet-4-20250514",
      maxTokens: parseInt(process.env.WAVE_PLANNER_MAX_TOKENS || "8192", 10)
    },
    refinement: {
      minParallelizationScore: parseFloat(
        process.env.WAVE_PLANNER_MIN_PARALLELIZATION || "0.3"
      ),
      maxRefinementIterations: 2
    },
    autoPersist: true
  });
  return generator.generate(
    horizonItemId,
    planId,
    specContent,
    itemTitle,
    repo,
    { workingDir }
  );
}

// src/wave-planner/execution/types.ts
var WAVE_SSE_TO_EVENT_TYPE = {
  wave_plan_created: "WAVE_PLAN_CREATED",
  wave_dispatching: "WAVE_DISPATCHING",
  wave_task_dispatched: "WAVE_TASK_DISPATCHED",
  wave_task_complete: "WAVE_TASK_COMPLETE",
  wave_task_failed: "WAVE_TASK_FAILED",
  wave_complete: "WAVE_COMPLETE",
  wave_advance: "WAVE_ADVANCE",
  wave_plan_complete: "WAVE_PLAN_COMPLETE",
  wave_plan_failed: "WAVE_PLAN_FAILED",
  wave_plan_reoptimizing: "WAVE_PLAN_REOPTIMIZING"
};
function toActivityEventType(t) {
  return WAVE_SSE_TO_EVENT_TYPE[t];
}

// src/wave-planner/execution/concurrency-manager.ts
var ConcurrencyManager = class {
  constructor(config) {
    this.activeTasks = /* @__PURE__ */ new Map();
    this.config = config;
  }
  /**
   * Check if we can dispatch additional tasks globally
   * @param count - Number of tasks to dispatch (default: 1)
   * @returns true if dispatch is allowed
   */
  canDispatch(count = 1) {
    return this.activeTasks.size + count <= this.config.maxTotalActiveTasks;
  }
  /**
   * Check if a specific wave plan can accept more dispatches
   * @param wavePlanId - The wave plan to check
   * @returns true if the plan can accept more tasks
   */
  canDispatchToWave(wavePlanId) {
    const activeForPlan = this.getActiveTasksForPlan(wavePlanId);
    return activeForPlan.length < this.config.maxConcurrentSubagents;
  }
  /**
   * Register a new active task
   * @param taskCode - Unique task identifier
   * @param wavePlanId - Parent wave plan ID
   * @param sessionId - Execution session ID
   */
  registerTask(taskCode, wavePlanId, sessionId) {
    this.activeTasks.set(taskCode, {
      taskCode,
      wavePlanId,
      sessionId,
      startedAt: /* @__PURE__ */ new Date()
    });
  }
  /**
   * Unregister a completed or failed task
   * @param taskCode - Task identifier to remove
   */
  unregisterTask(taskCode) {
    this.activeTasks.delete(taskCode);
  }
  /**
   * Get total number of active tasks across all plans
   * @returns Count of active tasks
   */
  getActiveTasks() {
    return this.activeTasks.size;
  }
  /**
   * Get all active task codes for a specific wave plan
   * @param wavePlanId - Wave plan to query
   * @returns Array of task codes
   */
  getActiveTasksForPlan(wavePlanId) {
    const result = [];
    this.activeTasks.forEach((info, taskCode) => {
      if (info.wavePlanId === wavePlanId) {
        result.push(taskCode);
      }
    });
    return result;
  }
  /**
   * Get detailed info for a specific active task
   * @param taskCode - Task to query
   * @returns Task info or undefined if not active
   */
  getActiveTaskInfo(taskCode) {
    return this.activeTasks.get(taskCode);
  }
  /**
   * Get all active tasks (for debugging/monitoring)
   * @returns Map of all active tasks
   */
  getAllActiveTasks() {
    return new Map(this.activeTasks);
  }
  /**
   * Reset the manager (useful for testing)
   */
  reset() {
    this.activeTasks.clear();
  }
};

// src/wave-planner/execution/completion-listener.ts
import { eq as eq3, and } from "drizzle-orm";
var CompletionListener = class {
  constructor(onWaveComplete) {
    this.onWaveComplete = onWaveComplete;
    this.db = getDatabase();
  }
  /**
   * Handle task started event.
   * Updates the wave task status to 'running' and records start time.
   */
  async handleTaskStarted(wavePlanId, taskCode, sessionId) {
    await this.db.update(waveTasks).set({
      status: "running",
      assignedSessionId: sessionId,
      startedAt: /* @__PURE__ */ new Date()
    }).where(
      and(
        eq3(waveTasks.wavePlanId, wavePlanId),
        eq3(waveTasks.taskCode, taskCode)
      )
    );
    await this.emitEvent({
      type: "wave_task_dispatched",
      wavePlanId,
      taskCode,
      sessionId
    });
  }
  /**
   * Handle task completion event.
   * Updates task status, stores completion summary, and checks if wave is complete.
   */
  async handleTaskComplete(wavePlanId, taskCode, completionSummary) {
    const task = await this.db.query.waveTasks.findFirst({
      where: and(
        eq3(waveTasks.wavePlanId, wavePlanId),
        eq3(waveTasks.taskCode, taskCode)
      )
    });
    if (!task) {
      throw new Error(`Task ${taskCode} not found in wave plan ${wavePlanId}`);
    }
    await this.db.update(waveTasks).set({
      status: "completed",
      completedAt: /* @__PURE__ */ new Date(),
      errorMessage: completionSummary || null
    }).where(
      and(
        eq3(waveTasks.wavePlanId, wavePlanId),
        eq3(waveTasks.taskCode, taskCode)
      )
    );
    await this.emitEvent({
      type: "wave_task_complete",
      wavePlanId,
      taskCode,
      waveIndex: task.waveIndex
    });
    const isWaveComplete = await this.checkWaveCompletion(wavePlanId, task.waveIndex);
    if (isWaveComplete) {
      await this.onWaveComplete(wavePlanId, task.waveIndex);
    }
  }
  /**
   * Handle task failure event.
   * Updates task status based on retry count and emits failure event.
   */
  async handleTaskFailed(wavePlanId, taskCode, error, retryCount) {
    const status = retryCount < 1 ? "retrying" : "failed";
    await this.db.update(waveTasks).set({
      status,
      errorMessage: error,
      retryCount
    }).where(
      and(
        eq3(waveTasks.wavePlanId, wavePlanId),
        eq3(waveTasks.taskCode, taskCode)
      )
    );
    await this.emitEvent({
      type: "wave_task_failed",
      wavePlanId,
      taskCode,
      error
    });
  }
  /**
   * Check if all tasks in a wave are complete.
   * Returns true if all tasks are in a terminal state (completed, failed, or skipped).
   */
  async checkWaveCompletion(wavePlanId, waveIndex) {
    const tasks2 = await this.db.query.waveTasks.findMany({
      where: and(
        eq3(waveTasks.wavePlanId, wavePlanId),
        eq3(waveTasks.waveIndex, waveIndex)
      )
    });
    return tasks2.every(
      (task) => task.status === "completed" || task.status === "failed" || task.status === "skipped"
    );
  }
  /**
   * Emit a wave execution event to the activity_events table.
   */
  async emitEvent(event) {
    let message = "";
    switch (event.type) {
      case "wave_task_dispatched":
        message = `Task ${event.taskCode} dispatched with session ${event.sessionId}`;
        break;
      case "wave_task_complete":
        message = `Task ${event.taskCode} completed in wave ${event.waveIndex}`;
        break;
      case "wave_task_failed":
        message = `Task ${event.taskCode} failed: ${event.error}`;
        break;
      default:
        message = `Wave event: ${event.type}`;
    }
    await this.db.insert(activityEvents).values({
      type: event.type,
      message,
      metadata: event
    });
  }
};

// src/wave-planner/execution/auto-advance.ts
import { eq as eq4, and as and2 } from "drizzle-orm";
async function autoAdvanceWave(wavePlanId, completedWaveIndex, config) {
  const db2 = getDatabase();
  const wavePlan = await db2.query.wavePlans.findFirst({
    where: eq4(wavePlans.id, wavePlanId)
  });
  if (!wavePlan) {
    throw new Error(`Wave plan ${wavePlanId} not found`);
  }
  const isLastWave = completedWaveIndex >= wavePlan.totalWaves - 1;
  if (isLastWave) {
    await markWavePlanComplete(wavePlanId);
    await collectFinalMetrics(wavePlanId);
  } else {
    await sleep(config.waveAdvanceDelayMs);
    const nextWaveIndex = completedWaveIndex + 1;
    await advanceToNextWave(wavePlanId, nextWaveIndex);
  }
}
async function markWavePlanComplete(wavePlanId) {
  const db2 = getDatabase();
  await db2.update(wavePlans).set({
    status: "completed",
    completedAt: /* @__PURE__ */ new Date(),
    updatedAt: /* @__PURE__ */ new Date()
  }).where(eq4(wavePlans.id, wavePlanId));
  await emitEvent({
    type: "wave_plan_complete",
    wavePlanId,
    metrics: {}
  });
}
async function collectFinalMetrics(wavePlanId) {
  const db2 = getDatabase();
  const wavePlan = await db2.query.wavePlans.findFirst({
    where: eq4(wavePlans.id, wavePlanId)
  });
  if (!wavePlan) {
    throw new Error(`Wave plan ${wavePlanId} not found`);
  }
  const tasks2 = await db2.query.waveTasks.findMany({
    where: eq4(waveTasks.wavePlanId, wavePlanId)
  });
  const tasksCompleted = tasks2.filter((t) => t.status === "completed").length;
  const tasksFailed = tasks2.filter((t) => t.status === "failed").length;
  const tasksRetried = tasks2.filter((t) => t.retryCount > 0).length;
  const totalWallClockMs = wavePlan.completedAt && wavePlan.startedAt ? wavePlan.completedAt.getTime() - wavePlan.startedAt.getTime() : null;
  const completedTasks2 = tasks2.filter(
    (t) => t.status === "completed" && t.startedAt && t.completedAt
  );
  let avgTaskDurationMs = null;
  if (completedTasks2.length > 0) {
    const totalDuration = completedTasks2.reduce((sum, task) => {
      if (task.startedAt && task.completedAt) {
        return sum + (task.completedAt.getTime() - task.startedAt.getTime());
      }
      return sum;
    }, 0);
    avgTaskDurationMs = Math.round(totalDuration / completedTasks2.length);
  }
  const theoreticalMinMs = avgTaskDurationMs ? avgTaskDurationMs * wavePlan.criticalPathLength : null;
  let parallelizationEfficiency = null;
  if (theoreticalMinMs && totalWallClockMs) {
    parallelizationEfficiency = theoreticalMinMs / totalWallClockMs;
  }
  const completedWaves = await db2.query.waves.findMany({
    where: and2(
      eq4(waves.wavePlanId, wavePlanId),
      eq4(waves.status, "completed")
    )
  });
  const wavesExecutedCount = completedWaves.length;
  await db2.insert(wavePlanMetrics).values({
    wavePlanId,
    totalWallClockMs,
    theoreticalMinMs,
    parallelizationEfficiency,
    wavesExecuted: wavesExecutedCount,
    tasksCompleted,
    tasksFailed,
    tasksRetried,
    avgTaskDurationMs,
    maxWaveWaitMs: null,
    // TODO: Calculate from wave timings
    fileConflictsAvoided: 0,
    // TODO: Track during execution
    reOptimizationCount: wavePlan.version - 1
  });
}
async function advanceToNextWave(wavePlanId, nextWaveIndex) {
  const db2 = getDatabase();
  await db2.update(wavePlans).set({
    currentWaveIndex: nextWaveIndex,
    updatedAt: /* @__PURE__ */ new Date()
  }).where(eq4(wavePlans.id, wavePlanId));
  await db2.update(waves).set({
    status: "pending"
  }).where(
    and2(
      eq4(waves.wavePlanId, wavePlanId),
      eq4(waves.waveIndex, nextWaveIndex)
    )
  );
  await emitEvent({
    type: "wave_advance",
    wavePlanId,
    fromWave: nextWaveIndex - 1,
    toWave: nextWaveIndex
  });
}
async function emitEvent(event) {
  const db2 = getDatabase();
  let message = "";
  switch (event.type) {
    case "wave_plan_complete":
      message = `Wave plan ${event.wavePlanId} completed`;
      break;
    case "wave_advance":
      message = `Advanced from wave ${event.fromWave} to wave ${event.toWave}`;
      break;
    default:
      message = `Wave event: ${event.type}`;
  }
  await db2.insert(activityEvents).values({
    type: event.type,
    message,
    metadata: event
  });
}

// src/wave-planner/execution/controller.ts
import { eq as eq5, and as and3 } from "drizzle-orm";
var WaveExecutionController = class {
  constructor(config, dispatchCoordinator) {
    this.db = getDatabase();
    this.config = config;
    this.dispatchCoordinator = dispatchCoordinator;
  }
  /**
   * Approve a wave plan and dispatch wave 0
   * Transitions: draft → approved → executing
   */
  async approve(wavePlanId) {
    const wavePlan = await this.db.query.wavePlans.findFirst({
      where: eq5(wavePlans.id, wavePlanId)
    });
    if (!wavePlan) {
      throw new Error(`Wave plan ${wavePlanId} not found`);
    }
    if (wavePlan.status !== "draft") {
      throw new Error(`Cannot approve wave plan in status: ${wavePlan.status}`);
    }
    await this.db.update(wavePlans).set({
      status: "approved",
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq5(wavePlans.id, wavePlanId));
    await this.dispatchWave(wavePlanId, 0);
  }
  /**
   * Pause execution of a wave plan
   * Transitions: executing → paused
   * Does not cancel running tasks, just stops new dispatches
   */
  async pause(wavePlanId) {
    const wavePlan = await this.db.query.wavePlans.findFirst({
      where: eq5(wavePlans.id, wavePlanId)
    });
    if (!wavePlan) {
      throw new Error(`Wave plan ${wavePlanId} not found`);
    }
    if (wavePlan.status !== "executing") {
      throw new Error(`Cannot pause wave plan in status: ${wavePlan.status}`);
    }
    await this.db.update(wavePlans).set({
      status: "paused",
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq5(wavePlans.id, wavePlanId));
  }
  /**
   * Resume execution of a paused wave plan
   * Transitions: paused → executing
   * Dispatches current wave if not complete.
   * @returns the DispatchResult of the re-dispatched current wave, or null if
   *          the current wave was already complete (nothing re-dispatched).
   */
  async resume(wavePlanId) {
    const wavePlan = await this.db.query.wavePlans.findFirst({
      where: eq5(wavePlans.id, wavePlanId),
      with: {
        waves: {
          with: {
            tasks: true
          }
        }
      }
    });
    if (!wavePlan) {
      throw new Error(`Wave plan ${wavePlanId} not found`);
    }
    if (wavePlan.status !== "paused") {
      throw new Error(`Cannot resume wave plan in status: ${wavePlan.status}`);
    }
    await this.db.update(wavePlans).set({
      status: "executing",
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq5(wavePlans.id, wavePlanId));
    const currentWave = wavePlan.waves.find((w) => w.waveIndex === wavePlan.currentWaveIndex);
    if (currentWave && currentWave.status !== "completed") {
      return this.dispatchWave(wavePlanId, wavePlan.currentWaveIndex);
    }
    return null;
  }
  /**
   * Abort a wave plan execution
   * Transitions: any → failed
   * Marks pending tasks as 'skipped'
   */
  async abort(wavePlanId) {
    const wavePlan = await this.db.query.wavePlans.findFirst({
      where: eq5(wavePlans.id, wavePlanId)
    });
    if (!wavePlan) {
      throw new Error(`Wave plan ${wavePlanId} not found`);
    }
    await this.db.update(wavePlans).set({
      status: "failed",
      completedAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq5(wavePlans.id, wavePlanId));
    await this.db.update(waveTasks).set({
      status: "skipped"
    }).where(
      and3(
        eq5(waveTasks.wavePlanId, wavePlanId),
        eq5(waveTasks.status, "pending")
      )
    );
  }
  /**
   * Dispatch a wave
   * Gets wave tasks and uses dispatch coordinator to dispatch batch
   * Updates wave status: pending → dispatching → active
   */
  async dispatchWave(wavePlanId, waveIndex) {
    const wavePlan = await this.db.query.wavePlans.findFirst({
      where: eq5(wavePlans.id, wavePlanId),
      with: {
        waves: {
          with: {
            tasks: true
          }
        }
      }
    });
    if (!wavePlan) {
      throw new Error(`Wave plan ${wavePlanId} not found`);
    }
    const wave = wavePlan.waves.find((w) => w.waveIndex === waveIndex);
    if (!wave) {
      throw new Error(`Wave ${waveIndex} not found in plan ${wavePlanId}`);
    }
    if (wavePlan.status === "approved") {
      await this.db.update(wavePlans).set({
        status: "executing",
        startedAt: /* @__PURE__ */ new Date(),
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq5(wavePlans.id, wavePlanId));
    }
    await this.db.update(waves).set({
      status: "dispatching",
      startedAt: /* @__PURE__ */ new Date()
    }).where(eq5(waves.id, wave.id));
    const result = await this.dispatchCoordinator.dispatchWave(
      wavePlanId,
      waveIndex,
      wave.tasks
    );
    await this.db.update(waves).set({
      status: "active"
    }).where(eq5(waves.id, wave.id));
    return result;
  }
  /**
   * Handle task completion
   * Updates task status, checks if wave is complete, and advances if autoAdvance is enabled
   */
  async onTaskComplete(wavePlanId, taskCode) {
    await this.db.update(waveTasks).set({
      status: "completed",
      completedAt: /* @__PURE__ */ new Date()
    }).where(
      and3(
        eq5(waveTasks.wavePlanId, wavePlanId),
        eq5(waveTasks.taskCode, taskCode)
      )
    );
    const task = await this.db.query.waveTasks.findFirst({
      where: and3(
        eq5(waveTasks.wavePlanId, wavePlanId),
        eq5(waveTasks.taskCode, taskCode)
      )
    });
    if (!task) {
      return;
    }
    const waveIndex = task.waveIndex;
    const isWaveComplete = await this.checkWaveComplete(wavePlanId, waveIndex);
    if (isWaveComplete) {
      await this.db.update(waves).set({
        status: "completed",
        completedAt: /* @__PURE__ */ new Date()
      }).where(
        and3(
          eq5(waves.wavePlanId, wavePlanId),
          eq5(waves.waveIndex, waveIndex)
        )
      );
      const wavePlan = await this.db.query.wavePlans.findFirst({
        where: eq5(wavePlans.id, wavePlanId)
      });
      if (!wavePlan) {
        return;
      }
      const isLastWave = waveIndex === wavePlan.totalWaves - 1;
      if (isLastWave) {
        await this.db.update(wavePlans).set({
          status: "completed",
          completedAt: /* @__PURE__ */ new Date(),
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq5(wavePlans.id, wavePlanId));
      } else if (this.config.autoAdvance) {
        const nextWaveIndex = waveIndex + 1;
        await this.db.update(wavePlans).set({
          currentWaveIndex: nextWaveIndex,
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq5(wavePlans.id, wavePlanId));
        await this.delay(this.config.waveAdvanceDelayMs);
        await this.dispatchWave(wavePlanId, nextWaveIndex);
      }
    }
  }
  /**
   * Handle task failure
   * Implements retry logic or marks as failed based on policy
   */
  async onTaskFailed(wavePlanId, taskCode, error) {
    const task = await this.db.query.waveTasks.findFirst({
      where: and3(
        eq5(waveTasks.wavePlanId, wavePlanId),
        eq5(waveTasks.taskCode, taskCode)
      )
    });
    if (!task) {
      throw new Error(`Task ${taskCode} not found in plan ${wavePlanId}`);
    }
    if (task.retryCount < this.config.retryLimit) {
      await this.db.update(waveTasks).set({
        status: "retrying",
        retryCount: task.retryCount + 1,
        errorMessage: error
      }).where(
        and3(
          eq5(waveTasks.wavePlanId, wavePlanId),
          eq5(waveTasks.taskCode, taskCode)
        )
      );
    } else {
      await this.db.update(waveTasks).set({
        status: "failed",
        completedAt: /* @__PURE__ */ new Date(),
        errorMessage: error
      }).where(
        and3(
          eq5(waveTasks.wavePlanId, wavePlanId),
          eq5(waveTasks.taskCode, taskCode)
        )
      );
      if (this.config.failurePolicy === "halt") {
        await this.db.update(wavePlans).set({
          status: "failed",
          completedAt: /* @__PURE__ */ new Date(),
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq5(wavePlans.id, wavePlanId));
        await this.db.update(waves).set({
          status: "failed",
          completedAt: /* @__PURE__ */ new Date()
        }).where(
          and3(
            eq5(waves.wavePlanId, wavePlanId),
            eq5(waves.waveIndex, task.waveIndex)
          )
        );
        await this.db.update(waveTasks).set({
          status: "skipped"
        }).where(
          and3(
            eq5(waveTasks.wavePlanId, wavePlanId),
            eq5(waveTasks.status, "pending")
          )
        );
      }
    }
  }
  /**
   * Check if all tasks in a wave are complete
   */
  async checkWaveComplete(wavePlanId, waveIndex) {
    const tasks2 = await this.db.query.waveTasks.findMany({
      where: and3(
        eq5(waveTasks.wavePlanId, wavePlanId),
        eq5(waveTasks.waveIndex, waveIndex)
      )
    });
    return tasks2.every(
      (task) => task.status === "completed" || task.status === "skipped" || task.status === "failed"
    );
  }
  /**
   * Delay helper for wave advancement
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
};

// src/wave-planner/execution/dispatch-coordinator.ts
import { eq as eq6, and as and4 } from "drizzle-orm";
var WaveDispatchCoordinator = class {
  constructor(config) {
    this.db = getDatabase();
    this.config = config;
  }
  /**
   * Dispatch a wave of tasks
   * Checks fleet capacity, builds dispatch requests, and dispatches in batches with staggering
   */
  async dispatchWave(wavePlanId, waveIndex, tasks2) {
    const result = {
      dispatched: 0,
      queued: 0,
      errors: []
    };
    const pendingTasks = tasks2.filter((t) => t.status === "pending");
    if (pendingTasks.length === 0) {
      return result;
    }
    const capacity = await this.checkFleetCapacity();
    if (!capacity.canDispatch) {
      result.queued = pendingTasks.length;
      return result;
    }
    const maxDispatch = Math.min(
      pendingTasks.length,
      capacity.availableWorkers,
      this.config.maxConcurrentSubagents
    );
    for (let i = 0; i < maxDispatch; i++) {
      const task = pendingTasks[i];
      try {
        const predecessorContext = await this.getPredecessorContext(wavePlanId, task.taskCode);
        const dispatchRequest = this.buildDispatchRequest(task, predecessorContext);
        await this.dispatchToOrchestrator(dispatchRequest);
        await this.db.update(waveTasks).set({
          status: "dispatched",
          startedAt: /* @__PURE__ */ new Date()
        }).where(eq6(waveTasks.id, task.id));
        result.dispatched++;
        if (i < maxDispatch - 1) {
          await this.delay(this.config.subagentDispatchDelayMs);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        result.errors.push({
          taskCode: task.taskCode,
          error: errorMessage
        });
        await this.db.update(waveTasks).set({
          status: "failed",
          errorMessage,
          completedAt: /* @__PURE__ */ new Date()
        }).where(eq6(waveTasks.id, task.id));
      }
    }
    result.queued = pendingTasks.length - maxDispatch;
    return result;
  }
  /**
   * Build a dispatch request for a task
   * Includes task details, file scope, model, predecessor context, and constraints
   */
  buildDispatchRequest(task, predecessorContext) {
    return {
      wavePlanId: task.wavePlanId,
      waveIndex: task.waveIndex,
      taskCode: task.taskCode,
      taskDescription: task.description,
      fileScope: task.filePaths || [],
      model: this.mapModelToDispatchModel(task.recommendedModel),
      predecessorContext,
      constraints: []
      // TODO: Add constraints from wave plan or task
    };
  }
  /**
   * Get predecessor context for a task
   * Fetches completion summaries for task's dependencies
   */
  async getPredecessorContext(wavePlanId, taskCode) {
    const task = await this.db.query.waveTasks.findFirst({
      where: and4(
        eq6(waveTasks.wavePlanId, wavePlanId),
        eq6(waveTasks.taskCode, taskCode)
      )
    });
    if (!task || !task.dependencies || task.dependencies.length === 0) {
      return [];
    }
    const predecessorSummaries = [];
    for (const depTaskCode of task.dependencies) {
      const depTask = await this.db.query.waveTasks.findFirst({
        where: and4(
          eq6(waveTasks.wavePlanId, wavePlanId),
          eq6(waveTasks.taskCode, depTaskCode),
          eq6(waveTasks.status, "completed")
        )
      });
      if (depTask) {
        predecessorSummaries.push({
          taskCode: depTask.taskCode,
          description: depTask.description,
          filesModified: depTask.filePaths || [],
          completionSummary: ""
          // TODO: Fetch from task completion data when available
        });
      }
    }
    return predecessorSummaries;
  }
  /**
   * Check fleet capacity
   * Returns available workers and whether new tasks can be dispatched
   */
  async checkFleetCapacity() {
    const runningTasks = await this.db.query.waveTasks.findMany({
      where: eq6(waveTasks.status, "running")
    });
    const activeWorkers = runningTasks.length;
    const totalWorkers = this.config.maxTotalActiveTasks;
    const availableWorkers = Math.max(0, totalWorkers - activeWorkers);
    const canDispatch = availableWorkers > 0;
    return {
      totalWorkers,
      activeWorkers,
      availableWorkers,
      canDispatch
    };
  }
  /**
   * Dispatch to orchestrator
   * Placeholder for integration with external orchestrator
   * TODO: Implement actual dispatch to orchestrator service
   */
  async dispatchToOrchestrator(request) {
    console.log(`[WaveDispatchCoordinator] Would dispatch task ${request.taskCode}`);
  }
  /**
   * Map database model enum to dispatch model format
   */
  mapModelToDispatchModel(model) {
    if (!model) {
      return "sonnet";
    }
    const modelLower = model.toLowerCase();
    if (modelLower === "haiku") return "haiku";
    if (modelLower === "opus") return "opus";
    return "sonnet";
  }
  /**
   * Delay helper for staggering dispatches
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
};

// src/integrations/linear/index.ts
var linear_exports = {};
__export(linear_exports, {
  DevPilotLinearClient: () => DevPilotLinearClient,
  getLinearClient: () => getLinearClient,
  handleLinearWebhook: () => handleLinearWebhook,
  initLinearClient: () => initLinearClient,
  isLinearConfigured: () => isLinearConfigured,
  syncCompletionToLinear: () => syncCompletionToLinear,
  syncProgressToLinear: () => syncProgressToLinear,
  syncSessionToLinear: () => syncSessionToLinear,
  verifyLinearWebhookSignature: () => verifyLinearWebhookSignature
});

// src/integrations/linear/client.ts
import { LinearClient } from "@linear/sdk";
var DevPilotLinearClient = class {
  constructor(config) {
    this.client = new LinearClient({ apiKey: config.apiKey });
    this.teamId = config.teamId;
    this.defaultProjectId = config.defaultProjectId;
  }
  /**
   * Get the underlying Linear client for advanced operations
   */
  getClient() {
    return this.client;
  }
  /**
   * Create a new issue in Linear
   */
  async createIssue(input) {
    const result = await this.client.createIssue({
      teamId: input.teamId || this.teamId,
      title: input.title,
      description: input.description,
      projectId: input.projectId || this.defaultProjectId,
      priority: input.priority,
      parentId: input.parentId
    });
    const issue = await result.issue;
    if (!issue) {
      throw new Error("Failed to create issue");
    }
    const state = await issue.state;
    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description ?? void 0,
      state: {
        id: state?.id ?? "",
        name: state?.name ?? "",
        type: state?.type ?? ""
      },
      priority: issue.priority,
      url: issue.url,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt
    };
  }
  /**
   * Update an existing issue
   */
  async updateIssue(issueId, input) {
    const result = await this.client.updateIssue(issueId, {
      stateId: input.stateId,
      title: input.title,
      description: input.description,
      priority: input.priority
    });
    const issue = await result.issue;
    if (!issue) {
      throw new Error("Failed to update issue");
    }
    const state = await issue.state;
    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description ?? void 0,
      state: {
        id: state?.id ?? "",
        name: state?.name ?? "",
        type: state?.type ?? ""
      },
      priority: issue.priority,
      url: issue.url,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt
    };
  }
  /**
   * Get an issue by ID
   */
  async getIssue(issueId) {
    try {
      const issue = await this.client.issue(issueId);
      if (!issue) return null;
      const state = await issue.state;
      return {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description ?? void 0,
        state: {
          id: state?.id ?? "",
          name: state?.name ?? "",
          type: state?.type ?? ""
        },
        priority: issue.priority,
        url: issue.url,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt
      };
    } catch {
      return null;
    }
  }
  /**
   * Get workflow states for a team
   */
  async getWorkflowStates() {
    const team = await this.client.team(this.teamId);
    const states = await team.states();
    return states.nodes.map((state) => ({
      id: state.id,
      name: state.name,
      type: state.type
    }));
  }
  /**
   * Move issue to a specific state
   */
  async moveIssueToState(issueId, stateName) {
    const states = await this.getWorkflowStates();
    const targetState = states.find(
      (s) => s.name.toLowerCase() === stateName.toLowerCase()
    );
    if (!targetState) {
      throw new Error(`State "${stateName}" not found`);
    }
    return this.updateIssue(issueId, { stateId: targetState.id });
  }
  /**
   * Add a comment to an issue
   */
  async addComment(issueId, body) {
    await this.client.createComment({
      issueId,
      body
    });
  }
  /**
   * Get team info
   */
  async getTeam() {
    const team = await this.client.team(this.teamId);
    return {
      id: team.id,
      name: team.name,
      key: team.key
    };
  }
  /**
   * Get all teams the user has access to
   */
  async getTeams() {
    const teamsResult = await this.client.teams();
    return teamsResult.nodes.map((team) => ({
      id: team.id,
      name: team.name,
      key: team.key
    }));
  }
};
var clientInstance = null;
function initLinearClient(config) {
  clientInstance = new DevPilotLinearClient(config);
  return clientInstance;
}
function getLinearClient() {
  if (!clientInstance) {
    throw new Error("Linear client not initialized. Call initLinearClient first.");
  }
  return clientInstance;
}
function isLinearConfigured() {
  return clientInstance !== null;
}

// src/integrations/linear/webhook-verify.ts
import { createHmac, timingSafeEqual } from "crypto";
function verifyLinearWebhookSignature(payload, signature, secret) {
  if (!payload) {
    return { valid: false, error: "Payload is required" };
  }
  if (!signature) {
    return { valid: false, error: "Signature is required" };
  }
  if (!secret) {
    return { valid: false, error: "Secret is required" };
  }
  const signatureParts = signature.split("=");
  if (signatureParts.length !== 2 || signatureParts[0] !== "sha256") {
    return {
      valid: false,
      error: 'Invalid signature format. Expected "sha256=<hash>"'
    };
  }
  const receivedHash = signatureParts[1];
  const hmac = createHmac("sha256", secret);
  hmac.update(payload);
  const expectedHash = hmac.digest("hex");
  if (receivedHash.length !== expectedHash.length) {
    return {
      valid: false,
      error: "Signature hash length mismatch"
    };
  }
  try {
    const receivedBuffer = Buffer.from(receivedHash, "hex");
    const expectedBuffer = Buffer.from(expectedHash, "hex");
    const isValid = timingSafeEqual(receivedBuffer, expectedBuffer);
    return isValid ? { valid: true } : { valid: false, error: "Signature verification failed" };
  } catch (error) {
    return {
      valid: false,
      error: `Signature comparison error: ${error instanceof Error ? error.message : "Unknown error"}`
    };
  }
}

// src/integrations/linear/sync.ts
async function syncSessionToLinear(input) {
  if (!isLinearConfigured()) {
    return { success: false, error: "Linear not configured" };
  }
  try {
    const client = getLinearClient();
    const team = await client.getTeam();
    const description = buildSessionDescription(input);
    const issue = await client.createIssue({
      teamId: team.id,
      title: input.ticketTitle,
      description,
      priority: 2
      // Medium priority
    });
    return {
      success: true,
      issueId: issue.identifier
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}
async function syncProgressToLinear(input) {
  if (!isLinearConfigured()) {
    return { success: false, error: "Linear not configured" };
  }
  try {
    const client = getLinearClient();
    const progressMessage = buildProgressComment(input);
    await client.addComment(input.linearTicketId, progressMessage);
    if (input.status === "complete") {
      await client.moveIssueToState(input.linearTicketId, "In Review");
    } else if (input.status === "error") {
      await client.moveIssueToState(input.linearTicketId, "Blocked");
    }
    return { success: true, issueId: input.linearTicketId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}
async function syncCompletionToLinear(input) {
  if (!isLinearConfigured()) {
    return { success: false, error: "Linear not configured" };
  }
  try {
    const client = getLinearClient();
    const completionMessage = buildCompletionComment(input);
    await client.addComment(input.linearTicketId, completionMessage);
    const targetState = input.success ? "Done" : "Blocked";
    await client.moveIssueToState(input.linearTicketId, targetState);
    return { success: true, issueId: input.linearTicketId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}
async function handleLinearWebhook(payload, options) {
  if (options?.webhookSecret && options?.signature && options?.rawBody) {
    const isValid = verifyLinearWebhookSignature(
      options.rawBody,
      options.signature,
      options.webhookSecret
    );
    if (!isValid) {
      throw new Error("Invalid webhook signature");
    }
  }
  if (payload.type !== "Issue") {
    return { handled: false };
  }
  switch (payload.action) {
    case "update":
      if (options?.botUserId && payload.data?.assigneeId === options.botUserId) {
        const data = payload.data;
        const dispatch = {
          linearIssueId: data.id,
          linearIdentifier: data.identifier,
          title: data.title,
          description: data.description,
          teamId: data.teamId,
          priority: data.priority,
          labels: data.labelIds
        };
        return {
          handled: true,
          action: "bot_assigned",
          dispatch
        };
      }
      return { handled: true, action: "issue_updated" };
    case "create":
      return { handled: true, action: "issue_created" };
    case "remove":
      return { handled: true, action: "issue_removed" };
    default:
      return { handled: false };
  }
}
function buildSessionDescription(input) {
  const lines = [
    "## DevPilot Session",
    "",
    `**Repository:** ${input.repo}`
  ];
  if (input.workstream) {
    lines.push(`**Workstream:** ${input.workstream}`);
  }
  if (input.estimatedMinutes) {
    lines.push(`**Estimated Time:** ${input.estimatedMinutes} minutes`);
  }
  if (input.planUrl) {
    lines.push(`**Plan:** [View Plan](${input.planUrl})`);
  }
  lines.push("", "---", "*This ticket was created by DevPilot*");
  return lines.join("\n");
}
function buildProgressComment(input) {
  const statusEmoji = {
    running: ":hourglass:",
    waiting: ":pause_button:",
    complete: ":white_check_mark:",
    error: ":x:"
  }[input.status];
  const lines = [
    `${statusEmoji} **Progress Update: ${input.progressPercent}%**`,
    ""
  ];
  if (input.currentWorkstream) {
    lines.push(`Working on: ${input.currentWorkstream}`);
  }
  if (input.message) {
    lines.push("", input.message);
  }
  if (input.filesModified && input.filesModified.length > 0) {
    lines.push("", "**Files modified:**");
    input.filesModified.slice(0, 5).forEach((f) => lines.push(`- \`${f}\``));
    if (input.filesModified.length > 5) {
      lines.push(`- ... and ${input.filesModified.length - 5} more`);
    }
  }
  return lines.join("\n");
}
function buildCompletionComment(input) {
  const emoji = input.success ? ":rocket:" : ":warning:";
  const status = input.success ? "Completed Successfully" : "Failed";
  const lines = [
    `${emoji} **Session ${status}**`,
    ""
  ];
  if (input.prUrl) {
    lines.push(`**Pull Request:** [View PR](${input.prUrl})`);
  }
  if (input.completionMessage) {
    lines.push("", input.completionMessage);
  }
  if (input.filesModified.length > 0) {
    lines.push("", "**Files modified:**");
    input.filesModified.slice(0, 10).forEach((f) => lines.push(`- \`${f}\``));
    if (input.filesModified.length > 10) {
      lines.push(`- ... and ${input.filesModified.length - 10} more`);
    }
  }
  return lines.join("\n");
}

// src/orchestrator/index.ts
var orchestrator_exports = {};
__export(orchestrator_exports, {
  AoCliAdapter: () => AoCliAdapter,
  ClaudeSessionAdapter: () => ClaudeSessionAdapter,
  HttpSessionTransport: () => HttpSessionTransport,
  OrchestratorClient: () => OrchestratorClient,
  OrchestratorService: () => OrchestratorService,
  StatusPoller: () => StatusPoller,
  buildDispatchRequest: () => buildDispatchRequest,
  buildSessionPrompt: () => buildSessionPrompt,
  createAoCliAdapter: () => createAoCliAdapter,
  createClaudeSessionAdapter: () => createClaudeSessionAdapter,
  getOrchestratorClient: () => getOrchestratorClient,
  getOrchestratorService: () => getOrchestratorService,
  getOrchestratorServiceOrNull: () => getOrchestratorServiceOrNull,
  getStatusPoller: () => getStatusPoller,
  getStatusPollerOrNull: () => getStatusPollerOrNull,
  initOrchestratorClient: () => initOrchestratorClient,
  initOrchestratorService: () => initOrchestratorService,
  initStatusPoller: () => initStatusPoller,
  isOrchestratorConfigured: () => isOrchestratorConfigured,
  isOrchestratorServiceInitialized: () => isOrchestratorServiceInitialized,
  isPushCapableAdapter: () => isPushCapableAdapter,
  isStatusPollerInitialized: () => isStatusPollerInitialized
});

// src/orchestrator/adapter.ts
function isPushCapableAdapter(adapter) {
  return typeof adapter.ingestStatus === "function" && typeof adapter.ingestCompletion === "function";
}

// src/orchestrator/client.ts
var OrchestratorClient = class {
  constructor(config) {
    this.config = {
      ...config,
      timeout: config.timeout || 3e4
    };
  }
  /**
   * Check if orchestrator is healthy
   */
  async healthCheck() {
    const response = await this.fetch("/health");
    return response.json();
  }
  /**
   * Dispatch a task to the orchestrator
   */
  async dispatch(request) {
    const response = await this.fetch("/dispatch", {
      method: "POST",
      body: JSON.stringify(request)
    });
    if (!response.ok) {
      const error = await response.text();
      return {
        accepted: false,
        error: `Orchestrator rejected dispatch: ${error}`
      };
    }
    return response.json();
  }
  /**
   * Cancel a running job
   */
  async cancel(sessionId) {
    const response = await this.fetch(`/jobs/${sessionId}/cancel`, {
      method: "POST"
    });
    return response.json();
  }
  /**
   * Get status of a specific job
   */
  async getJobStatus(sessionId) {
    const response = await this.fetch(`/jobs/${sessionId}/status`);
    return response.json();
  }
  /**
   * Get queue information
   */
  async getQueue() {
    const response = await this.fetch("/queue");
    return response.json();
  }
  async fetch(path, options = {}) {
    const url = `${this.config.url}${path}`;
    const headers = {
      "Content-Type": "application/json"
    };
    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...headers,
          ...options.headers
        },
        signal: controller.signal
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }
};
var clientInstance2 = null;
function initOrchestratorClient(config) {
  clientInstance2 = new OrchestratorClient(config);
  return clientInstance2;
}
function getOrchestratorClient() {
  if (!clientInstance2) {
    throw new Error("Orchestrator client not initialized. Call initOrchestratorClient first.");
  }
  return clientInstance2;
}
function isOrchestratorConfigured() {
  return clientInstance2 !== null;
}
function buildDispatchRequest(params) {
  return {
    sessionId: params.sessionId,
    repo: params.repo,
    linearTicketId: params.linearTicketId,
    callbackUrl: params.callbackUrl,
    taskSpec: {
      prompt: `Complete the task: ${params.title}`,
      filePaths: params.filePaths,
      model: params.model || "sonnet",
      workstream: params.workstream,
      acceptanceCriteria: params.acceptanceCriteria,
      estimatedMinutes: params.estimatedMinutes
    }
  };
}

// src/orchestrator/ao-cli-adapter.ts
import { exec as exec2 } from "child_process";
import { promisify as promisify2 } from "util";
var execAsync2 = promisify2(exec2);
function parseSessionId(output) {
  const match = output.match(/Session started:\s*(\S+)/i);
  if (match) return match[1];
  const uuidMatch = output.match(/^([a-f0-9-]{36})$/im);
  if (uuidMatch) return uuidMatch[1];
  const sessionMatch = output.match(/session[:\s]+([a-zA-Z0-9_-]+)/i);
  if (sessionMatch) return sessionMatch[1];
  return null;
}
function parseStatusOutput(output) {
  try {
    const json = JSON.parse(output);
    return {
      status: mapAoStatus(json.status || json.state),
      progressPercent: json.progress ?? json.progressPercent ?? 0,
      currentStep: json.currentStep ?? json.step,
      currentFile: json.currentFile ?? json.file,
      message: json.message,
      filesModified: json.filesModified ?? json.files,
      tokensUsed: json.tokensUsed ?? json.tokens,
      costUsd: json.costUsd ?? json.cost
    };
  } catch {
    const status = {};
    const statusMatch = output.match(/status:\s*(\w+)/i);
    if (statusMatch) {
      status.status = mapAoStatus(statusMatch[1]);
    }
    const progressMatch = output.match(/progress:\s*(\d+)/i);
    if (progressMatch) {
      status.progressPercent = parseInt(progressMatch[1], 10);
    }
    const stepMatch = output.match(/(?:step|task|working on):\s*(.+)/i);
    if (stepMatch) {
      status.currentStep = stepMatch[1].trim();
    }
    const fileMatch = output.match(/(?:file|editing):\s*(.+)/i);
    if (fileMatch) {
      status.currentFile = fileMatch[1].trim();
    }
    const messageMatch = output.match(/message:\s*(.+)/i);
    if (messageMatch) {
      status.message = messageMatch[1].trim();
    }
    return status;
  }
}
function mapAoStatus(aoStatus) {
  const normalized = aoStatus?.toLowerCase() ?? "";
  if (normalized.includes("queue") || normalized.includes("pending")) return "queued";
  if (normalized.includes("run") || normalized.includes("active") || normalized.includes("working")) return "running";
  if (normalized.includes("wait") || normalized.includes("pause")) return "waiting";
  if (normalized.includes("complete") || normalized.includes("done") || normalized.includes("finished")) return "complete";
  if (normalized.includes("error") || normalized.includes("fail")) return "error";
  if (normalized.includes("cancel") || normalized.includes("stop")) return "cancelled";
  return "running";
}
var AoCliAdapter = class {
  constructor(config) {
    this.mode = "ao-cli";
    this.config = config;
    this.aoPath = config.aoPath || "ao";
    this.projectName = config.aoProjectName || "default";
    this.workingDirectory = config.workingDirectory;
  }
  /**
   * Execute an ao command and return stdout
   */
  async execAo(args, options) {
    const cmd = `${this.aoPath} ${args.join(" ")}`;
    const cwd = options?.cwd || this.workingDirectory || process.cwd();
    try {
      const { stdout, stderr } = await execAsync2(cmd, {
        cwd,
        timeout: 6e4,
        // 1 minute timeout for most commands
        env: {
          ...process.env
          // Pass through any ao-specific env vars
        }
      });
      return { stdout: stdout.trim(), stderr: stderr.trim() };
    } catch (error) {
      const execError = error;
      if (execError.stdout || execError.stderr) {
        return {
          stdout: execError.stdout?.trim() || "",
          stderr: execError.stderr?.trim() || execError.message
        };
      }
      throw error;
    }
  }
  /**
   * Check if ao CLI is available and working
   */
  async healthCheck() {
    try {
      const { stdout } = await this.execAo(["--version"]);
      let activeJobs = 0;
      try {
        const { stdout: listOutput } = await this.execAo(["list"]);
        const lines = listOutput.split("\n").filter((l) => l.trim());
        activeJobs = lines.length > 1 ? lines.length - 1 : 0;
      } catch {
      }
      return {
        status: "healthy",
        version: stdout || "unknown",
        activeJobs,
        queueLength: 0,
        // ao-cli doesn't have a queue concept
        availableWorkers: 1
        // Local execution
      };
    } catch (error) {
      return {
        status: "down",
        version: "unknown",
        activeJobs: 0,
        queueLength: 0,
        availableWorkers: 0
      };
    }
  }
  /**
   * Dispatch a task using ao spawn
   * Command: ao spawn <project> <ticket-id> "<prompt>"
   */
  async dispatch(request) {
    try {
      const ticketId = request.linearTicketId || request.sessionId;
      const prompt = request.taskSpec.prompt;
      const args = [
        "spawn",
        this.projectName,
        ticketId,
        `"${prompt.replace(/"/g, '\\"')}"`
      ];
      if (request.taskSpec.model) {
        args.push("--model", request.taskSpec.model);
      }
      if (request.repo) {
        args.push("--repo", request.repo);
      }
      const { stdout, stderr } = await this.execAo(args);
      const externalJobId = parseSessionId(stdout);
      if (!externalJobId && stderr) {
        return {
          accepted: false,
          error: `ao spawn failed: ${stderr}`
        };
      }
      return {
        accepted: true,
        orchestratorJobId: externalJobId || ticketId,
        estimatedStartTime: (/* @__PURE__ */ new Date()).toISOString(),
        queuePosition: 0
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        accepted: false,
        error: `Failed to dispatch via ao CLI: ${errorMessage}`
      };
    }
  }
  /**
   * Get job status using ao status <session>
   */
  async getJobStatus(externalJobId) {
    try {
      const { stdout, stderr } = await this.execAo(["status", externalJobId]);
      if (!stdout && stderr) {
        if (stderr.toLowerCase().includes("not found")) {
          return {
            sessionId: externalJobId,
            externalJobId,
            status: "error",
            progressPercent: 0,
            message: "Session not found"
          };
        }
      }
      const parsed = parseStatusOutput(stdout || stderr);
      return {
        sessionId: externalJobId,
        externalJobId,
        status: parsed.status || "running",
        progressPercent: parsed.progressPercent || 0,
        currentStep: parsed.currentStep,
        currentFile: parsed.currentFile,
        message: parsed.message,
        filesModified: parsed.filesModified,
        tokensUsed: parsed.tokensUsed,
        costUsd: parsed.costUsd,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        sessionId: externalJobId,
        externalJobId,
        status: "error",
        progressPercent: 0,
        message: `Failed to get status: ${errorMessage}`
      };
    }
  }
  /**
   * Cancel a job using ao stop <session>
   */
  async cancel(externalJobId) {
    try {
      const { stdout, stderr } = await this.execAo(["stop", externalJobId]);
      if (stderr && stderr.toLowerCase().includes("error")) {
        return {
          success: false,
          message: stderr
        };
      }
      return {
        success: true,
        message: stdout || `Session ${externalJobId} stopped`
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to cancel: ${errorMessage}`
      };
    }
  }
  /**
   * Send a message to an active session using ao send <session> "<message>"
   */
  async sendMessage(externalJobId, message) {
    try {
      const { stdout, stderr } = await this.execAo([
        "send",
        externalJobId,
        `"${message.replace(/"/g, '\\"')}"`
      ]);
      if (stderr && stderr.toLowerCase().includes("error")) {
        return {
          success: false,
          error: stderr
        };
      }
      return {
        success: true,
        message: stdout || "Message sent"
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to send message: ${errorMessage}`
      };
    }
  }
  /**
   * Get completion report for a finished job
   * Uses ao status with detailed output
   */
  async getCompletionReport(externalJobId) {
    try {
      const { stdout } = await this.execAo(["status", externalJobId, "--json"]);
      try {
        const json = JSON.parse(stdout);
        if (json.status !== "complete" && json.status !== "done" && json.status !== "finished") {
          return null;
        }
        return {
          sessionId: externalJobId,
          success: !json.error,
          prUrl: json.prUrl || json.pr_url,
          commitSha: json.commitSha || json.commit,
          filesModified: json.filesModified || [],
          filesCreated: json.filesCreated || [],
          filesDeleted: json.filesDeleted || [],
          summary: json.summary || json.message || "Task completed",
          tokensUsed: json.tokensUsed || 0,
          costUsd: json.costUsd || 0,
          durationMinutes: json.durationMinutes || 0,
          error: json.error ? {
            code: json.error.code || "UNKNOWN",
            message: json.error.message || String(json.error),
            recoverable: json.error.recoverable || false
          } : void 0
        };
      } catch {
        const status = parseStatusOutput(stdout);
        if (status.status !== "complete") {
          return null;
        }
        return {
          sessionId: externalJobId,
          success: true,
          filesModified: status.filesModified || [],
          filesCreated: [],
          filesDeleted: [],
          summary: status.message || "Task completed",
          tokensUsed: status.tokensUsed || 0,
          costUsd: status.costUsd || 0,
          durationMinutes: 0
        };
      }
    } catch {
      return null;
    }
  }
  /**
   * Cleanup - no persistent resources for CLI adapter
   */
  async shutdown() {
  }
};
function createAoCliAdapter(config) {
  return new AoCliAdapter(config);
}

// src/orchestrator/claude-session-adapter.ts
var HttpSessionTransport = class _HttpSessionTransport {
  constructor(baseUrl, apiKey, timeoutMs = 3e4) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
  }
  /** Extract the runner's session id from a create/idempotent response body. */
  static readExternalId(json) {
    const j = json ?? {};
    return j.externalSessionId ?? j.sessionId ?? j.id;
  }
  async createSession(params) {
    try {
      const res = await this.fetch("/v1/sessions", {
        method: "POST",
        body: JSON.stringify(params)
      });
      if (res.status === 201 || res.status === 200) {
        const json = await res.json().catch(() => ({}));
        return { accepted: true, externalSessionId: _HttpSessionTransport.readExternalId(json) };
      }
      if (res.status === 409) {
        const json = await res.json().catch(() => ({}));
        const existing = _HttpSessionTransport.readExternalId(json);
        if (existing) {
          return { accepted: true, externalSessionId: existing };
        }
        return { accepted: false, error: "CONFLICT: session already dispatched without an id in response" };
      }
      if (res.status === 429) {
        return { accepted: false, error: "CAPACITY" };
      }
      return { accepted: false, error: `Session create failed: ${res.status} ${await res.text().catch(() => "")}` };
    } catch (error) {
      return { accepted: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  async sendMessage(externalSessionId, message) {
    try {
      const res = await this.fetch(`/v1/sessions/${externalSessionId}/messages`, {
        method: "POST",
        body: JSON.stringify({ message })
      });
      if (res.status === 410) {
        return { success: false, error: "session already terminal" };
      }
      return res.ok ? { success: true } : { success: false, error: `send failed: ${res.status}` };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  async stopSession(externalSessionId) {
    try {
      const res = await this.fetch(`/v1/sessions/${externalSessionId}/stop`, { method: "POST" });
      if (res.ok || res.status === 410) {
        return { success: true, message: `Session ${externalSessionId} stopped` };
      }
      return { success: false, message: `stop failed: ${res.status}` };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error) };
    }
  }
  async getSession(externalSessionId) {
    try {
      const res = await this.fetch(`/v1/sessions/${externalSessionId}`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }
  async health() {
    try {
      const res = await this.fetch("/v1/health");
      if (!res.ok) return { status: "down", version: "unknown" };
      const json = await res.json();
      return { status: "healthy", version: json.version ?? "unknown" };
    } catch {
      return { status: "down", version: "unknown" };
    }
  }
  async fetch(path, options = {}) {
    const headers = { "Content-Type": "application/json" };
    if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers: { ...headers, ...options.headers },
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
  }
};
var ClaudeSessionAdapter = class {
  constructor(config, transport) {
    this.mode = "claude-session";
    this.pushBased = true;
    this.cache = /* @__PURE__ */ new Map();
    this.config = config;
    if (transport) {
      this.transport = transport;
    } else {
      if (!config.sessionApiUrl) {
        throw new Error(
          "claude-session adapter requires sessionApiUrl (or an injected SessionTransport)"
        );
      }
      this.transport = new HttpSessionTransport(
        config.sessionApiUrl,
        config.sessionApiKey ?? config.apiKey,
        config.timeout
      );
    }
  }
  async healthCheck() {
    const base = {
      status: "healthy",
      version: "claude-session",
      activeJobs: this.cache.size,
      queueLength: 0,
      availableWorkers: 1
    };
    if (this.transport.health) {
      const probe = await this.transport.health();
      return { ...base, status: probe.status, version: probe.version };
    }
    return base;
  }
  async dispatch(request) {
    const result = await this.transport.createSession({
      sessionId: request.sessionId,
      repo: request.repo,
      prompt: request.taskSpec.prompt,
      model: request.taskSpec.model,
      filePaths: request.taskSpec.filePaths,
      acceptanceCriteria: request.taskSpec.acceptanceCriteria,
      constraints: request.taskSpec.constraints,
      linearTicketId: request.linearTicketId,
      callbackUrl: request.callbackUrl,
      callbackToken: this.config.callbackToken,
      environmentId: this.config.sessionEnvironmentId,
      metadata: request.metadata
    });
    if (!result.accepted || !result.externalSessionId) {
      return { accepted: false, error: result.error ?? "Session dispatch rejected" };
    }
    this.cache.set(result.externalSessionId, {
      status: {
        sessionId: request.sessionId,
        externalJobId: result.externalSessionId,
        status: "queued",
        progressPercent: 0,
        message: "Session dispatched, awaiting first update",
        startedAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
    return {
      accepted: true,
      orchestratorJobId: result.externalSessionId,
      estimatedStartTime: (/* @__PURE__ */ new Date()).toISOString(),
      queuePosition: 0
    };
  }
  async getJobStatus(externalJobId) {
    const cached = this.cache.get(externalJobId);
    if (cached) return cached.status;
    if (this.transport.getSession) {
      const pulled = await this.transport.getSession(externalJobId);
      if (pulled) {
        return {
          sessionId: externalJobId,
          externalJobId,
          status: pulled.status ?? "running",
          progressPercent: pulled.progressPercent ?? 0,
          currentStep: pulled.currentStep,
          currentFile: pulled.currentFile,
          message: pulled.message,
          filesModified: pulled.filesModified,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
      }
    }
    return {
      sessionId: externalJobId,
      externalJobId,
      status: "error",
      progressPercent: 0,
      message: "Unknown session (no cached state and no pull fallback)"
    };
  }
  async cancel(externalJobId) {
    const result = await this.transport.stopSession(externalJobId);
    if (result.success) this.cache.delete(externalJobId);
    return result;
  }
  async sendMessage(externalJobId, message) {
    const result = await this.transport.sendMessage(externalJobId, message);
    return result.success ? { success: true, message: "Message delivered to session" } : { success: false, error: result.error };
  }
  async getCompletionReport(externalJobId) {
    return this.cache.get(externalJobId)?.completion ?? null;
  }
  async shutdown() {
    this.cache.clear();
  }
  // --- IPushCapableAdapter -------------------------------------------------
  /**
   * Feed a pushed status update (from the session's POST to
   * `/api/orchestrator/status`) into the adapter's cache.
   */
  ingestStatus(externalJobId, update) {
    const prev = this.cache.get(externalJobId);
    this.cache.set(externalJobId, {
      completion: prev?.completion,
      status: {
        sessionId: update.sessionId,
        externalJobId,
        status: update.status,
        progressPercent: update.progressPercent,
        currentStep: update.currentStep,
        currentFile: update.currentFile,
        message: update.message,
        filesModified: update.filesModified,
        tokensUsed: update.tokensUsed,
        updatedAt: update.timestamp
      }
    });
  }
  /**
   * Feed a pushed completion report (from the session's POST to
   * `/api/orchestrator/complete`) into the adapter's cache.
   */
  ingestCompletion(externalJobId, report) {
    const prev = this.cache.get(externalJobId);
    this.cache.set(externalJobId, {
      completion: report,
      status: {
        sessionId: report.sessionId,
        externalJobId,
        status: report.success ? "complete" : "error",
        progressPercent: report.success ? 100 : prev?.status.progressPercent ?? 0,
        message: report.summary,
        filesModified: report.filesModified,
        tokensUsed: report.tokensUsed,
        costUsd: report.costUsd,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
  }
};
function createClaudeSessionAdapter(config, transport) {
  return new ClaudeSessionAdapter(config, transport);
}

// src/orchestrator/session-prompt.ts
function buildSessionPrompt(input) {
  const {
    taskDescription,
    repo,
    fileScope,
    predecessorContext,
    acceptanceCriteria,
    constraints,
    callbackUrl,
    sessionId
  } = input;
  const sections = [];
  sections.push(`# Task

${taskDescription}

**Repository:** \`${repo}\``);
  if (fileScope.length > 0) {
    sections.push(
      `# File Scope

You hold an **exclusive lock** on the following files for the duration of this task. Do not modify files outside this set \u2014 other agents are working in parallel and edits outside your scope will conflict:

` + fileScope.map((f) => `- \`${f}\``).join("\n")
    );
  }
  if (predecessorContext.length > 0) {
    const blocks = predecessorContext.map((p) => {
      const files = p.filesModified.length > 0 ? p.filesModified.map((f) => `\`${f}\``).join(", ") : "(none recorded)";
      const summary = p.completionSummary?.trim() || "(no summary provided)";
      return `## ${p.taskCode} \u2014 ${p.description}

- Files modified: ${files}
- Summary: ${summary}`;
    }).join("\n\n");
    sections.push(
      `# Context From Predecessors

These upstream tasks completed before yours; build on their work:

${blocks}`
    );
  }
  if (acceptanceCriteria && acceptanceCriteria.length > 0) {
    sections.push(
      `# Acceptance Criteria

` + acceptanceCriteria.map((c) => `- ${c}`).join("\n")
    );
  }
  if (constraints && constraints.length > 0) {
    sections.push(
      `# Constraints

` + constraints.map((c) => `- ${c}`).join("\n")
    );
  }
  const statusUrl = `${callbackUrl}/status`;
  const completeUrl = `${callbackUrl}/complete`;
  sections.push(
    `# Reporting Protocol

You MUST report progress back to DevPilot so it can track this task. Your DevPilot session id is \`${sessionId}\` \u2014 use it as \`sessionId\` in every callback body.

**On each meaningful milestone** (and at least every 2 minutes while working), POST a status update:

\`\`\`bash
curl -sS -X POST '${statusUrl}' \\
  -H 'Content-Type: application/json' \\
  -H 'X-DevPilot-Callback-Token: <callback-token>' \\
  -d '{
    "sessionId": "${sessionId}",
    "status": "running",
    "progressPercent": 40,
    "currentStep": "implementing X",
    "message": "\u2026",
    "filesModified": ["src/lib/foo.ts"],
    "timestamp": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"
  }'
\`\`\`

**Exactly once, when the task is done** (success or failure), POST the final completion report:

\`\`\`bash
curl -sS -X POST '${completeUrl}' \\
  -H 'Content-Type: application/json' \\
  -H 'X-DevPilot-Callback-Token: <callback-token>' \\
  -d '{
    "sessionId": "${sessionId}",
    "success": true,
    "filesModified": ["src/lib/foo.ts"],
    "filesCreated": [],
    "filesDeleted": [],
    "summary": "One-paragraph summary of what you did.",
    "tokensUsed": 0,
    "costUsd": 0,
    "durationMinutes": 0,
    "timestamp": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"
  }'
\`\`\`

Replace \`<callback-token>\` with the token provided by your runner. Send the completion callback even if the task failed \u2014 set \`"success": false\` and include an \`"error"\` field describing what went wrong.`
  );
  return sections.join("\n\n");
}

// src/orchestrator/service.ts
var HttpAdapter = class {
  constructor(config) {
    this.mode = "http";
    if (!config.url) {
      throw new Error("HTTP adapter requires url configuration");
    }
    this.client = new OrchestratorClient({
      url: config.url,
      apiKey: config.apiKey,
      callbackUrl: config.callbackUrl || "",
      timeout: config.timeout
    });
  }
  async healthCheck() {
    return this.client.healthCheck();
  }
  async dispatch(request) {
    return this.client.dispatch(request);
  }
  async getJobStatus(externalJobId) {
    const status = await this.client.getJobStatus(externalJobId);
    return {
      sessionId: externalJobId,
      externalJobId,
      status: status.status,
      progressPercent: status.progressPercent,
      message: status.message
    };
  }
  async cancel(externalJobId) {
    return this.client.cancel(externalJobId);
  }
  async sendMessage(_externalJobId, _message) {
    return {
      success: false,
      error: "HTTP adapter does not support direct messaging"
    };
  }
  async shutdown() {
  }
};
var DisabledAdapter = class {
  constructor() {
    this.mode = "disabled";
  }
  async healthCheck() {
    return {
      status: "down",
      version: "disabled",
      activeJobs: 0,
      queueLength: 0,
      availableWorkers: 0
    };
  }
  async dispatch(_request) {
    return {
      accepted: false,
      error: "Orchestrator is disabled"
    };
  }
  async getJobStatus(externalJobId) {
    return {
      sessionId: externalJobId,
      externalJobId,
      status: "error",
      progressPercent: 0,
      message: "Orchestrator is disabled"
    };
  }
  async cancel(_externalJobId) {
    return {
      success: false,
      message: "Orchestrator is disabled"
    };
  }
  async shutdown() {
  }
};
var OrchestratorService = class {
  constructor(config, sessionTransport) {
    this.sessionMappings = /* @__PURE__ */ new Map();
    this.eventCallbacks = /* @__PURE__ */ new Set();
    this.config = config;
    this.sessionTransport = sessionTransport;
    this.adapter = this.createAdapter(config);
  }
  /**
   * Create the appropriate adapter based on mode
   */
  createAdapter(config) {
    switch (config.mode) {
      case "claude-session":
        return new ClaudeSessionAdapter(config, this.sessionTransport);
      case "http":
        return new HttpAdapter(config);
      case "ao-cli":
        return new AoCliAdapter(config);
      case "disabled":
      default:
        return new DisabledAdapter();
    }
  }
  /**
   * Whether the active adapter receives progress via pushed callbacks. When
   * true, the StatusPoller should not track its sessions.
   */
  get isPushBased() {
    return this.adapter.pushBased ?? false;
  }
  /**
   * Get current orchestrator mode
   */
  get mode() {
    return this.adapter.mode;
  }
  /**
   * Check if orchestrator is available
   */
  get isEnabled() {
    return this.adapter.mode !== "disabled";
  }
  /**
   * Subscribe to orchestrator events
   */
  onEvent(callback) {
    this.eventCallbacks.add(callback);
    return () => this.eventCallbacks.delete(callback);
  }
  /**
   * Emit an event to all subscribers
   */
  emitEvent(event) {
    for (const callback of this.eventCallbacks) {
      try {
        callback(event);
      } catch (error) {
        console.error("Error in orchestrator event callback:", error);
      }
    }
  }
  /**
   * Check orchestrator health
   */
  async healthCheck() {
    return this.adapter.healthCheck();
  }
  /**
   * Dispatch a task to the orchestrator
   * Stores session mapping for later status queries
   */
  async dispatch(request) {
    const response = await this.adapter.dispatch(request);
    if (response.accepted && response.orchestratorJobId) {
      this.sessionMappings.set(request.sessionId, {
        sessionId: request.sessionId,
        externalJobId: response.orchestratorJobId,
        mode: this.adapter.mode,
        startedAt: /* @__PURE__ */ new Date()
      });
      this.emitEvent({
        type: "job:started",
        sessionId: request.sessionId,
        externalJobId: response.orchestratorJobId,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        data: {
          sessionId: request.sessionId,
          status: "running",
          progressPercent: 0,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }
      });
    }
    return {
      ...response,
      mode: this.adapter.mode
    };
  }
  /**
   * Get job status by DevPilot session ID
   */
  async getJobStatusBySessionId(sessionId) {
    const mapping = this.sessionMappings.get(sessionId);
    if (!mapping) {
      return null;
    }
    const status = await this.adapter.getJobStatus(mapping.externalJobId);
    mapping.lastStatusAt = /* @__PURE__ */ new Date();
    this.emitEvent({
      type: "job:progress",
      sessionId,
      externalJobId: mapping.externalJobId,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      data: {
        sessionId,
        status: status.status,
        progressPercent: status.progressPercent,
        currentStep: status.currentStep,
        currentFile: status.currentFile,
        message: status.message,
        filesModified: status.filesModified,
        tokensUsed: status.tokensUsed,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
    return status;
  }
  /**
   * Get job status by external job ID
   */
  async getJobStatus(externalJobId) {
    return this.adapter.getJobStatus(externalJobId);
  }
  /**
   * Cancel a job by DevPilot session ID
   */
  async cancelBySessionId(sessionId) {
    const mapping = this.sessionMappings.get(sessionId);
    if (!mapping) {
      return {
        success: false,
        message: `No active job found for session ${sessionId}`
      };
    }
    const result = await this.adapter.cancel(mapping.externalJobId);
    if (result.success) {
      this.emitEvent({
        type: "job:cancelled",
        sessionId,
        externalJobId: mapping.externalJobId,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        data: { error: "Cancelled by user" }
      });
      this.sessionMappings.delete(sessionId);
    }
    return result;
  }
  /**
   * Cancel a job by external job ID
   */
  async cancel(externalJobId) {
    return this.adapter.cancel(externalJobId);
  }
  /**
   * Send a message to an active session
   */
  async sendMessage(sessionId, message) {
    const mapping = this.sessionMappings.get(sessionId);
    if (!mapping) {
      return {
        success: false,
        error: `No active job found for session ${sessionId}`
      };
    }
    if (!this.adapter.sendMessage) {
      return {
        success: false,
        error: `Current adapter (${this.adapter.mode}) does not support messaging`
      };
    }
    return this.adapter.sendMessage(mapping.externalJobId, message);
  }
  /**
   * Get completion report for a finished job
   */
  async getCompletionReport(sessionId) {
    const mapping = this.sessionMappings.get(sessionId);
    if (!mapping) {
      return null;
    }
    if (!this.adapter.getCompletionReport) {
      return null;
    }
    return this.adapter.getCompletionReport(mapping.externalJobId);
  }
  /**
   * Ingest a pushed status update from a session callback
   * (`/api/orchestrator/status`). For push-based adapters this replaces the
   * poll loop: the payload is cached on the adapter and re-emitted as a
   * `job:progress` event to SSE subscribers. No-op mapping if the session is
   * unknown. Safe to call for non-push adapters (falls through to event only).
   */
  ingestStatusUpdate(update) {
    const mapping = this.sessionMappings.get(update.sessionId);
    if (mapping && isPushCapableAdapter(this.adapter)) {
      this.adapter.ingestStatus(mapping.externalJobId, update);
      mapping.lastStatusAt = /* @__PURE__ */ new Date();
    }
    this.emitEvent({
      type: "job:progress",
      sessionId: update.sessionId,
      externalJobId: mapping?.externalJobId ?? update.sessionId,
      timestamp: update.timestamp,
      data: update
    });
  }
  /**
   * Ingest a pushed completion report from a session callback
   * (`/api/orchestrator/complete`). Caches it on the adapter (so
   * getCompletionReport can serve it) and finalizes the session.
   */
  ingestCompletionReport(report) {
    const mapping = this.sessionMappings.get(report.sessionId);
    if (mapping && isPushCapableAdapter(this.adapter)) {
      this.adapter.ingestCompletion(mapping.externalJobId, report);
    }
    this.markSessionComplete(report.sessionId, report);
  }
  /**
   * Mark a session as complete (for external completion notifications)
   */
  markSessionComplete(sessionId, report) {
    const mapping = this.sessionMappings.get(sessionId);
    if (!mapping) return;
    this.emitEvent({
      type: report.success ? "job:complete" : "job:error",
      sessionId,
      externalJobId: mapping.externalJobId,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      data: report
    });
    this.sessionMappings.delete(sessionId);
  }
  /**
   * Get all active session mappings
   */
  getActiveSessions() {
    return Array.from(this.sessionMappings.values());
  }
  /**
   * Get external job ID for a session
   */
  getExternalJobId(sessionId) {
    return this.sessionMappings.get(sessionId)?.externalJobId;
  }
  /**
   * Shutdown the orchestrator service
   */
  async shutdown() {
    if (this.adapter.shutdown) {
      await this.adapter.shutdown();
    }
    this.sessionMappings.clear();
    this.eventCallbacks.clear();
  }
};
var serviceInstance = null;
function initOrchestratorService(config, sessionTransport) {
  if (serviceInstance) {
    serviceInstance.shutdown();
  }
  serviceInstance = new OrchestratorService(config, sessionTransport);
  return serviceInstance;
}
function getOrchestratorService() {
  if (!serviceInstance) {
    throw new Error("Orchestrator service not initialized. Call initOrchestratorService first.");
  }
  return serviceInstance;
}
function isOrchestratorServiceInitialized() {
  return serviceInstance !== null;
}
function getOrchestratorServiceOrNull() {
  return serviceInstance;
}

// src/orchestrator/status-poller.ts
var DEFAULT_CONFIG = {
  pollIntervalMs: 5e3,
  // 5 seconds
  maxRetries: 3
};
var StatusPoller = class {
  constructor(orchestrator, config = {}) {
    this.trackedSessions = /* @__PURE__ */ new Map();
    this.pollInterval = null;
    this.isRunning = false;
    this.orchestrator = orchestrator;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.unsubscribe = orchestrator.onEvent(this.handleOrchestratorEvent.bind(this));
  }
  /**
   * Handle events from orchestrator service
   */
  handleOrchestratorEvent(event) {
    switch (event.type) {
      case "job:started":
        if (this.orchestrator.isPushBased) break;
        this.trackSession(event.sessionId, event.externalJobId);
        break;
      case "job:complete":
      case "job:error":
      case "job:cancelled":
        this.untrackSession(event.sessionId);
        break;
    }
  }
  /**
   * Start tracking a session for polling
   */
  trackSession(sessionId, externalJobId) {
    if (this.trackedSessions.has(sessionId)) return;
    this.trackedSessions.set(sessionId, {
      sessionId,
      externalJobId,
      retryCount: 0,
      startedAt: /* @__PURE__ */ new Date()
    });
    if (!this.isRunning && this.trackedSessions.size > 0) {
      this.start();
    }
  }
  /**
   * Stop tracking a session
   */
  untrackSession(sessionId) {
    this.trackedSessions.delete(sessionId);
    if (this.trackedSessions.size === 0) {
      this.stop();
    }
  }
  /**
   * Start the polling loop
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.pollInterval = setInterval(
      () => this.poll(),
      this.config.pollIntervalMs
    );
    this.poll();
  }
  /**
   * Stop the polling loop
   */
  stop() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.isRunning = false;
  }
  /**
   * Poll all tracked sessions for status
   */
  async poll() {
    const sessions = Array.from(this.trackedSessions.values());
    if (sessions.length === 0) return;
    await Promise.all(
      sessions.map((session) => this.pollSession(session))
    );
  }
  /**
   * Poll a single session for status
   */
  async pollSession(session) {
    try {
      const status = await this.orchestrator.getJobStatus(session.externalJobId);
      session.lastPollAt = /* @__PURE__ */ new Date();
      session.retryCount = 0;
      const statusChanged = !session.lastStatus || session.lastStatus.status !== status.status || session.lastStatus.progressPercent !== status.progressPercent || session.lastStatus.currentStep !== status.currentStep;
      if (statusChanged) {
        session.lastStatus = status;
        if (this.config.onStatusUpdate) {
          await this.config.onStatusUpdate(session.sessionId, status);
        }
      }
      if (status.status === "complete" || status.status === "error" || status.status === "cancelled") {
        await this.handleCompletion(session, status);
      }
    } catch (error) {
      session.retryCount++;
      if (session.retryCount >= this.config.maxRetries) {
        if (this.config.onError) {
          await this.config.onError(
            session.sessionId,
            error instanceof Error ? error : new Error(String(error))
          );
        }
        this.untrackSession(session.sessionId);
      }
    }
  }
  /**
   * Handle session completion
   */
  async handleCompletion(session, status) {
    const report = await this.orchestrator.getCompletionReport(session.sessionId);
    if (report && this.config.onComplete) {
      await this.config.onComplete(session.sessionId, report);
    } else if (status.status === "error" && this.config.onError) {
      await this.config.onError(
        session.sessionId,
        new Error(status.message || "Job failed")
      );
    }
    if (report) {
      this.orchestrator.markSessionComplete(session.sessionId, report);
    }
    this.untrackSession(session.sessionId);
  }
  /**
   * Get all currently tracked sessions
   */
  getTrackedSessions() {
    return Array.from(this.trackedSessions.values());
  }
  /**
   * Get polling statistics
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      trackedCount: this.trackedSessions.size,
      pollIntervalMs: this.config.pollIntervalMs
    };
  }
  /**
   * Shutdown the poller
   */
  shutdown() {
    this.stop();
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    this.trackedSessions.clear();
  }
};
var pollerInstance = null;
function initStatusPoller(orchestrator, config) {
  if (pollerInstance) {
    pollerInstance.shutdown();
  }
  pollerInstance = new StatusPoller(orchestrator, config);
  return pollerInstance;
}
function getStatusPoller() {
  if (!pollerInstance) {
    throw new Error("Status poller not initialized. Call initStatusPoller first.");
  }
  return pollerInstance;
}
function isStatusPollerInitialized() {
  return pollerInstance !== null;
}
function getStatusPollerOrNull() {
  return pollerInstance;
}

// src/wiki/index.ts
var wiki_exports = {};
__export(wiki_exports, {
  WIKI_COMPILER_SYSTEM: () => WIKI_COMPILER_SYSTEM,
  WikiCompiler: () => WikiCompiler,
  WikiSessionHook: () => WikiSessionHook,
  buildIngestPrompt: () => buildIngestPrompt,
  buildLintPrompt: () => buildLintPrompt,
  buildQueryPrompt: () => buildQueryPrompt,
  buildSessionExtractPrompt: () => buildSessionExtractPrompt,
  buildUpdatePrompt: () => buildUpdatePrompt,
  createWikiCompiler: () => createWikiCompiler
});

// src/wiki/prompts.ts
var WIKI_COMPILER_SYSTEM = `You are a disciplined wiki compiler for a software project's knowledge base.
Your job is to transform raw source materials (session logs, commits, specs, decisions)
into well-structured, cross-referenced wiki articles.

## Principles
- Write in encyclopedia style: factual, concise, third-person
- Every article must have a clear title, category, and backlinks to related articles
- Use [[Article Slug]] notation for internal backlinks
- Prefer updating existing articles over creating new ones
- Extract architectural decisions, patterns, and "what we tried and why it broke" insights
- Never invent information \u2014 only compile what's in the sources
- Track provenance: cite which sources informed each article

## Article Categories
- architecture: System design, component relationships, data flow
- patterns: Recurring code patterns, conventions, idioms
- decisions: Why X was chosen over Y, tradeoffs made
- components: Individual modules, services, packages
- workflows: How things are done (build, deploy, test)
- troubleshooting: Known issues, gotchas, "what broke and why"

## Output Format
Return a JSON array of compiled articles:
\`\`\`json
[
  {
    "slug": "url-safe-slug",
    "title": "Human Readable Title",
    "category": "architecture|patterns|decisions|components|workflows|troubleshooting",
    "content": "Markdown content with [[backlinks]]...",
    "backlinks": ["related-slug-1", "related-slug-2"]
  }
]
\`\`\``;
function buildIngestPrompt(sourceContent, sourceType, sourceTitle, existingIndex) {
  return `## Task: Ingest Source Material

Compile the following source material into wiki articles. Review the existing wiki index
to decide whether to create new articles or update existing ones.

### Existing Wiki Index
${existingIndex || "(empty wiki \u2014 create foundational articles)"}

### Source Material
**Type:** ${sourceType}
**Title:** ${sourceTitle}

\`\`\`
${sourceContent}
\`\`\`

### Instructions
1. Extract key concepts, decisions, patterns, and architectural details
2. For each concept, either create a new article or note which existing article should be updated
3. Add backlinks between related articles
4. Focus on durable knowledge \u2014 skip transient details like typos fixed or formatting changes
5. For session logs: extract "what was built", "what decisions were made", "what didn't work and why"
6. For commits: extract "what changed", "why it changed", architectural impact
7. For specs: extract requirements, constraints, design rationale

Return your compiled articles as a JSON array.`;
}
function buildUpdatePrompt(existingArticle, newSourceContent, sourceType) {
  return `## Task: Update Wiki Article

Merge new information from a source into an existing wiki article.
Preserve existing content while integrating new insights.

### Existing Article
\`\`\`markdown
${existingArticle}
\`\`\`

### New Source Material
**Type:** ${sourceType}

\`\`\`
${newSourceContent}
\`\`\`

### Instructions
1. Integrate new information into the existing article
2. Resolve any contradictions (prefer newer information, note the change)
3. Add new backlinks if relationships are discovered
4. Keep the article concise \u2014 don't just append, synthesize
5. Maintain the same slug, title, and category unless a rename is clearly needed

Return the updated article as a single JSON object with the same schema.`;
}
function buildQueryPrompt(question, relevantArticles) {
  return `## Task: Answer Question from Wiki

Answer the following question using the wiki articles provided.
Cite specific articles using [[slug]] notation.

### Question
${question}

### Relevant Wiki Articles
${relevantArticles}

### Instructions
1. Synthesize an answer from the wiki articles
2. Cite sources with [[article-slug]] backlinks
3. If the wiki doesn't contain enough information, say so clearly
4. If the answer reveals a gap in the wiki, note what article should be created

Return your response as JSON:
\`\`\`json
{
  "answer": "Your synthesized answer with [[backlinks]]...",
  "citedArticles": ["slug-1", "slug-2"],
  "suggestedNewArticle": null or { "slug": "...", "title": "...", "category": "..." }
}
\`\`\``;
}
function buildLintPrompt(wikiIndex, articleContents) {
  return `## Task: Lint Wiki for Quality Issues

Review the wiki for quality issues: stale content, contradictions, orphaned pages,
broken links, and knowledge gaps.

### Wiki Index
${wikiIndex}

### Article Contents
${articleContents}

### Instructions
Check for:
1. **Stale content**: Articles that reference outdated patterns or deprecated approaches
2. **Orphaned pages**: Articles with no backlinks from other articles
3. **Contradictions**: Articles that disagree with each other
4. **Gaps**: Topics referenced in backlinks that don't have articles yet
5. **Broken links**: [[backlinks]] that point to non-existent articles

Return findings as JSON:
\`\`\`json
{
  "findings": [
    {
      "type": "stale|orphaned|contradiction|gap|broken_link",
      "articleSlug": "affected-article",
      "description": "What's wrong",
      "suggestion": "How to fix it"
    }
  ]
}
\`\`\``;
}
function buildSessionExtractPrompt(sessionLog, existingIndex) {
  return `## Task: Extract Knowledge from Claude Session Log

Analyze this Claude Code session log and extract durable knowledge that should
be compiled into the project wiki.

### Existing Wiki Index
${existingIndex || "(empty wiki)"}

### Session Log
\`\`\`
${sessionLog}
\`\`\`

### What to Extract
- Architectural decisions made during the session
- Patterns established or discovered
- "We tried X and it broke because Y" \u2014 troubleshooting knowledge
- New components or modules created and their purpose
- Workflows established (how to build, test, deploy)
- Integration points and data flow discovered

### What to Skip
- Routine code formatting or typo fixes
- Transient debugging steps that led nowhere
- Generic coding knowledge (things any developer knows)

If the session contains no wiki-worthy knowledge, return an empty array.

Return compiled articles as a JSON array with the standard schema.`;
}

// src/wiki/compiler.ts
import Anthropic2 from "@anthropic-ai/sdk";
import { createHash } from "crypto";
import { eq as eq7, desc } from "drizzle-orm";
var WikiCompiler = class {
  constructor(config) {
    this.config = config;
    this.client = new Anthropic2({
      apiKey: config.apiKey
    });
  }
  // --------------------------------------------------------------------------
  // Ingest: Raw sources → wiki articles
  // --------------------------------------------------------------------------
  /**
   * Ingest a raw source and compile it into wiki articles.
   * This is the primary entry point for feeding knowledge into the wiki.
   */
  async ingest(content, sourceType, title, origin) {
    const db2 = getDatabase();
    const contentHash = createHash("sha256").update(content).digest("hex");
    const existing = await db2.select().from(wikiSources).where(eq7(wikiSources.contentHash, contentHash)).limit(1);
    if (existing.length > 0) {
      return {
        sourceId: existing[0].id,
        articlesCreated: [],
        articlesUpdated: [],
        tokensUsed: 0
      };
    }
    const [source] = await db2.insert(wikiSources).values({
      sourceType,
      title,
      content,
      origin,
      repo: this.config.repo,
      contentHash
    }).returning();
    const existingIndex = await this.buildIndexString();
    const result = await this.callLLM(
      buildIngestPrompt(content, sourceType, title, existingIndex)
    );
    const articles = this.parseArticlesFromResponse(result.content);
    const articlesCreated = [];
    const articlesUpdated = [];
    for (const article of articles) {
      const existingArticle = await db2.select().from(wikiArticles).where(eq7(wikiArticles.slug, article.slug)).limit(1);
      if (existingArticle.length > 0) {
        await db2.update(wikiArticles).set({
          content: article.content,
          backlinks: article.backlinks,
          sourceIds: [
            ...existingArticle[0].sourceIds || [],
            source.id
          ],
          version: existingArticle[0].version + 1,
          status: "active",
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq7(wikiArticles.slug, article.slug));
        articlesUpdated.push(article.slug);
      } else {
        await db2.insert(wikiArticles).values({
          slug: article.slug,
          title: article.title,
          category: article.category,
          content: article.content,
          backlinks: article.backlinks,
          sourceIds: [source.id],
          repo: this.config.repo
        });
        articlesCreated.push(article.slug);
      }
    }
    const tokensUsed = result.tokensInput + result.tokensOutput;
    await db2.insert(wikiLog).values({
      action: "ingest",
      summary: `Ingested ${sourceType} "${title}": created ${articlesCreated.length}, updated ${articlesUpdated.length} articles`,
      articleIds: [...articlesCreated, ...articlesUpdated],
      sourceIds: [source.id],
      repo: this.config.repo,
      tokensUsed
    });
    return {
      sourceId: source.id,
      articlesCreated,
      articlesUpdated,
      tokensUsed
    };
  }
  // --------------------------------------------------------------------------
  // Query: Ask questions against the wiki
  // --------------------------------------------------------------------------
  /**
   * Answer a question by synthesizing across wiki articles.
   * Valuable answers can be automatically filed as new articles.
   */
  async query(question) {
    const db2 = getDatabase();
    const allArticles = await db2.select().from(wikiArticles).where(eq7(wikiArticles.status, "active"));
    const keywords = question.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const scored = allArticles.map((article) => {
      const text8 = `${article.title} ${article.content}`.toLowerCase();
      const score = keywords.filter((kw) => text8.includes(kw)).length;
      return { article, score };
    }).filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 10);
    const relevantContent = scored.map(
      (s) => `## [[${s.article.slug}]] \u2014 ${s.article.title}

${s.article.content}`
    ).join("\n\n---\n\n");
    if (scored.length === 0) {
      return {
        answer: "No relevant wiki articles found. The wiki may need more source material ingested on this topic.",
        citedArticles: [],
        tokensUsed: 0
      };
    }
    const result = await this.callLLM(
      buildQueryPrompt(question, relevantContent)
    );
    const parsed = this.parseJsonFromResponse(result.content);
    const tokensUsed = result.tokensInput + result.tokensOutput;
    let newArticleSlug;
    if (parsed.suggestedNewArticle) {
      const newArticle = parsed.suggestedNewArticle;
      const existingArticle = await db2.select().from(wikiArticles).where(eq7(wikiArticles.slug, newArticle.slug)).limit(1);
      if (existingArticle.length === 0) {
        await db2.insert(wikiArticles).values({
          slug: newArticle.slug,
          title: newArticle.title,
          category: newArticle.category,
          content: parsed.answer,
          backlinks: parsed.citedArticles,
          sourceIds: [],
          repo: this.config.repo
        });
        newArticleSlug = newArticle.slug;
      }
    }
    await db2.insert(wikiLog).values({
      action: "query",
      summary: `Query: "${question.slice(0, 100)}" \u2014 cited ${parsed.citedArticles.length} articles`,
      articleIds: parsed.citedArticles,
      repo: this.config.repo,
      tokensUsed
    });
    return {
      answer: parsed.answer,
      citedArticles: parsed.citedArticles,
      tokensUsed,
      newArticleSlug
    };
  }
  // --------------------------------------------------------------------------
  // Lint: Check wiki health
  // --------------------------------------------------------------------------
  /**
   * Run a lint pass over the wiki to find quality issues.
   * Identifies stale content, orphans, contradictions, gaps, and broken links.
   */
  async lint() {
    const db2 = getDatabase();
    const allArticles = await db2.select().from(wikiArticles);
    if (allArticles.length === 0) {
      return { findings: [], articlesMarkedStale: [], tokensUsed: 0 };
    }
    const wikiIndex = allArticles.map(
      (a) => `- [[${a.slug}]] (${a.category}) \u2014 ${a.title} [${a.status}]`
    ).join("\n");
    const articleContents = allArticles.map(
      (a) => `## [[${a.slug}]] \u2014 ${a.title}
Category: ${a.category}

${a.content}`
    ).join("\n\n---\n\n");
    const result = await this.callLLM(
      buildLintPrompt(wikiIndex, articleContents)
    );
    const parsed = this.parseJsonFromResponse(
      result.content
    );
    const tokensUsed = result.tokensInput + result.tokensOutput;
    const articlesMarkedStale = [];
    for (const finding of parsed.findings) {
      if (finding.type === "stale") {
        await db2.update(wikiArticles).set({ status: "stale", updatedAt: /* @__PURE__ */ new Date() }).where(eq7(wikiArticles.slug, finding.articleSlug));
        articlesMarkedStale.push(finding.articleSlug);
      }
    }
    await db2.insert(wikiLog).values({
      action: "lint",
      summary: `Lint: found ${parsed.findings.length} issues, marked ${articlesMarkedStale.length} stale`,
      articleIds: articlesMarkedStale,
      repo: this.config.repo,
      tokensUsed
    });
    return {
      findings: parsed.findings,
      articlesMarkedStale,
      tokensUsed
    };
  }
  // --------------------------------------------------------------------------
  // Session extraction: Auto-compile from Claude session logs
  // --------------------------------------------------------------------------
  /**
   * Extract wiki-worthy knowledge from a Claude Code session log.
   * This is the core of the "compounding loop" — each session makes the wiki smarter.
   */
  async extractFromSession(sessionLog, sessionId) {
    const existingIndex = await this.buildIndexString();
    const result = await this.callLLM(
      buildSessionExtractPrompt(sessionLog, existingIndex)
    );
    const articles = this.parseArticlesFromResponse(result.content);
    if (articles.length === 0) {
      return {
        sourceId: "",
        articlesCreated: [],
        articlesUpdated: [],
        tokensUsed: result.tokensInput + result.tokensOutput
      };
    }
    return this.ingest(
      sessionLog,
      "session_log",
      `Session ${sessionId}`,
      sessionId
    );
  }
  // --------------------------------------------------------------------------
  // Wiki index and status
  // --------------------------------------------------------------------------
  /**
   * Get the full wiki index — the table of contents.
   */
  async getIndex() {
    const db2 = getDatabase();
    const articles = await db2.select().from(wikiArticles).orderBy(wikiArticles.category, wikiArticles.title);
    return articles.map((a) => ({
      slug: a.slug,
      title: a.title,
      category: a.category,
      status: a.status,
      updatedAt: a.updatedAt,
      backlinks: a.backlinks || []
    }));
  }
  /**
   * Get wiki status summary.
   */
  async getStatus() {
    const db2 = getDatabase();
    const sources = await db2.select().from(wikiSources);
    const articles = await db2.select().from(wikiArticles);
    const logs = await db2.select().from(wikiLog).orderBy(desc(wikiLog.createdAt)).limit(1);
    const categories = {};
    let activeCount = 0;
    let staleCount = 0;
    let archivedCount = 0;
    for (const article of articles) {
      categories[article.category] = (categories[article.category] || 0) + 1;
      if (article.status === "active") activeCount++;
      else if (article.status === "stale") staleCount++;
      else if (article.status === "archived") archivedCount++;
    }
    return {
      totalSources: sources.length,
      totalArticles: articles.length,
      activeArticles: activeCount,
      staleArticles: staleCount,
      archivedArticles: archivedCount,
      totalLogEntries: logs.length > 0 ? 1 : 0,
      // simplified
      lastActivity: logs.length > 0 ? logs[0].createdAt : void 0,
      categories
    };
  }
  /**
   * Get a specific article by slug.
   */
  async getArticle(slug) {
    const db2 = getDatabase();
    const results = await db2.select().from(wikiArticles).where(eq7(wikiArticles.slug, slug)).limit(1);
    if (results.length === 0) return null;
    const a = results[0];
    return {
      slug: a.slug,
      title: a.title,
      category: a.category,
      content: a.content,
      backlinks: a.backlinks || [],
      status: a.status,
      version: a.version,
      updatedAt: a.updatedAt
    };
  }
  // --------------------------------------------------------------------------
  // Flush: Export wiki to disk as markdown files
  // --------------------------------------------------------------------------
  /**
   * Flush the wiki to disk as markdown files in the wiki directory.
   * Creates index.md and individual article files organized by category.
   */
  async flushToDisk() {
    const fs2 = await import("fs");
    const path = await import("path");
    const wikiDir = this.config.wikiDir;
    const articles = await this.getIndex();
    const db2 = getDatabase();
    if (!fs2.existsSync(wikiDir)) {
      fs2.mkdirSync(wikiDir, { recursive: true });
    }
    let filesWritten = 0;
    const byCategory = {};
    for (const article of articles) {
      if (!byCategory[article.category]) {
        byCategory[article.category] = [];
      }
      byCategory[article.category].push(article);
    }
    let indexContent = `# Wiki Index

`;
    indexContent += `> Auto-generated wiki \u2014 compiled from session logs, commits, specs, and decisions.
`;
    indexContent += `> Last updated: ${(/* @__PURE__ */ new Date()).toISOString()}

`;
    for (const [category, catArticles] of Object.entries(byCategory).sort()) {
      indexContent += `## ${category.charAt(0).toUpperCase() + category.slice(1)}

`;
      for (const article of catArticles) {
        const statusBadge = article.status === "stale" ? " \u26A0\uFE0F" : "";
        indexContent += `- [${article.title}](./${category}/${article.slug}.md)${statusBadge}
`;
      }
      indexContent += "\n";
    }
    fs2.writeFileSync(path.join(wikiDir, "index.md"), indexContent);
    filesWritten++;
    for (const [category, catArticles] of Object.entries(byCategory)) {
      const categoryDir = path.join(wikiDir, category);
      if (!fs2.existsSync(categoryDir)) {
        fs2.mkdirSync(categoryDir, { recursive: true });
      }
      for (const entry of catArticles) {
        const fullArticle = await db2.select().from(wikiArticles).where(eq7(wikiArticles.slug, entry.slug)).limit(1);
        if (fullArticle.length > 0) {
          const a = fullArticle[0];
          let fileContent = `# ${a.title}

`;
          fileContent += `> Category: ${a.category} | Status: ${a.status} | Version: ${a.version}

`;
          if (a.backlinks && a.backlinks.length > 0) {
            fileContent += `**Related:** ${a.backlinks.map((b) => `[[${b}]]`).join(", ")}

`;
          }
          fileContent += `---

${a.content}
`;
          fs2.writeFileSync(
            path.join(categoryDir, `${a.slug}.md`),
            fileContent
          );
          filesWritten++;
        }
      }
    }
    const recentLogs = await db2.select().from(wikiLog).orderBy(desc(wikiLog.createdAt)).limit(50);
    if (recentLogs.length > 0) {
      let logContent = `# Wiki Activity Log

`;
      logContent += `> Append-only chronicle of wiki operations.

`;
      for (const log of recentLogs) {
        const date = log.createdAt.toISOString().split("T")[0];
        const tokens = log.tokensUsed ? ` (${log.tokensUsed} tokens)` : "";
        logContent += `- **${date}** [${log.action}] ${log.summary}${tokens}
`;
      }
      fs2.writeFileSync(path.join(wikiDir, "log.md"), logContent);
      filesWritten++;
    }
    return { filesWritten, wikiDir };
  }
  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------
  async callLLM(userPrompt) {
    const startTime = Date.now();
    const response = await this.client.messages.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      system: WIKI_COMPILER_SYSTEM,
      messages: [{ role: "user", content: userPrompt }]
    });
    const durationMs = Date.now() - startTime;
    const textContent = response.content.filter((block) => block.type === "text").map((block) => "text" in block ? block.text : "").join("\n");
    return {
      content: textContent,
      tokensInput: response.usage.input_tokens,
      tokensOutput: response.usage.output_tokens,
      durationMs,
      model: response.model
    };
  }
  parseArticlesFromResponse(content) {
    try {
      const parsed = this.parseJsonFromResponse(content);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  parseJsonFromResponse(content) {
    const jsonMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;
    try {
      return JSON.parse(jsonStr.trim());
    } catch {
      const rawMatch = content.match(/[\[{][\s\S]*[\]}]/);
      if (rawMatch) {
        return JSON.parse(rawMatch[0]);
      }
      throw new Error("Failed to parse JSON from LLM response");
    }
  }
  async buildIndexString() {
    const index2 = await this.getIndex();
    if (index2.length === 0) return "";
    return index2.map(
      (entry) => `- [[${entry.slug}]] (${entry.category}) \u2014 ${entry.title}`
    ).join("\n");
  }
};
function createWikiCompiler(config) {
  return new WikiCompiler(config);
}

// src/wiki/session-hook.ts
var WikiSessionHook = class {
  constructor(config) {
    this.config = config;
    this.compiler = new WikiCompiler(config);
  }
  /**
   * Called when a Claude Code session ends.
   * Extracts wiki-worthy knowledge and compiles it into articles.
   */
  async onSessionEnd(sessionLog, sessionId) {
    if (sessionLog.length < 200) {
      return {
        sourceId: "",
        articlesCreated: [],
        articlesUpdated: [],
        tokensUsed: 0
      };
    }
    return this.compiler.extractFromSession(sessionLog, sessionId);
  }
  /**
   * Called when a commit is made during a session.
   * Ingests the commit diff and message as a source.
   */
  async onCommit(commitSha, commitMessage, diffContent) {
    const content = `## Commit: ${commitSha.slice(0, 8)}

**Message:** ${commitMessage}

### Diff
\`\`\`
${diffContent}
\`\`\``;
    return this.compiler.ingest(
      content,
      "commit",
      commitMessage.split("\n")[0],
      commitSha
    );
  }
  /**
   * Called when a spec or requirements document is created/updated.
   */
  async onSpecUpdate(specContent, specTitle, filePath) {
    return this.compiler.ingest(specContent, "spec", specTitle, filePath);
  }
  /**
   * Flush the wiki to disk after extraction.
   * Typically called after onSessionEnd to persist changes.
   */
  async flush() {
    return this.compiler.flushToDisk();
  }
  /**
   * Generate the Claude Code hook script that captures session logs
   * and triggers wiki extraction.
   *
   * Returns a shell script suitable for use as a Claude Code PostSession hook.
   */
  static generateHookScript(wikiDir, repo) {
    return `#!/bin/bash
# DevPilot Wiki Session Hook
# Auto-extracts knowledge from Claude Code sessions into the wiki.
# Install: Add to .claude/settings.json under hooks.PostSession

WIKI_DIR="${wikiDir}"
REPO="${repo}"
SESSION_LOG="$1"

# Skip if no session log provided
if [ -z "$SESSION_LOG" ] || [ ! -f "$SESSION_LOG" ]; then
  exit 0
fi

# Skip very short sessions
LINES=$(wc -l < "$SESSION_LOG")
if [ "$LINES" -lt 10 ]; then
  exit 0
fi

# Run wiki extraction via devpilot CLI
devpilot wiki ingest --type session_log --title "Session $(date +%Y-%m-%d-%H%M)" --file "$SESSION_LOG" 2>/dev/null

# Flush wiki to disk
devpilot wiki flush 2>/dev/null
`;
  }
  /**
   * Generate the Claude Code settings.json hook configuration.
   */
  static generateHookConfig(wikiDir, repo) {
    return {
      hooks: {
        PostSession: [
          {
            type: "command",
            command: `devpilot wiki ingest --type session_log --title "Session $(date +%Y-%m-%d-%H%M)" --stdin`
          }
        ]
      }
    };
  }
};

// src/mempalace/index.ts
var mempalace_exports = {};
__export(mempalace_exports, {
  DisabledClient: () => DisabledClient,
  DualFeedSessionHook: () => DualFeedSessionHook,
  LocalShimClient: () => LocalShimClient,
  McpAdapterClient: () => McpAdapterClient,
  MemPalaceService: () => MemPalaceService,
  WikiPalaceBridge: () => WikiPalaceBridge,
  createMemPalaceClient: () => createMemPalaceClient,
  createMemPalaceService: () => createMemPalaceService,
  createWikiPalaceBridge: () => createWikiPalaceBridge,
  estimateTokens: () => estimateTokens
});

// src/mempalace/client.ts
import { createHash as createHash2 } from "crypto";
import { and as and6, desc as desc2, eq as eq8, inArray, isNull, like as like2, or as or3 } from "drizzle-orm";
var LocalShimClient = class {
  constructor() {
    this.mode = "local";
    this.rowToWing = (row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      wingType: row.wingType,
      repo: row.repo ?? void 0,
      description: row.description ?? void 0
    });
    this.rowToRoom = (row) => ({
      id: row.id,
      wingId: row.wingId,
      slug: row.slug,
      name: row.name,
      topic: row.topic,
      description: row.description ?? void 0
    });
    this.rowToCloset = (row) => ({
      id: row.id,
      roomId: row.roomId,
      summary: row.summary,
      drawerIds: row.drawerIds ?? [],
      tier: row.tier,
      tokenCost: row.tokenCost
    });
  }
  async ensureWing(slug, name, repo) {
    const db2 = getDatabase();
    const existing = await db2.select().from(palaceWings).where(eq8(palaceWings.slug, slug)).limit(1);
    if (existing.length > 0) {
      return this.rowToWing(existing[0]);
    }
    const [row] = await db2.insert(palaceWings).values({
      slug,
      name: name ?? slug,
      wingType: "project",
      repo
    }).returning();
    return this.rowToWing(row);
  }
  async addDrawer(input) {
    const db2 = getDatabase();
    const wing = await this.ensureWing(input.wingSlug);
    const room = await this.ensureRoom(
      wing.id,
      input.roomSlug,
      input.roomName ?? input.roomSlug,
      input.roomTopic ?? input.roomSlug
    );
    const contentHash = createHash2("sha256").update(input.content).digest("hex");
    const existing = await db2.select().from(palaceDrawers).where(
      and6(
        eq8(palaceDrawers.contentHash, contentHash),
        eq8(palaceDrawers.roomId, room.id)
      )
    ).limit(1);
    if (existing.length > 0) {
      return {
        drawerId: existing[0].id,
        created: false,
        roomId: room.id,
        wingId: wing.id
      };
    }
    const [row] = await db2.insert(palaceDrawers).values({
      roomId: room.id,
      memoryType: input.memoryType,
      label: input.label,
      content: input.content,
      aaakContent: input.aaakContent,
      contentHash,
      sourceKind: input.source?.kind,
      sourceRef: input.source?.ref,
      tags: input.tags ?? [],
      salience: input.salience ?? 0
    }).returning();
    return {
      drawerId: row.id,
      created: true,
      roomId: room.id,
      wingId: wing.id
    };
  }
  async search(input) {
    const db2 = getDatabase();
    let roomIds;
    if (input.wingSlug) {
      const wing = await db2.select().from(palaceWings).where(eq8(palaceWings.slug, input.wingSlug)).limit(1);
      if (wing.length === 0) {
        return { hits: [], totalScanned: 0 };
      }
      const rooms = await db2.select().from(palaceRooms).where(eq8(palaceRooms.wingId, wing[0].id));
      const ids = rooms.map((r) => r.id);
      if (ids.length === 0) {
        return { hits: [], totalScanned: 0 };
      }
      roomIds = ids;
    }
    const candidates = roomIds ? await db2.select().from(palaceDrawers).where(inArray(palaceDrawers.roomId, roomIds)) : await db2.select().from(palaceDrawers);
    const keywords = input.query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const scored = [];
    for (const row of candidates) {
      if (input.memoryTypes && !input.memoryTypes.includes(row.memoryType)) {
        continue;
      }
      const haystack = `${row.label} ${row.content}`.toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        if (haystack.includes(kw)) score += 1;
      }
      if (row.salience) score += row.salience * 0.25;
      if (score > 0) scored.push({ row, score });
    }
    scored.sort((a, b) => b.score - a.score);
    const limit = input.limit ?? 10;
    const top = scored.slice(0, limit);
    const roomMap = /* @__PURE__ */ new Map();
    const wingMap = /* @__PURE__ */ new Map();
    for (const entry of top) {
      if (!roomMap.has(entry.row.roomId)) {
        const roomRows = await db2.select().from(palaceRooms).where(eq8(palaceRooms.id, entry.row.roomId)).limit(1);
        if (roomRows[0]) {
          const room = this.rowToRoom(roomRows[0]);
          roomMap.set(room.id, room);
          if (!wingMap.has(room.wingId)) {
            const wingRows = await db2.select().from(palaceWings).where(eq8(palaceWings.id, room.wingId)).limit(1);
            if (wingRows[0]) {
              wingMap.set(room.wingId, this.rowToWing(wingRows[0]));
            }
          }
        }
      }
    }
    const hits = top.map((entry) => {
      const room = roomMap.get(entry.row.roomId);
      const wing = room ? wingMap.get(room.wingId) : void 0;
      return {
        drawerId: entry.row.id,
        roomSlug: room?.slug ?? "",
        wingSlug: wing?.slug ?? "",
        label: entry.row.label,
        snippet: entry.row.content.slice(0, 240),
        score: entry.score,
        memoryType: entry.row.memoryType,
        source: entry.row.sourceKind && entry.row.sourceRef ? { kind: entry.row.sourceKind, ref: entry.row.sourceRef } : void 0
      };
    });
    return { hits, totalScanned: candidates.length };
  }
  async wakeUp(input) {
    const db2 = getDatabase();
    const wing = await this.ensureWing(input.wingSlug);
    const identity = wing.description ?? `You are assisting with the ${wing.name} project. Follow the project's existing patterns and constraints.`;
    const rooms = await db2.select().from(palaceRooms).where(eq8(palaceRooms.wingId, wing.id));
    const roomIds = rooms.map((r) => r.id);
    const criticalFacts = [];
    if (roomIds.length > 0) {
      const closetRows = await db2.select().from(palaceClosets).where(inArray(palaceClosets.roomId, roomIds)).orderBy(palaceClosets.tier);
      for (const closet of closetRows) {
        if (closet.tier <= 1 && criticalFacts.length < 6) {
          criticalFacts.push(closet.summary);
        }
      }
      if (criticalFacts.length === 0) {
        const fallback = await db2.select().from(palaceDrawers).where(inArray(palaceDrawers.roomId, roomIds)).orderBy(desc2(palaceDrawers.salience)).limit(4);
        for (const drawer of fallback) {
          criticalFacts.push(`${drawer.label}: ${drawer.content.slice(0, 180)}`);
        }
      }
    }
    const tokenEstimate = estimateTokens(
      identity + "\n" + criticalFacts.join("\n")
    );
    return { identity, criticalFacts, tokenEstimate };
  }
  async recall(input) {
    const db2 = getDatabase();
    const wingRows = await db2.select().from(palaceWings).where(eq8(palaceWings.slug, input.wingSlug)).limit(1);
    if (wingRows.length === 0) {
      return { topic: input.topic, closets: [], tokenEstimate: 0 };
    }
    const rooms = await db2.select().from(palaceRooms).where(
      and6(
        eq8(palaceRooms.wingId, wingRows[0].id),
        or3(
          like2(palaceRooms.topic, `%${input.topic}%`),
          like2(palaceRooms.slug, `%${input.topic}%`),
          like2(palaceRooms.name, `%${input.topic}%`)
        )
      )
    );
    if (rooms.length === 0) {
      return { topic: input.topic, closets: [], tokenEstimate: 0 };
    }
    const roomIds = rooms.map((r) => r.id);
    const closetRows = await db2.select().from(palaceClosets).where(
      and6(
        inArray(palaceClosets.roomId, roomIds),
        eq8(palaceClosets.tier, 2)
      )
    ).limit(input.limit ?? 5);
    const closets = closetRows.map(this.rowToCloset);
    const tokenEstimate = closets.reduce((sum, c) => sum + c.tokenCost, 0);
    return { topic: input.topic, closets, tokenEstimate };
  }
  async kgAdd(input) {
    const db2 = getDatabase();
    const wing = await this.ensureWing(input.wingSlug);
    const existing = await db2.select().from(palaceKgTriples).where(
      and6(
        eq8(palaceKgTriples.wingId, wing.id),
        eq8(palaceKgTriples.subject, input.subject),
        eq8(palaceKgTriples.predicate, input.predicate),
        isNull(palaceKgTriples.validUntil)
      )
    );
    const contradictions = [];
    const now = /* @__PURE__ */ new Date();
    for (const row2 of existing) {
      if (row2.object !== input.object) {
        await db2.update(palaceKgTriples).set({ validUntil: now }).where(eq8(palaceKgTriples.id, row2.id));
        contradictions.push({
          subject: row2.subject,
          predicate: row2.predicate,
          oldObject: row2.object,
          newObject: input.object,
          oldDrawerId: row2.sourceDrawerId ?? void 0,
          newDrawerId: input.sourceDrawerId,
          detectedAt: now
        });
      }
    }
    const [row] = await db2.insert(palaceKgTriples).values({
      wingId: wing.id,
      subject: input.subject,
      predicate: input.predicate,
      object: input.object,
      validFrom: input.validFrom ?? now,
      sourceDrawerId: input.sourceDrawerId,
      confidence: input.confidence ?? 100
    }).returning();
    return { tripleId: row.id, contradictions };
  }
  async kgQuery(input) {
    const db2 = getDatabase();
    const wingRows = await db2.select().from(palaceWings).where(eq8(palaceWings.slug, input.wingSlug)).limit(1);
    if (wingRows.length === 0) return [];
    const filters = [eq8(palaceKgTriples.wingId, wingRows[0].id)];
    if (input.subject) filters.push(eq8(palaceKgTriples.subject, input.subject));
    if (input.predicate) filters.push(eq8(palaceKgTriples.predicate, input.predicate));
    if (input.object) filters.push(eq8(palaceKgTriples.object, input.object));
    if (input.currentOnly) filters.push(isNull(palaceKgTriples.validUntil));
    const rows = await db2.select().from(palaceKgTriples).where(and6(...filters));
    return rows.map((r) => ({
      id: r.id,
      wingId: r.wingId,
      subject: r.subject,
      predicate: r.predicate,
      object: r.object,
      validFrom: r.validFrom,
      validUntil: r.validUntil ?? void 0,
      sourceDrawerId: r.sourceDrawerId ?? void 0,
      confidence: r.confidence
    }));
  }
  async kgInvalidate(input) {
    const db2 = getDatabase();
    const wingRows = await db2.select().from(palaceWings).where(eq8(palaceWings.slug, input.wingSlug)).limit(1);
    if (wingRows.length === 0) return { invalidatedCount: 0 };
    const now = /* @__PURE__ */ new Date();
    const result = await db2.update(palaceKgTriples).set({ validUntil: now }).where(
      and6(
        eq8(palaceKgTriples.wingId, wingRows[0].id),
        eq8(palaceKgTriples.subject, input.subject),
        eq8(palaceKgTriples.predicate, input.predicate),
        isNull(palaceKgTriples.validUntil)
      )
    ).returning();
    return { invalidatedCount: result.length };
  }
  async listWings() {
    const db2 = getDatabase();
    const rows = await db2.select().from(palaceWings);
    return rows.map(this.rowToWing);
  }
  async listRooms(wingSlug) {
    const db2 = getDatabase();
    const wingRows = await db2.select().from(palaceWings).where(eq8(palaceWings.slug, wingSlug)).limit(1);
    if (wingRows.length === 0) return [];
    const rows = await db2.select().from(palaceRooms).where(eq8(palaceRooms.wingId, wingRows[0].id));
    return rows.map(this.rowToRoom);
  }
  // ----- Internals -----
  async ensureRoom(wingId, slug, name, topic) {
    const db2 = getDatabase();
    const existing = await db2.select().from(palaceRooms).where(and6(eq8(palaceRooms.wingId, wingId), eq8(palaceRooms.slug, slug))).limit(1);
    if (existing.length > 0) {
      return this.rowToRoom(existing[0]);
    }
    const [row] = await db2.insert(palaceRooms).values({ wingId, slug, name, topic }).returning();
    return this.rowToRoom(row);
  }
};
var McpAdapterClient = class {
  constructor(transport) {
    this.mode = "mcp";
    this.transport = transport;
  }
  async ensureWing(slug, name, repo) {
    const res = await this.transport("ensure_wing", {
      slug,
      name,
      repo
    });
    return res;
  }
  async addDrawer(input) {
    return await this.transport("add_drawer", input);
  }
  async search(input) {
    return await this.transport("search", input);
  }
  async wakeUp(input) {
    return await this.transport("wake_up", input);
  }
  async recall(input) {
    return await this.transport("traverse", input);
  }
  async kgAdd(input) {
    return await this.transport("kg_add", input);
  }
  async kgQuery(input) {
    return await this.transport("kg_query", input);
  }
  async kgInvalidate(input) {
    return await this.transport("kg_invalidate", input);
  }
  async listWings() {
    return await this.transport("list_wings", {});
  }
  async listRooms(wingSlug) {
    return await this.transport("list_rooms", { wingSlug });
  }
};
var DisabledClient = class {
  constructor() {
    this.mode = "disabled";
  }
  async ensureWing(slug, name) {
    return {
      id: "disabled",
      slug,
      name: name ?? slug,
      wingType: "project"
    };
  }
  async addDrawer(input) {
    return { drawerId: "", created: false, roomId: "", wingId: "" };
  }
  async search() {
    return { hits: [], totalScanned: 0 };
  }
  async wakeUp(input) {
    return { identity: "", criticalFacts: [], tokenEstimate: 0 };
  }
  async recall(input) {
    return { topic: input.topic, closets: [], tokenEstimate: 0 };
  }
  async kgAdd() {
    return { tripleId: "", contradictions: [] };
  }
  async kgQuery() {
    return [];
  }
  async kgInvalidate() {
    return { invalidatedCount: 0 };
  }
  async listWings() {
    return [];
  }
  async listRooms() {
    return [];
  }
};
function createMemPalaceClient(config, mcpTransport) {
  switch (config.mode) {
    case "local":
      return new LocalShimClient();
    case "mcp":
      if (!mcpTransport) {
        throw new Error(
          "MemPalace mode=mcp requires an MCP transport to be provided."
        );
      }
      return new McpAdapterClient(mcpTransport);
    case "disabled":
      return new DisabledClient();
    default:
      return new DisabledClient();
  }
}
function estimateTokens(text8) {
  return Math.ceil(text8.length / 4);
}

// src/mempalace/service.ts
var MemPalaceService = class {
  constructor(config, mcpTransport) {
    this.config = config;
    this.client = createMemPalaceClient(config, mcpTransport);
  }
  get enabled() {
    return this.client.mode !== "disabled";
  }
  // --------------------------------------------------------------------------
  // Prompt context assembly (L0-L3 stack)
  // --------------------------------------------------------------------------
  /**
   * Assemble a PalaceContextBlock for injection into wave planner prompts.
   *
   * - L0 (always): identity
   * - L1 (always): critical facts
   * - L2 (on-demand): topical recall for hints derived from the task
   * - L3 (deep search): only triggered by explicit queries elsewhere
   *
   * Returns null if the service is disabled or has no content to inject.
   */
  async assemblePromptContext(options) {
    if (!this.enabled) return null;
    const wingSlug = options.wingSlug ?? this.config.defaultWingSlug;
    const maxTokens = options.maxTokens ?? 2e3;
    const wakeUp = await this.client.wakeUp({ wingSlug });
    const topicalClosets = [];
    let totalTokens = wakeUp.tokenEstimate;
    for (const topic of options.topicHints ?? []) {
      if (totalTokens >= maxTokens) break;
      const recall = await this.client.recall({
        wingSlug,
        topic,
        limit: 3
      });
      for (const closet of recall.closets) {
        if (totalTokens + closet.tokenCost > maxTokens) continue;
        topicalClosets.push({
          topic,
          summary: closet.summary,
          citations: closet.drawerIds
        });
        totalTokens += closet.tokenCost;
      }
    }
    if (!wakeUp.identity && wakeUp.criticalFacts.length === 0 && topicalClosets.length === 0) {
      return null;
    }
    return {
      identity: wakeUp.identity,
      criticalFacts: wakeUp.criticalFacts,
      topicalClosets,
      tokenEstimate: totalTokens,
      wingSlug
    };
  }
  // --------------------------------------------------------------------------
  // Ingestion
  // --------------------------------------------------------------------------
  /**
   * Add a drawer to MemPalace. Convenience wrapper that fills in the
   * default wing slug when callers don't specify one.
   */
  async addDrawer(input) {
    if (!this.enabled) return;
    await this.client.addDrawer({
      ...input,
      wingSlug: input.wingSlug ?? this.config.defaultWingSlug
    });
  }
  /**
   * Add a KG triple to the default wing. Returns any contradictions
   * detected during insertion so the caller can decide what to do.
   */
  async addFact(input) {
    if (!this.enabled) return { tripleId: "", contradictions: [] };
    return this.client.kgAdd({
      wingSlug: input.wingSlug ?? this.config.defaultWingSlug,
      subject: input.subject,
      predicate: input.predicate,
      object: input.object,
      sourceDrawerId: input.sourceDrawerId,
      confidence: input.confidence
    });
  }
  /**
   * Convenience search across the default wing.
   */
  async quickSearch(query, limit = 5) {
    if (!this.enabled) return [];
    const res = await this.client.search({
      wingSlug: this.config.defaultWingSlug,
      query,
      limit
    });
    return res.hits;
  }
  // --------------------------------------------------------------------------
  // Rendering helpers
  // --------------------------------------------------------------------------
  /**
   * Render a PalaceContextBlock as a markdown snippet suitable for
   * injecting into a prompt template.
   */
  static renderBlock(block) {
    if (!block) return "";
    const lines = [];
    lines.push("### Palace Context (MemPalace)");
    lines.push("");
    if (block.identity) {
      lines.push("**Identity (L0):**");
      lines.push(block.identity);
      lines.push("");
    }
    if (block.criticalFacts.length > 0) {
      lines.push("**Critical Facts (L1):**");
      for (const fact of block.criticalFacts) {
        lines.push(`- ${fact}`);
      }
      lines.push("");
    }
    if (block.topicalClosets.length > 0) {
      lines.push("**Topical Recall (L2):**");
      for (const closet of block.topicalClosets) {
        lines.push(`- *[${closet.topic}]* ${closet.summary}`);
      }
      lines.push("");
    }
    lines.push(
      `> Palace tokens: ~${block.tokenEstimate} \xB7 Wing: \`${block.wingSlug}\``
    );
    lines.push("");
    return lines.join("\n");
  }
};
function createMemPalaceService(config, mcpTransport) {
  return new MemPalaceService(config, mcpTransport);
}

// src/mempalace/wiki-bridge.ts
var WikiPalaceBridge = class {
  constructor(wiki, palace, config) {
    this.wiki = wiki;
    this.palace = palace;
    this.config = config;
  }
  // --------------------------------------------------------------------------
  // Wiki → MemPalace: mirror articles as drawers
  // --------------------------------------------------------------------------
  /**
   * After a wiki ingest, mirror the created/updated articles into MemPalace
   * as drawers. The Wiki is the source of truth; drawers are copies indexed
   * by article slug for efficient recall.
   *
   * Call this immediately after `WikiCompiler.ingest()` returns.
   */
  async mirrorIngest(result) {
    if (!this.palace.enabled) return { mirroredCount: 0 };
    const allSlugs = [...result.articlesCreated, ...result.articlesUpdated];
    let mirroredCount = 0;
    for (const slug of allSlugs) {
      const article = await this.wiki.getArticle(slug);
      if (!article) continue;
      await this.palace.addDrawer({
        wingSlug: this.config.wingSlug,
        roomSlug: article.category,
        roomName: capitalize(article.category),
        roomTopic: article.category,
        memoryType: mapCategoryToMemoryType(article.category),
        label: article.title,
        content: article.content,
        source: { kind: "wiki_article", ref: article.slug },
        tags: (article.backlinks ?? []).map((b) => `backlink:${b}`),
        salience: article.status === "active" ? 1 : 0
      });
      if (this.config.extractFacts) {
        await this.maybeExtractFact(article.slug, article.content);
      }
      mirroredCount++;
    }
    return { mirroredCount };
  }
  /**
   * Mirror a single article explicitly. Useful for CLI flows and backfill.
   */
  async mirrorArticle(slug) {
    const article = await this.wiki.getArticle(slug);
    if (!article || !this.palace.enabled) return false;
    await this.palace.addDrawer({
      wingSlug: this.config.wingSlug,
      roomSlug: article.category,
      roomName: capitalize(article.category),
      roomTopic: article.category,
      memoryType: mapCategoryToMemoryType(article.category),
      label: article.title,
      content: article.content,
      source: { kind: "wiki_article", ref: article.slug },
      tags: (article.backlinks ?? []).map((b) => `backlink:${b}`),
      salience: article.status === "active" ? 1 : 0
    });
    return true;
  }
  // --------------------------------------------------------------------------
  // MemPalace → Wiki: surface contradictions as lint candidates
  // --------------------------------------------------------------------------
  /**
   * Given a set of KG contradictions (typically returned from
   * `MemPalaceService.addFact()`), build a list of wiki article slugs that
   * should be re-examined. Callers can pass these to `WikiCompiler.ingest()`
   * with fresh source material, or mark the articles stale directly.
   *
   * The bridge itself never mutates the wiki — it only advises.
   */
  candidateArticlesFromContradictions(contradictions) {
    const candidates = [];
    for (const c of contradictions) {
      const guessedSlug = slugify(c.subject);
      candidates.push({
        articleSlug: guessedSlug,
        reason: `Contradiction: "${c.subject} ${c.predicate} ${c.oldObject}" \u2192 "${c.newObject}"`
      });
    }
    return candidates;
  }
  // --------------------------------------------------------------------------
  // Internals
  // --------------------------------------------------------------------------
  async maybeExtractFact(articleSlug, content) {
    const firstPara = content.split(/\n\n/)[0] ?? "";
    const match = firstPara.match(/^([A-Z][\w\s-]{2,40})\s+is\s+([^.]{3,120})/);
    if (!match) return;
    await this.palace.addFact({
      wingSlug: this.config.wingSlug,
      subject: match[1].trim(),
      predicate: "is",
      object: match[2].trim(),
      confidence: 60
    });
  }
};
function capitalize(s) {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}
function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function mapCategoryToMemoryType(category) {
  switch (category) {
    case "decisions":
      return "decision";
    case "patterns":
      return "advice";
    case "troubleshooting":
      return "discovery";
    case "workflows":
      return "advice";
    case "architecture":
    case "components":
    default:
      return "fact";
  }
}
function createWikiPalaceBridge(wiki, palace, config) {
  return new WikiPalaceBridge(wiki, palace, config);
}

// src/mempalace/session-hook.ts
var DualFeedSessionHook = class {
  constructor(config) {
    this.config = config;
    this.wikiHook = new WikiSessionHook(config.wiki);
    this.wikiCompiler = new WikiCompiler(config.wiki);
    this.palace = new MemPalaceService(config.mempalace);
    this.bridge = new WikiPalaceBridge(this.wikiCompiler, this.palace, {
      wingSlug: config.mempalace.defaultWingSlug,
      extractFacts: true
    });
  }
  /**
   * Called when a Claude Code session ends.
   * Flow:
   *   1. Wiki compiler extracts articles from the session log
   *   2. (If enabled) bridge mirrors those articles into MemPalace
   *   3. (If enabled) wiki is flushed to the `/wiki` folder on disk
   */
  async onSessionEnd(sessionLog, sessionId) {
    const wikiResult = await this.wikiHook.onSessionEnd(sessionLog, sessionId);
    let mirroredCount = 0;
    if (this.palace.enabled) {
      try {
        const mirror = await this.bridge.mirrorIngest(wikiResult);
        mirroredCount = mirror.mirroredCount;
      } catch (err) {
        console.warn(
          "[mempalace] Failed to mirror wiki ingest into palace:",
          err
        );
      }
    }
    let wikiFlush;
    if (this.config.flushWiki !== false) {
      try {
        wikiFlush = await this.wikiHook.flush();
      } catch (err) {
        console.warn("[mempalace] Failed to flush wiki to disk:", err);
      }
    }
    return { wikiResult, mirroredCount, wikiFlush };
  }
  /**
   * Called on commit. Wiki owns commit ingestion; MemPalace mirrors the
   * resulting articles.
   */
  async onCommit(commitSha, commitMessage, diffContent) {
    const wikiResult = await this.wikiHook.onCommit(
      commitSha,
      commitMessage,
      diffContent
    );
    let mirroredCount = 0;
    if (this.palace.enabled) {
      try {
        const mirror = await this.bridge.mirrorIngest(wikiResult);
        mirroredCount = mirror.mirroredCount;
      } catch (err) {
        console.warn(
          "[mempalace] Failed to mirror commit ingest into palace:",
          err
        );
      }
    }
    return { wikiResult, mirroredCount };
  }
  /**
   * Called on spec update. Same dual-feed pattern as onCommit.
   */
  async onSpecUpdate(specContent, specTitle, filePath) {
    const wikiResult = await this.wikiHook.onSpecUpdate(
      specContent,
      specTitle,
      filePath
    );
    let mirroredCount = 0;
    if (this.palace.enabled) {
      try {
        const mirror = await this.bridge.mirrorIngest(wikiResult);
        mirroredCount = mirror.mirroredCount;
      } catch (err) {
        console.warn(
          "[mempalace] Failed to mirror spec ingest into palace:",
          err
        );
      }
    }
    return { wikiResult, mirroredCount };
  }
  /** Explicit access to the wiki hook for callers that still need it. */
  get wikiSessionHook() {
    return this.wikiHook;
  }
  /** Explicit access to the palace service for callers that still need it. */
  get palaceService() {
    return this.palace;
  }
};

// src/index.ts
var VERSION = "0.1.0";
export {
  VERSION,
  activityEvents,
  closeDatabase,
  completedTasks,
  completedTasksRelations,
  complexityValues,
  conductorScores,
  conductorScoresRelations,
  conflictingFiles,
  conflictingFilesRelations,
  createDatabase,
  databaseConfigSchema,
  dependencyEdgeTypeValues,
  dependencyEdges,
  dependencyEdgesRelations,
  eventTypeValues,
  fileStatusValues,
  getDatabase,
  getDatabaseConfig,
  horizonItems,
  horizonItemsRelations,
  inFlightFiles,
  inFlightFilesRelations,
  initDatabase,
  linear_exports as linear,
  mempalace_exports as mempalace,
  modelValues,
  orchestrator_exports as orchestrator,
  orchestratorModeValues,
  palaceClosets,
  palaceClosetsRelations,
  palaceDiary,
  palaceDrawers,
  palaceDrawersRelations,
  palaceHalls,
  palaceKgTriples,
  palaceRooms,
  palaceRoomsRelations,
  palaceTunnels,
  palaceWings,
  palaceWingsRelations,
  plans,
  plansRelations,
  resetDatabase,
  rufloSessions,
  rufloSessionsRelations,
  scoreHistory,
  scoreHistoryRelations,
  sessionStatusValues,
  tasks,
  tasksRelations,
  touchedFiles,
  touchedFilesRelations,
  wavePlanMetrics,
  wavePlanMetricsRelations,
  wavePlanStatusValues,
  wave_planner_exports as wavePlanner,
  wavePlans,
  wavePlansRelations,
  waveStatusValues,
  waveTaskStatusValues,
  waveTasks,
  waveTasksRelations,
  waves,
  wavesRelations,
  wiki_exports as wiki,
  wikiArticleStatusValues,
  wikiArticles,
  wikiArticlesRelations,
  wikiLog,
  wikiLogActionValues,
  wikiLogRelations,
  wikiSourceTypeValues,
  wikiSources,
  wikiSourcesRelations,
  workstreams,
  workstreamsRelations,
  zoneValues
};
//# sourceMappingURL=index.mjs.map