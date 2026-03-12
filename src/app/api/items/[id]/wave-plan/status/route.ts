import { NextRequest, NextResponse } from 'next/server';
import {
  db,
  horizonItems,
  wavePlans,
  waves,
  waveTasks,
  activityEvents,
  eq,
  desc,
  type WavePlanStatus,
} from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface StatusUpdateRequest {
  action: 'approve' | 'pause' | 'resume' | 'abort';
}

// PATCH /api/items/[id]/wave-plan/status - Update wave plan status
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body: StatusUpdateRequest = await request.json();
    const { action } = body;

    if (!action || !['approve', 'pause', 'resume', 'abort'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be one of: approve, pause, resume, abort' },
        { status: 400 }
      );
    }

    // Verify the horizon item exists
    const item = await db.query.horizonItems.findFirst({
      where: eq(horizonItems.id, id),
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // Fetch the most recent wave plan
    const wavePlan = await db.query.wavePlans.findFirst({
      where: eq(wavePlans.horizonItemId, id),
      orderBy: [desc(wavePlans.version)],
      with: {
        waves: {
          with: {
            tasks: true,
          },
        },
        metrics: true,
      },
    });

    if (!wavePlan) {
      return NextResponse.json(
        { error: 'No wave plan exists for this item' },
        { status: 404 }
      );
    }

    // Determine the new status based on action and current status
    const statusTransition = getStatusTransition(action, wavePlan.status);

    if (!statusTransition) {
      return NextResponse.json(
        {
          error: `Invalid status transition: cannot ${action} from ${wavePlan.status}`,
        },
        { status: 400 }
      );
    }

    const { newStatus, updateData } = statusTransition;

    // Update the wave plan status
    await db
      .update(wavePlans)
      .set({
        status: newStatus,
        updatedAt: new Date(),
        ...updateData,
      })
      .where(eq(wavePlans.id, wavePlan.id));

    // If approving, start the first wave
    if (action === 'approve' && newStatus === 'executing') {
      const firstWave = wavePlan.waves.find((w) => w.waveIndex === 0);
      if (firstWave) {
        await db
          .update(waves)
          .set({
            status: 'dispatching',
            startedAt: new Date(),
          })
          .where(eq(waves.id, firstWave.id));
      }
    }

    // If pausing or aborting, update running tasks
    if (action === 'pause' || action === 'abort') {
      const runningTaskIds = wavePlan.waves
        .flatMap((w) => w.tasks)
        .filter((t) => t.status === 'running' || t.status === 'dispatched')
        .map((t) => t.id);

      if (runningTaskIds.length > 0) {
        for (const taskId of runningTaskIds) {
          await db
            .update(waveTasks)
            .set({
              status: action === 'abort' ? 'skipped' : 'pending',
            })
            .where(eq(waveTasks.id, taskId));
        }
      }
    }

    // Create activity event
    const eventMessage = getActivityMessage(action, item.title, wavePlan);
    await db.insert(activityEvents).values({
      type: getEventType(action),
      message: eventMessage,
      repo: item.repo,
      ticketId: item.linearTicketId,
      metadata: {
        wavePlanId: wavePlan.id,
        previousStatus: wavePlan.status,
        newStatus,
        action,
      },
    });

    // Fetch updated wave plan
    const updatedWavePlan = await db.query.wavePlans.findFirst({
      where: eq(wavePlans.id, wavePlan.id),
      with: {
        waves: {
          with: {
            tasks: true,
          },
        },
        waveTasks: true,
        dependencyEdges: true,
        metrics: true,
      },
    });

    return NextResponse.json({
      success: true,
      action,
      previousStatus: wavePlan.status,
      newStatus,
      wavePlan: updatedWavePlan,
    });
  } catch (error) {
    console.error('Failed to update wave plan status:', error);
    return NextResponse.json(
      {
        error: 'Failed to update wave plan status',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * Determine valid status transitions based on action and current status
 */
function getStatusTransition(
  action: StatusUpdateRequest['action'],
  currentStatus: WavePlanStatus
): { newStatus: WavePlanStatus; updateData: Record<string, any> } | null {
  const now = new Date();

  switch (action) {
    case 'approve':
      if (currentStatus === 'draft') {
        return {
          newStatus: 'executing',
          updateData: { startedAt: now },
        };
      }
      return null;

    case 'pause':
      if (currentStatus === 'executing') {
        return {
          newStatus: 'paused',
          updateData: {},
        };
      }
      return null;

    case 'resume':
      if (currentStatus === 'paused') {
        return {
          newStatus: 'executing',
          updateData: {},
        };
      }
      return null;

    case 'abort':
      if (
        currentStatus === 'draft' ||
        currentStatus === 'executing' ||
        currentStatus === 'paused'
      ) {
        return {
          newStatus: 'failed',
          updateData: { completedAt: now },
        };
      }
      return null;

    default:
      return null;
  }
}

/**
 * Get activity event type based on action
 */
function getEventType(action: StatusUpdateRequest['action']): string {
  switch (action) {
    case 'approve':
      return 'PLAN_APPROVED';
    case 'abort':
      return 'WAVE_PLAN_FAILED';
    default:
      return 'RUNWAY_UPDATE';
  }
}

/**
 * Get activity message based on action
 */
function getActivityMessage(
  action: StatusUpdateRequest['action'],
  itemTitle: string,
  wavePlan: any
): string {
  switch (action) {
    case 'approve':
      return `Wave plan approved for "${itemTitle}" - starting execution of ${wavePlan.totalWaves} waves`;
    case 'pause':
      return `Wave plan paused for "${itemTitle}"`;
    case 'resume':
      return `Wave plan resumed for "${itemTitle}"`;
    case 'abort':
      return `Wave plan aborted for "${itemTitle}"`;
    default:
      return `Wave plan status updated for "${itemTitle}"`;
  }
}
