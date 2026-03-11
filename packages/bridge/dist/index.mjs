var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/index.ts
import Fastify from "fastify";

// src/config.ts
import { z } from "zod";
var envSchema = z.object({
  PORT: z.string().default("8080"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().optional(),
  GCP_PROJECT_ID: z.string().optional(),
  PUBSUB_TOPIC_DISPATCH: z.string().default("devpilot-task-dispatch")
});
function loadConfig() {
  return envSchema.parse(process.env);
}

// src/db/index.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

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
import { pgTable, text, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
var workspaces = pgTable("workspaces", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  linearOrgId: text("linear_org_id").notNull().unique(),
  linearOrgName: text("linear_org_name").notNull(),
  botUserId: text("bot_user_id").notNull(),
  webhookSecret: text("webhook_secret").notNull(),
  apiKeyEncrypted: text("api_key_encrypted"),
  isActive: boolean("is_active").notNull().default(true),
  settings: jsonb("settings").$type().default({ autoDispatch: true }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});
var teamConfigs = pgTable("team_configs", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  linearTeamId: text("linear_team_id").notNull(),
  linearTeamName: text("linear_team_name").notNull(),
  autoDispatchEnabled: boolean("auto_dispatch_enabled").notNull().default(true),
  defaultRepo: text("default_repo"),
  dispatchLabels: jsonb("dispatch_labels").$type().default([]),
  excludeLabels: jsonb("exclude_labels").$type().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

// src/db/schema/orchestrators.ts
import { pgTable as pgTable2, text as text2, timestamp as timestamp2, integer, jsonb as jsonb2, boolean as boolean2 } from "drizzle-orm/pg-core";
import { createId as createId2 } from "@paralleldrive/cuid2";
var orchestrators = pgTable2("orchestrators", {
  id: text2("id").primaryKey().$defaultFn(() => createId2()),
  name: text2("name").notNull(),
  apiKeyHash: text2("api_key_hash").notNull(),
  repos: jsonb2("repos").$type().notNull().default([]),
  maxConcurrentJobs: integer("max_concurrent_jobs").notNull().default(4),
  activeJobs: integer("active_jobs").notNull().default(0),
  isOnline: boolean2("is_online").notNull().default(false),
  lastHeartbeat: timestamp2("last_heartbeat"),
  metadata: jsonb2("metadata").$type().default({}),
  createdAt: timestamp2("created_at").notNull().defaultNow(),
  updatedAt: timestamp2("updated_at").notNull().defaultNow()
});
var repoRoutes = pgTable2("repo_routes", {
  id: text2("id").primaryKey().$defaultFn(() => createId2()),
  repo: text2("repo").notNull().unique(),
  orchestratorId: text2("orchestrator_id").notNull().references(() => orchestrators.id),
  priority: integer("priority").notNull().default(0),
  createdAt: timestamp2("created_at").notNull().defaultNow()
});
var apiKeys = pgTable2("api_keys", {
  id: text2("id").primaryKey().$defaultFn(() => createId2()),
  keyHash: text2("key_hash").notNull().unique(),
  orchestratorId: text2("orchestrator_id").references(() => orchestrators.id),
  name: text2("name").notNull(),
  scopes: jsonb2("scopes").$type().default(["dispatch"]),
  expiresAt: timestamp2("expires_at"),
  lastUsedAt: timestamp2("last_used_at"),
  createdAt: timestamp2("created_at").notNull().defaultNow()
});

// src/db/schema/sessions.ts
import { pgTable as pgTable3, text as text3, timestamp as timestamp3, integer as integer2, jsonb as jsonb3, real } from "drizzle-orm/pg-core";
import { createId as createId3 } from "@paralleldrive/cuid2";
var dispatchSessions = pgTable3("dispatch_sessions", {
  id: text3("id").primaryKey().$defaultFn(() => createId3()),
  workspaceId: text3("workspace_id").notNull().references(() => workspaces.id),
  orchestratorId: text3("orchestrator_id").references(() => orchestrators.id),
  linearIssueId: text3("linear_issue_id").notNull(),
  linearIdentifier: text3("linear_identifier").notNull(),
  title: text3("title").notNull(),
  repo: text3("repo").notNull(),
  status: text3("status", {
    enum: ["pending", "dispatched", "running", "complete", "error", "cancelled"]
  }).notNull().default("pending"),
  progressPercent: integer2("progress_percent").notNull().default(0),
  prUrl: text3("pr_url"),
  tokensUsed: integer2("tokens_used"),
  costUsd: real("cost_usd"),
  summary: text3("summary"),
  errorMessage: text3("error_message"),
  metadata: jsonb3("metadata").$type().default({}),
  dispatchedAt: timestamp3("dispatched_at"),
  completedAt: timestamp3("completed_at"),
  createdAt: timestamp3("created_at").notNull().defaultNow(),
  updatedAt: timestamp3("updated_at").notNull().defaultNow()
});
var sessionEvents = pgTable3("session_events", {
  id: text3("id").primaryKey().$defaultFn(() => createId3()),
  sessionId: text3("session_id").notNull().references(() => dispatchSessions.id),
  type: text3("type", {
    enum: ["created", "dispatched", "progress", "complete", "error", "cancelled"]
  }).notNull(),
  message: text3("message"),
  metadata: jsonb3("metadata").$type().default({}),
  createdAt: timestamp3("created_at").notNull().defaultNow()
});

// src/db/index.ts
var db = null;
function initBridgeDatabase(connectionString) {
  const pool = new Pool({ connectionString });
  db = drizzle(pool, { schema: schema_exports });
  return db;
}
function getBridgeDb() {
  if (!db) {
    throw new Error("Bridge database not initialized. Call initBridgeDatabase first.");
  }
  return db;
}

// src/api/webhooks/linear.ts
import { createHmac, timingSafeEqual } from "crypto";
import { eq, and } from "drizzle-orm";
function verifySignature(payload, signature, secret) {
  if (!signature.startsWith("sha256=")) {
    return false;
  }
  const hash = signature.slice(7);
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expected, "hex"));
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
      where: eq(workspaces.linearOrgId, payload.organizationId)
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
        where: and(
          eq(teamConfigs.workspaceId, workspace.id),
          eq(teamConfigs.linearTeamId, payload.data.teamId || "")
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
import { createHash } from "crypto";
import { eq as eq2 } from "drizzle-orm";
function hashApiKey(key) {
  return createHash("sha256").update(key).digest("hex");
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
    }).where(eq2(orchestrators.id, id)).returning();
    if (!updated) {
      return reply.status(404).send({ error: "Orchestrator not found" });
    }
    return { status: "ok", lastHeartbeat: updated.lastHeartbeat };
  });
  app.get("/api/orchestrators/:id", async (request, reply) => {
    const { id } = request.params;
    const orchestrator = await db2.query.orchestrators.findFirst({
      where: eq2(orchestrators.id, id)
    });
    if (!orchestrator) {
      return reply.status(404).send({ error: "Orchestrator not found" });
    }
    const { apiKeyHash, ...safe } = orchestrator;
    return safe;
  });
  app.delete("/api/orchestrators/:id", async (request, reply) => {
    const { id } = request.params;
    await db2.delete(repoRoutes).where(eq2(repoRoutes.orchestratorId, id));
    await db2.delete(apiKeys).where(eq2(apiKeys.orchestratorId, id));
    await db2.delete(orchestrators).where(eq2(orchestrators.id, id));
    return { status: "deleted" };
  });
}

// src/api/sessions/routes.ts
import { eq as eq3 } from "drizzle-orm";
async function registerSessionRoutes(app) {
  const db2 = getBridgeDb();
  app.post("/api/sessions/:id/status", async (request, reply) => {
    const { id } = request.params;
    const body = request.body;
    const [updated] = await db2.update(dispatchSessions).set({
      status: body.status,
      progressPercent: body.progressPercent,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq3(dispatchSessions.id, id)).returning();
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
    }).where(eq3(dispatchSessions.id, id)).returning();
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
      where: eq3(dispatchSessions.id, id)
    });
    if (!session) {
      return reply.status(404).send({ error: "Session not found" });
    }
    return session;
  });
}

// src/services/pubsub/service.ts
import { PubSub } from "@google-cloud/pubsub";
var PubSubService = class {
  constructor(config) {
    this.config = config;
    this.pubsub = new PubSub({ projectId: config.projectId });
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
  const app = Fastify({ logger: true });
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
//# sourceMappingURL=index.mjs.map