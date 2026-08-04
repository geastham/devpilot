#!/usr/bin/env node
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
var __copyProps = (to, from, except, desc5) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc5 = __getOwnPropDesc(from, key)) || desc5.enumerable });
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

// src/cli.ts
var cli_exports = {};
__export(cli_exports, {
  cli: () => cli,
  runCli: () => runCli
});
module.exports = __toCommonJS(cli_exports);
var import_commander16 = require("commander");
var import_update_notifier = __toESM(require("update-notifier"));

// src/version.ts
var VERSION = "0.1.1";

// src/commands/init.ts
var import_commander = require("commander");
var import_fs = require("fs");
var import_path = require("path");
var import_chalk = __toESM(require("chalk"));
var initCommand = new import_commander.Command("init").description("Initialize DevPilot in the current repository").option("-f, --force", "Overwrite existing configuration").action(async (options) => {
  const cwd = process.cwd();
  const devpilotDir = (0, import_path.join)(cwd, ".devpilot");
  const configPath = (0, import_path.join)(devpilotDir, "config.yaml");
  if ((0, import_fs.existsSync)(configPath) && !options.force) {
    console.log(
      import_chalk.default.yellow("\u26A0\uFE0F  DevPilot is already initialized in this directory.")
    );
    console.log(import_chalk.default.gray("   Use --force to reinitialize."));
    return;
  }
  if (!(0, import_fs.existsSync)(devpilotDir)) {
    (0, import_fs.mkdirSync)(devpilotDir, { recursive: true });
  }
  const defaultConfig = `# DevPilot Configuration
version: 1

mode: local  # 'local' | 'cloud' | 'hybrid'

database:
  type: sqlite
  path: .devpilot/data.db

sync:
  enabled: false
  endpoint: https://api.devpilot.sh
  org_id: null
  project_id: null

watchers:
  enabled: true
  patterns:
    - "src/**/*.ts"
    - "src/**/*.tsx"
    - "tests/**/*.ts"
  ignore:
    - "**/node_modules/**"
    - "**/.git/**"

ui:
  port: 3847
  open_browser: true
`;
  (0, import_fs.writeFileSync)(configPath, defaultConfig);
  const gitignorePath = (0, import_path.join)(cwd, ".gitignore");
  if ((0, import_fs.existsSync)(gitignorePath)) {
    const gitignore = require("fs").readFileSync(gitignorePath, "utf-8");
    if (!gitignore.includes(".devpilot/data.db")) {
      const addition = "\n# DevPilot\n.devpilot/data.db\n";
      require("fs").appendFileSync(gitignorePath, addition);
      console.log(import_chalk.default.gray("   Added .devpilot/data.db to .gitignore"));
    }
  }
  console.log(import_chalk.default.green("\u2705 DevPilot initialized successfully!"));
  console.log("");
  console.log(import_chalk.default.white("Next steps:"));
  console.log(import_chalk.default.gray("  1. Run ") + import_chalk.default.cyan("devpilot setup") + import_chalk.default.gray(" to configure Linear and agent-orchestrator"));
  console.log(import_chalk.default.gray("  2. Run ") + import_chalk.default.cyan("devpilot serve") + import_chalk.default.gray(" to start the local UI"));
  console.log(import_chalk.default.gray("  3. Run ") + import_chalk.default.cyan("devpilot status") + import_chalk.default.gray(" to see fleet status"));
});

// src/commands/serve.ts
var import_commander2 = require("commander");
var import_chalk2 = __toESM(require("chalk"));

// src/server/index.ts
var import_fastify = __toESM(require("fastify"));
var import_db5 = require("@devpilot.sh/core/db");
var import_orchestrator2 = require("@devpilot.sh/core/orchestrator");
var import_wave_planner2 = require("@devpilot.sh/core/wave-planner");

// src/server/api/items.ts
var import_db = require("@devpilot.sh/core/db");
var import_wave_planner = require("@devpilot.sh/core/wave-planner");
var import_drizzle_orm = require("drizzle-orm");
async function registerItemRoutes(app) {
  const db2 = getDb();
  app.get("/api/items", async (request, reply) => {
    const { zone, repo } = request.query;
    const conditions = [];
    if (zone) conditions.push((0, import_drizzle_orm.eq)(import_db.horizonItems.zone, zone));
    if (repo) conditions.push((0, import_drizzle_orm.eq)(import_db.horizonItems.repo, repo));
    const items = await db2.query.horizonItems.findMany({
      where: conditions.length > 0 ? (0, import_drizzle_orm.and)(...conditions) : void 0,
      with: {
        plan: {
          with: {
            workstreams: {
              with: { tasks: true }
            },
            sequentialTasks: true,
            filesTouched: true
          }
        },
        conflictingFiles: true
      },
      orderBy: [(0, import_drizzle_orm.desc)(import_db.horizonItems.priority), (0, import_drizzle_orm.desc)(import_db.horizonItems.createdAt)]
    });
    return items;
  });
  app.post("/api/items", async (request, reply) => {
    const { title, zone = "DIRECTIONAL", repo, complexity, priority = 0, linearTicketId } = request.body;
    if (!title || !repo) {
      reply.status(400).send({ error: "Title and repo are required" });
      return;
    }
    const [item] = await db2.insert(import_db.horizonItems).values({
      title,
      zone,
      repo,
      complexity,
      priority,
      linearTicketId
    }).returning();
    const itemWithRelations = await db2.query.horizonItems.findFirst({
      where: (0, import_drizzle_orm.eq)(import_db.horizonItems.id, item.id),
      with: {
        plan: true,
        conflictingFiles: true
      }
    });
    await db2.insert(import_db.activityEvents).values({
      type: "ITEM_CREATED",
      message: `New item "${title}" added to ${zone}`,
      repo,
      ticketId: linearTicketId
    });
    reply.status(201).send(itemWithRelations);
  });
  app.get("/api/items/:id", async (request, reply) => {
    const { id } = request.params;
    const item = await db2.query.horizonItems.findFirst({
      where: (0, import_drizzle_orm.eq)(import_db.horizonItems.id, id),
      with: {
        plan: {
          with: {
            workstreams: {
              with: { tasks: true }
            },
            sequentialTasks: true,
            filesTouched: true
          }
        },
        conflictingFiles: true
      }
    });
    if (!item) {
      reply.status(404).send({ error: "Item not found" });
      return;
    }
    return item;
  });
  app.patch("/api/items/:id", async (request, reply) => {
    const { id } = request.params;
    const { title, zone, repo, complexity, priority, linearTicketId } = request.body;
    const existingItem = await db2.query.horizonItems.findFirst({
      where: (0, import_drizzle_orm.eq)(import_db.horizonItems.id, id)
    });
    if (!existingItem) {
      reply.status(404).send({ error: "Item not found" });
      return;
    }
    const updateData = {
      updatedAt: /* @__PURE__ */ new Date()
    };
    if (title !== void 0) updateData.title = title;
    if (zone !== void 0) updateData.zone = zone;
    if (repo !== void 0) updateData.repo = repo;
    if (complexity !== void 0) updateData.complexity = complexity;
    if (priority !== void 0) updateData.priority = priority;
    if (linearTicketId !== void 0) updateData.linearTicketId = linearTicketId;
    await db2.update(import_db.horizonItems).set(updateData).where((0, import_drizzle_orm.eq)(import_db.horizonItems.id, id));
    const item = await db2.query.horizonItems.findFirst({
      where: (0, import_drizzle_orm.eq)(import_db.horizonItems.id, id),
      with: {
        plan: {
          with: {
            workstreams: {
              with: { tasks: true }
            },
            sequentialTasks: true,
            filesTouched: true
          }
        },
        conflictingFiles: true
      }
    });
    if (zone && zone !== existingItem.zone && item) {
      await db2.insert(import_db.activityEvents).values({
        type: "RUNWAY_UPDATE",
        message: `"${item.title}" moved from ${existingItem.zone} to ${zone}`,
        repo: item.repo,
        ticketId: item.linearTicketId
      });
    }
    return item;
  });
  app.delete("/api/items/:id", async (request, reply) => {
    const { id } = request.params;
    const existingItem = await db2.query.horizonItems.findFirst({
      where: (0, import_drizzle_orm.eq)(import_db.horizonItems.id, id)
    });
    if (!existingItem) {
      reply.status(404).send({ error: "Item not found" });
      return;
    }
    await db2.delete(import_db.horizonItems).where((0, import_drizzle_orm.eq)(import_db.horizonItems.id, id));
    return { success: true };
  });
  app.post("/api/items/:id/plan/generate", async (request, reply) => {
    const { id } = request.params;
    const item = await db2.query.horizonItems.findFirst({
      where: (0, import_drizzle_orm.eq)(import_db.horizonItems.id, id),
      with: { plan: true }
    });
    if (!item) {
      reply.status(404).send({ error: "Item not found" });
      return;
    }
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      reply.status(503).send({
        error: "PLAN_AI_UNAVAILABLE",
        detail: "ANTHROPIC_API_KEY is not configured"
      });
      return;
    }
    const allInFlightFiles = await db2.query.inFlightFiles.findMany();
    const inFlightPaths = allInFlightFiles.map((f) => f.path);
    const priorVersion = item.plan?.version ?? 0;
    if (item.plan) {
      await db2.delete(import_db.tasks).where((0, import_drizzle_orm.eq)(import_db.tasks.planId, item.plan.id));
      const existingWorkstreams = await db2.query.workstreams.findMany({
        where: (0, import_drizzle_orm.eq)(import_db.workstreams.planId, item.plan.id)
      });
      for (const ws of existingWorkstreams) {
        await db2.delete(import_db.tasks).where((0, import_drizzle_orm.eq)(import_db.tasks.workstreamId, ws.id));
      }
      await db2.delete(import_db.workstreams).where((0, import_drizzle_orm.eq)(import_db.workstreams.planId, item.plan.id));
      await db2.delete(import_db.touchedFiles).where((0, import_drizzle_orm.eq)(import_db.touchedFiles.planId, item.plan.id));
      await db2.delete(import_db.plans).where((0, import_drizzle_orm.eq)(import_db.plans.id, item.plan.id));
    }
    const workingDir = process.env.WORKING_DIR || process.cwd();
    const { generation, planId } = await (0, import_wave_planner.generatePlanForItem)({
      horizonItemId: id,
      title: item.title,
      repo: item.repo,
      workingDir,
      apiKey
    });
    await (0, import_wave_planner.projectWavePlanToPlan)({ planId, generation, inFlightPaths });
    if (priorVersion > 0) {
      await db2.update(import_db.plans).set({ version: priorVersion + 1 }).where((0, import_drizzle_orm.eq)(import_db.plans.id, planId));
    }
    if (item.zone === "SHAPING") {
      await db2.update(import_db.horizonItems).set({ zone: "REFINING", updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm.eq)(import_db.horizonItems.id, id));
    }
    const completePlan = await db2.query.plans.findFirst({
      where: (0, import_drizzle_orm.eq)(import_db.plans.id, planId),
      with: {
        workstreams: {
          with: { tasks: true }
        },
        sequentialTasks: true,
        filesTouched: true
      }
    });
    await db2.insert(import_db.activityEvents).values({
      type: "PLAN_GENERATED",
      message: `Plan generated for "${item.title}" ($${(completePlan?.estimatedCostUsd ?? 0).toFixed(2)})`,
      repo: item.repo,
      ticketId: item.linearTicketId,
      metadata: { planId }
    });
    reply.status(201).send(completePlan);
  });
  app.get("/api/items/:id/plan", async (request, reply) => {
    const { id } = request.params;
    const item = await db2.query.horizonItems.findFirst({
      where: (0, import_drizzle_orm.eq)(import_db.horizonItems.id, id),
      with: {
        plan: {
          with: {
            workstreams: {
              with: { tasks: true }
            },
            sequentialTasks: true,
            filesTouched: true,
            previousPlan: true
          }
        }
      }
    });
    if (!item) {
      reply.status(404).send({ error: "Item not found" });
      return;
    }
    if (!item.plan) {
      reply.status(404).send({ error: "No plan exists for this item" });
      return;
    }
    return item.plan;
  });
  app.post("/api/items/:id/plan/replan", async (request, reply) => {
    const { id } = request.params;
    const { constraint } = request.body;
    const item = await db2.query.horizonItems.findFirst({
      where: (0, import_drizzle_orm.eq)(import_db.horizonItems.id, id),
      with: {
        plan: {
          with: {
            workstreams: {
              with: { tasks: true }
            },
            sequentialTasks: true,
            filesTouched: true
          }
        }
      }
    });
    if (!item) {
      reply.status(404).send({ error: "Item not found" });
      return;
    }
    if (!item.plan) {
      reply.status(400).send({ error: "No existing plan to replan" });
      return;
    }
    const [newPlan] = await db2.insert(import_db.plans).values({
      horizonItemId: id,
      version: item.plan.version + 1,
      estimatedCostUsd: item.plan.estimatedCostUsd * 0.9,
      baselineCostUsd: item.plan.baselineCostUsd,
      acceptanceCriteria: item.plan.acceptanceCriteria,
      confidenceSignals: item.plan.confidenceSignals,
      fleetContextSnapshot: item.plan.fleetContextSnapshot,
      memorySessionsUsed: item.plan.memorySessionsUsed,
      previousPlanId: item.plan.id
    }).returning();
    for (const ws of item.plan.workstreams) {
      const [workstream] = await db2.insert(import_db.workstreams).values({
        planId: newPlan.id,
        label: ws.label,
        repo: ws.repo,
        workerCount: ws.workerCount,
        orderIndex: ws.orderIndex
      }).returning();
      for (const task of ws.tasks) {
        await db2.insert(import_db.tasks).values({
          workstreamId: workstream.id,
          label: task.label,
          model: task.model,
          complexity: task.complexity,
          estimatedCostUsd: task.estimatedCostUsd,
          filePaths: task.filePaths,
          conflictWarning: task.conflictWarning,
          dependsOn: task.dependsOn,
          orderIndex: task.orderIndex
        });
      }
    }
    for (const f of item.plan.filesTouched) {
      await db2.insert(import_db.touchedFiles).values({
        planId: newPlan.id,
        path: f.path,
        status: f.status,
        inFlightVia: f.inFlightVia
      });
    }
    const completePlan = await db2.query.plans.findFirst({
      where: (0, import_drizzle_orm.eq)(import_db.plans.id, newPlan.id),
      with: {
        workstreams: {
          with: { tasks: true }
        },
        sequentialTasks: true,
        filesTouched: true,
        previousPlan: true
      }
    });
    await db2.insert(import_db.activityEvents).values({
      type: "PLAN_GENERATED",
      message: `Plan replanned for "${item.title}" with constraint: "${constraint || "manual"}"`,
      repo: item.repo,
      ticketId: item.linearTicketId,
      metadata: { planId: newPlan.id, version: newPlan.version }
    });
    return completePlan;
  });
  app.patch("/api/items/:id/plan/tasks/:taskId", async (request, reply) => {
    const { id, taskId } = request.params;
    const { model, complexity, modelOverride } = request.body;
    const updateData = {};
    if (model !== void 0) updateData.model = model;
    if (modelOverride !== void 0) updateData.modelOverride = modelOverride;
    if (complexity !== void 0) updateData.complexity = complexity;
    const [updatedTask] = await db2.update(import_db.tasks).set(updateData).where((0, import_drizzle_orm.eq)(import_db.tasks.id, taskId)).returning();
    if (!updatedTask) {
      reply.status(404).send({ error: "Task not found" });
      return;
    }
    return { task: updatedTask };
  });
}

