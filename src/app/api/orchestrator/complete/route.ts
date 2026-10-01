import { NextResponse } from 'next/server';
import {
  db,
  rufloSessions,
  inFlightFiles,
  touchedFiles,
  activityEvents,
  completedTasks,
  eq,
} from '@/lib/db';
import { linear } from '@devpilot.sh/core';
import type { CompletionReport } from '@devpilot.sh/core/orchestrator';
import { getServerOrchestrator, getExecutionBridge } from '@/lib/orchestrator';

// POST /api/orchestrator/complete - Receive completion reports from orchestrator
export async function POST(request: Request) {
  try {
    // Callback auth: when a token is configured, require the matching header.
    const expectedToken = process.env.DEVPILOT_CALLBACK_TOKEN;
    if (expectedToken && request.headers.get('X-DevPilot-Callback-Token') !== expectedToken) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const report = await request.json() as CompletionReport;

    // The session runner sends `error` as a string; the type says an object.
    // Read as an object only, a failed session's reason was `undefined` and the
    // activity feed said "Unknown error" for every failure the runner reported.
    const rawError = (report as { error?: unknown }).error;
    const errorMessage =
      typeof rawError === 'string'
        ? rawError
        : (rawError as { message?: string } | undefined)?.message;

    // The agent's final reading, when the runner sends one. Status reports are
    // throttled, so the last one stored while the agent ran can be seconds
    // short of the end — missing its last edits and, because the stream only
    // reports output tokens when a run ends, most of its output. This is the
    // complete reading, and it is what the score's cost dimension is read from.
    const finalTelemetry = (report as { telemetry?: unknown }).telemetry;

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

    // Idempotency (§9.5): a duplicate terminal completion is a no-op.
    if (session.status === 'COMPLETE' || session.status === 'ERROR') {
      return NextResponse.json({
        success: true,
        sessionId: report.sessionId,
        status: session.status,
        filesReleased: 0,
        idempotent: true,
      });
    }

    // Update session status; persist tokens + cost (cents) on the session row.
    await db.update(rufloSessions)
      .set({
        status: report.success ? 'COMPLETE' : 'ERROR',
        progressPercent: report.success ? 100 : session.progressPercent,
        elapsedMinutes: report.durationMinutes,
        prUrl: report.prUrl,
        tokensUsed: report.tokensUsed,
        costUsd: Math.round(report.costUsd * 100),
        ...(finalTelemetry && typeof finalTelemetry === 'object'
          ? { telemetry: finalTelemetry as NonNullable<typeof session.telemetry> }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(rufloSessions.id, report.sessionId));

    // Record completed task (schema columns: sessionId, label, model, durationMinutes).
    await db.insert(completedTasks).values({
      sessionId: report.sessionId,
      label: session.ticketTitle,
      model: null,
      durationMinutes: report.durationMinutes,
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
        : `Session failed: "${session.ticketTitle}" - ${errorMessage || 'no reason reported'}`,
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

    // No score is touched here. A completion used to add fifteen points and a
    // failure take five away, with a cost adjustment compared against the
    // score itself. The Conductor Score is now computed from recorded events
    // (src/lib/score.ts); the session row written above is one of them.

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

    // Forward to the orchestrator service: feeds the push-adapter cache and
    // emits job:complete / job:error, which the ExecutionBridge consumes to
    // record the owning wave task and then tell whoever drives its plan.
    //
    // This route used to do the second half itself — look the wave up and
    // resume the conductor graph — in parallel with the bridge doing the first.
    // Whether the graph saw the task as finished depended on which of two
    // promise chains reached the database first. The bridge now does both, in
    // order, and this waits for it: `settlementFor` is the handler the emit
    // above started, so the response goes out once the task is recorded and
    // the run has been resumed (or deliberately not).
    //
    // The report goes through whole, as it was posted. For a task that ran on
    // its own branch it also says where the work is (`branch`, `baseSha`,
    // `commitSha`) and exactly which files changed, and the bridge writes
    // those onto the wave task in the same statement that completes it —
    // which is what the wave's merge, and the next wave's prompt, then read.
    // Nothing here needs to pick them out; it must only not drop them.
    //
    // Best-effort by construction, as before: the bridge isolates its own
    // faults, because a completion report must still return 200 even when no
    // graph is listening — most sessions are dispatched outside a conductor
    // run. A report the bridge fails to apply is picked up from the session
    // row by its reconciler.
    let conductor: { resumed: boolean; reason?: string } = {
      resumed: false,
      reason: 'no wave task for session',
    };
    try {
      getServerOrchestrator().ingestCompletionReport(report);

      const settlement = await getExecutionBridge().settlementFor(report.sessionId);
      if (settlement.error) {
        conductor = { resumed: false, reason: settlement.error };
      } else if (settlement.task) {
        conductor = settlement.driver ?? {
          resumed: false,
          reason:
            settlement.recorded === 'ignored'
              ? 'report changed nothing (duplicate, or not the current attempt)'
              : 'plan is not run by the conductor',
        };
      }
    } catch (ingestError) {
      console.error('Failed to forward completion to orchestrator:', ingestError);
    }

    return NextResponse.json({
      success: true,
      sessionId: report.sessionId,
      status: report.success ? 'COMPLETE' : 'ERROR',
      filesReleased: releasedFiles.length,
      conductor,
    });
  } catch (error) {
    console.error('Orchestrator completion error:', error);
    return NextResponse.json(
      { error: 'Failed to process completion report' },
      { status: 500 }
    );
  }
}
