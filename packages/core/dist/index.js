"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  VERSION: () => VERSION,
  activityEvents: () => activityEvents,
  closeDatabase: () => closeDatabase,
  completedTasks: () => completedTasks,
  completedTasksRelations: () => completedTasksRelations,
  complexityValues: () => complexityValues,
  conductorScores: () => conductorScores,
  conductorScoresRelations: () => conductorScoresRelations,
  conflictingFiles: () => conflictingFiles,
  conflictingFilesRelations: () => conflictingFilesRelations,
  createDatabase: () => createDatabase,
  databaseConfigSchema: () => databaseConfigSchema,
  dependencyEdgeTypeValues: () => dependencyEdgeTypeValues,
  dependencyEdges: () => dependencyEdges,
  dependencyEdgesRelations: () => dependencyEdgesRelations,
  eventTypeValues: () => eventTypeValues,
  fileStatusValues: () => fileStatusValues,
  getDatabase: () => getDatabase,
  getDatabaseConfig: () => getDatabaseConfig,
  horizonItems: () => horizonItems,
  horizonItemsRelations: () => horizonItemsRelations,
  inFlightFiles: () => inFlightFiles,
  inFlightFilesRelations: () => inFlightFilesRelations,
  initDatabase: () => initDatabase,
  linear: () => linear_exports,
  modelValues: () => modelValues,
  orchestrator: () => orchestrator_exports,
  orchestratorModeValues: () => orchestratorModeValues,
  plans: () => plans,
  plansRelations: () => plansRelations,
  resetDatabase: () => resetDatabase,
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
  wavePlanner: () => wave_planner_exports,
  wavePlans: () => wavePlans,
  wavePlansRelations: () => wavePlansRelations,
  waveStatusValues: () => waveStatusValues,
  waveTaskStatusValues: () => waveTaskStatusValues,
  waveTasks: () => waveTasks,
  waveTasksRelations: () => waveTasksRelations,
  waves: () => waves,
  wavesRelations: () => wavesRelations,
  workstreams: () => workstreams,
  workstreamsRelations: () => workstreamsRelations,
  zoneValues: () => zoneValues
});
module.exports = __toCommonJS(index_exports);

