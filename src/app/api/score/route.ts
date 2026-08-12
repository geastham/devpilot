import { NextResponse } from 'next/server';
import { db, conductorScores, scoreHistory, eq, desc } from '@/lib/db';
import { score as scoreModel } from '@devpilot.sh/core';

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

    // Breakdown derived from SCORE_MODEL (TRD 16) — the maxima used to be
    // hard-coded here as `200` across the board, which is one of the four places
    // that drifted from spec/DESIGN.md 8.1 and from each other.
    const breakdown = Object.fromEntries(
      scoreModel.SCORE_MODEL.map((dimension) => {
        const value = scoreModel.clampDimension(
          dimension.key,
          (score as unknown as Record<string, number>)[dimension.key] ?? 0
        );
        return [
          dimension.key,
          {
            value,
            max: dimension.max,
            percent: Math.round((value / dimension.max) * 100),
            label: dimension.label,
            description: dimension.meaning,
            method: dimension.method,
          },
        ];
      })
    );

    // Format history for sparkline
    const sparklineData = historyData.map((h) => ({
      date: h.recordedAt,
      value: h.total,
    }));

    // Recomputed from the clamped dimensions, NOT the stored total.
    //
    // Stored totals were accumulated under the previous weighting (a flat 200
    // per dimension), so a persisted 822 does not equal the sum of the same
    // dimensions read through SCORE_MODEL — the breakdown showed 716. Serving
    // the stored number next to components that contradict it is worse than
    // serving a number that moved: it is a total nobody can derive.
    //
    // TRD 16 §4.4 marks pre-migration scores `model_version: 0` and excludes
    // them from ranking. Until that lands, `storedTotal` is returned alongside
    // so the drift is visible rather than silently reconciled.
    const recomputedTotal = scoreModel.totalFrom(
      score as unknown as Record<scoreModel.ScoreDimensionKey, number>
    );

    return NextResponse.json({
      total: recomputedTotal,
      storedTotal: score.total,
      max: scoreModel.SCORE_TOTAL,
      percent: Math.round((score.total / scoreModel.SCORE_TOTAL) * 100),
      modelVersion: scoreModel.SCORE_MODEL_VERSION,
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
