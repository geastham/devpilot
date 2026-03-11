import { FastifyInstance } from 'fastify';
import {
  horizonItems,
  rufloSessions,
  inFlightFiles,
  touchedFiles,
  activityEvents,
  conductorScores,
} from '@devpilot/core/db';
import {
  getOrchestratorServiceOrNull,
  buildDispatchRequest,
} from '@devpilot/core/orchestrator';
import { eq, or, desc, and, asc } from 'drizzle-orm';
import { getDb } from '../index';

export async function registerFleetRoutes(app: FastifyInstance) {
  const db = getDb();

  // GET /api/fleet/sessions - List all fleet sessions
  app.get('/api/fleet/sessions', async (request, reply) => {
    const { status, repo } = request.query as { status?: string; repo?: string };

    const conditions = [];
    if (status) conditions.push(eq(rufloSessions.status, status as 'ACTIVE' | 'NEEDS_SPEC' | 'COMPLETE' | 'ERROR'));
    if (repo) conditions.push(eq(rufloSessions.repo, repo));

    const sessions = await db.query.rufloSessions.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      with: {
        completedTasks: true,
      },
      orderBy: [asc(rufloSessions.status), desc(rufloSessions.updatedAt)],
    });

    return sessions;
  });

  // POST /api/fleet/sessions - Create a new session
  app.post('/api/fleet/sessions', async (request, reply) => {
    const {
      repo,
      linearTicketId,
      ticketTitle,
      currentWorkstream,
      estimatedRemainingMinutes,
      inFlightFiles: inFlightFilePaths = [],
    } = request.body as {
      repo: string;
      linearTicketId: string;
      ticketTitle: string;
      currentWorkstream?: string;
      estimatedRemainingMinutes?: number;
      inFlightFiles?: string[];
    };

    if (!repo || !linearTicketId || !ticketTitle) {
      reply.status(400).send({ error: 'repo, linearTicketId, and ticketTitle are required' });
      return;
    }

    const [session] = await db.insert(rufloSessions).values({
      repo,
      linearTicketId,
      ticketTitle,
      currentWorkstream: currentWorkstream || 'Main',
      status: 'ACTIVE',
      progressPercent: 0,
      elapsedMinutes: 0,
      estimatedRemainingMinutes: estimatedRemainingMinutes || 30,
      inFlightFiles: inFlightFilePaths,
    }).returning();

    for (const filePath of inFlightFilePaths) {
      await db.insert(inFlightFiles).values({
        path: filePath,
        activeSessionId: session.id,
        linearTicketId,
        estimatedMinutesRemaining: estimatedRemainingMinutes || 30,
      });
    }

    await db.insert(activityEvents).values({
      type: 'ITEM_DISPATCHED',
      message: `Session started: "${ticketTitle}"`,
      repo,
      ticketId: linearTicketId,
      metadata: { sessionId: session.id },
    });

    const sessionWithRelations = await db.query.rufloSessions.findFirst({
      where: eq(rufloSessions.id, session.id),
      with: {
        completedTasks: true,
      },
    });

    reply.status(201).send(sessionWithRelations);
  });

  // GET /api/fleet/state - Get full fleet state
  app.get('/api/fleet/state', async (request, reply) => {
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

    const allInFlightFiles = await db.query.inFlightFiles.findMany();

    const totalEstimatedMinutes = sessions.reduce(
      (sum, s) => sum + s.estimatedRemainingMinutes,
      0
    );

    const readyItemsList = await db.query.horizonItems.findMany({
      where: eq(horizonItems.zone, 'READY'),
    });
    const readyItems = readyItemsList.length;

    const refiningItemsList = await db.query.horizonItems.findMany({
      where: eq(horizonItems.zone, 'REFINING'),
    });
    const refiningItems = refiningItemsList.length;

    const maxSessions = 8;
    const activeSessions = sessions.filter((s) => s.status === 'ACTIVE').length;
    const fleetUtilization = Math.round((activeSessions / maxSessions) * 100);

    const avgCompletionMinutes = 45;
    const runwayMinutes =
      readyItems * avgCompletionMinutes +
      totalEstimatedMinutes +
      refiningItems * avgCompletionMinutes * 0.5;

    let runwayStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';
    const runwayHours = runwayMinutes / 60;
    if (runwayHours < 2) {
      runwayStatus = 'CRITICAL';
    } else if (runwayHours < 8) {
      runwayStatus = 'WARNING';
    }

    const recentEvents = await db.query.activityEvents.findMany({
      orderBy: desc(activityEvents.createdAt),
      limit: 10,
    });

    const score = await db.query.conductorScores.findFirst({
      orderBy: desc(conductorScores.updatedAt),
    });

    return {
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
    };
  });

  // POST /api/fleet/dispatch/:itemId - Dispatch an item to the fleet
  app.post('/api/fleet/dispatch/:itemId', async (request, reply) => {
    const { itemId } = request.params as { itemId: string };

    const item = await db.query.horizonItems.findFirst({
      where: eq(horizonItems.id, itemId),
      with: {
        plan: {
          with: {
            workstreams: {
              with: { tasks: true },
            },
            filesTouched: true,
          },
        },
      },
    });

    if (!item) {
      reply.status(404).send({ error: 'Item not found' });
      return;
    }

    if (item.zone !== 'READY') {
      reply.status(400).send({ error: 'Item must be in READY zone to dispatch' });
      return;
    }

    if (!item.plan) {
      reply.status(400).send({ error: 'Item must have an approved plan to dispatch' });
      return;
    }

    const sortedWorkstreams = [...item.plan.workstreams].sort(
      (a, b) => a.orderIndex - b.orderIndex
    );

    const totalTasks = item.plan.workstreams.reduce(
      (sum, ws) => sum + ws.tasks.length,
      0
    );
    const estimatedMinutes = totalTasks * 15;

    const filePaths = item.plan.filesTouched.map((f) => f.path);

    const [session] = await db.insert(rufloSessions).values({
      repo: item.repo,
      linearTicketId: item.linearTicketId || `DP-${Date.now()}`,
      ticketTitle: item.title,
      currentWorkstream: sortedWorkstreams[0]?.label || 'Main',
      status: 'ACTIVE',
      progressPercent: 0,
      elapsedMinutes: 0,
      estimatedRemainingMinutes: estimatedMinutes,
      inFlightFiles: filePaths,
    }).returning();

    // Dispatch to orchestrator if configured
    const orchestrator = getOrchestratorServiceOrNull();
    if (orchestrator && orchestrator.isEnabled) {
      const dispatchRequest = buildDispatchRequest({
        sessionId: session.id,
        repo: item.repo,
        title: item.title,
        filePaths,
        model: 'sonnet',
        workstream: sortedWorkstreams[0]?.label,
        linearTicketId: session.linearTicketId,
        callbackUrl: '', // Will use the one from orchestrator config
        estimatedMinutes,
      });

      const dispatchResult = await orchestrator.dispatch(dispatchRequest);

      if (dispatchResult.accepted && dispatchResult.orchestratorJobId) {
        // Update session with external job ID
        await db.update(rufloSessions)
          .set({
            externalSessionId: dispatchResult.orchestratorJobId,
            orchestratorMode: dispatchResult.mode,
          })
          .where(eq(rufloSessions.id, session.id));

        await db.insert(activityEvents).values({
          type: 'ITEM_DISPATCHED',
          message: `Orchestrator accepted: ${dispatchResult.orchestratorJobId}`,
          repo: item.repo,
          ticketId: session.linearTicketId,
          metadata: {
            sessionId: session.id,
            externalJobId: dispatchResult.orchestratorJobId,
            mode: dispatchResult.mode,
          },
        });
      } else if (!dispatchResult.accepted) {
        // Log dispatch failure but don't fail the request
        await db.insert(activityEvents).values({
          type: 'ITEM_DISPATCHED',
          message: `Orchestrator dispatch failed: ${dispatchResult.error}`,
          repo: item.repo,
          ticketId: session.linearTicketId,
          metadata: {
            sessionId: session.id,
            error: dispatchResult.error,
          },
        });
      }
    }

    for (const file of item.plan.filesTouched) {
      await db.insert(inFlightFiles).values({
        path: file.path,
        activeSessionId: session.id,
        linearTicketId: session.linearTicketId,
        estimatedMinutesRemaining: estimatedMinutes,
        horizonItemId: itemId,
      });

      await db.update(touchedFiles)
        .set({
          status: 'IN_FLIGHT',
          inFlightVia: session.id,
        })
        .where(eq(touchedFiles.id, file.id));
    }

    await db.delete(horizonItems).where(eq(horizonItems.id, itemId));

    await db.insert(activityEvents).values({
      type: 'ITEM_DISPATCHED',
      message: `Dispatched "${item.title}" to fleet`,
      repo: item.repo,
      ticketId: session.linearTicketId,
      metadata: {
        sessionId: session.id,
        itemId,
        estimatedMinutes,
        workstreams: item.plan.workstreams.length,
        tasks: totalTasks,
      },
    });

    const score = await db.query.conductorScores.findFirst();
    if (score) {
      await db.update(conductorScores)
        .set({
          velocityTrend: Math.min(200, score.velocityTrend + 5),
          total: Math.min(1000, score.total + 10),
        })
        .where(eq(conductorScores.id, score.id));

      await db.insert(activityEvents).values({
        type: 'SCORE_UPDATE',
        message: `Score +10 for dispatching work`,
        metadata: { delta: 10, reason: 'dispatch' },
      });
    }

    const sessionWithRelations = await db.query.rufloSessions.findFirst({
      where: eq(rufloSessions.id, session.id),
      with: {
        completedTasks: true,
      },
    });

    return {
      session: sessionWithRelations,
      message: `Successfully dispatched "${item.title}" to fleet`,
    };
  });
}
