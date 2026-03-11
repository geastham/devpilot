import Fastify, { FastifyInstance } from 'fastify';
import { initDatabase, SQLiteDatabase } from '@devpilot/core/db';
import {
  initOrchestratorService,
  initStatusPoller,
  getOrchestratorServiceOrNull,
  getStatusPollerOrNull,
  type OrchestratorAdapterConfig,
  type OrchestratorMode,
} from '@devpilot/core/orchestrator';
import { registerItemRoutes } from './api/items';
import { registerFleetRoutes } from './api/fleet';
import { registerScoreRoutes } from './api/score';
import { registerEventRoutes } from './api/events';

export interface ServerOptions {
  port: number;
  dbPath: string;
  host?: string;
  orchestrator?: {
    mode: OrchestratorMode;
    aoProjectName?: string;
    aoPath?: string;
    httpUrl?: string;
    apiKey?: string;
  };
}

// Shared database instance for API routes
let db: SQLiteDatabase;

export function getDb(): SQLiteDatabase {
  return db;
}

export async function createServer(options: ServerOptions): Promise<FastifyInstance> {
  // Initialize database and cast to SQLite type (CLI only supports SQLite)
  db = initDatabase({
    type: 'sqlite',
    sqlitePath: options.dbPath,
  }) as SQLiteDatabase;

  // Initialize orchestrator service if configured
  if (options.orchestrator && options.orchestrator.mode !== 'disabled') {
    const orchestratorConfig: OrchestratorAdapterConfig = {
      mode: options.orchestrator.mode,
      aoProjectName: options.orchestrator.aoProjectName,
      aoPath: options.orchestrator.aoPath,
      url: options.orchestrator.httpUrl,
      apiKey: options.orchestrator.apiKey,
      callbackUrl: `http://127.0.0.1:${options.port}/api/fleet/callback`,
    };

    const orchestrator = initOrchestratorService(orchestratorConfig);

    // Initialize status poller with callbacks to update database
    initStatusPoller(orchestrator, {
      pollIntervalMs: 5000,
      onStatusUpdate: async (sessionId, status) => {
        // Update session in database
        const { rufloSessions } = await import('@devpilot/core/db');
        const { eq } = await import('drizzle-orm');
        await db.update(rufloSessions)
          .set({
            progressPercent: status.progressPercent,
            status: status.status === 'running' ? 'ACTIVE' :
                    status.status === 'complete' ? 'COMPLETE' :
                    status.status === 'error' ? 'ERROR' : 'ACTIVE',
            updatedAt: new Date(),
          })
          .where(eq(rufloSessions.id, sessionId));
      },
      onComplete: async (sessionId, report) => {
        const { rufloSessions, activityEvents } = await import('@devpilot/core/db');
        const { eq } = await import('drizzle-orm');
        await db.update(rufloSessions)
          .set({
            status: report.success ? 'COMPLETE' : 'ERROR',
            progressPercent: 100,
            prUrl: report.prUrl,
            tokensUsed: report.tokensUsed,
            costUsd: Math.round(report.costUsd * 100), // Store as cents
            updatedAt: new Date(),
          })
          .where(eq(rufloSessions.id, sessionId));

        await db.insert(activityEvents).values({
          type: 'SESSION_COMPLETE',
          message: report.success
            ? `Session completed: ${report.summary}`
            : `Session failed: ${report.error?.message || 'Unknown error'}`,
          metadata: { sessionId, prUrl: report.prUrl },
        });
      },
      onError: async (sessionId, error) => {
        const { rufloSessions, activityEvents } = await import('@devpilot/core/db');
        const { eq } = await import('drizzle-orm');
        await db.update(rufloSessions)
          .set({
            status: 'ERROR',
            updatedAt: new Date(),
          })
          .where(eq(rufloSessions.id, sessionId));

        await db.insert(activityEvents).values({
          type: 'SESSION_COMPLETE',
          message: `Session error: ${error.message}`,
          metadata: { sessionId, error: error.message },
        });
      },
    });

    console.log(`Orchestrator initialized in ${options.orchestrator.mode} mode`);
  }

  const app = Fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname',
          translateTime: 'HH:MM:ss',
        },
      },
    },
  });

  // CORS for local development
  app.addHook('preHandler', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type');

    if (request.method === 'OPTIONS') {
      reply.status(204).send();
    }
  });

  // Register API routes
  await registerItemRoutes(app);
  await registerFleetRoutes(app);
  await registerScoreRoutes(app);
  await registerEventRoutes(app);

  // Health check
  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  return app;
}

export async function startServer(options: ServerOptions): Promise<{ url: string; close: () => Promise<void> }> {
  const app = await createServer(options);

  const host = options.host || '127.0.0.1';
  await app.listen({ port: options.port, host });

  const url = `http://${host}:${options.port}`;

  return {
    url,
    close: async () => {
      await app.close();
    },
  };
}
