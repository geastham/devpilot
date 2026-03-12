#!/usr/bin/env node
/**
 * Benchmark CLI Entry Point
 *
 * Standalone CLI for the benchmark suite.
 */

import { Command } from 'commander';
import { benchCommand } from './src/cli';

const program = new Command()
  .name('devpilot-bench')
  .description('DevPilot Benchmark Suite CLI')
  .version('0.1.0');

// Add all bench subcommands directly to root
program.addCommand(benchCommand);

// Parse and execute
program.parse(process.argv);
