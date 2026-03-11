import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createHmac, timingSafeEqual } from 'crypto';
import { getBridgeDb } from '../../db';
import { workspaces, dispatchSessions, sessionEvents, teamConfigs } from '../../db/schema';
import { eq, and } from 'drizzle-orm';

interface LinearWebhookPayload {
  action: string;
  type: string;
  data: {
    id: string;
    identifier?: string;
    title?: string;
    description?: string;
    teamId?: string;
    priority?: number;
    labelIds?: string[];
    assigneeId?: string;
    state?: { name: string };
  };
  organizationId: string;
}

function verifySignature(payload: string, signature: string, secret: string): boolean {
  if (!signature.startsWith('sha256=')) {
    return false;
  }
  const hash = signature.slice(7);
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

export async function registerWebhookRoutes(app: FastifyInstance) {
  // Add raw body support for signature verification
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    try {
      const json = JSON.parse(body as string);
      (req as any).rawBody = body;
      done(null, json);
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  app.post('/api/webhooks/linear', async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = request.body as LinearWebhookPayload;
    const rawBody = (request as any).rawBody as string;
    const signature = request.headers['linear-signature'] as string;

    if (!payload.organizationId) {
      return reply.status(400).send({ error: 'Missing organizationId' });
    }

    // Find workspace by Linear org ID
    const db = getBridgeDb();
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.linearOrgId, payload.organizationId),
    });

    if (!workspace) {
      return reply.status(404).send({ error: 'Workspace not found' });
    }

    // Verify signature
    if (signature && workspace.webhookSecret) {
      const isValid = verifySignature(rawBody, signature, workspace.webhookSecret);
      if (!isValid) {
        return reply.status(401).send({ error: 'Invalid signature' });
      }
    }

    // Check if this is a bot assignment
    if (payload.action === 'update' &&
        payload.type === 'Issue' &&
        payload.data.assigneeId === workspace.botUserId) {

      // Check team config for auto-dispatch
      const teamConfig = await db.query.teamConfigs.findFirst({
        where: and(
          eq(teamConfigs.workspaceId, workspace.id),
          eq(teamConfigs.linearTeamId, payload.data.teamId || '')
        ),
      });

      if (teamConfig?.autoDispatchEnabled !== false) {
        // Create dispatch session
        const [session] = await db.insert(dispatchSessions).values({
          workspaceId: workspace.id,
          linearIssueId: payload.data.id,
          linearIdentifier: payload.data.identifier || payload.data.id,
          title: payload.data.title || 'Untitled',
          repo: teamConfig?.defaultRepo || 'unknown',
          status: 'pending',
        }).returning();

        // Log event
        await db.insert(sessionEvents).values({
          sessionId: session.id,
          type: 'created',
          message: `Issue ${payload.data.identifier} assigned to DevPilot bot`,
          metadata: {
            linearIssueId: payload.data.id,
            teamId: payload.data.teamId,
          },
        });

        // TODO: Publish to Pub/Sub for dispatch
        // const pubsub = getPubSubService();
        // await pubsub.publishTaskDispatch({ ... });

        return {
          handled: true,
          action: 'dispatch_created',
          sessionId: session.id,
        };
      }
    }

    return { handled: true, action: 'ignored' };
  });
}
