// src/config.ts
import { z } from "zod";
var BenchmarkIdSchema = z.enum([
  "01-forgepress",
  "02-taskforge",
  "03-insightboard"
]);
var ScenarioTypeSchema = z.enum(["baseline", "devpilot"]);
var ModelTierSchema = z.enum(["haiku", "sonnet", "opus"]);
var ModelPricingSchema = z.object({
  model: z.string(),
  inputPer1M: z.number().positive(),
  outputPer1M: z.number().positive(),
  cacheReadPer1M: z.number().nonnegative(),
  cacheWritePer1M: z.number().nonnegative()
});
var DEFAULT_MODEL_PRICING = [
  {
    model: "haiku",
    inputPer1M: 0.25,
    outputPer1M: 1.25,
    cacheReadPer1M: 0.025,
    cacheWritePer1M: 0.3
  },
  {
    model: "sonnet",
    inputPer1M: 3,
    outputPer1M: 15,
    cacheReadPer1M: 0.3,
    cacheWritePer1M: 3.75
  },
  {
    model: "opus",
    inputPer1M: 15,
    outputPer1M: 75,
    cacheReadPer1M: 1.5,
    cacheWritePer1M: 18.75
  }
];
var BenchmarkConfigSchema = z.object({
  // Benchmark selection
  benchmarks: z.object({
    /** Benchmark IDs to include */
    include: z.array(BenchmarkIdSchema).default([
      "01-forgepress",
      "02-taskforge",
      "03-insightboard"
    ]),
    /** Path to benchmark definitions */
    benchmarkDir: z.string().default("./benchmarks"),
    /** Path to ground truth files */
    groundTruthDir: z.string().default("./benchmarks/ground-truth")
  }).default({}),
  // Baseline scenario settings
  baseline: z.object({
    /** Path to Claude Code CLI binary */
    claudeCodeBinary: z.string().default("claude"),
    /** Model to use */
    model: ModelTierSchema.default("sonnet"),
    /** Maximum retries on failure */
    maxRetries: z.number().int().nonnegative().default(1)
  }).default({}),
  // DevPilot scenario settings
  devpilot: z.object({
    /** Orchestrator mode */
    orchestratorMode: z.enum(["http", "ao-cli"]).default("ao-cli"),
    /** HTTP orchestrator URL (for http mode) */
    orchestratorUrl: z.string().url().optional(),
    /** API key for orchestrator */
    apiKey: z.string().optional(),
    /** Max concurrent sessions */
    maxConcurrentSessions: z.number().int().positive().default(4),
    /** Model for planning */
    planningModel: ModelTierSchema.default("sonnet"),
    /** Model for execution */
    executionModel: ModelTierSchema.default("sonnet"),
    /** Agent-orchestrator project name (for ao-cli mode) */
    aoProjectName: z.string().optional()
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
    archiveWorkspaces: z.boolean().default(true)
  }).default({}),
  // Pricing configuration
  pricing: z.array(ModelPricingSchema).default(DEFAULT_MODEL_PRICING),
  // Scoring weights
  scoring: z.object({
    weights: z.object({
      acceptanceTests: z.number().min(0).max(1).default(0.3),
      wavePlanQuality: z.number().min(0).max(1).default(0.25),
      firstAttemptPassRate: z.number().min(0).max(1).default(0.2),
      completionTime: z.number().min(0).max(1).default(0.15),
      reworkRatio: z.number().min(0).max(1).default(0.1)
    }).refine(
      (weights) => {
        const total = Object.values(weights).reduce((a, b) => a + b, 0);
        return Math.abs(total - 1) < 1e-3;
      },
      { message: "Scoring weights must sum to 1.0" }
    ).default({
      acceptanceTests: 0.3,
      wavePlanQuality: 0.25,
      firstAttemptPassRate: 0.2,
      completionTime: 0.15,
      reworkRatio: 0.1
    })
  }).default({}),
  // Output settings
  output: z.object({
    /** Results directory */
    resultsDir: z.string().default("./benchmarks/results"),
    /** Reporters to use */
    reporters: z.array(z.enum(["console", "markdown", "json"])).default([
      "console",
      "markdown",
      "json"
    ])
  }).default({})
});
var RunConfigSchema = z.object({
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
  dryRun: z.boolean()
});
function defineConfig(config) {
  return BenchmarkConfigSchema.parse(config);
}
async function loadConfig(configPath) {
  if (!configPath) {
    return BenchmarkConfigSchema.parse({});
  }
  try {
    const module = await import(configPath);
    const config = module.default || module;
    return BenchmarkConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(
        `Invalid configuration:
${error.errors.map((e) => `  - ${e.path.join(".")}: ${e.message}`).join("\n")}`
      );
    }
    throw error;
  }
}
function getModelPricing(config, model) {
  return config.pricing.find(
    (p) => p.model.toLowerCase() === model.toLowerCase()
  );
}
function toRunConfig(config, overrides = {}) {
  return {
    benchmarks: overrides.benchmarks ?? config.benchmarks.include,
    scenarios: overrides.scenarios ?? ["baseline", "devpilot"],
    iterations: overrides.iterations ?? config.execution.iterations,
    parallel: overrides.parallel ?? config.execution.parallel,
    timeoutMs: overrides.timeoutMs ?? config.execution.timeoutMinutes * 60 * 1e3,
    archiveWorkspaces: overrides.archiveWorkspaces ?? config.execution.archiveWorkspaces,
    outputDir: overrides.outputDir ?? config.output.resultsDir,
    versionTag: overrides.versionTag,
    maxConcurrentSessions: overrides.maxConcurrentSessions ?? config.devpilot.maxConcurrentSessions,
    baselineModel: overrides.baselineModel ?? config.baseline.model,
    dryRun: overrides.dryRun ?? false
  };
}
function loadEnvConfig() {
  const env = process.env;
  return {
    devpilot: {
      orchestratorUrl: env.RUFLO_URL,
      apiKey: env.RUFLO_API_KEY,
      aoProjectName: env.AO_PROJECT_NAME
    },
    output: {
      resultsDir: env.BENCH_RESULTS_DIR
    },
    execution: {
      timeoutMinutes: env.BENCH_TIMEOUT ? parseInt(env.BENCH_TIMEOUT, 10) : void 0
    },
    baseline: {
      model: env.BENCH_MODEL
    }
  };
}
function mergeConfig(fileConfig, envConfig) {
  return BenchmarkConfigSchema.parse({
    ...fileConfig,
    devpilot: {
      ...fileConfig.devpilot,
      ...envConfig.devpilot
    },
    output: {
      ...fileConfig.output,
      ...envConfig.output
    },
    execution: {
      ...fileConfig.execution,
      ...envConfig.execution
    },
    baseline: {
      ...fileConfig.baseline,
      ...envConfig.baseline
    }
  });
}
var SCORING_CONSTANTS = {
  /** Time for perfect score (100) in ms */
  IDEAL_TIME_MS: 5 * 60 * 1e3,
  // 5 minutes
  /** Time for zero score in ms */
  MAX_TIME_MS: 10 * 60 * 1e3,
  // 10 minutes
  /** Grade thresholds */
  GRADES: {
    A: 90,
    B: 80,
    C: 70,
    D: 60,
    F: 0
  }
};

// src/metrics/token-tracker.ts
var TokenTracker = class {
  constructor() {
    this.usageBySession = /* @__PURE__ */ new Map();
    this.usageByModel = /* @__PURE__ */ new Map();
  }
  /**
   * Record token usage for a session.
   */
  recordUsage(sessionId, model, usage) {
    this.usageBySession.set(sessionId, usage);
    const existing = this.usageByModel.get(model) ?? createEmptyUsage();
    this.usageByModel.set(model, addUsage(existing, usage));
  }
  /**
   * Parse and record token usage from Claude Code CLI output.
   * Returns true if parsing was successful.
   */
  recordFromOutput(sessionId, model, output) {
    let usage = this.parseJsonOutput(output);
    if (!usage) {
      usage = this.parseTextOutput(output);
    }
    if (usage) {
      this.recordUsage(sessionId, model, usage);
      return true;
    }
    return false;
  }
  /**
   * Record token usage from a CompletionReport.
   */
  recordFromCompletionReport(sessionId, model, report) {
    const usage = {
      inputTokens: report.inputTokens ?? 0,
      outputTokens: report.outputTokens ?? 0,
      cacheReadTokens: report.cacheReadTokens ?? 0,
      cacheWriteTokens: report.cacheWriteTokens ?? 0,
      totalTokens: report.tokensUsed ?? (report.inputTokens ?? 0) + (report.outputTokens ?? 0)
    };
    this.recordUsage(sessionId, model, usage);
  }
  /**
   * Parse JSON output format from Claude Code CLI.
   *
   * Expected format:
   * {
   *   "usage": {
   *     "input_tokens": 12500,
   *     "output_tokens": 45000,
   *     "cache_read_input_tokens": 5000,
   *     "cache_creation_input_tokens": 2000
   *   }
   * }
   */
  parseJsonOutput(output) {
    try {
      const jsonMatch = output.match(/\{[\s\S]*?"usage"[\s\S]*?\}/);
      if (!jsonMatch) {
        const usageMatch = output.match(
          /\{[\s\S]*?"input_tokens"[\s\S]*?\}/
        );
        if (!usageMatch) return null;
        const data2 = JSON.parse(usageMatch[0]);
        return this.extractUsageFromObject(data2);
      }
      const data = JSON.parse(jsonMatch[0]);
      const usage = data.usage || data;
      return this.extractUsageFromObject(usage);
    } catch {
      return null;
    }
  }
  /**
   * Extract TokenUsage from a parsed object.
   */
  extractUsageFromObject(obj) {
    const inputTokens = this.extractNumber(obj, [
      "input_tokens",
      "inputTokens",
      "input"
    ]);
    const outputTokens = this.extractNumber(obj, [
      "output_tokens",
      "outputTokens",
      "output"
    ]);
    if (inputTokens === 0 && outputTokens === 0) {
      return null;
    }
    return {
      inputTokens,
      outputTokens,
      cacheReadTokens: this.extractNumber(obj, [
        "cache_read_input_tokens",
        "cacheReadInputTokens",
        "cache_read",
        "cacheRead"
      ]),
      cacheWriteTokens: this.extractNumber(obj, [
        "cache_creation_input_tokens",
        "cacheCreationInputTokens",
        "cache_write",
        "cacheWrite"
      ]),
      totalTokens: inputTokens + outputTokens
    };
  }
  /**
   * Extract a number from an object using multiple possible keys.
   */
  extractNumber(obj, keys) {
    for (const key of keys) {
      const value = obj[key];
      if (typeof value === "number") return value;
      if (typeof value === "string") {
        const parsed = parseInt(value.replace(/,/g, ""), 10);
        if (!isNaN(parsed)) return parsed;
      }
    }
    return 0;
  }
  /**
   * Parse text output format from Claude Code CLI.
   *
   * Expected formats:
   * - "Total tokens: 57500 (12500 input, 45000 output)"
   * - "Cache: 5000 read, 2000 written"
   * - "Tokens used: 57,500"
   */
  parseTextOutput(output) {
    const patterns = {
      // Match "Total tokens: 57500" or "Tokens: 57500"
      total: /(?:total\s+)?tokens[:\s]+([0-9,]+)/i,
      // Match "12500 input" or "input: 12500"
      input: /(?:input[:\s]+([0-9,]+)|([0-9,]+)\s+input)/i,
      // Match "45000 output" or "output: 45000"
      output: /(?:output[:\s]+([0-9,]+)|([0-9,]+)\s+output)/i,
      // Match "cache read: 5000" or "5000 cache read"
      cacheRead: /(?:cache\s*read[:\s]+([0-9,]+)|([0-9,]+)\s+cache\s*read)/i,
      // Match "cache write: 2000" or "2000 cache write"
      cacheWrite: /(?:cache\s*(?:write|creation)[:\s]+([0-9,]+)|([0-9,]+)\s+cache\s*(?:write|creation))/i
    };
    const parseMatch = (match) => {
      if (!match) return 0;
      const value = match[1] || match[2];
      return value ? parseInt(value.replace(/,/g, ""), 10) : 0;
    };
    const inputTokens = parseMatch(output.match(patterns.input));
    const outputTokens = parseMatch(output.match(patterns.output));
    const totalMatch = parseMatch(output.match(patterns.total));
    if (inputTokens === 0 && outputTokens === 0) {
      if (totalMatch > 0) {
        return {
          inputTokens: totalMatch,
          outputTokens: 0,
          cacheReadTokens: parseMatch(output.match(patterns.cacheRead)),
          cacheWriteTokens: parseMatch(output.match(patterns.cacheWrite)),
          totalTokens: totalMatch
        };
      }
      return null;
    }
    return {
      inputTokens,
      outputTokens,
      cacheReadTokens: parseMatch(output.match(patterns.cacheRead)),
      cacheWriteTokens: parseMatch(output.match(patterns.cacheWrite)),
      totalTokens: inputTokens + outputTokens
    };
  }
  /**
   * Get token usage for a specific session.
   */
  getSessionUsage(sessionId) {
    return this.usageBySession.get(sessionId) ?? null;
  }
  /**
   * Get aggregated token usage for a model.
   */
  getModelUsage(model) {
    return this.usageByModel.get(model) ?? createEmptyUsage();
  }
  /**
   * Get total token usage across all sessions.
   */
  getTotalUsage() {
    let total = createEmptyUsage();
    for (const usage of this.usageBySession.values()) {
      total = addUsage(total, usage);
    }
    return total;
  }
  /**
   * Calculate cache hit rate (proportion of tokens from cache).
   */
  getCacheHitRate() {
    const total = this.getTotalUsage();
    const totalInput = total.inputTokens + total.cacheReadTokens;
    if (totalInput === 0) return 0;
    return total.cacheReadTokens / totalInput;
  }
  /**
   * Get complete snapshot of token usage.
   */
  getSnapshot() {
    return {
      bySession: new Map(this.usageBySession),
      byModel: new Map(this.usageByModel),
      total: this.getTotalUsage(),
      cacheHitRate: this.getCacheHitRate()
    };
  }
  /**
   * Clear all recorded usage.
   */
  clear() {
    this.usageBySession.clear();
    this.usageByModel.clear();
  }
};
function createEmptyUsage() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0
  };
}
function addUsage(a, b) {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    totalTokens: a.totalTokens + b.totalTokens
  };
}

// src/metrics/cost-calculator.ts
var CostCalculator = class {
  constructor(pricingConfig) {
    this.pricing = /* @__PURE__ */ new Map();
    this.pricingSnapshot = pricingConfig ?? DEFAULT_MODEL_PRICING;
    this.loadPricing(this.pricingSnapshot);
  }
  /**
   * Load pricing configuration.
   */
  loadPricing(pricing) {
    this.pricing.clear();
    for (const p of pricing) {
      this.pricing.set(p.model.toLowerCase(), p);
    }
    this.pricingSnapshot = [...pricing];
  }
  /**
   * Set pricing for a specific model.
   */
  setPricing(model, pricing) {
    this.pricing.set(model.toLowerCase(), pricing);
    const idx = this.pricingSnapshot.findIndex(
      (p) => p.model.toLowerCase() === model.toLowerCase()
    );
    if (idx >= 0) {
      this.pricingSnapshot[idx] = pricing;
    } else {
      this.pricingSnapshot.push(pricing);
    }
  }
  /**
   * Get pricing for a model.
   */
  getPricing(model) {
    return this.pricing.get(model.toLowerCase());
  }
  /**
   * Calculate cost for a given model and token usage.
   */
  calculateCost(model, usage) {
    const breakdown = this.calculateBreakdown(model, usage);
    return breakdown.totalCost;
  }
  /**
   * Calculate detailed cost breakdown.
   */
  calculateBreakdown(model, usage) {
    const pricing = this.getPricing(model);
    if (!pricing) {
      console.warn(
        `Unknown model pricing: ${model}, using sonnet rates as fallback`
      );
      return this.calculateBreakdown("sonnet", usage);
    }
    const inputCost = usage.inputTokens / 1e6 * pricing.inputPer1M;
    const outputCost = usage.outputTokens / 1e6 * pricing.outputPer1M;
    const cacheReadCost = usage.cacheReadTokens / 1e6 * pricing.cacheReadPer1M;
    const cacheWriteCost = usage.cacheWriteTokens / 1e6 * pricing.cacheWritePer1M;
    return {
      inputCost,
      outputCost,
      cacheReadCost,
      cacheWriteCost,
      totalCost: inputCost + outputCost + cacheReadCost + cacheWriteCost
    };
  }
  /**
   * Calculate cost for a session record.
   */
  calculateSessionCost(session) {
    const usage = {
      inputTokens: session.tokensInput,
      outputTokens: session.tokensOutput,
      cacheReadTokens: session.cacheReadTokens,
      cacheWriteTokens: session.cacheWriteTokens,
      totalTokens: session.tokensInput + session.tokensOutput
    };
    const breakdown = this.calculateBreakdown(session.model, usage);
    return {
      sessionId: session.sessionId,
      model: session.model,
      tokens: usage,
      costUsd: breakdown.totalCost,
      breakdown: {
        inputCost: breakdown.inputCost,
        outputCost: breakdown.outputCost,
        cacheReadCost: breakdown.cacheReadCost,
        cacheWriteCost: breakdown.cacheWriteCost
      }
    };
  }
  /**
   * Calculate total cost for multiple sessions.
   */
  calculateTotalCost(sessions) {
    return sessions.reduce((total, session) => {
      return total + this.calculateSessionCost(session).costUsd;
    }, 0);
  }
  /**
   * Get cost breakdown for multiple sessions.
   */
  getCostBreakdown(sessions) {
    return sessions.map((session) => this.calculateSessionCost(session));
  }
  /**
   * Get aggregated cost by model.
   */
  getCostByModel(sessions) {
    const costByModel = /* @__PURE__ */ new Map();
    for (const session of sessions) {
      const cost = this.calculateSessionCost(session).costUsd;
      const existing = costByModel.get(session.model) ?? 0;
      costByModel.set(session.model, existing + cost);
    }
    return costByModel;
  }
  /**
   * Get the pricing snapshot (for storing in results).
   */
  getPricingSnapshot() {
    return [...this.pricingSnapshot];
  }
  /**
   * Format cost as a string with appropriate precision.
   */
  static formatCost(costUsd) {
    if (costUsd < 0.01) {
      return `$${costUsd.toFixed(4)}`;
    }
    if (costUsd < 1) {
      return `$${costUsd.toFixed(3)}`;
    }
    return `$${costUsd.toFixed(2)}`;
  }
  /**
   * Estimate cost for a planned task.
   */
  estimateCost(model, estimatedInputTokens, estimatedOutputTokens) {
    const usage = {
      inputTokens: estimatedInputTokens,
      outputTokens: estimatedOutputTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: estimatedInputTokens + estimatedOutputTokens
    };
    return this.calculateCost(model, usage);
  }
};
function createCostCalculator(customPricing) {
  return new CostCalculator(customPricing);
}

