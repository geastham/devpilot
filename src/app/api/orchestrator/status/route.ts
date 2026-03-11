import { NextResponse } from 'next/server';
import {
  db,
  rufloSessions,
  activityEvents,
  eq,
} from '@/lib/db';
import { orchestrator, linear } from '@devpilot.sh/core';

// POST /api/orchestrator/status - Receive status updates from orchestrator
export async function POST(request: Request) {
  try {
    const update = await request.json() as orchestrator.StatusUpdate;

    // Find the session
    const session = await db.query.rufloSessions.findFirst({
      where: eq(rufloSessions.id, update.sessionId),
    });

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Map orchestrator status to session status
    let sessionStatus: 'ACTIVE' | 'NEEDS_SPEC' | 'COMPLETE' | 'ERROR' = 'ACTIVE';
    if (update.status === 'complete') {
      sessionStatus = 'COMPLETE';
    } else if (update.status === 'error') {
      sessionStatus = 'ERROR';
    } else if (update.status === 'waiting') {
      sessionStatus = 'NEEDS_SPEC';
    }

    // Update session
    await db.update(rufloSessions)
      .set({
        status: sessionStatus,
        progressPercent: update.progressPercent,
        currentWorkstream: update.currentStep || session.currentWorkstream,
        updatedAt: new Date(),
      })
      .where(eq(rufloSessions.id, update.sessionId));

    // Create activity event
    await db.insert(activityEvents).values({
      type: 'SESSION_PROGRESS',
      message: update.message || `Session progress: ${update.progressPercent}%`,
      repo: session.repo,
      ticketId: session.linearTicketId,
      metadata: {
        sessionId: update.sessionId,
        status: update.status,
        progressPercent: update.progressPercent,
        currentFile: update.currentFile,
        tokensUsed: update.tokensUsed,
      },
    });

    // Sync progress to Linear if configured
    if (session.linearTicketId && linear.isLinearConfigured()) {
      await linear.syncProgressToLinear({
        linearTicketId: session.linearTicketId,
        progressPercent: update.progressPercent,
        currentWorkstream: update.currentStep,
        filesModified: update.filesModified,
        status: update.status === 'running' ? 'running' :
                update.status === 'waiting' ? 'waiting' :
                update.status === 'complete' ? 'complete' : 'error',
        message: update.message,
      });
    }

    return NextResponse.json({
      success: true,
      sessionId: update.sessionId,
      newStatus: sessionStatus,
    });
  } catch (error) {
    console.error('Orchestrator status update error:', error);
    return NextResponse.json(
      { error: 'Failed to process status update' },
      { status: 500 }
    );
  }
}
