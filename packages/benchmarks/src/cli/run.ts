/**
 * Run Command
 *
 * Execute benchmarks.
 */

import { Command } from 'commander';
import { join } from 'path';
import { createBenchmarkRunner } from '../runner';
import { createConsoleReporter } from '../reporters/console';
import { loadConfig, toRunConfig } from '../config';
import type { BenchmarkId, ScenarioType } from '../types';

export const runCommand = new Command('run')
  .description('Execute benchmark suite')
  .option('-b, --benchmarks <ids>', 'Comma-separated benchmark IDs (default: all)', (val) =>
    val.split(',').map((s) => s.trim())
  )
  .option('-s, --scenarios <types>', 'Scenarios to run: baseline,devpilot (default: both)', (val) =>
    val.split(',').map((s) => s.trim()) as ScenarioType[]
  )
  .option('-n, --iterations <n>', 'Iterations per scenario', parseInt, 1)
  .option('-c, --concurrency <n>', 'Max concurrent sessions', parseInt, 4)
  .option('--parallel', 'Run benchmarks in parallel')
  .option('--timeout <minutes>', 'Per-scenario timeout in minutes', parseInt, 10)
  .option('--no-archive', 'Skip workspace archival')
  .option('--dry-run', 'Validate config without running')
  .option('-v, --verbose', 'Verbose output')
  .option('--config <path>', 'Path to config file')
  .option('--benchmarks-dir <path>', 'Path to benchmarks directory')
  .option('--results-dir <path>', 'Path to results directory')
  .action(async (options) => {
    const reporter = createConsoleReporter(options.verbose);

    try {
      // Determine paths
      const projectRoot = process.cwd();
      const benchmarksDir = options.benchmarksDir ?? join(projectRoot, 'benchmarks');
      const resultsDir = options.resultsDir ?? join(benchmarksDir, 'results');

      // Load config if provided
      let config = {};
      if (options.config) {
        config = await loadConfig(options.config);
      }

      // Determine benchmarks to run
      let benchmarks: BenchmarkId[] = options.benchmarks;
      if (!benchmarks || benchmarks.length === 0) {
        benchmarks = ['01-cli-static-site-gen', '02-rest-api-task-manager', '03-react-analytics-dashboard'];
      }

      // Determine scenarios
      let scenarios: ScenarioType[] = options.scenarios;
      if (!scenarios || scenarios.length === 0) {
        scenarios = ['baseline', 'devpilot'];
      }

      // Build run config
      const runConfig = toRunConfig({
        ...config,
        benchmarks,
        scenarios,
        execution: {
          maxConcurrency: options.concurrency,
          timeoutMs: options.timeout * 60 * 1000,
          retryOnFailure: true,
        },
      });

      if (options.dryRun) {
        console.log('Dry run - configuration validated:');
        console.log('  Benchmarks:', benchmarks.join(', '));
        console.log('  Scenarios:', scenarios.join(', '));
        console.log('  Concurrency:', options.concurrency);
        console.log('  Timeout:', options.timeout, 'minutes');
        console.log('  Parallel:', options.parallel ? 'yes' : 'no');
        return;
      }

      // Create runner
      const runner = createBenchmarkRunner({
        benchmarksDir,
        resultsDir,
        projectRoot,
        parallel: options.parallel,
        timeoutMs: options.timeout * 60 * 1000,
        maxConcurrency: options.concurrency,
        archiveWorkspaces: options.archive !== false,
        verbose: options.verbose,
      });

      // Print header
      console.log('');
      console.log('DevPilot Benchmark Suite');
      console.log('========================');
      console.log('');
      console.log(`Benchmarks: ${benchmarks.join(', ')}`);
      console.log(`Scenarios: ${scenarios.join(', ')}`);
      console.log(`Concurrency: ${options.concurrency}`);
      console.log(`Timeout: ${options.timeout} minutes`);
      console.log('');

      // Run benchmarks
      reporter.printProgress('Starting benchmark run...');
      const run = await runner.run(runConfig);

      // Print results
      reporter.printHeader(run);
      reporter.printSummary(run);
      reporter.printResultsTable(run);

      // Print detailed comparisons
      for (const result of run.results) {
        if (result.comparison) {
          reporter.printComparison(
            result.benchmarkId,
            result.comparison,
            result.waveAnalysis
          );
        }
      }

      console.log('');
      reporter.printSuccess(`Run completed: ${run.id}`);
      console.log(`  Results saved to: ${resultsDir}`);
      console.log('');
    } catch (error) {
      reporter.printError(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });
