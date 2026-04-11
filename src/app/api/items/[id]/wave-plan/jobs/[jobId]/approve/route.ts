import { NextRequest, NextResponse } from 'next/server';
import {
  db,
  horizonItems,
  wavePlans,
  activityEvents,
  eq,
} from '@/lib/db';
import { approvePlanJob, getPlanJob } from '@devpilot.sh/core/wave-planner';

interface RouteParams {
  params: Promise<{ id: string; jobId: string }>;
}

/**
 * POST /api/items/[id]/wave-plan/jobs/[jobId]/approve
 *
 * Explicitly approves a ready plan job. This is the first-class approval path
 * borrowed from ULTRAPLAN: rather than silently flipping the horizon item
 * into READY zone, we record the approval on the job row itself (so the
 * decision is auditable) and *then* promote the zone.
 *
 * The underlying draft wave plan is transitioned from `draft` -> `approved`
 * so the fleet dispatcher can pick it up.
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
    if (!job.resultWavePlanId) {
      return NextResponse.json(
        { error: 'Job has no result wave plan yet' },
        { status: 400 }
      );
    }

    // 1. Record the approval on the job row.
    const updatedJob = await approvePlanJob(jobId);

    // 2. Transition the draft wave plan to `approved`.
    await db
      .update(wavePlans)
      .set({ status: 'approved', updatedAt: new Date() })
      .where(eq(wavePlans.id, job.resultWavePlanId));

    // 3. Promote the horizon item to READY.
    const [updatedItem] = await db
      .update(horizonItems)
      .set({ zone: 'READY', updatedAt: new Date() })
      .where(eq(horizonItems.id, id))
      .returning();

    // 4. Log the approval.
    await db.insert(activityEvents).values({
      type: 'PLAN_APPROVED',
      message: `Wave plan approved for "${updatedItem?.title ?? id}" via job ${jobId}`,
      repo: updatedItem?.repo ?? '',
      ticketId: updatedItem?.linearTicketId ?? null,
      metadata: {
        wavePlanId: job.resultWavePlanId,
        jobId,
        modelTier: job.modelTier,
        escalated: job.escalated,
        parallelizationScore: job.bestParallelizationScore,
      },
    });

    return NextResponse.json({
      success: true,
      job: updatedJob,
      wavePlanId: job.resultWavePlanId,
      item: updatedItem,
    });
  } catch (error) {
    console.error('Failed to approve wave plan job:', error);
    return NextResponse.json(
      {
        error: 'Failed to approve wave plan job',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