// src/server/api/fleet.ts
var import_db2 = require("@devpilot.sh/core/db");
var import_orchestrator = require("@devpilot.sh/core/orchestrator");
var import_drizzle_orm2 = require("drizzle-orm");
async function registerFleetRoutes(app) {
  const db2 = getDb();
  app.get("/api/fleet/sessions", async (request, reply) => {
    const { status, repo } = request.query;
    const conditions = [];
    if (status) conditions.push((0, import_drizzle_orm2.eq)(import_db2.rufloSessions.status, status));
    if (repo) conditions.push((0, import_drizzle_orm2.eq)(import_db2.rufloSessions.repo, repo));
    const sessions = await db2.query.rufloSessions.findMany({
      where: conditions.length > 0 ? (0, import_drizzle_orm2.and)(...conditions) : void 0,
      with: {
        completedTasks: true
      },
      orderBy: [(0, import_drizzle_orm2.asc)(import_db2.rufloSessions.status), (0, import_drizzle_orm2.desc)(import_db2.rufloSessions.updatedAt)]
    });
    return sessions;
  });
  app.post("/api/fleet/sessions", async (request, reply) => {
    const {
      repo,
      linearTicketId,
      ticketTitle,
      currentWorkstream,
      estimatedRemainingMinutes,
      inFlightFiles: inFlightFilePaths = []
    } = request.body;
    if (!repo || !linearTicketId || !ticketTitle) {
      reply.status(400).send({ error: "repo, linearTicketId, and ticketTitle are required" });
      return;
    }
    const [session] = await db2.insert(import_db2.rufloSessions).values({
      repo,
      linearTicketId,
      ticketTitle,
      currentWorkstream: currentWorkstream || "Main",
      status: "ACTIVE",
      progressPercent: 0,
      elapsedMinutes: 0,
      estimatedRemainingMinutes: estimatedRemainingMinutes || 30,
      inFlightFiles: inFlightFilePaths
    }).returning();
    for (const filePath of inFlightFilePaths) {
      await db2.insert(import_db2.inFlightFiles).values({
        path: filePath,
        activeSessionId: session.id,
        linearTicketId,
        estimatedMinutesRemaining: estimatedRemainingMinutes || 30
      });
    }
    await db2.insert(import_db2.activityEvents).values({
      type: "ITEM_DISPATCHED",
      message: `Session started: "${ticketTitle}"`,
      repo,
      ticketId: linearTicketId,
      metadata: { sessionId: session.id }
    });
    const sessionWithRelations = await db2.query.rufloSessions.findFirst({
      where: (0, import_drizzle_orm2.eq)(import_db2.rufloSessions.id, session.id),
      with: {
        completedTasks: true
      }
    });
    reply.status(201).send(sessionWithRelations);
  });
  app.get("/api/fleet/state", async (request, reply) => {
    const sessions = await db2.query.rufloSessions.findMany({
      where: (0, import_drizzle_orm2.or)(
        (0, import_drizzle_orm2.eq)(import_db2.rufloSessions.status, "ACTIVE"),
        (0, import_drizzle_orm2.eq)(import_db2.rufloSessions.status, "NEEDS_SPEC")
      ),
      with: {
        completedTasks: true
      },
      orderBy: (0, import_drizzle_orm2.desc)(import_db2.rufloSessions.updatedAt)
    });
    const allInFlightFiles = await db2.query.inFlightFiles.findMany();
    const totalEstimatedMinutes = sessions.reduce(
      (sum, s) => sum + s.estimatedRemainingMinutes,
      0
    );
    const readyItemsList = await db2.query.horizonItems.findMany({
      where: (0, import_drizzle_orm2.eq)(import_db2.horizonItems.zone, "READY")
    });
    const readyItems = readyItemsList.length;
    const refiningItemsList = await db2.query.horizonItems.findMany({
      where: (0, import_drizzle_orm2.eq)(import_db2.horizonItems.zone, "REFINING")
    });
    const refiningItems = refiningItemsList.length;
    const maxSessions = 8;
    const activeSessions = sessions.filter((s) => s.status === "ACTIVE").length;
    const fleetUtilization = Math.round(activeSessions / maxSessions * 100);
    const avgCompletionMinutes = 45;
    const runwayMinutes = readyItems * avgCompletionMinutes + totalEstimatedMinutes + refiningItems * avgCompletionMinutes * 0.5;
    let runwayStatus = "HEALTHY";
    const runwayHours = runwayMinutes / 60;
    if (runwayHours < 2) {
      runwayStatus = "CRITICAL";
    } else if (runwayHours < 8) {
      runwayStatus = "WARNING";
    }
    const recentEvents = await db2.query.activityEvents.findMany({
      orderBy: (0, import_drizzle_orm2.desc)(import_db2.activityEvents.createdAt),
      limit: 10
    });
    const score = await db2.query.conductorScores.findFirst({
      orderBy: (0, import_drizzle_orm2.desc)(import_db2.conductorScores.updatedAt)
    });
    return {
      sessions,
      inFlightFiles: allInFlightFiles,
      runway: {
        totalMinutes: runwayMinutes,
        hours: Math.round(runwayHours * 10) / 10,
        status: runwayStatus,
        readyItems,
        refiningItems
      },
      fleet: {
        activeSessions,
        maxSessions,
        utilization: fleetUtilization,
        needsSpecCount: sessions.filter((s) => s.status === "NEEDS_SPEC").length
      },
      recentEvents,
      conductorScore: score ? {
        total: score.total,
        breakdown: {
          fleetUtilization: score.fleetUtilization,
          runwayHealth: score.runwayHealth,
          planAccuracy: score.planAccuracy,
          costEfficiency: score.costEfficiency,
          velocityTrend: score.velocityTrend
        },
        leaderboardRank: score.leaderboardRank
      } : null
    };
  });
  app.post("/api/fleet/dispatch/:itemId", async (request, reply) => {
    const { itemId } = request.params;
    const item = await db2.query.horizonItems.findFirst({
      where: (0, import_drizzle_orm2.eq)(import_db2.horizonItems.id, itemId),
      with: {
        plan: {
          with: {
            workstreams: {
              with: { tasks: true }
            },
            filesTouched: true
          }
        }
      }
    });
    if (!item) {
      reply.status(404).send({ error: "Item not found" });
      return;
    }
    if (item.zone !== "READY") {
      reply.status(400).send({ error: "Item must be in READY zone to dispatch" });
      return;
    }
    if (!item.plan) {
      reply.status(400).send({ error: "Item must have an approved plan to dispatch" });
      return;
    }
    const sortedWorkstreams = [...item.plan.workstreams].sort(
      (a, b) => a.orderIndex - b.orderIndex
    );
    const totalTasks = item.plan.workstreams.reduce(
      (sum, ws) => sum + ws.tasks.length,
      0
    );
    const estimatedMinutes = totalTasks * 15;
    const filePaths = item.plan.filesTouched.map((f) => f.path);
    const [session] = await db2.insert(import_db2.rufloSessions).values({
      repo: item.repo,
      linearTicketId: item.linearTicketId || `DP-${Date.now()}`,
      ticketTitle: item.title,
      currentWorkstream: sortedWorkstreams[0]?.label || "Main",
      status: "ACTIVE",
      progressPercent: 0,
      elapsedMinutes: 0,
      estimatedRemainingMinutes: estimatedMinutes,
      inFlightFiles: filePaths
    }).returning();
    const orchestrator2 = (0, import_orchestrator.getOrchestratorServiceOrNull)();
    if (orchestrator2 && orchestrator2.isEnabled) {
      const dispatchRequest = (0, import_orchestrator.buildDispatchRequest)({
        sessionId: session.id,
        repo: item.repo,
        title: item.title,
        filePaths,
        model: "sonnet",
        workstream: sortedWorkstreams[0]?.label,
        linearTicketId: session.linearTicketId,
        callbackUrl: "",
        // Will use the one from orchestrator config
        estimatedMinutes
      });
      const dispatchResult = await orchestrator2.dispatch(dispatchRequest);
      if (dispatchResult.accepted && dispatchResult.orchestratorJobId) {
        await db2.update(import_db2.rufloSessions).set({
          externalSessionId: dispatchResult.orchestratorJobId,
          orchestratorMode: dispatchResult.mode
        }).where((0, import_drizzle_orm2.eq)(import_db2.rufloSessions.id, session.id));
        await db2.insert(import_db2.activityEvents).values({
          type: "ITEM_DISPATCHED",
          message: `Orchestrator accepted: ${dispatchResult.orchestratorJobId}`,
          repo: item.repo,
          ticketId: session.linearTicketId,
          metadata: {
            sessionId: session.id,
            externalJobId: dispatchResult.orchestratorJobId,
            mode: dispatchResult.mode
          }
        });
      } else if (!dispatchResult.accepted) {
        await db2.insert(import_db2.activityEvents).values({
          type: "ITEM_DISPATCHED",
          message: `Orchestrator dispatch failed: ${dispatchResult.error}`,
          repo: item.repo,
          ticketId: session.linearTicketId,
          metadata: {
            sessionId: session.id,
            error: dispatchResult.error
          }
        });
      }
    }
    for (const file of item.plan.filesTouched) {
      await db2.insert(import_db2.inFlightFiles).values({
        path: file.path,
        activeSessionId: session.id,
        linearTicketId: session.linearTicketId,
        estimatedMinutesRemaining: estimatedMinutes,
        horizonItemId: itemId
      });
      await db2.update(import_db2.touchedFiles).set({
        status: "IN_FLIGHT",
        inFlightVia: session.id
      }).where((0, import_drizzle_orm2.eq)(import_db2.touchedFiles.id, file.id));
    }
    await db2.delete(import_db2.horizonItems).where((0, import_drizzle_orm2.eq)(import_db2.horizonItems.id, itemId));
    await db2.insert(import_db2.activityEvents).values({
      type: "ITEM_DISPATCHED",
      message: `Dispatched "${item.title}" to fleet`,
      repo: item.repo,
      ticketId: session.linearTicketId,
      metadata: {
        sessionId: session.id,
        itemId,
        estimatedMinutes,
        workstreams: item.plan.workstreams.length,
        tasks: totalTasks
      }
    });
    const score = await db2.query.conductorScores.findFirst();
    if (score) {
      await db2.update(import_db2.conductorScores).set({
        velocityTrend: Math.min(200, score.velocityTrend + 5),
        total: Math.min(1e3, score.total + 10)
      }).where((0, import_drizzle_orm2.eq)(import_db2.conductorScores.id, score.id));
      await db2.insert(import_db2.activityEvents).values({
        type: "SCORE_UPDATE",
        message: `Score +10 for dispatching work`,
        metadata: { delta: 10, reason: "dispatch" }
      });
    }
    const sessionWithRelations = await db2.query.rufloSessions.findFirst({
      where: (0, import_drizzle_orm2.eq)(import_db2.rufloSessions.id, session.id),
      with: {
        completedTasks: true
      }
    });
    return {
      session: sessionWithRelations,
      message: `Successfully dispatched "${item.title}" to fleet`
    };
  });
}

