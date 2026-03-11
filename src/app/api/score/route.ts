import { NextResponse } from 'next/server';
import { db, conductorScores, scoreHistory, eq, desc } from '@/lib/db';

// GET /api/score - Get the current conductor score
export async function GET() {
  try {
    // Get or create the default score
    let score = await db.query.conductorScores.findFirst({
      with: {
        history: true,
      },
    });

    if (!score) {
      // Create initial score
      const [newScore] = await db.insert(conductorScores).values({
        userId: 'default',
        total: 500,
        fleetUtilization: 100,
        runwayHealth: 100,
        planAccuracy: 100,
        costEfficiency: 100,
        velocityTrend: 100,
        leaderboardRank: 1,
      }).returning();

      score = {
        ...newScore,
        history: [],
      };
    }

    // Get history separately with ordering (Drizzle limitation)
    const historyData = await db.query.scoreHistory.findMany({
      where: eq(scoreHistory.scoreId, score.id),
      orderBy: desc(scoreHistory.recordedAt),
      limit: 30,
    });

    // Calculate component percentages (each out of 200, total out of 1000)
    const breakdown = {
      fleetUtilization: {
        value: score.fleetUtilization,
        max: 200,
        percent: Math.round((score.fleetUtilization / 200) * 100),
        label: 'Fleet Utilization',
        description: 'How well you keep your fleet busy',
      },
      runwayHealth: {
        value: score.runwayHealth,
        max: 200,
        percent: Math.round((score.runwayHealth / 200) * 100),
        label: 'Runway Health',
        description: 'Maintaining healthy work pipeline',
      },
      planAccuracy: {
        value: score.planAccuracy,
        max: 200,
        percent: Math.round((score.planAccuracy / 200) * 100),
        label: 'Plan Accuracy',
        description: 'How accurate your cost estimates are',
      },
      costEfficiency: {
        value: score.costEfficiency,
        max: 200,
        percent: Math.round((score.costEfficiency / 200) * 100),
        label: 'Cost Efficiency',
        description: 'Optimizing model selection for tasks',
      },
      velocityTrend: {
        value: score.velocityTrend,
        max: 200,
        percent: Math.round((score.velocityTrend / 200) * 100),
        label: 'Velocity Trend',
        description: 'Improving throughput over time',
      },
    };

    // Format history for sparkline
    const sparklineData = historyData.map((h) => ({
      date: h.recordedAt,
      value: h.total,
    }));

    return NextResponse.json({
      total: score.total,
      max: 1000,
      percent: Math.round((score.total / 1000) * 100),
      leaderboardRank: score.leaderboardRank,
      breakdown,
      sparklineData,
      updatedAt: score.updatedAt,
    });
  } catch (error) {
    console.error('Failed to fetch score:', error);
    return NextResponse.json(
      { error: 'Failed to fetch score' },
      { status: 500 }
    );
  }
}
