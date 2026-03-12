/**
 * History Command
 *
 * View historical benchmark trends.
 */

import { Command } from 'commander';
import { join } from 'path';
import { createHistoryReader } from '../storage/history-reader';
import { createTrendAnalyzer, TrendAnalyzer } from '../analysis/trend';
import { createConsoleReporter } from '../reporters/console';
import { createJsonReporter } from '../reporters/json';
import type { VersionDataPoint, BenchmarkId } from '../types';

export const historyCommand = new Command('history')
  .description('View benchmark history and trends')
  .argument('[benchmarkId]', 'Specific benchmark to show history for')
  .option('--last <n>', 'Show last N versions', parseInt, 10)
  .option('--metric <name>', 'Highlight specific metric: speedup, cost, quality', 'speedup')
  .option('--format <type>', 'Output format: console, json', 'console')
  .option('--output <file>', 'Output file path')
  .option('--results-dir <path>', 'Path to results directory')
  .action(async (benchmarkId, options) => {
    const consoleReporter = createConsoleReporter();

    try {
      const resultsDir = options.resultsDir ?? join(process.cwd(), 'benchmarks', 'results');
      const reader = createHistoryReader(resultsDir);
      const trendAnalyzer = createTrendAnalyzer();

      // Get versions
      let versions = await reader.listVersions();
      versions = versions.slice(0, options.last);

      if (versions.length === 0) {
        consoleReporter.printWarning('No benchmark history found');
        process.exit(0);
      }

      // Collect data points
      const benchmarkData = new Map<BenchmarkId, VersionDataPoint[]>();

      for (const version of versions) {
        const runs = await reader.listRuns(version);
        if (runs.length === 0) continue;

        // Use most recent run for this version
        const run = await reader.readRunManifest(version, runs[0]);
        if (!run) continue;

        for (const result of run.results) {
          if (benchmarkId && result.benchmarkId !== benchmarkId) continue;
          if (!result.devpilot || !result.comparison) continue;

          const dataPoint: VersionDataPoint = {
            version,
            timestamp: run.timestamp,
            speedup: result.comparison.speedup,
            costReduction: result.comparison.costReduction,
            passRate: result.devpilot.acceptanceResults.passRate,
            compositeScore: 0, // Would need scoring to calculate
          };

          if (!benchmarkData.has(result.benchmarkId)) {
            benchmarkData.set(result.benchmarkId, []);
          }
          benchmarkData.get(result.benchmarkId)!.push(dataPoint);
        }
      }

      if (benchmarkData.size === 0) {
        consoleReporter.printWarning('No benchmark data found');
        process.exit(0);
      }

      // Analyze trends
      const analyses = [];
      for (const [id, dataPoints] of benchmarkData) {
        const analysis = trendAnalyzer.analyze(id, dataPoints);
        analyses.push(analysis);
      }

      // Output
      switch (options.format) {
        case 'console': {
          console.log('');
          console.log('Benchmark History');
          console.log('═'.repeat(50));
          console.log('');

          for (const analysis of analyses) {
            consoleReporter.printTrends(analysis);
            console.log('');

            // Show sparkline for selected metric
            const metric = options.metric as 'speedup' | 'cost' | 'quality';
            const values = analysis.versions.map((v) => {
              switch (metric) {
                case 'speedup':
                  return v.speedup;
                case 'cost':
                  return v.costReduction;
                case 'quality':
                  return v.passRate;
                default:
                  return v.speedup;
              }
            });

            if (values.length > 1) {
              console.log(`  ${metric} trend: ${createSparkline(values)}`);
              console.log('');
            }
          }
          break;
        }

        case 'json': {
          const jsonReporter = createJsonReporter({ pretty: true });
          const report = JSON.stringify(
            {
              versionsAnalyzed: versions.length,
              analyses: analyses.map((a) => ({
                benchmarkId: a.benchmarkId,
                dataPoints: a.versions.length,
                trends: a.trends,
                bestVersion: a.bestVersion,
                latestDelta: a.latestDelta,
              })),
            },
            null,
            2
          );

          if (options.output) {
            await jsonReporter.writeReport(options.output, report);
            consoleReporter.printSuccess(`Report written to: ${options.output}`);
          } else {
            console.log(report);
          }
          break;
        }
      }
    } catch (error) {
      consoleReporter.printError(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * Create a sparkline from values.
 */
function createSparkline(values: number[]): string {
  const chars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return values
    .map((v) => {
      const normalized = (v - min) / range;
      const index = Math.round(normalized * (chars.length - 1));
      return chars[index];
    })
    .join('');
}
