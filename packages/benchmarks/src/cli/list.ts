/**
 * List Command
 *
 * List available benchmarks and past runs.
 */

import { Command } from 'commander';
import { join } from 'path';
import { readdir, stat, readFile } from 'fs/promises';
import { createHistoryReader } from '../storage/history-reader';
import { createConsoleReporter } from '../reporters/console';

export const listCommand = new Command('list')
  .description('List benchmarks or runs')
  .argument('[type]', 'What to list: benchmarks, runs, versions', 'benchmarks')
  .option('--version <v>', 'Filter runs by version')
  .option('--results-dir <path>', 'Path to results directory')
  .option('--benchmarks-dir <path>', 'Path to benchmarks directory')
  .action(async (type, options) => {
    const consoleReporter = createConsoleReporter();

    try {
      const projectRoot = process.cwd();
      const benchmarksDir = options.benchmarksDir ?? join(projectRoot, 'benchmarks');
      const resultsDir = options.resultsDir ?? join(benchmarksDir, 'results');

      switch (type) {
        case 'benchmarks': {
          console.log('');
          console.log('Available Benchmarks');
          console.log('═'.repeat(50));
          console.log('');

          const entries = await readdir(benchmarksDir);

          for (const entry of entries) {
            // Skip non-benchmark directories
            if (entry.startsWith('.') || entry === 'results' || entry === 'ground-truth' || entry === '00-common') {
              continue;
            }

            const entryPath = join(benchmarksDir, entry);
            const entryStat = await stat(entryPath);

            if (entryStat.isDirectory()) {
              // Check for PRD.md
              try {
                const prdPath = join(entryPath, 'PRD.md');
                await stat(prdPath);

                // Read first line for title
                const prdContent = await readFile(prdPath, 'utf-8');
                const titleMatch = prdContent.match(/^#\s*(.+)/m);
                const title = titleMatch ? titleMatch[1] : entry;

                console.log(`  ${entry}`);
                console.log(`    ${title}`);
                console.log('');
              } catch {
                // No PRD.md, skip
              }
            }
          }
          break;
        }

        case 'runs': {
          const reader = createHistoryReader(resultsDir);

          console.log('');
          console.log('Benchmark Runs');
          console.log('═'.repeat(60));
          console.log('');

          let versions = await reader.listVersions();
          if (options.version) {
            versions = versions.filter((v) => v === options.version);
          }

          if (versions.length === 0) {
            consoleReporter.printWarning('No runs found');
            return;
          }

          for (const version of versions) {
            console.log(`Version: ${version}`);
            console.log('─'.repeat(40));

            const runs = await reader.listRuns(version);
            for (const timestamp of runs) {
              const manifest = await reader.readRunManifest(version, timestamp);
              if (manifest) {
                const status = manifest.status === 'completed' ? '✓' : manifest.status === 'failed' ? '✗' : '○';
                const benchmarkCount = manifest.results.length;
                const avgSpeedup = manifest.summary.avgSpeedup.toFixed(2);

                console.log(`  ${status} ${manifest.id.slice(0, 8)}  ${timestamp}  ${benchmarkCount} benchmarks  ${avgSpeedup}x avg`);
              }
            }
            console.log('');
          }
          break;
        }

        case 'versions': {
          const reader = createHistoryReader(resultsDir);

          console.log('');
          console.log('Benchmark Versions');
          console.log('═'.repeat(40));
          console.log('');

          const versions = await reader.listVersions();

          if (versions.length === 0) {
            consoleReporter.printWarning('No versions found');
            return;
          }

          for (const version of versions) {
            const runs = await reader.listRuns(version);
            console.log(`  ${version}  (${runs.length} runs)`);
          }
          console.log('');
          break;
        }

        default:
          consoleReporter.printError(`Unknown type: ${type}. Use: benchmarks, runs, versions`);
          process.exit(1);
      }
    } catch (error) {
      consoleReporter.printError(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });
