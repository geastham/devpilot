# TRD 13 — Benchmarks in CI
## Scheduled Benchmark Execution, Regression Gating & Plan-Quality Trend Surface · v1.0

> July 2026 · Open Conjecture · Status: **DRAFT**
>
> **Depends on: Tiers 1–3 (spec/trd/01..03)** — but this is the **weakest dependency
> of the Tier 4 TRDs and can start after Tier 1 only.** Specifically:
> - `spec/trd/01-TIER1-EXECUTION-LOOP.md` — required only for the `devpilot` scenario:
>   the benchmark DevPilot executor (`packages/benchmarks/src/runner/devpilot-executor.ts`)
>   exercises the real dispatch loop, so wave dispatch, the wired `CompletionListener`,
>   and the finished claude-session adapter must exist for those runs to be meaningful.
>   The `baseline` scenario (plain `claude` CLI subprocess) has **zero** Tier 1–3
>   dependencies — the CI workflow and baseline-only runs can land the day Tier 1
>   starts, and the full matrix turns on when Tier 1 ships.
> - Nothing in Tier 2 (layouts, DAG modal, conversational mode) or Tier 3 (bridge,
>   Linear persistence) is required.
>
> Tier 4 feature #18 from `docs/ROADMAP.md`: "Benchmarks in CI + a plan-quality trend
> panel in the UI (closes the WAVE-PLANNER §6 feedback loop)."

---

## 1. Problem Statement & Goals

### Problem Statement

`docs/ROADMAP.md` calls the benchmark suite "essentially complete — real subprocess
harness (baseline + DevPilot executors), scoring, history/compare/trend CLI. Needs a
live `claude` CLI + API key to run; **not yet in CI**." Today benchmark runs only
happen when a developer runs `devpilot-bench run` locally with `ANTHROPIC_API_KEY`
set. Consequences:

1. Plan-quality regressions ship silently — nothing compares a release's composite
   score against the previous version even though `analysis/comparator.ts` and
   `analysis/trend.ts` already implement the math.
2. Results live only on developers' disks (`benchmarks/results/`, gitignored), so the
   trend series the `HistoryReader` is built to read effectively doesn't exist.
3. The UI has no surface for plan-quality trends, leaving the WAVE-PLANNER §6
   feedback loop (metrics → benchmark → score) open.

### Goals

1. **CI workflow** `.github/workflows/benchmarks.yml`: manual dispatch, weekly cron,
   and release tags (deliberately **not** per-PR — a full matrix run costs real API
   dollars and 30–60 wall-clock minutes), matrix over benchmarks 01–03, `claude` CLI
   install, `ANTHROPIC_API_KEY` from secrets, hard timeout budget, results uploaded as
   artifacts.
2. **Durable results index**: a small committed `benchmarks/results/index.json`
   summary (one entry per run) so trends survive artifact expiry while the repo stays
   lean; full result trees stay in artifacts.
3. **Cost controls**: per-run token/cost budget enforced in the harness, scenario
   subset flags, and verified fail-safe kill on runaway processes.
4. **Regression gating**: a `devpilot-bench ci-check` command that compares the fresh
   run to the previous indexed run and fails CI beyond thresholds.
5. **UI trend surface**: `/benchmarks` route with score/cost/speedup trend charts,
   backed by `GET /api/benchmarks/history` reading a new `benchmarkRuns` Drizzle table
   populated by an import step from `index.json`. SSE is not needed (data changes
   weekly, plain fetch suffices).

### Non-Goals

- Running benchmarks on every PR (cost; see §5.1 triggers).
- Statistical rigor beyond the existing single-iteration + threshold model (the
  harness supports `--iterations`; CI defaults to 1 for cost).
- Publicly hosted dashboards; `/benchmarks` is local-app UI only.
- Re-architecting the harness. This TRD adds CI plumbing, budget guards, one CLI
  command, one workflow, one table, one API route, one page.

---

## 2. Current State (file-cited)

- **Harness**: `packages/benchmarks/src/` — runner (`runner/index.ts`,
  `baseline-executor.ts`, `devpilot-executor.ts`, `environment.ts`,
  `process-manager.ts`), metrics (`collector.ts`, `cost-calculator.ts`,
  `token-tracker.ts`, `timeline.ts`), analysis (`scoring.ts`, `comparator.ts`,
  `trend.ts`, `wave-analyzer.ts`), storage (`results-writer.ts`, `history-reader.ts`,
  `version-tagger.ts`), reporters (console/markdown/json), CLI (`cli/run.ts`,
  `compare.ts`, `history.ts`, `report.ts`, `list.ts`, `validate.ts`). Package bin:
  `devpilot-bench` (`packages/benchmarks/package.json`). Spawns the `claude` CLI as a
  subprocess.
