import { NextResponse } from 'next/server';
import { db, rufloSessions, eq } from '@/lib/db';
import { getServerOrchestrator } from '@/lib/orchestrator';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/fleet/sessions/:id/stop — stop one agent.
 *
 * The cockpit could show an agent working and offer nothing to do about it. A
 * conductor watching a task grind against the wrong file, or burn tokens on a
 * plan they have already decided to re-do, had exactly two options: wait for
 * the twenty-minute timeout, or kill the runner and take every other agent with
 * it. Neither is a control.
 *
 * `cancelBySessionId` already existed and reached all the way to the runner's
 * `/stop` route, which owns the process handle. It was simply never exposed.
 *
 * The session is marked ERROR rather than COMPLETE: work was stopped part-way,
 * and recording it as finished would tell the conductor — and Linear — that it
 * succeeded.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    const session = await db.query.rufloSessions.findFirst({
      where: eq(rufloSessions.id, id),
    });
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.status !== 'ACTIVE') {
      // Already finished or already stopped. Not an error — a conductor
      // clicking stop on a session that just completed should be told so, not
      // shown a failure.
      return NextResponse.json({
        stopped: false,
        reason: `Session is already ${session.status.toLowerCase()}.`,
      });
    }

    const orchestrator = getServerOrchestrator();
    const result = await orchestrator.cancelBySessionId(id);

    /**
     * Mark it regardless of what the runner said.
     *
     * If the agent has already exited, or the runner is unreachable, the intent
     * still stands: this session is not coming back, and leaving it ACTIVE
     * means it keeps counting toward fleet utilization. That is exactly how
     * three phantom agents came to report a busy fleet with nothing running.
     */
    await db
      .update(rufloSessions)
      .set({ status: 'ERROR', updatedAt: new Date() })
      .where(eq(rufloSessions.id, id));

    return NextResponse.json({
      stopped: true,
      runnerAcknowledged: result.success,
      message: result.message,
    });
  } catch (error) {
    console.error('Failed to stop session:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to stop the session' },
      { status: 500 }
    );
  }
}
