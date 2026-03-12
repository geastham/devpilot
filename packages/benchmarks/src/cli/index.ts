/**
 * CLI Module
 *
 * Benchmark suite CLI commands.
 */

import { Command } from 'commander';
import { runCommand } from './run';
import { reportCommand } from './report';
import { compareCommand } from './compare';
import { historyCommand } from './history';
import { listCommand } from './list';
import { validateCommand } from './validate';

/**
 * Main benchmark CLI command.
 */
export const benchCommand = new Command('bench')
  .description('DevPilot Benchmark Suite')
  .addCommand(runCommand)
  .addCommand(reportCommand)
  .addCommand(compareCommand)
  .addCommand(historyCommand)
  .addCommand(listCommand)
  .addCommand(validateCommand);

// Re-export individual commands
export { runCommand } from './run';
export { reportCommand } from './report';
export { compareCommand } from './compare';
export { historyCommand } from './history';
export { listCommand } from './list';
export { validateCommand } from './validate';
