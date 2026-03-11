import { Command } from 'commander';
import chalk from 'chalk';

export const disconnectCommand = new Command('disconnect')
  .description('Disconnect from DevPilot cloud bridge')
  .option('-u, --bridge-url <url>', 'Bridge service URL', process.env.DEVPILOT_BRIDGE_URL)
  .option('-k, --api-key <key>', 'API key', process.env.DEVPILOT_BRIDGE_API_KEY)
  .option('-i, --orchestrator-id <id>', 'Orchestrator ID to disconnect')
  .action(async (options) => {
    if (!options.bridgeUrl || !options.orchestratorId) {
      console.error(chalk.red('✗ Error: Bridge URL and orchestrator ID required'));
      console.error(chalk.gray('   Use: devpilot bridge disconnect -u <url> -i <orchestrator-id>'));
      process.exit(1);
    }

    console.log(chalk.cyan('🌉 Disconnecting from DevPilot Bridge'));
    console.log('');
    console.log(chalk.gray(`   Bridge URL: ${options.bridgeUrl}`));
    console.log(chalk.gray(`   Orchestrator ID: ${options.orchestratorId}`));
    console.log('');

    try {
      const response = await fetch(
        `${options.bridgeUrl}/api/orchestrators/${options.orchestratorId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${options.apiKey}`,
          },
        }
      );

      if (response.ok) {
        console.log(chalk.green('✓ Successfully disconnected from bridge'));
      } else {
        const errorText = await response.text();
        console.error(chalk.red('✗ Failed to disconnect:'));
        console.error(chalk.red(`   ${errorText}`));
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red('✗ Error disconnecting:'));
      console.error(chalk.red(`   ${error instanceof Error ? error.message : error}`));
      process.exit(1);
    }
  });
