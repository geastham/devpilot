/**
 * Console Reporter
 *
 * Rich terminal output for benchmark results.
 */

import chalk from 'chalk';
import type {
  BenchmarkRun,
  ScenarioResult,
  ComparisonResult,
  WaveAnalysis,
  CompositeScore,
  TrendAnalysis,
  TrendDirection,
} from '../types';

const BOX_CHARS = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',
  teeRight: '├',
  teeLeft: '┤',
  teeDown: '┬',
  teeUp: '┴',
  cross: '┼',
};

/**
 * Console reporter for terminal output.
 */
export class ConsoleReporter {
  private verbose: boolean;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
  }

  /**
   * Print run header.
   */
  printHeader(run: BenchmarkRun): void {
    console.log('');
    console.log(chalk.bold.blue('╔════════════════════════════════════════════════════════════╗'));
    console.log(chalk.bold.blue('║') + chalk.bold.white('            DevPilot Benchmark Suite                        ') + chalk.bold.blue('║'));
    console.log(chalk.bold.blue('╚════════════════════════════════════════════════════════════╝'));
    console.log('');
    console.log(`  ${chalk.gray('Version:')}    ${run.version}`);
    console.log(`  ${chalk.gray('Run ID:')}     ${run.id}`);
    console.log(`  ${chalk.gray('Timestamp:')}  ${run.timestamp}`);
    console.log('');
  }

  /**
   * Print run summary.
   */
  printSummary(run: BenchmarkRun): void {
    const { summary } = run;

    console.log(chalk.bold('Summary'));
    console.log(BOX_CHARS.topLeft + BOX_CHARS.horizontal.repeat(58) + BOX_CHARS.topRight);

    console.log(
      BOX_CHARS.vertical +
        ` Benchmarks: ${summary.totalBenchmarks.toString().padEnd(45)}` +
        BOX_CHARS.vertical
    );

    const speedupStr = summary.avgSpeedup > 1
      ? chalk.green(`${summary.avgSpeedup.toFixed(2)}x faster`)
      : summary.avgSpeedup < 1
      ? chalk.red(`${(1 / summary.avgSpeedup).toFixed(2)}x slower`)
      : chalk.gray('no change');
    console.log(
      BOX_CHARS.vertical +
        ` Avg Speedup: ${speedupStr.padEnd(44)}` +
        BOX_CHARS.vertical
    );

    const costStr = summary.avgCostReduction > 0
      ? chalk.green(`${(summary.avgCostReduction * 100).toFixed(1)}% reduction`)
      : summary.avgCostReduction < 0
      ? chalk.red(`${(-summary.avgCostReduction * 100).toFixed(1)}% increase`)
      : chalk.gray('no change');
    console.log(
      BOX_CHARS.vertical +
        ` Avg Cost: ${costStr.padEnd(47)}` +
        BOX_CHARS.vertical
    );

    const qualityStr = summary.avgQualityDelta > 0
      ? chalk.green(`+${(summary.avgQualityDelta * 100).toFixed(1)}%`)
      : summary.avgQualityDelta < 0
      ? chalk.red(`${(summary.avgQualityDelta * 100).toFixed(1)}%`)
      : chalk.gray('no change');
    console.log(
      BOX_CHARS.vertical +
        ` Avg Quality Delta: ${qualityStr.padEnd(38)}` +
        BOX_CHARS.vertical
    );

    console.log(BOX_CHARS.bottomLeft + BOX_CHARS.horizontal.repeat(58) + BOX_CHARS.bottomRight);
    console.log('');
  }

  /**
   * Print results table.
   */
  printResultsTable(run: BenchmarkRun): void {
    console.log(chalk.bold('Results'));
    console.log('');

    // Header
    console.log(
      chalk.gray('  Benchmark'.padEnd(25)) +
        chalk.gray('Speedup'.padEnd(12)) +
        chalk.gray('Cost'.padEnd(12)) +
        chalk.gray('Quality'.padEnd(12)) +
        chalk.gray('Wave'.padEnd(10))
    );
    console.log(chalk.gray('  ' + '─'.repeat(65)));

    for (const result of run.results) {
      const name = result.benchmarkId.padEnd(23);

      const speedup = result.comparison
        ? this.formatSpeedup(result.comparison.speedup)
        : chalk.gray('-'.padEnd(10));

      const cost = result.comparison
        ? this.formatPercentage(result.comparison.costReduction, true)
        : chalk.gray('-'.padEnd(10));

      const quality = result.comparison
        ? this.formatPercentage(result.comparison.qualityDelta, true)
        : chalk.gray('-'.padEnd(10));

      const wave = result.waveAnalysis
        ? this.formatWaveScore(result.waveAnalysis.score)
        : chalk.gray('-'.padEnd(8));

      console.log(`  ${name}${speedup}${cost}${quality}${wave}`);
    }

    console.log('');
  }

  /**
   * Print comparison details.
   */
  printComparison(
    benchmarkId: string,
    comparison: ComparisonResult,
    waveAnalysis?: WaveAnalysis
  ): void {
    console.log(chalk.bold(`\n${benchmarkId} Comparison`));
    console.log(chalk.gray('─'.repeat(40)));

    console.log(`  Speedup:          ${this.formatSpeedup(comparison.speedup)}`);
    console.log(`  Cost Reduction:   ${this.formatPercentage(comparison.costReduction, true)}`);
    console.log(`  Time Saved:       ${this.formatDuration(comparison.timeReductionMs)}`);
    console.log(`  Token Efficiency: ${this.formatSpeedup(comparison.tokenEfficiency)}`);
    console.log(`  Quality Delta:    ${this.formatPercentage(comparison.qualityDelta, true)}`);

    if (waveAnalysis) {
      console.log('');
      console.log(chalk.bold('  Wave Plan Analysis'));
      console.log(`    Score:              ${this.formatWaveScore(waveAnalysis.score)}`);
      console.log(
        `    Task Accuracy:      ${(waveAnalysis.taskPlacementAccuracy * 100).toFixed(1)}%`
      );
      console.log(
        `    Dependency Errors:  ${waveAnalysis.dependencyViolations.length}`
      );
      console.log(
        `    Missed Parallelism: ${waveAnalysis.missedParallelism.length}`
      );
    }
  }

  /**
   * Print score card.
   */
  printScoreCard(scenario: ScenarioResult, score: CompositeScore): void {
    console.log(chalk.bold(`\n${scenario.scenario.toUpperCase()} Score Card`));
    console.log(chalk.gray('─'.repeat(50)));

    const gradeColor =
      score.grade === 'A'
        ? chalk.green
        : score.grade === 'B'
        ? chalk.blue
        : score.grade === 'C'
        ? chalk.yellow
        : score.grade === 'D'
        ? chalk.magenta
        : chalk.red;

    console.log(`  Total Score: ${gradeColor.bold(score.total.toFixed(1))} ${gradeColor(`(${score.grade})`)}`);
    console.log('');

    const { breakdown } = score;
    this.printScoreBar('Acceptance', breakdown.acceptanceTests.normalized, breakdown.acceptanceTests.weight);
    this.printScoreBar('Wave Plan', breakdown.wavePlanQuality.normalized, breakdown.wavePlanQuality.weight);
    this.printScoreBar('First Attempt', breakdown.firstAttemptPassRate.normalized, breakdown.firstAttemptPassRate.weight);
    this.printScoreBar('Time', breakdown.completionTime.normalized, breakdown.completionTime.weight);
    this.printScoreBar('Rework', breakdown.reworkRatio.normalized, breakdown.reworkRatio.weight);
  }

  /**
   * Print a score bar.
   */
  private printScoreBar(label: string, score: number, weight: number): void {
    const barWidth = 20;
    const filledWidth = Math.round((score / 100) * barWidth);
    const emptyWidth = barWidth - filledWidth;

    const color =
      score >= 80 ? chalk.green : score >= 60 ? chalk.yellow : chalk.red;

    const bar = color('█'.repeat(filledWidth)) + chalk.gray('░'.repeat(emptyWidth));
    const weightStr = `(${(weight * 100).toFixed(0)}%)`.padEnd(6);

    console.log(`  ${label.padEnd(14)} ${bar} ${score.toFixed(1).padStart(5)}/100 ${chalk.gray(weightStr)}`);
  }

  /**
   * Print trend analysis.
   */
  printTrends(analysis: TrendAnalysis): void {
    console.log(chalk.bold(`\n${analysis.benchmarkId} Trends`));
    console.log(chalk.gray('─'.repeat(40)));

    console.log(`  Data Points:    ${analysis.versions.length}`);
    console.log(`  Best Version:   ${analysis.bestVersion || 'N/A'}`);
    console.log('');

    console.log('  Trends:');
    console.log(`    Speedup:  ${this.formatTrendDirection(analysis.trends.speedupTrend)}`);
    console.log(`    Cost:     ${this.formatTrendDirection(analysis.trends.costTrend)}`);
    console.log(`    Quality:  ${this.formatTrendDirection(analysis.trends.qualityTrend)}`);

    if (analysis.versions.length >= 2) {
      console.log('');
      console.log('  Latest Changes:');
      console.log(
        `    Speedup:  ${this.formatDelta(analysis.latestDelta.speedupChange, 'x')}`
      );
      console.log(
        `    Cost:     ${this.formatDelta(analysis.latestDelta.costChange * 100, '%')}`
      );
      console.log(
        `    Score:    ${this.formatDelta(analysis.latestDelta.scoreChange, '')}`
      );
    }
  }

  /**
   * Print progress during execution.
   */
  printProgress(message: string, current?: number, total?: number): void {
    if (current !== undefined && total !== undefined) {
      const percent = Math.round((current / total) * 100);
      const bar = this.createProgressBar(percent, 20);
      process.stdout.write(`\r  ${bar} ${percent.toString().padStart(3)}% ${message.padEnd(40)}`);
    } else {
      console.log(`  ${chalk.blue('→')} ${message}`);
    }
  }

  /**
   * Print success message.
   */
  printSuccess(message: string): void {
    console.log(`  ${chalk.green('✓')} ${message}`);
  }

  /**
   * Print error message.
   */
  printError(message: string): void {
    console.log(`  ${chalk.red('✗')} ${message}`);
  }

  /**
   * Print warning message.
   */
  printWarning(message: string): void {
    console.log(`  ${chalk.yellow('!')} ${message}`);
  }

  /**
   * Create a progress bar.
   */
  private createProgressBar(percent: number, width: number): string {
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    return chalk.blue('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  }

  /**
   * Format speedup value.
   */
  private formatSpeedup(speedup: number): string {
    const str = `${speedup.toFixed(2)}x`;
    if (speedup > 1.1) return chalk.green(str.padEnd(10));
    if (speedup < 0.9) return chalk.red(str.padEnd(10));
    return chalk.gray(str.padEnd(10));
  }

  /**
   * Format percentage value.
   */
  private formatPercentage(value: number, isGood: boolean): string {
    const percent = value * 100;
    const sign = percent >= 0 ? '+' : '';
    const str = `${sign}${percent.toFixed(1)}%`;

    if (isGood) {
      if (value > 0.05) return chalk.green(str.padEnd(10));
      if (value < -0.05) return chalk.red(str.padEnd(10));
    } else {
      if (value < -0.05) return chalk.green(str.padEnd(10));
      if (value > 0.05) return chalk.red(str.padEnd(10));
    }
    return chalk.gray(str.padEnd(10));
  }

  /**
   * Format wave score.
   */
  private formatWaveScore(score: number): string {
    const str = `${score}/25`;
    if (score >= 20) return chalk.green(str.padEnd(8));
    if (score >= 15) return chalk.blue(str.padEnd(8));
    if (score >= 10) return chalk.yellow(str.padEnd(8));
    return chalk.red(str.padEnd(8));
  }

  /**
   * Format duration.
   */
  private formatDuration(ms: number): string {
    if (ms < 0) {
      return chalk.red(`-${this.formatDurationAbs(-ms)}`);
    }
    return chalk.green(`+${this.formatDurationAbs(ms)}`);
  }

  private formatDurationAbs(ms: number): string {
    const absMs = Math.abs(ms);
    if (absMs < 1000) return `${absMs}ms`;
    if (absMs < 60000) return `${(absMs / 1000).toFixed(1)}s`;
    const minutes = Math.floor(absMs / 60000);
    const seconds = Math.floor((absMs % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  /**
   * Format trend direction.
   */
  private formatTrendDirection(direction: TrendDirection): string {
    switch (direction) {
      case 'improving':
        return chalk.green('↑ Improving');
      case 'regressing':
        return chalk.red('↓ Regressing');
      case 'stable':
        return chalk.gray('→ Stable');
    }
  }

  /**
   * Format delta value.
   */
  private formatDelta(value: number, suffix: string): string {
    const sign = value >= 0 ? '+' : '';
    const str = `${sign}${value.toFixed(2)}${suffix}`;
    if (value > 0) return chalk.green(str);
    if (value < 0) return chalk.red(str);
    return chalk.gray(str);
  }
}

/**
 * Create a console reporter.
 */
export function createConsoleReporter(verbose?: boolean): ConsoleReporter {
  return new ConsoleReporter(verbose);
}
