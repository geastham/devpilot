import { NextResponse } from 'next/server';
import {
  db,
  rufloSessions,
  inFlightFiles,
  horizonItems,
  activityEvents,
  conductorScores,
  eq,
  or,
  desc,
  sql,
} from '@/lib/db';

// GET /api/fleet/state - Get full fleet state including runway calculations
export async function GET() {
  try {
    // Get active sessions (ACTIVE or NEEDS_SPEC)
    const sessions = await db.query.rufloSessions.findMany({
      where: or(
        eq(rufloSessions.status, 'ACTIVE'),
        eq(rufloSessions.status, 'NEEDS_SPEC')
      ),
      with: {
        completedTasks: true,
      },
      orderBy: desc(rufloSessions.updatedAt),
    });

    // Get in-flight files
    const allInFlightFiles = await db.query.inFlightFiles.findMany();

    // Calculate runway metrics
    const totalEstimatedMinutes = sessions.reduce(
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
            total: score.total,
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
