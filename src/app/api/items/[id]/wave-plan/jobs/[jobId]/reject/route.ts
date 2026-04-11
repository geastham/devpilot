import { NextRequest, NextResponse } from 'next/server';
import {
  db,
  horizonItems,
  activityEvents,
  eq,
} from '@/lib/db';
import {
  getPlanJob,
  rejectPlanJob,
  startPlanJob,
} from '@devpilot.sh/core/wave-planner';

interface RouteParams {
  params: Promise<{ id: string; jobId: string }>;
}

interface RejectRequestBody {
  reason: string;
  /** If true, immediately start a replan job with the rejection reason as a constraint. */
  replan?: boolean;
  /** If true, force ultra tier on the replan attempt. */
  forceUltra?: boolean;
}

/**
 * POST /api/items/[id]/wave-plan/jobs/[jobId]/reject
 *
 * Rejects a ready plan job, capturing a reason. The draft wave plan is
 * retained (not deleted) so the user can still inspect what was proposed.
 *
 * If the caller sets `replan: true`, we immediately kick off a new plan
 * generation job with the rejection reason threaded through as a custom
 * constraint. This replaces the old "just call requestReplan after approve"
 * flow with a single round-trip.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id, jobId } = await params;
    const body: RejectRequestBody = await request.json().catch(() => ({ reason: '' }));

    if (!body.reason || body.reason.trim().length === 0) {
      return NextResponse.json(
        { error: 'Rejection reason is required' },
        { status: 400 }
      );
    }

    const job = await getPlanJob(jobId);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    if (job.horizonItemId !== id) {
      return NextResponse.json(
        { error: 'Job does not belong to this item' },
        { status: 403 }
      );
    }

    // Record the rejection. The draft wave plan row is left intact.
    const updatedJob = await rejectPlanJob(jobId, body.reason);

    const item = await db.query.horizonItems.findFirst({
      where: eq(horizonItems.id, id),
      with: { plan: true },
    });

    await db.insert(activityEvents).values({
      type: 'RUNWAY_UPDATE',
      message: `Wave plan rejected for "${item?.title ?? id}": ${body.reason}`,
      repo: item?.repo ?? '',
      ticketId: item?.linearTicketId ?? null,
      metadata: {
        jobId,
        rejectedWavePlanId: job.resultWavePlanId,
        reason: body.reason,
      },
    });

    // Optionally kick off a replan in a single round-trip.
    let replanJobId: string | undefined;
    if (body.replan && item?.plan) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: 'Anthropic API key not configured for replan' },
          { status: 500 }
        );
      }
      const workingDir = process.env.WORKING_DIR || process.cwd();
      const specContent = buildSpecContentWithRejection(item, body.reason);
      const replan = await startPlanJob({
        horizonItemId: id,
        planId: item.plan.id,
        specContent,
        itemTitle: item.title,
        repo: item.repo,
        workingDir,
        apiKey,
        forceUltra: Boolean(body.forceUltra),
      });
      replanJobId = replan.jobId;
    }

    return NextResponse.json({
      success: true,
      job: updatedJob,
      replanJobId,
    });
  } catch (error) {
    console.error('Failed to reject wave plan job:', error);
    return NextResponse.json(
      {
        error: 'Failed to reject wave plan job',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

function buildSpecContentWithRejection(item: any, reason: string): string {
  const lines: string[] = [];
  lines.push(`# ${item.title}`);
  lines.push('');
  lines.push('## Previous Attempt Rejected');
  lines.push(`The previous plan was rejected with the following reason:`);
  lines.push('');
  lines.push(`> ${reason}`);
  lines.push('');
  lines.push('Generate a new plan that addresses this feedback.');
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
      if (workstream.tasks) {
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