// src/metrics/timeline.ts
var TimelineRecorder = class {
  constructor() {
    this.events = [];
    this.contextStack = [];
    this.startTime = /* @__PURE__ */ new Date();
  }
  // ===========================================================================
  // Event Recording
  // ===========================================================================
  /**
   * Record a timeline event.
   */
  recordEvent(type, data = {}) {
    const event = {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      eventType: type,
      data
    };
    const currentContext = this.getCurrentContext();
    if (currentContext) {
      if (currentContext.type === "session") {
        event.sessionId = currentContext.id;
      }
      if (currentContext.type === "wave") {
        event.waveNumber = parseInt(currentContext.id, 10);
      }
    }
    this.events.push(event);
  }
  // ===========================================================================
  // Context Management
  // ===========================================================================
  /**
   * Push a new context onto the stack.
   */
  pushContext(context) {
    this.contextStack.push(context);
  }
  /**
   * Pop the current context from the stack.
   */
  popContext() {
    return this.contextStack.pop();
  }
  /**
   * Get the current context.
   */
  getCurrentContext() {
    return this.contextStack[this.contextStack.length - 1];
  }
  // ===========================================================================
  // Convenience Methods
  // ===========================================================================
  /**
   * Record run start.
   */
  runStart(runId) {
    this.startTime = /* @__PURE__ */ new Date();
    this.pushContext({ type: "run", id: runId, startTime: this.startTime });
    this.recordEvent("run_start", { runId });
  }
  /**
   * Record run complete.
   */
  runComplete(results = {}) {
    this.recordEvent("run_complete", results);
    this.popContext();
  }
  /**
   * Record scenario start.
   */
  scenarioStart(scenario) {
    this.pushContext({ type: "scenario", id: scenario, startTime: /* @__PURE__ */ new Date() });
    this.recordEvent("scenario_start", { scenario });
  }
  /**
   * Record scenario complete.
   */
  scenarioComplete(scenario, result = {}) {
    this.recordEvent("scenario_complete", { scenario, ...result });
    this.popContext();
  }
  /**
   * Record wave start.
   */
  waveStart(waveNumber, taskCount) {
    this.pushContext({
      type: "wave",
      id: String(waveNumber),
      startTime: /* @__PURE__ */ new Date()
    });
    this.recordEvent("wave_start", { waveNumber, taskCount });
  }
  /**
   * Record wave complete.
   */
  waveComplete(waveNumber, result = {}) {
    this.recordEvent("wave_complete", { waveNumber, ...result });
    this.popContext();
  }
  /**
   * Record session start.
   */
  sessionStart(sessionId, taskId) {
    this.pushContext({ type: "session", id: sessionId, startTime: /* @__PURE__ */ new Date() });
    this.recordEvent("session_start", { sessionId, taskId });
  }
  /**
   * Record session progress.
   */
  sessionProgress(sessionId, progress, message) {
    this.recordEvent("session_progress", {
      sessionId,
      progress,
      message
    });
  }
  /**
   * Record session complete.
   */
  sessionComplete(sessionId, success) {
    this.recordEvent("session_complete", { sessionId, success });
    this.popContext();
  }
  /**
   * Record session error.
   */
  sessionError(sessionId, error) {
    this.recordEvent("session_error", { sessionId, error });
  }
  /**
   * Record acceptance test start.
   */
  acceptanceStart() {
    this.recordEvent("acceptance_start", {});
  }
  /**
   * Record acceptance test complete.
   */
  acceptanceComplete(result = {}) {
    this.recordEvent("acceptance_complete", result);
  }
  // ===========================================================================
  // Querying
  // ===========================================================================
  /**
   * Get all events.
   */
  getEvents() {
    return [...this.events];
  }
  /**
   * Get events by type.
   */
  getEventsByType(type) {
    return this.events.filter((e) => e.eventType === type);
  }
  /**
   * Get events for a specific session.
   */
  getEventsBySession(sessionId) {
    return this.events.filter((e) => e.sessionId === sessionId);
  }
  /**
   * Get events for a specific wave.
   */
  getEventsByWave(waveNumber) {
    return this.events.filter((e) => e.waveNumber === waveNumber);
  }
  /**
   * Get events within a time range.
   */
  getEventRange(start, end) {
    return this.events.filter((e) => {
      const time = new Date(e.timestamp);
      return time >= start && time <= end;
    });
  }
  // ===========================================================================
  // Analysis
  // ===========================================================================
  /**
   * Calculate duration between two event types.
   */
  calculateDuration(startEvent, endEvent) {
    const starts = this.getEventsByType(startEvent);
    const ends = this.getEventsByType(endEvent);
    if (starts.length === 0 || ends.length === 0) {
      return 0;
    }
    const start = new Date(starts[0].timestamp);
    const end = new Date(ends[ends.length - 1].timestamp);
    return end.getTime() - start.getTime();
  }
  /**
   * Get session durations.
   */
  getSessionDurations() {
    const durations = /* @__PURE__ */ new Map();
    const starts = this.getEventsByType("session_start");
    const completes = this.getEventsByType("session_complete");
    const errors = this.getEventsByType("session_error");
    for (const start of starts) {
      const sessionId = start.data.sessionId;
      const end = completes.find((e) => e.sessionId === sessionId) ?? errors.find((e) => e.sessionId === sessionId);
      if (end) {
        const duration = new Date(end.timestamp).getTime() - new Date(start.timestamp).getTime();
        durations.set(sessionId, duration);
      }
    }
    return durations;
  }
  /**
   * Get wave durations.
   */
  getWaveDurations() {
    const durations = /* @__PURE__ */ new Map();
    const starts = this.getEventsByType("wave_start");
    const completes = this.getEventsByType("wave_complete");
    for (const start of starts) {
      const waveNumber = start.data.waveNumber;
      const end = completes.find((e) => e.data.waveNumber === waveNumber);
      if (end) {
        const duration = new Date(end.timestamp).getTime() - new Date(start.timestamp).getTime();
        durations.set(waveNumber, duration);
      }
    }
    return durations;
  }
  /**
   * Get total run duration.
   */
  getTotalDuration() {
    return this.calculateDuration("run_start", "run_complete");
  }
  // ===========================================================================
  // Export
  // ===========================================================================
  /**
   * Export events as JSON.
   */
  toJSON() {
    return this.getEvents();
  }
  /**
   * Export as Gantt chart data points.
   */
  toGanttData() {
    const dataPoints = [];
    const runStartTime = this.startTime.getTime();
    const waveStarts = this.getEventsByType("wave_start");
    const waveCompletes = this.getEventsByType("wave_complete");
    for (const start of waveStarts) {
      const waveNumber = start.data.waveNumber;
      const end = waveCompletes.find((e) => e.data.waveNumber === waveNumber);
      if (end) {
        dataPoints.push({
          id: `wave-${waveNumber}`,
          type: "wave",
          label: `Wave ${waveNumber}`,
          startMs: new Date(start.timestamp).getTime() - runStartTime,
          endMs: new Date(end.timestamp).getTime() - runStartTime,
          color: "#3b82f6"
          // Blue
        });
      }
    }
    const sessionStarts = this.getEventsByType("session_start");
    const sessionEnds = [
      ...this.getEventsByType("session_complete"),
      ...this.getEventsByType("session_error")
    ];
    for (const start of sessionStarts) {
      const sessionId = start.data.sessionId;
      const taskId = start.data.taskId;
      const end = sessionEnds.find((e) => e.sessionId === sessionId);
      if (end) {
        const success = end.data.success ?? false;
        dataPoints.push({
          id: sessionId,
          type: "session",
          label: taskId ?? sessionId.slice(0, 8),
          startMs: new Date(start.timestamp).getTime() - runStartTime,
          endMs: new Date(end.timestamp).getTime() - runStartTime,
          parentId: start.waveNumber ? `wave-${start.waveNumber}` : void 0,
          color: success ? "#22c55e" : "#ef4444"
          // Green or Red
        });
      }
    }
    return dataPoints;
  }
  /**
   * Clear all recorded events.
   */
  clear() {
    this.events = [];
    this.contextStack = [];
    this.startTime = /* @__PURE__ */ new Date();
  }
};
function createTimelineRecorder() {
  return new TimelineRecorder();
}

// src/metrics/collector.ts
var MetricsCollector = class {
  constructor(tokenTracker, costCalculator, timeline) {
    this.sessions = /* @__PURE__ */ new Map();
    this.filesCreated = /* @__PURE__ */ new Set();
    this.filesModified = /* @__PURE__ */ new Set();
    this.tokenTracker = tokenTracker ?? new TokenTracker();
    this.costCalculator = costCalculator ?? new CostCalculator();
    this.timeline = timeline ?? new TimelineRecorder();
    this.startTime = /* @__PURE__ */ new Date();
  }
  // ===========================================================================
  // Initialization
  // ===========================================================================
  /**
   * Start metrics collection.
   */
  start(runId) {
    this.startTime = /* @__PURE__ */ new Date();
    this.timeline.runStart(runId);
    this.sessions.clear();
    this.filesCreated.clear();
    this.filesModified.clear();
  }
  /**
   * Stop metrics collection.
   */
  stop(results = {}) {
    this.timeline.runComplete(results);
  }
  // ===========================================================================
  // Session Tracking
  // ===========================================================================
  /**
   * Register a new session.
   */
  registerSession(session) {
    this.sessions.set(session.sessionId, session);
    this.tokenTracker.recordUsage(session.sessionId, session.model, {
      inputTokens: session.tokensInput,
      outputTokens: session.tokensOutput,
      cacheReadTokens: session.cacheReadTokens,
      cacheWriteTokens: session.cacheWriteTokens,
      totalTokens: session.tokensInput + session.tokensOutput
    });
    session.filesCreated.forEach((f) => this.filesCreated.add(f));
    session.filesModified.forEach((f) => this.filesModified.add(f));
  }
  /**
   * Record token usage for a session directly.
   *
   * Convenience wrapper around the underlying token tracker that resolves the
   * model from the registered session (falling back to 'unknown' when the
   * session has not been registered yet).
   */
  recordTokenUsage(sessionId, usage) {
    const model = this.sessions.get(sessionId)?.model ?? "unknown";
    this.tokenTracker.recordUsage(sessionId, model, usage);
  }
  /**
   * Update an existing session.
   */
  updateSession(sessionId, update) {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      const updated = { ...existing, ...update };
      this.sessions.set(sessionId, updated);
      if (update.tokensInput !== void 0 || update.tokensOutput !== void 0) {
        this.tokenTracker.recordUsage(sessionId, updated.model, {
          inputTokens: updated.tokensInput,
          outputTokens: updated.tokensOutput,
          cacheReadTokens: updated.cacheReadTokens,
          cacheWriteTokens: updated.cacheWriteTokens,
          totalTokens: updated.tokensInput + updated.tokensOutput
        });
      }
      update.filesCreated?.forEach((f) => this.filesCreated.add(f));
      update.filesModified?.forEach((f) => this.filesModified.add(f));
    }
  }
  /**
   * Mark a session as complete.
   */
  completeSession(sessionId, report) {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      const updated = {
        ...existing,
        success: report.success,
        completedAt: (/* @__PURE__ */ new Date()).toISOString(),
        durationMs: Date.now() - new Date(existing.startedAt).getTime(),
        tokensInput: report.tokensInput ?? existing.tokensInput,
        tokensOutput: report.tokensOutput ?? existing.tokensOutput,
        cacheReadTokens: report.cacheReadTokens ?? existing.cacheReadTokens,
        cacheWriteTokens: report.cacheWriteTokens ?? existing.cacheWriteTokens,
        costUsd: report.costUsd ?? existing.costUsd,
        filesCreated: report.filesCreated ?? existing.filesCreated,
        filesModified: report.filesModified ?? existing.filesModified,
        error: report.error
      };
      this.sessions.set(sessionId, updated);
      this.tokenTracker.recordUsage(sessionId, updated.model, {
        inputTokens: updated.tokensInput,
        outputTokens: updated.tokensOutput,
        cacheReadTokens: updated.cacheReadTokens,
        cacheWriteTokens: updated.cacheWriteTokens,
        totalTokens: updated.tokensInput + updated.tokensOutput
      });
      updated.filesCreated.forEach((f) => this.filesCreated.add(f));
      updated.filesModified.forEach((f) => this.filesModified.add(f));
    }
  }
  // ===========================================================================
  // Real-Time Access
  // ===========================================================================
  /**
   * Get current metrics snapshot.
   */
  getSnapshot() {
    const sessions = Array.from(this.sessions.values());
    const tokenSnapshot = this.tokenTracker.getSnapshot();
    const activeSessions = sessions.filter(
      (s) => !s.completedAt && !s.error
    ).length;
    const completedSessions = sessions.filter((s) => s.success).length;
    const failedSessions = sessions.filter(
      (s) => s.completedAt && !s.success
    ).length;
    return {
      wallClockMs: Date.now() - this.startTime.getTime(),
      totalTokens: tokenSnapshot.total.totalTokens,
      totalTokensInput: tokenSnapshot.total.inputTokens,
      totalTokensOutput: tokenSnapshot.total.outputTokens,
      totalCostUsd: this.costCalculator.calculateTotalCost(sessions),
      sessionsActive: activeSessions,
      sessionsCompleted: completedSessions,
      sessionsFailed: failedSessions,
      filesCreated: this.filesCreated.size,
      filesModified: this.filesModified.size
    };
  }
  /**
   * Get metrics for a specific session.
   */
  getSessionMetrics(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return void 0;
    const tokens = this.tokenTracker.getSessionUsage(sessionId);
    const costEntry = this.costCalculator.calculateSessionCost(session);
    return {
      sessionId,
      model: session.model,
      durationMs: session.durationMs,
      tokens: tokens ?? createEmptyUsage(),
      costUsd: costEntry.costUsd,
      success: session.success
    };
  }
  // ===========================================================================
  // Aggregation
  // ===========================================================================
  /**
   * Aggregate metrics for a scenario.
   */
  aggregateScenarioMetrics(sessions, firstAttemptPassRate = 0) {
    let totalTokens = createEmptyUsage();
    for (const session of sessions) {
      totalTokens = addUsage(totalTokens, {
        inputTokens: session.tokensInput,
        outputTokens: session.tokensOutput,
        cacheReadTokens: session.cacheReadTokens,
        cacheWriteTokens: session.cacheWriteTokens,
        totalTokens: session.tokensInput + session.tokensOutput
      });
    }
    const costBreakdown = this.costCalculator.getCostBreakdown(sessions);
    const totalCost = costBreakdown.reduce((sum, c) => sum + c.costUsd, 0);
    const filesCreated = /* @__PURE__ */ new Set();
    const filesModified = /* @__PURE__ */ new Set();
    for (const session of sessions) {
      session.filesCreated.forEach((f) => filesCreated.add(f));
      session.filesModified.forEach((f) => filesModified.add(f));
    }
    const startTimes = sessions.map((s) => new Date(s.startedAt).getTime());
    const endTimes = sessions.filter((s) => s.completedAt).map((s) => new Date(s.completedAt).getTime());
    const wallClockMs = endTimes.length > 0 ? Math.max(...endTimes) - Math.min(...startTimes) : Date.now() - Math.min(...startTimes);
    const successCount = sessions.filter((s) => s.success).length;
    const successRate = sessions.length > 0 ? successCount / sessions.length : 0;
    return {
      wallClockMs,
      tokens: totalTokens,
      totalCostUsd: totalCost,
      costBreakdown,
      sessionCount: sessions.length,
      successRate,
      filesCreated: Array.from(filesCreated),
      filesModified: Array.from(filesModified),
      reworkRatio: this.calculateReworkRatio(sessions),
      firstAttemptPassRate
    };
  }
  /**
   * Calculate rework ratio.
   *
   * Rework Ratio = Total file edits / Minimum required file creates
   * Where:
   * - "File edit" = any modification to an already-created file
   * - "Minimum required file creates" = count of unique files created
   *
   * Lower is better. 1.0 = perfect (no rework).
   */
  calculateReworkRatio(sessions) {
    const uniqueFilesCreated = /* @__PURE__ */ new Set();
    let totalEdits = 0;
    for (const session of sessions) {
      for (const file of session.filesCreated) {
        uniqueFilesCreated.add(file);
        totalEdits++;
      }
      totalEdits += session.filesModified.length;
    }
    const minRequired = uniqueFilesCreated.size;
    return minRequired > 0 ? totalEdits / minRequired : 1;
  }
  /**
   * Calculate parallelism efficiency.
   *
   * Efficiency = Total session-seconds / (Wall-clock seconds × max concurrent slots)
   *
   * 1.0 = every slot utilized the entire run.
   */
  calculateParallelismEfficiency(sessions, maxSlots, wallClockMs) {
    if (wallClockMs === 0 || maxSlots === 0) return 0;
    const totalSessionMs = sessions.reduce((sum, s) => sum + s.durationMs, 0);
    const maxCapacityMs = maxSlots * wallClockMs;
    return totalSessionMs / maxCapacityMs;
  }
  // ===========================================================================
  // Export
  // ===========================================================================
  /**
   * Get the underlying timeline recorder for direct event recording.
   */
  getTimeline() {
    return this.timeline;
  }
  /**
   * Export timeline events.
   */
  exportTimeline() {
    return this.timeline.toJSON();
  }
  /**
   * Export session log.
   */
  exportSessionLog() {
    return Array.from(this.sessions.values());
  }
  /**
   * Get the underlying components.
   */
  getComponents() {
    return {
      tokenTracker: this.tokenTracker,
      costCalculator: this.costCalculator,
      timeline: this.timeline
    };
  }
  /**
   * Get pricing snapshot for storing in results.
   */
  getPricingSnapshot() {
    return this.costCalculator.getPricingSnapshot();
  }
  /**
   * Clear all collected data.
   */
  clear() {
    this.tokenTracker.clear();
    this.timeline.clear();
    this.sessions.clear();
    this.filesCreated.clear();
    this.filesModified.clear();
    this.startTime = /* @__PURE__ */ new Date();
  }
};
function createMetricsCollector(pricing) {
  const tokenTracker = new TokenTracker();
  const costCalculator = new CostCalculator(pricing);
  const timeline = new TimelineRecorder();
  return new MetricsCollector(tokenTracker, costCalculator, timeline);
}

// src/storage/version-tagger.ts
import { execSync } from "child_process";
function getVersionInfo(projectRoot = process.cwd()) {
  const gitCommit = getGitCommit(projectRoot);
  const gitBranch = getGitBranch(projectRoot);
  const gitTag = getGitTag(projectRoot);
  const isDirty = isWorkingTreeDirty(projectRoot);
  let version;
  if (gitTag) {
    version = gitTag;
  } else {
    const describeVersion = getGitDescribe(projectRoot);
    if (describeVersion) {
      version = describeVersion;
    } else {
      version = `0.0.0-${gitCommit.slice(0, 7)}`;
    }
  }
  return {
    version,
    gitCommit,
    gitBranch,
    gitTag,
    isDirty
  };
}
function getGitCommit(projectRoot = process.cwd()) {
  try {
    return execSync("git rev-parse HEAD", {
      cwd: projectRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
  } catch {
    return "unknown";
  }
}
function getGitBranch(projectRoot = process.cwd()) {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: projectRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
  } catch {
    return "unknown";
  }
}
function getGitTag(projectRoot = process.cwd()) {
  try {
    const tag = execSync("git describe --exact-match --tags HEAD", {
      cwd: projectRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    return tag || void 0;
  } catch {
    return void 0;
  }
}
function getGitDescribe(projectRoot = process.cwd()) {
  try {
    return execSync("git describe --tags --always", {
      cwd: projectRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
  } catch {
    return void 0;
  }
}
function isWorkingTreeDirty(projectRoot = process.cwd()) {
  try {
    const status = execSync("git status --porcelain", {
      cwd: projectRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    return status.length > 0;
  } catch {
    return false;
  }
}
function sanitizeVersionForPath(version) {
  return version.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/--+/g, "-").replace(/^-|-$/g, "");
}
function createTimestampPath(date = /* @__PURE__ */ new Date()) {
  return date.toISOString().replace(/:/g, "-").replace(/\.\d{3}Z$/, "Z");
}
function parseTimestampPath(timestampPath) {
  const isoString = timestampPath.replace(/-(\d{2})-(\d{2})Z$/, ":$1:$2Z");
  return new Date(isoString);
}

// src/storage/results-writer.ts
import * as fs from "fs/promises";
import * as path from "path";
var ResultsWriter = class {
  constructor(config) {
    this.resultsDir = config.resultsDir;
    this.projectRoot = config.projectRoot ?? process.cwd();
  }
  /**
   * Write a complete run manifest and return the run directory path.
   */
  async writeRunManifest(manifest) {
    const versionInfo = getVersionInfo(this.projectRoot);
    const versionDir = sanitizeVersionForPath(
      manifest.version ?? versionInfo.version
    );
    const timestampDir = createTimestampPath(new Date(manifest.timestamp));
    const runDir = path.join(this.resultsDir, versionDir, timestampDir);
    await fs.mkdir(runDir, { recursive: true });
    await this.writeJson(
      path.join(runDir, "run-manifest.json"),
      manifest
    );
    await this.writeJson(path.join(runDir, "summary.json"), {
      id: manifest.id,
      version: manifest.version,
      gitCommit: manifest.gitCommit,
      timestamp: manifest.timestamp,
      summary: manifest.summary
    });
    await this.updateLatestSymlink(runDir);
    return runDir;
  }
  /**
   * Write results for a specific benchmark.
   */
  async writeBenchmarkResult(runDir, benchmarkRun) {
    const benchmarkDir = path.join(runDir, benchmarkRun.benchmarkId);
    await fs.mkdir(benchmarkDir, { recursive: true });
    if (benchmarkRun.scenarios.baseline) {
      await this.writeScenarioResult(
        benchmarkDir,
        "baseline",
        benchmarkRun.scenarios.baseline
      );
    }
    if (benchmarkRun.scenarios.devpilot) {
      await this.writeScenarioResult(
        benchmarkDir,
        "devpilot",
        benchmarkRun.scenarios.devpilot
      );
    }
    if (benchmarkRun.comparison) {
      await this.writeJson(
        path.join(benchmarkDir, "comparison.json"),
        benchmarkRun.comparison
      );
    }
  }
  /**
   * Write results for a specific scenario.
   */
  async writeScenarioResult(benchmarkDir, scenario, result) {
    const scenarioDir = path.join(benchmarkDir, scenario);
    await fs.mkdir(scenarioDir, { recursive: true });
    const sessionLog = result.sessions.map((s) => JSON.stringify(s)).join("\n");
    await fs.writeFile(
      path.join(scenarioDir, "session-log.jsonl"),
      sessionLog,
      "utf-8"
    );
    await this.writeJson(
      path.join(scenarioDir, "timeline.json"),
      result.timeline
    );
    await fs.writeFile(
      path.join(scenarioDir, "acceptance.txt"),
      result.acceptanceResults.scriptOutput,
      "utf-8"
    );
    if (scenario === "devpilot" && result.wavePlan) {
      await this.writeJson(
        path.join(scenarioDir, "wave-plan.json"),
        result.wavePlan
      );
    }
  }
  /**
   * Write wave analysis results.
   */
  async writeWaveAnalysis(benchmarkDir, analysis) {
    await this.writeJson(
      path.join(benchmarkDir, "wave-analysis.json"),
      analysis
    );
  }
  /**
   * Write a markdown report.
   */
  async writeReport(runDir, reportContent) {
    await fs.writeFile(
      path.join(runDir, "report.md"),
      reportContent,
      "utf-8"
    );
  }
  /**
   * Update the 'latest' symlink to point to the most recent run.
   */
  async updateLatestSymlink(runDir) {
    const latestPath = path.join(this.resultsDir, "latest");
    try {
      try {
        const stats = await fs.lstat(latestPath);
        if (stats.isSymbolicLink()) {
          await fs.unlink(latestPath);
        }
      } catch {
      }
      const relativePath = path.relative(this.resultsDir, runDir);
      await fs.symlink(relativePath, latestPath);
    } catch (error) {
      console.warn(`Failed to update latest symlink: ${error}`);
    }
  }
  /**
   * Archive a workspace directory.
   */
  async archiveWorkspace(workspaceDir, outputPath) {
    const { execSync: execSync2 } = await import("child_process");
    const archivePath = outputPath.endsWith(".tar.gz") ? outputPath : `${outputPath}.tar.gz`;
    const parentDir = path.dirname(workspaceDir);
    const dirName = path.basename(workspaceDir);
    execSync2(`tar -czf "${archivePath}" -C "${parentDir}" "${dirName}"`, {
      encoding: "utf-8"
    });
    return archivePath;
  }
  /**
   * Get the path for a specific run.
   */
  getRunPath(version, timestamp) {
    const versionDir = sanitizeVersionForPath(version);
    return path.join(this.resultsDir, versionDir, timestamp);
  }
  /**
   * Check if a run exists.
   */
  async runExists(version, timestamp) {
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
  async writeJson(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  }
};
function createResultsWriter(config) {
  return new ResultsWriter(config);
}

// src/storage/history-reader.ts
import * as fs2 from "fs/promises";
import * as path2 from "path";
var HistoryReader = class {
  constructor(config) {
    this.resultsDir = config.resultsDir;
  }
  /**
   * List all versions that have results.
   */
  async listVersions() {
    try {
      const entries = await fs2.readdir(this.resultsDir, {
        withFileTypes: true
      });
      return entries.filter((e) => e.isDirectory() && e.name !== "latest").map((e) => e.name).sort().reverse();
    } catch {
      return [];
    }
  }
  /**
   * List all runs for a version, sorted by timestamp (most recent first).
   */
  async listRuns(version) {
    const versionDir = path2.join(this.resultsDir, version);
    try {
      const entries = await fs2.readdir(versionDir, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort().reverse();
    } catch {
      return [];
    }
  }
  /**
   * Read a run manifest.
   */
  async readRunManifest(version, timestamp) {
    const manifestPath = path2.join(
      this.resultsDir,
      version,
      timestamp,
      "run-manifest.json"
    );
    try {
      const content = await fs2.readFile(manifestPath, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
  /**
   * Get the latest run.
   */
  async getLatestRun() {
    try {
      const latestPath = path2.join(this.resultsDir, "latest");
      const resolvedPath = await fs2.realpath(latestPath);
      const manifestPath = path2.join(resolvedPath, "run-manifest.json");
      const content = await fs2.readFile(manifestPath, "utf-8");
      return JSON.parse(content);
    } catch {
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
  async getTrendDataPoints(benchmarkId, limit = 20) {
    const dataPoints = [];
    const versions = await this.listVersions();
    for (const version of versions) {
      if (dataPoints.length >= limit) break;
      const runs = await this.listRuns(version);
      for (const timestamp of runs) {
        if (dataPoints.length >= limit) break;
        const manifest = await this.readRunManifest(version, timestamp);
        if (!manifest) continue;
        const benchmarkRun = manifest.benchmarks.find(
          (b) => b.benchmarkId === benchmarkId
        );
        if (!benchmarkRun || !benchmarkRun.compositeScore) continue;
        const devpilotResult = benchmarkRun.scenarios.devpilot;
        if (!devpilotResult) continue;
        dataPoints.push({
          version: manifest.version,
          timestamp: manifest.timestamp,
          compositeScore: benchmarkRun.compositeScore.total,
          speedup: benchmarkRun.comparison?.speedup ?? 1,
          costReduction: benchmarkRun.comparison?.costReduction ?? 0,
          passRate: devpilotResult.acceptanceResults.passRate
        });
      }
    }
    return dataPoints;
  }
  /**
   * Read comparison results for a benchmark.
   */
  async readComparison(version, timestamp, benchmarkId) {
    const comparisonPath = path2.join(
      this.resultsDir,
      version,
      timestamp,
      benchmarkId,
      "comparison.json"
    );
    try {
      const content = await fs2.readFile(comparisonPath, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
  /**
   * Read wave analysis for a benchmark.
   */
  async readWaveAnalysis(version, timestamp, benchmarkId) {
    const analysisPath = path2.join(
      this.resultsDir,
      version,
      timestamp,
      benchmarkId,
      "wave-analysis.json"
    );
    try {
      const content = await fs2.readFile(analysisPath, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
  /**
   * Get all benchmark runs across all versions for trend analysis.
   */
  async getAllBenchmarkRuns(benchmarkId, limit = 100) {
    const runs = [];
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
  async findRuns(criteria, limit = 50) {
    const results = [];
    const versions = criteria.version ? [criteria.version] : await this.listVersions();
    for (const version of versions) {
      if (results.length >= limit) break;
      const runs = await this.listRuns(version);
      for (const timestamp of runs) {
        if (results.length >= limit) break;
        if (criteria.fromDate || criteria.toDate) {
          const runDate = parseTimestampPath(timestamp);
          if (criteria.fromDate && runDate < criteria.fromDate) continue;
          if (criteria.toDate && runDate > criteria.toDate) continue;
        }
        const manifest = await this.readRunManifest(version, timestamp);
        if (!manifest) continue;
        if (criteria.benchmarkId) {
          const hasBenchmark = manifest.benchmarks.some(
            (b) => b.benchmarkId === criteria.benchmarkId
          );
          if (!hasBenchmark) continue;
        }
        if (criteria.minScore !== void 0 || criteria.maxScore !== void 0) {
          const avgScore = manifest.summary.avgCompositeScore;
          if (criteria.minScore !== void 0 && avgScore < criteria.minScore)
            continue;
          if (criteria.maxScore !== void 0 && avgScore > criteria.maxScore)
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
  async getOverallStatistics(benchmarkId) {
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
        const benchmarks = benchmarkId ? manifest.benchmarks.filter((b) => b.benchmarkId === benchmarkId) : manifest.benchmarks;
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
      avgSpeedup: totalRuns > 0 ? totalSpeedup / totalRuns : 1
    };
  }
};
function createHistoryReader(config) {
  return new HistoryReader(config);
}

// src/analysis/scoring.ts
var DEFAULT_WEIGHTS = {
  acceptanceTests: 0.3,
  wavePlanQuality: 0.25,
  firstAttemptPassRate: 0.2,
  completionTime: 0.15,
  reworkRatio: 0.1
};
var ScoringEngine = class {
  constructor(config = {}) {
    this.weights = config.weights ?? DEFAULT_WEIGHTS;
    this.idealTimeMs = config.idealTimeMs ?? SCORING_CONSTANTS.IDEAL_TIME_MS;
    this.maxTimeMs = config.maxTimeMs ?? SCORING_CONSTANTS.MAX_TIME_MS;
  }
  /**
   * Calculate composite score for a scenario result.
   */
  calculateScore(result, waveAnalysis) {
    const acceptanceTests = this.scoreAcceptanceTests(result);
    const wavePlanQuality = this.scoreWavePlanQuality(waveAnalysis);
    const firstAttemptPassRate = this.scoreFirstAttemptPassRate(result);
    const completionTime = this.scoreCompletionTime(result);
    const reworkRatio = this.scoreReworkRatio(result);
    const total = acceptanceTests.weighted + wavePlanQuality.weighted + firstAttemptPassRate.weighted + completionTime.weighted + reworkRatio.weighted;
    return {
      total: Math.round(total * 100) / 100,
      breakdown: {
        acceptanceTests,
        wavePlanQuality,
        firstAttemptPassRate,
        completionTime,
        reworkRatio
      },
      grade: this.calculateGrade(total)
    };
  }
  /**
   * Score acceptance tests.
   * Raw value: pass rate (0-1)
   * Normalized: pass rate * 100 (0-100)
   */
  scoreAcceptanceTests(result) {
    const raw = result.acceptanceResults.passRate;
    const normalized = raw * 100;
    const weighted = normalized * this.weights.acceptanceTests;
    return {
      raw,
      normalized,
      weighted,
      weight: this.weights.acceptanceTests
    };
  }
  /**
   * Score wave plan quality.
   * Uses the wave analysis score (0-25) if available, scaled to 0-100.
   */
  scoreWavePlanQuality(waveAnalysis) {
    const raw = waveAnalysis?.score ?? 0;
    const normalized = raw / 25 * 100;
    const weighted = normalized * this.weights.wavePlanQuality;
    return {
      raw,
      normalized,
      weighted,
      weight: this.weights.wavePlanQuality
    };
  }
  /**
   * Score first-attempt pass rate.
   * Raw value: first attempt pass rate (0-1)
   */
  scoreFirstAttemptPassRate(result) {
    const raw = result.firstAttemptPassRate;
    const normalized = raw * 100;
    const weighted = normalized * this.weights.firstAttemptPassRate;
    return {
      raw,
      normalized,
      weighted,
      weight: this.weights.firstAttemptPassRate
    };
  }
  /**
   * Score completion time.
   * Linear scale: idealTimeMs = 100, maxTimeMs = 0
   * Below ideal = 100 (capped)
   * Above max = 0 (capped)
   */
  scoreCompletionTime(result) {
    const raw = result.wallClockMs;
    let normalized;
    if (raw <= this.idealTimeMs) {
      normalized = 100;
    } else if (raw >= this.maxTimeMs) {
      normalized = 0;
    } else {
      const range = this.maxTimeMs - this.idealTimeMs;
      const overtime = raw - this.idealTimeMs;
      normalized = 100 * (1 - overtime / range);
    }
    const weighted = normalized * this.weights.completionTime;
    return {
      raw,
      normalized,
      weighted,
      weight: this.weights.completionTime
    };
  }
  /**
   * Score rework ratio.
   * Raw value: rework ratio (1.0 = perfect, higher = more rework)
   * Normalized: max(0, 100 - (ratio - 1) * 100)
   * A ratio of 1.0 = 100 points
   * A ratio of 2.0 = 0 points
   */
  scoreReworkRatio(result) {
    const raw = result.reworkRatio ?? 1;
    const normalized = Math.max(0, Math.min(100, 100 - (raw - 1) * 100));
    const weighted = normalized * this.weights.reworkRatio;
    return {
      raw,
      normalized,
      weighted,
      weight: this.weights.reworkRatio
    };
  }
  /**
   * Calculate letter grade from total score.
   */
  calculateGrade(total) {
    if (total >= SCORING_CONSTANTS.GRADES.A) return "A";
    if (total >= SCORING_CONSTANTS.GRADES.B) return "B";
    if (total >= SCORING_CONSTANTS.GRADES.C) return "C";
    if (total >= SCORING_CONSTANTS.GRADES.D) return "D";
    return "F";
  }
  /**
   * Format a score component for display.
   */
  static formatComponent(component) {
    const raw = typeof component.raw === "number" && component.raw < 10 ? component.raw.toFixed(2) : Math.round(component.raw);
    return `${component.normalized.toFixed(1)}/100 (raw: ${raw}, weighted: ${component.weighted.toFixed(1)})`;
  }
  /**
   * Get a summary string for a composite score.
   */
  static formatScore(score) {
    return `${score.total.toFixed(1)}/100 (${score.grade})`;
  }
};
function createScoringEngine(config) {
  return new ScoringEngine(config);
}
function calculateScore(result, waveAnalysis, config) {
  const engine = new ScoringEngine(config);
  return engine.calculateScore(result, waveAnalysis);
}

// src/analysis/wave-analyzer.ts
function scoreTaskPlacement(actualWave, expectedWave) {
  const diff = Math.abs(actualWave - expectedWave);
  switch (diff) {
    case 0:
      return 1;
    case 1:
      return 0.75;
    case 2:
      return 0.5;
    case 3:
      return 0.25;
    default:
      return 0;
  }
}
var WaveAnalyzer = class {
  /**
   * Analyze a generated wave plan against ground truth.
   */
  analyze(generated, groundTruth) {
    const generatedTaskWaves = this.buildTaskWaveMap(generated);
    const groundTruthTaskWaves = this.buildGroundTruthTaskWaveMap(groundTruth);
    let totalScore = 0;
    let taskCount = 0;
    const dependencyViolations = [];
    const missedParallelism = [];
    const unnecessarySequencing = [];
    for (const [taskId, expectedWave] of groundTruthTaskWaves) {
      const actualWave = generatedTaskWaves.get(taskId);
      if (actualWave !== void 0) {
        totalScore += scoreTaskPlacement(actualWave, expectedWave);
        taskCount++;
        if (actualWave < expectedWave) {
          const deps = this.getTaskDependencies(taskId, groundTruth);
          for (const dep of deps) {
            const depWave = generatedTaskWaves.get(dep);
            if (depWave !== void 0 && depWave >= actualWave) {
              dependencyViolations.push(
                `${taskId} executed in wave ${actualWave} before dependency ${dep} (wave ${depWave})`
              );
            }
          }
        } else if (actualWave > expectedWave) {
          unnecessarySequencing.push(
            `${taskId} in wave ${actualWave}, expected wave ${expectedWave}`
          );
        }
      }
    }
    for (const wave of groundTruth.waves) {
      for (const parallelTask of wave.parallel) {
        const actualWave = generatedTaskWaves.get(parallelTask);
        for (const otherTask of wave.parallel) {
          if (otherTask !== parallelTask) {
            const otherWave = generatedTaskWaves.get(otherTask);
            if (actualWave !== void 0 && otherWave !== void 0 && actualWave !== otherWave) {
              missedParallelism.push(
                `${parallelTask} (wave ${actualWave}) and ${otherTask} (wave ${otherWave}) should be parallel`
              );
            }
          }
        }
      }
    }
    const editDistance = this.calculateEditDistance(
      generatedTaskWaves,
      groundTruthTaskWaves
    );
    const taskPlacementAccuracy = taskCount > 0 ? totalScore / taskCount : 0;
    const score = this.calculateFinalScore(
      taskPlacementAccuracy,
      dependencyViolations.length,
      missedParallelism.length
    );
    return {
      groundTruthWaves: groundTruth.waves.length,
      generatedWaves: generated.waves.length,
      taskPlacementAccuracy,
      dependencyViolations: [...new Set(dependencyViolations)],
      // Remove duplicates
      missedParallelism: [...new Set(missedParallelism)],
      unnecessarySequencing,
      editDistance,
      score
    };
  }
  /**
   * Build a map of task ID to wave number from a WavePlan.
   */
  buildTaskWaveMap(plan) {
    const map = /* @__PURE__ */ new Map();
    for (const wave of plan.waves) {
      for (const task of wave.tasks) {
        map.set(task.id, wave.waveNumber);
      }
    }
    return map;
  }
  /**
   * Build a map of task ID to wave number from ground truth.
   */
  buildGroundTruthTaskWaveMap(groundTruth) {
    const map = /* @__PURE__ */ new Map();
    for (const wave of groundTruth.waves) {
      for (const taskId of wave.tasks) {
        map.set(taskId, wave.wave);
      }
    }
    return map;
  }
  /**
   * Get dependencies for a task from ground truth.
   */
  getTaskDependencies(taskId, groundTruth) {
    const deps = [];
    const taskWave = groundTruth.waves.find((w) => w.tasks.includes(taskId));
    if (!taskWave || !taskWave.dependsOn) return deps;
    for (const depWaveNum of taskWave.dependsOn) {
      const depWave = groundTruth.waves.find((w) => w.wave === depWaveNum);
      if (depWave) {
        deps.push(...depWave.tasks);
      }
    }
    return deps;
  }
  /**
   * Calculate edit distance between two task-wave maps.
   */
  calculateEditDistance(generated, groundTruth) {
    let distance = 0;
    for (const [taskId, expectedWave] of groundTruth) {
      const actualWave = generated.get(taskId);
      if (actualWave === void 0) {
        distance++;
      } else if (actualWave !== expectedWave) {
        distance++;
      }
    }
    for (const taskId of generated.keys()) {
      if (!groundTruth.has(taskId)) {
        distance++;
      }
    }
    return distance;
  }
  /**
   * Calculate final wave plan score (0-25).
   */
  calculateFinalScore(taskPlacementAccuracy, dependencyViolations, missedParallelism) {
    let score = taskPlacementAccuracy * 20;
    const violationPenalty = Math.min(dependencyViolations * 2, 10);
    score -= violationPenalty;
    const parallelismPenalty = Math.min(missedParallelism * 1, 5);
    score -= parallelismPenalty;
    if (taskPlacementAccuracy === 1 && dependencyViolations === 0) {
      score += 5;
    }
    return Math.max(0, Math.min(25, Math.round(score * 100) / 100));
  }
  /**
   * Get a human-readable summary of the analysis.
   */
  static summarize(analysis) {
    const lines = [];
    lines.push(`Wave Plan Analysis: ${analysis.score}/25 points`);
    lines.push(`  Waves: ${analysis.generatedWaves} generated vs ${analysis.groundTruthWaves} expected`);
    lines.push(`  Task Placement Accuracy: ${(analysis.taskPlacementAccuracy * 100).toFixed(1)}%`);
    lines.push(`  Edit Distance: ${analysis.editDistance}`);
    if (analysis.dependencyViolations.length > 0) {
      lines.push(`  Dependency Violations (${analysis.dependencyViolations.length}):`);
      for (const v of analysis.dependencyViolations.slice(0, 3)) {
        lines.push(`    - ${v}`);
      }
      if (analysis.dependencyViolations.length > 3) {
        lines.push(`    ... and ${analysis.dependencyViolations.length - 3} more`);
      }
    }
    if (analysis.missedParallelism.length > 0) {
      lines.push(`  Missed Parallelism (${analysis.missedParallelism.length}):`);
      for (const m of analysis.missedParallelism.slice(0, 3)) {
        lines.push(`    - ${m}`);
      }
      if (analysis.missedParallelism.length > 3) {
        lines.push(`    ... and ${analysis.missedParallelism.length - 3} more`);
      }
    }
    return lines.join("\n");
  }
};
function createWaveAnalyzer() {
  return new WaveAnalyzer();
}
function analyzeWavePlan(generated, groundTruth) {
  const analyzer = new WaveAnalyzer();
  return analyzer.analyze(generated, groundTruth);
}

// src/analysis/comparator.ts
var Comparator = class {
  /**
   * Compare two scenario results.
   */
  compare(baseline, devpilot, waveAnalysis) {
    const speedup = devpilot.wallClockMs > 0 ? baseline.wallClockMs / devpilot.wallClockMs : 1;
    const costReduction = baseline.totalCostUsd > 0 ? 1 - devpilot.totalCostUsd / baseline.totalCostUsd : 0;
    const timeReductionMs = baseline.wallClockMs - devpilot.wallClockMs;
    const timeReductionPercent = baseline.wallClockMs > 0 ? timeReductionMs / baseline.wallClockMs * 100 : 0;
    const costReductionUsd = baseline.totalCostUsd - devpilot.totalCostUsd;
    const qualityDelta = devpilot.acceptanceResults.passRate - baseline.acceptanceResults.passRate;
    const tokenEfficiency = devpilot.totalTokens > 0 ? baseline.totalTokens / devpilot.totalTokens : 1;
    const wavePlanScore = waveAnalysis?.score ?? 0;
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
      compositeAdvantage
    };
  }
  /**
   * Calculate composite advantage between scenarios.
   */
  calculateCompositeAdvantage(baseline, devpilot, waveAnalysis) {
    const weights = {
      time: 0.3,
      cost: 0.25,
      quality: 0.25,
      wavePlan: 0.2
    };
    const timeAdvantage = Math.min(
      100,
      (baseline.wallClockMs - devpilot.wallClockMs) / baseline.wallClockMs * 100
    );
    const costAdvantage = Math.min(
      100,
      (baseline.totalCostUsd - devpilot.totalCostUsd) / baseline.totalCostUsd * 100
    );
    const qualityAdvantage = (devpilot.acceptanceResults.passRate - baseline.acceptanceResults.passRate) * 100;
    const wavePlanAdvantage = (waveAnalysis?.score ?? 0) * 4;
    return timeAdvantage * weights.time + costAdvantage * weights.cost + qualityAdvantage * weights.quality + wavePlanAdvantage * weights.wavePlan;
  }
  /**
   * Generate a human-readable comparison summary.
   */
  static summarize(comparison) {
    const lines = [];
    if (comparison.speedup > 1) {
      lines.push(
        `DevPilot completed ${comparison.speedup.toFixed(2)}x faster`
      );
    } else if (comparison.speedup < 1) {
      lines.push(
        `Baseline was ${(1 / comparison.speedup).toFixed(2)}x faster`
      );
    } else {
      lines.push("Both scenarios completed in similar time");
    }
    if (comparison.costReduction > 0) {
      lines.push(
        `DevPilot saved ${(comparison.costReduction * 100).toFixed(1)}% on cost ($${comparison.costReductionUsd.toFixed(2)})`
      );
    } else if (comparison.costReduction < 0) {
      lines.push(
        `DevPilot cost ${(-comparison.costReduction * 100).toFixed(1)}% more`
      );
    }
    if (comparison.qualityDelta > 0) {
      lines.push(
        `DevPilot achieved ${(comparison.qualityDelta * 100).toFixed(1)}% higher pass rate`
      );
    } else if (comparison.qualityDelta < 0) {
      lines.push(
        `Baseline achieved ${(-comparison.qualityDelta * 100).toFixed(1)}% higher pass rate`
      );
    }
    if (comparison.tokenEfficiency > 1.1) {
      lines.push(
        `DevPilot used ${((comparison.tokenEfficiency - 1) * 100).toFixed(1)}% fewer tokens`
      );
    } else if (comparison.tokenEfficiency < 0.9) {
      lines.push(
        `DevPilot used ${((1 - comparison.tokenEfficiency) * 100).toFixed(1)}% more tokens`
      );
    }
    if (comparison.wavePlanScore > 0) {
      lines.push(`Wave plan score: ${comparison.wavePlanScore}/25`);
    }
    return lines;
  }
  /**
   * Determine the overall winner.
   */
  static determineWinner(comparison) {
    let baselineWins = 0;
    let devpilotWins = 0;
    if (comparison.speedup > 1.1) devpilotWins++;
    else if (comparison.speedup < 0.9) baselineWins++;
    if (comparison.costReduction > 0.1) devpilotWins++;
    else if (comparison.costReduction < -0.1) baselineWins++;
    if (comparison.qualityDelta > 0.05) devpilotWins++;
    else if (comparison.qualityDelta < -0.05) baselineWins++;
    if (devpilotWins > baselineWins) return "devpilot";
    if (baselineWins > devpilotWins) return "baseline";
    return "tie";
  }
};
function createComparator() {
  return new Comparator();
}
function compareScenarios(baseline, devpilot, waveAnalysis) {
  const comparator = new Comparator();
  return comparator.compare(baseline, devpilot, waveAnalysis);
}

// src/analysis/trend.ts
var TREND_THRESHOLD = 0.05;
var TrendAnalyzer = class {
  /**
   * Analyze trends for a benchmark.
   */
  analyze(benchmarkId, dataPoints) {
    if (dataPoints.length === 0) {
      return this.emptyAnalysis(benchmarkId);
    }
    const sorted = [...dataPoints].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const speedupTrend = this.calculateTrend(sorted.map((d) => d.speedup));
    const costTrend = this.calculateTrend(
      sorted.map((d) => d.costReduction),
      true
      // Higher is better
    );
    const qualityTrend = this.calculateTrend(
      sorted.map((d) => d.passRate),
      true
      // Higher is better
    );
    const bestVersion = sorted.reduce(
      (best, current) => current.compositeScore > best.compositeScore ? current : best
    ).version;
    const latestDelta = this.calculateLatestDelta(sorted);
    return {
      benchmarkId,
      versions: sorted,
      trends: {
        speedupTrend,
        costTrend,
        qualityTrend
      },
      bestVersion,
      latestDelta
    };
  }
  /**
   * Calculate trend direction from a series of values.
   */
  calculateTrend(values, higherIsBetter = true) {
    if (values.length < 2) return "stable";
    const slope = this.linearRegressionSlope(values);
    const firstValue = values[0];
    const lastValue = values[values.length - 1];
    const percentChange = firstValue !== 0 ? (lastValue - firstValue) / Math.abs(firstValue) : 0;
    if (Math.abs(percentChange) < TREND_THRESHOLD) {
      return "stable";
    }
    const improving = higherIsBetter ? percentChange > 0 : percentChange < 0;
    return improving ? "improving" : "regressing";
  }
  /**
   * Calculate linear regression slope.
   */
  linearRegressionSlope(values) {
    const n = values.length;
    if (n < 2) return 0;
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
  calculateLatestDelta(sorted) {
    if (sorted.length < 2) {
      return {
        speedupChange: 0,
        costChange: 0,
        scoreChange: 0
      };
    }
    const latest = sorted[sorted.length - 1];
    const previous = sorted[sorted.length - 2];
    return {
      speedupChange: latest.speedup - previous.speedup,
      costChange: latest.costReduction - previous.costReduction,
      scoreChange: latest.compositeScore - previous.compositeScore
    };
  }
  /**
   * Create an empty analysis for when there's no data.
   */
  emptyAnalysis(benchmarkId) {
    return {
      benchmarkId,
      versions: [],
      trends: {
        speedupTrend: "stable",
        costTrend: "stable",
        qualityTrend: "stable"
      },
      bestVersion: "",
      latestDelta: {
        speedupChange: 0,
        costChange: 0,
        scoreChange: 0
      }
    };
  }
  /**
   * Calculate statistics for a series of values.
   */
  static calculateStatistics(values) {
    if (values.length === 0) {
      return { mean: 0, median: 0, stdDev: 0, min: 0, max: 0 };
    }
    const sorted = [...values].sort((a, b) => a - b);
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / n;
    const stdDev = Math.sqrt(avgSquaredDiff);
    return {
      mean,
      median,
      stdDev,
      min: sorted[0],
      max: sorted[n - 1]
    };
  }
  /**
   * Format trend direction for display.
   */
  static formatTrend(direction) {
    switch (direction) {
      case "improving":
        return "\u2191 Improving";
      case "regressing":
        return "\u2193 Regressing";
      case "stable":
        return "\u2192 Stable";
    }
  }
  /**
   * Generate a trend summary.
   */
  static summarize(analysis) {
    const lines = [];
    lines.push(`Benchmark: ${analysis.benchmarkId}`);
    lines.push(`Data points: ${analysis.versions.length}`);
    if (analysis.versions.length > 0) {
      lines.push(`Best version: ${analysis.bestVersion}`);
      lines.push("");
      lines.push("Trends:");
      lines.push(`  Speedup: ${this.formatTrend(analysis.trends.speedupTrend)}`);
      lines.push(`  Cost: ${this.formatTrend(analysis.trends.costTrend)}`);
      lines.push(`  Quality: ${this.formatTrend(analysis.trends.qualityTrend)}`);
      if (analysis.versions.length >= 2) {
        lines.push("");
        lines.push("Latest changes:");
        lines.push(
          `  Speedup: ${analysis.latestDelta.speedupChange > 0 ? "+" : ""}${analysis.latestDelta.speedupChange.toFixed(2)}x`
        );
        lines.push(
          `  Cost reduction: ${analysis.latestDelta.costChange > 0 ? "+" : ""}${(analysis.latestDelta.costChange * 100).toFixed(1)}%`
        );
        lines.push(
          `  Score: ${analysis.latestDelta.scoreChange > 0 ? "+" : ""}${analysis.latestDelta.scoreChange.toFixed(1)}`
        );
      }
    }
    return lines;
  }
};
function createTrendAnalyzer() {
  return new TrendAnalyzer();
}
function analyzeTrends(benchmarkId, dataPoints) {
  const analyzer = new TrendAnalyzer();
  return analyzer.analyze(benchmarkId, dataPoints);
}

// src/reporters/json.ts
import { writeFile as writeFile2, mkdir as mkdir2 } from "fs/promises";
import { dirname as dirname2 } from "path";
var JsonReporter = class {
  constructor(options = {}) {
    this.options = {
      pretty: options.pretty ?? true,
      includeRawOutput: options.includeRawOutput ?? false
    };
  }
  /**
   * Generate full run report as JSON.
   */
  generateRunReport(run) {
    const report = this.options.includeRawOutput ? run : this.stripRawOutput(run);
    return this.serialize(report);
  }
  /**
   * Generate comparison report as JSON.
   */
  generateComparisonReport(baseline, devpilot, comparison, waveAnalysis) {
    const report = {
      comparison,
      waveAnalysis,
      baseline: this.summarizeScenario(baseline),
      devpilot: this.summarizeScenario(devpilot),
      winner: this.determineWinner(comparison)
    };
    return this.serialize(report);
  }
  /**
   * Generate trend report as JSON.
   */
  generateTrendReport(analysis) {
    return this.serialize(analysis);
  }
  /**
   * Generate score report as JSON.
   */
  generateScoreReport(scenario, score, waveAnalysis) {
    const report = {
      scenario: scenario.scenario,
      score,
      waveAnalysis,
      metrics: {
        wallClockMs: scenario.wallClockMs,
        totalTokens: scenario.totalTokens,
        totalCostUsd: scenario.totalCostUsd,
        passRate: scenario.acceptanceResults.passRate,
        firstAttemptPassRate: scenario.firstAttemptPassRate,
        reworkRatio: scenario.reworkRatio
      }
    };
    return this.serialize(report);
  }
  /**
   * Generate summary report as JSON.
   */
  generateSummaryReport(run) {
    const report = {
      id: run.id,
      version: run.version,
      timestamp: run.timestamp,
      status: run.status,
      durationMs: run.durationMs,
      summary: run.summary,
      benchmarks: run.benchmarks.map((r) => ({
        benchmarkId: r.benchmarkId,
        comparison: r.comparison,
        waveAnalysis: r.waveAnalysis ? {
          score: r.waveAnalysis.score,
          taskPlacementAccuracy: r.waveAnalysis.taskPlacementAccuracy,
          dependencyViolations: r.waveAnalysis.dependencyViolations.length,
          missedParallelism: r.waveAnalysis.missedParallelism.length
        } : void 0
      }))
    };
    return this.serialize(report);
  }
  /**
   * Write report to file.
   */
  async writeReport(filePath, content) {
    await mkdir2(dirname2(filePath), { recursive: true });
    await writeFile2(filePath, content, "utf-8");
  }
  /**
   * Strip raw output from run for smaller file size.
   */
  stripRawOutput(run) {
    return {
      ...run,
      benchmarks: run.benchmarks.map((r) => ({
        ...r,
        scenarios: {
          baseline: r.scenarios.baseline ? this.stripScenarioOutput(r.scenarios.baseline) : null,
          devpilot: r.scenarios.devpilot ? this.stripScenarioOutput(r.scenarios.devpilot) : null
        }
      }))
    };
  }
  /**
   * Strip raw output from scenario.
   */
  stripScenarioOutput(scenario) {
    return {
      ...scenario,
      sessions: scenario.sessions.map((s) => ({
        ...s,
        stdout: "[stripped]"
      })),
      acceptanceResults: {
        ...scenario.acceptanceResults,
        scriptOutput: "[stripped]"
      }
    };
  }
  /**
   * Summarize scenario for comparison report.
   */
  summarizeScenario(scenario) {
    return {
      scenario: scenario.scenario,
      wallClockMs: scenario.wallClockMs,
      totalTokens: scenario.totalTokens,
      totalCostUsd: scenario.totalCostUsd,
      sessionCount: scenario.sessions.length,
      passRate: scenario.acceptanceResults.passRate,
      passed: scenario.acceptanceResults.passed,
      failed: scenario.acceptanceResults.failed
    };
  }
  /**
   * Determine winner from comparison.
   */
  determineWinner(comparison) {
    let baselineWins = 0;
    let devpilotWins = 0;
    if (comparison.speedup > 1.1) devpilotWins++;
    else if (comparison.speedup < 0.9) baselineWins++;
    if (comparison.costReduction > 0.1) devpilotWins++;
    else if (comparison.costReduction < -0.1) baselineWins++;
    if (comparison.qualityDelta > 0.05) devpilotWins++;
    else if (comparison.qualityDelta < -0.05) baselineWins++;
    if (devpilotWins > baselineWins) return "devpilot";
    if (baselineWins > devpilotWins) return "baseline";
    return "tie";
  }
  /**
   * Serialize to JSON string.
   */
  serialize(data) {
    return JSON.stringify(data, null, this.options.pretty ? 2 : void 0);
  }
};
function createJsonReporter(options) {
  return new JsonReporter(options);
}

// src/reporters/markdown.ts
import { writeFile as writeFile3, mkdir as mkdir3 } from "fs/promises";
import { dirname as dirname3 } from "path";
var MarkdownReporter = class {
  /**
   * Generate full run report.
   */
  generateRunReport(run) {
    const lines = [];
    lines.push("# Benchmark Run Report");
    lines.push("");
    lines.push(`**Version:** ${run.version}`);
    lines.push(`**Run ID:** ${run.id}`);
    lines.push(`**Timestamp:** ${run.timestamp}`);
    lines.push(`**Status:** ${this.formatStatus(run.status)}`);
    lines.push(`**Duration:** ${this.formatDuration(run.durationMs)}`);
    lines.push("");
    lines.push("## Executive Summary");
    lines.push("");
    lines.push(this.generateExecutiveSummary(run));
    lines.push("");
    lines.push("## Results Overview");
    lines.push("");
    lines.push(this.generateResultsTable(run));
    lines.push("");
    for (const result of run.benchmarks) {
      lines.push(`## ${result.benchmarkId}`);
      lines.push("");
      if (result.comparison) {
        lines.push("### Comparison");
        lines.push("");
        lines.push(this.generateComparisonSection(result.comparison));
        lines.push("");
      }
      if (result.waveAnalysis) {
        lines.push("### Wave Plan Analysis");
        lines.push("");
        lines.push(this.generateWaveAnalysisSection(result.waveAnalysis));
        lines.push("");
      }
      if (result.scenarios.baseline) {
        lines.push("### Baseline Scenario");
        lines.push("");
        lines.push(this.generateScenarioSection(result.scenarios.baseline));
        lines.push("");
      }
      if (result.scenarios.devpilot) {
        lines.push("### DevPilot Scenario");
        lines.push("");
        lines.push(this.generateScenarioSection(result.scenarios.devpilot));
        lines.push("");
      }
    }
    lines.push("---");
    lines.push("");
    lines.push(`Generated by DevPilot Benchmark Suite v${run.version}`);
    return lines.join("\n");
  }
  /**
   * Generate executive summary.
   */
  generateExecutiveSummary(run) {
    const lines = [];
    const { summary } = run;
    lines.push(`- **Benchmarks Run:** ${summary.totalBenchmarks}`);
    if (summary.avgSpeedup > 1) {
      lines.push(
        `- **Average Speedup:** ${summary.avgSpeedup.toFixed(2)}x faster with DevPilot`
      );
    } else if (summary.avgSpeedup < 1) {
      lines.push(
        `- **Average Speedup:** ${(1 / summary.avgSpeedup).toFixed(2)}x faster with baseline`
      );
    } else {
      lines.push(`- **Average Speedup:** No significant difference`);
    }
    if (summary.avgCostReduction > 0) {
      lines.push(
        `- **Average Cost Reduction:** ${(summary.avgCostReduction * 100).toFixed(1)}% with DevPilot`
      );
    } else if (summary.avgCostReduction < 0) {
      lines.push(
        `- **Average Cost Increase:** ${(-summary.avgCostReduction * 100).toFixed(1)}% with DevPilot`
      );
    }
    if (summary.avgQualityDelta > 0) {
      lines.push(
        `- **Quality Improvement:** +${(summary.avgQualityDelta * 100).toFixed(1)}% pass rate with DevPilot`
      );
    } else if (summary.avgQualityDelta < 0) {
      lines.push(
        `- **Quality Regression:** ${(summary.avgQualityDelta * 100).toFixed(1)}% pass rate with DevPilot`
      );
    }
    return lines.join("\n");
  }
  /**
   * Generate results table.
   */
  generateResultsTable(run) {
    const lines = [];
    lines.push("| Benchmark | Speedup | Cost Reduction | Quality Delta | Wave Score |");
    lines.push("|-----------|---------|----------------|---------------|------------|");
    for (const result of run.benchmarks) {
      const speedup = result.comparison ? `${result.comparison.speedup.toFixed(2)}x` : "-";
      const costReduction = result.comparison ? `${(result.comparison.costReduction * 100).toFixed(1)}%` : "-";
      const qualityDelta = result.comparison ? `${(result.comparison.qualityDelta * 100).toFixed(1)}%` : "-";
      const waveScore = result.waveAnalysis ? `${result.waveAnalysis.score}/25` : "-";
      lines.push(
        `| ${result.benchmarkId} | ${speedup} | ${costReduction} | ${qualityDelta} | ${waveScore} |`
      );
    }
    return lines.join("\n");
  }
  /**
   * Generate comparison section.
   */
  generateComparisonSection(comparison) {
    const lines = Comparator.summarize(comparison);
    return lines.map((l) => `- ${l}`).join("\n");
  }
  /**
   * Generate wave analysis section.
   */
  generateWaveAnalysisSection(analysis) {
    return WaveAnalyzer.summarize(analysis);
  }
  /**
   * Generate scenario section.
   */
  generateScenarioSection(scenario) {
    const lines = [];
    lines.push(`- **Duration:** ${this.formatDuration(scenario.wallClockMs)}`);
    lines.push(`- **Sessions:** ${scenario.sessions.length}`);
    lines.push(`- **Total Tokens:** ${scenario.totalTokens.toLocaleString()}`);
    lines.push(`- **Total Cost:** $${scenario.totalCostUsd.toFixed(2)}`);
    lines.push(`- **Pass Rate:** ${(scenario.acceptanceResults.passRate * 100).toFixed(1)}%`);
    lines.push(
      `- **Tests:** ${scenario.acceptanceResults.passed} passed, ${scenario.acceptanceResults.failed} failed`
    );
    if (scenario.wavePlan) {
      lines.push(`- **Waves:** ${scenario.wavePlan.waves.length}`);
      lines.push(`- **Planned Tasks:** ${scenario.wavePlan.totalTasks}`);
    }
    return lines.join("\n");
  }
  /**
   * Generate score report.
   */
  generateScoreReport(score) {
    const lines = [];
    lines.push("## Score Breakdown");
    lines.push("");
    lines.push(`**Total Score:** ${ScoringEngine.formatScore(score)}`);
    lines.push("");
    lines.push("### Components");
    lines.push("");
    const { breakdown } = score;
    lines.push(
      `- **Acceptance Tests (${breakdown.acceptanceTests.weight * 100}%):** ${ScoringEngine.formatComponent(breakdown.acceptanceTests)}`
    );
    lines.push(
      `- **Wave Plan Quality (${breakdown.wavePlanQuality.weight * 100}%):** ${ScoringEngine.formatComponent(breakdown.wavePlanQuality)}`
    );
    lines.push(
      `- **First Attempt Pass Rate (${breakdown.firstAttemptPassRate.weight * 100}%):** ${ScoringEngine.formatComponent(breakdown.firstAttemptPassRate)}`
    );
    lines.push(
      `- **Completion Time (${breakdown.completionTime.weight * 100}%):** ${ScoringEngine.formatComponent(breakdown.completionTime)}`
    );
    lines.push(
      `- **Rework Ratio (${breakdown.reworkRatio.weight * 100}%):** ${ScoringEngine.formatComponent(breakdown.reworkRatio)}`
    );
    return lines.join("\n");
  }
  /**
   * Generate trend report.
   */
  generateTrendReport(analysis) {
    const lines = TrendAnalyzer.summarize(analysis);
    return lines.join("\n");
  }
  /**
   * Generate ASCII Gantt chart.
   */
  generateGanttChart(events, widthChars = 60) {
    const lines = [];
    const timestamps = events.map((e) => new Date(e.timestamp).getTime()).filter((t) => !isNaN(t));
    if (timestamps.length === 0) return "No timeline events";
    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps);
    const range = maxTime - minTime || 1;
    const sessions = /* @__PURE__ */ new Map();
    for (const event of events) {
      if (event.sessionId) {
        if (!sessions.has(event.sessionId)) {
          sessions.set(event.sessionId, []);
        }
        sessions.get(event.sessionId).push(event);
      }
    }
    lines.push("```");
    lines.push("Timeline:");
    lines.push(`${"\u2500".repeat(widthChars + 10)}`);
    for (const [sessionId, sessionEvents] of sessions) {
      const shortId = sessionId.slice(0, 8);
      const startEvent = sessionEvents.find((e) => e.eventType === "session_start");
      const endEvent = sessionEvents.find((e) => e.eventType === "session_complete");
      if (startEvent && endEvent) {
        const startPos = Math.floor(
          (new Date(startEvent.timestamp).getTime() - minTime) / range * widthChars
        );
        const endPos = Math.floor(
          (new Date(endEvent.timestamp).getTime() - minTime) / range * widthChars
        );
        const barLength = Math.max(1, endPos - startPos);
        const bar = " ".repeat(startPos) + "\u2588".repeat(barLength) + " ".repeat(widthChars - startPos - barLength);
        lines.push(`${shortId} \u2502${bar}\u2502`);
      }
    }
    lines.push(`${"\u2500".repeat(widthChars + 10)}`);
    lines.push("```");
    return lines.join("\n");
  }
  /**
   * Write report to file.
   */
  async writeReport(filePath, content) {
    await mkdir3(dirname3(filePath), { recursive: true });
    await writeFile3(filePath, content, "utf-8");
  }
  /**
   * Format status with emoji.
   */
  formatStatus(status) {
    switch (status) {
      case "completed":
        return "Completed";
      case "partial":
        return "Partial";
      case "failed":
        return "Failed";
      case "running":
        return "Running";
      default:
        return status;
    }
  }
  /**
   * Format duration.
   */
  formatDuration(ms) {
    if (ms < 1e3) return `${ms}ms`;
    if (ms < 6e4) return `${(ms / 1e3).toFixed(1)}s`;
    const minutes = Math.floor(ms / 6e4);
    const seconds = Math.floor(ms % 6e4 / 1e3);
    return `${minutes}m ${seconds}s`;
  }
};
function createMarkdownReporter() {
  return new MarkdownReporter();
}

// src/reporters/console.ts
import chalk from "chalk";
var BOX_CHARS = {
  topLeft: "\u250C",
  topRight: "\u2510",
  bottomLeft: "\u2514",
  bottomRight: "\u2518",
  horizontal: "\u2500",
  vertical: "\u2502",
  teeRight: "\u251C",
  teeLeft: "\u2524",
  teeDown: "\u252C",
  teeUp: "\u2534",
  cross: "\u253C"
};
var ConsoleReporter = class {
  constructor(verbose = false) {
    this.verbose = verbose;
  }
  /**
   * Print run header.
   */
  printHeader(run) {
    console.log("");
    console.log(chalk.bold.blue("\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557"));
    console.log(chalk.bold.blue("\u2551") + chalk.bold.white("            DevPilot Benchmark Suite                        ") + chalk.bold.blue("\u2551"));
    console.log(chalk.bold.blue("\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D"));
    console.log("");
    console.log(`  ${chalk.gray("Version:")}    ${run.version}`);
    console.log(`  ${chalk.gray("Run ID:")}     ${run.id}`);
    console.log(`  ${chalk.gray("Timestamp:")}  ${run.timestamp}`);
    console.log("");
  }
  /**
   * Print run summary.
   */
  printSummary(run) {
    const { summary } = run;
    console.log(chalk.bold("Summary"));
    console.log(BOX_CHARS.topLeft + BOX_CHARS.horizontal.repeat(58) + BOX_CHARS.topRight);
    console.log(
      BOX_CHARS.vertical + ` Benchmarks: ${summary.totalBenchmarks.toString().padEnd(45)}` + BOX_CHARS.vertical
    );
    const speedupStr = summary.avgSpeedup > 1 ? chalk.green(`${summary.avgSpeedup.toFixed(2)}x faster`) : summary.avgSpeedup < 1 ? chalk.red(`${(1 / summary.avgSpeedup).toFixed(2)}x slower`) : chalk.gray("no change");
    console.log(
      BOX_CHARS.vertical + ` Avg Speedup: ${speedupStr.padEnd(44)}` + BOX_CHARS.vertical
    );
    const costStr = summary.avgCostReduction > 0 ? chalk.green(`${(summary.avgCostReduction * 100).toFixed(1)}% reduction`) : summary.avgCostReduction < 0 ? chalk.red(`${(-summary.avgCostReduction * 100).toFixed(1)}% increase`) : chalk.gray("no change");
    console.log(
      BOX_CHARS.vertical + ` Avg Cost: ${costStr.padEnd(47)}` + BOX_CHARS.vertical
    );
    const qualityStr = summary.avgQualityDelta > 0 ? chalk.green(`+${(summary.avgQualityDelta * 100).toFixed(1)}%`) : summary.avgQualityDelta < 0 ? chalk.red(`${(summary.avgQualityDelta * 100).toFixed(1)}%`) : chalk.gray("no change");
    console.log(
      BOX_CHARS.vertical + ` Avg Quality Delta: ${qualityStr.padEnd(38)}` + BOX_CHARS.vertical
    );
    console.log(BOX_CHARS.bottomLeft + BOX_CHARS.horizontal.repeat(58) + BOX_CHARS.bottomRight);
    console.log("");
  }
  /**
   * Print results table.
   */
  printResultsTable(run) {
    console.log(chalk.bold("Results"));
    console.log("");
    console.log(
      chalk.gray("  Benchmark".padEnd(25)) + chalk.gray("Speedup".padEnd(12)) + chalk.gray("Cost".padEnd(12)) + chalk.gray("Quality".padEnd(12)) + chalk.gray("Wave".padEnd(10))
    );
    console.log(chalk.gray("  " + "\u2500".repeat(65)));
    for (const result of run.benchmarks) {
      const name = result.benchmarkId.padEnd(23);
      const speedup = result.comparison ? this.formatSpeedup(result.comparison.speedup) : chalk.gray("-".padEnd(10));
      const cost = result.comparison ? this.formatPercentage(result.comparison.costReduction, true) : chalk.gray("-".padEnd(10));
      const quality = result.comparison ? this.formatPercentage(result.comparison.qualityDelta, true) : chalk.gray("-".padEnd(10));
      const wave = result.waveAnalysis ? this.formatWaveScore(result.waveAnalysis.score) : chalk.gray("-".padEnd(8));
      console.log(`  ${name}${speedup}${cost}${quality}${wave}`);
    }
    console.log("");
  }
  /**
   * Print comparison details.
   */
  printComparison(benchmarkId, comparison, waveAnalysis) {
    console.log(chalk.bold(`
${benchmarkId} Comparison`));
    console.log(chalk.gray("\u2500".repeat(40)));
    console.log(`  Speedup:          ${this.formatSpeedup(comparison.speedup)}`);
    console.log(`  Cost Reduction:   ${this.formatPercentage(comparison.costReduction, true)}`);
    console.log(`  Time Saved:       ${this.formatDuration(comparison.timeReductionMs)}`);
    console.log(`  Token Efficiency: ${this.formatSpeedup(comparison.tokenEfficiency)}`);
    console.log(`  Quality Delta:    ${this.formatPercentage(comparison.qualityDelta, true)}`);
    if (waveAnalysis) {
      console.log("");
      console.log(chalk.bold("  Wave Plan Analysis"));
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
  printScoreCard(scenario, score) {
    console.log(chalk.bold(`
${scenario.scenario.toUpperCase()} Score Card`));
    console.log(chalk.gray("\u2500".repeat(50)));
    const gradeColor = score.grade === "A" ? chalk.green : score.grade === "B" ? chalk.blue : score.grade === "C" ? chalk.yellow : score.grade === "D" ? chalk.magenta : chalk.red;
    console.log(`  Total Score: ${gradeColor.bold(score.total.toFixed(1))} ${gradeColor(`(${score.grade})`)}`);
    console.log("");
    const { breakdown } = score;
    this.printScoreBar("Acceptance", breakdown.acceptanceTests.normalized, breakdown.acceptanceTests.weight);
    this.printScoreBar("Wave Plan", breakdown.wavePlanQuality.normalized, breakdown.wavePlanQuality.weight);
    this.printScoreBar("First Attempt", breakdown.firstAttemptPassRate.normalized, breakdown.firstAttemptPassRate.weight);
    this.printScoreBar("Time", breakdown.completionTime.normalized, breakdown.completionTime.weight);
    this.printScoreBar("Rework", breakdown.reworkRatio.normalized, breakdown.reworkRatio.weight);
  }
  /**
   * Print a score bar.
   */
  printScoreBar(label, score, weight) {
    const barWidth = 20;
    const filledWidth = Math.round(score / 100 * barWidth);
    const emptyWidth = barWidth - filledWidth;
    const color = score >= 80 ? chalk.green : score >= 60 ? chalk.yellow : chalk.red;
    const bar = color("\u2588".repeat(filledWidth)) + chalk.gray("\u2591".repeat(emptyWidth));
    const weightStr = `(${(weight * 100).toFixed(0)}%)`.padEnd(6);
    console.log(`  ${label.padEnd(14)} ${bar} ${score.toFixed(1).padStart(5)}/100 ${chalk.gray(weightStr)}`);
  }
  /**
   * Print trend analysis.
   */
  printTrends(analysis) {
    console.log(chalk.bold(`
${analysis.benchmarkId} Trends`));
    console.log(chalk.gray("\u2500".repeat(40)));
    console.log(`  Data Points:    ${analysis.versions.length}`);
    console.log(`  Best Version:   ${analysis.bestVersion || "N/A"}`);
    console.log("");
    console.log("  Trends:");
    console.log(`    Speedup:  ${this.formatTrendDirection(analysis.trends.speedupTrend)}`);
    console.log(`    Cost:     ${this.formatTrendDirection(analysis.trends.costTrend)}`);
    console.log(`    Quality:  ${this.formatTrendDirection(analysis.trends.qualityTrend)}`);
    if (analysis.versions.length >= 2) {
      console.log("");
      console.log("  Latest Changes:");
      console.log(
        `    Speedup:  ${this.formatDelta(analysis.latestDelta.speedupChange, "x")}`
      );
      console.log(
        `    Cost:     ${this.formatDelta(analysis.latestDelta.costChange * 100, "%")}`
      );
      console.log(
        `    Score:    ${this.formatDelta(analysis.latestDelta.scoreChange, "")}`
      );
    }
  }
  /**
   * Print progress during execution.
   */
  printProgress(message, current, total) {
    if (current !== void 0 && total !== void 0) {
      const percent = Math.round(current / total * 100);
      const bar = this.createProgressBar(percent, 20);
      process.stdout.write(`\r  ${bar} ${percent.toString().padStart(3)}% ${message.padEnd(40)}`);
    } else {
      console.log(`  ${chalk.blue("\u2192")} ${message}`);
    }
  }
  /**
   * Print success message.
   */
  printSuccess(message) {
    console.log(`  ${chalk.green("\u2713")} ${message}`);
  }
  /**
   * Print error message.
   */
  printError(message) {
    console.log(`  ${chalk.red("\u2717")} ${message}`);
  }
  /**
   * Print warning message.
   */
  printWarning(message) {
    console.log(`  ${chalk.yellow("!")} ${message}`);
  }
  /**
   * Create a progress bar.
   */
  createProgressBar(percent, width) {
    const filled = Math.round(percent / 100 * width);
    const empty = width - filled;
    return chalk.blue("\u2588".repeat(filled)) + chalk.gray("\u2591".repeat(empty));
  }
  /**
   * Format speedup value.
   */
  formatSpeedup(speedup) {
    const str = `${speedup.toFixed(2)}x`;
    if (speedup > 1.1) return chalk.green(str.padEnd(10));
    if (speedup < 0.9) return chalk.red(str.padEnd(10));
    return chalk.gray(str.padEnd(10));
  }
  /**
   * Format percentage value.
   */
  formatPercentage(value, isGood) {
    const percent = value * 100;
    const sign = percent >= 0 ? "+" : "";
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
  formatWaveScore(score) {
    const str = `${score}/25`;
    if (score >= 20) return chalk.green(str.padEnd(8));
    if (score >= 15) return chalk.blue(str.padEnd(8));
    if (score >= 10) return chalk.yellow(str.padEnd(8));
    return chalk.red(str.padEnd(8));
  }
  /**
   * Format duration.
   */
  formatDuration(ms) {
    if (ms < 0) {
      return chalk.red(`-${this.formatDurationAbs(-ms)}`);
    }
    return chalk.green(`+${this.formatDurationAbs(ms)}`);
  }
  formatDurationAbs(ms) {
    const absMs = Math.abs(ms);
    if (absMs < 1e3) return `${absMs}ms`;
    if (absMs < 6e4) return `${(absMs / 1e3).toFixed(1)}s`;
    const minutes = Math.floor(absMs / 6e4);
    const seconds = Math.floor(absMs % 6e4 / 1e3);
    return `${minutes}m ${seconds}s`;
  }
  /**
   * Format trend direction.
   */
  formatTrendDirection(direction) {
    switch (direction) {
      case "improving":
        return chalk.green("\u2191 Improving");
      case "regressing":
        return chalk.red("\u2193 Regressing");
      case "stable":
        return chalk.gray("\u2192 Stable");
    }
  }
  /**
   * Format delta value.
   */
  formatDelta(value, suffix) {
    const sign = value >= 0 ? "+" : "";
    const str = `${sign}${value.toFixed(2)}${suffix}`;
    if (value > 0) return chalk.green(str);
    if (value < 0) return chalk.red(str);
    return chalk.gray(str);
  }
};
function createConsoleReporter(verbose) {
  return new ConsoleReporter(verbose);
}

// src/runner/index.ts
import { readFile as readFile6 } from "fs/promises";
import { join as join8 } from "path";
import { createId as createId3 } from "@paralleldrive/cuid2";

// src/runner/process-manager.ts
import { spawn } from "child_process";
var ProcessManager = class {
  constructor(defaultTimeoutMs = 12e4) {
    this.registry = /* @__PURE__ */ new Map();
    this.defaultTimeoutMs = defaultTimeoutMs;
  }
  /**
   * Spawn a process and wait for completion.
   */
  async spawn(command, args, options = {}) {
    const { workspaceId = "default", timeoutMs = this.defaultTimeoutMs, ...spawnOptions } = options;
    const startTime = Date.now();
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        ...spawnOptions
      });
      if (proc.pid) {
        this.registry.set(proc.pid, { process: proc, workspaceId, startTime });
      }
      let stdout = "";
      let stderr = "";
      let timeoutId = null;
      if (timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          proc.kill("SIGTERM");
          setTimeout(() => {
            if (!proc.killed) {
              proc.kill("SIGKILL");
            }
          }, 5e3);
        }, timeoutMs);
      }
      proc.stdout?.on("data", (data) => {
        stdout += data.toString();
      });
      proc.stderr?.on("data", (data) => {
        stderr += data.toString();
      });
      proc.on("close", (exitCode, signal) => {
        if (timeoutId) clearTimeout(timeoutId);
        if (proc.pid) this.registry.delete(proc.pid);
        resolve({
          stdout,
          stderr,
          exitCode,
          signal,
          durationMs: Date.now() - startTime
        });
      });
      proc.on("error", (error) => {
        if (timeoutId) clearTimeout(timeoutId);
        if (proc.pid) this.registry.delete(proc.pid);
        reject(error);
      });
    });
  }
  /**
   * Spawn a process with streaming output capture.
   */
  spawnStreaming(command, args, options = {}) {
    const {
      workspaceId = "default",
      timeoutMs = this.defaultTimeoutMs,
      onStdout,
      onStderr,
      ...spawnOptions
    } = options;
    const startTime = Date.now();
    const stdout = [];
    const stderr = [];
    const proc = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      ...spawnOptions
    });
    if (proc.pid) {
      this.registry.set(proc.pid, { process: proc, workspaceId, startTime });
    }
    let timeoutId = null;
    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        proc.kill("SIGTERM");
        setTimeout(() => {
          if (!proc.killed) {
            proc.kill("SIGKILL");
          }
        }, 5e3);
      }, timeoutMs);
    }
    proc.stdout?.on("data", (data) => {
      const text = data.toString();
      stdout.push(text);
      onStdout?.(text);
    });
    proc.stderr?.on("data", (data) => {
      const text = data.toString();
      stderr.push(text);
      onStderr?.(text);
    });
    const promise = new Promise((resolve, reject) => {
      proc.on("close", (exitCode, signal) => {
        if (timeoutId) clearTimeout(timeoutId);
        if (proc.pid) this.registry.delete(proc.pid);
        resolve({
          stdout: stdout.join(""),
          stderr: stderr.join(""),
          exitCode,
          signal,
          durationMs: Date.now() - startTime
        });
      });
      proc.on("error", (error) => {
        if (timeoutId) clearTimeout(timeoutId);
        if (proc.pid) this.registry.delete(proc.pid);
        reject(error);
      });
    });
    const kill = async () => {
      if (proc.killed) return;
      proc.kill("SIGTERM");
      await new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (proc.killed) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
        setTimeout(() => {
          clearInterval(checkInterval);
          if (!proc.killed) {
            proc.kill("SIGKILL");
          }
          resolve();
        }, 5e3);
      });
      if (proc.pid) this.registry.delete(proc.pid);
    };
    return {
      process: proc,
      stdout,
      stderr,
      promise,
      kill
    };
  }
  /**
   * Kill all processes registered for a workspace.
   */
  async killWorkspace(workspaceId) {
    let killed = 0;
    for (const [pid, entry] of this.registry) {
      if (entry.workspaceId === workspaceId) {
        try {
          entry.process.kill("SIGTERM");
          await new Promise((resolve) => {
            setTimeout(() => {
              if (!entry.process.killed) {
                entry.process.kill("SIGKILL");
              }
              resolve();
            }, 5e3);
          });
          this.registry.delete(pid);
          killed++;
        } catch {
          this.registry.delete(pid);
        }
      }
    }
    return killed;
  }
  /**
   * Kill all registered processes.
   */
  async killAll() {
    let killed = 0;
    for (const [pid, entry] of this.registry) {
      try {
        entry.process.kill("SIGTERM");
        await new Promise((resolve) => {
          setTimeout(() => {
            if (!entry.process.killed) {
              entry.process.kill("SIGKILL");
            }
            resolve();
          }, 5e3);
        });
        killed++;
      } catch {
      }
    }
    this.registry.clear();
    return killed;
  }
  /**
   * Get count of active processes.
   */
  getActiveCount() {
    return this.registry.size;
  }
  /**
   * Get active processes for a workspace.
   */
  getWorkspaceProcesses(workspaceId) {
    const pids = [];
    for (const [pid, entry] of this.registry) {
      if (entry.workspaceId === workspaceId) {
        pids.push(pid);
      }
    }
    return pids;
  }
};
function createProcessManager(defaultTimeoutMs) {
  return new ProcessManager(defaultTimeoutMs);
}

// src/runner/environment.ts
import { mkdir as mkdir4, rm, cp, readdir as readdir2, stat, writeFile as writeFile4, readFile as readFile2 } from "fs/promises";
import { join as join4, dirname as dirname4 } from "path";
import * as tar from "tar";
var TEMP_BASE = "/tmp/devpilot-bench";
var WorkspaceManager = class {
  constructor(processManager) {
    this.activeWorkspaces = /* @__PURE__ */ new Map();
    this.processManager = processManager;
  }
  /**
   * Create and setup a workspace for benchmark execution.
   */
  async createWorkspace(config) {
    const {
      runId,
      benchmarkId,
      scenario,
      benchmarksDir
    } = config;
    const workspacePath = join4(TEMP_BASE, runId, scenario, benchmarkId);
    await mkdir4(workspacePath, { recursive: true });
    const benchmarkPath = await this.findBenchmarkPath(benchmarksDir, benchmarkId);
    if (!benchmarkPath) {
      throw new Error(`Benchmark not found: ${benchmarkId}`);
    }
    const prdSource = join4(benchmarkPath, "PRD.md");
    const prdDest = join4(workspacePath, "PRD.md");
    try {
      await cp(prdSource, prdDest);
    } catch {
      throw new Error(`PRD.md not found at ${prdSource}`);
    }
    const fixturesSource = join4(benchmarkPath, "fixtures");
    const fixturesDest = join4(workspacePath, "fixtures");
    try {
      const fixturesStat = await stat(fixturesSource);
      if (fixturesStat.isDirectory()) {
        await cp(fixturesSource, fixturesDest, { recursive: true });
      }
    } catch {
    }
    const acceptanceSource = join4(benchmarkPath, "acceptance");
    const acceptanceDest = join4(workspacePath, "acceptance");
    try {
      const acceptanceStat = await stat(acceptanceSource);
      if (acceptanceStat.isDirectory()) {
        await cp(acceptanceSource, acceptanceDest, { recursive: true });
        await this.makeScriptsExecutable(acceptanceDest);
      }
    } catch {
    }
    await this.initializePackageJson(workspacePath, benchmarkId, benchmarkPath);
    const workspaceId = `${runId}-${scenario}-${benchmarkId}`;
    const info = {
      id: workspaceId,
      rootDir: workspacePath,
      fixturesDir: fixturesDest,
      acceptanceDir: acceptanceDest,
      // No dedicated output subtree is created; the workspace root doubles as
      // the output directory for generated artifacts.
      outputDir: workspacePath,
      prdPath: prdDest,
      processIds: []
    };
    this.activeWorkspaces.set(workspaceId, info);
    return info;
  }
  /**
   * Find the benchmark directory path.
   */
  async findBenchmarkPath(benchmarksDir, benchmarkId) {
    const exactPath = join4(benchmarksDir, benchmarkId);
    try {
      const s = await stat(exactPath);
      if (s.isDirectory()) return exactPath;
    } catch {
    }
    try {
      const entries = await readdir2(benchmarksDir);
      const prefix = benchmarkId.split("-")[0];
      for (const entry of entries) {
        if (entry.startsWith(`${prefix}-`)) {
          const fullPath = join4(benchmarksDir, entry);
          const s = await stat(fullPath);
          if (s.isDirectory()) return fullPath;
        }
      }
    } catch {
    }
    return null;
  }
  /**
   * Make shell scripts executable.
   */
  async makeScriptsExecutable(dir) {
    try {
      const entries = await readdir2(dir);
      for (const entry of entries) {
        if (entry.endsWith(".sh")) {
          const scriptPath = join4(dir, entry);
          await this.processManager.spawn("chmod", ["+x", scriptPath]);
        }
      }
    } catch {
    }
  }
  /**
   * Initialize package.json for the workspace.
   */
  async initializePackageJson(workspacePath, benchmarkId, benchmarkPath) {
    const templatePath = join4(benchmarkPath, "package.template.json");
    try {
      const template = await readFile2(templatePath, "utf-8");
      await writeFile4(join4(workspacePath, "package.json"), template);
      return;
    } catch {
    }
    const packageJson = {
      name: `benchmark-${benchmarkId}`,
      version: "0.0.0",
      private: true,
      type: "module",
      scripts: {
        build: 'echo "Build not configured"',
        test: 'echo "Tests not configured"'
      }
    };
    if (benchmarkId.includes("cli-static-site-gen")) {
      Object.assign(packageJson, {
        dependencies: {
          commander: "^12.0.0",
          "gray-matter": "^4.0.3",
          marked: "^12.0.0",
          handlebars: "^4.7.8",
          "highlight.js": "^11.9.0",
          express: "^4.18.2",
          chokidar: "^3.6.0"
        }
      });
    } else if (benchmarkId.includes("rest-api")) {
      Object.assign(packageJson, {
        dependencies: {
          express: "^4.18.2",
          "better-sqlite3": "^9.4.0",
          bcryptjs: "^2.4.3",
          jsonwebtoken: "^9.0.2",
          uuid: "^9.0.0",
          zod: "^3.22.0"
        }
      });
    } else if (benchmarkId.includes("react") || benchmarkId.includes("dashboard")) {
      Object.assign(packageJson, {
        dependencies: {
          "better-sqlite3": "^9.4.0",
          express: "^4.18.2",
          cors: "^2.8.5",
          "csv-parse": "^5.5.3",
          react: "^18.2.0",
          "react-dom": "^18.2.0",
          recharts: "^2.12.0"
        },
        devDependencies: {
          vite: "^5.1.0",
          "@vitejs/plugin-react": "^4.2.0"
        }
      });
    }
    await writeFile4(
      join4(workspacePath, "package.json"),
      JSON.stringify(packageJson, null, 2)
    );
  }
  /**
   * Cleanup a workspace.
   */
  async cleanupWorkspace(workspaceId, options = {}) {
    const info = this.activeWorkspaces.get(workspaceId);
    if (!info) return;
    await this.processManager.killWorkspace(workspaceId);
    if (options.archive && options.archivePath) {
      await this.archiveWorkspace(info.rootDir, options.archivePath);
    }
    try {
      await rm(info.rootDir, { recursive: true, force: true });
    } catch {
    }
    this.activeWorkspaces.delete(workspaceId);
  }
  /**
   * Archive a workspace to a tar.gz file.
   */
  async archiveWorkspace(workspacePath, archivePath) {
    await mkdir4(dirname4(archivePath), { recursive: true });
    try {
      await tar.create(
        {
          gzip: true,
          file: archivePath,
          cwd: dirname4(workspacePath)
        },
        [workspacePath.split("/").pop()]
      );
    } catch {
      await this.processManager.spawn("tar", [
        "-czf",
        archivePath,
        "-C",
        dirname4(workspacePath),
        workspacePath.split("/").pop()
      ]);
    }
  }
  /**
   * Cleanup all active workspaces.
   */
  async cleanupAll() {
    const count = this.activeWorkspaces.size;
    for (const [workspaceId] of this.activeWorkspaces) {
      await this.cleanupWorkspace(workspaceId);
    }
    return count;
  }
  /**
   * Get workspace info.
   */
  getWorkspace(workspaceId) {
    return this.activeWorkspaces.get(workspaceId);
  }
  /**
   * List active workspaces.
   */
  listWorkspaces() {
    return Array.from(this.activeWorkspaces.values());
  }
  /**
   * Get workspace ID from components.
   */
  static getWorkspaceId(runId, scenario, benchmarkId) {
    return `${runId}-${scenario}-${benchmarkId}`;
  }
};
function createWorkspaceManager(processManager) {
  return new WorkspaceManager(processManager);
}

// src/runner/acceptance.ts
import { join as join5 } from "path";
import { stat as stat2, readFile as readFile3 } from "fs/promises";
var DEFAULT_TIMEOUT_MS = 12e4;
var AcceptanceRunner = class {
  constructor(processManager, config = {}) {
    this.processManager = processManager;
    this.config = {
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      serverStartupDelayMs: config.serverStartupDelayMs ?? 2e3
    };
  }
  /**
   * Run acceptance tests in a workspace.
   */
  async run(workspacePath) {
    const startTime = Date.now();
    const testScript = await this.findTestScript(workspacePath);
    if (!testScript) {
      return this.createEmptyResult("No acceptance tests found");
    }
    const needsServer = await this.needsServer(workspacePath, testScript);
    let serverProcess = null;
    try {
      if (needsServer) {
        serverProcess = await this.startServer(workspacePath);
        await this.delay(this.config.serverStartupDelayMs);
      }
      const result = await this.runTestScript(workspacePath, testScript);
      const tests = this.parseTestOutput(result.stdout + "\n" + result.stderr);
      const passed = tests.filter((t) => t.status === "pass").length;
      const failed = tests.filter((t) => t.status === "fail").length;
      return {
        totalTests: tests.length,
        passed,
        failed,
        passRate: tests.length > 0 ? passed / tests.length : 0,
        details: tests,
        scriptOutput: result.stdout
      };
    } finally {
      if (serverProcess) {
        await serverProcess.kill();
      }
    }
  }
  /**
   * Find the acceptance test script.
   */
  async findTestScript(workspacePath) {
    const candidates = [
      "acceptance/run-tests.sh",
      "acceptance/acceptance.sh",
      "tests/acceptance.sh",
      "test.sh",
      "acceptance.sh"
    ];
    for (const candidate of candidates) {
      const fullPath = join5(workspacePath, candidate);
      try {
        const s = await stat2(fullPath);
        if (s.isFile()) return fullPath;
      } catch {
      }
    }
    return null;
  }
  /**
   * Check if the workspace needs a server running for tests.
   */
  async needsServer(workspacePath, testScript) {
    try {
      const content = await readFile3(testScript, "utf-8");
      return content.includes("localhost:") || content.includes("curl ") || content.includes("http://") || content.includes("BASE_URL");
    } catch {
      return false;
    }
  }
  /**
   * Start a development server.
   */
  async startServer(workspacePath) {
    const serverCommands = [
      { cmd: "node", args: ["src/api/server.js"] },
      { cmd: "node", args: ["src/app.js"] },
      { cmd: "npm", args: ["run", "start"] },
      { cmd: "npm", args: ["run", "serve"] }
    ];
    for (const { cmd, args } of serverCommands) {
      try {
        if (cmd === "node") {
          await stat2(join5(workspacePath, args[0]));
        }
        const process2 = this.processManager.spawnStreaming(cmd, args, {
          cwd: workspacePath,
          workspaceId: workspacePath,
          timeoutMs: this.config.timeoutMs
        });
        return process2;
      } catch {
      }
    }
    throw new Error("Could not find server start command");
  }
  /**
   * Run the test script.
   */
  async runTestScript(workspacePath, testScript) {
    await this.processManager.spawn("chmod", ["+x", testScript]);
    return this.processManager.spawn("bash", [testScript], {
      cwd: workspacePath,
      workspaceId: workspacePath,
      timeoutMs: this.config.timeoutMs
    });
  }
  /**
   * Parse test output to extract individual test results.
   */
  parseTestOutput(output) {
    const tests = [];
    const lines = output.split("\n");
    for (const line of lines) {
      const passMatch = line.match(/^\s*(PASS|✓|✔|passed?):\s*(.+)/i);
      const failMatch = line.match(/^\s*(FAIL|✗|✘|failed?):\s*(.+)/i);
      if (passMatch) {
        tests.push({
          name: passMatch[2].trim(),
          status: "pass"
        });
      } else if (failMatch) {
        tests.push({
          name: failMatch[2].trim(),
          status: "fail",
          output: this.findErrorContext(lines, lines.indexOf(line))
        });
      }
    }
    if (tests.length === 0) {
      const summaryMatch = output.match(
        /Results?:\s*(\d+)\s*passed?,\s*(\d+)\s*failed?/i
      );
      if (summaryMatch) {
        const passed = parseInt(summaryMatch[1], 10);
        const failed = parseInt(summaryMatch[2], 10);
        for (let i = 0; i < passed; i++) {
          tests.push({ name: `Test ${i + 1}`, status: "pass" });
        }
        for (let i = 0; i < failed; i++) {
          tests.push({ name: `Test ${passed + i + 1}`, status: "fail" });
        }
      }
    }
    return tests;
  }
  /**
   * Find error context for a failed test.
   */
  findErrorContext(lines, failIndex) {
    const contextLines = [];
    for (let i = failIndex + 1; i < Math.min(failIndex + 5, lines.length); i++) {
      const line = lines[i].trim();
      if (!line) continue;
      if (line.match(/^(PASS|FAIL|✓|✗)/i)) break;
      contextLines.push(line);
    }
    return contextLines.length > 0 ? contextLines.join("\n") : void 0;
  }
  /**
   * Create an empty result for when no tests are found.
   */
  createEmptyResult(reason) {
    return {
      totalTests: 0,
      passed: 0,
      failed: 0,
      passRate: 0,
      details: [],
      scriptOutput: reason
    };
  }
  /**
   * Delay helper.
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
};
function createAcceptanceRunner(processManager, config) {
  return new AcceptanceRunner(processManager, config);
}

// src/runner/baseline-executor.ts
import { readFile as readFile4 } from "fs/promises";
import { join as join6 } from "path";
import { createId } from "@paralleldrive/cuid2";
var DEFAULT_TIMEOUT_MS2 = 6e5;
var DEFAULT_MODEL = "sonnet";
var BaselineExecutor = class {
  constructor(processManager, acceptanceRunner, config = {}) {
    this.processManager = processManager;
    this.acceptanceRunner = acceptanceRunner;
    this.config = {
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS2,
      model: config.model ?? DEFAULT_MODEL,
      claudeCliPath: config.claudeCliPath ?? "claude",
      retryOnFailure: config.retryOnFailure ?? true,
      verbose: config.verbose ?? false
    };
  }
  /**
   * Execute baseline scenario.
   */
  async execute(workspace, collector) {
    const startTime = Date.now();
    const startedAt = new Date(startTime).toISOString();
    const sessionId = createId();
    const sessions = [];
    const errors = [];
    try {
      const prdPath = join6(workspace.rootDir, "PRD.md");
      const prdContent = await readFile4(prdPath, "utf-8");
      const prompt = this.buildPrompt(prdContent);
      collector.getTimeline().recordEvent("session_start", { sessionId });
      const result = await this.executeClaudeCode(workspace, prompt, sessionId);
      collector.getTimeline().recordEvent("session_complete", { sessionId });
      const usage = this.parseTokenUsage(result.stdout);
      const session = this.buildSession(
        sessionId,
        prompt,
        startedAt,
        usage,
        result
      );
      collector.registerSession(session);
      sessions.push(session);
      const acceptanceResults = await this.acceptanceRunner.run(
        workspace.rootDir
      );
      if (acceptanceResults.passRate < 1 && this.config.retryOnFailure) {
        const retryResult = await this.retryExecution(
          workspace,
          acceptanceResults,
          collector,
          sessions,
          startedAt
        );
        if (retryResult) {
          return retryResult;
        }
      }
      const metrics = collector.aggregateScenarioMetrics(
        sessions,
        acceptanceResults.passRate
      );
      return this.buildResult(
        "completed",
        startedAt,
        startTime,
        sessions,
        metrics,
        acceptanceResults,
        collector,
        errors,
        acceptanceResults.passRate,
        1
        // Single session, no rework
      );
    } catch (error) {
      errors.push({
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        phase: "execution",
        code: "EXECUTION_ERROR",
        message: error instanceof Error ? error.message : String(error),
        recoverable: false
      });
      return this.buildFailedResult(startedAt, startTime, sessions, collector, errors);
    }
  }
  /**
   * Build a canonical session record from execution output.
   */
  buildSession(sessionId, prompt, startedAt, usage, result) {
    return {
      sessionId,
      scenario: "baseline",
      model: this.config.model,
      prompt,
      startedAt,
      completedAt: (/* @__PURE__ */ new Date()).toISOString(),
      durationMs: Date.now() - new Date(startedAt).getTime(),
      tokensInput: usage?.inputTokens ?? 0,
      tokensOutput: usage?.outputTokens ?? 0,
      cacheReadTokens: usage?.cacheReadTokens ?? 0,
      cacheWriteTokens: usage?.cacheWriteTokens ?? 0,
      costUsd: 0,
      filesCreated: [],
      filesModified: [],
      success: (result.exitCode ?? 0) === 0,
      stdout: result.stdout
    };
  }
  /**
   * Assemble a completed scenario result from aggregated metrics.
   */
  buildResult(status, startedAt, startTime, sessions, metrics, acceptanceResults, collector, errors, firstAttemptPassRate, reworkRatio) {
    return {
      scenario: "baseline",
      status,
      startedAt,
      completedAt: (/* @__PURE__ */ new Date()).toISOString(),
      wallClockMs: Date.now() - startTime,
      totalTokensInput: metrics.tokens.inputTokens,
      totalTokensOutput: metrics.tokens.outputTokens,
      totalTokens: metrics.tokens.totalTokens,
      cacheReadTokens: metrics.tokens.cacheReadTokens,
      cacheWriteTokens: metrics.tokens.cacheWriteTokens,
      totalCostUsd: metrics.totalCostUsd,
      costBreakdown: metrics.costBreakdown,
      acceptanceResults,
      firstAttemptPassRate,
      reworkRatio,
      sessions,
      timeline: collector.exportTimeline(),
      errors,
      filesCreated: metrics.filesCreated,
      filesModified: metrics.filesModified
    };
  }
  /**
   * Assemble a failed scenario result with zeroed metrics.
   */
  buildFailedResult(startedAt, startTime, sessions, collector, errors) {
    return {
      scenario: "baseline",
      status: "failed",
      startedAt,
      completedAt: (/* @__PURE__ */ new Date()).toISOString(),
      wallClockMs: Date.now() - startTime,
      totalTokensInput: 0,
      totalTokensOutput: 0,
      totalTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalCostUsd: 0,
      costBreakdown: [],
      acceptanceResults: {
        totalTests: 0,
        passed: 0,
        failed: 0,
        passRate: 0,
        details: [],
        scriptOutput: ""
      },
      firstAttemptPassRate: 0,
      reworkRatio: 1,
      sessions,
      timeline: collector.exportTimeline(),
      errors,
      filesCreated: [],
      filesModified: []
    };
  }
  /**
   * Build the prompt for Claude Code.
   */
  buildPrompt(prdContent) {
    return `Read the following PRD and implement the entire project as specified.
Create all necessary files and ensure the project passes all acceptance criteria.

# PRD

${prdContent}

# Instructions

1. Read the PRD carefully and understand all requirements
2. Create the project structure as specified
3. Implement all components in the correct dependency order
4. Ensure all acceptance criteria are met
5. Run any tests if specified

Start implementation now.`;
  }
  /**
   * Execute Claude Code CLI.
   */
  async executeClaudeCode(workspace, prompt, sessionId) {
    const args = [
      "--dangerously-skip-permissions",
      "--print",
      "--output-format",
      "json",
      "--model",
      this.config.model,
      prompt
    ];
    return this.processManager.spawn(this.config.claudeCliPath, args, {
      cwd: workspace.rootDir,
      workspaceId: sessionId,
      timeoutMs: this.config.timeoutMs,
      env: {
        ...process.env,
        // Disable interactive features
        CI: "true",
        NONINTERACTIVE: "1"
      }
    });
  }
  /**
   * Parse token usage from Claude Code output.
   */
  parseTokenUsage(output) {
    try {
      const lines = output.split("\n");
      for (const line of lines) {
        if (line.trim().startsWith("{")) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.usage) {
              return {
                inputTokens: parsed.usage.input_tokens,
                outputTokens: parsed.usage.output_tokens,
                totalTokens: parsed.usage.input_tokens + parsed.usage.output_tokens,
                cacheReadTokens: parsed.usage.cache_read_input_tokens ?? 0,
                cacheWriteTokens: parsed.usage.cache_creation_input_tokens ?? 0
              };
            }
          } catch {
          }
        }
      }
      const textMatch = output.match(
        /Total tokens:\s*(\d+)\s*\((\d+)\s*input,\s*(\d+)\s*output\)/i
      );
      if (textMatch) {
        return {
          inputTokens: parseInt(textMatch[2], 10),
          outputTokens: parseInt(textMatch[3], 10),
          totalTokens: parseInt(textMatch[1], 10),
          cacheReadTokens: 0,
          cacheWriteTokens: 0
        };
      }
    } catch {
    }
    return null;
  }
  /**
   * Retry execution after test failures.
   */
  async retryExecution(workspace, firstAttemptResults, collector, sessions, scenarioStartedAt) {
    const retrySessionId = createId();
    const retryStartTime = Date.now();
    const retryStartedAt = new Date(retryStartTime).toISOString();
    const failedTests = firstAttemptResults.details.filter((t) => t.status !== "pass").map((t) => `- ${t.name}${t.output ? `: ${t.output}` : ""}`).join("\n");
    const retryPrompt = `The following acceptance tests failed:

${failedTests}

Please fix the issues and ensure all tests pass. Review the error messages and make the necessary corrections.`;
    try {
      collector.getTimeline().recordEvent("session_start", {
        sessionId: retrySessionId
      });
      const result = await this.executeClaudeCode(workspace, retryPrompt, retrySessionId);
      collector.getTimeline().recordEvent("session_complete", {
        sessionId: retrySessionId
      });
      const usage = this.parseTokenUsage(result.stdout);
      const session = this.buildSession(
        retrySessionId,
        retryPrompt,
        retryStartedAt,
        usage,
        result
      );
      collector.registerSession(session);
      sessions.push(session);
      const retryAcceptanceResults = await this.acceptanceRunner.run(
        workspace.rootDir
      );
      const metrics = collector.aggregateScenarioMetrics(
        sessions,
        firstAttemptResults.passRate
      );
      return this.buildResult(
        "completed",
        scenarioStartedAt,
        new Date(scenarioStartedAt).getTime(),
        sessions,
        metrics,
        retryAcceptanceResults,
        collector,
        [],
        firstAttemptResults.passRate,
        sessions.length
        // Number of attempts
      );
    } catch (error) {
      return null;
    }
  }
};
function createBaselineExecutor(processManager, acceptanceRunner, config) {
  return new BaselineExecutor(processManager, acceptanceRunner, config);
}

// src/runner/devpilot-executor.ts
import { readFile as readFile5 } from "fs/promises";
import { join as join7 } from "path";
import { createId as createId2 } from "@paralleldrive/cuid2";
var DEFAULT_TIMEOUT_MS3 = 6e5;
var DEFAULT_MODEL2 = "sonnet";
var PLANNER_MODEL = "sonnet";
var DevPilotExecutor = class {
  constructor(processManager, acceptanceRunner, config = {}) {
    this.processManager = processManager;
    this.acceptanceRunner = acceptanceRunner;
    this.config = {
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS3,
      model: config.model ?? DEFAULT_MODEL2,
      plannerModel: config.plannerModel ?? PLANNER_MODEL,
      claudeCliPath: config.claudeCliPath ?? "claude",
      maxConcurrency: config.maxConcurrency ?? 4,
      retryOnFailure: config.retryOnFailure ?? true,
      verbose: config.verbose ?? false
    };
  }
  /**
   * Execute DevPilot scenario.
   */
  async execute(workspace, collector) {
    const startTime = Date.now();
    const startedAt = new Date(startTime).toISOString();
    const sessions = [];
    const waveExecutions = [];
    const errors = [];
    try {
      const prdPath = join7(workspace.rootDir, "PRD.md");
      const prdContent = await readFile5(prdPath, "utf-8");
      collector.getTimeline().recordEvent("run_start", {});
      const wavePlan = await this.generateWavePlan(workspace, prdContent, collector);
      let firstAttemptPassRate = 0;
      for (const wave of wavePlan.waves) {
        collector.getTimeline().recordEvent("wave_start", {
          waveNumber: wave.waveNumber
        });
        const waveExecution = await this.executeWave(
          workspace,
          wave,
          prdContent,
          collector,
          sessions
        );
        waveExecutions.push(waveExecution);
        collector.getTimeline().recordEvent("wave_complete", {
          waveNumber: wave.waveNumber
        });
      }
      let acceptanceResults = await this.acceptanceRunner.run(workspace.rootDir);
      firstAttemptPassRate = acceptanceResults.passRate;
      if (acceptanceResults.passRate < 1 && this.config.retryOnFailure) {
        const remediationResult = await this.executeRemediationWave(
          workspace,
          acceptanceResults,
          prdContent,
          collector,
          sessions
        );
        if (remediationResult) {
          waveExecutions.push(remediationResult.waveExecution);
          acceptanceResults = remediationResult.acceptanceResults;
        }
      }
      const metrics = collector.aggregateScenarioMetrics(
        sessions,
        firstAttemptPassRate
      );
      return this.buildResult(
        "completed",
        startedAt,
        startTime,
        sessions,
        metrics,
        acceptanceResults,
        collector,
        errors,
        firstAttemptPassRate,
        this.calculateReworkRatio(sessions, workspace),
        wavePlan,
        waveExecutions
      );
    } catch (error) {
      errors.push({
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        phase: "execution",
        code: "EXECUTION_ERROR",
        message: error instanceof Error ? error.message : String(error),
        recoverable: false
      });
      return this.buildFailedResult(
        startedAt,
        startTime,
        sessions,
        collector,
        errors,
        waveExecutions
      );
    }
  }
  /**
   * Assemble a completed scenario result from aggregated metrics.
   */
  buildResult(status, startedAt, startTime, sessions, metrics, acceptanceResults, collector, errors, firstAttemptPassRate, reworkRatio, wavePlan, waveExecutionLog) {
    return {
      scenario: "devpilot",
      status,
      startedAt,
      completedAt: (/* @__PURE__ */ new Date()).toISOString(),
      wallClockMs: Date.now() - startTime,
      totalTokensInput: metrics.tokens.inputTokens,
      totalTokensOutput: metrics.tokens.outputTokens,
      totalTokens: metrics.tokens.totalTokens,
      cacheReadTokens: metrics.tokens.cacheReadTokens,
      cacheWriteTokens: metrics.tokens.cacheWriteTokens,
      totalCostUsd: metrics.totalCostUsd,
      costBreakdown: metrics.costBreakdown,
      acceptanceResults,
      firstAttemptPassRate,
      wavePlan,
      waveExecutionLog,
      reworkRatio,
      sessions,
      timeline: collector.exportTimeline(),
      errors,
      filesCreated: metrics.filesCreated,
      filesModified: metrics.filesModified
    };
  }
  /**
   * Assemble a failed scenario result with zeroed metrics.
   */
  buildFailedResult(startedAt, startTime, sessions, collector, errors, waveExecutionLog) {
    return {
      scenario: "devpilot",
      status: "failed",
      startedAt,
      completedAt: (/* @__PURE__ */ new Date()).toISOString(),
      wallClockMs: Date.now() - startTime,
      totalTokensInput: 0,
      totalTokensOutput: 0,
      totalTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalCostUsd: 0,
      costBreakdown: [],
      acceptanceResults: {
        totalTests: 0,
        passed: 0,
        failed: 0,
        passRate: 0,
        details: [],
        scriptOutput: ""
      },
      firstAttemptPassRate: 0,
      waveExecutionLog,
      reworkRatio: 1,
      sessions,
      timeline: collector.exportTimeline(),
      errors,
      filesCreated: [],
      filesModified: []
    };
  }
  /**
   * Build a canonical session record from execution output.
   */
  buildSession(sessionId, prompt, startedAt, usage, result, options = {}) {
    return {
      sessionId,
      scenario: "devpilot",
      waveNumber: options.waveNumber,
      taskId: options.taskId,
      model: this.config.model,
      prompt,
      startedAt,
      completedAt: (/* @__PURE__ */ new Date()).toISOString(),
      durationMs: Date.now() - new Date(startedAt).getTime(),
      tokensInput: usage?.inputTokens ?? 0,
      tokensOutput: usage?.outputTokens ?? 0,
      cacheReadTokens: usage?.cacheReadTokens ?? 0,
      cacheWriteTokens: usage?.cacheWriteTokens ?? 0,
      costUsd: 0,
      filesCreated: [],
      filesModified: [],
      success: (result.exitCode ?? 0) === 0,
      stdout: result.stdout
    };
  }
  /**
   * Generate wave plan from PRD.
   */
  async generateWavePlan(workspace, prdContent, collector) {
    const plannerSessionId = createId2();
    const plannerStartedAt = (/* @__PURE__ */ new Date()).toISOString();
    const planPrompt = `Analyze the following PRD and create a wave plan for parallel execution.

# PRD

${prdContent}

# Instructions

Output a JSON wave plan with this structure:
{
  "waves": [
    {
      "waveNumber": 1,
      "tasks": [
        {
          "id": "task-id",
          "description": "what to implement",
          "files": ["src/file.js"],
          "dependencies": []
        }
      ]
    }
  ],
  "totalTasks": <number>,
  "estimatedParallelism": <number>
}

Rules:
1. Group independent tasks into the same wave
2. Tasks in wave N+1 can only depend on tasks from waves <= N
3. Each task should have a clear, specific description
4. Include all files that will be created/modified

Output ONLY valid JSON, no other text.`;
    collector.getTimeline().recordEvent("session_start", {
      sessionId: plannerSessionId
    });
    const result = await this.executeClaudeCode(workspace, planPrompt, plannerSessionId);
    collector.getTimeline().recordEvent("session_complete", {
      sessionId: plannerSessionId
    });
    const wavePlan = this.parseWavePlan(result.stdout);
    const usage = this.parseTokenUsage(result.stdout);
    const plannerSession = {
      ...this.buildSession(
        plannerSessionId,
        planPrompt,
        plannerStartedAt,
        usage,
        result,
        { taskId: "planner" }
      ),
      model: this.config.plannerModel
    };
    collector.registerSession(plannerSession);
    return wavePlan;
  }
  /**
   * Parse wave plan from Claude output.
   */
  parseWavePlan(output) {
    const jsonMatch = output.match(/\{[\s\S]*"waves"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          waves: parsed.waves.map((w, idx) => ({
            waveNumber: w.waveNumber ?? idx + 1,
            tasks: w.tasks.map((t) => this.toPlannedTask(t)),
            dependsOn: w.dependsOn ?? [],
            estimatedDurationMs: 0
          })),
          criticalPathMs: 0,
          maxParallelism: parsed.estimatedParallelism ?? 1,
          totalTasks: parsed.totalTasks ?? 0
        };
      } catch {
      }
    }
    return {
      waves: [
        {
          waveNumber: 1,
          tasks: [
            this.toPlannedTask({
              id: "full-implementation",
              description: "Implement entire project",
              files: [],
              dependencies: []
            })
          ],
          dependsOn: [],
          estimatedDurationMs: 0
        }
      ],
      criticalPathMs: 0,
      maxParallelism: 1,
      totalTasks: 1
    };
  }
  /**
   * Convert a raw parsed task object into a canonical PlannedTask.
   */
  toPlannedTask(raw) {
    const description = raw.description ?? raw.id;
    return {
      id: raw.id,
      name: description,
      files: raw.files ?? [],
      prompt: description,
      // Executor is configured with a single model tier for task sessions.
      model: this.config.model,
      dependsOn: raw.dependencies ?? [],
      estimatedDurationMs: 0
    };
  }
  /**
   * Execute a single wave.
   */
  async executeWave(workspace, wave, prdContent, collector, sessions) {
    const waveStartTime = Date.now();
    const waveStartedAt = new Date(waveStartTime).toISOString();
    const taskPromises = [];
    const concurrencyLimit = Math.min(this.config.maxConcurrency, wave.tasks.length) || 1;
    const taskQueue = [...wave.tasks];
    const activeTasks = [];
    while (taskQueue.length > 0 || activeTasks.length > 0) {
      while (activeTasks.length < concurrencyLimit && taskQueue.length > 0) {
        const task = taskQueue.shift();
        const taskPromise = this.executeTask(
          workspace,
          task,
          prdContent,
          collector,
          wave.waveNumber
        ).then((session) => {
          sessions.push(session);
          return { task, session };
        });
        taskPromises.push(taskPromise);
        activeTasks.push(taskPromise);
      }
      if (activeTasks.length > 0) {
        await Promise.race(activeTasks);
        for (let i = activeTasks.length - 1; i >= 0; i--) {
          const status = await Promise.race([
            activeTasks[i].then(() => "resolved"),
            Promise.resolve("pending")
          ]);
          if (status === "resolved") {
            activeTasks.splice(i, 1);
          }
        }
      }
    }
    const results = await Promise.all(taskPromises);
    const completedTasks = results.filter((r) => r.session.success).length;
    return {
      waveNumber: wave.waveNumber,
      plannedTasks: wave.tasks.length,
      completedTasks,
      failedTasks: results.length - completedTasks,
      startedAt: waveStartedAt,
      completedAt: (/* @__PURE__ */ new Date()).toISOString(),
      wallClockMs: Date.now() - waveStartTime,
      sessions: results.map((r) => r.session),
      parallelismActual: concurrencyLimit,
      idleTimeMs: 0
    };
  }
  /**
   * Execute a single task.
   */
  async executeTask(workspace, task, prdContent, collector, waveNumber) {
    const sessionId = createId2();
    const startedAt = (/* @__PURE__ */ new Date()).toISOString();
    const taskPrompt = `You are implementing part of a larger project. Focus ONLY on this specific task:

# Task
${task.name}

# Files to create/modify
${task.files.join("\n") || "Determine based on task"}

# Full PRD (for context only - do NOT implement everything)
${prdContent}

# Instructions
1. Focus ONLY on the task described above
2. Create/modify only the files needed for this task
3. Ensure your implementation integrates with other parts of the project
4. Do not duplicate functionality that other tasks will handle

Implement this task now.`;
    collector.getTimeline().recordEvent("session_start", {
      sessionId,
      taskId: task.id
    });
    const result = await this.executeClaudeCode(workspace, taskPrompt, sessionId);
    collector.getTimeline().recordEvent("session_complete", {
      sessionId,
      taskId: task.id
    });
    const usage = this.parseTokenUsage(result.stdout);
    const session = this.buildSession(sessionId, taskPrompt, startedAt, usage, result, {
      taskId: task.id,
      waveNumber
    });
    collector.registerSession(session);
    return session;
  }
  /**
   * Execute remediation wave for failed tests.
   */
  async executeRemediationWave(workspace, acceptanceResults, prdContent, collector, sessions) {
    const remediationSessionId = createId2();
    const startTime = Date.now();
    const startedAt = new Date(startTime).toISOString();
    const failedTests = acceptanceResults.details.filter((t) => t.status !== "pass").map((t) => `- ${t.name}${t.output ? `: ${t.output}` : ""}`).join("\n");
    const remediationPrompt = `Some acceptance tests failed. Fix the issues:

# Failed Tests
${failedTests}

# PRD (for reference)
${prdContent}

# Instructions
1. Analyze the failures and identify root causes
2. Fix the issues in the relevant files
3. Ensure all tests will pass after your fixes

Fix the issues now.`;
    try {
      collector.getTimeline().recordEvent("session_start", {
        sessionId: remediationSessionId
      });
      const result = await this.executeClaudeCode(
        workspace,
        remediationPrompt,
        remediationSessionId
      );
      collector.getTimeline().recordEvent("session_complete", {
        sessionId: remediationSessionId
      });
      const usage = this.parseTokenUsage(result.stdout);
      const session = this.buildSession(
        remediationSessionId,
        remediationPrompt,
        startedAt,
        usage,
        result,
        { taskId: "remediation" }
      );
      collector.registerSession(session);
      sessions.push(session);
      const newAcceptanceResults = await this.acceptanceRunner.run(workspace.rootDir);
      return {
        waveExecution: {
          waveNumber: -1,
          // Remediation wave
          plannedTasks: 1,
          completedTasks: session.success ? 1 : 0,
          failedTasks: session.success ? 0 : 1,
          startedAt,
          completedAt: (/* @__PURE__ */ new Date()).toISOString(),
          wallClockMs: Date.now() - startTime,
          sessions: [session],
          parallelismActual: 1,
          idleTimeMs: 0
        },
        acceptanceResults: newAcceptanceResults
      };
    } catch {
      return null;
    }
  }
  /**
   * Execute Claude Code CLI.
   */
  async executeClaudeCode(workspace, prompt, sessionId) {
    const args = [
      "--dangerously-skip-permissions",
      "--print",
      "--output-format",
      "json",
      "--model",
      this.config.model,
      prompt
    ];
    return this.processManager.spawn(this.config.claudeCliPath, args, {
      cwd: workspace.rootDir,
      workspaceId: sessionId,
      timeoutMs: this.config.timeoutMs,
      env: {
        ...process.env,
        CI: "true",
        NONINTERACTIVE: "1"
      }
    });
  }
  /**
   * Parse token usage from output.
   */
  parseTokenUsage(output) {
    try {
      const lines = output.split("\n");
      for (const line of lines) {
        if (line.trim().startsWith("{")) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.usage) {
              return {
                inputTokens: parsed.usage.input_tokens,
                outputTokens: parsed.usage.output_tokens,
                totalTokens: parsed.usage.input_tokens + parsed.usage.output_tokens,
                cacheReadTokens: parsed.usage.cache_read_input_tokens ?? 0,
                cacheWriteTokens: parsed.usage.cache_creation_input_tokens ?? 0
              };
            }
          } catch {
          }
        }
      }
    } catch {
    }
    return null;
  }
  /**
   * Calculate rework ratio.
   */
  calculateReworkRatio(sessions, workspace) {
    const fileEditCounts = /* @__PURE__ */ new Map();
    for (const session of sessions) {
      const fileMatches = (session.stdout ?? "").match(
        /(?:create|edit|write)\s+['"]([\w\/\-\.]+)['"]/gi
      );
      if (fileMatches) {
        for (const match of fileMatches) {
          const file = match.replace(/^(create|edit|write)\s+['"]/i, "").replace(/['"]$/, "");
          fileEditCounts.set(file, (fileEditCounts.get(file) ?? 0) + 1);
        }
      }
    }
    if (fileEditCounts.size === 0) return 1;
    const totalEdits = Array.from(fileEditCounts.values()).reduce((a, b) => a + b, 0);
    return totalEdits / fileEditCounts.size;
  }
};
function createDevPilotExecutor(processManager, acceptanceRunner, config) {
  return new DevPilotExecutor(processManager, acceptanceRunner, config);
}

// src/runner/index.ts
var BenchmarkRunner = class {
  constructor(config) {
    this.config = {
      benchmarksDir: config.benchmarksDir,
      resultsDir: config.resultsDir,
      projectRoot: config.projectRoot ?? process.cwd(),
      parallel: config.parallel ?? false,
      timeoutMs: config.timeoutMs ?? 6e5,
      maxConcurrency: config.maxConcurrency ?? 4,
      claudeCliPath: config.claudeCliPath ?? "claude",
      archiveWorkspaces: config.archiveWorkspaces ?? false,
      verbose: config.verbose ?? false
    };
    this.processManager = createProcessManager(this.config.timeoutMs);
    this.workspaceManager = createWorkspaceManager(this.processManager);
    this.acceptanceRunner = createAcceptanceRunner(this.processManager);
    this.baselineExecutor = createBaselineExecutor(
      this.processManager,
      this.acceptanceRunner,
      {
        timeoutMs: this.config.timeoutMs,
        claudeCliPath: this.config.claudeCliPath,
        verbose: this.config.verbose
      }
    );
    this.devpilotExecutor = createDevPilotExecutor(
      this.processManager,
      this.acceptanceRunner,
      {
        timeoutMs: this.config.timeoutMs,
        maxConcurrency: this.config.maxConcurrency,
        claudeCliPath: this.config.claudeCliPath,
        verbose: this.config.verbose
      }
    );
    this.resultsWriter = createResultsWriter({
      resultsDir: this.config.resultsDir,
      projectRoot: this.config.projectRoot
    });
    this.scoringEngine = createScoringEngine();
    this.waveAnalyzer = createWaveAnalyzer();
    this.comparator = createComparator();
  }
  /**
   * Run benchmarks.
   */
  async run(runConfig) {
    const runId = createId3();
    const startTime = /* @__PURE__ */ new Date();
    const results = [];
    const version = await getVersionInfo(this.config.projectRoot);
    if (this.config.verbose) {
      console.log(`Starting benchmark run ${runId}`);
      console.log(`Version: ${version.version}`);
      console.log(`Benchmarks: ${runConfig.benchmarks.join(", ")}`);
      console.log(`Scenarios: ${runConfig.scenarios.join(", ")}`);
    }
    try {
      const groundTruths = await this.loadGroundTruths(runConfig.benchmarks);
      if (this.config.parallel) {
        const benchmarkPromises = runConfig.benchmarks.map(
          (benchmarkId) => this.runBenchmark(runId, benchmarkId, runConfig, groundTruths.get(benchmarkId))
        );
        const benchmarkResults = await Promise.all(benchmarkPromises);
        results.push(...benchmarkResults);
      } else {
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
      const endTime = /* @__PURE__ */ new Date();
      const benchmarks = results.map((r) => ({
        id: createId3(),
        benchmarkId: r.benchmarkId,
        devpilotVersion: version.version,
        gitCommit: version.gitCommit,
        gitTag: version.gitTag,
        timestamp: startTime.toISOString(),
        config: runConfig,
        scenarios: {
          baseline: r.baseline ?? null,
          devpilot: r.devpilot ?? null
        },
        comparison: r.comparison ?? null,
        compositeScore: r.devpilotScore ?? r.baselineScore ?? null,
        waveAnalysis: r.waveAnalysis ?? null
      }));
      const manifest = {
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
        pricingSnapshot: createMetricsCollector().getPricingSnapshot()
      };
      const runDir = await this.resultsWriter.writeRunManifest(manifest);
      for (const benchmarkRun of benchmarks) {
        await this.resultsWriter.writeBenchmarkResult(runDir, benchmarkRun);
        if (benchmarkRun.waveAnalysis) {
          await this.resultsWriter.writeWaveAnalysis(
            join8(runDir, benchmarkRun.benchmarkId),
            benchmarkRun.waveAnalysis
          );
        }
      }
      return manifest;
    } finally {
      await this.workspaceManager.cleanupAll();
      await this.processManager.killAll();
    }
  }
  /**
   * Run a single benchmark.
   */
  async runBenchmark(runId, benchmarkId, runConfig, groundTruth) {
    const result = {
      benchmarkId,
      groundTruth
    };
    if (runConfig.scenarios.includes("baseline")) {
      const baselineWorkspace = await this.workspaceManager.createWorkspace({
        runId,
        benchmarkId,
        scenario: "baseline",
        benchmarksDir: this.config.benchmarksDir,
        archiveOnCleanup: this.config.archiveWorkspaces
      });
      const baselineCollector = createMetricsCollector();
      result.baseline = await this.baselineExecutor.execute(baselineWorkspace, baselineCollector);
      result.baselineScore = this.scoringEngine.calculateScore(result.baseline);
      const workspaceId = WorkspaceManager.getWorkspaceId(runId, "baseline", benchmarkId);
      await this.workspaceManager.cleanupWorkspace(workspaceId, {
        archive: this.config.archiveWorkspaces,
        archivePath: join8(
          this.config.resultsDir,
          "archives",
          `${runId}-${benchmarkId}-baseline.tar.gz`
        )
      });
    }
    if (runConfig.scenarios.includes("devpilot")) {
      const devpilotWorkspace = await this.workspaceManager.createWorkspace({
        runId,
        benchmarkId,
        scenario: "devpilot",
        benchmarksDir: this.config.benchmarksDir,
        archiveOnCleanup: this.config.archiveWorkspaces
      });
      const devpilotCollector = createMetricsCollector();
      result.devpilot = await this.devpilotExecutor.execute(devpilotWorkspace, devpilotCollector);
      if (groundTruth && result.devpilot.wavePlan) {
        result.waveAnalysis = this.waveAnalyzer.analyze(result.devpilot.wavePlan, groundTruth);
      }
      result.devpilotScore = this.scoringEngine.calculateScore(
        result.devpilot,
        result.waveAnalysis
      );
      const workspaceId = WorkspaceManager.getWorkspaceId(runId, "devpilot", benchmarkId);
      await this.workspaceManager.cleanupWorkspace(workspaceId, {
        archive: this.config.archiveWorkspaces,
        archivePath: join8(
          this.config.resultsDir,
          "archives",
          `${runId}-${benchmarkId}-devpilot.tar.gz`
        )
      });
    }
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
  async loadGroundTruths(benchmarkIds) {
    const groundTruths = /* @__PURE__ */ new Map();
    const groundTruthDir = join8(this.config.benchmarksDir, "ground-truth");
    for (const benchmarkId of benchmarkIds) {
      try {
        const exactPath = join8(groundTruthDir, `${benchmarkId}.json`);
        const content = await readFile6(exactPath, "utf-8");
        groundTruths.set(benchmarkId, JSON.parse(content));
      } catch {
        try {
          const prefix = benchmarkId.split("-")[0];
          const files = await import("fs/promises").then((fs3) => fs3.readdir(groundTruthDir));
          const matchingFile = files.find((f) => f.startsWith(`${prefix}-`) && f.endsWith(".json"));
          if (matchingFile) {
            const content = await readFile6(join8(groundTruthDir, matchingFile), "utf-8");
            groundTruths.set(benchmarkId, JSON.parse(content));
          }
        } catch {
        }
      }
    }
    return groundTruths;
  }
  /**
   * Create run summary.
   */
  createSummary(results) {
    const comparisons = results.filter((r) => r.comparison).map((r) => r.comparison);
    const passedBenchmarks = results.filter(
      (r) => (!r.baseline || r.baseline.acceptanceResults.passRate === 1) && (!r.devpilot || r.devpilot.acceptanceResults.passRate === 1)
    ).length;
    const scores = results.map((r) => r.devpilotScore ?? r.baselineScore).filter((s) => s !== void 0);
    const avgCompositeScore = scores.length > 0 ? scores.reduce((sum, s) => sum + s.total, 0) / scores.length : 0;
    if (comparisons.length === 0) {
      return {
        totalBenchmarks: results.length,
        passedBenchmarks,
        avgSpeedup: 1,
        avgCostReduction: 0,
        avgQualityDelta: 0,
        avgCompositeScore
      };
    }
    return {
      totalBenchmarks: results.length,
      passedBenchmarks,
      avgSpeedup: comparisons.reduce((sum, c) => sum + c.speedup, 0) / comparisons.length,
      avgCostReduction: comparisons.reduce((sum, c) => sum + c.costReduction, 0) / comparisons.length,
      avgQualityDelta: comparisons.reduce((sum, c) => sum + c.qualityDelta, 0) / comparisons.length,
      avgCompositeScore
    };
  }
  /**
   * Determine overall run status.
   */
  determineStatus(results) {
    const hasErrors = results.some(
      (r) => (r.baseline?.errors?.length ?? 0) > 0 || (r.devpilot?.errors?.length ?? 0) > 0
    );
    if (hasErrors) return "failed";
    const allPassed = results.every(
      (r) => (!r.baseline || r.baseline.acceptanceResults.passRate === 1) && (!r.devpilot || r.devpilot.acceptanceResults.passRate === 1)
    );
    if (allPassed) return "completed";
    return "partial";
  }
};
function createBenchmarkRunner(config) {
  return new BenchmarkRunner(config);
}
export {
  AcceptanceRunner,
  BaselineExecutor,
  BenchmarkConfigSchema,
  BenchmarkIdSchema,
  BenchmarkRunner,
  Comparator,
  ConsoleReporter,
  CostCalculator,
  DEFAULT_MODEL_PRICING,
  DEFAULT_WEIGHTS,
  DevPilotExecutor,
  HistoryReader,
  JsonReporter,
  MarkdownReporter,
  MetricsCollector,
  ModelPricingSchema,
  ModelTierSchema,
  ProcessManager,
  ResultsWriter,
  RunConfigSchema,
  SCORING_CONSTANTS,
  ScenarioTypeSchema,
  ScoringEngine,
  TimelineRecorder,
  TokenTracker,
  TrendAnalyzer,
  WaveAnalyzer,
  WorkspaceManager,
  addUsage,
  analyzeTrends,
  analyzeWavePlan,
  calculateScore,
  compareScenarios,
  createAcceptanceRunner,
  createBaselineExecutor,
  createBenchmarkRunner,
  createComparator,
  createConsoleReporter,
  createCostCalculator,
  createDevPilotExecutor,
  createEmptyUsage,
  createHistoryReader,
  createJsonReporter,
  createMarkdownReporter,
  createMetricsCollector,
  createProcessManager,
  createResultsWriter,
  createScoringEngine,
  createTimelineRecorder,
  createTimestampPath,
  createTrendAnalyzer,
  createWaveAnalyzer,
  createWorkspaceManager,
  defineConfig,
  getModelPricing,
  getVersionInfo,
  loadConfig,
  loadEnvConfig,
  mergeConfig,
  parseTimestampPath,
  sanitizeVersionForPath,
  toRunConfig
};
//# sourceMappingURL=index.mjs.map