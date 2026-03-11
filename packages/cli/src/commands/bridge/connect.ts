import { Command } from 'commander';
import chalk from 'chalk';
import { BridgeClient, HeartbeatService, PubSubSubscriber } from '@devpilot/bridge-client';

interface ConnectOptions {
  bridgeUrl: string;
  apiKey?: string;
  repos?: string;
  project?: string;
}

export const connectCommand = new Command('connect')
  .description('Connect to DevPilot cloud bridge')
  .option('-u, --bridge-url <url>', 'Bridge service URL', process.env.DEVPILOT_BRIDGE_URL)
  .option('-k, --api-key <key>', 'API key for authentication', process.env.DEVPILOT_BRIDGE_API_KEY)
  .option('-r, --repos <repos>', 'Comma-separated list of repos to handle')
  .option('-p, --project <project>', 'GCP project ID for Pub/Sub', process.env.GCP_PROJECT_ID)
  .action(async (options: ConnectOptions) => {
    if (!options.bridgeUrl) {
      console.error(chalk.red('✗ Error: Bridge URL is required (--bridge-url or DEVPILOT_BRIDGE_URL)'));
      process.exit(1);
    }

    console.log(chalk.cyan('🌉 Connecting to DevPilot Bridge'));
    console.log('');
    console.log(chalk.gray(`   Bridge URL: ${options.bridgeUrl}`));
    console.log('');

    const client = new BridgeClient({
      bridgeUrl: options.bridgeUrl,
      apiKey: options.apiKey || '',
      gcpProjectId: options.project,
    });

    try {
      // Register with bridge
      const repos = options.repos?.split(',').map(r => r.trim()) || [];
      const result = await client.register({
        repos,
        maxConcurrentJobs: 4,
      });

      console.log(chalk.green('✓ Registered with bridge'));
      console.log(chalk.gray(`   Orchestrator ID: ${result.orchestratorId}`));
      console.log(chalk.gray(`   Repos: ${repos.join(', ') || 'None specified'}`));
      console.log('');

      // Start heartbeat
      const heartbeat = new HeartbeatService({
        bridgeUrl: options.bridgeUrl,
        apiKey: options.apiKey || '',
        orchestratorId: result.orchestratorId,
        intervalMs: 30000,
      });
      heartbeat.start();
      console.log(chalk.green('✓ Heartbeat service started'));
      console.log('');

      // Start Pub/Sub subscriber if project is configured
      if (options.project) {
        const subscriber = new PubSubSubscriber({
          projectId: options.project,
          subscriptionName: `devpilot-dispatch-${result.orchestratorId}`,
          onMessage: async (message) => {
            console.log(chalk.blue(`📨 Received dispatch: ${message.linearIdentifier} - ${message.title}`));
            // TODO: Trigger local orchestrator dispatch
          },
        });
        await subscriber.start();
        console.log(chalk.green('✓ Pub/Sub subscriber started'));
        console.log('');
      }

      console.log(chalk.cyan('Connected to bridge. Press Ctrl+C to disconnect.'));
      console.log('');

      // Keep process alive
      process.on('SIGINT', () => {
        console.log('');
        console.log(chalk.yellow('Disconnecting from bridge...'));
        heartbeat.stop();
        console.log(chalk.green('✓ Disconnected'));
        process.exit(0);
      });

      process.on('SIGTERM', () => {
        heartbeat.stop();
        process.exit(0);
      });

      // Keep the process running
      await new Promise(() => {});
    } catch (error) {
      console.error(chalk.red('✗ Failed to connect:'));
      console.error(chalk.red(`   ${error instanceof Error ? error.message : error}`));
      process.exit(1);
    }
  });