// src/server/api/score.ts
var import_db3 = require("@devpilot.sh/core/db");
var import_drizzle_orm3 = require("drizzle-orm");
async function registerScoreRoutes(app) {
  const db2 = getDb();
  app.get("/api/score", async (request, reply) => {
    const existingScore = await db2.query.conductorScores.findFirst({
      with: {
        history: true
      }
    });
    let scoreId;
    let total;
    let fleetUtilization;
    let runwayHealth;
    let planAccuracy;
    let costEfficiency;
    let velocityTrend;
    let leaderboardRank;
    let updatedAt;
    if (existingScore) {
      scoreId = existingScore.id;
      total = existingScore.total;
      fleetUtilization = existingScore.fleetUtilization;
      runwayHealth = existingScore.runwayHealth;
      planAccuracy = existingScore.planAccuracy;
      costEfficiency = existingScore.costEfficiency;
      velocityTrend = existingScore.velocityTrend;
      leaderboardRank = existingScore.leaderboardRank;
      updatedAt = existingScore.updatedAt;
    } else {
      const [newScore] = await db2.insert(import_db3.conductorScores).values({
        userId: "default",
        total: 500,
        fleetUtilization: 100,
        runwayHealth: 100,
        planAccuracy: 100,
        costEfficiency: 100,
        velocityTrend: 100,
        leaderboardRank: 1
      }).returning();
      scoreId = newScore.id;
      total = newScore.total;
      fleetUtilization = newScore.fleetUtilization;
      runwayHealth = newScore.runwayHealth;
      planAccuracy = newScore.planAccuracy;
      costEfficiency = newScore.costEfficiency;
      velocityTrend = newScore.velocityTrend;
      leaderboardRank = newScore.leaderboardRank;
      updatedAt = newScore.updatedAt;
    }
    const historyData = await db2.query.scoreHistory.findMany({
      where: (0, import_drizzle_orm3.eq)(import_db3.scoreHistory.scoreId, scoreId),
      orderBy: (0, import_drizzle_orm3.desc)(import_db3.scoreHistory.recordedAt),
      limit: 30
    });
    const breakdown = {
      fleetUtilization: {
        value: fleetUtilization,
        max: 200,
        percent: Math.round(fleetUtilization / 200 * 100),
        label: "Fleet Utilization",
        description: "How well you keep your fleet busy"
      },
      runwayHealth: {
        value: runwayHealth,
        max: 200,
        percent: Math.round(runwayHealth / 200 * 100),
        label: "Runway Health",
        description: "Maintaining healthy work pipeline"
      },
      planAccuracy: {
        value: planAccuracy,
        max: 200,
        percent: Math.round(planAccuracy / 200 * 100),
        label: "Plan Accuracy",
        description: "How accurate your cost estimates are"
      },
      costEfficiency: {
        value: costEfficiency,
        max: 200,
        percent: Math.round(costEfficiency / 200 * 100),
        label: "Cost Efficiency",
        description: "Optimizing model selection for tasks"
      },
      velocityTrend: {
        value: velocityTrend,
        max: 200,
        percent: Math.round(velocityTrend / 200 * 100),
        label: "Velocity Trend",
        description: "Improving throughput over time"
      }
    };
    const sparklineData = historyData.map((h) => ({
      date: h.recordedAt,
      value: h.total
    }));
    return {
      total,
      max: 1e3,
      percent: Math.round(total / 1e3 * 100),
      leaderboardRank,
      breakdown,
      sparklineData,
      updatedAt
    };
  });
  app.get("/api/score/history", async (request, reply) => {
    const { days = "7" } = request.query;
    const numDays = parseInt(days, 10);
    const score = await db2.query.conductorScores.findFirst();
    if (!score) {
      return { history: [], summary: null };
    }
    const startDate = /* @__PURE__ */ new Date();
    startDate.setDate(startDate.getDate() - numDays);
    const history = await db2.query.scoreHistory.findMany({
      where: (0, import_drizzle_orm3.and)(
        (0, import_drizzle_orm3.eq)(import_db3.scoreHistory.scoreId, score.id),
        (0, import_drizzle_orm3.gte)(import_db3.scoreHistory.recordedAt, startDate)
      ),
      orderBy: (0, import_drizzle_orm3.asc)(import_db3.scoreHistory.recordedAt)
    });
    const totals = history.map((h) => h.total);
    const summary = totals.length > 0 ? {
      current: totals[totals.length - 1],
      min: Math.min(...totals),
      max: Math.max(...totals),
      average: Math.round(totals.reduce((a, b) => a + b, 0) / totals.length),
      trend: totals.length > 1 ? totals[totals.length - 1] - totals[0] > 0 ? "up" : totals[totals.length - 1] - totals[0] < 0 ? "down" : "stable" : "stable",
      delta: totals.length > 1 ? totals[totals.length - 1] - totals[0] : 0
    } : null;
    const chartData = history.map((h) => ({
      date: h.recordedAt.toISOString().split("T")[0],
      total: h.total,
      fleetUtilization: h.fleetUtilization,
      runwayHealth: h.runwayHealth,
      planAccuracy: h.planAccuracy,
      costEfficiency: h.costEfficiency,
      velocityTrend: h.velocityTrend
    }));
    return {
      history: chartData,
      summary,
      period: { days: numDays, start: startDate.toISOString(), end: (/* @__PURE__ */ new Date()).toISOString() }
    };
  });
  app.post("/api/score/history", async (request, reply) => {
    const score = await db2.query.conductorScores.findFirst();
    if (!score) {
      reply.status(404).send({ error: "No score exists to record" });
      return;
    }
    const [historyEntry] = await db2.insert(import_db3.scoreHistory).values({
      scoreId: score.id,
      total: score.total,
      fleetUtilization: score.fleetUtilization,
      runwayHealth: score.runwayHealth,
      planAccuracy: score.planAccuracy,
      costEfficiency: score.costEfficiency,
      velocityTrend: score.velocityTrend
    }).returning();
    reply.status(201).send(historyEntry);
  });
}

// src/server/api/events.ts
var import_db4 = require("@devpilot.sh/core/db");
var import_drizzle_orm4 = require("drizzle-orm");
async function registerEventRoutes(app) {
  const db2 = getDb();
  app.get("/api/events", async (request, reply) => {
    const { limit = "50", type, repo, after } = request.query;
    const numLimit = Math.min(parseInt(limit, 10), 100);
    const conditions = [];
    if (type) conditions.push((0, import_drizzle_orm4.eq)(import_db4.activityEvents.type, type));
    if (repo) conditions.push((0, import_drizzle_orm4.eq)(import_db4.activityEvents.repo, repo));
    if (after) conditions.push((0, import_drizzle_orm4.gt)(import_db4.activityEvents.createdAt, new Date(after)));
    const events = await db2.query.activityEvents.findMany({
      where: conditions.length > 0 ? (0, import_drizzle_orm4.and)(...conditions) : void 0,
      orderBy: (0, import_drizzle_orm4.desc)(import_db4.activityEvents.createdAt),
      limit: numLimit
    });
    return {
      events,
      count: events.length,
      hasMore: events.length === numLimit
    };
  });
  app.post("/api/events", async (request, reply) => {
    const { type, message, repo, ticketId, metadata } = request.body;
    if (!type || !message) {
      reply.status(400).send({ error: "type and message are required" });
      return;
    }
    const [event] = await db2.insert(import_db4.activityEvents).values({
      type,
      message,
      repo,
      ticketId,
      metadata
    }).returning();
    reply.status(201).send(event);
  });
  app.get("/api/events/stream", async (request, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    reply.raw.write(`data: ${JSON.stringify({ type: "connected", timestamp: (/* @__PURE__ */ new Date()).toISOString() })}

`);
    let lastEventId = null;
    let isActive = true;
    const pollInterval = setInterval(async () => {
      if (!isActive) {
        clearInterval(pollInterval);
        return;
      }
      try {
        const events = await db2.query.activityEvents.findMany({
          where: lastEventId ? (0, import_drizzle_orm4.gt)(import_db4.activityEvents.id, lastEventId) : (0, import_drizzle_orm4.gt)(import_db4.activityEvents.createdAt, new Date(Date.now() - 5e3)),
          orderBy: (0, import_drizzle_orm4.asc)(import_db4.activityEvents.createdAt),
          limit: 20
        });
        if (events.length > 0) {
          lastEventId = events[events.length - 1].id;
          for (const event of events) {
            const sseData = {
              id: event.id,
              type: event.type,
              message: event.message,
              repo: event.repo,
              ticketId: event.ticketId,
              metadata: event.metadata,
              createdAt: event.createdAt
            };
            reply.raw.write(`data: ${JSON.stringify(sseData)}

`);
          }
        }
        const sessions = await db2.query.rufloSessions.findMany({
          where: (0, import_drizzle_orm4.eq)(import_db4.rufloSessions.status, "ACTIVE")
        });
        reply.raw.write(
          `data: ${JSON.stringify({
            type: "fleet_heartbeat",
            sessions: sessions.map((s) => ({
              id: s.id,
              progress: s.progressPercent,
              status: s.status,
              eta: s.estimatedRemainingMinutes
            })),
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          })}

`
        );
      } catch (error) {
        console.error("SSE poll error:", error);
        reply.raw.write(
          `data: ${JSON.stringify({ type: "error", message: "Poll failed" })}

`
        );
      }
    }, 2e3);
    request.raw.on("close", () => {
      isActive = false;
      clearInterval(pollInterval);
    });
    return reply;
  });
}

// src/server/index.ts
function waveExecutionConfigFromEnv(port) {
  const failurePolicy = process.env.DEVPILOT_WAVE_FAILURE_POLICY === "continue" ? "continue" : "halt";
  return {
    maxConcurrentSubagents: Number(process.env.DEVPILOT_WAVE_MAX_CONCURRENT) || 4,
    maxTotalActiveTasks: Number(process.env.DEVPILOT_WAVE_MAX_TOTAL) || 8,
    subagentDispatchDelayMs: 500,
    waveAdvanceDelayMs: 2e3,
    retryLimit: Number(process.env.DEVPILOT_WAVE_RETRY_LIMIT) || 1,
    failurePolicy,
    autoAdvance: process.env.DEVPILOT_WAVE_AUTO_ADVANCE !== "false",
    callbackUrl: `http://127.0.0.1:${port}/api/orchestrator`
  };
}
var db;
function getDb() {
  return db;
}
async function createServer(options) {
  db = (0, import_db5.initDatabase)({
    type: "sqlite",
    sqlitePath: options.dbPath
  });
  if (options.orchestrator && options.orchestrator.mode !== "disabled") {
    const orchestratorConfig = {
      mode: options.orchestrator.mode,
      aoProjectName: options.orchestrator.aoProjectName,
      aoPath: options.orchestrator.aoPath,
      url: options.orchestrator.httpUrl,
      apiKey: options.orchestrator.apiKey,
      sessionApiUrl: options.orchestrator.sessionApiUrl,
      sessionApiKey: options.orchestrator.sessionApiKey,
      sessionEnvironmentId: options.orchestrator.sessionEnvironmentId,
      callbackToken: options.orchestrator.callbackToken,
      callbackUrl: `http://127.0.0.1:${options.port}/api/orchestrator`
    };
    const orchestrator2 = (0, import_orchestrator2.initOrchestratorService)(orchestratorConfig);
    (0, import_orchestrator2.initStatusPoller)(orchestrator2, {
      pollIntervalMs: 5e3,
      ...(0, import_orchestrator2.createDbStatusPollerCallbacks)()
    });
    (0, import_wave_planner2.initExecutionBridge)(orchestrator2, {
      execution: waveExecutionConfigFromEnv(options.port)
    }).start();
    console.log(`Orchestrator initialized in ${options.orchestrator.mode} mode`);
  }
  const app = (0, import_fastify.default)({
    logger: {
      level: "info",
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          ignore: "pid,hostname",
          translateTime: "HH:MM:ss"
        }
      }
    }
  });
  app.addHook("preHandler", async (request, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type");
    if (request.method === "OPTIONS") {
      reply.status(204).send();
    }
  });
  await registerItemRoutes(app);
  await registerFleetRoutes(app);
  await registerScoreRoutes(app);
  await registerEventRoutes(app);
  app.get("/api/health", async () => {
    return { status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() };
  });
  return app;
}
async function startServer(options) {
  const app = await createServer(options);
  const host = options.host || "127.0.0.1";
  await app.listen({ port: options.port, host });
  const url = `http://${host}:${options.port}`;
  return {
    url,
    close: async () => {
      await app.close();
    }
  };
}

// src/commands/serve.ts
var import_fs2 = require("fs");
var import_path2 = require("path");
var serveCommand = new import_commander2.Command("serve").description("Start the local DevPilot Conductor API server").option("-p, --port <port>", "Port to run the server on", "3847").option("--no-open", "Do not open browser automatically").option("--sync", "Enable cloud sync").option("--db <path>", "Path to SQLite database", ".devpilot/data.db").option(
  "--orchestrator-mode <mode>",
  "Orchestrator mode: claude-session | ao-cli | http | disabled"
).option("--session-api-url <url>", "claude-session dispatcher base URL").option("--session-api-key <key>", "claude-session dispatcher bearer token").option("--ao-project <name>", "ao-cli project name").option("--ao-path <path>", "Path to the ao binary").option("--orchestrator-url <url>", "Remote orchestrator base URL (http mode)").action(async (options) => {
  const port = parseInt(options.port, 10);
  const orchestratorMode = options.orchestratorMode || process.env.DEVPILOT_ORCHESTRATOR_MODE;
  const orchestrator2 = orchestratorMode ? {
    mode: orchestratorMode,
    sessionApiUrl: options.sessionApiUrl || process.env.DEVPILOT_SESSION_API_URL,
    sessionApiKey: options.sessionApiKey || process.env.DEVPILOT_SESSION_API_KEY,
    sessionEnvironmentId: process.env.DEVPILOT_SESSION_ENVIRONMENT_ID,
    callbackToken: process.env.DEVPILOT_CALLBACK_TOKEN,
    aoProjectName: options.aoProject || process.env.DEVPILOT_AO_PROJECT,
    aoPath: options.aoPath || process.env.DEVPILOT_AO_PATH,
    httpUrl: options.orchestratorUrl || process.env.DEVPILOT_ORCHESTRATOR_URL,
    apiKey: process.env.DEVPILOT_ORCHESTRATOR_API_KEY
  } : void 0;
  console.log(import_chalk2.default.cyan("\u{1F680} Starting DevPilot Conductor..."));
  console.log("");
  console.log(import_chalk2.default.gray(`   Port: ${port}`));
  console.log(import_chalk2.default.gray(`   Database: ${options.db}`));
  console.log(import_chalk2.default.gray(`   Sync: ${options.sync ? "enabled" : "disabled"}`));
  console.log("");
  const dbDir = (0, import_path2.join)(process.cwd(), ".devpilot");
  if (!(0, import_fs2.existsSync)(dbDir)) {
    (0, import_fs2.mkdirSync)(dbDir, { recursive: true });
    console.log(import_chalk2.default.gray(`   Created: ${dbDir}`));
  }
  try {
    const dbPath = options.db.startsWith("/") ? options.db : (0, import_path2.join)(process.cwd(), options.db);
    const { url, close } = await startServer({
      port,
      dbPath,
      orchestrator: orchestrator2
    });
    console.log(import_chalk2.default.green("\u2713 Server started successfully"));
    console.log("");
    console.log(import_chalk2.default.cyan(`   API: ${url}`));
    console.log(import_chalk2.default.gray(`   Health: ${url}/api/health`));
    console.log("");
    console.log(import_chalk2.default.gray("   Press Ctrl+C to stop"));
    console.log("");
    if (options.open) {
      console.log(import_chalk2.default.yellow("   Note: Static UI not bundled yet."));
      console.log(import_chalk2.default.gray("   To view the UI, run the Next.js app:"));
      console.log(import_chalk2.default.cyan("   cd apps/web && pnpm dev"));
      console.log("");
    }
    process.on("SIGINT", async () => {
      console.log("");
      console.log(import_chalk2.default.yellow("Shutting down..."));
      await close();
      console.log(import_chalk2.default.green("\u2713 Server stopped"));
      process.exit(0);
    });
    process.on("SIGTERM", async () => {
      await close();
      process.exit(0);
    });
    await new Promise(() => {
    });
  } catch (error) {
    console.error(import_chalk2.default.red("\u2717 Failed to start server:"));
    console.error(import_chalk2.default.red(`   ${error instanceof Error ? error.message : error}`));
    process.exit(1);
  }
});

