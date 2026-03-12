/**
 * JSON Reporter
 *
 * Machine-readable JSON output generation.
 */

import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import type {
  BenchmarkRun,
  ScenarioResult,
  ComparisonResult,
  WaveAnalysis,
  CompositeScore,
  TrendAnalysis,
} from '../types';

export interface JsonReportOptions {
  pretty?: boolean;
  includeRawOutput?: boolean;
}

/**
 * Generates JSON reports from benchmark results.
 */
export class JsonReporter {
  private options: Required<JsonReportOptions>;

  constructor(options: JsonReportOptions = {}) {
    this.options = {
      pretty: options.pretty ?? true,
      includeRawOutput: options.includeRawOutput ?? false,
    };
  }

  /**
   * Generate full run report as JSON.
   */
  generateRunReport(run: BenchmarkRun): string {
    const report = this.options.includeRawOutput
      ? run
      : this.stripRawOutput(run);

    return this.serialize(report);
  }

  /**
   * Generate comparison report as JSON.
   */
  generateComparisonReport(
    baseline: ScenarioResult,
    devpilot: ScenarioResult,
    comparison: ComparisonResult,
    waveAnalysis?: WaveAnalysis
  ): string {
    const report = {
      comparison,
      waveAnalysis,
      baseline: this.summarizeScenario(baseline),
      devpilot: this.summarizeScenario(devpilot),
      winner: this.determineWinner(comparison),
    };

    return this.serialize(report);
  }

  /**
   * Generate trend report as JSON.
   */
  generateTrendReport(analysis: TrendAnalysis): string {
    return this.serialize(analysis);
  }

  /**
   * Generate score report as JSON.
   */
  generateScoreReport(
    scenario: ScenarioResult,
    score: CompositeScore,
    waveAnalysis?: WaveAnalysis
  ): string {
    const report = {
      scenario: scenario.scenario,
      benchmarkId: scenario.benchmarkId,
      score,
      waveAnalysis,
      metrics: {
        wallClockMs: scenario.wallClockMs,
        totalTokens: scenario.totalTokens,
        totalCostUsd: scenario.totalCostUsd,
        passRate: scenario.acceptanceResults.passRate,
        firstAttemptPassRate: scenario.firstAttemptPassRate,
        reworkRatio: scenario.reworkRatio,
      },
    };

    return this.serialize(report);
  }

  /**
   * Generate summary report as JSON.
   */
  generateSummaryReport(run: BenchmarkRun): string {
    const report = {
      id: run.id,
      version: run.version,
      timestamp: run.timestamp,
      status: run.status,
      durationMs: run.durationMs,
      summary: run.summary,
      benchmarks: run.results.map((r) => ({
        benchmarkId: r.benchmarkId,
        comparison: r.comparison,
        waveAnalysis: r.waveAnalysis
          ? {
              score: r.waveAnalysis.score,
              taskPlacementAccuracy: r.waveAnalysis.taskPlacementAccuracy,
              dependencyViolations: r.waveAnalysis.dependencyViolations.length,
              missedParallelism: r.waveAnalysis.missedParallelism.length,
            }
          : undefined,
      })),
    };

    return this.serialize(report);
  }

  /**
   * Write report to file.
   */
  async writeReport(filePath: string, content: string): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf-8');
  }

  /**
   * Strip raw output from run for smaller file size.
   */
  private stripRawOutput(run: BenchmarkRun): BenchmarkRun {
    return {
      ...run,
      results: run.results.map((r) => ({
        ...r,
        baseline: r.baseline ? this.stripScenarioOutput(r.baseline) : undefined,
        devpilot: r.devpilot ? this.stripScenarioOutput(r.devpilot) : undefined,
      })),
    };
  }

  /**
   * Strip raw output from scenario.
   */
  private stripScenarioOutput(scenario: ScenarioResult): ScenarioResult {
    return {
      ...scenario,
      sessions: scenario.sessions.map((s) => ({
        ...s,
        output: '[stripped]',
      })),
      acceptanceResults: {
        ...scenario.acceptanceResults,
        output: '[stripped]',
      },
    };
  }

  /**
   * Summarize scenario for comparison report.
   */
  private summarizeScenario(scenario: ScenarioResult) {
    return {
      scenario: scenario.scenario,
      wallClockMs: scenario.wallClockMs,
      totalTokens: scenario.totalTokens,
      totalCostUsd: scenario.totalCostUsd,
      sessionCount: scenario.sessions.length,
      passRate: scenario.acceptanceResults.passRate,
      passed: scenario.acceptanceResults.passed,
      failed: scenario.acceptanceResults.failed,
    };
  }

  /**
   * Determine winner from comparison.
   */
  private determineWinner(comparison: ComparisonResult): string {
    let baselineWins = 0;
    let devpilotWins = 0;

    if (comparison.speedup > 1.1) devpilotWins++;
    else if (comparison.speedup < 0.9) baselineWins++;

    if (comparison.costReduction > 0.1) devpilotWins++;
    else if (comparison.costReduction < -0.1) baselineWins++;

    if (comparison.qualityDelta > 0.05) devpilotWins++;
    else if (comparison.qualityDelta < -0.05) baselineWins++;

    if (devpilotWins > baselineWins) return 'devpilot';
    if (baselineWins > devpilotWins) return 'baseline';
    return 'tie';
  }

  /**
   * Serialize to JSON string.
   */
  private serialize(data: unknown): string {
    return JSON.stringify(data, null, this.options.pretty ? 2 : undefined);
  }
}

/**
 * Create a JSON reporter.
 */
export function createJsonReporter(options?: JsonReportOptions): JsonReporter {
  return new JsonReporter(options);
}
