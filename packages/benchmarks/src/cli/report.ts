/**
 * Report Command
 *
 * Generate reports from benchmark results.
 */

import { Command } from 'commander';
import { join } from 'path';
import { createHistoryReader } from '../storage/history-reader';
import { createJsonReporter } from '../reporters/json';
import { createMarkdownReporter } from '../reporters/markdown';
import { createConsoleReporter } from '../reporters/console';

type OutputFormat = 'console' | 'markdown' | 'json';

export const reportCommand = new Command('report')
  .description('Generate benchmark report')
  .argument('[runId]', 'Run ID to report on')
  .option('--format <type>', 'Output format: console, markdown, json', 'console')
  .option('--output <file>', 'Output file path (for markdown/json)')
  .option('--latest', 'Use most recent run')
  .option('--results-dir <path>', 'Path to results directory')
  .action(async (runId, options) => {
    const consoleReporter = createConsoleReporter();

    try {
      const resultsDir = options.resultsDir ?? join(process.cwd(), 'benchmarks', 'results');
      const reader = createHistoryReader(resultsDir);

      // Get run to report on
      let run;
      if (options.latest || !runId) {
        run = await reader.getLatestRun();
        if (!run) {
          consoleReporter.printError('No benchmark runs found');
          process.exit(1);
        }
      } else {
        // Find run by ID
        const versions = await reader.listVersions();
        for (const version of versions) {
          const runs = await reader.listRuns(version);
          for (const timestamp of runs) {
            const manifest = await reader.readRunManifest(version, timestamp);
            if (manifest && manifest.id === runId) {
              run = manifest;
              break;
            }
          }
          if (run) break;
        }
        if (!run) {
          consoleReporter.printError(`Run not found: ${runId}`);
          process.exit(1);
        }
      }

      const format = options.format as OutputFormat;

      switch (format) {
        case 'console': {
          consoleReporter.printHeader(run);
          consoleReporter.printSummary(run);
          consoleReporter.printResultsTable(run);

          for (const result of run.results) {
            if (result.comparison) {
              consoleReporter.printComparison(
                result.benchmarkId,
                result.comparison,
                result.waveAnalysis
              );
            }
          }
          break;
        }

        case 'markdown': {
          const mdReporter = createMarkdownReporter();
          const report = mdReporter.generateRunReport(run);

          if (options.output) {
            await mdReporter.writeReport(options.output, report);
            consoleReporter.printSuccess(`Report written to: ${options.output}`);
          } else {
            console.log(report);
          }
          break;
        }

        case 'json': {
          const jsonReporter = createJsonReporter({ pretty: true });
          const report = jsonReporter.generateRunReport(run);

          if (options.output) {
            await jsonReporter.writeReport(options.output, report);
            consoleReporter.printSuccess(`Report written to: ${options.output}`);
          } else {
            console.log(report);
          }
          break;
        }

        default:
          consoleReporter.printError(`Unknown format: ${format}`);
          process.exit(1);
      }
    } catch (error) {
      consoleReporter.printError(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });
