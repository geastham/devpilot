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

// src/index.ts
var import_fastify = __toESM(require("fastify"));

// src/config.ts
var import_zod = require("zod");
var envSchema = import_zod.z.object({
  PORT: import_zod.z.string().default("8080"),
  NODE_ENV: import_zod.z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: import_zod.z.string().optional(),
  GCP_PROJECT_ID: import_zod.z.string().optional(),
  PUBSUB_TOPIC_DISPATCH: import_zod.z.string().default("devpilot-task-dispatch")
});
function loadConfig() {
  return envSchema.parse(process.env);
}

// src/db/index.ts
var import_node_postgres = require("drizzle-orm/node-postgres");
var import_pg = require("pg");

// src/db/schema/index.ts
var schema_exports = {};
__export(schema_exports, {
  apiKeys: () => apiKeys,
  dispatchSessions: () => dispatchSessions,
  orchestrators: () => orchestrators,
  repoRoutes: () => repoRoutes,
  sessionEvents: () => sessionEvents,
  teamConfigs: () => teamConfigs,
  workspaces: () => workspaces
});

// src/db/schema/workspaces.ts
var import_pg_core = require("drizzle-orm/pg-core");
var import_cuid2 = require("@paralleldrive/cuid2");
var workspaces = (0, import_pg_core.pgTable)("workspaces", {
  id: (0, import_pg_core.text)("id").primaryKey().$defaultFn(() => (0, import_cuid2.createId)()),
  linearOrgId: (0, import_pg_core.text)("linear_org_id").notNull().unique(),
  linearOrgName: (0, import_pg_core.text)("linear_org_name").notNull(),
  botUserId: (0, import_pg_core.text)("bot_user_id").notNull(),
  webhookSecret: (0, import_pg_core.text)("webhook_secret").notNull(),
  apiKeyEncrypted: (0, import_pg_core.text)("api_key_encrypted"),
  isActive: (0, import_pg_core.boolean)("is_active").notNull().default(true),
  settings: (0, import_pg_core.jsonb)("settings").$type().default({ autoDispatch: true }),
  createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow(),
  updatedAt: (0, import_pg_core.timestamp)("updated_at").notNull().defaultNow()
});
var teamConfigs = (0, import_pg_core.pgTable)("team_configs", {
  id: (0, import_pg_core.text)("id").primaryKey().$defaultFn(() => (0, import_cuid2.createId)()),
  workspaceId: (0, import_pg_core.text)("workspace_id").notNull().references(() => workspaces.id),
  linearTeamId: (0, import_pg_core.text)("linear_team_id").notNull(),
  linearTeamName: (0, import_pg_core.text)("linear_team_name").notNull(),
  autoDispatchEnabled: (0, import_pg_core.boolean)("auto_dispatch_enabled").notNull().default(true),
  defaultRepo: (0, import_pg_core.text)("default_repo"),
  dispatchLabels: (0, import_pg_core.jsonb)("dispatch_labels").$type().default([]),
  excludeLabels: (0, import_pg_core.jsonb)("exclude_labels").$type().default([]),
  createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow(),
  updatedAt: (0, import_pg_core.timestamp)("updated_at").notNull().defaultNow()
});

// src/db/schema/orchestrators.ts
var import_pg_core2 = require("drizzle-orm/pg-core");
var import_cuid22 = require("@paralleldrive/cuid2");
var orchestrators = (0, import_pg_core2.pgTable)("orchestrators", {
  id: (0, import_pg_core2.text)("id").primaryKey().$defaultFn(() => (0, import_cuid22.createId)()),
  name: (0, import_pg_core2.text)("name").notNull(),
  apiKeyHash: (0, import_pg_core2.text)("api_key_hash").notNull(),
  repos: (0, import_pg_core2.jsonb)("repos").$type().notNull().default([]),
  maxConcurrentJobs: (0, import_pg_core2.integer)("max_concurrent_jobs").notNull().default(4),
  activeJobs: (0, import_pg_core2.integer)("active_jobs").notNull().default(0),
  isOnline: (0, import_pg_core2.boolean)("is_online").notNull().default(false),
  lastHeartbeat: (0, import_pg_core2.timestamp)("last_heartbeat"),
  metadata: (0, import_pg_core2.jsonb)("metadata").$type().default({}),
  createdAt: (0, import_pg_core2.timestamp)("created_at").notNull().defaultNow(),
  updatedAt: (0, import_pg_core2.timestamp)("updated_at").notNull().defaultNow()
});
var repoRoutes = (0, import_pg_core2.pgTable)("repo_routes", {
  id: (0, import_pg_core2.text)("id").primaryKey().$defaultFn(() => (0, import_cuid22.createId)()),
  repo: (0, import_pg_core2.text)("repo").notNull().unique(),
  orchestratorId: (0, import_pg_core2.text)("orchestrator_id").notNull().references(() => orchestrators.id),
  priority: (0, import_pg_core2.integer)("priority").notNull().default(0),
  createdAt: (0, import_pg_core2.timestamp)("created_at").notNull().defaultNow()
});
var apiKeys = (0, import_pg_core2.pgTable)("api_keys", {
  id: (0, import_pg_core2.text)("id").primaryKey().$defaultFn(() => (0, import_cuid22.createId)()),
  keyHash: (0, import_pg_core2.text)("key_hash").notNull().unique(),
  orchestratorId: (0, import_pg_core2.text)("orchestrator_id").references(() => orchestrators.id),
  name: (0, import_pg_core2.text)("name").notNull(),
  scopes: (0, import_pg_core2.jsonb)("scopes").$type().default(["dispatch"]),
  expiresAt: (0, import_pg_core2.timestamp)("expires_at"),
  lastUsedAt: (0, import_pg_core2.timestamp)("last_used_at"),
  createdAt: (0, import_pg_core2.timestamp)("created_at").notNull().defaultNow()
});

// src/db/schema/sessions.ts
var import_pg_core3 = require("drizzle-orm/pg-core");
var import_cuid23 = require("@paralleldrive/cuid2");
var dispatchSessions = (0, import_pg_core3.pgTable)("dispatch_sessions", {
  id: (0, import_pg_core3.text)("id").primaryKey().$defaultFn(() => (0, import_cuid23.createId)()),
  workspaceId: (0, import_pg_core3.text)("workspace_id").notNull().references(() => workspaces.id),
  orchestratorId: (0, import_pg_core3.text)("orchestrator_id").references(() => orchestrators.id),
  linearIssueId: (0, import_pg_core3.text)("linear_issue_id").notNull(),
  linearIdentifier: (0, import_pg_core3.text)("linear_identifier").notNull(),
  title: (0, import_pg_core3.text)("title").notNull(),
  repo: (0, import_pg_core3.text)("repo").notNull(),
  status: (0, import_pg_core3.text)("status", {
    enum: ["pending", "dispatched", "running", "complete", "error", "cancelled"]
  }).notNull().default("pending"),
  progressPercent: (0, import_pg_core3.integer)("progress_percent").notNull().default(0),
  prUrl: (0, import_pg_core3.text)("pr_url"),
  tokensUsed: (0, import_pg_core3.integer)("tokens_used"),
  costUsd: (0, import_pg_core3.real)("cost_usd"),
  summary: (0, import_pg_core3.text)("summary"),
  errorMessage: (0, import_pg_core3.text)("error_message"),
  metadata: (0, import_pg_core3.jsonb)("metadata").$type().default({}),
  dispatchedAt: (0, import_pg_core3.timestamp)("dispatched_at"),
  completedAt: (0, import_pg_core3.timestamp)("completed_at"),
  createdAt: (0, import_pg_core3.timestamp)("created_at").notNull().defaultNow(),
  updatedAt: (0, import_pg_core3.timestamp)("updated_at").notNull().defaultNow()
});
var sessionEvents = (0, import_pg_core3.pgTable)("session_events", {
  id: (0, import_pg_core3.text)("id").primaryKey().$defaultFn(() => (0, import_cuid23.createId)()),
  sessionId: (0, import_pg_core3.text)("session_id").notNull().references(() => dispatchSessions.id),
  type: (0, import_pg_core3.text)("type", {
    enum: ["created", "dispatched", "progress", "complete", "error", "cancelled"]
  }).notNull(),
  message: (0, import_pg_core3.text)("message"),
  metadata: (0, import_pg_core3.jsonb)("metadata").$type().default({}),
  createdAt: (0, import_pg_core3.timestamp)("created_at").notNull().defaultNow()
});

// src/db/index.ts
var db = null;
function initBridgeDatabase(connectionString) {
  const pool = new import_pg.Pool({ connectionString });
  db = (0, import_node_postgres.drizzle)(pool, { schema: schema_exports });
  return db;
}
function getBridgeDb() {
  if (!db) {
    throw new Error("Bridge database not initialized. Call initBridgeDatabase first.");
  }
  return db;
}

// src/api/webhooks/linear.ts
var import_crypto = require("crypto");
var import_drizzle_orm = require("drizzle-orm");
function verifySignature(payload, signature, secret) {
  if (!signature.startsWith("sha256=")) {
    return false;
  }
  const hash = signature.slice(7);
  const expected = (0, import_crypto.createHmac)("sha256", secret).update(payload).digest("hex");
  try {
    return (0, import_crypto.timingSafeEqual)(Buffer.from(hash, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
async function registerWebhookRoutes(app) {
  app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
    try {
      const json = JSON.parse(body);
      req.rawBody = body;
      done(null, json);
    } catch (err) {
      done(err, void 0);
    }
  });
  app.post("/api/webhooks/linear", async (request, reply) => {
    const payload = request.body;
    const rawBody = request.rawBody;
    const signature = request.headers["linear-signature"];
    if (!payload.organizationId) {
      return reply.status(400).send({ error: "Missing organizationId" });
    }
    const db2 = getBridgeDb();
    const workspace = await db2.query.workspaces.findFirst({
      where: (0, import_drizzle_orm.eq)(workspaces.linearOrgId, payload.organizationId)
    });
    if (!workspace) {
      return reply.status(404).send({ error: "Workspace not found" });
    }
    if (signature && workspace.webhookSecret) {
      const isValid = verifySignature(rawBody, signature, workspace.webhookSecret);
      if (!isValid) {
        return reply.status(401).send({ error: "Invalid signature" });
      }
    }
    if (payload.action === "update" && payload.type === "Issue" && payload.data.assigneeId === workspace.botUserId) {
      const teamConfig = await db2.query.teamConfigs.findFirst({
        where: (0, import_drizzle_orm.and)(
          (0, import_drizzle_orm.eq)(teamConfigs.workspaceId, workspace.id),
          (0, import_drizzle_orm.eq)(teamConfigs.linearTeamId, payload.data.teamId || "")
        )
      });
      if (teamConfig?.autoDispatchEnabled !== false) {
        const [session] = await db2.insert(dispatchSessions).values({
          workspaceId: workspace.id,
          linearIssueId: payload.data.id,
          linearIdentifier: payload.data.identifier || payload.data.id,
          title: payload.data.title || "Untitled",
          repo: teamConfig?.defaultRepo || "unknown",
          status: "pending"
        }).returning();
        await db2.insert(sessionEvents).values({
          sessionId: session.id,
          type: "created",
          message: `Issue ${payload.data.identifier} assigned to DevPilot bot`,
          metadata: {
            linearIssueId: payload.data.id,
            teamId: payload.data.teamId
          }
        });
        return {
          handled: true,
          action: "dispatch_created",
          sessionId: session.id
        };
      }
    }
    return { handled: true, action: "ignored" };
  });
}

// src/api/orchestrators/routes.ts
var import_crypto2 = require("crypto");
var import_drizzle_orm2 = require("drizzle-orm");
function hashApiKey(key) {
  return (0, import_crypto2.createHash)("sha256").update(key).digest("hex");
}
function generateApiKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "dp_orch_" + Buffer.from(bytes).toString("base64url");
}
async function registerOrchestratorRoutes(app) {
  const db2 = getBridgeDb();
  app.post("/api/orchestrators/register", async (request, reply) => {
    const body = request.body;
    if (!body.name || !body.repos || body.repos.length === 0) {
      return reply.status(400).send({ error: "name and repos are required" });
    }
    const apiKey = generateApiKey();
    const keyHash = hashApiKey(apiKey);
    const [orchestrator] = await db2.insert(orchestrators).values({
      name: body.name,
      apiKeyHash: keyHash,
      repos: body.repos,
      maxConcurrentJobs: body.maxConcurrentJobs || 4,
      isOnline: true,
      lastHeartbeat: /* @__PURE__ */ new Date()
    }).returning();
    for (const repo of body.repos) {
      await db2.insert(repoRoutes).values({
        repo,
        orchestratorId: orchestrator.id,
        priority: 0
      }).onConflictDoUpdate({
        target: repoRoutes.repo,
        set: { orchestratorId: orchestrator.id }
      });
    }
    await db2.insert(apiKeys).values({
      keyHash,
      orchestratorId: orchestrator.id,
      name: `${body.name} API Key`,
      scopes: ["dispatch", "status", "heartbeat"]
    });
    return {
      orchestratorId: orchestrator.id,
      apiKey,
      message: "Orchestrator registered successfully"
    };
  });
  app.post("/api/orchestrators/:id/heartbeat", async (request, reply) => {
    const { id } = request.params;
    const body = request.body || {};
    const [updated] = await db2.update(orchestrators).set({
      isOnline: true,
      lastHeartbeat: /* @__PURE__ */ new Date(),
      activeJobs: body.activeJobs ?? void 0,
      updatedAt: /* @__PURE__ */ new Date()
    }).where((0, import_drizzle_orm2.eq)(orchestrators.id, id)).returning();
    if (!updated) {
      return reply.status(404).send({ error: "Orchestrator not found" });
    }
    return { status: "ok", lastHeartbeat: updated.lastHeartbeat };
  });
  app.get("/api/orchestrators/:id", async (request, reply) => {
    const { id } = request.params;
    const orchestrator = await db2.query.orchestrators.findFirst({
      where: (0, import_drizzle_orm2.eq)(orchestrators.id, id)
    });
    if (!orchestrator) {
      return reply.status(404).send({ error: "Orchestrator not found" });
    }
    const { apiKeyHash, ...safe } = orchestrator;
    return safe;
  });
  app.delete("/api/orchestrators/:id", async (request, reply) => {
    const { id } = request.params;
    await db2.delete(repoRoutes).where((0, import_drizzle_orm2.eq)(repoRoutes.orchestratorId, id));
    await db2.delete(apiKeys).where((0, import_drizzle_orm2.eq)(apiKeys.orchestratorId, id));
    await db2.delete(orchestrators).where((0, import_drizzle_orm2.eq)(orchestrators.id, id));
    return { status: "deleted" };
  });
}

// src/api/sessions/routes.ts
var import_drizzle_orm3 = require("drizzle-orm");
async function registerSessionRoutes(app) {
  const db2 = getBridgeDb();
  app.post("/api/sessions/:id/status", async (request, reply) => {
    const { id } = request.params;
    const body = request.body;
    const [updated] = await db2.update(dispatchSessions).set({
      status: body.status,
      progressPercent: body.progressPercent,
      updatedAt: /* @__PURE__ */ new Date()
    }).where((0, import_drizzle_orm3.eq)(dispatchSessions.id, id)).returning();
    if (!updated) {
      return reply.status(404).send({ error: "Session not found" });
    }
    await db2.insert(sessionEvents).values({
      sessionId: id,
      type: "progress",
      message: body.message || `Progress: ${body.progressPercent}%`,
      metadata: { status: body.status, progressPercent: body.progressPercent }
    });
    return { status: "updated", session: updated };
  });
  app.post("/api/sessions/:id/complete", async (request, reply) => {
    const { id } = request.params;
    const body = request.body;
    const [updated] = await db2.update(dispatchSessions).set({
      status: body.success ? "complete" : "error",
      progressPercent: 100,
      prUrl: body.prUrl,
      summary: body.summary,
      tokensUsed: body.tokensUsed,
      costUsd: body.costUsd,
      errorMessage: body.errorMessage,
      completedAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    }).where((0, import_drizzle_orm3.eq)(dispatchSessions.id, id)).returning();
    if (!updated) {
      return reply.status(404).send({ error: "Session not found" });
    }
    await db2.insert(sessionEvents).values({
      sessionId: id,
      type: body.success ? "complete" : "error",
      message: body.success ? body.summary : body.errorMessage,
      metadata: {
        prUrl: body.prUrl,
        tokensUsed: body.tokensUsed,
        costUsd: body.costUsd
      }
    });
    return { status: "completed", session: updated };
  });
  app.get("/api/sessions/:id", async (request, reply) => {
    const { id } = request.params;
    const session = await db2.query.dispatchSessions.findFirst({
      where: (0, import_drizzle_orm3.eq)(dispatchSessions.id, id)
    });
    if (!session) {
      return reply.status(404).send({ error: "Session not found" });
    }
    return session;
  });
}

// src/services/pubsub/service.ts
var import_pubsub = require("@google-cloud/pubsub");
var PubSubService = class {
  constructor(config) {
    this.config = config;
    this.pubsub = new import_pubsub.PubSub({ projectId: config.projectId });
    this.dispatchTopic = this.pubsub.topic(config.dispatchTopicName);
    this.telemetryTopic = this.pubsub.topic(config.telemetryTopicName);
  }
  async publishTaskDispatch(message) {
    const data = Buffer.from(JSON.stringify(message));
    const messageId = await this.dispatchTopic.publishMessage({
      data,
      attributes: {
        type: "task_dispatch",
        workspaceId: message.workspaceId,
        repo: message.repo
      }
    });
    return messageId;
  }
  async publishTelemetry(event) {
    const data = Buffer.from(JSON.stringify(event));
    const messageId = await this.telemetryTopic.publishMessage({
      data,
      attributes: {
        type: event.eventType,
        workspaceId: event.workspaceId || ""
      }
    });
    return messageId;
  }
  async ensureTopicsExist() {
    const [dispatchExists] = await this.dispatchTopic.exists();
    if (!dispatchExists) {
      await this.pubsub.createTopic(this.config.dispatchTopicName);
    }
    const [telemetryExists] = await this.telemetryTopic.exists();
    if (!telemetryExists) {
      await this.pubsub.createTopic(this.config.telemetryTopicName);
    }
  }
};
var pubsubService = null;
function initPubSubService(config) {
  pubsubService = new PubSubService(config);
  return pubsubService;
}

// src/index.ts
async function start() {
  const config = loadConfig();
  const app = (0, import_fastify.default)({ logger: true });
  if (process.env.DATABASE_URL) {
    initBridgeDatabase(process.env.DATABASE_URL);
    app.log.info("Database initialized");
  }
  if (config.GCP_PROJECT_ID) {
    initPubSubService({
      projectId: config.GCP_PROJECT_ID,
      dispatchTopicName: config.PUBSUB_TOPIC_DISPATCH,
      telemetryTopicName: "devpilot-telemetry"
    });
    app.log.info("Pub/Sub service initialized");
  }
  app.get("/health", async () => ({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() }));
  await registerWebhookRoutes(app);
  await registerOrchestratorRoutes(app);
  await registerSessionRoutes(app);
  const port = parseInt(config.PORT, 10);
  await app.listen({ port, host: "0.0.0.0" });
  app.log.info(`Bridge service listening on port ${port}`);
}
start().catch((err) => {
  console.error("Failed to start bridge service:", err);
  process.exit(1);
});
//# sourceMappingURL=index.js.map