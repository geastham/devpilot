import { Command } from 'commander';
import { VERSION } from './version';

// Import commands
import { initCommand } from './commands/init';
import { serveCommand } from './commands/serve';
import { statusCommand } from './commands/status';
import { configCommand } from './commands/config';
import { setupCommand } from './commands/setup';
import { bridgeCommand } from './commands/bridge';

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

export function runCli(args: string[] = process.argv): void {
  cli.parse(args);
}
