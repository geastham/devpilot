import { NextRequest, NextResponse } from 'next/server';
import {
  db,
  horizonItems,
  plans,
  tasks,
  workstreams,
  eq,
  or,
} from '@/lib/db';
import type { Model, Complexity } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string; taskId: string }>;
}

// PATCH /api/items/[id]/plan/tasks/[taskId] - Update a task's model or complexity
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id, taskId } = await params;
    const body = await request.json();
    const { model, complexity, modelOverride } = body;

    // Verify the item and task exist
    const item = await db.query.horizonItems.findFirst({
      where: eq(horizonItems.id, id),
      with: {
        plan: {
          with: {
            workstreams: {
              with: { tasks: true },
            },
            sequentialTasks: true,
          },
        },
      },
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    if (!item.plan) {
      return NextResponse.json({ error: 'Item has no plan' }, { status: 404 });
    }

    // Find the task in workstreams or sequential tasks
    const allTasks = [
      ...item.plan.workstreams.flatMap((ws) => ws.tasks),
      ...item.plan.sequentialTasks,
    ];

    const task = allTasks.find((t) => t.id === taskId);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Calculate new cost based on model change
    const modelCostMultiplier: Record<string, number> = {
      HAIKU: 0.3,
      SONNET: 1.0,
      OPUS: 3.0,
    };

    let newEstimatedCost = task.estimatedCostUsd;
    const targetModel = modelOverride || model;
    if (targetModel && targetModel !== task.model) {
      newEstimatedCost =
        task.estimatedCostUsd *
        (modelCostMultiplier[targetModel] / modelCostMultiplier[task.model]);
    }

    // Adjust cost for complexity change
    const complexityCostMultiplier: Record<string, number> = {
      S: 0.5,
      M: 1.0,
      L: 2.0,
      XL: 4.0,
    };

    if (complexity && complexity !== task.complexity) {
      newEstimatedCost *=
        complexityCostMultiplier[complexity] / complexityCostMultiplier[task.complexity];
    }

    // Build update data
    const updateData: Partial<typeof tasks.$inferInsert> = {
      estimatedCostUsd: newEstimatedCost,
    };
    if (model !== undefined) updateData.model = model as Model;
    if (modelOverride !== undefined) updateData.modelOverride = modelOverride as Model | null;
    if (complexity !== undefined) updateData.complexity = complexity as Complexity;

    // Update the task
    const [updatedTask] = await db.update(tasks)
      .set(updateData)
      .where(eq(tasks.id, taskId))
      .returning();

    // Recalculate plan total cost - get all tasks in workstreams for this plan
    const planWorkstreams = await db.query.workstreams.findMany({
      where: eq(workstreams.planId, item.plan.id),
    });

    const workstreamIds = planWorkstreams.map((ws) => ws.id);

    // Get tasks from workstreams
    let allPlanTasks: { estimatedCostUsd: number }[] = [];
    for (const wsId of workstreamIds) {
      const wsTasks = await db.query.tasks.findMany({
        where: eq(tasks.workstreamId, wsId),
      });
      allPlanTasks = [...allPlanTasks, ...wsTasks];
    }

    // Get sequential tasks (tasks directly on plan)
    const sequentialTasks = await db.query.tasks.findMany({
      where: eq(tasks.planId, item.plan.id),
    });
    allPlanTasks = [...allPlanTasks, ...sequentialTasks];

    const newTotalCost = allPlanTasks.reduce((sum, t) => sum + t.estimatedCostUsd, 0);

    await db.update(plans)
      .set({ estimatedCostUsd: newTotalCost })
      .where(eq(plans.id, item.plan.id));

    return NextResponse.json({
      task: updatedTask,
      planTotalCost: newTotalCost,
    });
  } catch (error) {
    console.error('Failed to update task:', error);
    return NextResponse.json(
      { error: 'Failed to update task' },
      { status: 500 }
    );
  }
}
