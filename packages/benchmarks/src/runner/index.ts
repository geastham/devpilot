/**
 * Runner Module
 *
 * Main benchmark runner orchestration.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { createId } from '@paralleldrive/cuid2';

import type {
  BenchmarkId,
  BenchmarkRun,
  ScenarioResult,
  RunConfig,
  GroundTruth,
  ComparisonResult,
  WaveAnalysis,
  CompositeScore,
  RunManifest,
} from '../types';

import { ProcessManager, createProcessManager } from './process-manager';
import { WorkspaceManager, createWorkspaceManager } from './environment';
import { AcceptanceRunner, createAcceptanceRunner } from './acceptance';
import { BaselineExecutor, createBaselineExecutor } from './baseline-executor';
import { DevPilotExecutor, createDevPilotExecutor } from './devpilot-executor';

import { createMetricsCollector, MetricsCollector } from '../metrics/collector';
import { getVersionInfo } from '../storage/version-tagger';
import { ResultsWriter, createResultsWriter } from '../storage/results-writer';
import { ScoringEngine, createScoringEngine } from '../analysis/scoring';
import { WaveAnalyzer, createWaveAnalyzer } from '../analysis/wave-analyzer';
import { Comparator, createComparator } from '../analysis/comparator';

export interface BenchmarkRunnerConfig {
  benchmarksDir: string;
  resultsDir: string;
  projectRoot?: string;
  parallel?: boolean;
  timeoutMs?: number;
  maxConcurrency?: number;
  claudeCliPath?: string;
  archiveWorkspaces?: boolean;
  verbose?: boolean;
}

export interface BenchmarkResult {
  benchmarkId: BenchmarkId;
  baseline?: ScenarioResult;
  devpilot?: ScenarioResult;
  comparison?: ComparisonResult;
  waveAnalysis?: WaveAnalysis;
  baselineScore?: CompositeScore;
  devpilotScore?: CompositeScore;
  groundTruth?: GroundTruth;
}

/**
 * Main benchmark runner that orchestrates execution.
 */
export class BenchmarkRunner {
  private config: Required<BenchmarkRunnerConfig>;
  private processManager: ProcessManager;
  private workspaceManager: WorkspaceManager;
  private acceptanceRunner: AcceptanceRunner;
  private baselineExecutor: BaselineExecutor;
  private devpilotExecutor: DevPilotExecutor;
  private resultsWriter: ResultsWriter;
  private scoringEngine: ScoringEngine;
  private waveAnalyzer: WaveAnalyzer;
  private comparator: Comparator;

  constructor(config: BenchmarkRunnerConfig) {
    this.config = {
      benchmarksDir: config.benchmarksDir,
      resultsDir: config.resultsDir,
      projectRoot: config.projectRoot ?? process.cwd(),
      parallel: config.parallel ?? false,
      timeoutMs: config.timeoutMs ?? 600000,
      maxConcurrency: config.maxConcurrency ?? 4,
      claudeCliPath: config.claudeCliPath ?? 'claude',
      archiveWorkspaces: config.archiveWorkspaces ?? false,
      verbose: config.verbose ?? false,
    };

    // Initialize components
    this.processManager = createProcessManager(this.config.timeoutMs);
    this.workspaceManager = createWorkspaceManager(this.processManager);
    this.acceptanceRunner = createAcceptanceRunner(this.processManager);

    this.baselineExecutor = createBaselineExecutor(
      this.processManager,
      this.acceptanceRunner,
      {
        timeoutMs: this.config.timeoutMs,
        claudeCliPath: this.config.claudeCliPath,
        verbose: this.config.verbose,
      }
    );

    this.devpilotExecutor = createDevPilotExecutor(
      this.processManager,
      this.acceptanceRunner,
      {
        timeoutMs: this.config.timeoutMs,
        maxConcurrency: this.config.maxConcurrency,
        claudeCliPath: this.config.claudeCliPath,
        verbose: this.config.verbose,
      }
    );

    this.resultsWriter = createResultsWriter({
      resultsDir: this.config.resultsDir,
      projectRoot: this.config.projectRoot,
    });
    this.scoringEngine = createScoringEngine();
    this.waveAnalyzer = createWaveAnalyzer();
    this.comparator = createComparator();
  }

  /**
   * Run benchmarks.
   */
  async run(runConfig: RunConfig): Promise<RunManifest> {
    const runId = createId();
    const startTime = new Date();
    const results: BenchmarkResult[] = [];

    // Get version info
    const version = await getVersionInfo(this.config.projectRoot);

    if (this.config.verbose) {
      console.log(`Starting benchmark run ${runId}`);
      console.log(`Version: ${version.version}`);
      console.log(`Benchmarks: ${runConfig.benchmarks.join(', ')}`);
      console.log(`Scenarios: ${runConfig.scenarios.join(', ')}`);
    }

    try {
      // Load ground truth files
      const groundTruths = await this.loadGroundTruths(runConfig.benchmarks);

      // Execute benchmarks
      if (this.config.parallel) {
        // Run benchmarks in parallel
        const benchmarkPromises = runConfig.benchmarks.map((benchmarkId) =>
          this.runBenchmark(runId, benchmarkId, runConfig, groundTruths.get(benchmarkId))
        );
        const benchmarkResults = await Promise.all(benchmarkPromises);
        results.push(...benchmarkResults);
      } else {
        // Run benchmarks sequentially
        for (const benchmarkId of runConfig.benchmarks) {
          const result = await this.runBenchmark(
            runId,
            benchmarkId,
            runConfig,
            groundTruths.get(benchmarkId)
          );
          results.push(result);
        }
      }

      // Create run manifest with one BenchmarkRun per benchmark
      const endTime = new Date();
      const benchmarks: BenchmarkRun[] = results.map((r) => ({
        id: createId(),
        benchmarkId: r.benchmarkId,
        devpilotVersion: version.version,
        gitCommit: version.gitCommit,
        gitTag: version.gitTag,
        timestamp: startTime.toISOString(),
        config: runConfig,
        scenarios: {
          baseline: r.baseline ?? null,
          devpilot: r.devpilot ?? null,
        },
        comparison: r.comparison ?? null,
        compositeScore: r.devpilotScore ?? r.baselineScore ?? null,
        waveAnalysis: r.waveAnalysis ?? null,
      }));

      const manifest: RunManifest = {
        id: runId,
        version: version.version,
        gitCommit: version.gitCommit,
        gitTag: version.gitTag,
        timestamp: startTime.toISOString(),
        config: runConfig,
        status: this.determineStatus(results),
        durationMs: endTime.getTime() - startTime.getTime(),
        benchmarks,
        summary: this.createSummary(results),
        pricingSnapshot: createMetricsCollector().getPricingSnapshot(),
      };

      // Write results (writeRunManifest creates the run dir and latest symlink)
      const runDir = await this.resultsWriter.writeRunManifest(manifest);

      for (const benchmarkRun of benchmarks) {
        await this.resultsWriter.writeBenchmarkResult(runDir, benchmarkRun);
        if (benchmarkRun.waveAnalysis) {
          await this.resultsWriter.writeWaveAnalysis(
            join(runDir, benchmarkRun.benchmarkId),
            benchmarkRun.waveAnalysis
          );
        }
      }

      return manifest;
    } finally {
      // Cleanup workspaces
      await this.workspaceManager.cleanupAll();
      await this.processManager.killAll();
    }
  }

  /**
   * Run a single benchmark.
   */
  private async runBenchmark(
    runId: string,
    benchmarkId: BenchmarkId,
    runConfig: RunConfig,
    groundTruth?: GroundTruth
  ): Promise<BenchmarkResult> {
    const result: BenchmarkResult = {
      benchmarkId,
      groundTruth,
    };

    // Run baseline scenario
    if (runConfig.scenarios.includes('baseline')) {
      const baselineWorkspace = await this.workspaceManager.createWorkspace({
        runId,
        benchmarkId,
        scenario: 'baseline',
        benchmarksDir: this.config.benchmarksDir,
        archiveOnCleanup: this.config.archiveWorkspaces,
      });

      const baselineCollector = createMetricsCollector();
      result.baseline = await this.baselineExecutor.execute(baselineWorkspace, baselineCollector);
      result.baselineScore = this.scoringEngine.calculateScore(result.baseline);

      // Cleanup baseline workspace
      const workspaceId = WorkspaceManager.getWorkspaceId(runId, 'baseline', benchmarkId);
      await this.workspaceManager.cleanupWorkspace(workspaceId, {
        archive: this.config.archiveWorkspaces,
        archivePath: join(
          this.config.resultsDir,
          'archives',
          `${runId}-${benchmarkId}-baseline.tar.gz`
        ),
      });
    }

    // Run DevPilot scenario
    if (runConfig.scenarios.includes('devpilot')) {
      const devpilotWorkspace = await this.workspaceManager.createWorkspace({
        runId,
        benchmarkId,
        scenario: 'devpilot',
        benchmarksDir: this.config.benchmarksDir,
        archiveOnCleanup: this.config.archiveWorkspaces,
      });

      const devpilotCollector = createMetricsCollector();
      result.devpilot = await this.devpilotExecutor.execute(devpilotWorkspace, devpilotCollector);

      // Analyze wave plan against ground truth
      if (groundTruth && result.devpilot.wavePlan) {
        result.waveAnalysis = this.waveAnalyzer.analyze(result.devpilot.wavePlan, groundTruth);
      }

      result.devpilotScore = this.scoringEngine.calculateScore(
        result.devpilot,
        result.waveAnalysis
      );

      // Cleanup DevPilot workspace
      const workspaceId = WorkspaceManager.getWorkspaceId(runId, 'devpilot', benchmarkId);
      await this.workspaceManager.cleanupWorkspace(workspaceId, {
        archive: this.config.archiveWorkspaces,
        archivePath: join(
          this.config.resultsDir,
          'archives',
          `${runId}-${benchmarkId}-devpilot.tar.gz`
        ),
      });
    }

    // Compare scenarios
    if (result.baseline && result.devpilot) {
      result.comparison = this.comparator.compare(
        result.baseline,
        result.devpilot,
        result.waveAnalysis
      );
    }

    return result;
  }

