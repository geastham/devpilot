import { FastifyInstance } from 'fastify';
import { activityEvents, rufloSessions } from '@devpilot.sh/core/db';
import { eq, and, gt, desc, asc } from 'drizzle-orm';
import { getDb } from '../index';

export async function registerEventRoutes(app: FastifyInstance) {
  const db = getDb();

  // GET /api/events - Get recent activity events
  app.get('/api/events', async (request, reply) => {
    const { limit = '50', type, repo, after } = request.query as {
      limit?: string;
      type?: string;
      repo?: string;
      after?: string;
    };

    const numLimit = Math.min(parseInt(limit, 10), 100);

    const conditions = [];
    if (type) conditions.push(eq(activityEvents.type, type as any));
    if (repo) conditions.push(eq(activityEvents.repo, repo));
    if (after) conditions.push(gt(activityEvents.createdAt, new Date(after)));

    const events = await db.query.activityEvents.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: desc(activityEvents.createdAt),
      limit: numLimit,
    });

    return {
      events,
      count: events.length,
      hasMore: events.length === numLimit,
    };
  });

  // POST /api/events - Create a new activity event
  app.post('/api/events', async (request, reply) => {
    const { type, message, repo, ticketId, metadata } = request.body as {
      type: string;
      message: string;
      repo?: string;
      ticketId?: string;
      metadata?: Record<string, unknown>;
    };

    if (!type || !message) {
      reply.status(400).send({ error: 'type and message are required' });
      return;
    }

    const [event] = await db.insert(activityEvents).values({
      type: type as any,
      message,
      repo,
      ticketId,
      metadata,
    }).returning();

    reply.status(201).send(event);
  });

  // GET /api/events/stream - Server-Sent Events stream
  app.get('/api/events/stream', async (request, reply) => {
    // Set headers for SSE
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    // Send initial connection message
    reply.raw.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

    let lastEventId: string | null = null;
    let isActive = true;

    // Poll for new events every 2 seconds
    const pollInterval = setInterval(async () => {
      if (!isActive) {
        clearInterval(pollInterval);
        return;
      }

      try {
        // Get new events since last check
        const events = await db.query.activityEvents.findMany({
          where: lastEventId
            ? gt(activityEvents.id, lastEventId)
            : gt(activityEvents.createdAt, new Date(Date.now() - 5000)),
          orderBy: asc(activityEvents.createdAt),
          limit: 20,
        });

        if (events.length > 0) {
          lastEventId = events[events.length - 1].id;

          for (const event of events) {
            const sseData = {
              id: event.id,
              type: event.type,
              message: event.message,
              repo: event.repo,
              ticketId: event.ticketId,
              metadata: event.metadata,
              createdAt: event.createdAt,
            };
            reply.raw.write(`data: ${JSON.stringify(sseData)}\n\n`);
          }
        }

        // Get updated fleet state
        const sessions = await db.query.rufloSessions.findMany({
          where: eq(rufloSessions.status, 'ACTIVE'),
        });

        // Send fleet heartbeat every poll
        reply.raw.write(
          `data: ${JSON.stringify({
            type: 'fleet_heartbeat',
            sessions: sessions.map((s) => ({
              id: s.id,
              progress: s.progressPercent,
              status: s.status,
              eta: s.estimatedRemainingMinutes,
            })),
            timestamp: new Date().toISOString(),
          })}\n\n`
        );
      } catch (error) {
        console.error('SSE poll error:', error);
        reply.raw.write(
          `data: ${JSON.stringify({ type: 'error', message: 'Poll failed' })}\n\n`
        );
      }
    }, 2000);

    // Handle client disconnect
    request.raw.on('close', () => {
      isActive = false;
      clearInterval(pollInterval);
    });

    // Keep connection alive
    return reply;
  });
}