- **Timeout fail-safe (verified)**: `runner/process-manager.ts` implements
  per-process `timeoutMs` → `SIGTERM`, then `SIGKILL` if still alive; default flows
  from `cli/run.ts` `--timeout <minutes>` (default 10) and
  `config.ts` `execution.timeoutMinutes` default 10 (`SCORING_CONSTANTS.MAX_TIME_MS`
  = 10 min). So the 10-minute runaway kill exists; what's missing is a *budget* kill
  (tokens/cost), which this TRD adds.
- **Config**: `packages/benchmarks/src/config.ts` — zod `BenchmarkConfigSchema`
  (module-based config file via dynamic `import()` in `loadConfig`, **not** YAML),
  `RunConfigSchema`, env overrides in `loadEnvConfig()` (`BENCH_RESULTS_DIR`,
  `BENCH_TIMEOUT`, `BENCH_MODEL`, `RUFLO_URL`, `RUFLO_API_KEY`, `AO_PROJECT_NAME`).
  **Known inconsistency**: `BenchmarkIdSchema` enumerates codenames
  (`01-forgepress`, `02-taskforge`, `03-insightboard`) while `cli/run.ts` defaults to
  directory names (`01-cli-static-site-gen`, `02-rest-api-task-manager`,
  `03-react-analytics-dashboard`) matching `/home/user/devpilot/benchmarks/*`
  (`benchmarks/README.md` maps codename ↔ directory). Any ID passed through
  `RunConfigSchema.parse` with directory names would fail; must be normalized before
  CI wires flags through (BC-W1-T1).
- **Results layout**: `storage/results-writer.ts` +
  `storage/version-tagger.ts` write
  `benchmarks/results/<version>/<timestamp>/run-manifest.json` (+ per-benchmark
  `comparison.json`, `wave-analysis.json`) and a `latest` symlink;
  `storage/history-reader.ts` reads them (`listVersions`, `getTrendDataPoints`,
  `getLatestRun`, `readComparison`, `getOverallStatistics`).
- **Analysis**: `analysis/comparator.ts` `Comparator.compare(baseline, devpilot,
  waveAnalysis?) → ComparisonResult { speedup, costReduction, timeReductionMs/%,
  costReductionUsd, qualityDelta, tokenEfficiency, wavePlanScore,
  compositeAdvantage }`; `analysis/trend.ts` `TrendAnalyzer.analyze(benchmarkId,
  VersionDataPoint[]) → TrendAnalysis` with `latestDelta { speedupChange, costChange,
  scoreChange }` and 5% `TREND_THRESHOLD`. Composite scoring weights in `config.ts`
  (acceptance 30%, wave-plan 25%, first-attempt 20%, time 15%, rework 10%).
- **Existing CI**: `.github/workflows/ci.yml` — pnpm 8 / node 20, `pnpm install`,
  `pnpm run build`, soft-fails typecheck/lint/test. `publish.yml` also exists. No
  benchmark workflow.
- **DB/UI**: Drizzle schema conventions in `packages/core/src/db/schema/*` with
  embedded DDL in `packages/core/src/db/adapters/sqlite.ts` (must be extended for any
  new table; `pnpm run db:check-sync` guards drift). The Next app already depends on
  `recharts` (root `package-lock.json`) though no chart component uses it yet —
  `/benchmarks` will be its first consumer. Pages live under `src/app/(main)/`.

---

## 3. Architecture

```
GitHub Actions (.github/workflows/benchmarks.yml)
  triggers: workflow_dispatch · cron (weekly) · push tags v*
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│ job: bench  (matrix: benchmark ∈ {01,02,03})                  │
│  checkout → pnpm install → build → install `claude` CLI       │
│  devpilot-bench run -b <id> [-s baseline,devpilot]            │
│      env: ANTHROPIC_API_KEY, BENCH_MAX_COST_USD, BENCH_*      │
│      per-scenario 10-min SIGTERM/SIGKILL (process-manager)    │
│  upload-artifact: benchmarks/results/                         │
└──────────────┬────────────────────────────────────────────────┘
               ▼
┌───────────────────────────────────────────────────────────────┐
│ job: gate (needs: bench)                                      │
│  download artifacts → devpilot-bench index-update             │
│    (storage/index-writer.ts → benchmarks/results/index.json)  │
│  devpilot-bench ci-check                                      │
│    (analysis/regression.ts: latest vs previous index entry;   │
│     fail on score −5 / cost +25% / passRate −10pp)            │
│  commit index.json to main  ([skip ci], cron+tag runs only)   │
└──────────────┬────────────────────────────────────────────────┘
               ▼
┌───────────────────────────────────────────────────────────────┐
│ Next app                                                      │
│  POST /api/benchmarks/import  ◄─ reads index.json → DB        │
│  GET  /api/benchmarks/history ─► benchmark_runs table         │
│        (lazy import-on-read when table is behind index.json)  │
│  /benchmarks page: TrendChart (score · cost · speedup),       │
│  RunsTable, per-benchmark filter — recharts, plain fetch      │
└───────────────────────────────────────────────────────────────┘
```