// src/db/config.ts
var import_zod = require("zod");
var databaseConfigSchema = import_zod.z.object({
  type: import_zod.z.enum(["sqlite", "postgres"]).default("sqlite"),
  // SQLite options
  sqlitePath: import_zod.z.string().optional(),
  // Postgres options
  postgresUrl: import_zod.z.string().optional()
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
var import_better_sqlite3 = __toESM(require("better-sqlite3"));
var import_better_sqlite32 = require("drizzle-orm/better-sqlite3");

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
var orchestratorModeValues = ["http", "ao-cli", "manual", "disabled"];
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

// src/db/schema/horizon.ts
var import_sqlite_core = require("drizzle-orm/sqlite-core");
var import_drizzle_orm = require("drizzle-orm");
var import_cuid2 = require("@paralleldrive/cuid2");
var horizonItems = (0, import_sqlite_core.sqliteTable)("horizon_items", {
  id: (0, import_sqlite_core.text)("id").primaryKey().$defaultFn(() => (0, import_cuid2.createId)()),
  title: (0, import_sqlite_core.text)("title").notNull(),
  zone: (0, import_sqlite_core.text)("zone", { enum: zoneValues }).notNull().default("DIRECTIONAL"),
  repo: (0, import_sqlite_core.text)("repo").notNull(),
  complexity: (0, import_sqlite_core.text)("complexity", { enum: complexityValues }),
  priority: (0, import_sqlite_core.integer)("priority").notNull().default(0),
  linearTicketId: (0, import_sqlite_core.text)("linear_ticket_id"),
  createdAt: (0, import_sqlite_core.integer)("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  updatedAt: (0, import_sqlite_core.integer)("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var horizonItemsRelations = (0, import_drizzle_orm.relations)(horizonItems, ({ one, many }) => ({
  plan: one(plans, {
    fields: [horizonItems.id],
    references: [plans.horizonItemId]
  }),
  conflictingFiles: many(inFlightFiles)
}));
var plans = (0, import_sqlite_core.sqliteTable)("plans", {
  id: (0, import_sqlite_core.text)("id").primaryKey().$defaultFn(() => (0, import_cuid2.createId)()),
  version: (0, import_sqlite_core.integer)("version").notNull().default(1),
  horizonItemId: (0, import_sqlite_core.text)("horizon_item_id").notNull().unique(),
  estimatedCostUsd: (0, import_sqlite_core.real)("estimated_cost_usd").notNull(),
  baselineCostUsd: (0, import_sqlite_core.real)("baseline_cost_usd").notNull(),
  acceptanceCriteria: (0, import_sqlite_core.text)("acceptance_criteria", { mode: "json" }).$type().notNull(),
  confidenceSignals: (0, import_sqlite_core.text)("confidence_signals", { mode: "json" }).$type().notNull(),
  fleetContextSnapshot: (0, import_sqlite_core.text)("fleet_context_snapshot", { mode: "json" }).$type().notNull(),
  memorySessionsUsed: (0, import_sqlite_core.text)("memory_sessions_used", { mode: "json" }).$type().default([]),
  previousPlanId: (0, import_sqlite_core.text)("previous_plan_id"),
  generatedAt: (0, import_sqlite_core.integer)("generated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var plansRelations = (0, import_drizzle_orm.relations)(plans, ({ one, many }) => ({
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
var workstreams = (0, import_sqlite_core.sqliteTable)("workstreams", {
  id: (0, import_sqlite_core.text)("id").primaryKey().$defaultFn(() => (0, import_cuid2.createId)()),
  planId: (0, import_sqlite_core.text)("plan_id").notNull(),
  label: (0, import_sqlite_core.text)("label").notNull(),
  repo: (0, import_sqlite_core.text)("repo").notNull(),
  workerCount: (0, import_sqlite_core.integer)("worker_count").notNull().default(1),
  orderIndex: (0, import_sqlite_core.integer)("order_index").notNull().default(0)
});
var workstreamsRelations = (0, import_drizzle_orm.relations)(workstreams, ({ one, many }) => ({
  plan: one(plans, {
    fields: [workstreams.planId],
    references: [plans.id]
  }),
  tasks: many(tasks)
}));
var tasks = (0, import_sqlite_core.sqliteTable)("tasks", {
  id: (0, import_sqlite_core.text)("id").primaryKey().$defaultFn(() => (0, import_cuid2.createId)()),
  label: (0, import_sqlite_core.text)("label").notNull(),
  model: (0, import_sqlite_core.text)("model", { enum: modelValues }).notNull().default("SONNET"),
  modelOverride: (0, import_sqlite_core.text)("model_override", { enum: modelValues }),
  complexity: (0, import_sqlite_core.text)("complexity", { enum: complexityValues }).notNull(),
  estimatedCostUsd: (0, import_sqlite_core.real)("estimated_cost_usd").notNull(),
  filePaths: (0, import_sqlite_core.text)("file_paths", { mode: "json" }).$type().notNull(),
  conflictWarning: (0, import_sqlite_core.text)("conflict_warning"),
  dependsOn: (0, import_sqlite_core.text)("depends_on", { mode: "json" }).$type().default([]),
  orderIndex: (0, import_sqlite_core.integer)("order_index").notNull().default(0),
  // Either belongs to a workstream OR is a sequential task on a plan
  workstreamId: (0, import_sqlite_core.text)("workstream_id"),
  planId: (0, import_sqlite_core.text)("plan_id")
});
var tasksRelations = (0, import_drizzle_orm.relations)(tasks, ({ one }) => ({
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
var touchedFiles = (0, import_sqlite_core.sqliteTable)("touched_files", {
  id: (0, import_sqlite_core.text)("id").primaryKey().$defaultFn(() => (0, import_cuid2.createId)()),
  planId: (0, import_sqlite_core.text)("plan_id").notNull(),
  path: (0, import_sqlite_core.text)("path").notNull(),
  status: (0, import_sqlite_core.text)("status", { enum: fileStatusValues }).notNull().default("AVAILABLE"),
  inFlightVia: (0, import_sqlite_core.text)("in_flight_via")
});
var touchedFilesRelations = (0, import_drizzle_orm.relations)(touchedFiles, ({ one }) => ({
  plan: one(plans, {
    fields: [touchedFiles.planId],
    references: [plans.id]
  })
}));
var inFlightFiles = (0, import_sqlite_core.sqliteTable)("in_flight_files", {
  id: (0, import_sqlite_core.text)("id").primaryKey().$defaultFn(() => (0, import_cuid2.createId)()),
  path: (0, import_sqlite_core.text)("path").notNull(),
  activeSessionId: (0, import_sqlite_core.text)("active_session_id").notNull(),
  linearTicketId: (0, import_sqlite_core.text)("linear_ticket_id").notNull(),
  estimatedMinutesRemaining: (0, import_sqlite_core.integer)("estimated_minutes_remaining").notNull().default(30),
  horizonItemId: (0, import_sqlite_core.text)("horizon_item_id"),
  lockedAt: (0, import_sqlite_core.integer)("locked_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var inFlightFilesRelations = (0, import_drizzle_orm.relations)(inFlightFiles, ({ one }) => ({
  horizonItem: one(horizonItems, {
    fields: [inFlightFiles.horizonItemId],
    references: [horizonItems.id]
  })
}));
var conflictingFiles = (0, import_sqlite_core.sqliteTable)("conflicting_files", {
  id: (0, import_sqlite_core.text)("id").primaryKey().$defaultFn(() => (0, import_cuid2.createId)()),
  horizonItemId: (0, import_sqlite_core.text)("horizon_item_id").notNull(),
  path: (0, import_sqlite_core.text)("path").notNull(),
  blockedBySessionId: (0, import_sqlite_core.text)("blocked_by_session_id"),
  blockedByTicketId: (0, import_sqlite_core.text)("blocked_by_ticket_id"),
  estimatedUnlockMinutes: (0, import_sqlite_core.integer)("estimated_unlock_minutes")
});
var conflictingFilesRelations = (0, import_drizzle_orm.relations)(conflictingFiles, ({ one }) => ({
  horizonItem: one(horizonItems, {
    fields: [conflictingFiles.horizonItemId],
    references: [horizonItems.id]
  })
}));

// src/db/schema/fleet.ts
var import_sqlite_core2 = require("drizzle-orm/sqlite-core");
var import_drizzle_orm2 = require("drizzle-orm");
var import_cuid22 = require("@paralleldrive/cuid2");
var rufloSessions = (0, import_sqlite_core2.sqliteTable)("ruflo_sessions", {
  id: (0, import_sqlite_core2.text)("id").primaryKey().$defaultFn(() => (0, import_cuid22.createId)()),
  repo: (0, import_sqlite_core2.text)("repo").notNull(),
  linearTicketId: (0, import_sqlite_core2.text)("linear_ticket_id").notNull(),
  ticketTitle: (0, import_sqlite_core2.text)("ticket_title").notNull(),
  currentWorkstream: (0, import_sqlite_core2.text)("current_workstream").notNull().default("Main"),
  progressPercent: (0, import_sqlite_core2.integer)("progress_percent").notNull().default(0),
  elapsedMinutes: (0, import_sqlite_core2.integer)("elapsed_minutes").notNull().default(0),
  estimatedRemainingMinutes: (0, import_sqlite_core2.integer)("estimated_remaining_minutes").notNull().default(30),
  status: (0, import_sqlite_core2.text)("status", { enum: sessionStatusValues }).notNull().default("ACTIVE"),
  inFlightFiles: (0, import_sqlite_core2.text)("in_flight_files", { mode: "json" }).$type().default([]),
  prUrl: (0, import_sqlite_core2.text)("pr_url"),
  // External orchestrator tracking
  externalSessionId: (0, import_sqlite_core2.text)("external_session_id"),
  orchestratorMode: (0, import_sqlite_core2.text)("orchestrator_mode", { enum: orchestratorModeValues }),
  tokensUsed: (0, import_sqlite_core2.integer)("tokens_used"),
  costUsd: (0, import_sqlite_core2.integer)("cost_usd"),
  createdAt: (0, import_sqlite_core2.integer)("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  updatedAt: (0, import_sqlite_core2.integer)("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var rufloSessionsRelations = (0, import_drizzle_orm2.relations)(rufloSessions, ({ many }) => ({
  completedTasks: many(completedTasks)
}));
var completedTasks = (0, import_sqlite_core2.sqliteTable)("completed_tasks", {
  id: (0, import_sqlite_core2.text)("id").primaryKey().$defaultFn(() => (0, import_cuid22.createId)()),
  sessionId: (0, import_sqlite_core2.text)("session_id").notNull(),
  label: (0, import_sqlite_core2.text)("label").notNull(),
  model: (0, import_sqlite_core2.text)("model", { enum: modelValues }),
  durationMinutes: (0, import_sqlite_core2.integer)("duration_minutes"),
  completedAt: (0, import_sqlite_core2.integer)("completed_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var completedTasksRelations = (0, import_drizzle_orm2.relations)(completedTasks, ({ one }) => ({
  session: one(rufloSessions, {
    fields: [completedTasks.sessionId],
    references: [rufloSessions.id]
  })
}));

// src/db/schema/score.ts
var import_sqlite_core3 = require("drizzle-orm/sqlite-core");
var import_drizzle_orm3 = require("drizzle-orm");
var import_cuid23 = require("@paralleldrive/cuid2");
var conductorScores = (0, import_sqlite_core3.sqliteTable)("conductor_scores", {
  id: (0, import_sqlite_core3.text)("id").primaryKey().$defaultFn(() => (0, import_cuid23.createId)()),
  userId: (0, import_sqlite_core3.text)("user_id").notNull().unique(),
  total: (0, import_sqlite_core3.integer)("total").notNull().default(500),
  fleetUtilization: (0, import_sqlite_core3.integer)("fleet_utilization").notNull().default(100),
  runwayHealth: (0, import_sqlite_core3.integer)("runway_health").notNull().default(100),
  planAccuracy: (0, import_sqlite_core3.integer)("plan_accuracy").notNull().default(100),
  costEfficiency: (0, import_sqlite_core3.integer)("cost_efficiency").notNull().default(100),
  velocityTrend: (0, import_sqlite_core3.integer)("velocity_trend").notNull().default(100),
  leaderboardRank: (0, import_sqlite_core3.integer)("leaderboard_rank"),
  createdAt: (0, import_sqlite_core3.integer)("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  updatedAt: (0, import_sqlite_core3.integer)("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var conductorScoresRelations = (0, import_drizzle_orm3.relations)(conductorScores, ({ many }) => ({
  history: many(scoreHistory)
}));
var scoreHistory = (0, import_sqlite_core3.sqliteTable)("score_history", {
  id: (0, import_sqlite_core3.text)("id").primaryKey().$defaultFn(() => (0, import_cuid23.createId)()),
  scoreId: (0, import_sqlite_core3.text)("score_id").notNull(),
  total: (0, import_sqlite_core3.integer)("total").notNull(),
  fleetUtilization: (0, import_sqlite_core3.integer)("fleet_utilization").notNull(),
  runwayHealth: (0, import_sqlite_core3.integer)("runway_health").notNull(),
  planAccuracy: (0, import_sqlite_core3.integer)("plan_accuracy").notNull(),
  costEfficiency: (0, import_sqlite_core3.integer)("cost_efficiency").notNull(),
  velocityTrend: (0, import_sqlite_core3.integer)("velocity_trend").notNull(),
  recordedAt: (0, import_sqlite_core3.integer)("recorded_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var scoreHistoryRelations = (0, import_drizzle_orm3.relations)(scoreHistory, ({ one }) => ({
  score: one(conductorScores, {
    fields: [scoreHistory.scoreId],
    references: [conductorScores.id]
  })
}));

// src/db/schema/events.ts
var import_sqlite_core4 = require("drizzle-orm/sqlite-core");
var import_cuid24 = require("@paralleldrive/cuid2");
var activityEvents = (0, import_sqlite_core4.sqliteTable)("activity_events", {
  id: (0, import_sqlite_core4.text)("id").primaryKey().$defaultFn(() => (0, import_cuid24.createId)()),
  type: (0, import_sqlite_core4.text)("type", { enum: eventTypeValues }).notNull(),
  message: (0, import_sqlite_core4.text)("message").notNull(),
  repo: (0, import_sqlite_core4.text)("repo"),
  ticketId: (0, import_sqlite_core4.text)("ticket_id"),
  metadata: (0, import_sqlite_core4.text)("metadata", { mode: "json" }).$type(),
  createdAt: (0, import_sqlite_core4.integer)("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});

// src/db/schema/wave-planner.ts
var import_sqlite_core5 = require("drizzle-orm/sqlite-core");
var import_drizzle_orm4 = require("drizzle-orm");
var import_cuid25 = require("@paralleldrive/cuid2");
var wavePlans = (0, import_sqlite_core5.sqliteTable)("wave_plans", {
  id: (0, import_sqlite_core5.text)("id").primaryKey().$defaultFn(() => (0, import_cuid25.createId)()),
  planId: (0, import_sqlite_core5.text)("plan_id").notNull(),
  horizonItemId: (0, import_sqlite_core5.text)("horizon_item_id").notNull(),
  totalWaves: (0, import_sqlite_core5.integer)("total_waves").notNull(),
  totalTasks: (0, import_sqlite_core5.integer)("total_tasks").notNull(),
  maxParallelism: (0, import_sqlite_core5.integer)("max_parallelism").notNull(),
  criticalPath: (0, import_sqlite_core5.text)("critical_path", { mode: "json" }).$type().notNull(),
  criticalPathLength: (0, import_sqlite_core5.integer)("critical_path_length").notNull(),
  parallelizationScore: (0, import_sqlite_core5.real)("parallelization_score").notNull(),
  status: (0, import_sqlite_core5.text)("status", { enum: wavePlanStatusValues }).notNull().default("draft"),
  currentWaveIndex: (0, import_sqlite_core5.integer)("current_wave_index").notNull().default(0),
  version: (0, import_sqlite_core5.integer)("version").notNull().default(1),
  previousWavePlanId: (0, import_sqlite_core5.text)("previous_wave_plan_id"),
  rawMarkdown: (0, import_sqlite_core5.text)("raw_markdown"),
  startedAt: (0, import_sqlite_core5.integer)("started_at", { mode: "timestamp" }),
  completedAt: (0, import_sqlite_core5.integer)("completed_at", { mode: "timestamp" }),
  createdAt: (0, import_sqlite_core5.integer)("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  updatedAt: (0, import_sqlite_core5.integer)("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var wavePlansRelations = (0, import_drizzle_orm4.relations)(wavePlans, ({ one, many }) => ({
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
var waves = (0, import_sqlite_core5.sqliteTable)("waves", {
  id: (0, import_sqlite_core5.text)("id").primaryKey().$defaultFn(() => (0, import_cuid25.createId)()),
  wavePlanId: (0, import_sqlite_core5.text)("wave_plan_id").notNull(),
  waveIndex: (0, import_sqlite_core5.integer)("wave_index").notNull(),
  label: (0, import_sqlite_core5.text)("label").notNull(),
  maxParallelTasks: (0, import_sqlite_core5.integer)("max_parallel_tasks").notNull(),
  status: (0, import_sqlite_core5.text)("status", { enum: waveStatusValues }).notNull().default("pending"),
  startedAt: (0, import_sqlite_core5.integer)("started_at", { mode: "timestamp" }),
  completedAt: (0, import_sqlite_core5.integer)("completed_at", { mode: "timestamp" })
});
var wavesRelations = (0, import_drizzle_orm4.relations)(waves, ({ one, many }) => ({
  wavePlan: one(wavePlans, {
    fields: [waves.wavePlanId],
    references: [wavePlans.id]
  }),
  tasks: many(waveTasks)
}));
var waveTasks = (0, import_sqlite_core5.sqliteTable)("wave_tasks", {
  id: (0, import_sqlite_core5.text)("id").primaryKey().$defaultFn(() => (0, import_cuid25.createId)()),
  waveId: (0, import_sqlite_core5.text)("wave_id").notNull(),
  wavePlanId: (0, import_sqlite_core5.text)("wave_plan_id").notNull(),
  taskId: (0, import_sqlite_core5.text)("task_id"),
  // FK to existing tasks table (nullable)
  waveIndex: (0, import_sqlite_core5.integer)("wave_index").notNull(),
  taskCode: (0, import_sqlite_core5.text)("task_code").notNull(),
  // e.g., "1.1", "4.3"
  label: (0, import_sqlite_core5.text)("label").notNull(),
  description: (0, import_sqlite_core5.text)("description").notNull().default(""),
  filePaths: (0, import_sqlite_core5.text)("file_paths", { mode: "json" }).$type().notNull().default([]),
  dependencies: (0, import_sqlite_core5.text)("dependencies", { mode: "json" }).$type().notNull().default([]),
  recommendedModel: (0, import_sqlite_core5.text)("recommended_model", { enum: modelValues }),
  complexity: (0, import_sqlite_core5.text)("complexity", { enum: complexityValues }),
  isOnCriticalPath: (0, import_sqlite_core5.integer)("is_on_critical_path", { mode: "boolean" }).notNull().default(false),
  canRunInParallel: (0, import_sqlite_core5.integer)("can_run_in_parallel", { mode: "boolean" }).notNull().default(true),
  status: (0, import_sqlite_core5.text)("status", { enum: waveTaskStatusValues }).notNull().default("pending"),
  assignedSessionId: (0, import_sqlite_core5.text)("assigned_session_id"),
  startedAt: (0, import_sqlite_core5.integer)("started_at", { mode: "timestamp" }),
  completedAt: (0, import_sqlite_core5.integer)("completed_at", { mode: "timestamp" }),
  errorMessage: (0, import_sqlite_core5.text)("error_message"),
  retryCount: (0, import_sqlite_core5.integer)("retry_count").notNull().default(0)
});
var waveTasksRelations = (0, import_drizzle_orm4.relations)(waveTasks, ({ one }) => ({
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
var dependencyEdges = (0, import_sqlite_core5.sqliteTable)("dependency_edges", {
  id: (0, import_sqlite_core5.text)("id").primaryKey().$defaultFn(() => (0, import_cuid25.createId)()),
  wavePlanId: (0, import_sqlite_core5.text)("wave_plan_id").notNull(),
  fromTaskCode: (0, import_sqlite_core5.text)("from_task_code").notNull(),
  toTaskCode: (0, import_sqlite_core5.text)("to_task_code").notNull(),
  edgeType: (0, import_sqlite_core5.text)("edge_type", { enum: dependencyEdgeTypeValues }).notNull().default("hard")
});
var dependencyEdgesRelations = (0, import_drizzle_orm4.relations)(dependencyEdges, ({ one }) => ({
  wavePlan: one(wavePlans, {
    fields: [dependencyEdges.wavePlanId],
    references: [wavePlans.id]
  })
}));
var wavePlanMetrics = (0, import_sqlite_core5.sqliteTable)("wave_plan_metrics", {
  id: (0, import_sqlite_core5.text)("id").primaryKey().$defaultFn(() => (0, import_cuid25.createId)()),
  wavePlanId: (0, import_sqlite_core5.text)("wave_plan_id").notNull().unique(),
  totalWallClockMs: (0, import_sqlite_core5.integer)("total_wall_clock_ms"),
  theoreticalMinMs: (0, import_sqlite_core5.integer)("theoretical_min_ms"),
  parallelizationEfficiency: (0, import_sqlite_core5.real)("parallelization_efficiency"),
  wavesExecuted: (0, import_sqlite_core5.integer)("waves_executed").notNull().default(0),
  tasksCompleted: (0, import_sqlite_core5.integer)("tasks_completed").notNull().default(0),
  tasksFailed: (0, import_sqlite_core5.integer)("tasks_failed").notNull().default(0),
  tasksRetried: (0, import_sqlite_core5.integer)("tasks_retried").notNull().default(0),
  avgTaskDurationMs: (0, import_sqlite_core5.integer)("avg_task_duration_ms"),
  maxWaveWaitMs: (0, import_sqlite_core5.integer)("max_wave_wait_ms"),
  fileConflictsAvoided: (0, import_sqlite_core5.integer)("file_conflicts_avoided").notNull().default(0),
  reOptimizationCount: (0, import_sqlite_core5.integer)("re_optimization_count").notNull().default(0),
  recordedAt: (0, import_sqlite_core5.integer)("recorded_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var wavePlanMetricsRelations = (0, import_drizzle_orm4.relations)(wavePlanMetrics, ({ one }) => ({
  wavePlan: one(wavePlans, {
    fields: [wavePlanMetrics.wavePlanId],
    references: [wavePlans.id]
  })
}));

// src/db/adapters/sqlite.ts
var import_fs = require("fs");
var import_path = require("path");
var sqliteDb = null;
var sqliteConnection = null;
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
  const dir = (0, import_path.dirname)(path);
  if (!(0, import_fs.existsSync)(dir)) {
    (0, import_fs.mkdirSync)(dir, { recursive: true });
  }
  sqliteConnection = new import_better_sqlite3.default(path);
  sqliteConnection.pragma("journal_mode = WAL");
  sqliteConnection.exec(createTableStatements);
  sqliteDb = (0, import_better_sqlite32.drizzle)(sqliteConnection, { schema: schema_exports });
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
var import_postgres_js = require("drizzle-orm/postgres-js");
var import_postgres = __toESM(require("postgres"));
var pgDb = null;
var pgConnection = null;
function createPostgresAdapter(connectionString) {
  if (pgDb) {
    return pgDb;
  }
  pgConnection = (0, import_postgres.default)(connectionString, {
    max: 10,
    // Connection pool size
    idle_timeout: 20,
    connect_timeout: 10
  });
  pgDb = (0, import_postgres_js.drizzle)(pgConnection, { schema: schema_exports });
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
  assignWaves: () => assignWaves,
  buildDAGGraph: () => buildDAGGraph,
  computeCriticalPath: () => computeCriticalPath,
  extractAllTaskCodes: () => extractAllTaskCodes,
  extractWaveFromTaskCode: () => extractWaveFromTaskCode,
  findCommonTheme: () => findCommonTheme,
  findTaskByCode: () => findTaskByCode,
  generateWaveLabel: () => generateWaveLabel,
  getTasksInWave: () => getTasksInWave,
  groupBy: () => groupBy,
  normalizeComplexity: () => normalizeComplexity,
  normalizeModel: () => normalizeModel,
  parseDependencies: () => parseDependencies,
  parseFilePaths: () => parseFilePaths,
  parseWavePlanResponse: () => parseWavePlanResponse,
  scorePlan: () => scorePlan,
  sleep: () => sleep,
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
  for (const desc of descLower) {
    const words = desc.split(/\s+/).filter((w) => w.length > 3);
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
var import_sdk = require("@linear/sdk");
var DevPilotLinearClient = class {
  constructor(config) {
    this.client = new import_sdk.LinearClient({ apiKey: config.apiKey });
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
var import_crypto = require("crypto");
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
  const hmac = (0, import_crypto.createHmac)("sha256", secret);
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
    const isValid = (0, import_crypto.timingSafeEqual)(receivedBuffer, expectedBuffer);
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
  OrchestratorClient: () => OrchestratorClient,
  OrchestratorService: () => OrchestratorService,
  StatusPoller: () => StatusPoller,
  buildDispatchRequest: () => buildDispatchRequest,
  createAoCliAdapter: () => createAoCliAdapter,
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
  isStatusPollerInitialized: () => isStatusPollerInitialized
});

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
var import_child_process = require("child_process");
var import_util = require("util");
var execAsync = (0, import_util.promisify)(import_child_process.exec);
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
      const { stdout, stderr } = await execAsync(cmd, {
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
  constructor(config) {
    this.sessionMappings = /* @__PURE__ */ new Map();
    this.eventCallbacks = /* @__PURE__ */ new Set();
    this.config = config;
    this.adapter = this.createAdapter(config);
  }
  /**
   * Create the appropriate adapter based on mode
   */
  createAdapter(config) {
    switch (config.mode) {
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
function initOrchestratorService(config) {
  if (serviceInstance) {
    serviceInstance.shutdown();
  }
  serviceInstance = new OrchestratorService(config);
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

// src/index.ts
var VERSION = "0.1.0";
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
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
  linear,
  modelValues,
  orchestrator,
  orchestratorModeValues,
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
  wavePlanner,
  wavePlans,
  wavePlansRelations,
  waveStatusValues,
  waveTaskStatusValues,
  waveTasks,
  waveTasksRelations,
  waves,
  wavesRelations,
  workstreams,
  workstreamsRelations,
  zoneValues
});
//# sourceMappingURL=index.js.map