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

// src/index.ts
var index_exports = {};
__export(index_exports, {
  VERSION: () => VERSION,
  cli: () => cli,
  runCli: () => runCli
});
module.exports = __toCommonJS(index_exports);

// src/cli.ts
var import_commander6 = require("commander");

// src/version.ts
var VERSION = "0.1.0";

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
var import_db5 = require("@devpilot/core/db");

// src/server/api/items.ts
var import_db = require("@devpilot/core/db");
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
    const [plan] = await db2.insert(import_db.plans).values({
      horizonItemId: id,
      version: item.plan ? item.plan.version + 1 : 1,
      estimatedCostUsd: 0.18,
      baselineCostUsd: 0.24,
      acceptanceCriteria: [
        `All tests pass for ${item.repo}`,
        "No regressions in existing functionality",
        "Code review approved"
      ],
      confidenceSignals: {
        hasMemory: true,
        recentlyModifiedFiles: 2,
        similarTasksCompleted: 5,
        overallConfidence: 0.85
      },
      fleetContextSnapshot: { activeSessions: 0 },
      memorySessionsUsed: []
    }).returning();
    const [workstream] = await db2.insert(import_db.workstreams).values({
      planId: plan.id,
      label: "Implementation",
      repo: item.repo,
      workerCount: 1,
      orderIndex: 0
    }).returning();
    await db2.insert(import_db.tasks).values({
      workstreamId: workstream.id,
      label: "Complete task",
      model: "SONNET",
      complexity: "M",
      estimatedCostUsd: 0.18,
      filePaths: ["src/"],
      dependsOn: [],
      orderIndex: 0
    });
    if (item.zone === "SHAPING") {
      await db2.update(import_db.horizonItems).set({ zone: "REFINING", updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm.eq)(import_db.horizonItems.id, id));
    }
    const completePlan = await db2.query.plans.findFirst({
      where: (0, import_drizzle_orm.eq)(import_db.plans.id, plan.id),
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
      message: `Plan generated for "${item.title}" ($${plan.estimatedCostUsd.toFixed(2)})`,
      repo: item.repo,
      ticketId: item.linearTicketId,
      metadata: { planId: plan.id }
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
var import_db2 = require("@devpilot/core/db");
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
var import_db3 = require("@devpilot/core/db");
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
var import_db4 = require("@devpilot/core/db");
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
var db;
function getDb() {
  return db;
}
async function createServer(options) {
  db = (0, import_db5.initDatabase)({
    type: "sqlite",
    sqlitePath: options.dbPath
  });
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
var serveCommand = new import_commander2.Command("serve").description("Start the local DevPilot Conductor API server").option("-p, --port <port>", "Port to run the server on", "3847").option("--no-open", "Do not open browser automatically").option("--sync", "Enable cloud sync").option("--db <path>", "Path to SQLite database", ".devpilot/data.db").action(async (options) => {
  const port = parseInt(options.port, 10);
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
      dbPath
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
var import_core = require("@devpilot/core");
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
var import_core2 = require("@devpilot/core");

// src/utils/orchestrator.ts
var import_child_process = require("child_process");
var import_fs4 = require("fs");
var import_path4 = require("path");
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
  return {
    node: { ...node, meetsMinimum: nodeMeetsMin },
    git: { ...git, meetsMinimum: gitMeetsMin },
    tmux: { installed: tmux.installed },
    gh: { installed: gh.installed, authenticated: ghAuthenticated }
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
  console.log(import_chalk6.default.bold.green("\nSetup Complete!\n"));
  console.log(import_chalk6.default.white("Next steps:"));
  console.log(import_chalk6.default.gray("  1. Run ") + import_chalk6.default.cyan("devpilot serve") + import_chalk6.default.gray(" to start the UI"));
  console.log(import_chalk6.default.gray("  2. Run ") + import_chalk6.default.cyan("ao start") + import_chalk6.default.gray(" to start agent orchestrator"));
  console.log(import_chalk6.default.gray("  3. Use the UI to create items and dispatch to the fleet\n"));
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

// src/cli.ts
var cli = new import_commander6.Command();
cli.name("devpilot").description("DevPilot CLI - Manage your AI coding agent fleet").version(VERSION);
cli.addCommand(initCommand);
cli.addCommand(setupCommand);
cli.addCommand(serveCommand);
cli.addCommand(statusCommand);
cli.addCommand(configCommand);
function runCli(args = process.argv) {
  cli.parse(args);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  VERSION,
  cli,
  runCli
});
//# sourceMappingURL=index.js.map