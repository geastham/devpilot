import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createHash } from 'crypto';
import { getBridgeDb } from '../../db';
import { orchestrators, repoRoutes, apiKeys } from '../../db/schema';
import { eq } from 'drizzle-orm';

interface RegisterBody {
  name: string;
  repos: string[];
  maxConcurrentJobs?: number;
}

interface HeartbeatBody {
  activeJobs?: number;
}

function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return 'dp_orch_' + Buffer.from(bytes).toString('base64url');
}

export async function registerOrchestratorRoutes(app: FastifyInstance) {
  const db = getBridgeDb();

  // POST /api/orchestrators/register - Register a new orchestrator
  app.post('/api/orchestrators/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as RegisterBody;

    if (!body.name || !body.repos || body.repos.length === 0) {
      return reply.status(400).send({ error: 'name and repos are required' });
    }

    const apiKey = generateApiKey();
    const keyHash = hashApiKey(apiKey);

    const [orchestrator] = await db.insert(orchestrators).values({
      name: body.name,
      apiKeyHash: keyHash,
      repos: body.repos,
      maxConcurrentJobs: body.maxConcurrentJobs || 4,
      isOnline: true,
      lastHeartbeat: new Date(),
    }).returning();

    // Create repo routes
    for (const repo of body.repos) {
      await db.insert(repoRoutes).values({
        repo,
        orchestratorId: orchestrator.id,
        priority: 0,
      }).onConflictDoUpdate({
        target: repoRoutes.repo,
        set: { orchestratorId: orchestrator.id },
      });
    }

    // Create API key record
    await db.insert(apiKeys).values({
      keyHash,
      orchestratorId: orchestrator.id,
      name: `${body.name} API Key`,
      scopes: ['dispatch', 'status', 'heartbeat'],
    });

    return {
      orchestratorId: orchestrator.id,
      apiKey,
      message: 'Orchestrator registered successfully',
    };
  });

  // POST /api/orchestrators/:id/heartbeat - Send heartbeat
  app.post('/api/orchestrators/:id/heartbeat', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as HeartbeatBody || {};

    const [updated] = await db.update(orchestrators)
      .set({
        isOnline: true,
        lastHeartbeat: new Date(),
        activeJobs: body.activeJobs ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(orchestrators.id, id))
      .returning();

    if (!updated) {
      return reply.status(404).send({ error: 'Orchestrator not found' });
    }

    return { status: 'ok', lastHeartbeat: updated.lastHeartbeat };
  });

  // GET /api/orchestrators/:id - Get orchestrator details
  app.get('/api/orchestrators/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const orchestrator = await db.query.orchestrators.findFirst({
      where: eq(orchestrators.id, id),
    });

    if (!orchestrator) {
      return reply.status(404).send({ error: 'Orchestrator not found' });
    }

    // Don't expose the API key hash
    const { apiKeyHash, ...safe } = orchestrator;
    return safe;
  });

  // DELETE /api/orchestrators/:id - Deregister orchestrator
  app.delete('/api/orchestrators/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    await db.delete(repoRoutes).where(eq(repoRoutes.orchestratorId, id));
    await db.delete(apiKeys).where(eq(apiKeys.orchestratorId, id));
    await db.delete(orchestrators).where(eq(orchestrators.id, id));

    return { status: 'deleted' };
  });
}