  /**
   * Load ground truth files.
   */
  private async loadGroundTruths(
    benchmarkIds: BenchmarkId[]
  ): Promise<Map<BenchmarkId, GroundTruth>> {
    const groundTruths = new Map<BenchmarkId, GroundTruth>();
    const groundTruthDir = join(this.config.benchmarksDir, 'ground-truth');

    for (const benchmarkId of benchmarkIds) {
      try {
        // Try exact match
        const exactPath = join(groundTruthDir, `${benchmarkId}.json`);
        const content = await readFile(exactPath, 'utf-8');
        groundTruths.set(benchmarkId, JSON.parse(content));
      } catch {
        // Try prefix match
        try {
          const prefix = benchmarkId.split('-')[0];
          const files = await import('fs/promises').then((fs) => fs.readdir(groundTruthDir));
          const matchingFile = files.find((f) => f.startsWith(`${prefix}-`) && f.endsWith('.json'));
          if (matchingFile) {
            const content = await readFile(join(groundTruthDir, matchingFile), 'utf-8');
            groundTruths.set(benchmarkId, JSON.parse(content));
          }
        } catch {
          // Ground truth not found
        }
      }
    }

    return groundTruths;
  }

  /**
   * Create run summary.
   */
  private createSummary(results: BenchmarkResult[]): RunManifest['summary'] {
    const comparisons = results
      .filter((r) => r.comparison)
      .map((r) => r.comparison!);

    const passedBenchmarks = results.filter(
      (r) =>
        (!r.baseline || r.baseline.acceptanceResults.passRate === 1) &&
        (!r.devpilot || r.devpilot.acceptanceResults.passRate === 1)
    ).length;

    const scores = results
      .map((r) => r.devpilotScore ?? r.baselineScore)
      .filter((s): s is CompositeScore => s !== undefined);
    const avgCompositeScore =
      scores.length > 0
        ? scores.reduce((sum, s) => sum + s.total, 0) / scores.length
        : 0;

    if (comparisons.length === 0) {
      return {
        totalBenchmarks: results.length,
        passedBenchmarks,
        avgSpeedup: 1,
        avgCostReduction: 0,
        avgQualityDelta: 0,
        avgCompositeScore,
      };
    }

    return {
      totalBenchmarks: results.length,
      passedBenchmarks,
      avgSpeedup:
        comparisons.reduce((sum, c) => sum + c.speedup, 0) / comparisons.length,
      avgCostReduction:
        comparisons.reduce((sum, c) => sum + c.costReduction, 0) / comparisons.length,
      avgQualityDelta:
        comparisons.reduce((sum, c) => sum + c.qualityDelta, 0) / comparisons.length,
      avgCompositeScore,
    };
  }

  /**
   * Determine overall run status.
   */
  private determineStatus(results: BenchmarkResult[]): RunManifest['status'] {
    const hasErrors = results.some(
      (r) =>
        (r.baseline?.errors?.length ?? 0) > 0 || (r.devpilot?.errors?.length ?? 0) > 0
    );

    if (hasErrors) return 'failed';

    const allPassed = results.every(
      (r) =>
        (!r.baseline || r.baseline.acceptanceResults.passRate === 1) &&
        (!r.devpilot || r.devpilot.acceptanceResults.passRate === 1)
    );

    if (allPassed) return 'completed';
    return 'partial';
  }
}

/**
 * Create a benchmark runner.
 */
export function createBenchmarkRunner(config: BenchmarkRunnerConfig): BenchmarkRunner {
  return new BenchmarkRunner(config);
}

// Re-export components
export { ProcessManager, createProcessManager } from './process-manager';
export { WorkspaceManager, createWorkspaceManager } from './environment';
export { AcceptanceRunner, createAcceptanceRunner } from './acceptance';
export { BaselineExecutor, createBaselineExecutor } from './baseline-executor';
export { DevPilotExecutor, createDevPilotExecutor } from './devpilot-executor';
