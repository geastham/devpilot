import { NextRequest, NextResponse } from 'next/server';
import {
  db,
  horizonItems,
  plans,
  workstreams,
  tasks,
  touchedFiles,
  inFlightFiles,
  activityEvents,
  eq,
} from '@/lib/db';
import {
  generatePlanForItem,
  projectWavePlanToPlan,
} from '@devpilot.sh/core/wave-planner';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/items/[id]/plan/generate - Generate a plan for a horizon item.
// Uses the real wave planner (AI, with the generator's own flat-plan fallback)
// and projects the result into plans/workstreams/tasks/touchedFiles. No mocks.
export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const item = await db.query.horizonItems.findFirst({
      where: eq(horizonItems.id, id),
      with: { plan: true },
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // A missing API key is a configuration error surfaced honestly, not mocked.
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error: 'PLAN_AI_UNAVAILABLE',
          detail: 'ANTHROPIC_API_KEY is not configured',
        },
        { status: 503 }
      );
    }

    // In-flight file paths drive conflict warnings during projection.
    const allInFlightFiles = await db.query.inFlightFiles.findMany();
    const inFlightPaths = allInFlightFiles.map((f) => f.path);

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

    // Generate (creates the plans row + persists the wave plan) then project.
    const workingDir = process.env.WORKING_DIR || process.cwd();
    const { generation, planId } = await generatePlanForItem({
      horizonItemId: id,
      title: item.title,
      repo: item.repo,
      workingDir,
      apiKey,
    });

    await projectWavePlanToPlan({ planId, generation, inFlightPaths });

    // Preserve the version-increment behaviour when replacing a plan.
    if (priorVersion > 0) {
      await db.update(plans)
        .set({ version: priorVersion + 1 })
        .where(eq(plans.id, planId));
    }

    // Update item zone to REFINING if it was in SHAPING
    if (item.zone === 'SHAPING') {
      await db.update(horizonItems)
        .set({ zone: 'REFINING', updatedAt: new Date() })
        .where(eq(horizonItems.id, id));
    }

    // Fetch the complete plan with relations (unchanged 201 response shape).
    const completePlan = await db.query.plans.findFirst({
      where: eq(plans.id, planId),
      with: {
        workstreams: { with: { tasks: true } },
        sequentialTasks: true,
        filesTouched: true,
      },
    });

    const estimatedCostUsd = completePlan?.estimatedCostUsd ?? 0;
    const taskCount =
      completePlan?.workstreams.reduce(
        (sum: number, ws: { tasks: unknown[] }) => sum + ws.tasks.length,
        0
      ) || 0;

    await db.insert(activityEvents).values({
      type: 'PLAN_GENERATED',
      message: `Plan generated for "${item.title}" ($${estimatedCostUsd.toFixed(2)})`,
      repo: item.repo,
      ticketId: item.linearTicketId,
      metadata: {
        planId,
        workstreams: completePlan?.workstreams.length || 0,
        tasks: taskCount,
      },
    });

    return NextResponse.json(completePlan, { status: 201 });
  } catch (error) {
    console.error('Failed to generate plan:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate plan',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
