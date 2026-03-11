import { NextRequest, NextResponse } from 'next/server';
import {
  db,
  horizonItems,
  plans,
  workstreams,
  tasks,
  touchedFiles,
  activityEvents,
  eq,
} from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/items/[id]/plan/replan - Replan with constraints
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { constraint, avoidFiles, preferModel, maxCost } = body;

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
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    if (!item.plan) {
      return NextResponse.json(
        { error: 'No existing plan to replan. Generate a plan first.' },
        { status: 400 }
      );
    }

    const currentPlan = item.plan;
    const previousPlanId = currentPlan.id;

    // Apply constraints to generate new plan
    const modifiedWorkstreams = currentPlan.workstreams.map((ws) => ({
      ...ws,
      tasks: ws.tasks.map((task) => {
        let modified = { ...task };

        // Avoid certain files
        if (avoidFiles && avoidFiles.length > 0) {
          modified.filePaths = (task.filePaths as string[]).filter(
            (fp) => !avoidFiles.some((af: string) => fp.includes(af))
          );
        }

        // Prefer certain model
        if (preferModel) {
          modified.model = preferModel;
          const modelCostMultiplier: Record<string, number> = {
            HAIKU: 0.3,
            SONNET: 1.0,
            OPUS: 3.0,
          };
          modified.estimatedCostUsd =
            task.estimatedCostUsd *
            (modelCostMultiplier[preferModel] / modelCostMultiplier[task.model]);
        }

        return modified;
      }),
    }));

    // Calculate new cost
    let newEstimatedCost = modifiedWorkstreams.reduce(
      (sum, ws) => sum + ws.tasks.reduce((t, task) => t + task.estimatedCostUsd, 0),
      0
    );

    // Apply max cost constraint if specified
    if (maxCost && newEstimatedCost > maxCost) {
      const ratio = maxCost / newEstimatedCost;
      modifiedWorkstreams.forEach((ws) => {
        ws.tasks.forEach((task) => {
          task.estimatedCostUsd *= ratio;
        });
      });
      newEstimatedCost = maxCost;
    }

    // Create new plan
    const [newPlan] = await db.insert(plans).values({
      horizonItemId: id,
      version: currentPlan.version + 1,
      estimatedCostUsd: newEstimatedCost,
      baselineCostUsd: currentPlan.baselineCostUsd,
      acceptanceCriteria: currentPlan.acceptanceCriteria as string[],
      confidenceSignals: currentPlan.confidenceSignals as object,
      fleetContextSnapshot: currentPlan.fleetContextSnapshot as object,
      memorySessionsUsed: currentPlan.memorySessionsUsed as object[],
      previousPlanId,
    }).returning();

    // Create workstreams and tasks
    for (let wsIdx = 0; wsIdx < modifiedWorkstreams.length; wsIdx++) {
      const ws = modifiedWorkstreams[wsIdx];
      const [workstream] = await db.insert(workstreams).values({
        planId: newPlan.id,
        label: ws.label,
        repo: ws.repo,
        workerCount: ws.workerCount,
        orderIndex: wsIdx,
      }).returning();

      for (let taskIdx = 0; taskIdx < ws.tasks.length; taskIdx++) {
        const task = ws.tasks[taskIdx];
        await db.insert(tasks).values({
          workstreamId: workstream.id,
          label: task.label,
          model: task.model,
          complexity: task.complexity,
          estimatedCostUsd: task.estimatedCostUsd,
          filePaths: task.filePaths as string[],
          conflictWarning: task.conflictWarning,
          dependsOn: task.dependsOn as string[],
          orderIndex: taskIdx,
        });
      }
    }

    // Create touched files
    const filteredFiles = currentPlan.filesTouched.filter(
      (f) => !avoidFiles?.some((af: string) => f.path.includes(af))
    );
    for (const f of filteredFiles) {
      await db.insert(touchedFiles).values({
        planId: newPlan.id,
        path: f.path,
        status: f.status,
        inFlightVia: f.inFlightVia,
      });
    }

    // Delete old plan and its related records
    const oldWorkstreams = await db.query.workstreams.findMany({
      where: eq(workstreams.planId, previousPlanId),
    });
    for (const ws of oldWorkstreams) {
      await db.delete(tasks).where(eq(tasks.workstreamId, ws.id));
    }
    await db.delete(tasks).where(eq(tasks.planId, previousPlanId));
    await db.delete(workstreams).where(eq(workstreams.planId, previousPlanId));
    await db.delete(touchedFiles).where(eq(touchedFiles.planId, previousPlanId));
    await db.delete(plans).where(eq(plans.id, previousPlanId));

    // Fetch complete plan with relations
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

    // Create activity event
    await db.insert(activityEvents).values({
      type: 'PLAN_GENERATED',
      message: `Plan replanned for "${item.title}" with constraint: "${constraint || 'manual adjustments'}"`,
      repo: item.repo,
      ticketId: item.linearTicketId,
      metadata: {
        planId: newPlan.id,
        version: newPlan.version,
        previousVersion: currentPlan.version,
        costDelta: newEstimatedCost - currentPlan.estimatedCostUsd,
      },
    });

    return NextResponse.json(completePlan);
  } catch (error) {
    console.error('Failed to replan:', error);
    return NextResponse.json(
      { error: 'Failed to replan' },
      { status: 500 }
    );
  }
}
