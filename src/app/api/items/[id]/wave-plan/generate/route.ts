import { NextRequest, NextResponse } from 'next/server';
import { db, horizonItems, eq } from '@/lib/db';
import { startPlanJob } from '@devpilot.sh/core/wave-planner';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface GenerateRequestBody {
  /** Force the ultra (Opus + extended thinking) tier from the start. */
  forceUltra?: boolean;
}

/**
 * POST /api/items/[id]/wave-plan/generate
 *
 * Enqueues an async wave plan generation job and returns the job id
 * immediately. The client then polls `GET .../wave-plan/jobs/[jobId]` until
 * the job reaches `ready`.
 *
 * This replaces the previous synchronous behavior where the HTTP request
 * blocked on the full planner run (which can take 10+ seconds on Opus with
 * extended thinking).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body: GenerateRequestBody = await request.json().catch(() => ({}));

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

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Anthropic API key not configured' },
        { status: 500 }
      );
    }

    const workingDir = process.env.WORKING_DIR || process.cwd();
    const specContent = buildSpecContent(item);

    const { jobId, status } = await startPlanJob({
      horizonItemId: id,
      planId: item.plan.id,
      specContent,
      itemTitle: item.title,
      repo: item.repo,
      workingDir,
      apiKey,
      forceUltra: Boolean(body.forceUltra),
    });

    return NextResponse.json(
      {
        success: true,
        jobId,
        status,
        pollUrl: `/api/items/${id}/wave-plan/jobs/${jobId}`,
      },
      { status: 202 }
    );
  } catch (error) {
    console.error('Failed to start wave plan job:', error);
    return NextResponse.json(
      {
        error: 'Failed to start wave plan job',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

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
