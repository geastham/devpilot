import { Command } from 'commander';

/**
 * Run Command
 *
 * Execute benchmarks.
 */

declare const runCommand: Command;

/**
 * Report Command
 *
 * Generate reports from benchmark results.
 */

declare const reportCommand: Command;

/**
 * Compare Command
 *
 * Compare benchmark results across versions.
 */

declare const compareCommand: Command;

/**
 * History Command
 *
 * View historical benchmark trends.
 */

declare const historyCommand: Command;

/**
 * List Command
 *
 * List available benchmarks and past runs.
 */

declare const listCommand: Command;

/**
 * Validate Command
 *
 * Validate benchmark configuration and files.
 */

declare const validateCommand: Command;

/**
 * CLI Module
 *
 * Benchmark suite CLI commands.
 */

/**
 * Main benchmark CLI command.
 */
declare const benchCommand: Command;

export { benchCommand, compareCommand, historyCommand, listCommand, reportCommand, runCommand, validateCommand };
