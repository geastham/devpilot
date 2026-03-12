/**
 * Compare Command
 *
 * Compare benchmark results across versions.
 */

import { Command } from 'commander';
import { join } from 'path';
import { createHistoryReader } from '../storage/history-reader';
import { createConsoleReporter } from '../reporters/console';
import { createJsonReporter } from '../reporters/json';
import { createMarkdownReporter } from '../reporters/markdown';
import { createComparator } from '../analysis/comparator';
import type { BenchmarkRun } from '../types';

export const compareCommand = new Command('compare')
  .description('Compare benchmark results between versions')
  .argument('<v1>', 'First version or run ID')
  .argument('<v2>', 'Second version or run ID')
  .option('-b, --benchmark <id>', 'Specific benchmark to compare')
  .option('--format <type>', 'Output format: console, markdown, json', 'console')
  .option('--output <file>', 'Output file path')
  .option('--results-dir <path>', 'Path to results directory')
  .action(async (v1, v2, options) => {
    const consoleReporter = createConsoleReporter();

    try {
      const resultsDir = options.resultsDir ?? join(process.cwd(), 'benchmarks', 'results');
      const reader = createHistoryReader(resultsDir);

      // Find runs for each version
      const run1 = await findRun(reader, v1);
      const run2 = await findRun(reader, v2);

      if (!run1) {
        consoleReporter.printError(`Run not found: ${v1}`);
        process.exit(1);
      }
      if (!run2) {
        consoleReporter.printError(`Run not found: ${v2}`);
        process.exit(1);
      }

      // Compare runs
      const comparisons = [];
      const comparator = createComparator();

      for (const result1 of run1.results) {
        if (options.benchmark && result1.benchmarkId !== options.benchmark) {
          continue;
        }

        const result2 = run2.results.find((r) => r.benchmarkId === result1.benchmarkId);
        if (!result2) continue;

        // Compare DevPilot scenarios if both exist
        if (result1.devpilot && result2.devpilot) {
          const comparison = comparator.compare(result1.devpilot, result2.devpilot);
          comparisons.push({
            benchmarkId: result1.benchmarkId,
            v1: {
              version: run1.version,
              wallClockMs: result1.devpilot.wallClockMs,
              totalCostUsd: result1.devpilot.totalCostUsd,
              passRate: result1.devpilot.acceptanceResults.passRate,
            },
            v2: {
              version: run2.version,
              wallClockMs: result2.devpilot.wallClockMs,
              totalCostUsd: result2.devpilot.totalCostUsd,
              passRate: result2.devpilot.acceptanceResults.passRate,
            },
            delta: {
              timeMs: result2.devpilot.wallClockMs - result1.devpilot.wallClockMs,
              costUsd: result2.devpilot.totalCostUsd - result1.devpilot.totalCostUsd,
              passRate:
                result2.devpilot.acceptanceResults.passRate -
                result1.devpilot.acceptanceResults.passRate,
            },
          });
        }
      }

      if (comparisons.length === 0) {
        consoleReporter.printWarning('No comparable benchmarks found');
        process.exit(0);
      }

      // Output results
      switch (options.format) {
        case 'console': {
          console.log('');
          console.log(`Comparing ${run1.version} → ${run2.version}`);
          console.log('═'.repeat(50));
          console.log('');

          for (const comp of comparisons) {
            console.log(`${comp.benchmarkId}`);
            console.log('─'.repeat(40));

            const timeChange = comp.delta.timeMs < 0 ? 'faster' : 'slower';
            const timeAbs = Math.abs(comp.delta.timeMs);
            console.log(`  Time:   ${formatDuration(timeAbs)} ${timeChange}`);

            const costChange = comp.delta.costUsd < 0 ? 'cheaper' : 'more expensive';
            const costAbs = Math.abs(comp.delta.costUsd);
            console.log(`  Cost:   $${costAbs.toFixed(2)} ${costChange}`);

            const qualitySign = comp.delta.passRate >= 0 ? '+' : '';
            console.log(`  Quality: ${qualitySign}${(comp.delta.passRate * 100).toFixed(1)}%`);
            console.log('');
          }
          break;
        }

        case 'json': {
          const jsonReporter = createJsonReporter({ pretty: true });
          const report = JSON.stringify(
            {
              v1: { version: run1.version, id: run1.id },
              v2: { version: run2.version, id: run2.id },
              comparisons,
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

        case 'markdown': {
          const lines = [
            `# Version Comparison: ${run1.version} → ${run2.version}`,
            '',
            '| Benchmark | Time Delta | Cost Delta | Quality Delta |',
            '|-----------|------------|------------|---------------|',
          ];

          for (const comp of comparisons) {
            const timeDelta = formatDeltaDuration(comp.delta.timeMs);
            const costDelta =
              comp.delta.costUsd >= 0
                ? `+$${comp.delta.costUsd.toFixed(2)}`
                : `-$${Math.abs(comp.delta.costUsd).toFixed(2)}`;
            const qualityDelta =
              comp.delta.passRate >= 0
                ? `+${(comp.delta.passRate * 100).toFixed(1)}%`
                : `${(comp.delta.passRate * 100).toFixed(1)}%`;

            lines.push(`| ${comp.benchmarkId} | ${timeDelta} | ${costDelta} | ${qualityDelta} |`);
          }

          const report = lines.join('\n');

          if (options.output) {
            const mdReporter = createMarkdownReporter();
            await mdReporter.writeReport(options.output, report);
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

async function findRun(
  reader: ReturnType<typeof createHistoryReader>,
  versionOrId: string
): Promise<BenchmarkRun | null> {
  // Try as version first
  const versions = await reader.listVersions();
  if (versions.includes(versionOrId)) {
    const runs = await reader.listRuns(versionOrId);
    if (runs.length > 0) {
      return reader.readRunManifest(versionOrId, runs[0]);
    }
  }

  // Try as run ID
  for (const version of versions) {
    const runs = await reader.listRuns(version);
    for (const timestamp of runs) {
      const manifest = await reader.readRunManifest(version, timestamp);
      if (manifest && manifest.id === versionOrId) {
        return manifest;
      }
    }
  }

  return null;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function formatDeltaDuration(ms: number): string {
  const sign = ms >= 0 ? '+' : '-';
  return `${sign}${formatDuration(Math.abs(ms))}`;
}
