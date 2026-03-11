import Fastify, { FastifyInstance } from 'fastify';
import { initDatabase, SQLiteDatabase } from '@devpilot/core/db';
import { registerItemRoutes } from './api/items';
import { registerFleetRoutes } from './api/fleet';
import { registerScoreRoutes } from './api/score';
import { registerEventRoutes } from './api/events';

export interface ServerOptions {
  port: number;
  dbPath: string;
  host?: string;
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
