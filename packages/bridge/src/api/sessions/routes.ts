import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getBridgeDb } from '../../db';
import { dispatchSessions, sessionEvents } from '../../db/schema';
import { eq } from 'drizzle-orm';

interface StatusUpdateBody {
  status: string;
  progressPercent: number;
  message?: string;
}

interface CompleteBody {
  success: boolean;
  prUrl?: string;
  summary: string;
  tokensUsed: number;
  costUsd: number;
  errorMessage?: string;
}

export async function registerSessionRoutes(app: FastifyInstance) {
  const db = getBridgeDb();

  // POST /api/sessions/:id/status - Update session status
  app.post('/api/sessions/:id/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as StatusUpdateBody;

    const [updated] = await db.update(dispatchSessions)
      .set({
        status: body.status as any,
        progressPercent: body.progressPercent,
        updatedAt: new Date(),
      })
      .where(eq(dispatchSessions.id, id))
      .returning();

    if (!updated) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    // Log progress event
    await db.insert(sessionEvents).values({
      sessionId: id,
      type: 'progress',
      message: body.message || `Progress: ${body.progressPercent}%`,
      metadata: { status: body.status, progressPercent: body.progressPercent },
    });

    return { status: 'updated', session: updated };
  });

  // POST /api/sessions/:id/complete - Mark session complete
  app.post('/api/sessions/:id/complete', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as CompleteBody;

    const [updated] = await db.update(dispatchSessions)
      .set({
        status: body.success ? 'complete' : 'error',
        progressPercent: 100,
        prUrl: body.prUrl,
        summary: body.summary,
        tokensUsed: body.tokensUsed,
        costUsd: body.costUsd,
        errorMessage: body.errorMessage,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(dispatchSessions.id, id))
      .returning();

    if (!updated) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    // Log completion event
    await db.insert(sessionEvents).values({
      sessionId: id,
      type: body.success ? 'complete' : 'error',
      message: body.success ? body.summary : body.errorMessage,
      metadata: {
        prUrl: body.prUrl,
        tokensUsed: body.tokensUsed,
        costUsd: body.costUsd,
      },
    });

    // TODO: Update Linear issue status
    // TODO: Publish telemetry event

    return { status: 'completed', session: updated };
  });

  // GET /api/sessions/:id - Get session details
  app.get('/api/sessions/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const session = await db.query.dispatchSessions.findFirst({
      where: eq(dispatchSessions.id, id),
    });

    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    return session;
  });
}
