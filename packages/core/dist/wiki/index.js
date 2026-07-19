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
var __copyProps = (to, from, except, desc2) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc2 = __getOwnPropDesc(from, key)) || desc2.enumerable });
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
module.exports = __toCommonJS(wiki_exports);

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
var import_sdk = __toESM(require("@anthropic-ai/sdk"));
var import_crypto = require("crypto");

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

// src/db/schema/wiki.ts
var import_sqlite_core6 = require("drizzle-orm/sqlite-core");
var import_drizzle_orm5 = require("drizzle-orm");
var import_cuid26 = require("@paralleldrive/cuid2");
var wikiSources = (0, import_sqlite_core6.sqliteTable)("wiki_sources", {
  id: (0, import_sqlite_core6.text)("id").primaryKey().$defaultFn(() => (0, import_cuid26.createId)()),
  /** Source type: session_log, commit, spec, decision, manual */
  sourceType: (0, import_sqlite_core6.text)("source_type", { enum: wikiSourceTypeValues }).notNull(),
  /** Human-readable title */
  title: (0, import_sqlite_core6.text)("title").notNull(),
  /** Raw content of the source material */
  content: (0, import_sqlite_core6.text)("content").notNull(),
  /** Origin identifier (e.g. session ID, commit SHA, file path) */
  origin: (0, import_sqlite_core6.text)("origin"),
  /** Repository this source belongs to */
  repo: (0, import_sqlite_core6.text)("repo"),
  /** Hash of content for deduplication */
  contentHash: (0, import_sqlite_core6.text)("content_hash").notNull(),
  createdAt: (0, import_sqlite_core6.integer)("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var wikiArticles = (0, import_sqlite_core6.sqliteTable)("wiki_articles", {
  id: (0, import_sqlite_core6.text)("id").primaryKey().$defaultFn(() => (0, import_cuid26.createId)()),
  /** URL-safe slug for the article (e.g. "authentication-flow") */
  slug: (0, import_sqlite_core6.text)("slug").notNull().unique(),
  /** Article title */
  title: (0, import_sqlite_core6.text)("title").notNull(),
  /** Category for organization (e.g. "architecture", "patterns", "decisions") */
  category: (0, import_sqlite_core6.text)("category").notNull(),
  /** Compiled markdown content with backlinks */
  content: (0, import_sqlite_core6.text)("content").notNull(),
  /** Status: active, stale, archived */
  status: (0, import_sqlite_core6.text)("status", { enum: wikiArticleStatusValues }).notNull().default("active"),
  /** Backlinks — slugs of related articles */
  backlinks: (0, import_sqlite_core6.text)("backlinks", { mode: "json" }).$type().default([]),
  /** Source IDs that contributed to this article */
  sourceIds: (0, import_sqlite_core6.text)("source_ids", { mode: "json" }).$type().default([]),
  /** Repository this article belongs to */
  repo: (0, import_sqlite_core6.text)("repo"),
  /** Version counter — incremented on each recompile */
  version: (0, import_sqlite_core6.integer)("version").notNull().default(1),
  createdAt: (0, import_sqlite_core6.integer)("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  updatedAt: (0, import_sqlite_core6.integer)("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var wikiLog = (0, import_sqlite_core6.sqliteTable)("wiki_log", {
  id: (0, import_sqlite_core6.text)("id").primaryKey().$defaultFn(() => (0, import_cuid26.createId)()),
  /** Action type: ingest, compile, query, lint, update */
  action: (0, import_sqlite_core6.text)("action", { enum: wikiLogActionValues }).notNull(),
  /** Summary of what happened */
  summary: (0, import_sqlite_core6.text)("summary").notNull(),
  /** IDs of articles affected */
  articleIds: (0, import_sqlite_core6.text)("article_ids", { mode: "json" }).$type().default([]),
  /** IDs of sources involved */
  sourceIds: (0, import_sqlite_core6.text)("source_ids", { mode: "json" }).$type().default([]),
  /** Repository context */
  repo: (0, import_sqlite_core6.text)("repo"),
  /** Token usage for this operation */
  tokensUsed: (0, import_sqlite_core6.integer)("tokens_used"),
  createdAt: (0, import_sqlite_core6.integer)("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var wikiSourcesRelations = (0, import_drizzle_orm5.relations)(wikiSources, ({ many }) => ({}));
var wikiArticlesRelations = (0, import_drizzle_orm5.relations)(wikiArticles, ({ many }) => ({}));
var wikiLogRelations = (0, import_drizzle_orm5.relations)(wikiLog, ({ many }) => ({}));

// src/db/schema/mempalace.ts
var import_sqlite_core7 = require("drizzle-orm/sqlite-core");
var import_drizzle_orm6 = require("drizzle-orm");
var import_cuid27 = require("@paralleldrive/cuid2");
var palaceWings = (0, import_sqlite_core7.sqliteTable)("palace_wings", {
  id: (0, import_sqlite_core7.text)("id").primaryKey().$defaultFn(() => (0, import_cuid27.createId)()),
  /** Wing slug, e.g. "devpilot-core" or "persona-architect" */
  slug: (0, import_sqlite_core7.text)("slug").notNull().unique(),
  /** Human-readable wing name */
  name: (0, import_sqlite_core7.text)("name").notNull(),
  /** Wing type: project | persona | scratch */
  wingType: (0, import_sqlite_core7.text)("wing_type").notNull().default("project"),
  /** Repository this wing is bound to, if any */
  repo: (0, import_sqlite_core7.text)("repo"),
  /** Free-form description */
  description: (0, import_sqlite_core7.text)("description"),
  createdAt: (0, import_sqlite_core7.integer)("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  updatedAt: (0, import_sqlite_core7.integer)("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var palaceRooms = (0, import_sqlite_core7.sqliteTable)(
  "palace_rooms",
  {
    id: (0, import_sqlite_core7.text)("id").primaryKey().$defaultFn(() => (0, import_cuid27.createId)()),
    wingId: (0, import_sqlite_core7.text)("wing_id").notNull().references(() => palaceWings.id, { onDelete: "cascade" }),
    /** Room slug, unique within a wing, e.g. "auth-flow" */
    slug: (0, import_sqlite_core7.text)("slug").notNull(),
    /** Human-readable room name */
    name: (0, import_sqlite_core7.text)("name").notNull(),
    /** Topic label for routing retrieval */
    topic: (0, import_sqlite_core7.text)("topic").notNull(),
    /** Free-form description of what belongs in this room */
    description: (0, import_sqlite_core7.text)("description"),
    createdAt: (0, import_sqlite_core7.integer)("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
    updatedAt: (0, import_sqlite_core7.integer)("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
  },
  (table) => ({
    wingSlugIdx: (0, import_sqlite_core7.index)("palace_rooms_wing_slug_idx").on(table.wingId, table.slug)
  })
);
var palaceDrawers = (0, import_sqlite_core7.sqliteTable)(
  "palace_drawers",
  {
    id: (0, import_sqlite_core7.text)("id").primaryKey().$defaultFn(() => (0, import_cuid27.createId)()),
    roomId: (0, import_sqlite_core7.text)("room_id").notNull().references(() => palaceRooms.id, { onDelete: "cascade" }),
    /** Memory type: fact | event | discovery | preference | advice | decision */
    memoryType: (0, import_sqlite_core7.text)("memory_type").notNull().default("fact"),
    /** Short label for the drawer */
    label: (0, import_sqlite_core7.text)("label").notNull(),
    /** Verbatim content — never summarized */
    content: (0, import_sqlite_core7.text)("content").notNull(),
    /** Optional AAAK-compressed form (populated when the MCP server is used) */
    aaakContent: (0, import_sqlite_core7.text)("aaak_content"),
    /** SHA256 of content for deduplication */
    contentHash: (0, import_sqlite_core7.text)("content_hash").notNull(),
    /** Source provenance — e.g. wiki article slug, session id, commit sha */
    sourceKind: (0, import_sqlite_core7.text)("source_kind"),
    sourceRef: (0, import_sqlite_core7.text)("source_ref"),
    /** Free-form tags for filtering */
    tags: (0, import_sqlite_core7.text)("tags", { mode: "json" }).$type().default([]),
    /** Rough salience score 0-1 controlling L0/L1 eligibility */
    salience: (0, import_sqlite_core7.integer)("salience").notNull().default(0),
    createdAt: (0, import_sqlite_core7.integer)("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
  },
  (table) => ({
    hashIdx: (0, import_sqlite_core7.index)("palace_drawers_hash_idx").on(table.contentHash),
    roomIdx: (0, import_sqlite_core7.index)("palace_drawers_room_idx").on(table.roomId)
  })
);
var palaceClosets = (0, import_sqlite_core7.sqliteTable)(
  "palace_closets",
  {
    id: (0, import_sqlite_core7.text)("id").primaryKey().$defaultFn(() => (0, import_cuid27.createId)()),
    roomId: (0, import_sqlite_core7.text)("room_id").notNull().references(() => palaceRooms.id, { onDelete: "cascade" }),
    /** Compressed summary (AAAK-dialect or plain) */
    summary: (0, import_sqlite_core7.text)("summary").notNull(),
    /** Which drawers this closet summarizes */
    drawerIds: (0, import_sqlite_core7.text)("drawer_ids", { mode: "json" }).$type().default([]),
    /** Tier — 0 (identity), 1 (critical), 2 (room), 3 (deep) */
    tier: (0, import_sqlite_core7.integer)("tier").notNull().default(2),
    /** Approximate token cost when injected */
    tokenCost: (0, import_sqlite_core7.integer)("token_cost").notNull().default(0),
    createdAt: (0, import_sqlite_core7.integer)("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
    updatedAt: (0, import_sqlite_core7.integer)("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
  },
  (table) => ({
    tierIdx: (0, import_sqlite_core7.index)("palace_closets_tier_idx").on(table.tier)
  })
);
var palaceHalls = (0, import_sqlite_core7.sqliteTable)("palace_halls", {
  id: (0, import_sqlite_core7.text)("id").primaryKey().$defaultFn(() => (0, import_cuid27.createId)()),
  wingId: (0, import_sqlite_core7.text)("wing_id").notNull().references(() => palaceWings.id, { onDelete: "cascade" }),
  fromRoomId: (0, import_sqlite_core7.text)("from_room_id").notNull().references(() => palaceRooms.id, { onDelete: "cascade" }),
  toRoomId: (0, import_sqlite_core7.text)("to_room_id").notNull().references(() => palaceRooms.id, { onDelete: "cascade" }),
  /** Relationship type: depends_on | related_to | supersedes | contradicts */
  relation: (0, import_sqlite_core7.text)("relation").notNull().default("related_to"),
  weight: (0, import_sqlite_core7.integer)("weight").notNull().default(1),
  createdAt: (0, import_sqlite_core7.integer)("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var palaceTunnels = (0, import_sqlite_core7.sqliteTable)("palace_tunnels", {
  id: (0, import_sqlite_core7.text)("id").primaryKey().$defaultFn(() => (0, import_cuid27.createId)()),
  fromRoomId: (0, import_sqlite_core7.text)("from_room_id").notNull().references(() => palaceRooms.id, { onDelete: "cascade" }),
  toRoomId: (0, import_sqlite_core7.text)("to_room_id").notNull().references(() => palaceRooms.id, { onDelete: "cascade" }),
  reason: (0, import_sqlite_core7.text)("reason"),
  createdAt: (0, import_sqlite_core7.integer)("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var palaceKgTriples = (0, import_sqlite_core7.sqliteTable)(
  "palace_kg_triples",
  {
    id: (0, import_sqlite_core7.text)("id").primaryKey().$defaultFn(() => (0, import_cuid27.createId)()),
    wingId: (0, import_sqlite_core7.text)("wing_id").notNull().references(() => palaceWings.id, { onDelete: "cascade" }),
    subject: (0, import_sqlite_core7.text)("subject").notNull(),
    predicate: (0, import_sqlite_core7.text)("predicate").notNull(),
    object: (0, import_sqlite_core7.text)("object").notNull(),
    /** Validity window start — when this fact became true */
    validFrom: (0, import_sqlite_core7.integer)("valid_from", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
    /** Validity window end — null if still valid */
    validUntil: (0, import_sqlite_core7.integer)("valid_until", { mode: "timestamp" }),
    /** Source drawer that asserted this fact */
    sourceDrawerId: (0, import_sqlite_core7.text)("source_drawer_id"),
    /** Confidence 0-100 */
    confidence: (0, import_sqlite_core7.integer)("confidence").notNull().default(100),
    createdAt: (0, import_sqlite_core7.integer)("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
  },
  (table) => ({
    spIdx: (0, import_sqlite_core7.index)("palace_kg_sp_idx").on(table.subject, table.predicate),
    wingIdx: (0, import_sqlite_core7.index)("palace_kg_wing_idx").on(table.wingId)
  })
);
var palaceDiary = (0, import_sqlite_core7.sqliteTable)("palace_diary", {
  id: (0, import_sqlite_core7.text)("id").primaryKey().$defaultFn(() => (0, import_cuid27.createId)()),
  wingId: (0, import_sqlite_core7.text)("wing_id").notNull().references(() => palaceWings.id, { onDelete: "cascade" }),
  agentId: (0, import_sqlite_core7.text)("agent_id").notNull(),
  entry: (0, import_sqlite_core7.text)("entry").notNull(),
  createdAt: (0, import_sqlite_core7.integer)("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
var palaceWingsRelations = (0, import_drizzle_orm6.relations)(palaceWings, ({ many }) => ({
  rooms: many(palaceRooms),
  halls: many(palaceHalls),
  kgTriples: many(palaceKgTriples)
}));
var palaceRoomsRelations = (0, import_drizzle_orm6.relations)(palaceRooms, ({ one, many }) => ({
  wing: one(palaceWings, {
    fields: [palaceRooms.wingId],
    references: [palaceWings.id]
  }),
  drawers: many(palaceDrawers),
  closets: many(palaceClosets)
}));
var palaceDrawersRelations = (0, import_drizzle_orm6.relations)(palaceDrawers, ({ one }) => ({
  room: one(palaceRooms, {
    fields: [palaceDrawers.roomId],
    references: [palaceRooms.id]
  })
}));
var palaceClosetsRelations = (0, import_drizzle_orm6.relations)(palaceClosets, ({ one }) => ({
  room: one(palaceRooms, {
    fields: [palaceClosets.roomId],
    references: [palaceRooms.id]
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

// src/db/client.ts
var db = null;
function getDatabase() {
  if (!db) {
    const config = getDatabaseConfig();
    db = createDatabase(config);
  }
  return db;
}

// src/wiki/compiler.ts
var import_drizzle_orm7 = require("drizzle-orm");
var WikiCompiler = class {
  constructor(config) {
    this.config = config;
    this.client = new import_sdk.default({
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
    const contentHash = (0, import_crypto.createHash)("sha256").update(content).digest("hex");
    const existing = await db2.select().from(wikiSources).where((0, import_drizzle_orm7.eq)(wikiSources.contentHash, contentHash)).limit(1);
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
      const existingArticle = await db2.select().from(wikiArticles).where((0, import_drizzle_orm7.eq)(wikiArticles.slug, article.slug)).limit(1);
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
        }).where((0, import_drizzle_orm7.eq)(wikiArticles.slug, article.slug));
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
    const allArticles = await db2.select().from(wikiArticles).where((0, import_drizzle_orm7.eq)(wikiArticles.status, "active"));
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
      const existingArticle = await db2.select().from(wikiArticles).where((0, import_drizzle_orm7.eq)(wikiArticles.slug, newArticle.slug)).limit(1);
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
        await db2.update(wikiArticles).set({ status: "stale", updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm7.eq)(wikiArticles.slug, finding.articleSlug));
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
    const logs = await db2.select().from(wikiLog).orderBy((0, import_drizzle_orm7.desc)(wikiLog.createdAt)).limit(1);
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
    const results = await db2.select().from(wikiArticles).where((0, import_drizzle_orm7.eq)(wikiArticles.slug, slug)).limit(1);
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
    const fs = await import("fs");
    const path = await import("path");
    const wikiDir = this.config.wikiDir;
    const articles = await this.getIndex();
    const db2 = getDatabase();
    if (!fs.existsSync(wikiDir)) {
      fs.mkdirSync(wikiDir, { recursive: true });
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
    fs.writeFileSync(path.join(wikiDir, "index.md"), indexContent);
    filesWritten++;
    for (const [category, catArticles] of Object.entries(byCategory)) {
      const categoryDir = path.join(wikiDir, category);
      if (!fs.existsSync(categoryDir)) {
        fs.mkdirSync(categoryDir, { recursive: true });
      }
      for (const entry of catArticles) {
        const fullArticle = await db2.select().from(wikiArticles).where((0, import_drizzle_orm7.eq)(wikiArticles.slug, entry.slug)).limit(1);
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
          fs.writeFileSync(
            path.join(categoryDir, `${a.slug}.md`),
            fileContent
          );
          filesWritten++;
        }
      }
    }
    const recentLogs = await db2.select().from(wikiLog).orderBy((0, import_drizzle_orm7.desc)(wikiLog.createdAt)).limit(50);
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
      fs.writeFileSync(path.join(wikiDir, "log.md"), logContent);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  WIKI_COMPILER_SYSTEM,
  WikiCompiler,
  WikiSessionHook,
  buildIngestPrompt,
  buildLintPrompt,
  buildQueryPrompt,
  buildSessionExtractPrompt,
  buildUpdatePrompt,
  createWikiCompiler
});
//# sourceMappingURL=index.js.map