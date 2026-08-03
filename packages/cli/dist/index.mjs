#!/usr/bin/env node
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/cli.ts
import { Command as Command12 } from "commander";
import updateNotifier from "update-notifier";

// src/version.ts
var VERSION = "0.1.1";

// src/commands/init.ts
import { Command } from "commander";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import chalk from "chalk";
var initCommand = new Command("init").description("Initialize DevPilot in the current repository").option("-f, --force", "Overwrite existing configuration").action(async (options) => {
  const cwd = process.cwd();
  const devpilotDir = join(cwd, ".devpilot");
  const configPath = join(devpilotDir, "config.yaml");
  if (existsSync(configPath) && !options.force) {
    console.log(
      chalk.yellow("\u26A0\uFE0F  DevPilot is already initialized in this directory.")
    );
    console.log(chalk.gray("   Use --force to reinitialize."));
    return;
  }
  if (!existsSync(devpilotDir)) {
    mkdirSync(devpilotDir, { recursive: true });
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
  writeFileSync(configPath, defaultConfig);
  const gitignorePath = join(cwd, ".gitignore");
  if (existsSync(gitignorePath)) {
    const gitignore = __require("fs").readFileSync(gitignorePath, "utf-8");
    if (!gitignore.includes(".devpilot/data.db")) {
      const addition = "\n# DevPilot\n.devpilot/data.db\n";
      __require("fs").appendFileSync(gitignorePath, addition);
      console.log(chalk.gray("   Added .devpilot/data.db to .gitignore"));
    }
  }
  console.log(chalk.green("\u2705 DevPilot initialized successfully!"));
  console.log("");
  console.log(chalk.white("Next steps:"));
  console.log(chalk.gray("  1. Run ") + chalk.cyan("devpilot setup") + chalk.gray(" to configure Linear and agent-orchestrator"));
  console.log(chalk.gray("  2. Run ") + chalk.cyan("devpilot serve") + chalk.gray(" to start the local UI"));
  console.log(chalk.gray("  3. Run ") + chalk.cyan("devpilot status") + chalk.gray(" to see fleet status"));
});

// src/commands/serve.ts
import { Command as Command2 } from "commander";
import chalk2 from "chalk";

// src/server/index.ts
import Fastify from "fastify";
import { initDatabase } from "@devpilot.sh/core/db";
import {
  initOrchestratorService,
  initStatusPoller,
  createDbStatusPollerCallbacks
} from "@devpilot.sh/core/orchestrator";
import { initExecutionBridge } from "@devpilot.sh/core/wave-planner";

// src/server/api/items.ts
import {
  horizonItems,
  plans,
  workstreams,
  tasks,
  touchedFiles,
  activityEvents
} from "@devpilot.sh/core/db";
import { generatePlanForItem, projectWavePlanToPlan } from "@devpilot.sh/core/wave-planner";
import { eq, and, desc } from "drizzle-orm";
async function registerItemRoutes(app) {
  const db2 = getDb();
  app.get("/api/items", async (request, reply) => {
    const { zone, repo } = request.query;
    const conditions = [];
    if (zone) conditions.push(eq(horizonItems.zone, zone));
    if (repo) conditions.push(eq(horizonItems.repo, repo));
    const items = await db2.query.horizonItems.findMany({
      where: conditions.length > 0 ? and(...conditions) : void 0,
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
      orderBy: [desc(horizonItems.priority), desc(horizonItems.createdAt)]
    });
    return items;
  });
  app.post("/api/items", async (request, reply) => {
    const { title, zone = "DIRECTIONAL", repo, complexity, priority = 0, linearTicketId } = request.body;
    if (!title || !repo) {
      reply.status(400).send({ error: "Title and repo are required" });
      return;
    }
    const [item] = await db2.insert(horizonItems).values({
      title,
      zone,
      repo,
      complexity,
      priority,
      linearTicketId
    }).returning();
    const itemWithRelations = await db2.query.horizonItems.findFirst({
      where: eq(horizonItems.id, item.id),
      with: {
        plan: true,
        conflictingFiles: true
      }
    });
    await db2.insert(activityEvents).values({
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
      where: eq(horizonItems.id, id),
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
      where: eq(horizonItems.id, id)
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
    await db2.update(horizonItems).set(updateData).where(eq(horizonItems.id, id));
    const item = await db2.query.horizonItems.findFirst({
      where: eq(horizonItems.id, id),
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
      await db2.insert(activityEvents).values({
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
      where: eq(horizonItems.id, id)
    });
    if (!existingItem) {
      reply.status(404).send({ error: "Item not found" });
      return;
    }
    await db2.delete(horizonItems).where(eq(horizonItems.id, id));
    return { success: true };
  });
  app.post("/api/items/:id/plan/generate", async (request, reply) => {
    const { id } = request.params;
    const item = await db2.query.horizonItems.findFirst({
      where: eq(horizonItems.id, id),
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
      await db2.delete(tasks).where(eq(tasks.planId, item.plan.id));
      const existingWorkstreams = await db2.query.workstreams.findMany({
        where: eq(workstreams.planId, item.plan.id)
      });
      for (const ws of existingWorkstreams) {
        await db2.delete(tasks).where(eq(tasks.workstreamId, ws.id));
      }
      await db2.delete(workstreams).where(eq(workstreams.planId, item.plan.id));
      await db2.delete(touchedFiles).where(eq(touchedFiles.planId, item.plan.id));
      await db2.delete(plans).where(eq(plans.id, item.plan.id));
    }
    const workingDir = process.env.WORKING_DIR || process.cwd();
    const { generation, planId } = await generatePlanForItem({
      horizonItemId: id,
      title: item.title,
      repo: item.repo,
      workingDir,
      apiKey
    });
    await projectWavePlanToPlan({ planId, generation, inFlightPaths });
    if (priorVersion > 0) {
      await db2.update(plans).set({ version: priorVersion + 1 }).where(eq(plans.id, planId));
    }
    if (item.zone === "SHAPING") {
      await db2.update(horizonItems).set({ zone: "REFINING", updatedAt: /* @__PURE__ */ new Date() }).where(eq(horizonItems.id, id));
    }
    const completePlan = await db2.query.plans.findFirst({
      where: eq(plans.id, planId),
      with: {
        workstreams: {
          with: { tasks: true }
        },
        sequentialTasks: true,
        filesTouched: true
      }
    });
    await db2.insert(activityEvents).values({
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
      where: eq(horizonItems.id, id),
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
      where: eq(horizonItems.id, id),
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
    const [newPlan] = await db2.insert(plans).values({
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
      const [workstream] = await db2.insert(workstreams).values({
        planId: newPlan.id,
        label: ws.label,
        repo: ws.repo,
        workerCount: ws.workerCount,
        orderIndex: ws.orderIndex
      }).returning();
      for (const task of ws.tasks) {
        await db2.insert(tasks).values({
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
      await db2.insert(touchedFiles).values({
        planId: newPlan.id,
        path: f.path,
        status: f.status,
        inFlightVia: f.inFlightVia
      });
    }
    const completePlan = await db2.query.plans.findFirst({
      where: eq(plans.id, newPlan.id),
      with: {
        workstreams: {
          with: { tasks: true }
        },
        sequentialTasks: true,
        filesTouched: true,
        previousPlan: true
      }
    });
    await db2.insert(activityEvents).values({
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
    const [updatedTask] = await db2.update(tasks).set(updateData).where(eq(tasks.id, taskId)).returning();
    if (!updatedTask) {
      reply.status(404).send({ error: "Task not found" });
      return;
    }
    return { task: updatedTask };
  });
}

// src/server/api/fleet.ts
import {
  horizonItems as horizonItems2,
  rufloSessions,
  inFlightFiles as inFlightFiles2,
  touchedFiles as touchedFiles2,
  activityEvents as activityEvents2,
  conductorScores
} from "@devpilot.sh/core/db";
import {
  getOrchestratorServiceOrNull,
  buildDispatchRequest
} from "@devpilot.sh/core/orchestrator";
import { eq as eq2, or, desc as desc2, and as and2, asc } from "drizzle-orm";
async function registerFleetRoutes(app) {
  const db2 = getDb();
  app.get("/api/fleet/sessions", async (request, reply) => {
    const { status, repo } = request.query;
    const conditions = [];
    if (status) conditions.push(eq2(rufloSessions.status, status));
    if (repo) conditions.push(eq2(rufloSessions.repo, repo));
    const sessions = await db2.query.rufloSessions.findMany({
      where: conditions.length > 0 ? and2(...conditions) : void 0,
      with: {
        completedTasks: true
      },
      orderBy: [asc(rufloSessions.status), desc2(rufloSessions.updatedAt)]
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
    const [session] = await db2.insert(rufloSessions).values({
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
      await db2.insert(inFlightFiles2).values({
        path: filePath,
        activeSessionId: session.id,
        linearTicketId,
        estimatedMinutesRemaining: estimatedRemainingMinutes || 30
      });
    }
    await db2.insert(activityEvents2).values({
      type: "ITEM_DISPATCHED",
      message: `Session started: "${ticketTitle}"`,
      repo,
      ticketId: linearTicketId,
      metadata: { sessionId: session.id }
    });
    const sessionWithRelations = await db2.query.rufloSessions.findFirst({
      where: eq2(rufloSessions.id, session.id),
      with: {
        completedTasks: true
      }
    });
    reply.status(201).send(sessionWithRelations);
  });
  app.get("/api/fleet/state", async (request, reply) => {
    const sessions = await db2.query.rufloSessions.findMany({
      where: or(
        eq2(rufloSessions.status, "ACTIVE"),
        eq2(rufloSessions.status, "NEEDS_SPEC")
      ),
      with: {
        completedTasks: true
      },
      orderBy: desc2(rufloSessions.updatedAt)
    });
    const allInFlightFiles = await db2.query.inFlightFiles.findMany();
    const totalEstimatedMinutes = sessions.reduce(
      (sum, s) => sum + s.estimatedRemainingMinutes,
      0
    );
    const readyItemsList = await db2.query.horizonItems.findMany({
      where: eq2(horizonItems2.zone, "READY")
    });
    const readyItems = readyItemsList.length;
    const refiningItemsList = await db2.query.horizonItems.findMany({
      where: eq2(horizonItems2.zone, "REFINING")
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
      orderBy: desc2(activityEvents2.createdAt),
      limit: 10
    });
    const score = await db2.query.conductorScores.findFirst({
      orderBy: desc2(conductorScores.updatedAt)
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
      where: eq2(horizonItems2.id, itemId),
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
    const [session] = await db2.insert(rufloSessions).values({
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
    const orchestrator2 = getOrchestratorServiceOrNull();
    if (orchestrator2 && orchestrator2.isEnabled) {
      const dispatchRequest = buildDispatchRequest({
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
        await db2.update(rufloSessions).set({
          externalSessionId: dispatchResult.orchestratorJobId,
          orchestratorMode: dispatchResult.mode
        }).where(eq2(rufloSessions.id, session.id));
        await db2.insert(activityEvents2).values({
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
        await db2.insert(activityEvents2).values({
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
      await db2.insert(inFlightFiles2).values({
        path: file.path,
        activeSessionId: session.id,
        linearTicketId: session.linearTicketId,
        estimatedMinutesRemaining: estimatedMinutes,
        horizonItemId: itemId
      });
      await db2.update(touchedFiles2).set({
        status: "IN_FLIGHT",
        inFlightVia: session.id
      }).where(eq2(touchedFiles2.id, file.id));
    }
    await db2.delete(horizonItems2).where(eq2(horizonItems2.id, itemId));
    await db2.insert(activityEvents2).values({
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
      await db2.update(conductorScores).set({
        velocityTrend: Math.min(200, score.velocityTrend + 5),
        total: Math.min(1e3, score.total + 10)
      }).where(eq2(conductorScores.id, score.id));
      await db2.insert(activityEvents2).values({
        type: "SCORE_UPDATE",
        message: `Score +10 for dispatching work`,
        metadata: { delta: 10, reason: "dispatch" }
      });
    }
    const sessionWithRelations = await db2.query.rufloSessions.findFirst({
      where: eq2(rufloSessions.id, session.id),
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
import { conductorScores as conductorScores2, scoreHistory } from "@devpilot.sh/core/db";
import { eq as eq3, gte, and as and3, asc as asc2, desc as desc3 } from "drizzle-orm";
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
      const [newScore] = await db2.insert(conductorScores2).values({
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
      where: eq3(scoreHistory.scoreId, scoreId),
      orderBy: desc3(scoreHistory.recordedAt),
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
      where: and3(
        eq3(scoreHistory.scoreId, score.id),
        gte(scoreHistory.recordedAt, startDate)
      ),
      orderBy: asc2(scoreHistory.recordedAt)
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
    const [historyEntry] = await db2.insert(scoreHistory).values({
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
import { activityEvents as activityEvents3, rufloSessions as rufloSessions2 } from "@devpilot.sh/core/db";
import { eq as eq4, and as and4, gt, desc as desc4, asc as asc3 } from "drizzle-orm";
async function registerEventRoutes(app) {
  const db2 = getDb();
  app.get("/api/events", async (request, reply) => {
    const { limit = "50", type, repo, after } = request.query;
    const numLimit = Math.min(parseInt(limit, 10), 100);
    const conditions = [];
    if (type) conditions.push(eq4(activityEvents3.type, type));
    if (repo) conditions.push(eq4(activityEvents3.repo, repo));
    if (after) conditions.push(gt(activityEvents3.createdAt, new Date(after)));
    const events = await db2.query.activityEvents.findMany({
      where: conditions.length > 0 ? and4(...conditions) : void 0,
      orderBy: desc4(activityEvents3.createdAt),
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
    const [event] = await db2.insert(activityEvents3).values({
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
          where: lastEventId ? gt(activityEvents3.id, lastEventId) : gt(activityEvents3.createdAt, new Date(Date.now() - 5e3)),
          orderBy: asc3(activityEvents3.createdAt),
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
          where: eq4(rufloSessions2.status, "ACTIVE")
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
  db = initDatabase({
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
    const orchestrator2 = initOrchestratorService(orchestratorConfig);
    initStatusPoller(orchestrator2, {
      pollIntervalMs: 5e3,
      ...createDbStatusPollerCallbacks()
    });
    initExecutionBridge(orchestrator2, {
      execution: waveExecutionConfigFromEnv(options.port)
    }).start();
    console.log(`Orchestrator initialized in ${options.orchestrator.mode} mode`);
  }
  const app = Fastify({
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
import { existsSync as existsSync2, mkdirSync as mkdirSync2 } from "fs";
import { join as join2 } from "path";
var serveCommand = new Command2("serve").description("Start the local DevPilot Conductor API server").option("-p, --port <port>", "Port to run the server on", "3847").option("--no-open", "Do not open browser automatically").option("--sync", "Enable cloud sync").option("--db <path>", "Path to SQLite database", ".devpilot/data.db").option(
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
  console.log(chalk2.cyan("\u{1F680} Starting DevPilot Conductor..."));
  console.log("");
  console.log(chalk2.gray(`   Port: ${port}`));
  console.log(chalk2.gray(`   Database: ${options.db}`));
  console.log(chalk2.gray(`   Sync: ${options.sync ? "enabled" : "disabled"}`));
  console.log("");
  const dbDir = join2(process.cwd(), ".devpilot");
  if (!existsSync2(dbDir)) {
    mkdirSync2(dbDir, { recursive: true });
    console.log(chalk2.gray(`   Created: ${dbDir}`));
  }
  try {
    const dbPath = options.db.startsWith("/") ? options.db : join2(process.cwd(), options.db);
    const { url, close } = await startServer({
      port,
      dbPath,
      orchestrator: orchestrator2
    });
    console.log(chalk2.green("\u2713 Server started successfully"));
    console.log("");
    console.log(chalk2.cyan(`   API: ${url}`));
    console.log(chalk2.gray(`   Health: ${url}/api/health`));
    console.log("");
    console.log(chalk2.gray("   Press Ctrl+C to stop"));
    console.log("");
    if (options.open) {
      console.log(chalk2.yellow("   Note: Static UI not bundled yet."));
      console.log(chalk2.gray("   To view the UI, run the Next.js app:"));
      console.log(chalk2.cyan("   cd apps/web && pnpm dev"));
      console.log("");
    }
    process.on("SIGINT", async () => {
      console.log("");
      console.log(chalk2.yellow("Shutting down..."));
      await close();
      console.log(chalk2.green("\u2713 Server stopped"));
      process.exit(0);
    });
    process.on("SIGTERM", async () => {
      await close();
      process.exit(0);
    });
    await new Promise(() => {
    });
  } catch (error) {
    console.error(chalk2.red("\u2717 Failed to start server:"));
    console.error(chalk2.red(`   ${error instanceof Error ? error.message : error}`));
    process.exit(1);
  }
});

// src/commands/status.ts
import { Command as Command3 } from "commander";
import chalk3 from "chalk";
var statusCommand = new Command3("status").description("Show current fleet and runway status").option("-v, --verbose", "Show detailed information").action(async (options) => {
  console.log(chalk3.cyan("\u{1F4CA} DevPilot Status"));
  console.log("");
  console.log(chalk3.white("Fleet Status:"));
  console.log(chalk3.gray("  Active Sessions: ") + chalk3.green("3"));
  console.log(chalk3.gray("  Needs Spec: ") + chalk3.yellow("1"));
  console.log(chalk3.gray("  Fleet Utilization: ") + chalk3.cyan("75%"));
  console.log("");
  console.log(chalk3.white("Runway:"));
  console.log(chalk3.gray("  Ready Items: ") + chalk3.green("2"));
  console.log(chalk3.gray("  Refining: ") + chalk3.blue("1"));
  console.log(chalk3.gray("  Shaping: ") + chalk3.magenta("2"));
  console.log(chalk3.gray("  Directional: ") + chalk3.gray("3"));
  console.log(chalk3.gray("  Runway Hours: ") + chalk3.green("4.2h"));
  console.log("");
  console.log(chalk3.white("Conductor Score:"));
  console.log(chalk3.gray("  Total: ") + chalk3.magenta("742") + chalk3.gray("/1000"));
  console.log(chalk3.gray("  Rank: ") + chalk3.cyan("#23"));
  if (options.verbose) {
    console.log("");
    console.log(chalk3.white("Score Breakdown:"));
    console.log(chalk3.gray("  Fleet Utilization: ") + chalk3.white("156/200"));
    console.log(chalk3.gray("  Runway Health: ") + chalk3.white("148/200"));
    console.log(chalk3.gray("  Plan Accuracy: ") + chalk3.white("162/200"));
    console.log(chalk3.gray("  Cost Efficiency: ") + chalk3.white("138/200"));
    console.log(chalk3.gray("  Velocity Trend: ") + chalk3.white("138/200"));
  }
});

// src/commands/config.ts
import { Command as Command4 } from "commander";
import { existsSync as existsSync3, readFileSync, writeFileSync as writeFileSync2 } from "fs";
import { join as join3 } from "path";
import chalk4 from "chalk";
import YAML from "yaml";
import { linear } from "@devpilot.sh/core";
var linearCommand = new Command4("linear").description("Configure Linear integration").option("--api-key <key>", "Linear API key").option("--team-id <id>", "Linear team ID").option("--test", "Test the connection").action(async (options) => {
  const configPath = join3(process.cwd(), ".devpilot", "config.yaml");
  if (!existsSync3(configPath)) {
    console.log(chalk4.red('DevPilot not initialized. Run "devpilot init" first.'));
    return;
  }
  const configContent = readFileSync(configPath, "utf-8");
  const config = YAML.parse(configContent);
  if (!config.integrations) config.integrations = {};
  if (!config.integrations.linear) config.integrations.linear = {};
  if (options.apiKey) {
    config.integrations.linear.apiKey = options.apiKey;
    writeFileSync2(configPath, YAML.stringify(config));
    console.log(chalk4.green("Linear API key saved."));
  }
  if (options.teamId) {
    config.integrations.linear.teamId = options.teamId;
    writeFileSync2(configPath, YAML.stringify(config));
    console.log(chalk4.green("Linear team ID saved."));
  }
  if (options.test || options.apiKey && options.teamId) {
    const apiKey = config.integrations.linear.apiKey;
    const teamId = config.integrations.linear.teamId;
    if (!apiKey || !teamId) {
      console.log(chalk4.yellow("Missing API key or team ID. Set both to test connection."));
      return;
    }
    console.log(chalk4.cyan("Testing Linear connection..."));
    try {
      const client = linear.initLinearClient({ apiKey, teamId });
      const team = await client.getTeam();
      console.log(chalk4.green(`Connected to Linear team: ${team.name} (${team.key})`));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.log(chalk4.red(`Connection failed: ${message}`));
    }
  }
  if (!options.apiKey && !options.teamId && !options.test) {
    const apiKey = config.integrations.linear.apiKey;
    const teamId = config.integrations.linear.teamId;
    console.log(chalk4.cyan("Linear Configuration:"));
    console.log(`  API Key: ${apiKey ? chalk4.green("configured") : chalk4.yellow("not set")}`);
    console.log(`  Team ID: ${teamId || chalk4.yellow("not set")}`);
  }
});
var configCommand = new Command4("config").description("Manage DevPilot configuration").argument("[key]", "Configuration key (e.g., ui.port)").argument("[value]", "Value to set").option("-l, --list", "List all configuration").action(async (key, value, options) => {
  const configPath = join3(process.cwd(), ".devpilot", "config.yaml");
  if (!existsSync3(configPath)) {
    console.log(chalk4.red('\u274C DevPilot not initialized. Run "devpilot init" first.'));
    return;
  }
  const configContent = readFileSync(configPath, "utf-8");
  const config = YAML.parse(configContent);
  if (options.list || !key && !value) {
    console.log(chalk4.cyan("DevPilot Configuration:"));
    console.log("");
    console.log(YAML.stringify(config));
    return;
  }
  if (key && !value) {
    const keys = key.split(".");
    let current = config;
    for (const k of keys) {
      if (current && typeof current === "object" && k in current) {
        current = current[k];
      } else {
        console.log(chalk4.red(`\u274C Key "${key}" not found.`));
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
    writeFileSync2(configPath, YAML.stringify(config));
    console.log(chalk4.green(`\u2705 Set ${key} = ${JSON.stringify(parsedValue)}`));
  }
}).addCommand(linearCommand);

// src/commands/setup.ts
import { Command as Command5 } from "commander";
import { existsSync as existsSync5, readFileSync as readFileSync3, writeFileSync as writeFileSync4 } from "fs";
import { join as join5 } from "path";
import chalk6 from "chalk";
import YAML2 from "yaml";
import * as readline from "readline";
import { linear as linear2 } from "@devpilot.sh/core";

// src/utils/orchestrator.ts
import { execSync, spawnSync } from "child_process";
import { existsSync as existsSync4, readFileSync as readFileSync2, writeFileSync as writeFileSync3 } from "fs";
import { join as join4, basename } from "path";
import { homedir } from "os";
import chalk5 from "chalk";
function checkCommand(cmd, versionArg = "--version") {
  try {
    const result = spawnSync(cmd, [versionArg], { encoding: "utf-8", stdio: "pipe" });
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
      const result = spawnSync("gh", ["auth", "status"], { encoding: "utf-8", stdio: "pipe" });
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
  console.log(chalk5.cyan("\nSystem Requirements:"));
  console.log("");
  if (reqs.node.installed && reqs.node.meetsMinimum) {
    console.log(chalk5.green(`  \u2713 Node.js ${reqs.node.version}`));
  } else if (reqs.node.installed) {
    console.log(chalk5.yellow(`  \u26A0 Node.js ${reqs.node.version} (requires 20.0.0+)`));
  } else {
    console.log(chalk5.red("  \u2717 Node.js not found"));
  }
  if (reqs.git.installed && reqs.git.meetsMinimum) {
    console.log(chalk5.green(`  \u2713 Git ${reqs.git.version}`));
  } else if (reqs.git.installed) {
    console.log(chalk5.yellow(`  \u26A0 Git ${reqs.git.version} (requires 2.25.0+)`));
  } else {
    console.log(chalk5.red("  \u2717 Git not found"));
  }
  if (reqs.tmux.installed) {
    console.log(chalk5.green("  \u2713 tmux"));
  } else {
    console.log(chalk5.yellow("  \u26A0 tmux not found (optional, for session management)"));
  }
  if (reqs.gh.installed && reqs.gh.authenticated) {
    console.log(chalk5.green("  \u2713 GitHub CLI (authenticated)"));
  } else if (reqs.gh.installed) {
    console.log(chalk5.yellow("  \u26A0 GitHub CLI (not authenticated - run: gh auth login)"));
  } else {
    console.log(chalk5.yellow("  \u26A0 GitHub CLI not found (optional, for PR creation)"));
  }
  if (reqs.rtk.installed) {
    console.log(chalk5.green(`  \u2713 RTK ${reqs.rtk.version || ""} (token optimization)`));
  } else {
    console.log(chalk5.yellow("  \u26A0 RTK not found (recommended, for 60-90% token savings)"));
  }
  if (reqs.caveman.installed) {
    console.log(chalk5.green("  \u2713 Caveman plugin (output token compression)"));
  } else {
    console.log(chalk5.yellow("  \u26A0 Caveman not found (optional, for ~65-75% output token savings)"));
  }
}
function isOrchestratorInstalled() {
  try {
    const result = spawnSync("npx", ["@composio/ao-cli", "--version"], {
      encoding: "utf-8",
      stdio: "pipe"
    });
    return result.status === 0;
  } catch {
    return false;
  }
}
function installOrchestrator() {
  console.log(chalk5.cyan("\nInstalling @composio/ao-cli..."));
  try {
    execSync("npm install -g @composio/ao-cli", { stdio: "inherit" });
    console.log(chalk5.green("\u2713 @composio/ao-cli installed successfully"));
    return true;
  } catch {
    console.log(chalk5.red("\u2717 Failed to install @composio/ao-cli"));
    console.log(chalk5.gray("  Try manually: npm install -g @composio/ao-cli"));
    return false;
  }
}
function isRtkInstalled() {
  try {
    const result = spawnSync("rtk", ["--version"], { encoding: "utf-8", stdio: "pipe" });
    return result.status === 0;
  } catch {
    return false;
  }
}
function installRtk() {
  const hasCargo = spawnSync("cargo", ["--version"], { encoding: "utf-8", stdio: "pipe" }).status === 0;
  if (hasCargo) {
    console.log(chalk5.cyan("\n  Installing RTK via cargo (this may take a few minutes)..."));
    try {
      execSync("cargo install --git https://github.com/rtk-ai/rtk", { stdio: "inherit" });
      console.log(chalk5.green("  \u2713 RTK installed successfully"));
      return true;
    } catch {
      console.log(chalk5.red("  \u2717 Failed to install RTK via cargo"));
    }
  }
  console.log(chalk5.cyan("\n  Installing RTK via install script..."));
  try {
    execSync("curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh", {
      stdio: "inherit"
    });
    console.log(chalk5.green("  \u2713 RTK installed successfully"));
    return true;
  } catch {
    console.log(chalk5.red("  \u2717 Failed to install RTK"));
    console.log(chalk5.gray("  Install manually: cargo install --git https://github.com/rtk-ai/rtk"));
    console.log(chalk5.gray("  Or: brew install rtk"));
    return false;
  }
}
function initRtkHook() {
  console.log(chalk5.cyan("\n  Initializing RTK hook for Claude Code..."));
  try {
    execSync("rtk init -g", { encoding: "utf-8", stdio: "pipe" });
    console.log(chalk5.green("  \u2713 RTK hook initialized"));
    return true;
  } catch {
    console.log(chalk5.yellow("  \u26A0 RTK hook init requires manual step: rtk init -g"));
    return false;
  }
}
function isCavemanInstalled() {
  const claudeDir = join4(homedir(), ".claude");
  if (existsSync4(join4(claudeDir, "hooks", "caveman-activate.js"))) {
    return true;
  }
  const settingsPath = join4(claudeDir, "settings.json");
  if (existsSync4(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync2(settingsPath, "utf-8"));
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
  console.log(chalk5.cyan("\n  Installing Caveman plugin for Claude Code..."));
  try {
    execSync("npx -y skills add JuliusBrussee/caveman", {
      stdio: "inherit",
      timeout: 12e4
    });
    console.log(chalk5.green("  \u2713 Caveman plugin installed successfully"));
    return true;
  } catch {
    console.log(chalk5.yellow("  npx skills add failed, trying hook install script..."));
    try {
      execSync(
        "bash <(curl -fsSL https://raw.githubusercontent.com/JuliusBrussee/caveman/main/hooks/install.sh)",
        { stdio: "inherit", shell: "/bin/bash", timeout: 6e4 }
      );
      console.log(chalk5.green("  \u2713 Caveman hooks installed successfully"));
      return true;
    } catch {
      console.log(chalk5.red("  \u2717 Failed to install Caveman plugin"));
      console.log(chalk5.gray("  Install manually: npx skills add JuliusBrussee/caveman"));
      return false;
    }
  }
}
function detectRepoInfo(cwd) {
  try {
    const remoteResult = spawnSync("git", ["remote", "get-url", "origin"], {
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
    const branchResult = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
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
  const projectName = basename(cwd);
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
  const YAML3 = __require("yaml");
  const configPath = join4(cwd, "agent-orchestrator.yaml");
  const yamlContent = YAML3.stringify(config);
  writeFileSync3(configPath, yamlContent);
}
function orchestratorConfigExists(cwd) {
  return existsSync4(join4(cwd, "agent-orchestrator.yaml"));
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
var setupCommand = new Command5("setup").description("Interactive setup wizard for DevPilot and agent-orchestrator").option("--linear-only", "Only configure Linear integration").option("--orchestrator-only", "Only configure agent-orchestrator").option("--check", "Only check system requirements").option("-y, --yes", "Accept all defaults (non-interactive mode)").action(async (options) => {
  const nonInteractive = options.yes;
  const cwd = process.cwd();
  const configPath = join5(cwd, ".devpilot", "config.yaml");
  if (!existsSync5(configPath)) {
    console.log(chalk6.red('DevPilot not initialized. Run "devpilot init" first.'));
    return;
  }
  console.log(chalk6.bold.cyan("\n DevPilot Setup Wizard\n"));
  console.log(chalk6.gray("This wizard will help you configure DevPilot and agent-orchestrator.\n"));
  console.log(chalk6.bold("Step 1: Checking System Requirements"));
  const reqs = checkSystemRequirements();
  printRequirementsStatus(reqs);
  if (!reqs.node.meetsMinimum) {
    console.log(chalk6.red("\nNode.js 20+ is required. Please upgrade and try again."));
    return;
  }
  if (!reqs.git.meetsMinimum) {
    console.log(chalk6.red("\nGit 2.25+ is required. Please upgrade and try again."));
    return;
  }
  const instructions = getInstallInstructions(reqs);
  if (instructions.length > 0) {
    console.log(chalk6.yellow("\nOptional installations:"));
    instructions.forEach((inst) => console.log(chalk6.gray(`  - ${inst}`)));
  }
  if (options.check) {
    return;
  }
  console.log("");
  if (!options.orchestratorOnly) {
    console.log(chalk6.bold("Step 2: Linear Integration"));
    console.log(chalk6.gray("Linear integration enables ticket tracking and auto-status updates.\n"));
    const configContent = readFileSync3(configPath, "utf-8");
    const config = YAML2.parse(configContent);
    const existingApiKey = config.integrations?.linear?.apiKey;
    const existingTeamId = config.integrations?.linear?.teamId;
    if (existingApiKey && existingTeamId) {
      console.log(chalk6.green("  Linear is already configured."));
      if (!nonInteractive) {
        const reconfigure = await confirm("  Reconfigure Linear?", false);
        if (reconfigure) {
          await configureLinear(configPath, config);
        }
      }
      console.log("");
    } else if (nonInteractive) {
      console.log(chalk6.gray("  Skipping Linear setup (non-interactive mode).\n"));
    } else {
      const setupLinear = await confirm("  Would you like to set up Linear integration?");
      if (setupLinear) {
        await configureLinear(configPath, config);
      } else {
        console.log(chalk6.gray("  Skipping Linear setup.\n"));
      }
    }
  }
  if (!options.linearOnly) {
    console.log(chalk6.bold("Step 3: Agent Orchestrator"));
    console.log(chalk6.gray("Agent orchestrator manages parallel AI coding agents.\n"));
    const installed = isOrchestratorInstalled();
    if (!installed) {
      console.log(chalk6.yellow("  @composio/ao-cli is not installed."));
      if (nonInteractive) {
        console.log(chalk6.gray("  Skipping installation (non-interactive mode)."));
        console.log(chalk6.gray("  Install later with: npm install -g @composio/ao-cli\n"));
      } else {
        const install = await confirm("  Install @composio/ao-cli globally?");
        if (install) {
          const success = installOrchestrator();
          if (!success) {
            console.log(chalk6.yellow("  Continuing without agent-orchestrator CLI...\n"));
          }
        } else {
          console.log(chalk6.gray("  Skipping installation. You can install later with:"));
          console.log(chalk6.cyan("    npm install -g @composio/ao-cli\n"));
        }
      }
    } else {
      console.log(chalk6.green("  @composio/ao-cli is installed."));
    }
    if (orchestratorConfigExists(cwd)) {
      console.log(chalk6.green("  agent-orchestrator.yaml already exists."));
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
          console.log(chalk6.gray("  Skipping config generation.\n"));
        }
      }
    }
  }
  if (!options.linearOnly && !options.orchestratorOnly) {
    console.log(chalk6.bold("Step 4: RTK Token Optimization"));
    console.log(chalk6.gray("RTK reduces LLM token consumption by 60-90% across fleet agents.\n"));
    const rtkInstalled = isRtkInstalled();
    if (rtkInstalled) {
      console.log(chalk6.green("  RTK is already installed."));
      console.log(chalk6.gray("  Ensuring Claude Code hook is configured..."));
      initRtkHook();
    } else if (nonInteractive) {
      console.log(chalk6.gray("  Installing RTK (non-interactive mode)..."));
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
        console.log(chalk6.gray("  Skipping RTK installation. Install later with:"));
        console.log(chalk6.cyan("    cargo install --git https://github.com/rtk-ai/rtk"));
        console.log(chalk6.cyan("    rtk init -g\n"));
      }
    }
    console.log("");
  }
  if (!options.linearOnly && !options.orchestratorOnly) {
    console.log(chalk6.bold("Step 5: Caveman Output Compression"));
    console.log(chalk6.gray("Caveman reduces output token usage by ~65-75% across fleet agents.\n"));
    const cavemanInstalled = isCavemanInstalled();
    if (cavemanInstalled) {
      console.log(chalk6.green("  Caveman plugin is already installed."));
      console.log(chalk6.gray("  Activate in any session with /caveman (modes: lite, full, ultra)"));
    } else if (nonInteractive) {
      console.log(chalk6.gray("  Installing Caveman plugin (non-interactive mode)..."));
      installCaveman();
    } else {
      const install = await confirm("  Install Caveman plugin for compressed agent output?");
      if (install) {
        installCaveman();
      } else {
        console.log(chalk6.gray("  Skipping Caveman installation. Install later with:"));
        console.log(chalk6.cyan("    npx skills add JuliusBrussee/caveman\n"));
      }
    }
    console.log("");
  }
  console.log(chalk6.bold.green("\nSetup Complete!\n"));
  console.log(chalk6.white("Next steps:"));
  console.log(chalk6.gray("  1. Run ") + chalk6.cyan("devpilot serve") + chalk6.gray(" to start the UI"));
  console.log(chalk6.gray("  2. Run ") + chalk6.cyan("ao start") + chalk6.gray(" to start agent orchestrator"));
  console.log(chalk6.gray("  3. Use the UI to create items and dispatch to the fleet"));
  console.log(chalk6.gray("  4. Run ") + chalk6.cyan("rtk gain") + chalk6.gray(" to monitor token savings"));
  console.log(chalk6.gray("  5. Use ") + chalk6.cyan("/caveman") + chalk6.gray(" in sessions for compressed output\n"));
});
async function configureLinear(configPath, config) {
  console.log("");
  console.log(chalk6.gray("  Get your API key from: https://linear.app/settings/api\n"));
  const apiKey = await prompt("  Linear API key: ");
  if (!apiKey) {
    console.log(chalk6.yellow("  No API key provided. Skipping Linear setup.\n"));
    return;
  }
  console.log(chalk6.cyan("\n  Connecting to Linear..."));
  try {
    const tempClient = linear2.initLinearClient({ apiKey, teamId: "" });
    const teams = await tempClient.getTeams();
    if (teams.length === 0) {
      console.log(chalk6.yellow("  No teams found. Make sure you have access to at least one team."));
      return;
    }
    console.log(chalk6.green(`  Found ${teams.length} team(s):
`));
    teams.forEach((team, i) => {
      console.log(chalk6.white(`    ${i + 1}. ${team.name} (${team.key})`));
    });
    const teamChoice = await prompt("\n  Select team number: ");
    const teamIndex = parseInt(teamChoice, 10) - 1;
    if (isNaN(teamIndex) || teamIndex < 0 || teamIndex >= teams.length) {
      console.log(chalk6.yellow("  Invalid selection. Skipping Linear setup."));
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
    writeFileSync4(configPath, YAML2.stringify(config));
    console.log(chalk6.green(`
  Linear configured for team: ${selectedTeam.name}
`));
    console.log(chalk6.gray("  For agent-orchestrator, also set the LINEAR_API_KEY environment variable:"));
    console.log(chalk6.cyan(`    export LINEAR_API_KEY="${apiKey}"
`));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.log(chalk6.red(`  Failed to connect: ${message}`));
    console.log(chalk6.gray("  You can configure Linear later with: devpilot config linear\n"));
  }
}
async function configureOrchestrator(cwd, configPath, nonInteractive = false) {
  const config = YAML2.parse(readFileSync3(configPath, "utf-8"));
  const linearTeamId = config.integrations?.linear?.teamId;
  const aoConfig = generateOrchestratorConfig({
    cwd,
    linearTeamId
  });
  if (!nonInteractive) {
    const customRules = await confirm("\n  Would you like to customize agent rules?", false);
    if (customRules) {
      console.log(chalk6.gray("  Enter rules (one per line, empty line to finish):"));
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
  console.log(chalk6.green("\n  Created agent-orchestrator.yaml"));
  console.log(chalk6.gray("\n  Configuration preview:"));
  console.log(chalk6.gray("  " + "-".repeat(40)));
  const preview = YAML2.stringify(aoConfig).split("\n").slice(0, 15).join("\n");
  preview.split("\n").forEach((line) => console.log(chalk6.gray(`  ${line}`)));
  console.log(chalk6.gray("  ...\n"));
}

// src/commands/bridge.ts
import { Command as Command9 } from "commander";

// src/commands/bridge/connect.ts
import os from "os";
import { Command as Command6 } from "commander";
import chalk7 from "chalk";
import { BridgeClient, DispatchLoop, HeartbeatService } from "@devpilot.sh/bridge-client";

// src/commands/bridge/dispatch-handler.ts
import { orchestrator } from "@devpilot.sh/core";
var inFlight = /* @__PURE__ */ new Map();
function service(opts) {
  const existing = orchestrator.getOrchestratorServiceOrNull();
  if (existing) return existing;
  return orchestrator.initOrchestratorService({
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
  if (orchestrator.isStatusPollerInitialized()) return;
  const log = opts.onLog ?? (() => {
  });
  const poller = orchestrator.initStatusPoller(svc, {
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
      const request = orchestrator.buildDispatchRequest({
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
      orchestrator.getStatusPoller().trackSession(sessionId, response.orchestratorJobId ?? sessionId);
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
var connectCommand = new Command6("connect").description("Connect this machine to a DevPilot bridge and run dispatched work locally").option("-u, --url <url>", "Bridge URL", process.env.DEVPILOT_BRIDGE_URL).option("-t, --token <token>", "Orchestrator token (dp_orch_\u2026)", process.env.DEVPILOT_BRIDGE_TOKEN).option("-n, --name <name>", "Name for this machine", os.hostname()).option("-r, --repos <repos>", "Comma-separated repos this machine handles").option("-m, --mode <mode>", "Local orchestrator mode (ao-cli|http|claude-session)", "ao-cli").option(
  "--transport <transport>",
  "realtime | poll \u2014 polling is fully correct, just higher latency",
  process.env.DEVPILOT_BRIDGE_TRANSPORT || "realtime"
).option("-j, --max-jobs <n>", "Max concurrent local jobs", "4").option("--http-url <url>", "Orchestrator URL (required for --mode http)").option("--ao-project <name>", "ao project name (for --mode ao-cli)").option("--ao-path <path>", "Path to the ao binary (default: ao on PATH)").action(async (options) => {
  if (!options.url) {
    console.error(chalk7.red("\u2717 Bridge URL required (--url or DEVPILOT_BRIDGE_URL)"));
    process.exit(1);
  }
  if (!options.token) {
    console.error(chalk7.red("\u2717 Token required (--token or DEVPILOT_BRIDGE_TOKEN)"));
    console.error(chalk7.gray("  Mint one in the dashboard under Settings \u2192 Tokens."));
    process.exit(1);
  }
  const repos = options.repos?.split(",").map((r) => r.trim()).filter(Boolean) ?? [];
  const maxConcurrentJobs = Math.max(1, parseInt(options.maxJobs, 10) || 4);
  console.log(chalk7.cyan("\u{1F309} DevPilot bridge"));
  console.log(chalk7.gray(`   ${options.url}`));
  console.log(chalk7.gray(`   machine: ${options.name}`));
  console.log("");
  if (options.mode === "http" && !options.httpUrl) {
    console.error(chalk7.red("\u2717 --mode http requires --http-url"));
    process.exit(1);
  }
  const client = new BridgeClient({ bridgeUrl: options.url, token: options.token });
  let registration;
  try {
    registration = await client.register({ name: options.name, repos, maxConcurrentJobs });
  } catch (err) {
    console.error(chalk7.red("\u2717 Registration failed"));
    console.error(chalk7.red(`   ${err instanceof Error ? err.message : err}`));
    process.exit(1);
  }
  console.log(chalk7.green("\u2713 Registered"));
  console.log(chalk7.gray(`   orchestrator: ${registration.orchestratorId}`));
  console.log(chalk7.gray(`   repos: ${repos.join(", ") || "(none)"}`));
  if (repos.length === 0) {
    console.log(chalk7.yellow("   \u26A0 No repos specified \u2014 nothing can route to this machine."));
    console.log(chalk7.gray("     Re-run with --repos owner/name to receive dispatches."));
  }
  console.log("");
  const useRealtime = options.transport !== "poll" && registration.realtime !== null;
  if (options.transport !== "poll" && !registration.realtime) {
    console.log(chalk7.yellow("   Realtime unavailable from this bridge \u2014 polling instead."));
  }
  const loop = new DispatchLoop({
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
      onLog: (line) => console.log(chalk7.blue(`   ${line}`))
    }),
    onLog: (line) => console.log(chalk7.gray(`   ${line}`)),
    onError: (e) => console.log(chalk7.yellow(`   ${e.message}`))
  });
  const heartbeat = new HeartbeatService({
    client,
    activeJobs: () => loop.activeJobs,
    onError: (e) => console.log(chalk7.gray(`   heartbeat: ${e.message}`))
  });
  await loop.start();
  heartbeat.start();
  console.log(chalk7.green(`\u2713 Listening (${useRealtime ? "realtime" : "poll"})`));
  console.log(chalk7.gray("   Agents run on THIS machine. Ctrl+C to disconnect."));
  console.log("");
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("");
    console.log(chalk7.yellow("Disconnecting\u2026"));
    heartbeat.stop();
    await loop.stop();
    console.log(chalk7.green("\u2713 Disconnected"));
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
  await new Promise(() => {
  });
});

// src/commands/bridge/disconnect.ts
import { Command as Command7 } from "commander";
import chalk8 from "chalk";
var disconnectCommand = new Command7("disconnect").description("Disconnect from DevPilot cloud bridge").option("-u, --bridge-url <url>", "Bridge service URL", process.env.DEVPILOT_BRIDGE_URL).option("-k, --api-key <key>", "API key", process.env.DEVPILOT_BRIDGE_API_KEY).option("-i, --orchestrator-id <id>", "Orchestrator ID to disconnect").action(async (options) => {
  if (!options.bridgeUrl || !options.orchestratorId) {
    console.error(chalk8.red("\u2717 Error: Bridge URL and orchestrator ID required"));
    console.error(chalk8.gray("   Use: devpilot bridge disconnect -u <url> -i <orchestrator-id>"));
    process.exit(1);
  }
  console.log(chalk8.cyan("\u{1F309} Disconnecting from DevPilot Bridge"));
  console.log("");
  console.log(chalk8.gray(`   Bridge URL: ${options.bridgeUrl}`));
  console.log(chalk8.gray(`   Orchestrator ID: ${options.orchestratorId}`));
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
      console.log(chalk8.green("\u2713 Successfully disconnected from bridge"));
    } else {
      const errorText = await response.text();
      console.error(chalk8.red("\u2717 Failed to disconnect:"));
      console.error(chalk8.red(`   ${errorText}`));
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk8.red("\u2717 Error disconnecting:"));
    console.error(chalk8.red(`   ${error instanceof Error ? error.message : error}`));
    process.exit(1);
  }
});

// src/commands/bridge/status.ts
import { Command as Command8 } from "commander";
import chalk9 from "chalk";
var statusCommand2 = new Command8("status").description("Check bridge connection status").option("-u, --bridge-url <url>", "Bridge service URL", process.env.DEVPILOT_BRIDGE_URL).option("-i, --orchestrator-id <id>", "Orchestrator ID").option("-k, --api-key <key>", "API key", process.env.DEVPILOT_BRIDGE_API_KEY).action(async (options) => {
  if (!options.bridgeUrl) {
    console.error(chalk9.red("\u2717 Error: Bridge URL required"));
    console.error(chalk9.gray("   Use: devpilot bridge status -u <url>"));
    process.exit(1);
  }
  console.log(chalk9.cyan("\u{1F309} DevPilot Bridge Status"));
  console.log("");
  try {
    const healthRes = await fetch(`${options.bridgeUrl}/health`);
    const health = await healthRes.json();
    console.log(chalk9.white("Bridge Status:"));
    if (health.status === "ok") {
      console.log(chalk9.gray("  Status: ") + chalk9.green("\u2713 Online"));
    } else {
      console.log(chalk9.gray("  Status: ") + chalk9.red("\u2717 Offline"));
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
        console.log(chalk9.white("Orchestrator Status:"));
        console.log(chalk9.gray("  ID: ") + chalk9.cyan(orch.id));
        console.log(chalk9.gray("  Name: ") + chalk9.white(orch.name));
        if (orch.isOnline) {
          console.log(chalk9.gray("  Online: ") + chalk9.green("\u2713"));
        } else {
          console.log(chalk9.gray("  Online: ") + chalk9.red("\u2717"));
        }
        console.log(chalk9.gray("  Active Jobs: ") + chalk9.yellow(orch.activeJobs));
        console.log(chalk9.gray("  Last Heartbeat: ") + chalk9.white(orch.lastHeartbeat || "Never"));
        console.log(chalk9.gray("  Repos: ") + chalk9.cyan(orch.repos?.join(", ") || "None"));
      } else {
        console.log(chalk9.white("Orchestrator Status:"));
        console.log(chalk9.gray("  ") + chalk9.red("Not found or unauthorized"));
      }
    }
  } catch (error) {
    console.error(chalk9.red("\u2717 Error checking status:"));
    console.error(chalk9.red(`   ${error instanceof Error ? error.message : error}`));
    process.exit(1);
  }
});

// src/commands/bridge.ts
var bridgeCommand = new Command9("bridge").description("Manage connection to DevPilot cloud bridge").addCommand(connectCommand).addCommand(disconnectCommand).addCommand(statusCommand2);

// src/commands/update.ts
import { Command as Command10 } from "commander";
import { execSync as execSync2, spawn } from "child_process";
import chalk10 from "chalk";
async function getLatestVersion() {
  try {
    const result = execSync2("npm view @devpilot.sh/cli version", {
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
    const pnpmList = execSync2("pnpm list -g @devpilot.sh/cli 2>/dev/null", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    if (pnpmList.includes("@devpilot.sh/cli")) return "pnpm";
  } catch {
  }
  try {
    const yarnList = execSync2("yarn global list 2>/dev/null", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    if (yarnList.includes("@devpilot.sh/cli")) return "yarn";
  } catch {
  }
  try {
    execSync2("bun --version", { stdio: ["pipe", "pipe", "pipe"] });
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
var updateCommand = new Command10("update").description("Update DevPilot CLI to the latest version").option("-c, --check", "Only check for updates without installing").option("--force", "Force update even if already on latest version").action(async (options) => {
  console.log(chalk10.cyan("Checking for updates..."));
  const latestVersion = await getLatestVersion();
  if (!latestVersion) {
    console.log(chalk10.yellow("Could not check for updates. Please check your network connection."));
    console.log(chalk10.gray("You can manually update with: npm install -g @devpilot.sh/cli@latest"));
    return;
  }
  const comparison = compareVersions(latestVersion, VERSION);
  if (comparison === 0 && !options.force) {
    console.log(chalk10.green(`You're already on the latest version (${VERSION})`));
    return;
  }
  if (comparison === -1 && !options.force) {
    console.log(chalk10.yellow(`You're on a newer version (${VERSION}) than the latest release (${latestVersion})`));
    console.log(chalk10.gray("This might be a pre-release or development version."));
    return;
  }
  if (options.check) {
    if (comparison === 1) {
      console.log(chalk10.yellow(`Update available: ${VERSION} \u2192 ${latestVersion}`));
      console.log(chalk10.gray('Run "devpilot update" to install the latest version.'));
    }
    return;
  }
  const pm = detectPackageManager();
  const updateCmd = getUpdateCommand(pm);
  console.log(chalk10.cyan(`Updating from ${VERSION} to ${latestVersion}...`));
  console.log(chalk10.gray(`Using: ${updateCmd}`));
  console.log("");
  try {
    const [cmd, ...args] = updateCmd.split(" ");
    const child = spawn(cmd, args, {
      stdio: "inherit",
      shell: true
    });
    child.on("close", (code) => {
      if (code === 0) {
        console.log("");
        console.log(chalk10.green(`Successfully updated to ${latestVersion}`));
        console.log(chalk10.gray('Run "devpilot --version" to verify.'));
      } else {
        console.log("");
        console.log(chalk10.red("Update failed. Please try manually:"));
        console.log(chalk10.cyan(`  ${updateCmd}`));
      }
    });
    child.on("error", (err) => {
      console.log(chalk10.red(`Update failed: ${err.message}`));
      console.log(chalk10.gray("Please try manually:"));
      console.log(chalk10.cyan(`  ${updateCmd}`));
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.log(chalk10.red(`Update failed: ${message}`));
    console.log(chalk10.gray("Please try manually:"));
    console.log(chalk10.cyan(`  ${updateCmd}`));
  }
});

// src/commands/wiki.ts
import { Command as Command11 } from "commander";
import { existsSync as existsSync6, mkdirSync as mkdirSync3, readFileSync as readFileSync4, writeFileSync as writeFileSync5 } from "fs";
import { join as join6 } from "path";
import chalk11 from "chalk";
var wikiCommand = new Command11("wiki").description("LLM-compiled knowledge base \u2014 institutional memory for your codebase");
wikiCommand.command("init").description("Initialize the wiki system in the current repository").option("--wiki-dir <path>", "Wiki output directory", ".devpilot/wiki").action(async (options) => {
  const cwd = process.cwd();
  const devpilotDir = join6(cwd, ".devpilot");
  const wikiDir = join6(cwd, options.wikiDir);
  if (!existsSync6(devpilotDir)) {
    console.log(
      chalk11.yellow("\u26A0\uFE0F  DevPilot not initialized. Run `devpilot init` first.")
    );
    return;
  }
  if (!existsSync6(wikiDir)) {
    mkdirSync3(wikiDir, { recursive: true });
  }
  const indexPath = join6(wikiDir, "index.md");
  if (!existsSync6(indexPath)) {
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
    writeFileSync5(indexPath, initialIndex);
  }
  const logPath = join6(wikiDir, "log.md");
  if (!existsSync6(logPath)) {
    writeFileSync5(
      logPath,
      `# Wiki Activity Log

> Append-only chronicle of wiki operations.

- **${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}** [init] Wiki initialized
`
    );
  }
  const gitignorePath = join6(cwd, ".gitignore");
  if (existsSync6(gitignorePath)) {
    const gitignore = readFileSync4(gitignorePath, "utf-8");
    if (!gitignore.includes(".devpilot/wiki")) {
    }
  }
  console.log(chalk11.green("\u2705 Wiki initialized!"));
  console.log("");
  console.log(chalk11.white("Wiki directory: ") + chalk11.cyan(wikiDir));
  console.log("");
  console.log(chalk11.white("Next steps:"));
  console.log(
    chalk11.gray("  1. ") + chalk11.cyan("devpilot wiki ingest --file <path>") + chalk11.gray(" to add source material")
  );
  console.log(
    chalk11.gray("  2. ") + chalk11.cyan('devpilot wiki query "How does auth work?"') + chalk11.gray(" to ask questions")
  );
  console.log(
    chalk11.gray("  3. ") + chalk11.cyan("devpilot wiki status") + chalk11.gray(" to check wiki health")
  );
  console.log("");
  console.log(
    chalk11.gray(
      "The wiki will grow automatically as agents work \u2014 each session compounds the knowledge base."
    )
  );
});
wikiCommand.command("ingest").description("Ingest a source document into the wiki").requiredOption("--type <type>", "Source type: session_log, commit, spec, decision, manual").requiredOption("--title <title>", "Human-readable title for the source").option("--file <path>", "Path to source file").option("--stdin", "Read source from stdin").option("--origin <origin>", "Origin identifier (e.g. session ID, commit SHA)").action(async (options) => {
  let content;
  if (options.file) {
    if (!existsSync6(options.file)) {
      console.log(chalk11.red(`\u274C File not found: ${options.file}`));
      return;
    }
    content = readFileSync4(options.file, "utf-8");
  } else if (options.stdin) {
    content = readFileSync4(0, "utf-8");
  } else {
    console.log(
      chalk11.red("\u274C Provide either --file <path> or --stdin")
    );
    return;
  }
  const validTypes = ["session_log", "commit", "spec", "decision", "manual"];
  if (!validTypes.includes(options.type)) {
    console.log(
      chalk11.red(
        `\u274C Invalid type "${options.type}". Must be one of: ${validTypes.join(", ")}`
      )
    );
    return;
  }
  console.log(chalk11.gray(`Ingesting ${options.type}: "${options.title}"...`));
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
    console.log(chalk11.green("\u2705 Ingested successfully!"));
    console.log(
      chalk11.gray(`   Source ID: ${result.sourceId}`)
    );
    if (result.articlesCreated.length > 0) {
      console.log(
        chalk11.white(`   Articles created: `) + chalk11.cyan(result.articlesCreated.join(", "))
      );
    }
    if (result.articlesUpdated.length > 0) {
      console.log(
        chalk11.white(`   Articles updated: `) + chalk11.yellow(result.articlesUpdated.join(", "))
      );
    }
    console.log(
      chalk11.gray(`   Tokens used: ${result.tokensUsed}`)
    );
  } catch (error) {
    console.log(
      chalk11.red(
        `\u274C Ingest failed: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
});
wikiCommand.command("query <question>").description("Ask a question against the wiki").action(async (question) => {
  console.log(chalk11.gray(`Searching wiki for: "${question}"...`));
  try {
    const { createWikiCompiler } = await import("@devpilot.sh/core/wiki");
    const config = getWikiConfig();
    const compiler = createWikiCompiler(config);
    const result = await compiler.query(question);
    console.log("");
    console.log(chalk11.white(result.answer));
    console.log("");
    if (result.citedArticles.length > 0) {
      console.log(
        chalk11.gray("Cited: ") + chalk11.cyan(result.citedArticles.map((s) => `[[${s}]]`).join(", "))
      );
    }
    if (result.newArticleSlug) {
      console.log(
        chalk11.green(
          `\u{1F4DD} New article created from this query: [[${result.newArticleSlug}]]`
        )
      );
    }
    console.log(chalk11.gray(`Tokens used: ${result.tokensUsed}`));
  } catch (error) {
    console.log(
      chalk11.red(
        `\u274C Query failed: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
});
wikiCommand.command("lint").description("Check wiki health \u2014 find stale content, orphans, and gaps").action(async () => {
  console.log(chalk11.gray("Linting wiki..."));
  try {
    const { createWikiCompiler } = await import("@devpilot.sh/core/wiki");
    const config = getWikiConfig();
    const compiler = createWikiCompiler(config);
    const result = await compiler.lint();
    if (result.findings.length === 0) {
      console.log(chalk11.green("\u2705 Wiki is healthy \u2014 no issues found!"));
      return;
    }
    console.log(
      chalk11.yellow(`\u26A0\uFE0F  Found ${result.findings.length} issue(s):
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
        `  ${icon} ${chalk11.white(`[${finding.type}]`)} ${chalk11.cyan(`[[${finding.articleSlug}]]`)}`
      );
      console.log(chalk11.gray(`     ${finding.description}`));
      console.log(chalk11.gray(`     \u2192 ${finding.suggestion}`));
      console.log("");
    }
    if (result.articlesMarkedStale.length > 0) {
      console.log(
        chalk11.yellow(
          `Marked ${result.articlesMarkedStale.length} article(s) as stale.`
        )
      );
    }
    console.log(chalk11.gray(`Tokens used: ${result.tokensUsed}`));
  } catch (error) {
    console.log(
      chalk11.red(
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
    console.log(chalk11.white.bold("\n\u{1F4DA} Wiki Status\n"));
    console.log(
      chalk11.gray("  Sources:    ") + chalk11.white(String(status.totalSources))
    );
    console.log(
      chalk11.gray("  Articles:   ") + chalk11.white(String(status.totalArticles)) + chalk11.gray(" (") + chalk11.green(`${status.activeArticles} active`) + (status.staleArticles > 0 ? chalk11.yellow(`, ${status.staleArticles} stale`) : "") + (status.archivedArticles > 0 ? chalk11.gray(`, ${status.archivedArticles} archived`) : "") + chalk11.gray(")")
    );
    if (Object.keys(status.categories).length > 0) {
      console.log(chalk11.gray("\n  Categories:"));
      for (const [category, count] of Object.entries(status.categories).sort()) {
        console.log(
          chalk11.gray("    ") + chalk11.cyan(category) + chalk11.gray(": ") + chalk11.white(String(count))
        );
      }
    }
    if (status.lastActivity) {
      console.log(
        chalk11.gray("\n  Last activity: ") + chalk11.white(status.lastActivity.toISOString().split("T")[0])
      );
    }
    console.log("");
  } catch (error) {
    console.log(
      chalk11.red(
        `\u274C Status failed: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
});
wikiCommand.command("flush").description("Export wiki to disk as markdown files").action(async () => {
  console.log(chalk11.gray("Flushing wiki to disk..."));
  try {
    const { createWikiCompiler } = await import("@devpilot.sh/core/wiki");
    const config = getWikiConfig();
    const compiler = createWikiCompiler(config);
    const result = await compiler.flushToDisk();
    console.log(chalk11.green(`\u2705 Wrote ${result.filesWritten} files to ${result.wikiDir}`));
  } catch (error) {
    console.log(
      chalk11.red(
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
      console.log(chalk11.gray("Wiki is empty. Run `devpilot wiki ingest` to add sources."));
      return;
    }
    const byCategory = {};
    for (const entry of index) {
      if (!byCategory[entry.category]) {
        byCategory[entry.category] = [];
      }
      byCategory[entry.category].push(entry);
    }
    console.log(chalk11.white.bold("\n\u{1F4D6} Wiki Index\n"));
    for (const [category, entries] of Object.entries(byCategory).sort()) {
      console.log(
        chalk11.cyan.bold(
          `  ${category.charAt(0).toUpperCase() + category.slice(1)}`
        )
      );
      for (const entry of entries) {
        const statusColor = entry.status === "active" ? chalk11.green : entry.status === "stale" ? chalk11.yellow : chalk11.gray;
        const badge = statusColor(`[${entry.status}]`);
        console.log(
          `    ${badge} ${chalk11.white(entry.title)} ${chalk11.gray(`[[${entry.slug}]]`)}`
        );
      }
      console.log("");
    }
  } catch (error) {
    console.log(
      chalk11.red(
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
      console.log(chalk11.red(`\u274C Article not found: [[${slug}]]`));
      return;
    }
    console.log(chalk11.white.bold(`
# ${article.title}
`));
    console.log(
      chalk11.gray(
        `Category: ${article.category} | Status: ${article.status} | v${article.version}`
      )
    );
    if (article.backlinks.length > 0) {
      console.log(
        chalk11.gray(
          `Related: ${article.backlinks.map((b) => `[[${b}]]`).join(", ")}`
        )
      );
    }
    console.log(chalk11.gray("\u2500".repeat(60)));
    console.log(article.content);
    console.log("");
  } catch (error) {
    console.log(
      chalk11.red(
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
    wikiDir: join6(cwd, ".devpilot", "wiki")
  };
}
function getRepoName(cwd) {
  try {
    const { execSync: execSync3 } = __require("child_process");
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
import { benchCommand } from "@devpilot.sh/benchmarks/cli";
var pkg = {
  name: "@devpilot.sh/cli",
  version: VERSION
};
var cli = new Command12();
cli.name("devpilot").description("DevPilot CLI - Manage your AI coding agent fleet").version(VERSION);
cli.addCommand(initCommand);
cli.addCommand(setupCommand);
cli.addCommand(serveCommand);
cli.addCommand(statusCommand);
cli.addCommand(configCommand);
cli.addCommand(bridgeCommand);
cli.addCommand(updateCommand);
cli.addCommand(wikiCommand);
cli.addCommand(benchCommand);
function runCli(args = process.argv) {
  const notifier = updateNotifier({
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
export {
  VERSION,
  cli,
  runCli
};
//# sourceMappingURL=index.mjs.map