/**
 * DevPilot Benchmark Suite - Configuration Schema
 *
 * Zod schemas for validating benchmark configuration.
 */

import { z } from 'zod';
import type { ModelPricing, RunConfig } from './types';

// =============================================================================
// Enum Schemas
// =============================================================================

export const BenchmarkIdSchema = z.enum([
  '01-forgepress',
  '02-taskforge',
  '03-insightboard',
]);

export const ScenarioTypeSchema = z.enum(['baseline', 'devpilot']);

export const ModelTierSchema = z.enum(['haiku', 'sonnet', 'opus']);

// =============================================================================
// Model Pricing Schema
// =============================================================================

export const ModelPricingSchema = z.object({
  model: z.string(),
  inputPer1M: z.number().positive(),
  outputPer1M: z.number().positive(),
  cacheReadPer1M: z.number().nonnegative(),
  cacheWritePer1M: z.number().nonnegative(),
});

// =============================================================================
// Default Pricing (as of spec date - March 2026)
// =============================================================================

export const DEFAULT_MODEL_PRICING: ModelPricing[] = [
  {
    model: 'haiku',
    inputPer1M: 0.25,
    outputPer1M: 1.25,
    cacheReadPer1M: 0.025,
    cacheWritePer1M: 0.30,
  },
  {
    model: 'sonnet',
    inputPer1M: 3.0,
    outputPer1M: 15.0,
    cacheReadPer1M: 0.30,
    cacheWritePer1M: 3.75,
  },
  {
    model: 'opus',
    inputPer1M: 15.0,
    outputPer1M: 75.0,
    cacheReadPer1M: 1.50,
    cacheWritePer1M: 18.75,
  },
];

// =============================================================================
// Benchmark Configuration Schema
// =============================================================================

export const BenchmarkConfigSchema = z.object({
  // Benchmark selection
  benchmarks: z.object({
    /** Benchmark IDs to include */
    include: z.array(BenchmarkIdSchema).default([
      '01-forgepress',
      '02-taskforge',
      '03-insightboard',
    ]),
    /** Path to benchmark definitions */
    benchmarkDir: z.string().default('./benchmarks'),
    /** Path to ground truth files */
    groundTruthDir: z.string().default('./benchmarks/ground-truth'),
  }).default({}),

  // Baseline scenario settings
  baseline: z.object({
    /** Path to Claude Code CLI binary */
    claudeCodeBinary: z.string().default('claude'),
    /** Model to use */
    model: ModelTierSchema.default('sonnet'),
    /** Maximum retries on failure */
    maxRetries: z.number().int().nonnegative().default(1),
  }).default({}),

  // DevPilot scenario settings
  devpilot: z.object({
    /** Orchestrator mode */
    orchestratorMode: z.enum(['http', 'ao-cli']).default('ao-cli'),
    /** HTTP orchestrator URL (for http mode) */
    orchestratorUrl: z.string().url().optional(),
    /** API key for orchestrator */
    apiKey: z.string().optional(),
    /** Max concurrent sessions */
    maxConcurrentSessions: z.number().int().positive().default(4),
    /** Model for planning */
    planningModel: ModelTierSchema.default('sonnet'),
    /** Model for execution */
    executionModel: ModelTierSchema.default('sonnet'),
    /** Agent-orchestrator project name (for ao-cli mode) */
    aoProjectName: z.string().optional(),
  }).default({}),

  // Execution settings
  execution: z.object({
    /** Timeout per scenario in minutes */
    timeoutMinutes: z.number().positive().default(10),
    /** Ideal completion time in minutes (for scoring) */
    idealTimeMinutes: z.number().positive().default(5),
    /** Number of iterations per scenario */
    iterations: z.number().int().positive().default(1),
    /** Run benchmarks in parallel */
    parallel: z.boolean().default(false),
    /** Archive workspaces after execution */
    archiveWorkspaces: z.boolean().default(true),
  }).default({}),

  // Pricing configuration
  pricing: z.array(ModelPricingSchema).default(DEFAULT_MODEL_PRICING),

  // Scoring weights
  scoring: z.object({
    weights: z.object({
      acceptanceTests: z.number().min(0).max(1).default(0.30),
      wavePlanQuality: z.number().min(0).max(1).default(0.25),
      firstAttemptPassRate: z.number().min(0).max(1).default(0.20),
      completionTime: z.number().min(0).max(1).default(0.15),
      reworkRatio: z.number().min(0).max(1).default(0.10),
    }).refine(
      (weights) => {
        const total = Object.values(weights).reduce((a, b) => a + b, 0);
        return Math.abs(total - 1.0) < 0.001;
      },
      { message: 'Scoring weights must sum to 1.0' }
    ).default({
      acceptanceTests: 0.30,
      wavePlanQuality: 0.25,
      firstAttemptPassRate: 0.20,
      completionTime: 0.15,
      reworkRatio: 0.10,
    }),
  }).default({}),

  // Output settings
  output: z.object({
    /** Results directory */
    resultsDir: z.string().default('./benchmarks/results'),
    /** Reporters to use */
    reporters: z.array(z.enum(['console', 'markdown', 'json'])).default([
      'console',
      'markdown',
      'json',
    ]),
  }).default({}),
});

