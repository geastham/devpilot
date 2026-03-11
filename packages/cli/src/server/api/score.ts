import { FastifyInstance } from 'fastify';
import { conductorScores, scoreHistory } from '@devpilot.sh/core/db';
import { eq, gte, and, asc, desc } from 'drizzle-orm';
import { getDb } from '../index';

export async function registerScoreRoutes(app: FastifyInstance) {
  const db = getDb();

  // GET /api/score - Get the current conductor score
  app.get('/api/score', async (request, reply) => {
    const existingScore = await db.query.conductorScores.findFirst({
      with: {
        history: true,
      },
    });

    // Use existing score or create a new one
    let scoreId: string;
    let total: number;
    let fleetUtilization: number;
    let runwayHealth: number;
    let planAccuracy: number;
    let costEfficiency: number;
    let velocityTrend: number;
    let leaderboardRank: number | null;
    let updatedAt: Date;

    if (existingScore) {
      scoreId = existingScore.id;
      total = existingScore.total;
      fleetUtilization = existingScore.fleetUtilization;
      runwayHealth = existingScore.runwayHealth;
      planAccuracy = existingScore.planAccuracy;
      costEfficiency = existingScore.costEfficiency;
      velocityTrend = existingScore.velocityTrend;
      leaderboardRank = existingScore.leaderboardRank;
      updatedAt = existingScore.updatedAt;
    } else {
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

      scoreId = newScore.id;
      total = newScore.total;
      fleetUtilization = newScore.fleetUtilization;
      runwayHealth = newScore.runwayHealth;
      planAccuracy = newScore.planAccuracy;
      costEfficiency = newScore.costEfficiency;
      velocityTrend = newScore.velocityTrend;
      leaderboardRank = newScore.leaderboardRank;
      updatedAt = newScore.updatedAt;
    }

    const historyData = await db.query.scoreHistory.findMany({
      where: eq(scoreHistory.scoreId, scoreId),
      orderBy: desc(scoreHistory.recordedAt),
      limit: 30,
    });

    const breakdown = {
      fleetUtilization: {
        value: fleetUtilization,
        max: 200,
        percent: Math.round((fleetUtilization / 200) * 100),
        label: 'Fleet Utilization',
        description: 'How well you keep your fleet busy',
      },
      runwayHealth: {
        value: runwayHealth,
        max: 200,
        percent: Math.round((runwayHealth / 200) * 100),
        label: 'Runway Health',
        description: 'Maintaining healthy work pipeline',
      },
      planAccuracy: {
        value: planAccuracy,
        max: 200,
        percent: Math.round((planAccuracy / 200) * 100),
        label: 'Plan Accuracy',
        description: 'How accurate your cost estimates are',
      },
      costEfficiency: {
        value: costEfficiency,
        max: 200,
        percent: Math.round((costEfficiency / 200) * 100),
        label: 'Cost Efficiency',
        description: 'Optimizing model selection for tasks',
      },
      velocityTrend: {
        value: velocityTrend,
        max: 200,
        percent: Math.round((velocityTrend / 200) * 100),
        label: 'Velocity Trend',
        description: 'Improving throughput over time',
      },
    };

    const sparklineData = historyData.map((h) => ({
      date: h.recordedAt,
      value: h.total,
    }));

    return {
      total,
      max: 1000,
      percent: Math.round((total / 1000) * 100),
      leaderboardRank,
      breakdown,
      sparklineData,
      updatedAt,
    };
  });

  // GET /api/score/history - Get score history for charts
  app.get('/api/score/history', async (request, reply) => {
    const { days = '7' } = request.query as { days?: string };
    const numDays = parseInt(days, 10);

    const score = await db.query.conductorScores.findFirst();

    if (!score) {
      return { history: [], summary: null };
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - numDays);

    const history = await db.query.scoreHistory.findMany({
      where: and(
        eq(scoreHistory.scoreId, score.id),
        gte(scoreHistory.recordedAt, startDate)
      ),
      orderBy: asc(scoreHistory.recordedAt),
    });

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

    const chartData = history.map((h) => ({
      date: h.recordedAt.toISOString().split('T')[0],
      total: h.total,
      fleetUtilization: h.fleetUtilization,
      runwayHealth: h.runwayHealth,
      planAccuracy: h.planAccuracy,
      costEfficiency: h.costEfficiency,
      velocityTrend: h.velocityTrend,
    }));

    return {
      history: chartData,
      summary,
      period: { days: numDays, start: startDate.toISOString(), end: new Date().toISOString() },
    };
  });

  // POST /api/score/history - Record a score snapshot
  app.post('/api/score/history', async (request, reply) => {
    const score = await db.query.conductorScores.findFirst();

    if (!score) {
      reply.status(404).send({ error: 'No score exists to record' });
      return;
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

    reply.status(201).send(historyEntry);
  });
}
