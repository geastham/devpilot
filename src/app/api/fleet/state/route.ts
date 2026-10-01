import { NextResponse } from 'next/server';
import { score as scoreModel } from '@devpilot.sh/core';
import { currentScore, ensureRunwaySampler, fleetCapacity, recordRunwaySample } from '@/lib/score';
import { readRunway } from '@/lib/runway';
import {
  db,
  rufloSessions,
  inFlightFiles,
  activityEvents,
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

    // Fleet utilization, against the fleet's real capacity.
    //
    // This divided by a hard-coded 8. Nothing in the product ran eight agents
    // by default — the session runner runs three — so a fleet at capacity read
    // 38% busy. Capacity now comes from the operator or the runner itself, and
    // when neither says, utilization is null rather than a ratio against a
    // number nobody declared.
    const { value: maxSessions } = await fleetCapacity();
    const activeSessions = sessions.filter((s) => s.status === 'ACTIVE').length;
    const fleetUtilization =
      maxSessions !== null ? Math.min(100, Math.round((activeSessions / maxSessions) * 100)) : null;

    // Runway, from the same arithmetic the sampler uses — see src/lib/runway.ts.
    const runway = await readRunway();

    // Write the reading down (at most once a minute) and make sure the sampler
    // is running. Runway health is scored from this history; until it was kept
    // there was nothing to score.
    await recordRunwaySample(runway.hours);
    ensureRunwaySampler();

    // Get recent activity
    const recentEvents = await db.query.activityEvents.findMany({
      orderBy: desc(activityEvents.createdAt),
      limit: 10,
    });

    // The Conductor Score, computed from recorded events — see src/lib/score.ts.
    // A failure to compute it must not take the fleet panel down with it.
    const score = await currentScore().catch((error) => {
      console.error('Failed to compute score:', error);
      return null;
    });

    return NextResponse.json({
      sessions,
      inFlightFiles: allInFlightFiles,
      runway: {
        totalMinutes: runway.totalMinutes,
        hours: Math.round(runway.hours * 10) / 10,
        status: runway.status,
        readyItems: runway.readyItems,
        refiningItems: runway.refiningItems,
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
            total: score.total,
            measuredMax: score.measuredMax,
            max: score.max,
            complete: score.complete,
            windowHours: score.windowHours,
            modelVersion: score.modelVersion,
            dimensions: scoreModel.SCORE_MODEL.map((dimension) => ({
              key: dimension.key,
              label: dimension.label,
              meaning: dimension.meaning,
              max: dimension.max,
              value: score.dimensions[dimension.key].value,
              unmeasured: score.dimensions[dimension.key].unmeasured,
            })),
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
