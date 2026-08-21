import { NextResponse } from 'next/server';
import { score as scoreModel } from '@devpilot.sh/core';
import {
  db,
  rufloSessions,
  inFlightFiles,
  horizonItems,
  activityEvents,
  conductorScores,
  eq,
  or,
  and,
  gte,
  lt,
  desc,
  sql,
} from '@/lib/db';

// GET /api/fleet/state - Get full fleet state including runway calculations
export async function GET() {
  try {
    // Active sessions, PLUS anything that finished recently.
    //
    // This route used to return only ACTIVE and NEEDS_SPEC, so a session
    // vanished from Fleet Status the instant it succeeded — the conductor never
    // saw the thing they dispatched actually finish. It also made the
    // `allComplete` ✓ branch in FleetSummaryPills and the `complete` sort key in
    // FleetStatusPanel unreachable: the UI was built for a state the API never
    // sent.
    //
    // Terminal sessions linger for a window and then clear, so the panel shows
    // completion without becoming an ever-growing history list — that is what
    // the activity feed is for.
    const terminalWindowMs =
      Number(process.env.DEVPILOT_TERMINAL_SESSION_WINDOW_MIN ?? 60) * 60_000;
    const terminalCutoff = new Date(Date.now() - terminalWindowMs);

    /**
     * Retire sessions whose agent is never coming back.
     *
     * A session goes ACTIVE at dispatch and only leaves that state when a
     * completion callback arrives. An agent that dies — killed, crashed, or
     * running against a cockpit that was restarted — leaves a row that is
     * active forever. Three of those sat at 0% with "Elapsed: 0m" for hours,
     * and every one of them counted toward fleet utilization, so the panel
     * reported a busy fleet with nothing running.
     *
     * The threshold is deliberately generous. A long single task is normal;
     * an hour of total silence is not, and the runner's own wall-clock cap is
     * well inside it. Marked ERROR rather than COMPLETE: we do not know that
     * the work succeeded, and saying so would be inventing an outcome.
     */
    const staleCutoff = new Date(Date.now() - 60 * 60_000);
    await db
      .update(rufloSessions)
      .set({ status: 'ERROR', updatedAt: new Date() })
      .where(
        and(
          eq(rufloSessions.status, 'ACTIVE'),
          lt(rufloSessions.updatedAt, staleCutoff)
        )
      );

    const sessions = await db.query.rufloSessions.findMany({
      where: or(
        eq(rufloSessions.status, 'ACTIVE'),
        eq(rufloSessions.status, 'NEEDS_SPEC'),
        and(
          or(
            eq(rufloSessions.status, 'COMPLETE'),
            eq(rufloSessions.status, 'ERROR')
          ),
          gte(rufloSessions.updatedAt, terminalCutoff)
        )
      ),
      with: {
        completedTasks: true,
      },
      orderBy: desc(rufloSessions.updatedAt),
    });

    // Get in-flight files
    const allInFlightFiles = await db.query.inFlightFiles.findMany();

    // Calculate runway metrics
    // Runway is about work still to come, so terminal sessions are excluded —
    // a finished session's `estimatedRemainingMinutes` is stale and would
    // inflate runway with time nobody is going to spend.
    const liveSessions = sessions.filter(
      (s) => s.status === 'ACTIVE' || s.status === 'NEEDS_SPEC'
    );

    const totalEstimatedMinutes = liveSessions.reduce(
      (sum, s) => sum + s.estimatedRemainingMinutes,
      0
    );

    // Get items in READY zone (available work)
    const readyItemsList = await db.query.horizonItems.findMany({
      where: eq(horizonItems.zone, 'READY'),
    });
    const readyItems = readyItemsList.length;

    // Get items in REFINING zone (upcoming work)
    const refiningItemsList = await db.query.horizonItems.findMany({
      where: eq(horizonItems.zone, 'REFINING'),
    });
    const refiningItems = refiningItemsList.length;

    // Calculate fleet utilization (assuming max 8 concurrent sessions)
    const maxSessions = 8;
    const activeSessions = sessions.filter((s) => s.status === 'ACTIVE').length;
    const fleetUtilization = Math.round((activeSessions / maxSessions) * 100);

    // Calculate runway in minutes
    // Runway = (ready items * avg completion time) + refining items buffer
    const avgCompletionMinutes = 45; // Average task completion time
    const runwayMinutes =
      readyItems * avgCompletionMinutes +
      totalEstimatedMinutes +
      refiningItems * avgCompletionMinutes * 0.5;

    // Determine runway status
    let runwayStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';
    const runwayHours = runwayMinutes / 60;
    if (runwayHours < 2) {
      runwayStatus = 'CRITICAL';
    } else if (runwayHours < 8) {
      runwayStatus = 'WARNING';
    }

    // Get recent activity
    const recentEvents = await db.query.activityEvents.findMany({
      orderBy: desc(activityEvents.createdAt),
      limit: 10,
    });

    // Get conductor score
    const score = await db.query.conductorScores.findFirst({
      orderBy: desc(conductorScores.updatedAt),
    });

    return NextResponse.json({
      sessions,
      inFlightFiles: allInFlightFiles,
      runway: {
        totalMinutes: runwayMinutes,
        hours: Math.round(runwayHours * 10) / 10,
        status: runwayStatus,
        readyItems,
        refiningItems,
      },
      fleet: {
        activeSessions,
        maxSessions,
        utilization: fleetUtilization,
        needsSpecCount: sessions.filter((s) => s.status === 'NEEDS_SPEC').length,
      },
      recentEvents,
      conductorScore: score
        ? {
            // Recomputed from the clamped dimensions, matching /api/score.
            // Serving the stored total here while /api/score serves a
            // recomputed one made the top-bar pill and its own breakdown
            // disagree — 822 against 716 — which is the same incoherence
            // TRD 16 §4.4 fixed one route at a time.
            total: scoreModel.totalFrom(
              score as unknown as Record<scoreModel.ScoreDimensionKey, number>
            ),
            storedTotal: score.total,
            breakdown: {
              fleetUtilization: score.fleetUtilization,
              runwayHealth: score.runwayHealth,
              planAccuracy: score.planAccuracy,
              costEfficiency: score.costEfficiency,
              velocityTrend: score.velocityTrend,
            },
            leaderboardRank: score.leaderboardRank,
          }
        : null,
    });
  } catch (error) {
    console.error('Failed to fetch fleet state:', error);
    return NextResponse.json(
      { error: 'Failed to fetch fleet state' },
      { status: 500 }
    );
  }
}
