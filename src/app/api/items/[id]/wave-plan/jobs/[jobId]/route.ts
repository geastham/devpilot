import { NextRequest, NextResponse } from 'next/server';
import { getPlanJob } from '@devpilot.sh/core/wave-planner';

interface RouteParams {
  params: Promise<{ id: string; jobId: string }>;
}

/**
 * GET /api/items/[id]/wave-plan/jobs/[jobId]
 *
 * Poll endpoint for async wave plan generation. The `PlanProgressCard` UI
 * hits this on a ~1s interval and renders:
 *
 *   - `status`      -> the current phase label (thinking / drafting / etc.)
 *   - `currentStep` -> human-readable sub-step
 *   - `progressPercent`, `iterations`, token counters -> progress bar + stats
 *   - `modelTier`, `escalated`, `escalationReason` -> which tier is running
 *   - `resultWavePlanId` -> present once `status === 'ready'`
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
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

    return NextResponse.json({ job });
  } catch (error) {
    console.error('Failed to fetch wave plan job:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch wave plan job',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
