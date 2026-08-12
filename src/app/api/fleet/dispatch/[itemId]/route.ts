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
} from '@/lib/db';
import { linear, score as scoreModel } from '@devpilot.sh/core';
import { getServerOrchestrator } from '@/lib/orchestrator';

interface RouteParams {
  params: Promise<{ itemId: string }>;
}

// POST /api/fleet/dispatch/[itemId] - Dispatch a horizon item to the fleet.
export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const { itemId } = await params;

    const item = await db.query.horizonItems.findFirst({
      where: eq(horizonItems.id, itemId),
      with: {
        plan: {
          with: {
            workstreams: { with: { tasks: true } },
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

    // No dead sessions: bail out before any mutation when dispatch is disabled.
    const service = getServerOrchestrator();
    if (!service.isEnabled) {
      return NextResponse.json(
        {
          error: 'ORCHESTRATOR_UNAVAILABLE',
          detail:
            'Set DEVPILOT_ORCHESTRATOR_MODE (claude-session | ao-cli | http) to enable dispatch',
        },
        { status: 503 }
      );
    }

    const sortedWorkstreams = [...item.plan.workstreams].sort(
      (a, b) => a.orderIndex - b.orderIndex
    );

    const totalTasks = item.plan.workstreams.reduce(
      (sum: number, ws: { tasks: unknown[] }) => sum + ws.tasks.length,
      0
    );
    const estimatedMinutes = totalTasks * 15; // rough estimate: 15 min/task

    const filePaths = item.plan.filesTouched.map((f: { path: string }) => f.path);
    const acceptanceCriteria = item.plan.acceptanceCriteria as string[] | undefined;

    // Determine / create the Linear ticket.
    let linearTicketId = item.linearTicketId;
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

    // Create the session + in-flight locks (rolled back if dispatch is rejected).
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

    for (const file of item.plan.filesTouched) {
      await db.insert(inFlightFiles).values({
        path: file.path,
        activeSessionId: session.id,
        linearTicketId: session.linearTicketId,
        estimatedMinutesRemaining: estimatedMinutes,
        horizonItemId: itemId,
      });
      await db.update(touchedFiles)
        .set({ status: 'IN_FLIGHT', inFlightVia: session.id })
        .where(eq(touchedFiles.id, file.id));
    }

    // Dispatch.
    const callbackBase =
      process.env.DEVPILOT_CALLBACK_URL || process.env.APP_URL || 'http://localhost:3000';
    const promptCriteria =
      acceptanceCriteria && acceptanceCriteria.length > 0
        ? `\n\nAcceptance Criteria:\n${acceptanceCriteria.map((c) => `- ${c}`).join('\n')}`
        : '';

    const dispatchResult = await service.dispatch({
      sessionId: session.id,
      repo: item.repo,
      callbackUrl: `${callbackBase.replace(/\/$/, '')}/api/orchestrator`,
      taskSpec: {
        prompt: `Implement "${item.title}" for ${item.repo}.${promptCriteria}`,
        filePaths,
        model: 'sonnet',
        workstream: sortedWorkstreams[0]?.label,
        acceptanceCriteria,
        estimatedMinutes,
      },
      linearTicketId: session.linearTicketId,
      metadata: {
        itemId,
        workstreams: item.plan.workstreams.length,
        tasks: totalTasks,
      },
    });

    if (!dispatchResult.accepted) {
      // Roll back the session row + file locks; keep the horizon item so the
      // work is not silently lost.
      await db.delete(inFlightFiles).where(eq(inFlightFiles.activeSessionId, session.id));
      for (const file of item.plan.filesTouched) {
        await db.update(touchedFiles)
          .set({ status: 'AVAILABLE', inFlightVia: null })
          .where(eq(touchedFiles.id, file.id));
      }
      await db.delete(rufloSessions).where(eq(rufloSessions.id, session.id));

      return NextResponse.json(
        {
          error: 'DISPATCH_REJECTED',
          detail: dispatchResult.error ?? 'Adapter rejected dispatch',
        },
        { status: 502 }
      );
    }

    const orchestratorJobId = dispatchResult.orchestratorJobId;

    // Persist the external correlation on the session row.
    await db.update(rufloSessions)
      .set({
        externalSessionId: orchestratorJobId ?? null,
        orchestratorMode: service.mode,
        updatedAt: new Date(),
      })
      .where(eq(rufloSessions.id, session.id));

    // Dispatch succeeded: remove the item from the horizon (now in-flight).
    await db.delete(horizonItems).where(eq(horizonItems.id, itemId));

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

    // Update conductor score (dispatching improves velocity).
    const score = await db.query.conductorScores.findFirst();
    if (score) {
      await db.update(conductorScores)
        .set({
          velocityTrend: scoreModel.clampDimension('velocityTrend', score.velocityTrend + 5),
          total: Math.min(1000, score.total + 10),
        })
        .where(eq(conductorScores.id, score.id));

      await db.insert(activityEvents).values({
        type: 'SCORE_UPDATE',
        message: `Score +10 for dispatching work`,
        metadata: { delta: 10, reason: 'dispatch' },
      });
    }

    const sessionWithRelations = await db.query.rufloSessions.findFirst({
      where: eq(rufloSessions.id, session.id),
      with: { completedTasks: true },
    });

    return NextResponse.json({
      session: sessionWithRelations,
      orchestrator: { mode: service.mode, externalJobId: orchestratorJobId },
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