**Storage decision — artifacts + committed `index.json` (chosen)** over a dedicated
results branch: full result trees (workspaces, manifests, per-benchmark JSON) are tens
of MB per run and would bloat any branch permanently; artifacts hold them for 90 days
which covers debugging needs. The trend series the UI and `ci-check` need is ~300
bytes per run, so a single committed `benchmarks/results/index.json` keeps the repo
lean, survives artifact expiry, is diffable in PRs, and needs no extra branch
plumbing or checkout tricks. A results branch adds clone weight and merge ceremony
for no additional capability.

---

## 4. Data Model

### 4.1 `benchmarks/results/index.json` (committed, canonical trend series)

```json
{
  "schemaVersion": 1,
  "entries": [
    {
      "runId": "run-20260719-0612",
      "version": "v0.1.0-42-gabc1234",
      "gitCommit": "abc1234",
      "timestamp": "2026-07-19T06:12:00Z",
      "trigger": "cron",
      "ciRunUrl": "https://github.com/openconjecture/devpilot/actions/runs/123",
      "benchmarks": [
        {
          "benchmarkId": "01-cli-static-site-gen",
          "compositeScore": 82.4,
          "speedup": 1.9,
          "costReduction": 0.31,
          "passRate": 0.92,
          "wallClockMs": 412000,
          "totalCostUsd": 1.84,
          "totalTokens": 512000
        }
      ]
    }
  ]
}
```

Entries append-only, sorted by timestamp, capped at 200 (oldest dropped — artifacts
retain the originals for their window). Fields map 1:1 from `RunManifest` /
`VersionDataPoint` (`storage/history-reader.ts:getTrendDataPoints`) plus
`totalCostUsd`/`totalTokens` from the devpilot `ScenarioResult`.

### 4.2 Drizzle table — new file `packages/core/src/db/schema/benchmarks.ts`

Exported from `packages/core/src/db/schema/index.ts`; conventions per
`schema/fleet.ts` (cuid2 ids, timestamp-mode integers, json-mode text).

```ts
import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';

export const benchmarkRuns = sqliteTable(
  'benchmark_runs',
  {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    /** Run identifier from index.json (one row per run × benchmark) */
    runId: text('run_id').notNull(),
    benchmarkId: text('benchmark_id').notNull(), // '01-cli-static-site-gen' | ...
    version: text('version').notNull(),          // git-describe string
    gitCommit: text('git_commit'),
    trigger: text('trigger', { enum: ['cron', 'tag', 'manual', 'local'] as const })
      .notNull().default('local'),
    ciRunUrl: text('ci_run_url'),
    compositeScore: real('composite_score').notNull(),
    speedup: real('speedup').notNull().default(1),
    costReduction: real('cost_reduction').notNull().default(0),
    passRate: real('pass_rate').notNull().default(0),
    wallClockMs: integer('wall_clock_ms'),
    totalCostUsd: real('total_cost_usd'),
    totalTokens: integer('total_tokens'),
    ranAt: integer('ran_at', { mode: 'timestamp' }).notNull(),
    importedAt: integer('imported_at', { mode: 'timestamp' })
      .notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    runBenchmarkUnique: uniqueIndex('idx_benchmark_runs_run_benchmark')
      .on(t.runId, t.benchmarkId),
    benchmarkRanAtIdx: index('idx_benchmark_runs_benchmark_ran_at')
      .on(t.benchmarkId, t.ranAt),
  })
);

export type BenchmarkRunRow = typeof benchmarkRuns.$inferSelect;
export type NewBenchmarkRunRow = typeof benchmarkRuns.$inferInsert;
```

**sqlite adapter DDL** — append to `createTableStatements` in
`packages/core/src/db/adapters/sqlite.ts`:

```sql
CREATE TABLE IF NOT EXISTS benchmark_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  benchmark_id TEXT NOT NULL,
  version TEXT NOT NULL,
  git_commit TEXT,
  trigger TEXT NOT NULL DEFAULT 'local' CHECK(trigger IN ('cron','tag','manual','local')),
  ci_run_url TEXT,
  composite_score REAL NOT NULL,
  speedup REAL NOT NULL DEFAULT 1,
  cost_reduction REAL NOT NULL DEFAULT 0,
  pass_rate REAL NOT NULL DEFAULT 0,
  wall_clock_ms INTEGER,
  total_cost_usd REAL,
  total_tokens INTEGER,
  ran_at INTEGER NOT NULL,
  imported_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_benchmark_runs_run_benchmark
  ON benchmark_runs(run_id, benchmark_id);
CREATE INDEX IF NOT EXISTS idx_benchmark_runs_benchmark_ran_at
  ON benchmark_runs(benchmark_id, ran_at);
```

Import is idempotent by the `(run_id, benchmark_id)` unique index.

---

## 5. API Surface

### 5.1 CI workflow — `.github/workflows/benchmarks.yml`

```yaml
name: Benchmarks

on:
  workflow_dispatch:
    inputs:
      benchmarks: { description: 'Comma list (default all)', default: '01-cli-static-site-gen,02-rest-api-task-manager,03-react-analytics-dashboard' }
      scenarios:  { description: 'baseline,devpilot', default: 'baseline,devpilot' }
      iterations: { description: 'Iterations per scenario', default: '1' }
  schedule:
    - cron: '0 6 * * 1'          # weekly, Monday 06:00 UTC
  push:
    tags: ['v*']

concurrency:
  group: benchmarks
  cancel-in-progress: false       # never kill a paid run mid-flight

jobs:
  bench:
    runs-on: ubuntu-latest
    timeout-minutes: 90           # 2 scenarios × 10-min ceiling × iterations + slack
    strategy:
      fail-fast: false
      matrix:
        benchmark: [01-cli-static-site-gen, 02-rest-api-task-manager, 03-react-analytics-dashboard]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with: { version: 8 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install
      - run: pnpm run build
      - name: Install Claude CLI
        run: npm install -g @anthropic-ai/claude-code && claude --version
      - name: Run benchmark
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          BENCH_MAX_COST_USD: '5'          # per-scenario budget kill (§6.2)
          BENCH_MAX_TOKENS: '2000000'
          BENCH_TIMEOUT: '10'
        run: >
          node packages/benchmarks/dist/cli.js run
          -b ${{ matrix.benchmark }}
          -s ${{ inputs.scenarios || 'baseline,devpilot' }}
          -n ${{ inputs.iterations || 1 }}
          --timeout 10 --no-archive
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: bench-results-${{ matrix.benchmark }}-${{ github.run_id }}
          path: benchmarks/results/
          retention-days: 90

  gate:
    needs: bench
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
        with: { token: ${{ secrets.GITHUB_TOKEN }} }
      # pnpm/node/build steps as above
      - uses: actions/download-artifact@v4
        with: { path: benchmarks/results/, merge-multiple: true }
      - name: Update results index
        run: node packages/benchmarks/dist/cli.js index-update --ci-run-url "${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}" --trigger "${{ github.event_name == 'schedule' && 'cron' || github.event_name == 'push' && 'tag' || 'manual' }}"
      - name: Regression check
        run: node packages/benchmarks/dist/cli.js ci-check
      - name: Commit index
        if: github.event_name != 'workflow_dispatch'
        run: |
          git config user.name "devpilot-bench-bot"
          git config user.email "bench-bot@openconjecture.com"
          git add benchmarks/results/index.json
          git diff --cached --quiet || git commit -m "bench: record run for ${{ github.sha }} [skip ci]"
          git push origin HEAD:main
```

Secrets: only `ANTHROPIC_API_KEY` (repository secret). `GITHUB_TOKEN` default
permissions plus `contents: write` on the `gate` job.

### 5.2 New CLI commands (registered in `packages/benchmarks/src/cli/index.ts`)

- `devpilot-bench index-update [--results-dir <p>] [--index <p>] [--ci-run-url <u>] [--trigger cron|tag|manual|local]`
  — reads the latest run via `HistoryReader.getLatestRun()`, appends an §4.1 entry,
  rewrites `index.json` (cap 200). Exit 0 even when there is nothing new (no-op).
- `devpilot-bench ci-check [--index <p>] [--score-drop 5] [--cost-increase 0.25] [--passrate-drop 0.10]`
  — compares the newest index entry to the previous entry **per benchmarkId** and
  exits non-zero with a markdown table on stdout when any threshold trips (§6.3).
  Missing previous entry ⇒ pass with "baseline established" notice.

### 5.3 Next app routes

**`GET /api/benchmarks/history`** — new `src/app/api/benchmarks/history/route.ts`.
Query: `benchmarkId?` (filter), `limit?` (default 50). Behavior: if
`benchmark_runs` has fewer entries than `benchmarks/results/index.json` (checked via
count vs entry count), lazily runs the import (§6.4) first, then queries.

```json
{
  "runs": [
    {
      "runId": "run-20260719-0612", "benchmarkId": "01-cli-static-site-gen",
      "version": "v0.1.0-42-gabc1234", "trigger": "cron",
      "compositeScore": 82.4, "speedup": 1.9, "costReduction": 0.31,
      "passRate": 0.92, "totalCostUsd": 1.84, "ranAt": "2026-07-19T06:12:00Z",
      "ciRunUrl": "https://..."
    }
  ],
  "benchmarks": ["01-cli-static-site-gen", "02-rest-api-task-manager", "03-react-analytics-dashboard"],
  "latest": { "runId": "...", "avgCompositeScore": 79.8 }
}
```

Errors: `500 { "error": "Failed to load benchmark history" }`. Empty state: `runs: []`
(200, never 404).

**`POST /api/benchmarks/import`** — new `src/app/api/benchmarks/import/route.ts`.
Body: `{ "indexPath"?: string }` (defaults to `benchmarks/results/index.json` under
`WORKING_DIR`/cwd). Upserts rows idempotently. Response
`200 { "imported": 6, "skipped": 42 }`; `404 { "error": "index.json not found" }`;
`400` on schema-version mismatch.

No SSE: benchmark data changes at most weekly; the page fetches on mount.

---

## 6. Core Services

### 6.1 `packages/benchmarks/src/storage/index-writer.ts` (new)

```ts
export interface BenchIndexEntry { /* exactly §4.1 entry shape */ }
export interface BenchIndex { schemaVersion: 1; entries: BenchIndexEntry[] }

export class IndexWriter {
  constructor(opts: { resultsDir: string; indexPath?: string; maxEntries?: number });
  /** Build an entry from a RunManifest (uses version-tagger fields already present). */
  entryFromManifest(manifest: RunManifest, meta: { ciRunUrl?: string; trigger?: string }): BenchIndexEntry;
  /** Append + dedupe by runId + cap + atomic write (tmp file + rename). */
  async append(entry: BenchIndexEntry): Promise<void>;
  async read(): Promise<BenchIndex>;   // returns empty index when file absent
}
export function createIndexWriter(opts: ...): IndexWriter;
```

Exported from `packages/benchmarks/src/storage/index.ts`.

### 6.2 Budget guard — `packages/benchmarks/src/runner/budget.ts` (new)

```ts
export interface BudgetConfig {
  maxCostUsd?: number;    // env BENCH_MAX_COST_USD
  maxTokens?: number;     // env BENCH_MAX_TOKENS
  checkIntervalMs?: number; // default 15_000
}
export class BudgetGuard {
  constructor(config: BudgetConfig, tracker: TokenTracker, costCalc: CostCalculator);
  /** Start watching; invokes onExceeded exactly once when a limit trips. */
  start(onExceeded: (reason: 'cost' | 'tokens', value: number) => void): void;
  stop(): void;
}
```

Wired in `runner/index.ts`: each scenario run instantiates a `BudgetGuard` over the
existing `metrics/token-tracker.ts` counters; `onExceeded` calls the scenario's
`ProcessManager.kill()` (which already escalates SIGTERM→SIGKILL) and marks the
`ScenarioResult` failed with `failureReason: 'budget_exceeded'` (new optional field on
`ScenarioResult` in `packages/benchmarks/src/types.ts`). The existing 10-minute
timeout remains the outer fail-safe.

### 6.3 Regression checker — `packages/benchmarks/src/analysis/regression.ts` (new)

```ts
export interface RegressionThresholds {
  maxScoreDrop: number;        // default 5 (composite points)
  maxCostIncrease: number;     // default 0.25 (fraction of prior totalCostUsd)
  maxPassRateDrop: number;     // default 0.10 (absolute)
}
export interface RegressionFinding {
  benchmarkId: string;
  metric: 'compositeScore' | 'totalCostUsd' | 'passRate';
  previous: number; current: number; delta: number; threshold: number;
}
export interface RegressionReport {
  pass: boolean;
  findings: RegressionFinding[];
  baselineEstablished: boolean;  // true when no previous entry existed
  summaryMarkdown: string;
}
export function checkRegression(
  index: BenchIndex,
  thresholds?: Partial<RegressionThresholds>
): RegressionReport;
```

Uses only the index (not raw manifests) so the gate job needs no artifact parsing
beyond `index-update`; `TrendAnalyzer`/`Comparator` remain the richer analysis for the
`compare`/`history` CLI commands and the UI. Rationale for defaults: composite scores
observed to vary a few points between identical runs (single iteration), so 5 points
≈ the 5% `TREND_THRESHOLD` in `analysis/trend.ts`; 25% cost headroom absorbs pricing
and token variance; a 10 pp acceptance pass-rate drop is always a genuine regression.

### 6.4 Import service — `src/lib/benchmarks/import.ts` (new, Next app)

```ts
export async function importBenchmarkIndex(indexPath?: string): Promise<{ imported: number; skipped: number }>;
```

Reads §4.1 JSON, flattens `entries[].benchmarks[]` to rows, inserts with
conflict-ignore on `(run_id, benchmark_id)`. Used by both the import route and the
lazy path in the history route.

### 6.5 ID normalization fix (precondition, BC-W1-T1)

`packages/benchmarks/src/config.ts` `BenchmarkIdSchema` is changed to the directory
names used everywhere else (`01-cli-static-site-gen`, `02-rest-api-task-manager`,
`03-react-analytics-dashboard`), with the codenames accepted as aliases via a
`normalizeBenchmarkId()` helper exported from `config.ts` and applied in
`cli/run.ts` option parsing. This unblocks passing matrix values straight through CI.

---

## 7. UI

### Page — `src/app/(main)/benchmarks/page.tsx` (new)

Client page ('use client'), fetches `/api/benchmarks/history` on mount. Layout:
header row (title, benchmark filter chips, latest-run badge with CI link) → three
`TrendChart` cards in a responsive grid → `BenchmarkRunsTable`.

### Components — `src/components/benchmarks/` (new folder + barrel `index.ts`)

| Component | Props | Behavior |
|---|---|---|
| `TrendChart.tsx` | `{ title: string; data: { ranAt: string; value: number; version: string }[]; format: 'score' \| 'percent' \| 'multiplier'; color: string }` | recharts `LineChart` (first recharts consumer in the app; dep already installed): x = run time, y = metric, dot per run, tooltip with version + value, reference line at previous value. Renders three instances: composite score (0–100), cost reduction (%), speedup (×). |
| `BenchmarkRunsTable.tsx` | `{ runs: BenchmarkHistoryRun[] }` | Sortable table: run, version, trigger badge, per-benchmark score, cost, pass rate, link to `ciRunUrl`. Reuses `Card`, `RepoBadge`-style badges from `src/components/ui`. |
| `BenchmarkFilterChips.tsx` | `{ benchmarks: string[]; active: string \| null; onChange: (id: string \| null) => void }` | `Chip`/`ChipGroup` toggles; `null` = all (charts then plot per-benchmark series with a legend). |

### States

- **Loading**: skeleton cards.
- **Empty** (`runs: []`): explainer card — "No benchmark runs recorded yet. Runs land
  weekly via CI or `devpilot-bench run` locally, then `POST /api/benchmarks/import`."
  with an "Import now" button hitting the import route.
- **Error**: inline retry banner.
- **Nav**: add a "Benchmarks" link to the app navigation in
  `src/app/(main)/layout.tsx`.

---

## 8. Config

Env vars (harness, all optional):

| Var | Default | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Required for any real run (CI secret) |
| `BENCH_MAX_COST_USD` | unset (off) | Per-scenario cost budget → kill (new) |
| `BENCH_MAX_TOKENS` | unset (off) | Per-scenario token budget → kill (new) |
| `BENCH_TIMEOUT` | `10` | Minutes per scenario (existing, `loadEnvConfig`) |
| `BENCH_RESULTS_DIR` | `./benchmarks/results` | Existing |
| `BENCH_MODEL` | `sonnet` | Existing baseline model |
| `BENCH_INDEX_PATH` | `<resultsDir>/index.json` | New: index location override |

`loadEnvConfig()` in `packages/benchmarks/src/config.ts` gains the three new keys.
Config-file users (module config via `loadConfig`) get a new optional `budget:
{ maxCostUsd?, maxTokens? }` block in `BenchmarkConfigSchema` (env wins). No YAML —
the harness config format is TS/JS modules today and stays that way.

---

## 9. Error Handling & Edge Cases

1. **`claude` CLI missing/incompatible in CI**: install step runs `claude --version`;
   run step fails fast with a clear log rather than a 10-min hang per scenario.
2. **API key exhausted / 429 storms**: scenario fails, matrix `fail-fast: false`
   lets sibling benchmarks finish; `ci-check` treats a missing benchmark entry in the
   new run as a finding (`current = 0`) only when the previous entry had it — a fully
   failed run fails the gate loudly, not silently.
3. **Runaway process**: 10-min SIGTERM→SIGKILL (verified in `process-manager.ts`),
   plus BudgetGuard kill, plus job-level `timeout-minutes: 90` as the last resort.
4. **Concurrent runs racing the index commit**: `concurrency.group: benchmarks`
   serializes workflows; `IndexWriter.append` is atomic (tmp+rename) for local use.
5. **Index/commit push rejected** (main moved): gate job retries `git pull --rebase`
   once; on second failure the run stays green-with-warning (results are still in
   artifacts) — regression gating already ran before the commit step.
6. **`workflow_dispatch` runs don't commit** the index (see `if:` guard) so ad-hoc
   experiments never pollute the trend series; their results remain in artifacts.
7. **Dirty-tree local runs**: `version-tagger.ts` marks dirty versions;
   `index-update --trigger local` entries are tagged `local` and the UI badges them —
   `ci-check` ignores `local` entries when picking "previous".
8. **Schema drift**: `schemaVersion` in index.json; import route 400s on unknown
   versions instead of mis-importing.
9. **Clock skew across runners**: ordering uses the manifest timestamp written by the
   run itself; entries append in workflow order regardless.
10. **Missing previous entry per benchmark** (new benchmark added): baseline
    established, gate passes with notice.

---

## 10. Testing Strategy

- **Unit (harness, vitest)**:
  - `storage/__tests__/index-writer.test.ts` — append/dedupe/cap/atomic write, entry
    mapping from a fixture `RunManifest`.
  - `analysis/__tests__/regression.test.ts` — each threshold trips independently;
    baseline-established path; `local`-entry skipping; markdown summary snapshot.
  - `runner/__tests__/budget.test.ts` — fake tracker crossing cost then token
    limits, single-fire `onExceeded`, kill invoked.
  - `config` test for `normalizeBenchmarkId` (codename ↔ directory).
- **CLI smoke**: `devpilot-bench index-update` + `ci-check` against fixture results
  dirs (no API calls) in the existing CI `test` step.
- **Workflow validation**: `actionlint` (or `--dry-run` job) is out of scope for CI
  itself; validate by a `workflow_dispatch` run with
  `scenarios=baseline`, `benchmarks=01-cli-static-site-gen` as the cheapest live
  smoke (single scenario, ~$1).
- **Next app**: route tests for history (lazy import path, filter, empty) and import
  (idempotency, 404, schema-version 400); component tests for `TrendChart` (series
  mapping) and empty state; `pnpm run db:check-sync` covers the new DDL.

---

## 11. Acceptance Criteria

- **BC-AC-01**: `benchmarks.yml` exists with exactly three triggers
  (workflow_dispatch with benchmark/scenario/iteration inputs, weekly cron, `v*`
  tags) and no `pull_request` trigger.
- **BC-AC-02**: A dispatch run executes the 3-benchmark matrix, each job bounded by
  `timeout-minutes: 90`, and uploads `benchmarks/results/` artifacts with 90-day
  retention even on failure (`if: always()`).
- **BC-AC-03**: `ANTHROPIC_API_KEY` is consumed only from repository secrets; grep of
  the workflow shows no inline keys; logs do not echo the key.
- **BC-AC-04**: With `BENCH_MAX_COST_USD=0.01`, a run is killed within one
  check interval, the scenario result is marked `budget_exceeded`, and the process
  tree is dead (no orphan `claude` processes).
- **BC-AC-05**: `devpilot-bench index-update` after a completed run appends exactly
  one entry per run to `benchmarks/results/index.json` matching §4.1, idempotent on
  re-run.
- **BC-AC-06**: `devpilot-bench ci-check` exits non-zero when the latest entry's
  compositeScore is >5 points below the previous non-local entry for any benchmark,
  or totalCostUsd is >25% higher, or passRate dropped >10 pp; exits zero with
  "baseline established" when no previous entry exists.
- **BC-AC-07**: Scheduled and tag runs commit only `benchmarks/results/index.json` to
  main with `[skip ci]`; manual runs commit nothing.
- **BC-AC-08**: `POST /api/benchmarks/import` loads index entries into
  `benchmark_runs` idempotently (second call: `imported: 0`).
- **BC-AC-09**: `GET /api/benchmarks/history?benchmarkId=01-cli-static-site-gen`
  returns only that benchmark's rows, newest first, and lazily imports when the table
  is behind the index file.
- **BC-AC-10**: `/benchmarks` renders three trend charts (score, cost reduction,
  speedup) and the runs table from live API data; empty DB shows the import CTA; the
  nav link exists.
- **BC-AC-11**: `-b 01-forgepress` and `-b 01-cli-static-site-gen` both resolve to
  the same benchmark (ID normalization), and `RunConfigSchema` accepts the
  normalized IDs.
- **BC-AC-12**: `pnpm run db:check-sync` passes with the `benchmark_runs` DDL.

---

## 12. Implementation Plan

### Wave BC-W1 — Harness Hardening (all independent)

- **BC-W1-T1 — Benchmark ID normalization**
  Files: `packages/benchmarks/src/config.ts`, `packages/benchmarks/src/cli/run.ts`
  Change `BenchmarkIdSchema` to directory IDs, add `normalizeBenchmarkId()` accepting
  codename aliases, apply in run-command option parsing, keep `toRunConfig` behavior
  otherwise identical. Deps: none. Complexity: **S**.
  Done-check: BC-AC-11 unit test passes; `devpilot-bench run --dry-run -b 01-forgepress`
  prints the directory ID.
- **BC-W1-T2 — BudgetGuard**
  Files: `packages/benchmarks/src/runner/budget.ts` (new),
  `packages/benchmarks/src/runner/index.ts`, `packages/benchmarks/src/types.ts`
  Implement §6.2; add `failureReason?: 'timeout' | 'budget_exceeded' | 'error'` to
  `ScenarioResult`; wire guard start/stop around scenario execution. Deps: none.
  Complexity: **M**. Done-check: budget unit test passes (BC-AC-04 logic).
- **BC-W1-T3 — IndexWriter + CLI command**
  Files: `packages/benchmarks/src/storage/index-writer.ts` (new),
  `packages/benchmarks/src/storage/index.ts`,
  `packages/benchmarks/src/cli/index-update.ts` (new)
  Implement §6.1 and the `index-update` command per §5.2. Deps: none.
  Complexity: **M**. Done-check: BC-AC-05 test passes against fixture results dir.
- **BC-W1-T4 — Regression checker + CLI command**
  Files: `packages/benchmarks/src/analysis/regression.ts` (new),
  `packages/benchmarks/src/analysis/index.ts`,
  `packages/benchmarks/src/cli/ci-check.ts` (new)
  Implement §6.3 and the `ci-check` command per §5.2 (thresholds as flags, markdown
  summary to stdout, exit codes). Deps: none. Complexity: **M**.
  Done-check: BC-AC-06 tests pass.
- **BC-W1-T5 — Env/config additions**
  Files: none beyond `packages/benchmarks/src/cli/index.ts`
  Register `index-update` and `ci-check` commands in the CLI program; (note:
  `BENCH_MAX_*` env reads live inside budget.ts from BC-W1-T2 and
  `BENCH_INDEX_PATH` inside index-writer.ts from BC-W1-T3, keeping this task
  file-disjoint). Deps: none (imports land in W1 but registration compiles against
  their declared exports). Complexity: **S**.
  Done-check: `devpilot-bench --help` lists both commands.

### Wave BC-W2 — CI & Schema

- **BC-W2-T1 — benchmarks.yml workflow**
  Files: `.github/workflows/benchmarks.yml` (new)
  Implement §5.1 verbatim (triggers, matrix, concurrency, claude install, budget env,
  artifact upload, gate job with index-update, ci-check, guarded commit). Deps: all
  BC-W1. Complexity: **M**.
  Done-check: BC-AC-01/02/03/07 review; one baseline-only dispatch run goes green.
- **BC-W2-T2 — benchmarkRuns Drizzle table**
  Files: `packages/core/src/db/schema/benchmarks.ts` (new),
  `packages/core/src/db/schema/index.ts`,
  `packages/core/src/db/adapters/sqlite.ts`
  Implement §4.2 schema + DDL + barrel export. Deps: none (parallel with T1).
  Complexity: **S**. Done-check: BC-AC-12; typecheck green.

### Wave BC-W3 — Next App API

- **BC-W3-T1 — Import service + route**
  Files: `src/lib/benchmarks/import.ts` (new),
  `src/app/api/benchmarks/import/route.ts` (new)
  Implement §6.4 and the POST route (§5.3): default path resolution via
  `WORKING_DIR`/cwd, conflict-ignore upsert, 404/400 handling. Deps: BC-W2-T2,
  BC-W1-T3 (index shape). Complexity: **M**. Done-check: BC-AC-08 route test passes.
- **BC-W3-T2 — History route**
  Files: `src/app/api/benchmarks/history/route.ts` (new)
  Implement §5.3 GET with lazy import (calls `importBenchmarkIndex` from BC-W3-T1's
  module — cross-wave dependency satisfied; within this wave the two tasks touch
  disjoint files and T2 codes against T1's declared export). Deps: BC-W2-T2.
  Complexity: **M**. Done-check: BC-AC-09 route test passes.

### Wave BC-W4 — UI

- **BC-W4-T1 — Chart + table components**
  Files: `src/components/benchmarks/TrendChart.tsx` (new),
  `src/components/benchmarks/BenchmarkRunsTable.tsx` (new),
  `src/components/benchmarks/BenchmarkFilterChips.tsx` (new),
  `src/components/benchmarks/index.ts` (new)
  Implement §7 components with recharts, design tokens, loading/empty variants driven
  by props. Deps: BC-W3-T2 (response shape). Complexity: **M**.
  Done-check: component tests render fixture series; visual check in Storybook-less
  dev page acceptable.
- **BC-W4-T2 — /benchmarks page + nav**
  Files: `src/app/(main)/benchmarks/page.tsx` (new), `src/app/(main)/layout.tsx`
  Page fetch/compose per §7, empty-state import CTA, nav link. Deps: BC-W3-T2 (and
  BC-W4-T1 exports — page codes against the barrel; tasks touch disjoint files).
  Complexity: **M**. Done-check: BC-AC-10 manually verified against imported fixture
  index; route test for page data mapping passes.

Total: 4 waves, 11 tasks.
