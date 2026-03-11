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
var orchestratorModeValues = ["http", "ao-cli", "manual", "disabled"];

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

// src/db/adapters/sqlite.ts
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";
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
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  sqliteConnection = new Database(path);
  sqliteConnection.pragma("journal_mode = WAL");
  sqliteConnection.exec(createTableStatements);
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
import { exec } from "child_process";
import { promisify } from "util";
var execAsync = promisify(exec);
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
  modelValues,
  orchestrator_exports as orchestrator,
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
  workstreams,
  workstreamsRelations,
  zoneValues
};
//# sourceMappingURL=index.mjs.map