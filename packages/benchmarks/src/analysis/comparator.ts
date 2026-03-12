/**
 * Comparator
 *
 * Side-by-side comparison of baseline vs DevPilot scenario results.
 */

import type {
  ScenarioResult,
  ComparisonResult,
  CompositeScore,
  WaveAnalysis,
} from '../types';

/**
 * Compare baseline and DevPilot scenario results.
 */
export class Comparator {
  /**
   * Compare two scenario results.
   */
  compare(
    baseline: ScenarioResult,
    devpilot: ScenarioResult,
    waveAnalysis?: WaveAnalysis
  ): ComparisonResult {
    // Calculate speedup (baseline time / devpilot time)
    const speedup =
      devpilot.wallClockMs > 0
        ? baseline.wallClockMs / devpilot.wallClockMs
        : 1;

    // Calculate cost reduction (1 - devpilot/baseline)
    const costReduction =
      baseline.totalCostUsd > 0
        ? 1 - devpilot.totalCostUsd / baseline.totalCostUsd
        : 0;

    // Calculate time reduction
    const timeReductionMs = baseline.wallClockMs - devpilot.wallClockMs;
    const timeReductionPercent =
      baseline.wallClockMs > 0
        ? (timeReductionMs / baseline.wallClockMs) * 100
        : 0;

    // Calculate cost reduction in USD
    const costReductionUsd = baseline.totalCostUsd - devpilot.totalCostUsd;

    // Calculate quality delta (pass rate difference)
    const qualityDelta =
      devpilot.acceptanceResults.passRate -
      baseline.acceptanceResults.passRate;

    // Calculate token efficiency
    const tokenEfficiency =
      devpilot.totalTokens > 0
        ? baseline.totalTokens / devpilot.totalTokens
        : 1;

    // Wave plan score from analysis (0-25)
    const wavePlanScore = waveAnalysis?.score ?? 0;

    // Calculate composite advantage (difference in normalized scores)
    // This is a simplified calculation - actual implementation would use
    // full composite scores from both scenarios
    const compositeAdvantage = this.calculateCompositeAdvantage(
      baseline,
      devpilot,
      waveAnalysis
    );

    return {
      speedup,
      costReduction,
      timeReductionMs,
      timeReductionPercent,
      costReductionUsd,
      qualityDelta,
      tokenEfficiency,
      wavePlanScore,
      compositeAdvantage,
    };
  }

  /**
   * Calculate composite advantage between scenarios.
   */
  private calculateCompositeAdvantage(
    baseline: ScenarioResult,
    devpilot: ScenarioResult,
    waveAnalysis?: WaveAnalysis
  ): number {
    // Simple weighted advantage calculation
    const weights = {
      time: 0.3,
      cost: 0.25,
      quality: 0.25,
      wavePlan: 0.2,
    };

    // Time advantage (normalized to 0-100 scale based on 2x improvement = 50 points)
    const timeAdvantage = Math.min(
      100,
      ((baseline.wallClockMs - devpilot.wallClockMs) / baseline.wallClockMs) *
        100
    );

    // Cost advantage
    const costAdvantage = Math.min(
      100,
      ((baseline.totalCostUsd - devpilot.totalCostUsd) /
        baseline.totalCostUsd) *
        100
    );

    // Quality advantage (pass rate improvement)
    const qualityAdvantage =
      (devpilot.acceptanceResults.passRate -
        baseline.acceptanceResults.passRate) *
      100;

    // Wave plan quality (already 0-25, scale to 0-100)
    const wavePlanAdvantage = (waveAnalysis?.score ?? 0) * 4;

    return (
      timeAdvantage * weights.time +
      costAdvantage * weights.cost +
      qualityAdvantage * weights.quality +
      wavePlanAdvantage * weights.wavePlan
    );
  }

  /**
   * Generate a human-readable comparison summary.
   */
  static summarize(comparison: ComparisonResult): string[] {
    const lines: string[] = [];

    // Speedup
    if (comparison.speedup > 1) {
      lines.push(
        `DevPilot completed ${comparison.speedup.toFixed(2)}x faster`
      );
    } else if (comparison.speedup < 1) {
      lines.push(
        `Baseline was ${(1 / comparison.speedup).toFixed(2)}x faster`
      );
    } else {
      lines.push('Both scenarios completed in similar time');
    }

    // Cost
    if (comparison.costReduction > 0) {
      lines.push(
        `DevPilot saved ${(comparison.costReduction * 100).toFixed(1)}% on cost ($${comparison.costReductionUsd.toFixed(2)})`
      );
    } else if (comparison.costReduction < 0) {
      lines.push(
        `DevPilot cost ${(-comparison.costReduction * 100).toFixed(1)}% more`
      );
    }

    // Quality
    if (comparison.qualityDelta > 0) {
      lines.push(
        `DevPilot achieved ${(comparison.qualityDelta * 100).toFixed(1)}% higher pass rate`
      );
    } else if (comparison.qualityDelta < 0) {
      lines.push(
        `Baseline achieved ${(-comparison.qualityDelta * 100).toFixed(1)}% higher pass rate`
      );
    }

    // Token efficiency
    if (comparison.tokenEfficiency > 1.1) {
      lines.push(
        `DevPilot used ${((comparison.tokenEfficiency - 1) * 100).toFixed(1)}% fewer tokens`
      );
    } else if (comparison.tokenEfficiency < 0.9) {
      lines.push(
        `DevPilot used ${((1 - comparison.tokenEfficiency) * 100).toFixed(1)}% more tokens`
      );
    }

    // Wave plan quality
    if (comparison.wavePlanScore > 0) {
      lines.push(`Wave plan score: ${comparison.wavePlanScore}/25`);
    }

    return lines;
  }

  /**
   * Determine the overall winner.
   */
  static determineWinner(
    comparison: ComparisonResult
  ): 'baseline' | 'devpilot' | 'tie' {
    // Count wins
    let baselineWins = 0;
    let devpilotWins = 0;

    // Time
    if (comparison.speedup > 1.1) devpilotWins++;
    else if (comparison.speedup < 0.9) baselineWins++;

    // Cost
    if (comparison.costReduction > 0.1) devpilotWins++;
    else if (comparison.costReduction < -0.1) baselineWins++;

    // Quality
    if (comparison.qualityDelta > 0.05) devpilotWins++;
    else if (comparison.qualityDelta < -0.05) baselineWins++;

    if (devpilotWins > baselineWins) return 'devpilot';
    if (baselineWins > devpilotWins) return 'baseline';
    return 'tie';
  }
}

/**
 * Create a comparator.
 */
export function createComparator(): Comparator {
  return new Comparator();
}

/**
 * Quick helper to compare without instantiating.
 */
export function compareScenarios(
  baseline: ScenarioResult,
  devpilot: ScenarioResult,
  waveAnalysis?: WaveAnalysis
): ComparisonResult {
  const comparator = new Comparator();
  return comparator.compare(baseline, devpilot, waveAnalysis);
}
