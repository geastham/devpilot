# DevPilot Benchmark Suite — End-to-End Specification
## Integrated Benchmarking, Execution & Analysis System · v1.0
> March 2026 · Open Conjecture

---

## Table of Contents

1. [Purpose & Goals](#1-purpose--goals)
2. [System Overview](#2-system-overview)
3. [Architecture](#3-architecture)
4. [Data Model](#4-data-model)
5. [Benchmark Runner](#5-benchmark-runner)
6. [Session Orchestration](#6-session-orchestration)
7. [Metrics Collection](#7-metrics-collection)
8. [Analysis Engine](#8-analysis-engine)
9. [Results Storage & Versioning](#9-results-storage--versioning)
10. [CLI Interface](#10-cli-interface)
11. [Configuration](#11-configuration)
12. [Execution Scenarios](#12-execution-scenarios)
13. [Output Artifacts](#13-output-artifacts)
14. [Acceptance Criteria](#14-acceptance-criteria)
15. [Implementation Plan](#15-implementation-plan)

---

## 1. Purpose & Goals

### Problem Statement

DevPilot's core value proposition is that orchestrated, parallelized agent execution (via Ruflo hives, managed through DevPilot's planning intelligence) completes development tasks faster and at lower cost than a single coding agent operating sequentially. We need a repeatable, automated way to prove this claim quantitatively across representative project types.

### Goals

1. **Quantify speedup**: Measure wall-clock time reduction when DevPilot orchestrates parallelized Claude Code sessions vs. a single Claude Code baseline for the same benchmark project.
2. **Quantify cost efficiency**: Track total token consumption and USD cost across both scenarios, proving that parallelization doesn't merely shift cost but reduces it through better planning and reduced rework.
3. **Track improvement over time**: Store benchmark results tagged to git versions of DevPilot so that each release has a traceable performance delta.
4. **Automate the full cycle**: From environment setup through execution, validation, metric collection, analysis, and report generation — the suite runs end-to-end with a single command.
5. **Generate actionable signal**: Identify which planning decisions (wave decomposition, prompt specificity, dependency sequencing) contribute most to performance gains, feeding back into DevPilot optimization.

### Non-Goals

- Benchmarking against agents other than Claude Code (future work).
- Testing DevPilot's UI or user-facing surfaces.
- Replacing the existing per-benchmark methodology doc — this spec builds on top of it.
- Production deployment of benchmark projects.

---

## 2. System Overview

The benchmark suite executes a controlled experiment for each benchmark project (Forgepress, Taskforge, InsightBoard) under two scenarios:

```
┌─────────────────────────────────────────────────────────┐
│                  Benchmark Suite CLI                     │
│  devpilot bench run | report | compare | history        │
└────────────┬────────────────────────────┬───────────────┘
             │                            │
     ┌───────▼───────┐          ┌────────▼────────┐
     │   Scenario A  │          │   Scenario B    │
     │   BASELINE    │          │   DEVPILOT      │
     │               │          │                 │
     │  Single       │          │  DevPilot       │
     │  Claude Code  │          │  Orchestrator   │
     │  session      │          │  → Ruflo hives  │
     │  (sequential) │          │  (parallelized) │
     └───────┬───────┘          └────────┬────────┘
             │                            │
     ┌───────▼────────────────────────────▼───────┐
     │            Metrics Collector                │
     │  Wall time · Tokens · Cost · Acceptance     │
     │  Wave plan · Rework ratio · Idle time       │
     └────────────────────┬───────────────────────┘
                          │
     ┌────────────────────▼───────────────────────┐
     │            Analysis Engine                  │
     │  Comparative scoring · Trend analysis       │
     │  Planning quality · Cost breakdown          │
     └────────────────────┬───────────────────────┘
                          │
     ┌────────────────────▼───────────────────────┐
     │         Results Store (Git-Versioned)       │
     │  benchmarks/results/{version}/{timestamp}/  │
     └────────────────────────────────────────────┘
```

### Scenario A: Baseline

A single Claude Code session receives the full PRD and builds the project sequentially. No planning optimization, no parallelization. This represents what a developer gets today by pointing Claude Code at a spec and saying "build this."

### Scenario B: DevPilot

DevPilot's planning agent decomposes the PRD into an optimized wave plan, then dispatches parallelized Claude Code sessions through Ruflo hives. The orchestrator manages dependencies between waves, sequences gated tasks, and maximizes concurrent agent utilization.

---

## 3. Architecture

### Component Map

```
packages/benchmarks/              (new package: @devpilot.sh/benchmarks)
├── src/
│   ├── runner/
│   │   ├── index.ts              Runner entry point — orchestrates full benchmark execution
│   │   ├── environment.ts        Workspace isolation, cleanup, fixture copying
│   │   ├── baseline-executor.ts  Drives single Claude Code session for Scenario A
│   │   ├── devpilot-executor.ts  Drives DevPilot orchestration for Scenario B
│   │   └── acceptance.ts         Runs per-benchmark acceptance test scripts, captures results
│   │
│   ├── metrics/
│   │   ├── collector.ts          Real-time metric collection during execution
│   │   ├── token-tracker.ts      Intercepts/aggregates token usage from Claude API responses
│   │   ├── cost-calculator.ts    Maps token counts to USD by model tier
│   │   └── timeline.ts           Records task start/end times for Gantt-style analysis
│   │
│   ├── analysis/
│   │   ├── comparator.ts         Side-by-side scenario comparison logic
│   │   ├── scoring.ts            Composite benchmark score calculator (per methodology doc)
│   │   ├── wave-analyzer.ts      Compares generated wave plan vs ground-truth DAG
│   │   └── trend.ts              Cross-version trend analysis
│   │
│   ├── storage/
│   │   ├── results-writer.ts     Writes structured results to disk
│   │   ├── version-tagger.ts     Associates results with git tag/commit
│   │   └── history-reader.ts     Reads historical results for trend analysis
│   │
│   ├── reporters/
│   │   ├── console.ts            Rich terminal output during execution
│   │   ├── markdown.ts           Generates markdown report for git storage
│   │   └── json.ts               Machine-readable JSON output
│   │
│   ├── config.ts                 Suite configuration schema and defaults
│   └── types.ts                  Shared type definitions
│
├── cli.ts                        CLI entry point (integrated into devpilot CLI)
├── package.json
└── tsconfig.json
```

### Integration Points

| Component | Integrates With | How |
|-----------|----------------|-----|
| `baseline-executor` | Claude Code CLI (`claude`) | Spawns subprocess, streams output, captures tokens/timing |
| `devpilot-executor` | `@devpilot.sh/core/orchestrator` | Uses `OrchestratorService` to dispatch tasks to Ruflo |
| `token-tracker` | Claude API / `CompletionReport` | Reads `tokensUsed` and `costUsd` from orchestrator reports |
| `version-tagger` | Git CLI | Reads current tag via `git describe --tags`, HEAD commit SHA |
| `acceptance` | Benchmark `run-tests.sh` scripts | Spawns bash subprocess, parses PASS/FAIL output |
| `cli` | `@devpilot.sh/cli` | Registers as `devpilot bench` subcommand |

### Dependency on Existing Packages

```
@devpilot.sh/benchmarks
├── @devpilot.sh/core          (orchestrator types, dispatch, status polling)
├── @devpilot.sh/bridge-client (Ruflo session management for DevPilot scenario)
└── @devpilot.sh/cli           (CLI registration, config access)
```

---

## 4. Data Model

### BenchmarkRun

Top-level container for a complete benchmark execution (one benchmark project, both scenarios).

```typescript
interface BenchmarkRun {
  id: string;                        // cuid2
  benchmarkId: BenchmarkId;          // '01-forgepress' | '02-taskforge' | '03-insightboard'
  devpilotVersion: string;           // git tag or commit SHA
  timestamp: string;                 // ISO 8601
  config: RunConfig;                 // Configuration used for this run
  scenarios: {
    baseline: ScenarioResult;
    devpilot: ScenarioResult;
  };
  comparison: ComparisonResult;      // Computed deltas
  compositeScore: CompositeScore;    // Per methodology doc
}

type BenchmarkId = '01-forgepress' | '02-taskforge' | '03-insightboard';
```

### ScenarioResult

Captures the outcome of a single scenario execution.

```typescript
interface ScenarioResult {
  scenario: 'baseline' | 'devpilot';
  status: 'completed' | 'failed' | 'timeout';

  // Timing
  startedAt: string;
  completedAt: string;
  wallClockMs: number;

  // Cost
  totalTokensInput: number;
  totalTokensOutput: number;
  totalTokens: number;
  totalCostUsd: number;
  costBreakdown: CostEntry[];        // Per-session cost detail

  // Quality
  acceptanceResults: AcceptanceResult;
  firstAttemptPassRate: number;       // % of acceptance tests passing on first run

  // Planning (DevPilot scenario only)
  wavePlan?: WavePlan;
  waveExecutionLog?: WaveExecution[];
  reworkRatio?: number;              // (total edits / minimum required creates)

  // Execution detail
  sessions: SessionRecord[];         // Individual agent sessions
  timeline: TimelineEvent[];         // Ordered execution events
  errors: ExecutionError[];
}
```

### WavePlan

Represents the planned decomposition (DevPilot scenario) or inferred sequential plan (baseline).

```typescript
interface WavePlan {
  waves: Wave[];
  criticalPathMs: number;            // Estimated critical path duration
  maxParallelism: number;            // Peak concurrent sessions
  totalTasks: number;
}

interface Wave {
  waveNumber: number;
  tasks: PlannedTask[];
  dependsOn: number[];               // Wave numbers this wave depends on
  estimatedDurationMs: number;
}

interface PlannedTask {
  id: string;
  name: string;
  files: string[];
  prompt: string;                    // Prompt sent to Claude Code
  model: 'haiku' | 'sonnet' | 'opus';
  dependsOn: string[];               // Task IDs within the wave plan
  estimatedDurationMs: number;
}
```

### AcceptanceResult

```typescript
interface AcceptanceResult {
  totalTests: number;
  passed: number;
  failed: number;
  passRate: number;                   // 0.0 - 1.0
  details: AcceptanceTest[];
  scriptOutput: string;              // Raw stdout from run-tests.sh
}

interface AcceptanceTest {
  name: string;
  status: 'pass' | 'fail';
  output?: string;
}
```

### ComparisonResult

```typescript
interface ComparisonResult {
  speedup: number;                    // baseline.wallClockMs / devpilot.wallClockMs
  costReduction: number;              // 1 - (devpilot.totalCostUsd / baseline.totalCostUsd)
  timeReductionMs: number;            // baseline.wallClockMs - devpilot.wallClockMs
  timeReductionPercent: number;
  costReductionUsd: number;           // baseline.totalCostUsd - devpilot.totalCostUsd
  qualityDelta: number;              // devpilot.passRate - baseline.passRate
  tokenEfficiency: number;            // baseline.totalTokens / devpilot.totalTokens
  wavePlanScore: number;              // 0-25, per methodology rubric
  compositeAdvantage: number;         // Overall composite score delta
}
```

### SessionRecord

Tracks individual Claude Code sessions within either scenario.

```typescript
interface SessionRecord {
  sessionId: string;
  scenario: 'baseline' | 'devpilot';
  waveNumber?: number;                // DevPilot scenario only
  taskId?: string;                    // DevPilot scenario only
  model: string;
  prompt: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
  filesCreated: string[];
  filesModified: string[];
  success: boolean;
  error?: string;
}
```

### CompositeScore

Per the methodology doc scoring rubric.

```typescript
interface CompositeScore {
  total: number;                      // 0-100
  breakdown: {
    acceptanceTests: number;          // 30% weight, based on pass rate
    wavePlanQuality: number;          // 25% weight, vs ground truth
    firstAttemptPassRate: number;     // 20% weight
    completionTime: number;          // 15% weight, linear scale
    reworkRatio: number;              // 10% weight
  };
}
```

---

## 5. Benchmark Runner

### Execution Flow

```
devpilot bench run [--benchmarks 01,02,03] [--scenarios baseline,devpilot]
                                    │
                                    ▼
                          ┌─────────────────┐
                          │  Load Config     │
                          │  Resolve version │
                          │  Validate env    │
                          └────────┬────────┘
                                   │
                     ┌─────────────┴─────────────┐
                     │  For each benchmark:       │
                     │  (parallel if --parallel)  │
                     ▼                            ▼
            ┌────────────────┐          ┌────────────────┐
            │  Prepare       │          │  Prepare       │
            │  Workspace A   │          │  Workspace B   │
            │  (baseline)    │          │  (devpilot)    │
            └───────┬────────┘          └───────┬────────┘
                    │                           │
                    ▼                           ▼
            ┌────────────────┐          ┌────────────────┐
            │  Execute       │          │  Execute       │
            │  Baseline      │          │  DevPilot      │
            │  (sequential)  │          │  (orchestrated)│
            └───────┬────────┘          └───────┬────────┘
                    │                           │
                    ▼                           ▼
            ┌────────────────┐          ┌────────────────┐
            │  Run           │          │  Run           │
            │  Acceptance    │          │  Acceptance    │
            │  Tests         │          │  Tests         │
            └───────┬────────┘          └───────┬────────┘
                    │                           │
                    └───────────┬───────────────┘
                                │
                                ▼
                    ┌────────────────────┐
                    │  Collect Metrics   │
                    │  Compare Results   │
                    │  Score & Analyze   │
                    └────────┬───────────┘
                             │
                             ▼
                    ┌────────────────────┐
                    │  Write Results     │
                    │  Generate Report   │
                    │  Tag to Version    │
                    └────────────────────┘
```

### Workspace Isolation

Each scenario runs in a fully isolated workspace to prevent cross-contamination:

```typescript
interface WorkspaceConfig {
  rootDir: string;                    // e.g., /tmp/devpilot-bench/{runId}
  baselineDir: string;               // {rootDir}/baseline/{benchmarkId}/
  devpilotDir: string;               // {rootDir}/devpilot/{benchmarkId}/
}
```

**Setup per workspace:**
1. Create clean directory
2. Initialize `package.json` (if applicable for the benchmark)
3. Copy fixtures from `benchmarks/{id}/fixtures/` into workspace
4. Copy acceptance tests from `benchmarks/{id}/acceptance/` into workspace
5. Set environment variables (`NODE_ENV=test`, `PORT` assignments, etc.)

**Cleanup:**
- After metrics collection, archive workspace artifacts needed for analysis
- Delete temporary workspace directories
- Kill any lingering processes (servers, watchers)

### Timeout & Hard Ceiling

Per the methodology doc, each benchmark run has a 10-minute hard ceiling:

```typescript
const BENCHMARK_TIMEOUT_MS = 10 * 60 * 1000;  // 10 minutes per scenario
const BENCHMARK_IDEAL_MS = 5 * 60 * 1000;     // 5 minutes = perfect time score
```

The runner monitors wall-clock time and force-terminates if the ceiling is breached. Timed-out runs receive a `status: 'timeout'` and score 0 on the completion time component.

---

## 6. Session Orchestration

### Baseline Executor

The baseline executor simulates a developer using Claude Code with no DevPilot intelligence.

```typescript
interface BaselineExecutorConfig {
  claudeCodeBinary: string;          // Path to 'claude' CLI
  model: string;                     // Default: 'sonnet'
  maxTokens: number;                 // Default: 200000
  timeout: number;                   // Milliseconds
}
```

**Execution strategy:**
1. Send the full PRD as a single prompt to Claude Code in Plan Mode
2. Let Claude Code generate its own implementation plan
3. Execute the plan sequentially (single session)
4. Capture all output: files created, tokens used, time elapsed
5. Run acceptance tests against the workspace
6. If tests fail, allow one retry cycle (Claude Code sees failures and attempts fixes)
7. Capture retry metrics separately (contributes to rework ratio)

**Token/cost capture:**
- Parse Claude Code CLI stdout for token usage summaries
- If Claude Code exposes usage via API response, capture `input_tokens`, `output_tokens`, and `cache_read_input_tokens`
- Map to cost using the `cost-calculator` module

### DevPilot Executor

The DevPilot executor uses the full DevPilot planning + orchestration stack.

```typescript
interface DevPilotExecutorConfig {
  orchestratorUrl: string;           // Ruflo endpoint
  apiKey: string;
  maxConcurrentSessions: number;     // Default: 4
  models: {
    planning: string;                // Model for wave plan generation
    execution: string;               // Default model for task execution
  };
  callbackPort: number;              // Local port for status callbacks
}
```

**Execution strategy:**
1. Feed the PRD to DevPilot's planning agent
2. Planning agent generates a `WavePlan` with task decomposition
3. Capture the generated wave plan (for comparison with ground truth)
4. For each wave, in sequence:
   a. Dispatch all tasks in the wave as parallel Ruflo sessions via `OrchestratorService`
   b. Monitor sessions via `StatusPoller` or callback webhook
   c. Wait for all sessions in the wave to complete
   d. Validate wave outputs (file existence, no compile errors)
   e. If a task fails, record the failure and optionally retry
   f. Proceed to next wave only when all dependencies are satisfied
5. Run acceptance tests against the workspace
6. If tests fail, allow one remediation wave (planning agent analyzes failures, dispatches targeted fixes)
7. Capture all session-level metrics from `CompletionReport` objects

**Wave execution monitoring:**

```typescript
interface WaveExecution {
  waveNumber: number;
  plannedTasks: number;
  completedTasks: number;
  failedTasks: number;
  startedAt: string;
  completedAt: string;
  wallClockMs: number;
  sessions: SessionRecord[];
  parallelismActual: number;         // How many sessions ran concurrently
  idleTimeMs: number;                // Time where agent slots sat unused
}
```

### Parallelism Tracking

For the DevPilot scenario, we track parallelism efficiency as a first-class metric:

```
Parallelism Efficiency = Total session-seconds / (Wall-clock seconds × max concurrent slots)
```

A score of 1.0 means every available slot was utilized for the entire run. Lower scores indicate the planner left capacity on the table — either through poor wave decomposition or unnecessary sequential dependencies.

---

## 7. Metrics Collection

### Real-Time Collection

During execution, the metrics collector captures events as they occur:

```typescript
interface TimelineEvent {
  timestamp: string;
  eventType:
    | 'run_start'
    | 'scenario_start'
    | 'wave_start'
    | 'session_start'
    | 'session_progress'
    | 'session_complete'
    | 'session_error'
    | 'wave_complete'
    | 'acceptance_start'
    | 'acceptance_complete'
    | 'scenario_complete'
    | 'run_complete';
  sessionId?: string;
  waveNumber?: number;
  data: Record<string, unknown>;
}
```

### Token Tracking

```typescript
interface TokenUsage {
  sessionId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
}
```

### Cost Calculation

Token-to-cost mapping uses a configurable rate card:

```typescript
interface ModelPricing {
  model: string;
  inputPer1M: number;               // USD per 1M input tokens
  outputPer1M: number;              // USD per 1M output tokens
  cacheReadPer1M: number;           // USD per 1M cache read tokens
  cacheWritePer1M: number;          // USD per 1M cache write tokens
}

const DEFAULT_PRICING: ModelPricing[] = [
  {
    model: 'haiku',
    inputPer1M: 0.25,
    outputPer1M: 1.25,
    cacheReadPer1M: 0.025,
    cacheWritePer1M: 0.30,
  },
  {
    model: 'sonnet',
    inputPer1M: 3.00,
    outputPer1M: 15.00,
    cacheReadPer1M: 0.30,
    cacheWritePer1M: 3.75,
  },
  {
    model: 'opus',
    inputPer1M: 15.00,
    outputPer1M: 75.00,
    cacheReadPer1M: 1.50,
    cacheWritePer1M: 18.75,
  },
];
```

Pricing is stored in configuration and updated as Anthropic adjusts rates. The rate card at time of benchmark execution is captured in the run record for historical accuracy.

### Rework Ratio

```
Rework Ratio = Total file edits across all sessions / Minimum required file creates

Where:
  - "File edit" = any modification to an already-created file
  - "Minimum required file creates" = count of unique files the benchmark requires
```

Lower is better. A ratio of 1.0 means zero rework. A ratio of 2.0 means every file was touched twice on average.

---

## 8. Analysis Engine

### Comparative Analysis

The comparator produces a side-by-side analysis of the two scenarios:

```
┌──────────────────────┬──────────────┬──────────────┬──────────────┐
│ Metric               │ Baseline     │ DevPilot     │ Delta        │
├──────────────────────┼──────────────┼──────────────┼──────────────┤
│ Wall Clock Time      │ 8m 42s       │ 3m 15s       │ -62.6%       │
│ Total Tokens         │ 145,230      │ 112,480      │ -22.6%       │
│ Total Cost           │ $2.18        │ $1.69        │ -22.5%       │
│ Acceptance Pass Rate │ 12/14 (85%)  │ 14/14 (100%) │ +15%         │
│ First-Attempt Pass   │ 9/14 (64%)   │ 13/14 (93%)  │ +29%         │
│ Rework Ratio         │ 1.8          │ 1.1          │ -38.9%       │
│ Agent Sessions       │ 1            │ 12           │              │
│ Peak Parallelism     │ 1            │ 4            │              │
│ Parallelism Eff.     │ N/A          │ 0.78         │              │
├──────────────────────┼──────────────┼──────────────┼──────────────┤
│ Composite Score      │ 52/100       │ 87/100       │ +35          │
│ Speedup Factor       │              │ 2.68×        │              │
│ Cost Efficiency      │              │ 1.29×        │              │
└──────────────────────┴──────────────┴──────────────┴──────────────┘
```

### Wave Plan Quality Analysis

The wave analyzer compares the DevPilot-generated wave plan against the ground-truth DAG defined in each benchmark PRD:

```typescript
interface WaveAnalysis {
  groundTruthWaves: number;
  generatedWaves: number;
  taskPlacementAccuracy: number;      // % of tasks in correct wave position
  dependencyViolations: string[];     // Tasks attempted before their dependencies
  missedParallelism: string[];        // Tasks sequentialized that could have parallelized
  unnecessarySequencing: string[];    // False dependencies that slowed execution
  editDistance: number;               // Levenshtein-style distance between plans
  score: number;                      // 0-25, per rubric
}
```

The ground-truth DAGs are extracted from each PRD's section 3 (Dependency Graph) and encoded as structured data in a `ground-truth.json` file within each benchmark directory:

```json
{
  "benchmarkId": "01-forgepress",
  "waves": [
    {
      "wave": 1,
      "tasks": ["project-scaffold", "config-module", "frontmatter-parser", "markdown-renderer"],
      "parallel": ["config-module", "frontmatter-parser", "markdown-renderer"]
    },
    {
      "wave": 2,
      "tasks": ["content-discovery", "template-engine", "plugin-system", "file-writer"],
      "parallel": ["content-discovery", "template-engine", "plugin-system", "file-writer"],
      "dependsOn": [1]
    }
  ],
  "criticalPath": ["config-module", "plugin-system", "any-plugin", "pipeline", "cli"],
  "maxParallelism": 4
}
```

### Trend Analysis

When historical results exist, the trend analyzer computes:

```typescript
interface TrendAnalysis {
  benchmarkId: BenchmarkId;
  versions: VersionDataPoint[];
  trends: {
    speedupTrend: 'improving' | 'stable' | 'regressing';
    costTrend: 'improving' | 'stable' | 'regressing';
    qualityTrend: 'improving' | 'stable' | 'regressing';
  };
  bestVersion: string;               // Version with highest composite score
  latestDelta: {                     // Change from previous version
    speedupChange: number;
    costChange: number;
    scoreChange: number;
  };
}

interface VersionDataPoint {
  version: string;
  timestamp: string;
  compositeScore: number;
  speedup: number;
  costReduction: number;
  passRate: number;
}
```

---

## 9. Results Storage & Versioning

### Directory Structure

Results are stored within the repository for git-versioned history:

```
benchmarks/
├── results/
│   ├── latest/                      Symlink → most recent version directory
│   │   ├── summary.md               Human-readable roll-up across all benchmarks
│   │   └── summary.json             Machine-readable roll-up
│   │
│   ├── v0.1.0/                      Tagged version directories
│   │   ├── 2026-03-12T14-30-00Z/    Timestamped run directory
│   │   │   ├── run-manifest.json    Full BenchmarkRun data (all scenarios, all metrics)
│   │   │   ├── report.md            Human-readable comparative report
│   │   │   ├── 01-forgepress/
│   │   │   │   ├── baseline/
│   │   │   │   │   ├── session-log.jsonl    Per-session records
│   │   │   │   │   ├── timeline.json        Execution timeline
│   │   │   │   │   ├── acceptance.txt       Raw acceptance test output
│   │   │   │   │   └── workspace.tar.gz     Archived workspace (optional)
│   │   │   │   ├── devpilot/
│   │   │   │   │   ├── wave-plan.json       Generated wave plan
│   │   │   │   │   ├── session-log.jsonl
│   │   │   │   │   ├── timeline.json
│   │   │   │   │   ├── acceptance.txt
│   │   │   │   │   └── workspace.tar.gz
│   │   │   │   ├── comparison.json          Side-by-side metrics
│   │   │   │   └── wave-analysis.json       Plan quality analysis
│   │   │   ├── 02-taskforge/
│   │   │   │   └── ...
│   │   │   └── 03-insightboard/
│   │   │       └── ...
│   │   └── trend.json               Cross-version trend data
│   │
│   └── v0.2.0/
│       └── ...
│
├── ground-truth/                    Structured ground-truth DAGs (extracted from PRDs)
│   ├── 01-forgepress.json
│   ├── 02-taskforge.json
│   └── 03-insightboard.json
│
├── 00-common/
│   └── BENCHMARK-METHODOLOGY.md     (existing)
├── 01-cli-static-site-gen/          (existing)
├── 02-rest-api-task-manager/        (existing)
└── 03-react-analytics-dashboard/    (existing)
```

### Version Tagging

The `version-tagger` module determines the current version:

1. Check for a git tag on HEAD: `git describe --tags --exact-match HEAD`
2. If no tag, use `git describe --tags --always` (e.g., `v0.1.0-3-gabcdef`)
3. Fall back to HEAD commit SHA if no tags exist
4. Store the resolved version string in the run manifest

### Latest Symlink

After each run, the `latest` symlink is updated to point to the most recent version's run directory. This enables stable paths for CI/CD integration:

```bash
benchmarks/results/latest/summary.json    # Always points to most recent
```

### Workspace Archival

By default, workspaces are archived as `.tar.gz` for post-mortem analysis. This can be disabled via `--no-archive` to save disk space. Archives are `.gitignore`d to avoid bloating the repository.

### What Gets Committed

The following files are committed to git (not gitignored):

- `run-manifest.json` — Full structured results
- `report.md` — Human-readable report
- `comparison.json` — Per-benchmark comparison data
- `wave-plan.json` — Generated wave plans
- `wave-analysis.json` — Plan quality analysis
- `summary.md` / `summary.json` — Cross-benchmark summaries
- `trend.json` — Version-over-version trends
- `acceptance.txt` — Raw test output

The following are `.gitignore`d:

- `workspace.tar.gz` — Too large for git
- `session-log.jsonl` — High-volume execution logs (retained locally)

---

## 10. CLI Interface

The benchmark suite integrates into the existing `devpilot` CLI as a `bench` subcommand.

### Commands

```
devpilot bench run [options]          Execute benchmark suite
devpilot bench report [runId]         Generate/view report for a run
devpilot bench compare <v1> <v2>      Compare results between two versions
devpilot bench history [benchmarkId]  Show trend across versions
devpilot bench list                   List available benchmarks and past runs
devpilot bench validate               Validate benchmark fixtures and acceptance tests
```

### `devpilot bench run`

```
Options:
  -b, --benchmarks <ids>      Comma-separated benchmark IDs to run
                               (default: all — 01,02,03)
  -s, --scenarios <types>     Comma-separated scenarios to run
                               (default: baseline,devpilot)
  -n, --iterations <count>    Number of iterations per scenario (default: 1)
  -c, --concurrency <slots>   Max concurrent agent sessions for DevPilot
                               (default: 4)
  --parallel                  Run benchmarks in parallel (default: sequential)
  --model <model>             Claude model for baseline scenario
                               (default: sonnet)
  --timeout <minutes>         Per-scenario timeout (default: 10)
  --no-archive                Skip workspace archival
  --dry-run                   Validate configuration without executing
  --output <dir>              Override results output directory
  --tag <version>             Override version tag (default: auto-detect)
```

### `devpilot bench report`

```
Options:
  --format <type>             Output format: markdown | json | console
                               (default: console)
  --output <file>             Write report to file (default: stdout)
  --latest                    Report on the most recent run (default)
```

### `devpilot bench compare`

```
Arguments:
  <v1>                        First version to compare (e.g., v0.1.0)
  <v2>                        Second version to compare (e.g., v0.2.0)

Options:
  -b, --benchmark <id>       Compare a specific benchmark (default: all)
  --format <type>             Output format: markdown | json | console
```

### `devpilot bench history`

```
Arguments:
  [benchmarkId]               Specific benchmark to show history for

Options:
  --last <n>                  Show last N versions (default: 10)
  --format <type>             Output format: markdown | json | console
  --metric <name>             Highlight specific metric
                               (speedup | cost | score | passRate)
```

### Console Output Examples

**During execution:**
```
devpilot bench run --benchmarks 01

  DevPilot Benchmark Suite v0.1.0
  ─────────────────────────────────

  Benchmark: 01-forgepress (Forgepress — CLI Static Site Generator)

  ▸ Scenario A: Baseline (single Claude Code session)
    ├─ Sending PRD to Claude Code...
    ├─ Session active: 142s elapsed, 45,230 tokens used
    ├─ Build complete. Running acceptance tests...
    ├─ Acceptance: 12/14 passed (85.7%)
    └─ Total: 4m 22s | $1.42 | 89,450 tokens

  ▸ Scenario B: DevPilot (orchestrated, 4 concurrent slots)
    ├─ Planning agent generating wave plan...
    ├─ Wave plan: 5 waves, 16 tasks, max parallelism 4
    ├─ Wave 1: ████████████████████ 4/4 tasks complete (28s)
    ├─ Wave 2: ████████████████████ 4/4 tasks complete (35s)
    ├─ Wave 3: ████████████████████ 4/4 tasks complete (22s)
    ├─ Wave 4: ████████████████████ 3/3 tasks complete (38s)
    ├─ Wave 5: ████████████████████ 1/1 tasks complete (12s)
    ├─ Running acceptance tests...
    ├─ Acceptance: 14/14 passed (100%)
    └─ Total: 2m 15s | $1.12 | 68,200 tokens

  ─────────────────────────────────

  ┌──────────────────────┬──────────┬──────────┬──────────┐
  │ Metric               │ Baseline │ DevPilot │ Delta    │
  ├──────────────────────┼──────────┼──────────┼──────────┤
  │ Wall Clock Time      │ 4m 22s   │ 2m 15s   │ -48.5%  │
  │ Total Cost           │ $1.42    │ $1.12    │ -21.1%  │
  │ Acceptance Pass Rate │ 85.7%    │ 100.0%   │ +14.3%  │
  │ Composite Score      │ 58       │ 89       │ +31     │
  │ Speedup              │          │ 1.94×    │         │
  └──────────────────────┴──────────┴──────────┴──────────┘

  Results saved to: benchmarks/results/v0.1.0/2026-03-12T14-30-00Z/
```

---

## 11. Configuration

### Configuration File

`benchmarks/bench.config.ts`

```typescript
import { defineConfig } from '@devpilot.sh/benchmarks';

export default defineConfig({
  benchmarks: {
    include: ['01-forgepress', '02-taskforge', '03-insightboard'],
    benchmarkDir: './benchmarks',
    groundTruthDir: './benchmarks/ground-truth',
  },

  baseline: {
    claudeCodeBinary: 'claude',
    model: 'sonnet',
    maxRetries: 1,
  },

  devpilot: {
    orchestratorUrl: process.env.RUFLO_URL || 'http://localhost:8080',
    apiKey: process.env.RUFLO_API_KEY,
    maxConcurrentSessions: 4,
    planningModel: 'sonnet',
    executionModel: 'sonnet',
  },

  execution: {
    timeoutMinutes: 10,
    idealTimeMinutes: 5,
    iterations: 1,
    parallel: false,
    archiveWorkspaces: true,
  },

  pricing: [
    { model: 'haiku', inputPer1M: 0.25, outputPer1M: 1.25, cacheReadPer1M: 0.025, cacheWritePer1M: 0.30 },
    { model: 'sonnet', inputPer1M: 3.00, outputPer1M: 15.00, cacheReadPer1M: 0.30, cacheWritePer1M: 3.75 },
    { model: 'opus', inputPer1M: 15.00, outputPer1M: 75.00, cacheReadPer1M: 1.50, cacheWritePer1M: 18.75 },
  ],

  scoring: {
    weights: {
      acceptanceTests: 0.30,
      wavePlanQuality: 0.25,
      firstAttemptPassRate: 0.20,
      completionTime: 0.15,
      reworkRatio: 0.10,
    },
  },

  output: {
    resultsDir: './benchmarks/results',
    reporters: ['console', 'markdown', 'json'],
  },
});
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | API key for Claude Code sessions |
| `RUFLO_URL` | For DevPilot | Ruflo orchestrator endpoint |
| `RUFLO_API_KEY` | For DevPilot | Ruflo API authentication |
| `BENCH_RESULTS_DIR` | No | Override results output directory |
| `BENCH_TIMEOUT` | No | Override timeout in minutes |
| `BENCH_MODEL` | No | Override Claude model |

---

## 12. Execution Scenarios

### Scenario Matrix

Each benchmark is executed under multiple conditions to generate robust comparative data:

| Run | Scenario | Concurrency | Description |
|-----|----------|-------------|-------------|
| A | Baseline | 1 | Single Claude Code session, no planning assistance |
| B | DevPilot (default) | 4 | Full DevPilot orchestration, 4 concurrent slots |
| C | DevPilot (constrained) | 2 | DevPilot with limited parallelism (stress-tests planning) |

Run C is optional and activated via `--iterations 3` or `--scenarios baseline,devpilot,devpilot-constrained`.

### Per-Benchmark Execution Notes

#### 01-Forgepress (CLI Static Site Generator)

- **Workspace setup**: Copy fixtures (content/, templates/, config), initialize npm with allowed dependencies
- **Baseline prompt**: Full PRD as single prompt, "Build the Forgepress static site generator as specified"
- **DevPilot planning**: Expected to identify plugin interface as gating dependency, parallelize 4 plugins in Wave 3
- **Acceptance**: Run `acceptance/run-tests.sh` against built output
- **Key metric**: Plugin parallelism — does the planner fan out all 4 plugins?

#### 02-Taskforge (REST API with Auth)

- **Workspace setup**: Initialize npm, seed data available but not pre-loaded
- **Baseline prompt**: Full PRD, "Build the Taskforge REST API as specified"
- **DevPilot planning**: Expected to recognize auth as cross-cutting, parallelize independent services
- **Acceptance**: Start server, run `acceptance/run-tests.sh` with curl commands
- **Special handling**: Server must be started before tests and killed after; acceptance script manages this
- **Key metric**: Auth middleware sequencing — does the planner build auth service → auth middleware → routes in correct order?

#### 03-InsightBoard (React Analytics Dashboard)

- **Workspace setup**: Copy CSV fixtures, initialize npm with data/API/frontend dependencies
- **Baseline prompt**: Full PRD, "Build the InsightBoard analytics dashboard as specified"
- **DevPilot planning**: Expected to choose horizontal (layer-by-layer) strategy, run pipeline before API tests
- **Acceptance**: Run pipeline, start API, verify endpoints, check frontend file structure and builds
- **Special handling**: Pipeline must run before API tests; API server must start/stop around tests
- **Key metric**: Horizontal vs. vertical strategy choice — does the planner maximize within-layer parallelism?

---

## 13. Output Artifacts

### Markdown Report (`report.md`)

Generated per run, containing:

1. **Header**: DevPilot version, timestamp, configuration summary
2. **Executive Summary**: Key findings across all benchmarks
3. **Per-Benchmark Results**: Comparative table (as shown in CLI output example)
4. **Wave Plan Analysis**: Ground-truth comparison, dependency violations
5. **Timeline Visualization**: ASCII Gantt chart of task execution
6. **Cost Breakdown**: Per-session cost detail
7. **Planning Decision Analysis**: Key decisions noted per evaluation rubric
8. **Recommendations**: Automated suggestions for improving planning quality

### Timeline Visualization (ASCII Gantt)

```
DevPilot Scenario — 01-Forgepress — Wave Execution Timeline

Time (s)  0    30    60    90   120   150   180
          │     │     │     │     │     │     │
Wave 1    ├─ config ─────┤
          ├─ frontmatter ┤
          ├─ markdown ───┤
          ├─ scaffold ┤
          │
Wave 2    │              ├─ discovery ──┤
          │              ├─ templates ──────────┤
          │              ├─ plugins ────────┤
          │              ├─ writer ─────┤
          │
Wave 3    │                                    ├─ syntax ──┤
          │                                    ├─ toc ─────────┤
          │                                    ├─ read-time ┤
          │                                    ├─ seo ─────┤
          │
Wave 4    │                                                    ├─ pipeline ─────────┤
          │                                                    │   ├─ cli ──────┤
          │                                                    │   ├─ server ───┤
          │
Wave 5    │                                                                         ├─ tests ──┤
```

### JSON Manifest (`run-manifest.json`)

The complete `BenchmarkRun` object serialized as JSON, suitable for programmatic consumption by dashboards, CI checks, or trend analysis tools.

### Summary Report (`summary.md`)

Cross-benchmark roll-up for the version:

```markdown
# DevPilot Benchmark Summary — v0.1.0

| Benchmark | Speedup | Cost Δ | Score (B) | Score (DP) | Pass Rate |
|-----------|---------|--------|-----------|------------|-----------|
| Forgepress | 1.94× | -21.1% | 58 | 89 | 100% |
| Taskforge | 2.31× | -18.7% | 52 | 84 | 100% |
| InsightBoard | 2.68× | -25.3% | 45 | 91 | 100% |
| **Average** | **2.31×** | **-21.7%** | **51.7** | **88.0** | **100%** |
```

---

## 14. Acceptance Criteria

### Suite-Level Acceptance

| ID | Criterion | Verification |
|----|-----------|-------------|
| BS-01 | `devpilot bench run` executes all 3 benchmarks under both scenarios without manual intervention | Run command, observe completion with exit code 0 |
| BS-02 | Each scenario produces an `AcceptanceResult` with pass/fail counts | Check `run-manifest.json` has `.scenarios.baseline.acceptanceResults` and `.scenarios.devpilot.acceptanceResults` |
| BS-03 | Token and cost metrics are captured for every session | Check `session-log.jsonl` entries all have non-zero `tokensInput`, `tokensOutput`, `costUsd` |
| BS-04 | Comparison table is generated with speedup, cost reduction, and quality delta | Check `comparison.json` has `speedup`, `costReduction`, `qualityDelta` fields |
| BS-05 | Results are written to `benchmarks/results/{version}/{timestamp}/` | Verify directory structure exists after run |
| BS-06 | `latest` symlink points to the most recent run | `readlink benchmarks/results/latest` resolves to a valid directory |
| BS-07 | Wave plan is captured for DevPilot scenario | Check `wave-plan.json` exists and contains valid `WavePlan` |
| BS-08 | Wave plan is scored against ground truth | Check `wave-analysis.json` has `score` field (0-25) |
| BS-09 | Markdown report is generated and committed | Check `report.md` exists in results directory |
| BS-10 | `devpilot bench compare v1 v2` produces a valid comparison | Run command with two versions that have results |
| BS-11 | `devpilot bench history` shows version-over-version trend | Run command, verify output includes multiple versions |
| BS-12 | Benchmark timeout is enforced (10-minute ceiling) | Artificially delay a scenario, verify it terminates with `status: 'timeout'` |
| BS-13 | Workspace isolation prevents cross-contamination | Run two benchmarks, verify workspaces have no shared state |
| BS-14 | Failed acceptance tests are captured, not swallowed | Intentionally break a benchmark, verify failure is recorded in results |
| BS-15 | Suite runs in CI without interactive prompts | Run in headless mode, verify no stdin reads |

---

## 15. Implementation Plan

### Phase 1: Foundation (Week 1)

**Goal**: Scaffold the `@devpilot.sh/benchmarks` package and implement the baseline executor.

| Task | Files | Estimate |
|------|-------|----------|
| Create package scaffold | `packages/benchmarks/package.json`, `tsconfig.json` | 1h |
| Define type system | `src/types.ts` | 2h |
| Implement config loader | `src/config.ts` | 1h |
| Build environment manager | `src/runner/environment.ts` | 3h |
| Build baseline executor | `src/runner/baseline-executor.ts` | 4h |
| Build acceptance test runner | `src/runner/acceptance.ts` | 2h |
| Build console reporter | `src/reporters/console.ts` | 2h |
| Create ground-truth JSON files | `benchmarks/ground-truth/*.json` | 2h |
| Wire up CLI subcommand | `cli.ts`, integrate with `@devpilot.sh/cli` | 2h |

**Deliverable**: `devpilot bench run --scenarios baseline --benchmarks 01` works end-to-end.

### Phase 2: Metrics & Analysis (Week 2)

**Goal**: Full metrics collection, cost calculation, scoring, and report generation.

| Task | Files | Estimate |
|------|-------|----------|
| Build metrics collector | `src/metrics/collector.ts` | 3h |
| Build token tracker | `src/metrics/token-tracker.ts` | 2h |
| Build cost calculator | `src/metrics/cost-calculator.ts` | 1h |
| Build timeline recorder | `src/metrics/timeline.ts` | 2h |
| Build scoring engine | `src/analysis/scoring.ts` | 3h |
| Build wave analyzer | `src/analysis/wave-analyzer.ts` | 3h |
| Build results writer | `src/storage/results-writer.ts` | 2h |
| Build version tagger | `src/storage/version-tagger.ts` | 1h |
| Build markdown reporter | `src/reporters/markdown.ts` | 3h |
| Build JSON reporter | `src/reporters/json.ts` | 1h |

**Deliverable**: Baseline runs produce full results with scores, comparisons, and reports.

### Phase 3: DevPilot Integration (Week 3)

**Goal**: Implement the DevPilot executor and comparative analysis.

| Task | Files | Estimate |
|------|-------|----------|
| Build DevPilot executor | `src/runner/devpilot-executor.ts` | 6h |
| Integrate with `OrchestratorService` | Wire up dispatch, status polling | 3h |
| Build wave execution monitor | Track per-wave timing, parallelism | 3h |
| Build comparator | `src/analysis/comparator.ts` | 3h |
| Build runner orchestrator | `src/runner/index.ts` (full flow) | 4h |
| Implement `devpilot bench compare` | CLI command + comparison logic | 2h |
| End-to-end testing | Run full suite, validate outputs | 4h |

**Deliverable**: `devpilot bench run` works with both scenarios, produces comparative reports.

### Phase 4: History & Polish (Week 4)

**Goal**: Trend analysis, history commands, CI readiness, and documentation.

| Task | Files | Estimate |
|------|-------|----------|
| Build history reader | `src/storage/history-reader.ts` | 2h |
| Build trend analyzer | `src/analysis/trend.ts` | 3h |
| Implement `devpilot bench history` | CLI command + trend output | 2h |
| Implement `devpilot bench list` | CLI command | 1h |
| Implement `devpilot bench validate` | CLI command + fixture validation | 2h |
| Add `.gitignore` rules | Workspace archives, session logs | 30m |
| CI integration guide | Document headless execution | 2h |
| README and usage docs | `packages/benchmarks/README.md` | 2h |
| Summary report generator | Cross-benchmark roll-up | 2h |

**Deliverable**: Full suite with history tracking, CI-ready, documented.

### Dependencies & Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Claude Code CLI output format changes | Token tracking breaks | Abstract behind `token-tracker` interface; add format detection |
| Ruflo API unavailable during testing | DevPilot scenario fails | Support mock orchestrator mode for development/testing |
| Benchmark projects are non-deterministic | Inconsistent results across runs | Use `--iterations` for statistical averaging; pin randomness sources |
| Large workspace archives bloat git | Repository size grows | `.gitignore` archives; only commit structured JSON/MD results |
| Model pricing changes | Historical cost comparisons become misleading | Capture pricing snapshot in each run manifest; re-normalize when comparing |

---

*DevPilot Benchmark Suite Specification · v1.0 · Open Conjecture · March 2026*
