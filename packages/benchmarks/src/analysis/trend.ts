/**
 * Trend Analyzer
 *
 * Cross-version trend analysis for benchmark results.
 */

import type {
  BenchmarkId,
  TrendAnalysis,
  TrendDirection,
  VersionDataPoint,
} from '../types';

/**
 * Threshold for considering a change significant.
 */
const TREND_THRESHOLD = 0.05; // 5%

/**
 * Analyzes trends across multiple benchmark runs.
 */
export class TrendAnalyzer {
  /**
   * Analyze trends for a benchmark.
   */
  analyze(
    benchmarkId: BenchmarkId,
    dataPoints: VersionDataPoint[]
  ): TrendAnalysis {
    if (dataPoints.length === 0) {
      return this.emptyAnalysis(benchmarkId);
    }

    // Sort by timestamp (oldest first for trend calculation)
    const sorted = [...dataPoints].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Calculate trends
    const speedupTrend = this.calculateTrend(sorted.map((d) => d.speedup));
    const costTrend = this.calculateTrend(
      sorted.map((d) => d.costReduction),
      true // Higher is better
    );
    const qualityTrend = this.calculateTrend(
      sorted.map((d) => d.passRate),
      true // Higher is better
    );

    // Find best version (highest composite score)
    const bestVersion = sorted.reduce((best, current) =>
      current.compositeScore > best.compositeScore ? current : best
    ).version;

    // Calculate delta from previous version
    const latestDelta = this.calculateLatestDelta(sorted);

    return {
      benchmarkId,
      versions: sorted,
      trends: {
        speedupTrend,
        costTrend,
        qualityTrend,
      },
      bestVersion,
      latestDelta,
    };
  }

  /**
   * Calculate trend direction from a series of values.
   */
  private calculateTrend(
    values: number[],
    higherIsBetter: boolean = true
  ): TrendDirection {
    if (values.length < 2) return 'stable';

    // Use linear regression to determine trend
    const slope = this.linearRegressionSlope(values);

    // Calculate percentage change from first to last
    const firstValue = values[0];
    const lastValue = values[values.length - 1];
    const percentChange =
      firstValue !== 0 ? (lastValue - firstValue) / Math.abs(firstValue) : 0;

    // Determine direction based on threshold
    if (Math.abs(percentChange) < TREND_THRESHOLD) {
      return 'stable';
    }

    const improving = higherIsBetter ? percentChange > 0 : percentChange < 0;
    return improving ? 'improving' : 'regressing';
  }

  /**
   * Calculate linear regression slope.
   */
  private linearRegressionSlope(values: number[]): number {
    const n = values.length;
    if (n < 2) return 0;

    // Use indices as x values
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
    }

    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) return 0;

    return (n * sumXY - sumX * sumY) / denominator;
  }

  /**
   * Calculate delta from the previous version.
   */
  private calculateLatestDelta(sorted: VersionDataPoint[]): {
    speedupChange: number;
    costChange: number;
    scoreChange: number;
  } {
    if (sorted.length < 2) {
      return {
        speedupChange: 0,
        costChange: 0,
        scoreChange: 0,
      };
    }

    const latest = sorted[sorted.length - 1];
    const previous = sorted[sorted.length - 2];

    return {
      speedupChange: latest.speedup - previous.speedup,
      costChange: latest.costReduction - previous.costReduction,
      scoreChange: latest.compositeScore - previous.compositeScore,
    };
  }

  /**
   * Create an empty analysis for when there's no data.
   */
  private emptyAnalysis(benchmarkId: BenchmarkId): TrendAnalysis {
    return {
      benchmarkId,
      versions: [],
      trends: {
        speedupTrend: 'stable',
        costTrend: 'stable',
        qualityTrend: 'stable',
      },
      bestVersion: '',
      latestDelta: {
        speedupChange: 0,
        costChange: 0,
        scoreChange: 0,
      },
    };
  }

  /**
   * Calculate statistics for a series of values.
   */
  static calculateStatistics(values: number[]): {
    mean: number;
    median: number;
    stdDev: number;
    min: number;
    max: number;
  } {
    if (values.length === 0) {
      return { mean: 0, median: 0, stdDev: 0, min: 0, max: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const n = values.length;

    // Mean
    const mean = values.reduce((a, b) => a + b, 0) / n;

    // Median
    const median =
      n % 2 === 0
        ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
        : sorted[Math.floor(n / 2)];

    // Standard deviation
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / n;
    const stdDev = Math.sqrt(avgSquaredDiff);

    return {
      mean,
      median,
      stdDev,
      min: sorted[0],
      max: sorted[n - 1],
    };
  }

  /**
   * Format trend direction for display.
   */
  static formatTrend(direction: TrendDirection): string {
    switch (direction) {
      case 'improving':
        return '↑ Improving';
      case 'regressing':
        return '↓ Regressing';
      case 'stable':
        return '→ Stable';
    }
  }

  /**
   * Generate a trend summary.
   */
  static summarize(analysis: TrendAnalysis): string[] {
    const lines: string[] = [];

    lines.push(`Benchmark: ${analysis.benchmarkId}`);
    lines.push(`Data points: ${analysis.versions.length}`);

    if (analysis.versions.length > 0) {
      lines.push(`Best version: ${analysis.bestVersion}`);
      lines.push('');
      lines.push('Trends:');
      lines.push(`  Speedup: ${this.formatTrend(analysis.trends.speedupTrend)}`);
      lines.push(`  Cost: ${this.formatTrend(analysis.trends.costTrend)}`);
      lines.push(`  Quality: ${this.formatTrend(analysis.trends.qualityTrend)}`);

      if (analysis.versions.length >= 2) {
        lines.push('');
        lines.push('Latest changes:');
        lines.push(
          `  Speedup: ${analysis.latestDelta.speedupChange > 0 ? '+' : ''}${analysis.latestDelta.speedupChange.toFixed(2)}x`
        );
        lines.push(
          `  Cost reduction: ${analysis.latestDelta.costChange > 0 ? '+' : ''}${(analysis.latestDelta.costChange * 100).toFixed(1)}%`
        );
        lines.push(
          `  Score: ${analysis.latestDelta.scoreChange > 0 ? '+' : ''}${analysis.latestDelta.scoreChange.toFixed(1)}`
        );
      }
    }

    return lines;
  }
}

/**
 * Create a trend analyzer.
 */
export function createTrendAnalyzer(): TrendAnalyzer {
  return new TrendAnalyzer();
}

/**
 * Quick helper to analyze trends.
 */
export function analyzeTrends(
  benchmarkId: BenchmarkId,
  dataPoints: VersionDataPoint[]
): TrendAnalysis {
  const analyzer = new TrendAnalyzer();
  return analyzer.analyze(benchmarkId, dataPoints);
}
