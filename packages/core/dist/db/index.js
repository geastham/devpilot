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

// src/db/index.ts
var db_exports = {};
__export(db_exports, {
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
  eventTypeValues: () => eventTypeValues,
  fileStatusValues: () => fileStatusValues,
  getDatabase: () => getDatabase,
  getDatabaseConfig: () => getDatabaseConfig,
  horizonItems: () => horizonItems,
  horizonItemsRelations: () => horizonItemsRelations,
  inFlightFiles: () => inFlightFiles,
  inFlightFilesRelations: () => inFlightFilesRelations,
  initDatabase: () => initDatabase,
  modelValues: () => modelValues,
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
  workstreams: () => workstreams,
  workstreamsRelations: () => workstreamsRelations,
  zoneValues: () => zoneValues
});
module.exports = __toCommonJS(db_exports);

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
  eventTypeValues: () => eventTypeValues,
  fileStatusValues: () => fileStatusValues,
  horizonItems: () => horizonItems,
  horizonItemsRelations: () => horizonItemsRelations,
  inFlightFiles: () => inFlightFiles,
  inFlightFilesRelations: () => inFlightFilesRelations,
  modelValues: () => modelValues,
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
  "SCORE_UPDATE"
];

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
  type TEXT NOT NULL CHECK(type IN ('SESSION_PROGRESS', 'SESSION_COMPLETE', 'PLAN_GENERATED', 'PLAN_APPROVED', 'ITEM_CREATED', 'ITEM_DISPATCHED', 'RUNWAY_UPDATE', 'FILE_UNLOCKED', 'SCORE_UPDATE')),
  message TEXT NOT NULL,
  repo TEXT,
  ticket_id TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_horizon_items_zone ON horizon_items(zone);
CREATE INDEX IF NOT EXISTS idx_horizon_items_repo ON horizon_items(repo);
CREATE INDEX IF NOT EXISTS idx_ruflo_sessions_status ON ruflo_sessions(status);
CREATE INDEX IF NOT EXISTS idx_ruflo_sessions_repo ON ruflo_sessions(repo);
CREATE INDEX IF NOT EXISTS idx_activity_events_type ON activity_events(type);
CREATE INDEX IF NOT EXISTS idx_activity_events_created_at ON activity_events(created_at);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
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
  eventTypeValues,
  fileStatusValues,
  getDatabase,
  getDatabaseConfig,
  horizonItems,
  horizonItemsRelations,
  inFlightFiles,
  inFlightFilesRelations,
  initDatabase,
  modelValues,
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
  workstreams,
  workstreamsRelations,
  zoneValues
});
//# sourceMappingURL=index.js.map