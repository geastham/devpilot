import Fastify, { FastifyInstance } from 'fastify';
import { initDatabase, SQLiteDatabase } from '@devpilot.sh/core/db';
import {
  initOrchestratorService,
  initStatusPoller,
  getOrchestratorServiceOrNull,
  getStatusPollerOrNull,
  createDbStatusPollerCallbacks,
  type OrchestratorAdapterConfig,
  type OrchestratorMode,
} from '@devpilot.sh/core/orchestrator';
import { initExecutionBridge, type WaveExecutionConfig } from '@devpilot.sh/core/wave-planner';
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
    sessionApiUrl?: string;
    sessionApiKey?: string;
    sessionEnvironmentId?: string;
    callbackToken?: string;
  };
}

/** Wave execution config from env, mirroring the Next app's getWaveExecutionConfig(). */
function waveExecutionConfigFromEnv(port: number): WaveExecutionConfig {
  const failurePolicy =
    process.env.DEVPILOT_WAVE_FAILURE_POLICY === 'continue' ? 'continue' : 'halt';
  return {
    maxConcurrentSubagents: Number(process.env.DEVPILOT_WAVE_MAX_CONCURRENT) || 4,
    maxTotalActiveTasks: Number(process.env.DEVPILOT_WAVE_MAX_TOTAL) || 8,
    subagentDispatchDelayMs: 500,
    waveAdvanceDelayMs: 2000,
    retryLimit: Number(process.env.DEVPILOT_WAVE_RETRY_LIMIT) || 1,
    failurePolicy,
    autoAdvance: process.env.DEVPILOT_WAVE_AUTO_ADVANCE !== 'false',
    callbackUrl: `http://127.0.0.1:${port}/api/orchestrator`,
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
      sessionApiUrl: options.orchestrator.sessionApiUrl,
      sessionApiKey: options.orchestrator.sessionApiKey,
      sessionEnvironmentId: options.orchestrator.sessionEnvironmentId,
      callbackToken: options.orchestrator.callbackToken,
      callbackUrl: `http://127.0.0.1:${options.port}/api/orchestrator`,
    };

    const orchestrator = initOrchestratorService(orchestratorConfig);

    // Status poller updates session-level rows (shared with the Next host).
    initStatusPoller(orchestrator, {
      pollIntervalMs: 5000,
      ...createDbStatusPollerCallbacks(),
    });

    // ExecutionBridge correlates job:* events to wave tasks and advances the loop.
    initExecutionBridge(orchestrator, {
      execution: waveExecutionConfigFromEnv(options.port),
    }).start();

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
