import { NextResponse } from 'next/server';
import {
  db,
  rufloSessions,
  inFlightFiles,
  touchedFiles,
  activityEvents,
  conductorScores,
  completedTasks,
  eq,
} from '@/lib/db';
import { orchestrator, linear } from '@devpilot/core';

// POST /api/orchestrator/complete - Receive completion reports from orchestrator
export async function POST(request: Request) {
  try {
    const report = await request.json() as orchestrator.CompletionReport;

    // Find the session
    const session = await db.query.rufloSessions.findFirst({
      where: eq(rufloSessions.id, report.sessionId),
    });

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Update session status
    await db.update(rufloSessions)
      .set({
        status: report.success ? 'COMPLETE' : 'ERROR',
        progressPercent: report.success ? 100 : session.progressPercent,
        elapsedMinutes: report.durationMinutes,
        prUrl: report.prUrl,
        updatedAt: new Date(),
      })
      .where(eq(rufloSessions.id, report.sessionId));

    // Record completed task
    await db.insert(completedTasks).values({
      sessionId: report.sessionId,
      taskLabel: session.ticketTitle,
      model: 'SONNET', // Default, should come from report
      tokensUsed: report.tokensUsed,
      costUsd: report.costUsd,
      filesModified: report.filesModified,
    });

    // Release in-flight files
    const releasedFiles = await db.query.inFlightFiles.findMany({
      where: eq(inFlightFiles.activeSessionId, report.sessionId),
    });

    for (const file of releasedFiles) {
      // Update touched file status
      if (file.horizonItemId) {
        const touchedFile = await db.query.touchedFiles.findFirst({
          where: eq(touchedFiles.path, file.path),
        });

        if (touchedFile) {
          await db.update(touchedFiles)
            .set({
              status: 'RECENTLY_MODIFIED',
              inFlightVia: null,
            })
            .where(eq(touchedFiles.id, touchedFile.id));
        }
      }

      // Delete in-flight record
      await db.delete(inFlightFiles).where(eq(inFlightFiles.id, file.id));

      // Create file unlock event
      await db.insert(activityEvents).values({
        type: 'FILE_UNLOCKED',
        message: `File released: ${file.path}`,
        repo: session.repo,
        ticketId: session.linearTicketId,
        metadata: { path: file.path, sessionId: report.sessionId },
      });
    }

    // Create completion event
    await db.insert(activityEvents).values({
      type: 'SESSION_COMPLETE',
      message: report.success
        ? `Session completed: "${session.ticketTitle}"${report.prUrl ? ` - PR: ${report.prUrl}` : ''}`
        : `Session failed: "${session.ticketTitle}" - ${report.error?.message || 'Unknown error'}`,
      repo: session.repo,
      ticketId: session.linearTicketId,
      metadata: {
        sessionId: report.sessionId,
        success: report.success,
        prUrl: report.prUrl,
        filesModified: report.filesModified.length,
        tokensUsed: report.tokensUsed,
        costUsd: report.costUsd,
        durationMinutes: report.durationMinutes,
        error: report.error,
      },
    });

    // Update conductor score
    const score = await db.query.conductorScores.findFirst();
    if (score) {
      const scoreDelta = report.success ? 15 : -5;
      const costEfficiencyDelta = report.costUsd < (score.costEfficiency / 100 * 0.5) ? 5 : -2;

      await db.update(conductorScores)
        .set({
          total: Math.max(0, Math.min(1000, score.total + scoreDelta)),
          velocityTrend: Math.max(0, Math.min(200, score.velocityTrend + (report.success ? 3 : -2))),
          costEfficiency: Math.max(0, Math.min(200, score.costEfficiency + costEfficiencyDelta)),
        })
        .where(eq(conductorScores.id, score.id));

      await db.insert(activityEvents).values({
        type: 'SCORE_UPDATE',
        message: `Score ${scoreDelta > 0 ? '+' : ''}${scoreDelta} for ${report.success ? 'completion' : 'failure'}`,
        metadata: { delta: scoreDelta, reason: report.success ? 'completion' : 'failure' },
      });
    }

    // Sync completion to Linear if configured
    if (session.linearTicketId && linear.isLinearConfigured()) {
      await linear.syncCompletionToLinear({
        linearTicketId: session.linearTicketId,
        success: report.success,
        prUrl: report.prUrl,
        filesModified: report.filesModified,
        completionMessage: report.summary,
      });
    }

    return NextResponse.json({
      success: true,
      sessionId: report.sessionId,
      status: report.success ? 'COMPLETE' : 'ERROR',
      filesReleased: releasedFiles.length,
    });
  } catch (error) {
    console.error('Orchestrator completion error:', error);
    return NextResponse.json(
      { error: 'Failed to process completion report' },
      { status: 500 }
    );
  }
}