// src/commands/status.ts
var import_commander3 = require("commander");
var import_chalk3 = __toESM(require("chalk"));
var statusCommand = new import_commander3.Command("status").description("Show current fleet and runway status").option("-v, --verbose", "Show detailed information").action(async (options) => {
  console.log(import_chalk3.default.cyan("\u{1F4CA} DevPilot Status"));
  console.log("");
  console.log(import_chalk3.default.white("Fleet Status:"));
  console.log(import_chalk3.default.gray("  Active Sessions: ") + import_chalk3.default.green("3"));
  console.log(import_chalk3.default.gray("  Needs Spec: ") + import_chalk3.default.yellow("1"));
  console.log(import_chalk3.default.gray("  Fleet Utilization: ") + import_chalk3.default.cyan("75%"));
  console.log("");
  console.log(import_chalk3.default.white("Runway:"));
  console.log(import_chalk3.default.gray("  Ready Items: ") + import_chalk3.default.green("2"));
  console.log(import_chalk3.default.gray("  Refining: ") + import_chalk3.default.blue("1"));
  console.log(import_chalk3.default.gray("  Shaping: ") + import_chalk3.default.magenta("2"));
  console.log(import_chalk3.default.gray("  Directional: ") + import_chalk3.default.gray("3"));
  console.log(import_chalk3.default.gray("  Runway Hours: ") + import_chalk3.default.green("4.2h"));
  console.log("");
  console.log(import_chalk3.default.white("Conductor Score:"));
  console.log(import_chalk3.default.gray("  Total: ") + import_chalk3.default.magenta("742") + import_chalk3.default.gray("/1000"));
  console.log(import_chalk3.default.gray("  Rank: ") + import_chalk3.default.cyan("#23"));
  if (options.verbose) {
    console.log("");
    console.log(import_chalk3.default.white("Score Breakdown:"));
    console.log(import_chalk3.default.gray("  Fleet Utilization: ") + import_chalk3.default.white("156/200"));
    console.log(import_chalk3.default.gray("  Runway Health: ") + import_chalk3.default.white("148/200"));
    console.log(import_chalk3.default.gray("  Plan Accuracy: ") + import_chalk3.default.white("162/200"));
    console.log(import_chalk3.default.gray("  Cost Efficiency: ") + import_chalk3.default.white("138/200"));
    console.log(import_chalk3.default.gray("  Velocity Trend: ") + import_chalk3.default.white("138/200"));
  }
});

// src/commands/config.ts
var import_commander4 = require("commander");
var import_fs3 = require("fs");
var import_path3 = require("path");
var import_chalk4 = __toESM(require("chalk"));
var import_yaml = __toESM(require("yaml"));
var import_core = require("@devpilot.sh/core");
var linearCommand = new import_commander4.Command("linear").description("Configure Linear integration").option("--api-key <key>", "Linear API key").option("--team-id <id>", "Linear team ID").option("--test", "Test the connection").action(async (options) => {
  const configPath = (0, import_path3.join)(process.cwd(), ".devpilot", "config.yaml");
  if (!(0, import_fs3.existsSync)(configPath)) {
    console.log(import_chalk4.default.red('DevPilot not initialized. Run "devpilot init" first.'));
    return;
  }
  const configContent = (0, import_fs3.readFileSync)(configPath, "utf-8");
  const config = import_yaml.default.parse(configContent);
  if (!config.integrations) config.integrations = {};
  if (!config.integrations.linear) config.integrations.linear = {};
  if (options.apiKey) {
    config.integrations.linear.apiKey = options.apiKey;
    (0, import_fs3.writeFileSync)(configPath, import_yaml.default.stringify(config));
    console.log(import_chalk4.default.green("Linear API key saved."));
  }
  if (options.teamId) {
    config.integrations.linear.teamId = options.teamId;
    (0, import_fs3.writeFileSync)(configPath, import_yaml.default.stringify(config));
    console.log(import_chalk4.default.green("Linear team ID saved."));
  }
  if (options.test || options.apiKey && options.teamId) {
    const apiKey = config.integrations.linear.apiKey;
    const teamId = config.integrations.linear.teamId;
    if (!apiKey || !teamId) {
      console.log(import_chalk4.default.yellow("Missing API key or team ID. Set both to test connection."));
      return;
    }
    console.log(import_chalk4.default.cyan("Testing Linear connection..."));
    try {
      const client = import_core.linear.initLinearClient({ apiKey, teamId });
      const team = await client.getTeam();
      console.log(import_chalk4.default.green(`Connected to Linear team: ${team.name} (${team.key})`));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.log(import_chalk4.default.red(`Connection failed: ${message}`));
    }
  }
  if (!options.apiKey && !options.teamId && !options.test) {
    const apiKey = config.integrations.linear.apiKey;
    const teamId = config.integrations.linear.teamId;
    console.log(import_chalk4.default.cyan("Linear Configuration:"));
    console.log(`  API Key: ${apiKey ? import_chalk4.default.green("configured") : import_chalk4.default.yellow("not set")}`);
    console.log(`  Team ID: ${teamId || import_chalk4.default.yellow("not set")}`);
  }
});
var configCommand = new import_commander4.Command("config").description("Manage DevPilot configuration").argument("[key]", "Configuration key (e.g., ui.port)").argument("[value]", "Value to set").option("-l, --list", "List all configuration").action(async (key, value, options) => {
  const configPath = (0, import_path3.join)(process.cwd(), ".devpilot", "config.yaml");
  if (!(0, import_fs3.existsSync)(configPath)) {
    console.log(import_chalk4.default.red('\u274C DevPilot not initialized. Run "devpilot init" first.'));
    return;
  }
  const configContent = (0, import_fs3.readFileSync)(configPath, "utf-8");
  const config = import_yaml.default.parse(configContent);
  if (options.list || !key && !value) {
    console.log(import_chalk4.default.cyan("DevPilot Configuration:"));
    console.log("");
    console.log(import_yaml.default.stringify(config));
    return;
  }
  if (key && !value) {
    const keys = key.split(".");
    let current = config;
    for (const k of keys) {
      if (current && typeof current === "object" && k in current) {
        current = current[k];
      } else {
        console.log(import_chalk4.default.red(`\u274C Key "${key}" not found.`));
        return;
      }
    }
    console.log(current);
    return;
  }
  if (key && value) {
    const keys = key.split(".");
    let current = config;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in current)) {
        current[k] = {};
      }
      current = current[k];
    }
    let parsedValue = value;
    try {
      parsedValue = JSON.parse(value);
    } catch {
      if (value === "true") parsedValue = true;
      else if (value === "false") parsedValue = false;
      else if (!isNaN(Number(value))) parsedValue = Number(value);
    }
    current[keys[keys.length - 1]] = parsedValue;
    (0, import_fs3.writeFileSync)(configPath, import_yaml.default.stringify(config));
    console.log(import_chalk4.default.green(`\u2705 Set ${key} = ${JSON.stringify(parsedValue)}`));
  }
}).addCommand(linearCommand);

// src/commands/setup.ts
var import_commander5 = require("commander");
var import_fs5 = require("fs");
var import_path5 = require("path");
var import_chalk6 = __toESM(require("chalk"));
var import_yaml2 = __toESM(require("yaml"));
var readline = __toESM(require("readline"));
var import_core2 = require("@devpilot.sh/core");

// src/utils/orchestrator.ts
var import_child_process = require("child_process");
var import_fs4 = require("fs");
var import_path4 = require("path");
var import_os = require("os");
var import_chalk5 = __toESM(require("chalk"));
function checkCommand(cmd, versionArg = "--version") {
  try {
    const result = (0, import_child_process.spawnSync)(cmd, [versionArg], { encoding: "utf-8", stdio: "pipe" });
    if (result.status === 0) {
      const versionMatch = result.stdout.match(/(\d+\.\d+(\.\d+)?)/);
      return {
        installed: true,
        version: versionMatch ? versionMatch[1] : null
      };
    }
    return { installed: false, version: null };
  } catch {
    return { installed: false, version: null };
  }
}
function versionMeetsMinimum(version, minimum) {
  if (!version) return false;
  const vParts = version.split(".").map(Number);
  const mParts = minimum.split(".").map(Number);
  for (let i = 0; i < mParts.length; i++) {
    if ((vParts[i] || 0) > mParts[i]) return true;
    if ((vParts[i] || 0) < mParts[i]) return false;
  }
  return true;
}
function checkSystemRequirements() {
  const node = checkCommand("node");
  const nodeMeetsMin = versionMeetsMinimum(node.version, "20.0.0");
  const git = checkCommand("git");
  const gitMeetsMin = versionMeetsMinimum(git.version, "2.25.0");
  const tmux = checkCommand("tmux", "-V");
  const gh = checkCommand("gh");
  let ghAuthenticated = false;
  if (gh.installed) {
    try {
      const result = (0, import_child_process.spawnSync)("gh", ["auth", "status"], { encoding: "utf-8", stdio: "pipe" });
      ghAuthenticated = result.status === 0;
    } catch {
      ghAuthenticated = false;
    }
  }
  const rtk = checkCommand("rtk");
  const cavemanInstalled = isCavemanInstalled();
  return {
    node: { ...node, meetsMinimum: nodeMeetsMin },
    git: { ...git, meetsMinimum: gitMeetsMin },
    tmux: { installed: tmux.installed },
    gh: { installed: gh.installed, authenticated: ghAuthenticated },
    rtk: { installed: rtk.installed, version: rtk.version },
    caveman: { installed: cavemanInstalled }
  };
}
function printRequirementsStatus(reqs) {
  console.log(import_chalk5.default.cyan("\nSystem Requirements:"));
  console.log("");
  if (reqs.node.installed && reqs.node.meetsMinimum) {
    console.log(import_chalk5.default.green(`  \u2713 Node.js ${reqs.node.version}`));
  } else if (reqs.node.installed) {
    console.log(import_chalk5.default.yellow(`  \u26A0 Node.js ${reqs.node.version} (requires 20.0.0+)`));
  } else {
    console.log(import_chalk5.default.red("  \u2717 Node.js not found"));
  }
  if (reqs.git.installed && reqs.git.meetsMinimum) {
    console.log(import_chalk5.default.green(`  \u2713 Git ${reqs.git.version}`));
  } else if (reqs.git.installed) {
    console.log(import_chalk5.default.yellow(`  \u26A0 Git ${reqs.git.version} (requires 2.25.0+)`));
  } else {
    console.log(import_chalk5.default.red("  \u2717 Git not found"));
  }
  if (reqs.tmux.installed) {
    console.log(import_chalk5.default.green("  \u2713 tmux"));
  } else {
    console.log(import_chalk5.default.yellow("  \u26A0 tmux not found (optional, for session management)"));
  }
  if (reqs.gh.installed && reqs.gh.authenticated) {
    console.log(import_chalk5.default.green("  \u2713 GitHub CLI (authenticated)"));
  } else if (reqs.gh.installed) {
    console.log(import_chalk5.default.yellow("  \u26A0 GitHub CLI (not authenticated - run: gh auth login)"));
  } else {
    console.log(import_chalk5.default.yellow("  \u26A0 GitHub CLI not found (optional, for PR creation)"));
  }
  if (reqs.rtk.installed) {
    console.log(import_chalk5.default.green(`  \u2713 RTK ${reqs.rtk.version || ""} (token optimization)`));
  } else {
    console.log(import_chalk5.default.yellow("  \u26A0 RTK not found (recommended, for 60-90% token savings)"));
  }
  if (reqs.caveman.installed) {
    console.log(import_chalk5.default.green("  \u2713 Caveman plugin (output token compression)"));
  } else {
    console.log(import_chalk5.default.yellow("  \u26A0 Caveman not found (optional, for ~65-75% output token savings)"));
  }
}
function isOrchestratorInstalled() {
  try {
    const result = (0, import_child_process.spawnSync)("npx", ["@composio/ao-cli", "--version"], {
      encoding: "utf-8",
      stdio: "pipe"
    });
    return result.status === 0;
  } catch {
    return false;
  }
}
function installOrchestrator() {
  console.log(import_chalk5.default.cyan("\nInstalling @composio/ao-cli..."));
  try {
    (0, import_child_process.execSync)("npm install -g @composio/ao-cli", { stdio: "inherit" });
    console.log(import_chalk5.default.green("\u2713 @composio/ao-cli installed successfully"));
    return true;
  } catch {
    console.log(import_chalk5.default.red("\u2717 Failed to install @composio/ao-cli"));
    console.log(import_chalk5.default.gray("  Try manually: npm install -g @composio/ao-cli"));
    return false;
  }
}
function isRtkInstalled() {
  try {
    const result = (0, import_child_process.spawnSync)("rtk", ["--version"], { encoding: "utf-8", stdio: "pipe" });
    return result.status === 0;
  } catch {
    return false;
  }
}
function installRtk() {
  const hasCargo = (0, import_child_process.spawnSync)("cargo", ["--version"], { encoding: "utf-8", stdio: "pipe" }).status === 0;
  if (hasCargo) {
    console.log(import_chalk5.default.cyan("\n  Installing RTK via cargo (this may take a few minutes)..."));
    try {
      (0, import_child_process.execSync)("cargo install --git https://github.com/rtk-ai/rtk", { stdio: "inherit" });
      console.log(import_chalk5.default.green("  \u2713 RTK installed successfully"));
      return true;
    } catch {
      console.log(import_chalk5.default.red("  \u2717 Failed to install RTK via cargo"));
    }
  }
  console.log(import_chalk5.default.cyan("\n  Installing RTK via install script..."));
  try {
    (0, import_child_process.execSync)("curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh", {
      stdio: "inherit"
    });
    console.log(import_chalk5.default.green("  \u2713 RTK installed successfully"));
    return true;
  } catch {
    console.log(import_chalk5.default.red("  \u2717 Failed to install RTK"));
    console.log(import_chalk5.default.gray("  Install manually: cargo install --git https://github.com/rtk-ai/rtk"));
    console.log(import_chalk5.default.gray("  Or: brew install rtk"));
    return false;
  }
}
function initRtkHook() {
  console.log(import_chalk5.default.cyan("\n  Initializing RTK hook for Claude Code..."));
  try {
    (0, import_child_process.execSync)("rtk init -g", { encoding: "utf-8", stdio: "pipe" });
    console.log(import_chalk5.default.green("  \u2713 RTK hook initialized"));
    return true;
  } catch {
    console.log(import_chalk5.default.yellow("  \u26A0 RTK hook init requires manual step: rtk init -g"));
    return false;
  }
}
function isCavemanInstalled() {
  const claudeDir = (0, import_path4.join)((0, import_os.homedir)(), ".claude");
  if ((0, import_fs4.existsSync)((0, import_path4.join)(claudeDir, "hooks", "caveman-activate.js"))) {
    return true;
  }
  const settingsPath = (0, import_path4.join)(claudeDir, "settings.json");
  if ((0, import_fs4.existsSync)(settingsPath)) {
    try {
      const settings = JSON.parse((0, import_fs4.readFileSync)(settingsPath, "utf-8"));
      const settingsStr = JSON.stringify(settings);
      if (settingsStr.includes("caveman")) {
        return true;
      }
    } catch {
    }
  }
  return false;
}
function installCaveman() {
  console.log(import_chalk5.default.cyan("\n  Installing Caveman plugin for Claude Code..."));
  try {
    (0, import_child_process.execSync)("npx -y skills add JuliusBrussee/caveman", {
      stdio: "inherit",
      timeout: 12e4
    });
    console.log(import_chalk5.default.green("  \u2713 Caveman plugin installed successfully"));
    return true;
  } catch {
    console.log(import_chalk5.default.yellow("  npx skills add failed, trying hook install script..."));
    try {
      (0, import_child_process.execSync)(
        "bash <(curl -fsSL https://raw.githubusercontent.com/JuliusBrussee/caveman/main/hooks/install.sh)",
        { stdio: "inherit", shell: "/bin/bash", timeout: 6e4 }
      );
      console.log(import_chalk5.default.green("  \u2713 Caveman hooks installed successfully"));
      return true;
    } catch {
      console.log(import_chalk5.default.red("  \u2717 Failed to install Caveman plugin"));
      console.log(import_chalk5.default.gray("  Install manually: npx skills add JuliusBrussee/caveman"));
      return false;
    }
  }
}
function detectRepoInfo(cwd) {
  try {
    const remoteResult = (0, import_child_process.spawnSync)("git", ["remote", "get-url", "origin"], {
      cwd,
      encoding: "utf-8",
      stdio: "pipe"
    });
    if (remoteResult.status !== 0) return null;
    const remoteUrl = remoteResult.stdout.trim();
    let repo = "";
    const httpsMatch = remoteUrl.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/);
    const sshMatch = remoteUrl.match(/git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/);
    if (httpsMatch) {
      repo = httpsMatch[1];
    } else if (sshMatch) {
      repo = sshMatch[1];
    } else {
      return null;
    }
    const branchResult = (0, import_child_process.spawnSync)("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd,
      encoding: "utf-8",
      stdio: "pipe"
    });
    const branch = branchResult.status === 0 ? branchResult.stdout.trim() : "main";
    return { repo, branch };
  } catch {
    return null;
  }
}
function generateOrchestratorConfig(options) {
  const { cwd, linearTeamId, agentRules } = options;
  const projectName = (0, import_path4.basename)(cwd);
  const repoInfo = detectRepoInfo(cwd);
  const config = {
    dataDir: "~/.agent-orchestrator",
    worktreeDir: "~/.worktrees",
    projects: {
      [projectName]: {
        repo: repoInfo?.repo || `owner/${projectName}`,
        path: cwd,
        defaultBranch: repoInfo?.branch || "main"
      }
    }
  };
  if (linearTeamId) {
    config.projects[projectName].tracker = {
      plugin: "linear",
      teamId: linearTeamId
    };
  }
  if (agentRules) {
    config.projects[projectName].agentRules = agentRules;
  } else {
    config.projects[projectName].agentRules = `Always link Linear tickets in commit messages.
Run tests before pushing.
Use conventional commits (feat:, fix:, chore:).
Create small, focused PRs.`;
  }
  return config;
}
function writeOrchestratorConfig(cwd, config) {
  const YAML3 = require("yaml");
  const configPath = (0, import_path4.join)(cwd, "agent-orchestrator.yaml");
  const yamlContent = YAML3.stringify(config);
  (0, import_fs4.writeFileSync)(configPath, yamlContent);
}
function orchestratorConfigExists(cwd) {
  return (0, import_fs4.existsSync)((0, import_path4.join)(cwd, "agent-orchestrator.yaml"));
}
function getInstallInstructions(reqs) {
  const instructions = [];
  if (!reqs.node.installed || !reqs.node.meetsMinimum) {
    instructions.push("Node.js 20+: https://nodejs.org or use nvm: nvm install 20");
  }
  if (!reqs.git.installed || !reqs.git.meetsMinimum) {
    instructions.push("Git 2.25+: https://git-scm.com/downloads");
  }
  if (!reqs.tmux.installed) {
    instructions.push("tmux: brew install tmux (macOS) or apt install tmux (Linux)");
  }
  if (!reqs.gh.installed) {
    instructions.push("GitHub CLI: brew install gh (macOS) or https://cli.github.com");
  } else if (!reqs.gh.authenticated) {
    instructions.push("GitHub CLI auth: gh auth login");
  }
  if (!reqs.rtk.installed) {
    instructions.push("RTK (token savings): cargo install --git https://github.com/rtk-ai/rtk");
  }
  if (!reqs.caveman.installed) {
    instructions.push("Caveman (output compression): npx skills add JuliusBrussee/caveman");
  }
  return instructions;
}

// src/commands/setup.ts
function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
async function confirm(question, defaultYes = true) {
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = await prompt(`${question} ${hint}: `);
  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith("y");
}
var setupCommand = new import_commander5.Command("setup").description("Interactive setup wizard for DevPilot and agent-orchestrator").option("--linear-only", "Only configure Linear integration").option("--orchestrator-only", "Only configure agent-orchestrator").option("--check", "Only check system requirements").option("-y, --yes", "Accept all defaults (non-interactive mode)").action(async (options) => {
  const nonInteractive = options.yes;
  const cwd = process.cwd();
  const configPath = (0, import_path5.join)(cwd, ".devpilot", "config.yaml");
  if (!(0, import_fs5.existsSync)(configPath)) {
    console.log(import_chalk6.default.red('DevPilot not initialized. Run "devpilot init" first.'));
    return;
  }
  console.log(import_chalk6.default.bold.cyan("\n DevPilot Setup Wizard\n"));
  console.log(import_chalk6.default.gray("This wizard will help you configure DevPilot and agent-orchestrator.\n"));
  console.log(import_chalk6.default.bold("Step 1: Checking System Requirements"));
  const reqs = checkSystemRequirements();
  printRequirementsStatus(reqs);
  if (!reqs.node.meetsMinimum) {
    console.log(import_chalk6.default.red("\nNode.js 20+ is required. Please upgrade and try again."));
    return;
  }
  if (!reqs.git.meetsMinimum) {
    console.log(import_chalk6.default.red("\nGit 2.25+ is required. Please upgrade and try again."));
    return;
  }
  const instructions = getInstallInstructions(reqs);
  if (instructions.length > 0) {
    console.log(import_chalk6.default.yellow("\nOptional installations:"));
    instructions.forEach((inst) => console.log(import_chalk6.default.gray(`  - ${inst}`)));
  }
  if (options.check) {
    return;
  }
  console.log("");
  if (!options.orchestratorOnly) {
    console.log(import_chalk6.default.bold("Step 2: Linear Integration"));
    console.log(import_chalk6.default.gray("Linear integration enables ticket tracking and auto-status updates.\n"));
    const configContent = (0, import_fs5.readFileSync)(configPath, "utf-8");
    const config = import_yaml2.default.parse(configContent);
    const existingApiKey = config.integrations?.linear?.apiKey;
    const existingTeamId = config.integrations?.linear?.teamId;
    if (existingApiKey && existingTeamId) {
      console.log(import_chalk6.default.green("  Linear is already configured."));
      if (!nonInteractive) {
        const reconfigure = await confirm("  Reconfigure Linear?", false);
        if (reconfigure) {
          await configureLinear(configPath, config);
        }
      }
      console.log("");
    } else if (nonInteractive) {
      console.log(import_chalk6.default.gray("  Skipping Linear setup (non-interactive mode).\n"));
    } else {
      const setupLinear = await confirm("  Would you like to set up Linear integration?");
      if (setupLinear) {
        await configureLinear(configPath, config);
      } else {
        console.log(import_chalk6.default.gray("  Skipping Linear setup.\n"));
      }
    }
  }
  if (!options.linearOnly) {
    console.log(import_chalk6.default.bold("Step 3: Agent Orchestrator"));
    console.log(import_chalk6.default.gray("Agent orchestrator manages parallel AI coding agents.\n"));
    const installed = isOrchestratorInstalled();
    if (!installed) {
      console.log(import_chalk6.default.yellow("  @composio/ao-cli is not installed."));
      if (nonInteractive) {
        console.log(import_chalk6.default.gray("  Skipping installation (non-interactive mode)."));
        console.log(import_chalk6.default.gray("  Install later with: npm install -g @composio/ao-cli\n"));
      } else {
        const install = await confirm("  Install @composio/ao-cli globally?");
        if (install) {
          const success = installOrchestrator();
          if (!success) {
            console.log(import_chalk6.default.yellow("  Continuing without agent-orchestrator CLI...\n"));
          }
        } else {
          console.log(import_chalk6.default.gray("  Skipping installation. You can install later with:"));
          console.log(import_chalk6.default.cyan("    npm install -g @composio/ao-cli\n"));
        }
      }
    } else {
      console.log(import_chalk6.default.green("  @composio/ao-cli is installed."));
    }
    if (orchestratorConfigExists(cwd)) {
      console.log(import_chalk6.default.green("  agent-orchestrator.yaml already exists."));
      if (!nonInteractive) {
        const regenerate = await confirm("  Regenerate configuration?", false);
        if (regenerate) {
          await configureOrchestrator(cwd, configPath, nonInteractive);
        }
      }
    } else {
      if (nonInteractive) {
        await configureOrchestrator(cwd, configPath, nonInteractive);
      } else {
        const generate = await confirm("  Generate agent-orchestrator.yaml?");
        if (generate) {
          await configureOrchestrator(cwd, configPath, nonInteractive);
        } else {
          console.log(import_chalk6.default.gray("  Skipping config generation.\n"));
        }
      }
    }
  }
  if (!options.linearOnly && !options.orchestratorOnly) {
    console.log(import_chalk6.default.bold("Step 4: RTK Token Optimization"));
    console.log(import_chalk6.default.gray("RTK reduces LLM token consumption by 60-90% across fleet agents.\n"));
    const rtkInstalled = isRtkInstalled();
    if (rtkInstalled) {
      console.log(import_chalk6.default.green("  RTK is already installed."));
      console.log(import_chalk6.default.gray("  Ensuring Claude Code hook is configured..."));
      initRtkHook();
    } else if (nonInteractive) {
      console.log(import_chalk6.default.gray("  Installing RTK (non-interactive mode)..."));
      const success = installRtk();
      if (success) {
        initRtkHook();
      }
    } else {
      const install = await confirm("  Install RTK for token-optimized agent sessions?");
      if (install) {
        const success = installRtk();
        if (success) {
          initRtkHook();
        }
      } else {
        console.log(import_chalk6.default.gray("  Skipping RTK installation. Install later with:"));
        console.log(import_chalk6.default.cyan("    cargo install --git https://github.com/rtk-ai/rtk"));
        console.log(import_chalk6.default.cyan("    rtk init -g\n"));
      }
    }
    console.log("");
  }
  if (!options.linearOnly && !options.orchestratorOnly) {
    console.log(import_chalk6.default.bold("Step 5: Caveman Output Compression"));
    console.log(import_chalk6.default.gray("Caveman reduces output token usage by ~65-75% across fleet agents.\n"));
    const cavemanInstalled = isCavemanInstalled();
    if (cavemanInstalled) {
      console.log(import_chalk6.default.green("  Caveman plugin is already installed."));
      console.log(import_chalk6.default.gray("  Activate in any session with /caveman (modes: lite, full, ultra)"));
    } else if (nonInteractive) {
      console.log(import_chalk6.default.gray("  Installing Caveman plugin (non-interactive mode)..."));
      installCaveman();
    } else {
      const install = await confirm("  Install Caveman plugin for compressed agent output?");
      if (install) {
        installCaveman();
      } else {
        console.log(import_chalk6.default.gray("  Skipping Caveman installation. Install later with:"));
        console.log(import_chalk6.default.cyan("    npx skills add JuliusBrussee/caveman\n"));
      }
    }
    console.log("");
  }
  console.log(import_chalk6.default.bold.green("\nSetup Complete!\n"));
  console.log(import_chalk6.default.white("Next steps:"));
  console.log(import_chalk6.default.gray("  1. Run ") + import_chalk6.default.cyan("devpilot serve") + import_chalk6.default.gray(" to start the UI"));
  console.log(import_chalk6.default.gray("  2. Run ") + import_chalk6.default.cyan("ao start") + import_chalk6.default.gray(" to start agent orchestrator"));
  console.log(import_chalk6.default.gray("  3. Use the UI to create items and dispatch to the fleet"));
  console.log(import_chalk6.default.gray("  4. Run ") + import_chalk6.default.cyan("rtk gain") + import_chalk6.default.gray(" to monitor token savings"));
  console.log(import_chalk6.default.gray("  5. Use ") + import_chalk6.default.cyan("/caveman") + import_chalk6.default.gray(" in sessions for compressed output\n"));
});
async function configureLinear(configPath, config) {
  console.log("");
  console.log(import_chalk6.default.gray("  Get your API key from: https://linear.app/settings/api\n"));
  const apiKey = await prompt("  Linear API key: ");
  if (!apiKey) {
    console.log(import_chalk6.default.yellow("  No API key provided. Skipping Linear setup.\n"));
    return;
  }
  console.log(import_chalk6.default.cyan("\n  Connecting to Linear..."));
  try {
    const tempClient = import_core2.linear.initLinearClient({ apiKey, teamId: "" });
    const teams = await tempClient.getTeams();
    if (teams.length === 0) {
      console.log(import_chalk6.default.yellow("  No teams found. Make sure you have access to at least one team."));
      return;
    }
    console.log(import_chalk6.default.green(`  Found ${teams.length} team(s):
`));
    teams.forEach((team, i) => {
      console.log(import_chalk6.default.white(`    ${i + 1}. ${team.name} (${team.key})`));
    });
    const teamChoice = await prompt("\n  Select team number: ");
    const teamIndex = parseInt(teamChoice, 10) - 1;
    if (isNaN(teamIndex) || teamIndex < 0 || teamIndex >= teams.length) {
      console.log(import_chalk6.default.yellow("  Invalid selection. Skipping Linear setup."));
      return;
    }
    const selectedTeam = teams[teamIndex];
    if (!config.integrations) config.integrations = {};
    config.integrations.linear = {
      apiKey,
      teamId: selectedTeam.id,
      teamName: selectedTeam.name,
      teamKey: selectedTeam.key
    };
    (0, import_fs5.writeFileSync)(configPath, import_yaml2.default.stringify(config));
    console.log(import_chalk6.default.green(`
  Linear configured for team: ${selectedTeam.name}
`));
    console.log(import_chalk6.default.gray("  For agent-orchestrator, also set the LINEAR_API_KEY environment variable:"));
    console.log(import_chalk6.default.cyan(`    export LINEAR_API_KEY="${apiKey}"
`));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.log(import_chalk6.default.red(`  Failed to connect: ${message}`));
    console.log(import_chalk6.default.gray("  You can configure Linear later with: devpilot config linear\n"));
  }
}
async function configureOrchestrator(cwd, configPath, nonInteractive = false) {
  const config = import_yaml2.default.parse((0, import_fs5.readFileSync)(configPath, "utf-8"));
  const linearTeamId = config.integrations?.linear?.teamId;
  const aoConfig = generateOrchestratorConfig({
    cwd,
    linearTeamId
  });
  if (!nonInteractive) {
    const customRules = await confirm("\n  Would you like to customize agent rules?", false);
    if (customRules) {
      console.log(import_chalk6.default.gray("  Enter rules (one per line, empty line to finish):"));
      const rules = [];
      let line = "";
      do {
        line = await prompt("    > ");
        if (line) rules.push(line);
      } while (line);
      if (rules.length > 0) {
        const projectName = Object.keys(aoConfig.projects)[0];
        aoConfig.projects[projectName].agentRules = rules.join("\n");
      }
    }
  }
  writeOrchestratorConfig(cwd, aoConfig);
  console.log(import_chalk6.default.green("\n  Created agent-orchestrator.yaml"));
  console.log(import_chalk6.default.gray("\n  Configuration preview:"));
  console.log(import_chalk6.default.gray("  " + "-".repeat(40)));
  const preview = import_yaml2.default.stringify(aoConfig).split("\n").slice(0, 15).join("\n");
  preview.split("\n").forEach((line) => console.log(import_chalk6.default.gray(`  ${line}`)));
  console.log(import_chalk6.default.gray("  ...\n"));
}

// src/commands/bridge.ts
var import_commander9 = require("commander");

// src/commands/bridge/connect.ts
var import_os2 = __toESM(require("os"));
var import_commander6 = require("commander");
var import_chalk7 = __toESM(require("chalk"));
var import_bridge_client = require("@devpilot.sh/bridge-client");

// src/commands/bridge/dispatch-handler.ts
var import_core3 = require("@devpilot.sh/core");
var inFlight = /* @__PURE__ */ new Map();
function service(opts) {
  const existing = import_core3.orchestrator.getOrchestratorServiceOrNull();
  if (existing) return existing;
  return import_core3.orchestrator.initOrchestratorService({
    mode: opts.orchestratorMode,
    url: opts.httpUrl,
    apiKey: opts.apiKey,
    callbackUrl: opts.callbackUrl,
    aoProjectName: opts.aoProjectName,
    aoPath: opts.aoPath,
    pollIntervalMs: opts.pollIntervalMs
  });
}
function ensurePoller(opts, svc) {
  if (import_core3.orchestrator.isStatusPollerInitialized()) return;
  const log = opts.onLog ?? (() => {
  });
  const poller = import_core3.orchestrator.initStatusPoller(svc, {
    pollIntervalMs: opts.pollIntervalMs ?? 2e3,
    maxRetries: 3,
    onStatusUpdate: async (sessionId, status) => {
      if (!inFlight.has(sessionId)) return;
      if (status.status === "complete" || status.status === "error" || status.status === "cancelled") {
        return;
      }
      try {
        await opts.client.reportSessionStatus(sessionId, {
          status: status.status === "queued" ? "dispatched" : "running",
          progressPercent: Math.max(0, Math.min(100, status.progressPercent ?? 0)),
          message: status.message ?? status.currentStep
        });
      } catch (e) {
        log(`status report failed: ${e instanceof Error ? e.message : e}`);
      }
    },
    onComplete: async (sessionId, report) => {
      const settle = inFlight.get(sessionId);
      try {
        await opts.client.reportSessionComplete(sessionId, {
          success: report.success,
          ...report.prUrl ? { prUrl: report.prUrl } : {},
          ...report.summary ? { summary: report.summary } : {},
          ...report.tokensUsed !== void 0 ? { tokensUsed: report.tokensUsed } : {},
          ...report.costUsd !== void 0 ? { costUsd: report.costUsd } : {},
          ...report.success ? {} : { errorMessage: report.error?.message ?? "Agent failed" }
        });
        settle?.({ ok: report.success, error: report.error?.message, reported: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log(`completion report failed: ${msg}`);
        settle?.({ ok: false, error: msg });
      }
    },
    onError: async (sessionId, error) => {
      const settle = inFlight.get(sessionId);
      try {
        await opts.client.reportSessionComplete(sessionId, {
          success: false,
          errorMessage: error.message
        });
      } catch {
      }
      settle?.({ ok: false, error: error.message, reported: true });
    }
  });
  poller.start();
}
function createBridgeDispatchHandler(opts) {
  const log = opts.onLog ?? (() => {
  });
  return async function handle(message) {
    const { sessionId, linearIdentifier, title, repo } = message;
    log(`${linearIdentifier} \u2192 ${repo}: ${title}`);
    try {
      const svc = service(opts);
      ensurePoller(opts, svc);
      const request = import_core3.orchestrator.buildDispatchRequest({
        sessionId,
        repo,
        title,
        filePaths: [],
        linearTicketId: linearIdentifier,
        callbackUrl: opts.callbackUrl ?? ""
      });
      const settled = new Promise((resolve) => {
        inFlight.set(sessionId, resolve);
      });
      const response = await svc.dispatch(request);
      if (!response.accepted) {
        inFlight.delete(sessionId);
        throw new Error(response.error ?? "Orchestrator rejected the dispatch");
      }
      await opts.client.reportSessionStatus(sessionId, {
        status: "dispatched",
        progressPercent: 0,
        message: `Dispatched to local orchestrator (${opts.orchestratorMode})`
      });
      import_core3.orchestrator.getStatusPoller().trackSession(sessionId, response.orchestratorJobId ?? sessionId);
      const outcome = await settled;
      inFlight.delete(sessionId);
      if (!outcome.ok) {
        const e = new Error(outcome.error ?? "Session failed");
        e.alreadyReported = outcome.reported;
        throw e;
      }
      log(`${linearIdentifier} reported`);
    } catch (err) {
      inFlight.delete(sessionId);
      const reason = err instanceof Error ? err.message : String(err);
      log(`${linearIdentifier} failed: ${reason}`);
      if (!err?.alreadyReported) {
        try {
          await opts.client.reportSessionStatus(sessionId, {
            status: "error",
            progressPercent: 0,
            message: reason
          });
        } catch {
        }
      }
      throw new Error(reason);
    }
  };
}

// src/commands/bridge/connect.ts
var connectCommand = new import_commander6.Command("connect").description("Connect this machine to a DevPilot bridge and run dispatched work locally").option("-u, --url <url>", "Bridge URL", process.env.DEVPILOT_BRIDGE_URL).option("-t, --token <token>", "Orchestrator token (dp_orch_\u2026)", process.env.DEVPILOT_BRIDGE_TOKEN).option("-n, --name <name>", "Name for this machine", import_os2.default.hostname()).option("-r, --repos <repos>", "Comma-separated repos this machine handles").option("-m, --mode <mode>", "Local orchestrator mode (http|claude-session)", "http").option(
  "--transport <transport>",
  "realtime | poll \u2014 polling is fully correct, just higher latency",
  process.env.DEVPILOT_BRIDGE_TRANSPORT || "realtime"
).option("-j, --max-jobs <n>", "Max concurrent local jobs", "4").option("--http-url <url>", "Orchestrator URL (required for --mode http)").option("--ao-project <name>", "ao project name (for --mode ao-cli)").option("--ao-path <path>", "Path to the ao binary (default: ao on PATH)").action(async (options) => {
  if (!options.url) {
    console.error(import_chalk7.default.red("\u2717 Bridge URL required (--url or DEVPILOT_BRIDGE_URL)"));
    process.exit(1);
  }
  if (!options.token) {
    console.error(import_chalk7.default.red("\u2717 Token required (--token or DEVPILOT_BRIDGE_TOKEN)"));
    console.error(import_chalk7.default.gray("  Mint one in the dashboard under Settings \u2192 Tokens."));
    process.exit(1);
  }
  const repos = options.repos?.split(",").map((r) => r.trim()).filter(Boolean) ?? [];
  const maxConcurrentJobs = Math.max(1, parseInt(options.maxJobs, 10) || 4);
  console.log(import_chalk7.default.cyan("\u{1F309} DevPilot bridge"));
  console.log(import_chalk7.default.gray(`   ${options.url}`));
  console.log(import_chalk7.default.gray(`   machine: ${options.name}`));
  console.log("");
  if (options.mode === "ao-cli") {
    console.error(import_chalk7.default.red("\u2717 --mode ao-cli is deprecated and non-functional."));
    console.error(import_chalk7.default.gray("  `ao` is now a daemon on 127.0.0.1:3001; point http mode at it:"));
    console.error(import_chalk7.default.gray("    devpilot bridge connect --mode http --http-url http://127.0.0.1:3001"));
    process.exit(1);
  }
  if (options.mode === "http" && !options.httpUrl) {
    console.error(import_chalk7.default.red("\u2717 --mode http requires --http-url"));
    console.error(import_chalk7.default.gray("  For the ao daemon: --http-url http://127.0.0.1:3001"));
    process.exit(1);
  }
  const client = new import_bridge_client.BridgeClient({ bridgeUrl: options.url, token: options.token });
  let registration;
  try {
    registration = await client.register({ name: options.name, repos, maxConcurrentJobs });
  } catch (err) {
    console.error(import_chalk7.default.red("\u2717 Registration failed"));
    console.error(import_chalk7.default.red(`   ${err instanceof Error ? err.message : err}`));
    process.exit(1);
  }
  console.log(import_chalk7.default.green("\u2713 Registered"));
  console.log(import_chalk7.default.gray(`   orchestrator: ${registration.orchestratorId}`));
  console.log(import_chalk7.default.gray(`   repos: ${repos.join(", ") || "(none)"}`));
  if (repos.length === 0) {
    console.log(import_chalk7.default.yellow("   \u26A0 No repos specified \u2014 nothing can route to this machine."));
    console.log(import_chalk7.default.gray("     Re-run with --repos owner/name to receive dispatches."));
  }
  console.log("");
  const useRealtime = options.transport !== "poll" && registration.realtime !== null;
  if (options.transport !== "poll" && !registration.realtime) {
    console.log(import_chalk7.default.yellow("   Realtime unavailable from this bridge \u2014 polling instead."));
  }
  const loop = new import_bridge_client.DispatchLoop({
    client,
    orchestratorId: registration.orchestratorId,
    realtime: useRealtime && registration.realtime ? {
      supabaseUrl: registration.realtime.supabaseUrl,
      anonKey: registration.realtime.anonKey,
      jwt: registration.realtime.jwt
    } : null,
    maxConcurrent: maxConcurrentJobs,
    handler: createBridgeDispatchHandler({
      client,
      orchestratorMode: options.mode,
      httpUrl: options.httpUrl,
      aoProjectName: options.aoProject,
      aoPath: options.aoPath,
      onLog: (line) => console.log(import_chalk7.default.blue(`   ${line}`))
    }),
    onLog: (line) => console.log(import_chalk7.default.gray(`   ${line}`)),
    onError: (e) => console.log(import_chalk7.default.yellow(`   ${e.message}`))
  });
  const heartbeat = new import_bridge_client.HeartbeatService({
    client,
    activeJobs: () => loop.activeJobs,
    onError: (e) => console.log(import_chalk7.default.gray(`   heartbeat: ${e.message}`))
  });
  await loop.start();
  heartbeat.start();
  console.log(import_chalk7.default.green(`\u2713 Listening (${useRealtime ? "realtime" : "poll"})`));
  console.log(import_chalk7.default.gray("   Agents run on THIS machine. Ctrl+C to disconnect."));
  console.log("");
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("");
    console.log(import_chalk7.default.yellow("Disconnecting\u2026"));
    heartbeat.stop();
    await loop.stop();
    console.log(import_chalk7.default.green("\u2713 Disconnected"));
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
  await new Promise(() => {
  });
});

// src/commands/bridge/disconnect.ts
var import_commander7 = require("commander");
var import_chalk8 = __toESM(require("chalk"));
var disconnectCommand = new import_commander7.Command("disconnect").description("Disconnect from DevPilot cloud bridge").option("-u, --bridge-url <url>", "Bridge service URL", process.env.DEVPILOT_BRIDGE_URL).option("-k, --api-key <key>", "API key", process.env.DEVPILOT_BRIDGE_API_KEY).option("-i, --orchestrator-id <id>", "Orchestrator ID to disconnect").action(async (options) => {
  if (!options.bridgeUrl || !options.orchestratorId) {
    console.error(import_chalk8.default.red("\u2717 Error: Bridge URL and orchestrator ID required"));
    console.error(import_chalk8.default.gray("   Use: devpilot bridge disconnect -u <url> -i <orchestrator-id>"));
    process.exit(1);
  }
  console.log(import_chalk8.default.cyan("\u{1F309} Disconnecting from DevPilot Bridge"));
  console.log("");
  console.log(import_chalk8.default.gray(`   Bridge URL: ${options.bridgeUrl}`));
  console.log(import_chalk8.default.gray(`   Orchestrator ID: ${options.orchestratorId}`));
  console.log("");
  try {
    const response = await fetch(
      `${options.bridgeUrl}/api/orchestrators/${options.orchestratorId}`,
      {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${options.apiKey}`
        }
      }
    );
    if (response.ok) {
      console.log(import_chalk8.default.green("\u2713 Successfully disconnected from bridge"));
    } else {
      const errorText = await response.text();
      console.error(import_chalk8.default.red("\u2717 Failed to disconnect:"));
      console.error(import_chalk8.default.red(`   ${errorText}`));
      process.exit(1);
    }
  } catch (error) {
    console.error(import_chalk8.default.red("\u2717 Error disconnecting:"));
    console.error(import_chalk8.default.red(`   ${error instanceof Error ? error.message : error}`));
    process.exit(1);
  }
});

// src/commands/bridge/status.ts
var import_commander8 = require("commander");
var import_chalk9 = __toESM(require("chalk"));
var statusCommand2 = new import_commander8.Command("status").description("Check bridge connection status").option("-u, --bridge-url <url>", "Bridge service URL", process.env.DEVPILOT_BRIDGE_URL).option("-i, --orchestrator-id <id>", "Orchestrator ID").option("-k, --api-key <key>", "API key", process.env.DEVPILOT_BRIDGE_API_KEY).action(async (options) => {
  if (!options.bridgeUrl) {
    console.error(import_chalk9.default.red("\u2717 Error: Bridge URL required"));
    console.error(import_chalk9.default.gray("   Use: devpilot bridge status -u <url>"));
    process.exit(1);
  }
  console.log(import_chalk9.default.cyan("\u{1F309} DevPilot Bridge Status"));
  console.log("");
  try {
    const healthRes = await fetch(`${options.bridgeUrl}/health`);
    const health = await healthRes.json();
    console.log(import_chalk9.default.white("Bridge Status:"));
    if (health.status === "ok") {
      console.log(import_chalk9.default.gray("  Status: ") + import_chalk9.default.green("\u2713 Online"));
    } else {
      console.log(import_chalk9.default.gray("  Status: ") + import_chalk9.default.red("\u2717 Offline"));
    }
    console.log("");
    if (options.orchestratorId) {
      const orchRes = await fetch(
        `${options.bridgeUrl}/api/orchestrators/${options.orchestratorId}`,
        {
          headers: {
            "Authorization": `Bearer ${options.apiKey}`
          }
        }
      );
      if (orchRes.ok) {
        const orch = await orchRes.json();
        console.log(import_chalk9.default.white("Orchestrator Status:"));
        console.log(import_chalk9.default.gray("  ID: ") + import_chalk9.default.cyan(orch.id));
        console.log(import_chalk9.default.gray("  Name: ") + import_chalk9.default.white(orch.name));
        if (orch.isOnline) {
          console.log(import_chalk9.default.gray("  Online: ") + import_chalk9.default.green("\u2713"));
        } else {
          console.log(import_chalk9.default.gray("  Online: ") + import_chalk9.default.red("\u2717"));
        }
        console.log(import_chalk9.default.gray("  Active Jobs: ") + import_chalk9.default.yellow(orch.activeJobs));
        console.log(import_chalk9.default.gray("  Last Heartbeat: ") + import_chalk9.default.white(orch.lastHeartbeat || "Never"));
        console.log(import_chalk9.default.gray("  Repos: ") + import_chalk9.default.cyan(orch.repos?.join(", ") || "None"));
      } else {
        console.log(import_chalk9.default.white("Orchestrator Status:"));
        console.log(import_chalk9.default.gray("  ") + import_chalk9.default.red("Not found or unauthorized"));
      }
    }
  } catch (error) {
    console.error(import_chalk9.default.red("\u2717 Error checking status:"));
    console.error(import_chalk9.default.red(`   ${error instanceof Error ? error.message : error}`));
    process.exit(1);
  }
});

// src/commands/bridge.ts
var bridgeCommand = new import_commander9.Command("bridge").description("Manage connection to DevPilot cloud bridge").addCommand(connectCommand).addCommand(disconnectCommand).addCommand(statusCommand2);

// src/commands/session.ts
var import_commander13 = require("commander");

// src/commands/session/new.ts
var import_commander10 = require("commander");
var import_chalk10 = __toESM(require("chalk"));
var import_bridge_protocol = require("@devpilot.sh/bridge-protocol");
var newCommand = new import_commander10.Command("new").description("Create a shared session and print its join link").argument("<title>", "What this session is about (stored in plaintext \u2014 no secrets)").option("-u, --url <url>", "Bridge URL", process.env.DEVPILOT_BRIDGE_URL).option("-t, --token <token>", "Orchestrator token (dp_orch_\u2026)", process.env.DEVPILOT_BRIDGE_TOKEN).option("-o, --org <orgId>", "Organization id that will own the session").option("--issue <identifier>", "Linear issue identifier to attach, e.g. ENG-394").action(async (title, options) => {
  if (!options.url || !options.token) {
    console.error(import_chalk10.default.red("\u2717 Bridge URL and token required"));
    console.error(import_chalk10.default.gray("  --url / DEVPILOT_BRIDGE_URL, --token / DEVPILOT_BRIDGE_TOKEN"));
    process.exit(1);
  }
  if (!options.org) {
    console.error(import_chalk10.default.red("\u2717 --org <orgId> is required"));
    console.error(import_chalk10.default.gray("  The token is bound to one org; this must be that org."));
    process.exit(1);
  }
  const key = import_bridge_protocol.sessionCrypto.generateKey();
  const { joinKeyHash } = await import_bridge_protocol.sessionCrypto.deriveJoinCredentials(key);
  const base = options.url.replace(/\/+$/, "");
  const res = await fetch(`${base}/api/sessions/shared`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.token}` },
    body: JSON.stringify({
      orgId: options.org,
      title,
      joinKeyHash,
      ...options.issue ? { linearIdentifier: options.issue } : {}
    })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    console.error(import_chalk10.default.red(`\u2717 Could not create session (${res.status})`));
    console.error(import_chalk10.default.gray(`  ${(0, import_bridge_protocol.formatApiError)(body, res.statusText)}`));
    process.exit(1);
  }
  const { session } = await res.json();
  const link = (0, import_bridge_protocol.buildJoinLink)(base, session.id, key);
  console.log("");
  console.log(import_chalk10.default.cyan(`  ${session.title}`));
  console.log(import_chalk10.default.bold(`  ${link}`));
  console.log("");
  console.log(import_chalk10.default.yellow("  Anyone with this link can read the whole transcript."));
  console.log(import_chalk10.default.gray("  It carries the encryption key after the #, which never reaches"));
  console.log(import_chalk10.default.gray("  devpilot.sh. Send it the way you would send a password \u2014 not to"));
  console.log(import_chalk10.default.gray("  a public channel. To revoke it, re-key the session; that ends"));
  console.log(import_chalk10.default.gray("  access for this link but cannot un-send what was already read."));
  console.log("");
  console.log(import_chalk10.default.gray(`  Others join with:  devpilot session join "${import_chalk10.default.italic("<link>")}"`));
  console.log("");
});

// src/commands/session/join.ts
var import_os3 = __toESM(require("os"));
var import_commander11 = require("commander");
var import_chalk11 = __toESM(require("chalk"));
var import_bridge_client2 = require("@devpilot.sh/bridge-client");
var joinCommand = new import_commander11.Command("join").description("Join a shared session by link and post a message").argument("<url>", "Join link, including the #k=\u2026 fragment").option("-n, --name <name>", "Display name in the transcript", import_os3.default.hostname()).option("-m, --message <text>", "Post this message after joining").action(async (url, options) => {
  try {
    const client = await import_bridge_client2.SharedSessionClient.join({ link: url, displayName: options.name });
    const s = client.session;
    console.log(import_chalk11.default.cyan(`
  ${s.title}`));
    console.log(import_chalk11.default.gray(`  mode: ${s.mode}  \xB7  messages: ${s.lastSeq ?? 0}
`));
    if (options.message) {
      const posted = await client.post(options.message);
      console.log(import_chalk11.default.green(`  posted #${posted.seq}
`));
    }
    const participants = await client.who();
    for (const p of participants) {
      const agent = p.agentKind ? import_chalk11.default.gray(` [${p.agentKind}]`) : "";
      console.log(`  \xB7 ${p.displayName}${agent}${p.leftAt ? import_chalk11.default.gray(" (left)") : ""}`);
    }
    console.log("");
  } catch (err) {
    console.error(import_chalk11.default.red(`\u2717 ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  }
});

// src/commands/session/tail.ts
var import_os4 = __toESM(require("os"));
var import_commander12 = require("commander");
var import_chalk12 = __toESM(require("chalk"));
var import_bridge_client3 = require("@devpilot.sh/bridge-client");
var tailCommand = new import_commander12.Command("tail").description("Follow a shared session transcript in the terminal").argument("<url>", "Join link, including the #k=\u2026 fragment").option("-n, --name <name>", "Display name in the transcript", import_os4.default.hostname()).option("-i, --interval <seconds>", "Poll interval", "3").action(async (url, options) => {
  const intervalMs = Math.max(1, parseInt(options.interval, 10) || 3) * 1e3;
  let client;
  try {
    client = await import_bridge_client3.SharedSessionClient.join({ link: url, displayName: options.name });
  } catch (err) {
    console.error(import_chalk12.default.red(`\u2717 ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
    return;
  }
  const names = /* @__PURE__ */ new Map();
  for (const p of await client.who()) names.set(p.id, p.displayName);
  console.log(import_chalk12.default.cyan(`
  ${client.session.title}`));
  console.log(import_chalk12.default.gray(`  following \xB7 ctrl-c to stop
`));
  let cursor = 0;
  let stopped = false;
  process.on("SIGINT", () => {
    stopped = true;
    console.log(import_chalk12.default.gray("\n  stopped\n"));
    process.exit(0);
  });
  while (!stopped) {
    try {
      const { entries, latestSeq } = await client.read(cursor);
      if (entries.length > 0) {
        if (entries.some((e) => e.participantId && !names.has(e.participantId))) {
          for (const p of await client.who()) names.set(p.id, p.displayName);
        }
        for (const e of entries) console.log(format(e, names));
        cursor = latestSeq;
      }
    } catch (err) {
      console.error(import_chalk12.default.gray(`  \u2026 ${err instanceof Error ? err.message : String(err)}`));
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
});
function format(e, names) {
  const who = e.participantId ? names.get(e.participantId) ?? e.participantId : "system";
  const seq = import_chalk12.default.gray(`#${String(e.seq).padStart(3)}`);
  if (e.status === "system") {
    const reason = e.systemNotice?.reason ? ` (${e.systemNotice.reason})` : "";
    return `  ${seq} ${import_chalk12.default.yellow(`\u2699 ${e.systemNotice?.type ?? e.text}${reason}`)}`;
  }
  if (e.status === "undecryptable") {
    return `  ${seq} ${import_chalk12.default.gray(`${who}: <sealed under an earlier key \u2014 not readable with this link>`)}`;
  }
  return `  ${seq} ${import_chalk12.default.bold(who)}: ${e.text}`;
}

// src/commands/session.ts
var sessionCommand = new import_commander13.Command("session").description("Shared, end-to-end encrypted sessions across machines").addCommand(newCommand).addCommand(joinCommand).addCommand(tailCommand);

// src/commands/update.ts
var import_commander14 = require("commander");
var import_child_process2 = require("child_process");
var import_chalk13 = __toESM(require("chalk"));
async function getLatestVersion() {
  try {
    const result = (0, import_child_process2.execSync)("npm view @devpilot.sh/cli version", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    return result.trim();
  } catch {
    return null;
  }
}
function compareVersions(a, b) {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  return 0;
}
function detectPackageManager() {
  try {
    const pnpmList = (0, import_child_process2.execSync)("pnpm list -g @devpilot.sh/cli 2>/dev/null", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    if (pnpmList.includes("@devpilot.sh/cli")) return "pnpm";
  } catch {
  }
  try {
    const yarnList = (0, import_child_process2.execSync)("yarn global list 2>/dev/null", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    if (yarnList.includes("@devpilot.sh/cli")) return "yarn";
  } catch {
  }
  try {
    (0, import_child_process2.execSync)("bun --version", { stdio: ["pipe", "pipe", "pipe"] });
    return "bun";
  } catch {
  }
  return "npm";
}
function getUpdateCommand(pm) {
  switch (pm) {
    case "pnpm":
      return "pnpm add -g @devpilot.sh/cli@latest";
    case "yarn":
      return "yarn global add @devpilot.sh/cli@latest";
    case "bun":
      return "bun add -g @devpilot.sh/cli@latest";
    default:
      return "npm install -g @devpilot.sh/cli@latest";
  }
}
var updateCommand = new import_commander14.Command("update").description("Update DevPilot CLI to the latest version").option("-c, --check", "Only check for updates without installing").option("--force", "Force update even if already on latest version").action(async (options) => {
  console.log(import_chalk13.default.cyan("Checking for updates..."));
  const latestVersion = await getLatestVersion();
  if (!latestVersion) {
    console.log(import_chalk13.default.yellow("Could not check for updates. Please check your network connection."));
    console.log(import_chalk13.default.gray("You can manually update with: npm install -g @devpilot.sh/cli@latest"));
    return;
  }
  const comparison = compareVersions(latestVersion, VERSION);
  if (comparison === 0 && !options.force) {
    console.log(import_chalk13.default.green(`You're already on the latest version (${VERSION})`));
    return;
  }
  if (comparison === -1 && !options.force) {
    console.log(import_chalk13.default.yellow(`You're on a newer version (${VERSION}) than the latest release (${latestVersion})`));
    console.log(import_chalk13.default.gray("This might be a pre-release or development version."));
    return;
  }
  if (options.check) {
    if (comparison === 1) {
      console.log(import_chalk13.default.yellow(`Update available: ${VERSION} \u2192 ${latestVersion}`));
      console.log(import_chalk13.default.gray('Run "devpilot update" to install the latest version.'));
    }
    return;
  }
  const pm = detectPackageManager();
  const updateCmd = getUpdateCommand(pm);
  console.log(import_chalk13.default.cyan(`Updating from ${VERSION} to ${latestVersion}...`));
  console.log(import_chalk13.default.gray(`Using: ${updateCmd}`));
  console.log("");
  try {
    const [cmd, ...args] = updateCmd.split(" ");
    const child = (0, import_child_process2.spawn)(cmd, args, {
      stdio: "inherit",
      shell: true
    });
    child.on("close", (code) => {
      if (code === 0) {
        console.log("");
        console.log(import_chalk13.default.green(`Successfully updated to ${latestVersion}`));
        console.log(import_chalk13.default.gray('Run "devpilot --version" to verify.'));
      } else {
        console.log("");
        console.log(import_chalk13.default.red("Update failed. Please try manually:"));
        console.log(import_chalk13.default.cyan(`  ${updateCmd}`));
      }
    });
    child.on("error", (err) => {
      console.log(import_chalk13.default.red(`Update failed: ${err.message}`));
      console.log(import_chalk13.default.gray("Please try manually:"));
      console.log(import_chalk13.default.cyan(`  ${updateCmd}`));
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.log(import_chalk13.default.red(`Update failed: ${message}`));
    console.log(import_chalk13.default.gray("Please try manually:"));
    console.log(import_chalk13.default.cyan(`  ${updateCmd}`));
  }
});

// src/commands/wiki.ts
var import_commander15 = require("commander");
var import_fs6 = require("fs");
var import_path6 = require("path");
var import_chalk14 = __toESM(require("chalk"));
var wikiCommand = new import_commander15.Command("wiki").description("LLM-compiled knowledge base \u2014 institutional memory for your codebase");
wikiCommand.command("init").description("Initialize the wiki system in the current repository").option("--wiki-dir <path>", "Wiki output directory", ".devpilot/wiki").action(async (options) => {
  const cwd = process.cwd();
  const devpilotDir = (0, import_path6.join)(cwd, ".devpilot");
  const wikiDir = (0, import_path6.join)(cwd, options.wikiDir);
  if (!(0, import_fs6.existsSync)(devpilotDir)) {
    console.log(
      import_chalk14.default.yellow("\u26A0\uFE0F  DevPilot not initialized. Run `devpilot init` first.")
    );
    return;
  }
  if (!(0, import_fs6.existsSync)(wikiDir)) {
    (0, import_fs6.mkdirSync)(wikiDir, { recursive: true });
  }
  const indexPath = (0, import_path6.join)(wikiDir, "index.md");
  if (!(0, import_fs6.existsSync)(indexPath)) {
    const initialIndex = `# Wiki Index

> Auto-generated wiki \u2014 compiled from session logs, commits, specs, and decisions.
> This wiki is maintained by DevPilot's wiki compiler following the LLM Knowledge Base pattern.

## Getting Started

This wiki will grow automatically as you work with DevPilot:
- **Session logs** are compiled into architecture and decision articles
- **Commits** are analyzed for patterns and architectural changes
- **Specs** are indexed for requirements and design rationale

Run \`devpilot wiki ingest\` to manually add sources, or let the session hook capture knowledge automatically.
`;
    (0, import_fs6.writeFileSync)(indexPath, initialIndex);
  }
  const logPath = (0, import_path6.join)(wikiDir, "log.md");
  if (!(0, import_fs6.existsSync)(logPath)) {
    (0, import_fs6.writeFileSync)(
      logPath,
      `# Wiki Activity Log

> Append-only chronicle of wiki operations.

- **${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}** [init] Wiki initialized
`
    );
  }
  const gitignorePath = (0, import_path6.join)(cwd, ".gitignore");
  if ((0, import_fs6.existsSync)(gitignorePath)) {
    const gitignore = (0, import_fs6.readFileSync)(gitignorePath, "utf-8");
    if (!gitignore.includes(".devpilot/wiki")) {
    }
  }
  console.log(import_chalk14.default.green("\u2705 Wiki initialized!"));
  console.log("");
  console.log(import_chalk14.default.white("Wiki directory: ") + import_chalk14.default.cyan(wikiDir));
  console.log("");
  console.log(import_chalk14.default.white("Next steps:"));
  console.log(
    import_chalk14.default.gray("  1. ") + import_chalk14.default.cyan("devpilot wiki ingest --file <path>") + import_chalk14.default.gray(" to add source material")
  );
  console.log(
    import_chalk14.default.gray("  2. ") + import_chalk14.default.cyan('devpilot wiki query "How does auth work?"') + import_chalk14.default.gray(" to ask questions")
  );
  console.log(
    import_chalk14.default.gray("  3. ") + import_chalk14.default.cyan("devpilot wiki status") + import_chalk14.default.gray(" to check wiki health")
  );
  console.log("");
  console.log(
    import_chalk14.default.gray(
      "The wiki will grow automatically as agents work \u2014 each session compounds the knowledge base."
    )
  );
});
wikiCommand.command("ingest").description("Ingest a source document into the wiki").requiredOption("--type <type>", "Source type: session_log, commit, spec, decision, manual").requiredOption("--title <title>", "Human-readable title for the source").option("--file <path>", "Path to source file").option("--stdin", "Read source from stdin").option("--origin <origin>", "Origin identifier (e.g. session ID, commit SHA)").action(async (options) => {
  let content;
  if (options.file) {
    if (!(0, import_fs6.existsSync)(options.file)) {
      console.log(import_chalk14.default.red(`\u274C File not found: ${options.file}`));
      return;
    }
    content = (0, import_fs6.readFileSync)(options.file, "utf-8");
  } else if (options.stdin) {
    content = (0, import_fs6.readFileSync)(0, "utf-8");
  } else {
    console.log(
      import_chalk14.default.red("\u274C Provide either --file <path> or --stdin")
    );
    return;
  }
  const validTypes = ["session_log", "commit", "spec", "decision", "manual"];
  if (!validTypes.includes(options.type)) {
    console.log(
      import_chalk14.default.red(
        `\u274C Invalid type "${options.type}". Must be one of: ${validTypes.join(", ")}`
      )
    );
    return;
  }
  console.log(import_chalk14.default.gray(`Ingesting ${options.type}: "${options.title}"...`));
  try {
    const { createWikiCompiler } = await import("@devpilot.sh/core/wiki");
    const config = getWikiConfig();
    const compiler = createWikiCompiler(config);
    const result = await compiler.ingest(
      content,
      options.type,
      options.title,
      options.origin
    );
    console.log(import_chalk14.default.green("\u2705 Ingested successfully!"));
    console.log(
      import_chalk14.default.gray(`   Source ID: ${result.sourceId}`)
    );
    if (result.articlesCreated.length > 0) {
      console.log(
        import_chalk14.default.white(`   Articles created: `) + import_chalk14.default.cyan(result.articlesCreated.join(", "))
      );
    }
    if (result.articlesUpdated.length > 0) {
      console.log(
        import_chalk14.default.white(`   Articles updated: `) + import_chalk14.default.yellow(result.articlesUpdated.join(", "))
      );
    }
    console.log(
      import_chalk14.default.gray(`   Tokens used: ${result.tokensUsed}`)
    );
  } catch (error) {
    console.log(
      import_chalk14.default.red(
        `\u274C Ingest failed: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
});
wikiCommand.command("query <question>").description("Ask a question against the wiki").action(async (question) => {
  console.log(import_chalk14.default.gray(`Searching wiki for: "${question}"...`));
  try {
    const { createWikiCompiler } = await import("@devpilot.sh/core/wiki");
    const config = getWikiConfig();
    const compiler = createWikiCompiler(config);
    const result = await compiler.query(question);
    console.log("");
    console.log(import_chalk14.default.white(result.answer));
    console.log("");
    if (result.citedArticles.length > 0) {
      console.log(
        import_chalk14.default.gray("Cited: ") + import_chalk14.default.cyan(result.citedArticles.map((s) => `[[${s}]]`).join(", "))
      );
    }
    if (result.newArticleSlug) {
      console.log(
        import_chalk14.default.green(
          `\u{1F4DD} New article created from this query: [[${result.newArticleSlug}]]`
        )
      );
    }
    console.log(import_chalk14.default.gray(`Tokens used: ${result.tokensUsed}`));
  } catch (error) {
    console.log(
      import_chalk14.default.red(
        `\u274C Query failed: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
});
wikiCommand.command("lint").description("Check wiki health \u2014 find stale content, orphans, and gaps").action(async () => {
  console.log(import_chalk14.default.gray("Linting wiki..."));
  try {
    const { createWikiCompiler } = await import("@devpilot.sh/core/wiki");
    const config = getWikiConfig();
    const compiler = createWikiCompiler(config);
    const result = await compiler.lint();
    if (result.findings.length === 0) {
      console.log(import_chalk14.default.green("\u2705 Wiki is healthy \u2014 no issues found!"));
      return;
    }
    console.log(
      import_chalk14.default.yellow(`\u26A0\uFE0F  Found ${result.findings.length} issue(s):
`)
    );
    for (const finding of result.findings) {
      const icon = {
        stale: "\u{1F550}",
        orphaned: "\u{1F517}",
        contradiction: "\u26A1",
        gap: "\u{1F4ED}",
        broken_link: "\u{1F494}"
      }[finding.type];
      console.log(
        `  ${icon} ${import_chalk14.default.white(`[${finding.type}]`)} ${import_chalk14.default.cyan(`[[${finding.articleSlug}]]`)}`
      );
      console.log(import_chalk14.default.gray(`     ${finding.description}`));
      console.log(import_chalk14.default.gray(`     \u2192 ${finding.suggestion}`));
      console.log("");
    }
    if (result.articlesMarkedStale.length > 0) {
      console.log(
        import_chalk14.default.yellow(
          `Marked ${result.articlesMarkedStale.length} article(s) as stale.`
        )
      );
    }
    console.log(import_chalk14.default.gray(`Tokens used: ${result.tokensUsed}`));
  } catch (error) {
    console.log(
      import_chalk14.default.red(
        `\u274C Lint failed: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
});
wikiCommand.command("status").description("Show wiki statistics").action(async () => {
  try {
    const { createWikiCompiler } = await import("@devpilot.sh/core/wiki");
    const config = getWikiConfig();
    const compiler = createWikiCompiler(config);
    const status = await compiler.getStatus();
    console.log(import_chalk14.default.white.bold("\n\u{1F4DA} Wiki Status\n"));
    console.log(
      import_chalk14.default.gray("  Sources:    ") + import_chalk14.default.white(String(status.totalSources))
    );
    console.log(
      import_chalk14.default.gray("  Articles:   ") + import_chalk14.default.white(String(status.totalArticles)) + import_chalk14.default.gray(" (") + import_chalk14.default.green(`${status.activeArticles} active`) + (status.staleArticles > 0 ? import_chalk14.default.yellow(`, ${status.staleArticles} stale`) : "") + (status.archivedArticles > 0 ? import_chalk14.default.gray(`, ${status.archivedArticles} archived`) : "") + import_chalk14.default.gray(")")
    );
    if (Object.keys(status.categories).length > 0) {
      console.log(import_chalk14.default.gray("\n  Categories:"));
      for (const [category, count] of Object.entries(status.categories).sort()) {
        console.log(
          import_chalk14.default.gray("    ") + import_chalk14.default.cyan(category) + import_chalk14.default.gray(": ") + import_chalk14.default.white(String(count))
        );
      }
    }
    if (status.lastActivity) {
      console.log(
        import_chalk14.default.gray("\n  Last activity: ") + import_chalk14.default.white(status.lastActivity.toISOString().split("T")[0])
      );
    }
    console.log("");
  } catch (error) {
    console.log(
      import_chalk14.default.red(
        `\u274C Status failed: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
});
wikiCommand.command("flush").description("Export wiki to disk as markdown files").action(async () => {
  console.log(import_chalk14.default.gray("Flushing wiki to disk..."));
  try {
    const { createWikiCompiler } = await import("@devpilot.sh/core/wiki");
    const config = getWikiConfig();
    const compiler = createWikiCompiler(config);
    const result = await compiler.flushToDisk();
    console.log(import_chalk14.default.green(`\u2705 Wrote ${result.filesWritten} files to ${result.wikiDir}`));
  } catch (error) {
    console.log(
      import_chalk14.default.red(
        `\u274C Flush failed: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
});
wikiCommand.command("index").description("Show the wiki table of contents").option("--category <category>", "Filter by category").action(async (options) => {
  try {
    const { createWikiCompiler } = await import("@devpilot.sh/core/wiki");
    const config = getWikiConfig();
    const compiler = createWikiCompiler(config);
    let index = await compiler.getIndex();
    if (options.category) {
      index = index.filter((e) => e.category === options.category);
    }
    if (index.length === 0) {
      console.log(import_chalk14.default.gray("Wiki is empty. Run `devpilot wiki ingest` to add sources."));
      return;
    }
    const byCategory = {};
    for (const entry of index) {
      if (!byCategory[entry.category]) {
        byCategory[entry.category] = [];
      }
      byCategory[entry.category].push(entry);
    }
    console.log(import_chalk14.default.white.bold("\n\u{1F4D6} Wiki Index\n"));
    for (const [category, entries] of Object.entries(byCategory).sort()) {
      console.log(
        import_chalk14.default.cyan.bold(
          `  ${category.charAt(0).toUpperCase() + category.slice(1)}`
        )
      );
      for (const entry of entries) {
        const statusColor = entry.status === "active" ? import_chalk14.default.green : entry.status === "stale" ? import_chalk14.default.yellow : import_chalk14.default.gray;
        const badge = statusColor(`[${entry.status}]`);
        console.log(
          `    ${badge} ${import_chalk14.default.white(entry.title)} ${import_chalk14.default.gray(`[[${entry.slug}]]`)}`
        );
      }
      console.log("");
    }
  } catch (error) {
    console.log(
      import_chalk14.default.red(
        `\u274C Index failed: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
});
wikiCommand.command("read <slug>").description("Read a specific wiki article").action(async (slug) => {
  try {
    const { createWikiCompiler } = await import("@devpilot.sh/core/wiki");
    const config = getWikiConfig();
    const compiler = createWikiCompiler(config);
    const article = await compiler.getArticle(slug);
    if (!article) {
      console.log(import_chalk14.default.red(`\u274C Article not found: [[${slug}]]`));
      return;
    }
    console.log(import_chalk14.default.white.bold(`
# ${article.title}
`));
    console.log(
      import_chalk14.default.gray(
        `Category: ${article.category} | Status: ${article.status} | v${article.version}`
      )
    );
    if (article.backlinks.length > 0) {
      console.log(
        import_chalk14.default.gray(
          `Related: ${article.backlinks.map((b) => `[[${b}]]`).join(", ")}`
        )
      );
    }
    console.log(import_chalk14.default.gray("\u2500".repeat(60)));
    console.log(article.content);
    console.log("");
  } catch (error) {
    console.log(
      import_chalk14.default.red(
        `\u274C Read failed: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
});
function getWikiConfig() {
  const cwd = process.cwd();
  return {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    model: process.env.WIKI_MODEL || "claude-sonnet-4-20250514",
    maxTokens: parseInt(process.env.WIKI_MAX_TOKENS || "8192", 10),
    repo: getRepoName(cwd),
    wikiDir: (0, import_path6.join)(cwd, ".devpilot", "wiki")
  };
}
function getRepoName(cwd) {
  try {
    const { execSync: execSync3 } = require("child_process");
    const remote = execSync3("git remote get-url origin", {
      cwd,
      encoding: "utf-8"
    }).trim();
    const match = remote.match(/[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?$/);
    return match ? match[1] : cwd.split("/").pop() || "unknown";
  } catch {
    return cwd.split("/").pop() || "unknown";
  }
}

// src/cli.ts
var import_cli = require("@devpilot.sh/benchmarks/cli");
var pkg = {
  name: "@devpilot.sh/cli",
  version: VERSION
};
var cli = new import_commander16.Command();
cli.name("devpilot").description("DevPilot CLI - Manage your AI coding agent fleet").version(VERSION);
cli.addCommand(initCommand);
cli.addCommand(setupCommand);
cli.addCommand(serveCommand);
cli.addCommand(statusCommand);
cli.addCommand(configCommand);
cli.addCommand(bridgeCommand);
cli.addCommand(sessionCommand);
cli.addCommand(updateCommand);
cli.addCommand(wikiCommand);
cli.addCommand(import_cli.benchCommand);
function runCli(args = process.argv) {
  const notifier = (0, import_update_notifier.default)({
    pkg,
    updateCheckInterval: 1e3 * 60 * 60 * 24
    // 24 hours
  });
  notifier.notify({
    message: `Update available: {currentVersion} \u2192 {latestVersion}
Run {updateCommand} to update`,
    boxenOptions: {
      padding: 1,
      margin: 1,
      borderColor: "cyan",
      borderStyle: "round"
    }
  });
  cli.parse(args);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  cli,
  runCli
});
//# sourceMappingURL=cli.js.map