import { NextRequest, NextResponse } from 'next/server';
import { db, horizonItems, plans, wavePlans, activityEvents, eq } from '@/lib/db';
import { generateWavePlan, buildSpecContentForItem } from '@devpilot.sh/core/wave-planner';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/items/[id]/wave-plan/generate - Generate a wave plan for a horizon item
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Fetch the horizon item with its plan — and the plan's workstreams and
    // their tasks. The spec builder below renders an "Implementation Plan"
    // section from them; `plan: true` loads the plan row alone, so that section
    // was empty for every item and the planner was handed the acceptance
    // criteria with none of the decomposition that already existed. The
    // conductor route had the same query and the same hole.
    const item = await db.query.horizonItems.findFirst({
      where: eq(horizonItems.id, id),
      with: { plan: { with: { workstreams: { with: { tasks: true } } } } },
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    if (!item.plan) {
      return NextResponse.json(
        { error: 'No plan exists for this item. Please generate a plan first.' },
        { status: 400 }
      );
    }

    // Get API key from environment
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Anthropic API key not configured' },
        { status: 500 }
      );
    }

    // Get working directory from environment or use default
    const workingDir = process.env.WORKING_DIR || process.cwd();

    // Build specification content from the item and plan. The shared builder,
    // not a local copy: this route kept its own after the function was ported
    // into core, and a copy is how one planner entry point ends up seeing the
    // ticket description while another still plans from the title.
    const specContent = buildSpecContentForItem({
      title: item.title,
      description: item.description,
      plan: item.plan as Parameters<typeof buildSpecContentForItem>[0]['plan'],
    });

    // Generate wave plan using the wave planner system
    const result = await generateWavePlan(
      id,
      item.plan.id,
      specContent,
      item.title,
      item.repo,
      workingDir,
      apiKey
    );

    if (!result.success) {
      return NextResponse.json(
        {
          error: 'Wave plan generation failed',
          message: result.message,
          wavePlan: result.wavePlan,
          metrics: result.metrics,
        },
        { status: 500 }
      );
    }

    // Create activity event
    await db.insert(activityEvents).values({
      type: 'WAVE_PLAN_CREATED',
      message: `Wave plan generated for "${item.title}" (${result.wavePlan.statistics.totalTasks} tasks, ${result.waveAssignment.totalWaves} waves)`,
      repo: item.repo,
      ticketId: item.linearTicketId,
      metadata: {
        wavePlanId: result.wavePlanId,
        totalWaves: result.waveAssignment.totalWaves,
        totalTasks: result.wavePlan.statistics.totalTasks,
        maxParallelism: result.waveAssignment.maxParallelism,
        parallelizationScore: result.score.parallelizationScore,
        criticalPathLength: result.criticalPath.length,
      },
    });

    return NextResponse.json(
      {
        success: true,
        wavePlanId: result.wavePlanId,
        wavePlan: result.wavePlan,
        criticalPath: result.criticalPath,
        waveAssignment: result.waveAssignment,
        score: result.score,
        metrics: result.metrics,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to generate wave plan:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate wave plan',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
