import { Command } from 'commander';
import chalk from 'chalk';

export const statusCommand = new Command('status')
  .description('Check bridge connection status')
  .option('-u, --bridge-url <url>', 'Bridge service URL', process.env.DEVPILOT_BRIDGE_URL)
  .option('-i, --orchestrator-id <id>', 'Orchestrator ID')
  .option('-k, --api-key <key>', 'API key', process.env.DEVPILOT_BRIDGE_API_KEY)
  .action(async (options) => {
    if (!options.bridgeUrl) {
      console.error(chalk.red('✗ Error: Bridge URL required'));
      console.error(chalk.gray('   Use: devpilot bridge status -u <url>'));
      process.exit(1);
    }

    console.log(chalk.cyan('🌉 DevPilot Bridge Status'));
    console.log('');

    try {
      // Check bridge health
      const healthRes = await fetch(`${options.bridgeUrl}/health`);
      const health = await healthRes.json();

      console.log(chalk.white('Bridge Status:'));
      if (health.status === 'ok') {
        console.log(chalk.gray('  Status: ') + chalk.green('✓ Online'));
      } else {
        console.log(chalk.gray('  Status: ') + chalk.red('✗ Offline'));
      }
      console.log('');

      // Check orchestrator status if ID provided
      if (options.orchestratorId) {
        const orchRes = await fetch(
          `${options.bridgeUrl}/api/orchestrators/${options.orchestratorId}`,
          {
            headers: {
              'Authorization': `Bearer ${options.apiKey}`,
            },
          }
        );

        if (orchRes.ok) {
          const orch = await orchRes.json();
          console.log(chalk.white('Orchestrator Status:'));
          console.log(chalk.gray('  ID: ') + chalk.cyan(orch.id));
          console.log(chalk.gray('  Name: ') + chalk.white(orch.name));

          if (orch.isOnline) {
            console.log(chalk.gray('  Online: ') + chalk.green('✓'));
          } else {
            console.log(chalk.gray('  Online: ') + chalk.red('✗'));
          }

          console.log(chalk.gray('  Active Jobs: ') + chalk.yellow(orch.activeJobs));
          console.log(chalk.gray('  Last Heartbeat: ') + chalk.white(orch.lastHeartbeat || 'Never'));
          console.log(chalk.gray('  Repos: ') + chalk.cyan(orch.repos?.join(', ') || 'None'));
        } else {
          console.log(chalk.white('Orchestrator Status:'));
          console.log(chalk.gray('  ') + chalk.red('Not found or unauthorized'));
        }
      }
    } catch (error) {
      console.error(chalk.red('✗ Error checking status:'));
      console.error(chalk.red(`   ${error instanceof Error ? error.message : error}`));
      process.exit(1);
    }
  });
