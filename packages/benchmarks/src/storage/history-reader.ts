/**
 * History Reader
 *
 * Reads historical benchmark results for trend analysis.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  RunManifest,
  BenchmarkRun,
  BenchmarkId,
  VersionDataPoint,
  ComparisonResult,
  WaveAnalysis,
} from '../types';
import { parseTimestampPath } from './version-tagger';

export interface HistoryReaderConfig {
  /** Base results directory */
  resultsDir: string;
}

/**
 * Reads historical benchmark results.
 */
export class HistoryReader {
  private resultsDir: string;

  constructor(config: HistoryReaderConfig) {
    this.resultsDir = config.resultsDir;
  }

  /**
   * List all versions that have results.
   */
  async listVersions(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.resultsDir, {
        withFileTypes: true,
      });

      return entries
        .filter((e) => e.isDirectory() && e.name !== 'latest')
        .map((e) => e.name)
        .sort()
        .reverse(); // Most recent first
    } catch {
      return [];
    }
  }

  /**
   * List all runs for a version, sorted by timestamp (most recent first).
   */
  async listRuns(version: string): Promise<string[]> {
    const versionDir = path.join(this.resultsDir, version);

    try {
      const entries = await fs.readdir(versionDir, { withFileTypes: true });

      return entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
        .reverse(); // Most recent first
    } catch {
      return [];
    }
  }

  /**
   * Read a run manifest.
   */
  async readRunManifest(
    version: string,
    timestamp: string
  ): Promise<RunManifest | null> {
    const manifestPath = path.join(
      this.resultsDir,
      version,
      timestamp,
      'run-manifest.json'
    );

    try {
      const content = await fs.readFile(manifestPath, 'utf-8');
      return JSON.parse(content) as RunManifest;
    } catch {
      return null;
    }
  }

  /**
   * Get the latest run.
   */
  async getLatestRun(): Promise<RunManifest | null> {
    try {
      // Try to read from latest symlink
      const latestPath = path.join(this.resultsDir, 'latest');
      const resolvedPath = await fs.realpath(latestPath);
      const manifestPath = path.join(resolvedPath, 'run-manifest.json');

      const content = await fs.readFile(manifestPath, 'utf-8');
      return JSON.parse(content) as RunManifest;
    } catch {
      // Fall back to finding the most recent run
      const versions = await this.listVersions();
      if (versions.length === 0) return null;

      for (const version of versions) {
        const runs = await this.listRuns(version);
        if (runs.length > 0) {
          return this.readRunManifest(version, runs[0]);
        }
      }

      return null;
    }
  }

  /**
   * Get trend data points for a benchmark.
   */
  async getTrendDataPoints(
    benchmarkId: BenchmarkId,
    limit: number = 20
  ): Promise<VersionDataPoint[]> {
    const dataPoints: VersionDataPoint[] = [];
    const versions = await this.listVersions();

    for (const version of versions) {
      if (dataPoints.length >= limit) break;

      const runs = await this.listRuns(version);
      for (const timestamp of runs) {
        if (dataPoints.length >= limit) break;

        const manifest = await this.readRunManifest(version, timestamp);
        if (!manifest) continue;

        // Find the benchmark run
        const benchmarkRun = manifest.benchmarks.find(
          (b) => b.benchmarkId === benchmarkId
        );
        if (!benchmarkRun || !benchmarkRun.compositeScore) continue;

        // Extract data point
        const devpilotResult = benchmarkRun.scenarios.devpilot;
        if (!devpilotResult) continue;

        dataPoints.push({
          version: manifest.version,
          timestamp: manifest.timestamp,
          compositeScore: benchmarkRun.compositeScore.total,
          speedup: benchmarkRun.comparison?.speedup ?? 1,
          costReduction: benchmarkRun.comparison?.costReduction ?? 0,
          passRate: devpilotResult.acceptanceResults.passRate,
        });
      }
    }

    return dataPoints;
  }

  /**
   * Read comparison results for a benchmark.
   */
  async readComparison(
    version: string,
    timestamp: string,
    benchmarkId: BenchmarkId
  ): Promise<ComparisonResult | null> {
    const comparisonPath = path.join(
      this.resultsDir,
      version,
      timestamp,
      benchmarkId,
      'comparison.json'
    );

    try {
      const content = await fs.readFile(comparisonPath, 'utf-8');
      return JSON.parse(content) as ComparisonResult;
    } catch {
      return null;
    }
  }

  /**
   * Read wave analysis for a benchmark.
   */
  async readWaveAnalysis(
    version: string,
    timestamp: string,
    benchmarkId: BenchmarkId
  ): Promise<WaveAnalysis | null> {
    const analysisPath = path.join(
      this.resultsDir,
      version,
      timestamp,
      benchmarkId,
      'wave-analysis.json'
    );

    try {
      const content = await fs.readFile(analysisPath, 'utf-8');
      return JSON.parse(content) as WaveAnalysis;
    } catch {
      return null;
    }
  }

  /**
   * Get all benchmark runs across all versions for trend analysis.
   */
  async getAllBenchmarkRuns(
    benchmarkId: BenchmarkId,
    limit: number = 100
  ): Promise<BenchmarkRun[]> {
    const runs: BenchmarkRun[] = [];
    const versions = await this.listVersions();

    for (const version of versions) {
      if (runs.length >= limit) break;

      const timestamps = await this.listRuns(version);
      for (const timestamp of timestamps) {
        if (runs.length >= limit) break;

        const manifest = await this.readRunManifest(version, timestamp);
        if (!manifest) continue;

        const benchmarkRun = manifest.benchmarks.find(
          (b) => b.benchmarkId === benchmarkId
        );
        if (benchmarkRun) {
          runs.push(benchmarkRun);
        }
      }
    }

    return runs;
  }

  /**
   * Find runs matching a criteria.
   */
  async findRuns(
    criteria: {
      version?: string;
      benchmarkId?: BenchmarkId;
      minScore?: number;
      maxScore?: number;
      fromDate?: Date;
      toDate?: Date;
    },
    limit: number = 50
  ): Promise<RunManifest[]> {
    const results: RunManifest[] = [];
    const versions = criteria.version
      ? [criteria.version]
      : await this.listVersions();

    for (const version of versions) {
      if (results.length >= limit) break;

      const runs = await this.listRuns(version);
      for (const timestamp of runs) {
        if (results.length >= limit) break;

        // Date filtering
        if (criteria.fromDate || criteria.toDate) {
          const runDate = parseTimestampPath(timestamp);
          if (criteria.fromDate && runDate < criteria.fromDate) continue;
          if (criteria.toDate && runDate > criteria.toDate) continue;
        }

        const manifest = await this.readRunManifest(version, timestamp);
        if (!manifest) continue;

        // Benchmark filtering
        if (criteria.benchmarkId) {
          const hasBenchmark = manifest.benchmarks.some(
            (b) => b.benchmarkId === criteria.benchmarkId
          );
          if (!hasBenchmark) continue;
        }

        // Score filtering
        if (criteria.minScore !== undefined || criteria.maxScore !== undefined) {
          const avgScore = manifest.summary.avgCompositeScore;
          if (criteria.minScore !== undefined && avgScore < criteria.minScore)
            continue;
          if (criteria.maxScore !== undefined && avgScore > criteria.maxScore)
            continue;
        }

        results.push(manifest);
      }
    }

    return results;
  }

  /**
   * Get statistics across all runs.
   */
  async getOverallStatistics(benchmarkId?: BenchmarkId): Promise<{
    totalRuns: number;
    versions: number;
    avgScore: number;
    bestScore: number;
    worstScore: number;
    avgSpeedup: number;
  }> {
    let totalRuns = 0;
    let totalScore = 0;
    let totalSpeedup = 0;
    let bestScore = 0;
    let worstScore = 100;

    const versions = await this.listVersions();

    for (const version of versions) {
      const runs = await this.listRuns(version);
      for (const timestamp of runs) {
        const manifest = await this.readRunManifest(version, timestamp);
        if (!manifest) continue;

        const benchmarks = benchmarkId
          ? manifest.benchmarks.filter((b) => b.benchmarkId === benchmarkId)
          : manifest.benchmarks;

        for (const bench of benchmarks) {
          if (!bench.compositeScore) continue;

          totalRuns++;
          totalScore += bench.compositeScore.total;
          totalSpeedup += bench.comparison?.speedup ?? 1;
          bestScore = Math.max(bestScore, bench.compositeScore.total);
          worstScore = Math.min(worstScore, bench.compositeScore.total);
        }
      }
    }

    return {
      totalRuns,
      versions: versions.length,
      avgScore: totalRuns > 0 ? totalScore / totalRuns : 0,
      bestScore,
      worstScore: totalRuns > 0 ? worstScore : 0,
      avgSpeedup: totalRuns > 0 ? totalSpeedup / totalRuns : 1,
    };
  }
}

/**
 * Create a history reader.
 */
export function createHistoryReader(
  config: HistoryReaderConfig
): HistoryReader {
  return new HistoryReader(config);
}
