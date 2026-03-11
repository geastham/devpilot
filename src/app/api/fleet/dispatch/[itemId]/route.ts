import { NextRequest, NextResponse } from 'next/server';
import {
  db,
  horizonItems,
  rufloSessions,
  inFlightFiles,
  touchedFiles,
  activityEvents,
  conductorScores,
  eq,
  asc,
} from '@/lib/db';
import { linear, orchestrator } from '@devpilot.sh/core';

interface RouteParams {
  params: Promise<{ itemId: string }>;
}

// POST /api/fleet/dispatch/[itemId] - Dispatch a horizon item to the fleet
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { itemId } = await params;

    // Get the item with its plan
    const item = await db.query.horizonItems.findFirst({
      where: eq(horizonItems.id, itemId),
      with: {
        plan: {
          with: {
            workstreams: {
              with: { tasks: true },
            },
            filesTouched: true,
          },
        },
      },
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    if (item.zone !== 'READY') {
      return NextResponse.json(
        { error: 'Item must be in READY zone to dispatch' },
        { status: 400 }
      );
    }

    if (!item.plan) {
      return NextResponse.json(
        { error: 'Item must have an approved plan to dispatch' },
        { status: 400 }
      );
    }

    // Sort workstreams by orderIndex
    const sortedWorkstreams = [...item.plan.workstreams].sort(
      (a, b) => a.orderIndex - b.orderIndex
    );

    // Calculate estimated time based on plan
    const totalTasks = item.plan.workstreams.reduce(
      (sum, ws) => sum + ws.tasks.length,
      0
    );
    const estimatedMinutes = totalTasks * 15; // Rough estimate: 15 min per task

    // Get files that will be touched
    const filePaths = item.plan.filesTouched.map((f) => f.path);

    // Determine Linear ticket ID
    let linearTicketId = item.linearTicketId;

    // Create Linear ticket if integration is configured and no ticket exists
    if (!linearTicketId && linear.isLinearConfigured()) {
      const syncResult = await linear.syncSessionToLinear({
        sessionId: `pending-${Date.now()}`,
        ticketTitle: item.title,
        repo: item.repo,
        workstream: sortedWorkstreams[0]?.label,
        estimatedMinutes,
      });

      if (syncResult.success && syncResult.issueId) {
        linearTicketId = syncResult.issueId;
      }
    }

    // Create the session
    const [session] = await db.insert(rufloSessions).values({
      repo: item.repo,
      linearTicketId: linearTicketId || `DP-${Date.now()}`,
      ticketTitle: item.title,
      currentWorkstream: sortedWorkstreams[0]?.label || 'Main',
      status: 'ACTIVE',
      progressPercent: 0,
      elapsedMinutes: 0,
      estimatedRemainingMinutes: estimatedMinutes,
      inFlightFiles: filePaths,
    }).returning();

    // Create in-flight file records
    for (const file of item.plan.filesTouched) {
      await db.insert(inFlightFiles).values({
        path: file.path,
        activeSessionId: session.id,
        linearTicketId: session.linearTicketId,
        estimatedMinutesRemaining: estimatedMinutes,
        horizonItemId: itemId,
      });

      // Update file status
      await db.update(touchedFiles)
        .set({
          status: 'IN_FLIGHT',
          inFlightVia: session.id,
        })
        .where(eq(touchedFiles.id, file.id));
    }

    // Remove item from horizon (it's now in-flight)
    await db.delete(horizonItems).where(eq(horizonItems.id, itemId));

    // Dispatch to orchestrator if configured
    let orchestratorJobId: string | undefined;
    if (orchestrator.isOrchestratorConfigured()) {
      const client = orchestrator.getOrchestratorClient();
      const callbackUrl = process.env.APP_URL || 'http://localhost:3000';

      const dispatchRequest = orchestrator.buildDispatchRequest({
        sessionId: session.id,
        repo: item.repo,
        title: item.title,
        filePaths,
        workstream: sortedWorkstreams[0]?.label,
        acceptanceCriteria: item.plan.acceptanceCriteria as string[] | undefined,
        linearTicketId: session.linearTicketId,
        callbackUrl: `${callbackUrl}/api/orchestrator`,
        estimatedMinutes,
      });

      const dispatchResult = await client.dispatch(dispatchRequest);
      if (dispatchResult.accepted) {
        orchestratorJobId = dispatchResult.orchestratorJobId;
      }
    }

    // Create activity event
    await db.insert(activityEvents).values({
      type: 'ITEM_DISPATCHED',
      message: `Dispatched "${item.title}" to fleet`,
      repo: item.repo,
      ticketId: session.linearTicketId,
      metadata: {
        sessionId: session.id,
        itemId,
        estimatedMinutes,
        workstreams: item.plan.workstreams.length,
        tasks: totalTasks,
        orchestratorJobId,
      },
    });

    // Update conductor score (dispatching improves velocity)
    const score = await db.query.conductorScores.findFirst();
    if (score) {
      await db.update(conductorScores)
        .set({
          velocityTrend: Math.min(200, score.velocityTrend + 5),
          total: Math.min(1000, score.total + 10),
        })
        .where(eq(conductorScores.id, score.id));

      await db.insert(activityEvents).values({
        type: 'SCORE_UPDATE',
        message: `Score +10 for dispatching work`,
        metadata: { delta: 10, reason: 'dispatch' },
      });
    }

    // Fetch session with relations
    const sessionWithRelations = await db.query.rufloSessions.findFirst({
      where: eq(rufloSessions.id, session.id),
      with: {
        completedTasks: true,
      },
    });

    return NextResponse.json({
      session: sessionWithRelations,
      message: `Successfully dispatched "${item.title}" to fleet`,
    });
  } catch (error) {
    console.error('Failed to dispatch item:', error);
    return NextResponse.json(
      { error: 'Failed to dispatch item' },
      { status: 500 }
    );
  }
}
