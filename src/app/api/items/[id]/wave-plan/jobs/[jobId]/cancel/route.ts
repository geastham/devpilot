import { NextRequest, NextResponse } from 'next/server';
import { cancelPlanJob, getPlanJob } from '@devpilot.sh/core/wave-planner';

interface RouteParams {
  params: Promise<{ id: string; jobId: string }>;
}

/**
 * POST /api/items/[id]/wave-plan/jobs/[jobId]/cancel
 *
 * Cancels an in-flight plan generation job. If the job is already in a
 * terminal state, this is a no-op and returns `cancelled: false`.
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id, jobId } = await params;

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

    const cancelled = await cancelPlanJob(jobId);
    const updated = await getPlanJob(jobId);

    return NextResponse.json({
      success: true,
      cancelled,
      job: updated,
    });
  } catch (error) {
    console.error('Failed to cancel wave plan job:', error);
    return NextResponse.json(
      {
        error: 'Failed to cancel wave plan job',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
