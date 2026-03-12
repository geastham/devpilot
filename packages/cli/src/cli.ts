import { Command } from 'commander';
import updateNotifier from 'update-notifier';
import { VERSION } from './version';

// Import commands
import { initCommand } from './commands/init';
import { serveCommand } from './commands/serve';
import { statusCommand } from './commands/status';
import { configCommand } from './commands/config';
import { setupCommand } from './commands/setup';
import { bridgeCommand } from './commands/bridge';
import { updateCommand } from './commands/update';
import { benchCommand } from '@devpilot.sh/benchmarks/cli';

// Package info for update-notifier
const pkg = {
  name: '@devpilot.sh/cli',
  version: VERSION,
};

export const cli = new Command();

cli
  .name('devpilot')
  .description('DevPilot CLI - Manage your AI coding agent fleet')
  .version(VERSION);

// Register commands
cli.addCommand(initCommand);
cli.addCommand(setupCommand);
cli.addCommand(serveCommand);
cli.addCommand(statusCommand);
cli.addCommand(configCommand);
cli.addCommand(bridgeCommand);
cli.addCommand(updateCommand);
cli.addCommand(benchCommand);

export function runCli(args: string[] = process.argv): void {
  // Check for updates in background (non-blocking)
  // Notifies user if update is available (checks once per day by default)
  const notifier = updateNotifier({
    pkg,
    updateCheckInterval: 1000 * 60 * 60 * 24, // 24 hours
  });

  // Show update notification if available
  // This displays after CLI execution completes
  notifier.notify({
    message: `Update available: {currentVersion} → {latestVersion}
Run {updateCommand} to update`,
    boxenOptions: {
      padding: 1,
      margin: 1,
      borderColor: 'cyan',
      borderStyle: 'round',
    },
  });

  cli.parse(args);
}
