import { FastifyInstance } from 'fastify';
import {
  horizonItems,
  plans,
  workstreams,
  tasks,
  touchedFiles,
  inFlightFiles,
  activityEvents,
} from '@devpilot.sh/core/db';
import { generatePlanForItem, projectWavePlanToPlan } from '@devpilot.sh/core/wave-planner';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../index';

export async function registerItemRoutes(app: FastifyInstance) {
  const db = getDb();

  // GET /api/items - List all horizon items
  app.get('/api/items', async (request, reply) => {
    const { zone, repo } = request.query as { zone?: string; repo?: string };

    const conditions = [];
    if (zone) conditions.push(eq(horizonItems.zone, zone as 'READY' | 'REFINING' | 'SHAPING' | 'DIRECTIONAL'));
    if (repo) conditions.push(eq(horizonItems.repo, repo));

    const items = await db.query.horizonItems.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      with: {
        plan: {
          with: {
            workstreams: {
              with: { tasks: true },
            },
            sequentialTasks: true,
            filesTouched: true,
          },
        },
        conflictingFiles: true,
      },
      orderBy: [desc(horizonItems.priority), desc(horizonItems.createdAt)],
    });

    return items;
  });

  // POST /api/items - Create a new horizon item
  app.post('/api/items', async (request, reply) => {
    const { title, zone = 'DIRECTIONAL', repo, complexity, priority = 0, linearTicketId } = request.body as {
      title: string;
      zone?: string;
      repo: string;
      complexity?: string;
      priority?: number;
      linearTicketId?: string;
    };

    if (!title || !repo) {
      reply.status(400).send({ error: 'Title and repo are required' });
      return;
    }

    const [item] = await db.insert(horizonItems).values({
      title,
      zone: zone as 'READY' | 'REFINING' | 'SHAPING' | 'DIRECTIONAL',
      repo,
      complexity: complexity as 'S' | 'M' | 'L' | 'XL' | undefined,
      priority,
      linearTicketId,
    }).returning();

    const itemWithRelations = await db.query.horizonItems.findFirst({
      where: eq(horizonItems.id, item.id),
      with: {
        plan: true,
        conflictingFiles: true,
      },
    });

    await db.insert(activityEvents).values({
      type: 'ITEM_CREATED',
      message: `New item "${title}" added to ${zone}`,
      repo,
      ticketId: linearTicketId,
    });

    reply.status(201).send(itemWithRelations);
  });

  // GET /api/items/:id - Get a single item
  app.get('/api/items/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const item = await db.query.horizonItems.findFirst({
      where: eq(horizonItems.id, id),
      with: {
        plan: {
          with: {
            workstreams: {
              with: { tasks: true },
            },
            sequentialTasks: true,
            filesTouched: true,
          },
        },
        conflictingFiles: true,
      },
    });

    if (!item) {
      reply.status(404).send({ error: 'Item not found' });
      return;
    }

    return item;
  });

  // PATCH /api/items/:id - Update an item
  app.patch('/api/items/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { title, zone, repo, complexity, priority, linearTicketId } = request.body as {
      title?: string;
      zone?: string;
      repo?: string;
      complexity?: string;
      priority?: number;
      linearTicketId?: string;
    };

    const existingItem = await db.query.horizonItems.findFirst({
      where: eq(horizonItems.id, id),
    });

    if (!existingItem) {
      reply.status(404).send({ error: 'Item not found' });
      return;
    }

    const updateData: Partial<typeof horizonItems.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (title !== undefined) updateData.title = title;
    if (zone !== undefined) updateData.zone = zone as 'READY' | 'REFINING' | 'SHAPING' | 'DIRECTIONAL';
    if (repo !== undefined) updateData.repo = repo;
    if (complexity !== undefined) updateData.complexity = complexity as 'S' | 'M' | 'L' | 'XL';
    if (priority !== undefined) updateData.priority = priority;
    if (linearTicketId !== undefined) updateData.linearTicketId = linearTicketId;

    await db.update(horizonItems).set(updateData).where(eq(horizonItems.id, id));

    const item = await db.query.horizonItems.findFirst({
      where: eq(horizonItems.id, id),
      with: {
        plan: {
          with: {
            workstreams: {
              with: { tasks: true },
            },
            sequentialTasks: true,
            filesTouched: true,
          },
        },
        conflictingFiles: true,
      },
    });

    if (zone && zone !== existingItem.zone && item) {
      await db.insert(activityEvents).values({
        type: 'RUNWAY_UPDATE',
        message: `"${item.title}" moved from ${existingItem.zone} to ${zone}`,
        repo: item.repo,
        ticketId: item.linearTicketId,
      });
    }

    return item;
  });

  // DELETE /api/items/:id - Delete an item
  app.delete('/api/items/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existingItem = await db.query.horizonItems.findFirst({
      where: eq(horizonItems.id, id),
    });

    if (!existingItem) {
      reply.status(404).send({ error: 'Item not found' });
      return;
    }

    await db.delete(horizonItems).where(eq(horizonItems.id, id));
    return { success: true };
  });

  // POST /api/items/:id/plan/generate - Generate a plan
  app.post('/api/items/:id/plan/generate', async (request, reply) => {
    const { id } = request.params as { id: string };

    const item = await db.query.horizonItems.findFirst({
      where: eq(horizonItems.id, id),
      with: { plan: true },
    });

    if (!item) {
      reply.status(404).send({ error: 'Item not found' });
      return;
    }

    // A missing API key is a configuration error surfaced honestly, not mocked.
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      reply.status(503).send({
        error: 'PLAN_AI_UNAVAILABLE',
        detail: 'ANTHROPIC_API_KEY is not configured',
      });
      return;
    }

    // In-flight file paths drive conflict warnings during projection.
    const allInFlightFiles = await db.query.inFlightFiles.findMany();
    const inFlightPaths = allInFlightFiles.map((f: { path: string }) => f.path);

    // Replace any existing plan (manual cascade — sqlite FKs aren't enforced).
    const priorVersion = item.plan?.version ?? 0;
    if (item.plan) {
      await db.delete(tasks).where(eq(tasks.planId, item.plan.id));
      const existingWorkstreams = await db.query.workstreams.findMany({
        where: eq(workstreams.planId, item.plan.id),
      });
      for (const ws of existingWorkstreams) {
        await db.delete(tasks).where(eq(tasks.workstreamId, ws.id));
      }
      await db.delete(workstreams).where(eq(workstreams.planId, item.plan.id));
      await db.delete(touchedFiles).where(eq(touchedFiles.planId, item.plan.id));
      await db.delete(plans).where(eq(plans.id, item.plan.id));
    }

    // Generate (real AI, with the generator's flat-plan fallback) then project.
    const workingDir = process.env.WORKING_DIR || process.cwd();
    const { generation, planId } = await generatePlanForItem({
      horizonItemId: id,
      title: item.title,
      repo: item.repo,
      workingDir,
      apiKey,
    });

    await projectWavePlanToPlan({ planId, generation, inFlightPaths });

    if (priorVersion > 0) {
      await db.update(plans)
        .set({ version: priorVersion + 1 })
        .where(eq(plans.id, planId));
    }

    // Update item zone if in SHAPING
    if (item.zone === 'SHAPING') {
      await db.update(horizonItems)
        .set({ zone: 'REFINING', updatedAt: new Date() })
        .where(eq(horizonItems.id, id));
    }

    const completePlan = await db.query.plans.findFirst({
      where: eq(plans.id, planId),
      with: {
        workstreams: {
          with: { tasks: true },
        },
        sequentialTasks: true,
        filesTouched: true,
      },
    });

    await db.insert(activityEvents).values({
      type: 'PLAN_GENERATED',
      message: `Plan generated for "${item.title}" ($${(completePlan?.estimatedCostUsd ?? 0).toFixed(2)})`,
      repo: item.repo,
      ticketId: item.linearTicketId,
      metadata: { planId },
    });

    reply.status(201).send(completePlan);
  });

  // GET /api/items/:id/plan - Get the plan for an item
  app.get('/api/items/:id/plan', async (request, reply) => {
    const { id } = request.params as { id: string };

    const item = await db.query.horizonItems.findFirst({
      where: eq(horizonItems.id, id),
      with: {
        plan: {
          with: {
            workstreams: {
              with: { tasks: true },
            },
            sequentialTasks: true,
            filesTouched: true,
            previousPlan: true,
          },
        },
      },
    });

    if (!item) {
      reply.status(404).send({ error: 'Item not found' });
      return;
    }

    if (!item.plan) {
      reply.status(404).send({ error: 'No plan exists for this item' });
      return;
    }

    return item.plan;
  });

  // POST /api/items/:id/plan/replan - Replan with constraints
  app.post('/api/items/:id/plan/replan', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { constraint } = request.body as { constraint?: string };

    const item = await db.query.horizonItems.findFirst({
      where: eq(horizonItems.id, id),
      with: {
        plan: {
          with: {
            workstreams: {
              with: { tasks: true },
            },
            sequentialTasks: true,
            filesTouched: true,
          },
        },
      },
    });

    if (!item) {
      reply.status(404).send({ error: 'Item not found' });
      return;
    }

    if (!item.plan) {
      reply.status(400).send({ error: 'No existing plan to replan' });
      return;
    }

    // For now, just increment version and return existing plan
    // In production, this would use AI to generate new plan with constraints
    const [newPlan] = await db.insert(plans).values({
      horizonItemId: id,
      version: item.plan.version + 1,
      estimatedCostUsd: item.plan.estimatedCostUsd * 0.9,
      baselineCostUsd: item.plan.baselineCostUsd,
      acceptanceCriteria: item.plan.acceptanceCriteria as string[],
      confidenceSignals: item.plan.confidenceSignals as object,
      fleetContextSnapshot: item.plan.fleetContextSnapshot as object,
      memorySessionsUsed: item.plan.memorySessionsUsed as { date: string; ticketId: string; summary: string; constraintApplied: string; }[],
      previousPlanId: item.plan.id,
    }).returning();

    // Copy workstreams and tasks
    for (const ws of item.plan.workstreams) {
      const [workstream] = await db.insert(workstreams).values({
        planId: newPlan.id,
        label: ws.label,
        repo: ws.repo,
        workerCount: ws.workerCount,
        orderIndex: ws.orderIndex,
      }).returning();

      for (const task of ws.tasks) {
        await db.insert(tasks).values({
          workstreamId: workstream.id,
          label: task.label,
          model: task.model,
          complexity: task.complexity,
          estimatedCostUsd: task.estimatedCostUsd,
          filePaths: task.filePaths as string[],
          conflictWarning: task.conflictWarning,
          dependsOn: task.dependsOn as string[],
          orderIndex: task.orderIndex,
        });
      }
    }

    // Copy touched files
    for (const f of item.plan.filesTouched) {
      await db.insert(touchedFiles).values({
        planId: newPlan.id,
        path: f.path,
        status: f.status,
        inFlightVia: f.inFlightVia,
      });
    }

    const completePlan = await db.query.plans.findFirst({
      where: eq(plans.id, newPlan.id),
      with: {
        workstreams: {
          with: { tasks: true },
        },
        sequentialTasks: true,
        filesTouched: true,
        previousPlan: true,
      },
    });

    await db.insert(activityEvents).values({
      type: 'PLAN_GENERATED',
      message: `Plan replanned for "${item.title}" with constraint: "${constraint || 'manual'}"`,
      repo: item.repo,
      ticketId: item.linearTicketId,
      metadata: { planId: newPlan.id, version: newPlan.version },
    });

    return completePlan;
  });

  // PATCH /api/items/:id/plan/tasks/:taskId - Update a task
  app.patch('/api/items/:id/plan/tasks/:taskId', async (request, reply) => {
    const { id, taskId } = request.params as { id: string; taskId: string };
    const { model, complexity, modelOverride } = request.body as {
      model?: string;
      complexity?: string;
      modelOverride?: string;
    };

    const updateData: Partial<typeof tasks.$inferInsert> = {};
    if (model !== undefined) updateData.model = model as 'HAIKU' | 'SONNET' | 'OPUS';
    if (modelOverride !== undefined) updateData.modelOverride = modelOverride as 'HAIKU' | 'SONNET' | 'OPUS' | null;
    if (complexity !== undefined) updateData.complexity = complexity as 'S' | 'M' | 'L' | 'XL';

    const [updatedTask] = await db.update(tasks)
      .set(updateData)
      .where(eq(tasks.id, taskId))
      .returning();

    if (!updatedTask) {
      reply.status(404).send({ error: 'Task not found' });
      return;
    }

    return { task: updatedTask };
  });
}
