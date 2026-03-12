import { NextRequest, NextResponse } from 'next/server';
import { db, horizonItems, plans, wavePlans, activityEvents, eq } from '@/lib/db';
import { generateWavePlan } from '@devpilot.sh/core/wave-planner';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/items/[id]/wave-plan/generate - Generate a wave plan for a horizon item
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Fetch the horizon item with its plan
    const item = await db.query.horizonItems.findFirst({
      where: eq(horizonItems.id, id),
      with: {
        plan: true,
      },
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

    // Build specification content from the item and plan
    const specContent = buildSpecContent(item);

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

/**
 * Build specification content from horizon item and plan.
 * This converts the plan into a format suitable for wave plan generation.
 */
function buildSpecContent(item: any): string {
  const lines: string[] = [];

  lines.push(`# ${item.title}`);
  lines.push('');

  if (item.plan?.acceptanceCriteria && item.plan.acceptanceCriteria.length > 0) {
    lines.push('## Acceptance Criteria');
    for (const criterion of item.plan.acceptanceCriteria) {
      lines.push(`- ${criterion}`);
    }
    lines.push('');
  }

  if (item.plan?.workstreams && item.plan.workstreams.length > 0) {
    lines.push('## Implementation Plan');
    for (const workstream of item.plan.workstreams) {
      lines.push(`### ${workstream.label}`);
      if (workstream.tasks && workstream.tasks.length > 0) {
        for (const task of workstream.tasks) {
          lines.push(`- ${task.label}`);
          if (task.filePaths && task.filePaths.length > 0) {
            lines.push(`  Files: ${task.filePaths.join(', ')}`);
          }
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
