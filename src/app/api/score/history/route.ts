import { NextRequest, NextResponse } from 'next/server';
import { db, conductorScores, scoreHistory, eq, gte, and, asc } from '@/lib/db';

// GET /api/score/history - Get score history for charts
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '7', 10);

    const score = await db.query.conductorScores.findFirst();

    if (!score) {
      return NextResponse.json({ history: [], summary: null });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const history = await db.query.scoreHistory.findMany({
      where: and(
        eq(scoreHistory.scoreId, score.id),
        gte(scoreHistory.recordedAt, startDate)
      ),
      orderBy: asc(scoreHistory.recordedAt),
    });

    // Calculate summary stats
    const totals = history.map((h) => h.total);
    const summary = totals.length > 0
      ? {
          current: totals[totals.length - 1],
          min: Math.min(...totals),
          max: Math.max(...totals),
          average: Math.round(totals.reduce((a, b) => a + b, 0) / totals.length),
          trend:
            totals.length > 1
              ? totals[totals.length - 1] - totals[0] > 0
                ? 'up'
                : totals[totals.length - 1] - totals[0] < 0
                ? 'down'
                : 'stable'
              : 'stable',
          delta: totals.length > 1 ? totals[totals.length - 1] - totals[0] : 0,
        }
      : null;

    // Format for charts
    const chartData = history.map((h) => ({
      date: h.recordedAt.toISOString().split('T')[0],
      total: h.total,
      fleetUtilization: h.fleetUtilization,
      runwayHealth: h.runwayHealth,
      planAccuracy: h.planAccuracy,
      costEfficiency: h.costEfficiency,
      velocityTrend: h.velocityTrend,
    }));

    return NextResponse.json({
      history: chartData,
      summary,
      period: { days, start: startDate.toISOString(), end: new Date().toISOString() },
    });
  } catch (error) {
    console.error('Failed to fetch score history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch score history' },
      { status: 500 }
    );
  }
}

// POST /api/score/history - Record a new score snapshot (internal use)
export async function POST() {
  try {
    const score = await db.query.conductorScores.findFirst();

    if (!score) {
      return NextResponse.json(
        { error: 'No score exists to record' },
        { status: 404 }
      );
    }

    const [historyEntry] = await db.insert(scoreHistory).values({
      scoreId: score.id,
      total: score.total,
      fleetUtilization: score.fleetUtilization,
      runwayHealth: score.runwayHealth,
      planAccuracy: score.planAccuracy,
      costEfficiency: score.costEfficiency,
      velocityTrend: score.velocityTrend,
    }).returning();

    return NextResponse.json(historyEntry, { status: 201 });
  } catch (error) {
    console.error('Failed to record score history:', error);
    return NextResponse.json(
      { error: 'Failed to record score history' },
      { status: 500 }
    );
  }
}
