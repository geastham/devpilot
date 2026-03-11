#!/usr/bin/env node
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/cli.ts
import { Command as Command10 } from "commander";

// src/version.ts
var VERSION = "0.1.0";

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
  initStatusPoller
} from "@devpilot.sh/core/orchestrator";

// src/server/api/items.ts
import {
  horizonItems,
  plans,
  workstreams,
  tasks,
  touchedFiles,
  activityEvents
} from "@devpilot.sh/core/db";
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
    const [plan] = await db2.insert(plans).values({
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
    const [workstream] = await db2.insert(workstreams).values({
      planId: plan.id,
      label: "Implementation",
      repo: item.repo,
      workerCount: 1,
      orderIndex: 0
    }).returning();
    await db2.insert(tasks).values({
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
      await db2.update(horizonItems).set({ zone: "REFINING", updatedAt: /* @__PURE__ */ new Date() }).where(eq(horizonItems.id, id));
    }
    const completePlan = await db2.query.plans.findFirst({
      where: eq(plans.id, plan.id),
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
  inFlightFiles,
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
      await db2.insert(inFlightFiles).values({
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
    const orchestrator = getOrchestratorServiceOrNull();
    if (orchestrator && orchestrator.isEnabled) {
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
      const dispatchResult = await orchestrator.dispatch(dispatchRequest);
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
      await db2.insert(inFlightFiles).values({
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
      callbackUrl: `http://127.0.0.1:${options.port}/api/fleet/callback`
    };
    const orchestrator = initOrchestratorService(orchestratorConfig);
    initStatusPoller(orchestrator, {
      pollIntervalMs: 5e3,
      onStatusUpdate: async (sessionId, status) => {
        const { rufloSessions: rufloSessions3 } = await import("@devpilot.sh/core/db");
        const { eq: eq5 } = await import("drizzle-orm");
        await db.update(rufloSessions3).set({
          progressPercent: status.progressPercent,
          status: status.status === "running" ? "ACTIVE" : status.status === "complete" ? "COMPLETE" : status.status === "error" ? "ERROR" : "ACTIVE",
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq5(rufloSessions3.id, sessionId));
      },
      onComplete: async (sessionId, report) => {
        const { rufloSessions: rufloSessions3, activityEvents: activityEvents4 } = await import("@devpilot.sh/core/db");
        const { eq: eq5 } = await import("drizzle-orm");
        await db.update(rufloSessions3).set({
          status: report.success ? "COMPLETE" : "ERROR",
          progressPercent: 100,
          prUrl: report.prUrl,
          tokensUsed: report.tokensUsed,
          costUsd: Math.round(report.costUsd * 100),
          // Store as cents
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq5(rufloSessions3.id, sessionId));
        await db.insert(activityEvents4).values({
          type: "SESSION_COMPLETE",
          message: report.success ? `Session completed: ${report.summary}` : `Session failed: ${report.error?.message || "Unknown error"}`,
          metadata: { sessionId, prUrl: report.prUrl }
        });
      },
      onError: async (sessionId, error) => {
        const { rufloSessions: rufloSessions3, activityEvents: activityEvents4 } = await import("@devpilot.sh/core/db");
        const { eq: eq5 } = await import("drizzle-orm");
        await db.update(rufloSessions3).set({
          status: "ERROR",
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq5(rufloSessions3.id, sessionId));
        await db.insert(activityEvents4).values({
          type: "SESSION_COMPLETE",
          message: `Session error: ${error.message}`,
          metadata: { sessionId, error: error.message }
        });
      }
    });
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
var serveCommand = new Command2("serve").description("Start the local DevPilot Conductor API server").option("-p, --port <port>", "Port to run the server on", "3847").option("--no-open", "Do not open browser automatically").option("--sync", "Enable cloud sync").option("--db <path>", "Path to SQLite database", ".devpilot/data.db").action(async (options) => {
  const port = parseInt(options.port, 10);
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
      dbPath
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
import { existsSync as existsSync5, readFileSync as readFileSync2, writeFileSync as writeFileSync4 } from "fs";
import { join as join5 } from "path";
import chalk6 from "chalk";
import YAML2 from "yaml";
import * as readline from "readline";
import { linear as linear2 } from "@devpilot.sh/core";

// src/utils/orchestrator.ts
import { execSync, spawnSync } from "child_process";
import { existsSync as existsSync4, writeFileSync as writeFileSync3 } from "fs";
import { join as join4, basename } from "path";
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
  return {
    node: { ...node, meetsMinimum: nodeMeetsMin },
    git: { ...git, meetsMinimum: gitMeetsMin },
    tmux: { installed: tmux.installed },
    gh: { installed: gh.installed, authenticated: ghAuthenticated }
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
    const configContent = readFileSync2(configPath, "utf-8");
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
  console.log(chalk6.bold.green("\nSetup Complete!\n"));
  console.log(chalk6.white("Next steps:"));
  console.log(chalk6.gray("  1. Run ") + chalk6.cyan("devpilot serve") + chalk6.gray(" to start the UI"));
  console.log(chalk6.gray("  2. Run ") + chalk6.cyan("ao start") + chalk6.gray(" to start agent orchestrator"));
  console.log(chalk6.gray("  3. Use the UI to create items and dispatch to the fleet\n"));
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
  const config = YAML2.parse(readFileSync2(configPath, "utf-8"));
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
import { Command as Command6 } from "commander";
import chalk7 from "chalk";
import { BridgeClient, HeartbeatService, PubSubSubscriber } from "@devpilot.sh/bridge-client";
var connectCommand = new Command6("connect").description("Connect to DevPilot cloud bridge").option("-u, --bridge-url <url>", "Bridge service URL", process.env.DEVPILOT_BRIDGE_URL).option("-k, --api-key <key>", "API key for authentication", process.env.DEVPILOT_BRIDGE_API_KEY).option("-r, --repos <repos>", "Comma-separated list of repos to handle").option("-p, --project <project>", "GCP project ID for Pub/Sub", process.env.GCP_PROJECT_ID).action(async (options) => {
  if (!options.bridgeUrl) {
    console.error(chalk7.red("\u2717 Error: Bridge URL is required (--bridge-url or DEVPILOT_BRIDGE_URL)"));
    process.exit(1);
  }
  console.log(chalk7.cyan("\u{1F309} Connecting to DevPilot Bridge"));
  console.log("");
  console.log(chalk7.gray(`   Bridge URL: ${options.bridgeUrl}`));
  console.log("");
  const client = new BridgeClient({
    bridgeUrl: options.bridgeUrl,
    apiKey: options.apiKey || "",
    gcpProjectId: options.project
  });
  try {
    const repos = options.repos?.split(",").map((r) => r.trim()) || [];
    const result = await client.register({
      repos,
      maxConcurrentJobs: 4
    });
    console.log(chalk7.green("\u2713 Registered with bridge"));
    console.log(chalk7.gray(`   Orchestrator ID: ${result.orchestratorId}`));
    console.log(chalk7.gray(`   Repos: ${repos.join(", ") || "None specified"}`));
    console.log("");
    const heartbeat = new HeartbeatService({
      bridgeUrl: options.bridgeUrl,
      apiKey: options.apiKey || "",
      orchestratorId: result.orchestratorId,
      intervalMs: 3e4
    });
    heartbeat.start();
    console.log(chalk7.green("\u2713 Heartbeat service started"));
    console.log("");
    if (options.project) {
      const subscriber = new PubSubSubscriber({
        projectId: options.project,
        subscriptionName: `devpilot-dispatch-${result.orchestratorId}`,
        onMessage: async (message) => {
          console.log(chalk7.blue(`\u{1F4E8} Received dispatch: ${message.linearIdentifier} - ${message.title}`));
        }
      });
      await subscriber.start();
      console.log(chalk7.green("\u2713 Pub/Sub subscriber started"));
      console.log("");
    }
    console.log(chalk7.cyan("Connected to bridge. Press Ctrl+C to disconnect."));
    console.log("");
    process.on("SIGINT", () => {
      console.log("");
      console.log(chalk7.yellow("Disconnecting from bridge..."));
      heartbeat.stop();
      console.log(chalk7.green("\u2713 Disconnected"));
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      heartbeat.stop();
      process.exit(0);
    });
    await new Promise(() => {
    });
  } catch (error) {
    console.error(chalk7.red("\u2717 Failed to connect:"));
    console.error(chalk7.red(`   ${error instanceof Error ? error.message : error}`));
    process.exit(1);
  }
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

// src/cli.ts
var cli = new Command10();
cli.name("devpilot").description("DevPilot CLI - Manage your AI coding agent fleet").version(VERSION);
cli.addCommand(initCommand);
cli.addCommand(setupCommand);
cli.addCommand(serveCommand);
cli.addCommand(statusCommand);
cli.addCommand(configCommand);
cli.addCommand(bridgeCommand);
function runCli(args = process.argv) {
  cli.parse(args);
}
export {
  cli,
  runCli
};
//# sourceMappingURL=cli.mjs.map