export type BenchmarkConfig = z.infer<typeof BenchmarkConfigSchema>;

// =============================================================================
// Run Config Schema (for CLI options)
// =============================================================================

export const RunConfigSchema = z.object({
  benchmarks: z.array(BenchmarkIdSchema),
  scenarios: z.array(ScenarioTypeSchema),
  iterations: z.number().int().positive(),
  parallel: z.boolean(),
  timeoutMs: z.number().int().positive(),
  archiveWorkspaces: z.boolean(),
  outputDir: z.string(),
  versionTag: z.string().optional(),
  maxConcurrentSessions: z.number().int().positive(),
  baselineModel: ModelTierSchema,
  dryRun: z.boolean(),
});

// =============================================================================
// Configuration Helpers
// =============================================================================

/**
 * Define benchmark configuration with type checking.
 */
export function defineConfig(config: Partial<BenchmarkConfig>): BenchmarkConfig {
  return BenchmarkConfigSchema.parse(config);
}

/**
 * Load and validate configuration from a file.
 */
export async function loadConfig(configPath?: string): Promise<BenchmarkConfig> {
  if (!configPath) {
    // Use defaults
    return BenchmarkConfigSchema.parse({});
  }

  try {
    // Dynamic import for config file
    const module = await import(configPath);
    const config = module.default || module;
    return BenchmarkConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(
        `Invalid configuration:\n${error.errors
          .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
          .join('\n')}`
      );
    }
    throw error;
  }
}

/**
 * Get model pricing by model name.
 */
export function getModelPricing(
  config: BenchmarkConfig,
  model: string
): ModelPricing | undefined {
  return config.pricing.find(
    (p) => p.model.toLowerCase() === model.toLowerCase()
  );
}

/**
 * Convert BenchmarkConfig to RunConfig with CLI overrides.
 */
export function toRunConfig(
  config: BenchmarkConfig,
  overrides: Partial<RunConfig> = {}
): RunConfig {
  return {
    benchmarks: overrides.benchmarks ?? config.benchmarks.include,
    scenarios: overrides.scenarios ?? ['baseline', 'devpilot'],
    iterations: overrides.iterations ?? config.execution.iterations,
    parallel: overrides.parallel ?? config.execution.parallel,
    timeoutMs:
      overrides.timeoutMs ?? config.execution.timeoutMinutes * 60 * 1000,
    archiveWorkspaces:
      overrides.archiveWorkspaces ?? config.execution.archiveWorkspaces,
    outputDir: overrides.outputDir ?? config.output.resultsDir,
    versionTag: overrides.versionTag,
    maxConcurrentSessions:
      overrides.maxConcurrentSessions ?? config.devpilot.maxConcurrentSessions,
    baselineModel: overrides.baselineModel ?? config.baseline.model,
    dryRun: overrides.dryRun ?? false,
  };
}

// =============================================================================
// Environment Variable Loading
// =============================================================================

/**
 * Load configuration values from environment variables.
 */
export function loadEnvConfig(): Partial<BenchmarkConfig> {
  const env = process.env;

  return {
    devpilot: {
      orchestratorUrl: env.RUFLO_URL,
      apiKey: env.RUFLO_API_KEY,
      aoProjectName: env.AO_PROJECT_NAME,
    },
    output: {
      resultsDir: env.BENCH_RESULTS_DIR,
    },
    execution: {
      timeoutMinutes: env.BENCH_TIMEOUT
        ? parseInt(env.BENCH_TIMEOUT, 10)
        : undefined,
    },
    baseline: {
      model: env.BENCH_MODEL as 'haiku' | 'sonnet' | 'opus' | undefined,
    },
  };
}

/**
 * Merge environment config with file config.
 */
export function mergeConfig(
  fileConfig: BenchmarkConfig,
  envConfig: Partial<BenchmarkConfig>
): BenchmarkConfig {
  // Deep merge, preferring env values over file values
  return BenchmarkConfigSchema.parse({
    ...fileConfig,
    devpilot: {
      ...fileConfig.devpilot,
      ...envConfig.devpilot,
    },
    output: {
      ...fileConfig.output,
      ...envConfig.output,
    },
    execution: {
      ...fileConfig.execution,
      ...envConfig.execution,
    },
    baseline: {
      ...fileConfig.baseline,
      ...envConfig.baseline,
    },
  });
}

// =============================================================================
// Scoring Constants
// =============================================================================

export const SCORING_CONSTANTS = {
  /** Time for perfect score (100) in ms */
  IDEAL_TIME_MS: 5 * 60 * 1000, // 5 minutes
  /** Time for zero score in ms */
  MAX_TIME_MS: 10 * 60 * 1000, // 10 minutes
  /** Grade thresholds */
  GRADES: {
    A: 90,
    B: 80,
    C: 70,
    D: 60,
    F: 0,
  } as const,
};
