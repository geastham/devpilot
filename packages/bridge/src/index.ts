import Fastify from 'fastify';
import { loadConfig } from './config';
import { initBridgeDatabase } from './db';
import { registerWebhookRoutes } from './api/webhooks';
import { registerOrchestratorRoutes } from './api/orchestrators';
import { registerSessionRoutes } from './api/sessions';
import { initPubSubService } from './services/pubsub';

async function start() {
  const config = loadConfig();
  const app = Fastify({ logger: true });

  // Initialize database if configured
  if (process.env.DATABASE_URL) {
    initBridgeDatabase(process.env.DATABASE_URL);
    app.log.info('Database initialized');
  }

  // Initialize Pub/Sub if configured
  if (config.GCP_PROJECT_ID) {
    initPubSubService({
      projectId: config.GCP_PROJECT_ID,
      dispatchTopicName: config.PUBSUB_TOPIC_DISPATCH,
      telemetryTopicName: 'devpilot-telemetry',
    });
    app.log.info('Pub/Sub service initialized');
  }

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Register API routes
  await registerWebhookRoutes(app);
  await registerOrchestratorRoutes(app);
  await registerSessionRoutes(app);

  // Start server
  const port = parseInt(config.PORT, 10);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Bridge service listening on port ${port}`);
}

start().catch((err) => {
  console.error('Failed to start bridge service:', err);
  process.exit(1);
});
