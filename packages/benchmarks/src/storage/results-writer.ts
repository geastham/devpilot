/**
 * Results Writer
 *
 * Writes structured benchmark results to disk in a versioned directory structure.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  RunManifest,
  BenchmarkRun,
  ScenarioResult,
  WavePlan,
  WaveAnalysis,
  ComparisonResult,
  TimelineEvent,
  SessionRecord,
} from '../types';
import {
  getVersionInfo,
  sanitizeVersionForPath,
  createTimestampPath,
} from './version-tagger';

/**
 * Results directory structure:
 *
 * benchmarks/results/
 * ├── latest/                    -> symlink to most recent version directory
 * ├── v0.1.0/
 * │   └── 2026-03-12T14-30-00Z/
 * │       ├── run-manifest.json
 * │       ├── report.md
 * │       ├── summary.json
 * │       ├── 01-forgepress/
 * │       │   ├── baseline/
 * │       │   │   ├── session-log.jsonl
 * │       │   │   ├── timeline.json
 * │       │   │   └── acceptance.txt
 * │       │   ├── devpilot/
 * │       │   │   ├── wave-plan.json
 * │       │   │   ├── session-log.jsonl
 * │       │   │   ├── timeline.json
 * │       │   │   └── acceptance.txt
 * │       │   ├── comparison.json
 * │       │   └── wave-analysis.json
 */

export interface ResultsWriterConfig {
  /** Base results directory */
  resultsDir: string;
  /** Project root for version detection */
  projectRoot?: string;
}

/**
 * Writes benchmark results to disk.
 */
export class ResultsWriter {
  private resultsDir: string;
  private projectRoot: string;

  constructor(config: ResultsWriterConfig) {
    this.resultsDir = config.resultsDir;
    this.projectRoot = config.projectRoot ?? process.cwd();
  }

  /**
   * Write a complete run manifest and return the run directory path.
   */
  async writeRunManifest(manifest: RunManifest): Promise<string> {
    const versionInfo = getVersionInfo(this.projectRoot);
    const versionDir = sanitizeVersionForPath(
      manifest.version ?? versionInfo.version
    );
    const timestampDir = createTimestampPath(new Date(manifest.timestamp));

    const runDir = path.join(this.resultsDir, versionDir, timestampDir);

    // Create directory structure
    await fs.mkdir(runDir, { recursive: true });

    // Write run manifest
    await this.writeJson(
      path.join(runDir, 'run-manifest.json'),
      manifest
    );

    // Write summary
    await this.writeJson(path.join(runDir, 'summary.json'), {
      id: manifest.id,
      version: manifest.version,
      gitCommit: manifest.gitCommit,
      timestamp: manifest.timestamp,
      summary: manifest.summary,
    });

    // Update latest symlink
    await this.updateLatestSymlink(runDir);

    return runDir;
  }

  /**
   * Write results for a specific benchmark.
   */
  async writeBenchmarkResult(
    runDir: string,
    benchmarkRun: BenchmarkRun
  ): Promise<void> {
    const benchmarkDir = path.join(runDir, benchmarkRun.benchmarkId);
    await fs.mkdir(benchmarkDir, { recursive: true });

    // Write baseline results if present
    if (benchmarkRun.scenarios.baseline) {
      await this.writeScenarioResult(
        benchmarkDir,
        'baseline',
        benchmarkRun.scenarios.baseline
      );
    }

    // Write devpilot results if present
    if (benchmarkRun.scenarios.devpilot) {
      await this.writeScenarioResult(
        benchmarkDir,
        'devpilot',
        benchmarkRun.scenarios.devpilot
      );
    }

    // Write comparison if present
    if (benchmarkRun.comparison) {
      await this.writeJson(
        path.join(benchmarkDir, 'comparison.json'),
        benchmarkRun.comparison
      );
    }
  }

  /**
   * Write results for a specific scenario.
   */
  async writeScenarioResult(
    benchmarkDir: string,
    scenario: 'baseline' | 'devpilot',
    result: ScenarioResult
  ): Promise<void> {
    const scenarioDir = path.join(benchmarkDir, scenario);
    await fs.mkdir(scenarioDir, { recursive: true });

    // Write session log (JSONL format - one JSON object per line)
    const sessionLog = result.sessions
      .map((s) => JSON.stringify(s))
      .join('\n');
    await fs.writeFile(
      path.join(scenarioDir, 'session-log.jsonl'),
      sessionLog,
      'utf-8'
    );

    // Write timeline
    await this.writeJson(
      path.join(scenarioDir, 'timeline.json'),
      result.timeline
    );

    // Write acceptance results
    await fs.writeFile(
      path.join(scenarioDir, 'acceptance.txt'),
      result.acceptanceResults.scriptOutput,
      'utf-8'
    );

    // Write wave plan for devpilot scenario
    if (scenario === 'devpilot' && result.wavePlan) {
      await this.writeJson(
        path.join(scenarioDir, 'wave-plan.json'),
        result.wavePlan
      );
    }
  }

  /**
   * Write wave analysis results.
   */
  async writeWaveAnalysis(
    benchmarkDir: string,
    analysis: WaveAnalysis
  ): Promise<void> {
    await this.writeJson(
      path.join(benchmarkDir, 'wave-analysis.json'),
      analysis
    );
  }

  /**
   * Write a markdown report.
   */
  async writeReport(runDir: string, reportContent: string): Promise<void> {
    await fs.writeFile(
      path.join(runDir, 'report.md'),
      reportContent,
      'utf-8'
    );
  }

  /**
   * Update the 'latest' symlink to point to the most recent run.
   */
  async updateLatestSymlink(runDir: string): Promise<void> {
    const latestPath = path.join(this.resultsDir, 'latest');

    try {
      // Remove existing symlink if present
      try {
        const stats = await fs.lstat(latestPath);
        if (stats.isSymbolicLink()) {
          await fs.unlink(latestPath);
        }
      } catch {
        // Symlink doesn't exist, that's fine
      }

      // Create relative symlink
      const relativePath = path.relative(this.resultsDir, runDir);
      await fs.symlink(relativePath, latestPath);
    } catch (error) {
      console.warn(`Failed to update latest symlink: ${error}`);
    }
  }

  /**
   * Archive a workspace directory.
   */
  async archiveWorkspace(
    workspaceDir: string,
    outputPath: string
  ): Promise<string> {
    const { execSync } = await import('child_process');

    const archivePath = outputPath.endsWith('.tar.gz')
      ? outputPath
      : `${outputPath}.tar.gz`;

    const parentDir = path.dirname(workspaceDir);
    const dirName = path.basename(workspaceDir);

    execSync(`tar -czf "${archivePath}" -C "${parentDir}" "${dirName}"`, {
      encoding: 'utf-8',
    });

    return archivePath;
  }

  /**
   * Get the path for a specific run.
   */
  getRunPath(version: string, timestamp: string): string {
    const versionDir = sanitizeVersionForPath(version);
    return path.join(this.resultsDir, versionDir, timestamp);
  }

  /**
   * Check if a run exists.
   */
  async runExists(version: string, timestamp: string): Promise<boolean> {
    const runPath = this.getRunPath(version, timestamp);
    try {
      await fs.access(runPath);
      return true;
    } catch {
      return false;
    }
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private async writeJson(filePath: string, data: unknown): Promise<void> {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }
}

/**
 * Create a results writer.
 */
export function createResultsWriter(
  config: ResultsWriterConfig
): ResultsWriter {
  return new ResultsWriter(config);
}
