# TRD 11 — Dispatch Cost Budgets
## Runtime Token/Cost Tracking, Budget Caps & Enforcement · v1.0 · July 2026 · Status: DRAFT

> **Depends on: Tiers 1–3 (`spec/trd/01-TIER1-EXECUTION-LOOP.md`,
> `spec/trd/02-TIER2-SPEC-COMPLETION.md`, `spec/trd/03-TIER3-HARDENING.md`)** —
> specifically:
> - **01 (hard dependency)**: real wave dispatch —
>   `WaveDispatchCoordinator.dispatchToOrchestrator()` actually dispatches via
>   `OrchestratorService`; `CompletionListener` is wired; the orchestrator is
>   initialized in the Next app so `/api/orchestrator/status` and
>   `/api/orchestrator/complete` callbacks flow; pause/resume routes exist at
>   `/api/wave-plans/[planId]/pause|resume` (the `pause-plan` breach action
>   calls them). This TRD **extends** the status/completion callback contract
>   with structured usage data (§7.6). Do not start until 01 has landed.
> - **02 (soft dependency)**: Conductor Score completion work — the
>   `costEfficiency` recomputation in §7.8 plugs into whatever scoring site
>   Tier 2 establishes; if 02 has not landed, ship the ledger-backed formula as
>   a standalone function and leave the wiring task open.

---

## Table of Contents

1. [Problem Statement & Goals](#1-problem-statement--goals)
2. [Current State](#2-current-state)
3. [Architecture](#3-architecture)
4. [Data Model](#4-data-model)
5. [Enforcement Semantics](#5-enforcement-semantics)
6. [API Surface](#6-api-surface)
7. [Core Services](#7-core-services)
8. [UI](#8-ui)
9. [Configuration](#9-configuration)
10. [Error Handling & Edge Cases](#10-error-handling--edge-cases)
11. [Testing Strategy](#11-testing-strategy)
12. [Acceptance Criteria](#12-acceptance-criteria)
13. [Implementation Plan](#13-implementation-plan)

---

## 1. Problem Statement & Goals

### Problem Statement

After Tier 1, DevPilot really spends money: every dispatched wave task runs a
model-backed agent session, and a single approved plan can fan out dozens of
parallel sessions. Today the platform *estimates* cost before execution
(`plans.estimated_cost_usd`, `tasks.estimated_cost_usd` — real columns, see
`packages/core/src/db/adapters/sqlite.ts:32-33,61`) and *receives* actual usage
after the fact (`CompletionReport.tokensUsed`/`costUsd`,
`packages/core/src/orchestrator/types.ts:62-63`; `StatusUpdate.tokensUsed`,
`types.ts:46`), but nothing in the runtime aggregates spend, compares it to
anything, or stops dispatching when a limit is crossed. The only real
token→USD machinery in the repo lives in the **benchmarks package**
(`packages/benchmarks/src/metrics/token-tracker.ts`, `cost-calculator.ts`)
where it scores offline runs — the runtime can't use it, and the roadmap
explicitly calls for promoting it (`docs/ROADMAP.md` item 16).

A conductor running multiple concurrent plans has no answer to "how much has
this plan spent so far?", no warning before a runaway wave burns budget, and no
mechanism to cap spend per plan or per month.

### Goals

1. **Promote token/cost tracking to runtime**: a `packages/core/src/cost/`
   module with a model pricing table, token→USD calculator, and a persistent
   session cost ledger fed by orchestrator status/completion callbacks.
2. **Budget primitive**: `costBudgets` with three scopes — a single wave plan
   (`plan`), a horizon item (`item`, covers all plan versions of that item),
   and a `global-monthly` rolling window — each with `capUsd`, a soft
   threshold percentage, and a breach action.
3. **Enforcement**: soft-threshold warnings (SSE + assist notification), hard
   cap actions (`warn-only`, `pause-plan`, `block-new-dispatch`), pre-dispatch
   estimate checks against remaining budget, and mid-execution accumulation
   checks on every status callback.
4. **Surface**: `/api/budgets` CRUD + ledger API, budget summary embedded in
   `/api/fleet/state`, `budget:*` SSE events, TopBar budget pill, spend bar in
   the plan cost breakdown, and a budget settings surface.
5. **Feed the Conductor Score**: `costEfficiency` computed from real ledger
   data (actual vs estimated) instead of its static default.

### Non-Goals

- **Billing-grade accounting.** The ledger is an operational control signal
  derived from self-reported session usage; it is not reconciled against the
  Anthropic invoice. Pricing drift handling (§10.2) is best-effort.
- **Cancelling in-flight sessions on breach.** The strongest action pauses the
  plan / blocks new dispatch; already-running sessions complete (their residual
  spend is bounded and recorded). Kill-on-breach is future work.
- **Per-user / multi-tenant budgets.** DevPilot is single-conductor today
  (`conductorScores.userId` is a single row); budgets are workspace-global.
- **Budgeting the wave-planner's own AI calls** (plan generation via
  `wave-planner/ai-client.ts`). v1 meters dispatched agent sessions only; a
  `manual` ledger source exists so planner spend can be back-filled later.
- **Currency other than USD.**

---

## 2. Current State

All file references verified against the repo as of July 2026.

| Concern | Where it stands today |
|---|---|
| Benchmark-only tracking | `packages/benchmarks/src/metrics/token-tracker.ts`: `TokenTracker` aggregates `TokenUsage { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, totalTokens }` by session/model, parses CLI output, and has `recordFromCompletionReport()`. `cost-calculator.ts`: `CostCalculator` maps usage→USD via `ModelPricing { model, inputPer1M, outputPer1M, cacheReadPer1M, cacheWritePer1M }`, with `DEFAULT_MODEL_PRICING` in `packages/benchmarks/src/config.ts:40-61` (haiku 0.25/1.25, sonnet 3/15, opus 15/75 per 1M). Both are in-memory, benchmark-scoped, and unaware of the runtime DB. |
| Usage data in callbacks | `StatusUpdate.tokensUsed?: number` (`packages/core/src/orchestrator/types.ts:46`) — a single cumulative total, **no input/output split, no cache tokens, no model**. `CompletionReport` carries `tokensUsed: number` and `costUsd: number` (`types.ts:62-63`) — trusted-as-reported cost, no breakdown. **Contract extension required** (§7.6). |
| Session-level storage | `rufloSessions.tokensUsed` / `costUsd` columns exist (`packages/core/src/db/schema/fleet.ts:25-26`) — but `costUsd` is `integer('cost_usd')`, which silently truncates sub-dollar amounts (a $0.43 session stores as 0). `/api/orchestrator/complete` writes token/cost values onto `completedTasks` (`src/app/api/orchestrator/complete/route.ts:42-50`). No aggregation, no per-plan attribution. |
| Estimates | `plans.estimated_cost_usd REAL`, `plans.baseline_cost_usd REAL`, `tasks.estimated_cost_usd REAL` all real and populated (`sqlite.ts:32-33,61`); surfaced in `src/components/plan/CostBreakdown.tsx` (per-model counts, total, savings vs baseline). Nothing compares estimate to actual. |
| Ingestion hook points | `OrchestratorService.ingestStatusUpdate()` (`packages/core/src/orchestrator/service.ts:389-403`) and `ingestCompletionReport()` (`service.ts:410-416`) are the single funnel for pushed callbacks — the natural interception points for ledger writes. `WaveDispatchCoordinator.dispatchWave()` (`packages/core/src/wave-planner/execution/dispatch-coordinator.ts:34-117`) is the pre-dispatch checkpoint. |
| Score | `conductorScores.costEfficiency` is an integer defaulting to 100 (`packages/core/src/db/schema/score.ts:16`); nothing computes it from actual spend. |
| Fleet state | `/api/fleet/state` (`src/app/api/fleet/state/route.ts`) computes sessions/runway/utilization; no cost dimension. |
| TopBar | `src/components/topbar/TopBar.tsx` renders `ConductorScorePill` in the right-hand group — the budget pill's specified neighbor. |
| Schema DDL duplication | `packages/core/src/db/adapters/sqlite.ts:13-266` embeds `CREATE TABLE` DDL executed at startup — **all schema additions here must also update that DDL string**, including the `activity_events.type` CHECK (`sqlite.ts:156`). |

---

## 3. Architecture

```
   agent sessions ──POST──►  /api/orchestrator/status      /api/orchestrator/complete
                                     │                            │
                                     ▼                            ▼
                       OrchestratorService.ingestStatusUpdate / ingestCompletionReport
                                     │        (existing funnel, service.ts:389-416)
                                     │ usage payload (extended contract §7.6)
                                     ▼
     ┌───────────────────────── packages/core/src/cost/ ─────────────────────────┐
     │                                                                           │
     │  pricing.ts ──────► calculator.ts ──────► ledger.ts                       │
     │  (RuntimePricing     (tokens → USD,       (CostLedger: delta computation, │
     │   table + version)    breakdown)           costLedgerEntries writes,      │
     │                                            spend queries by scope)        │
     │                                                │                          │
     │                                                ▼                          │
     │                                          enforcer.ts                      │
     │                                          (BudgetEnforcer:                 │
     │                                           • onLedgerAppend → threshold/   │
     │                                             breach evaluation             │
     │                                           • checkPreDispatch)             │
     └───────┬──────────────────────────┬─────────────────┬──────────────────────┘
             │ pre-dispatch check       │ breach actions  │ BUDGET_* activity events
             ▼                          ▼                 ▼
   WaveDispatchCoordinator     WaveExecutionController   /api/events/stream
   .dispatchWave()             .pause() (Tier-1 route     (budget:* wire events)
   (block-new-dispatch)         path for pause-plan)
             │
             ▼                             ┌────────────────────────────────┐
   ┌──────────────────┐    /api/budgets*   │ UI: BudgetPill (TopBar),       │
   │ costBudgets      │◄──────────────────►│ SpendBar (CostBreakdown),      │
   │ costLedgerEntries│    /api/fleet/state│ BudgetSettingsPanel,           │
   └──────────────────┘     (summary)      │ budgetStore + useSSE           │
                                           └────────────────────────────────┘
```

### Component responsibilities

| Component | Responsibility |
|---|---|
| `cost/pricing.ts` | The runtime model pricing table (`RuntimeModelPricing`), a semver-ish `PRICING_VERSION` stamp, defaults matching the benchmark table, and loading/overriding from env/config. |
| `cost/calculator.ts` | Pure token→USD math with per-category breakdown. Runtime port of the benchmark `CostCalculator` (drops benchmark-only `SessionRecord`/`CostEntry` coupling). |
| `cost/ledger.ts` | `CostLedger`: converts cumulative status snapshots into **delta** ledger entries, records completion reconciliation entries, answers spend queries by scope (`plan` / `item` / `global-monthly` window / session). Owns the "estimated split" fallback when structured usage is missing. |
| `cost/enforcer.ts` | `BudgetEnforcer`: evaluates budgets on every ledger append (soft threshold, breach) and answers the pre-dispatch check; executes breach actions; de-duplicates notifications. |
| `OrchestratorService` (modified) | Calls `CostLedger.recordStatus/recordCompletion` inside `ingestStatusUpdate`/`ingestCompletionReport` before emitting events. |
| `WaveDispatchCoordinator` (modified) | Calls `BudgetEnforcer.checkPreDispatch` before dispatching each task; blocked tasks stay `pending` and a `budget:breach`-scoped event explains why. |
| Next routes | `/api/budgets` CRUD, `/api/budgets/[id]/ledger`, fleet-state summary embed, SSE mapping. |
| UI | TopBar `BudgetPill`, `SpendBar` inside `CostBreakdown`, `BudgetSettingsPanel`, `budgetStore`. |

---

## 4. Data Model

House conventions per `packages/core/src/db/schema/score.ts` /
`wave-planner.ts`: `sqliteTable`, cuid2 text PKs, `integer(..., { mode:
'timestamp' })`, `text(..., { enum })` backed by `enums.ts` value arrays,
`relations()`, `$inferSelect`/`$inferInsert` exports. New file:
`packages/core/src/db/schema/cost.ts`, exported from `schema/index.ts`.

### 4.1 Enum additions — `packages/core/src/db/schema/enums.ts`

```typescript
// Cost budget enums (TRD 11)
export const budgetScopeValues = ['plan', 'item', 'global-monthly'] as const;
export type BudgetScope = (typeof budgetScopeValues)[number];

export const budgetBreachActionValues = ['warn-only', 'pause-plan', 'block-new-dispatch'] as const;
export type BudgetBreachAction = (typeof budgetBreachActionValues)[number];

export const budgetStateValues = ['ok', 'threshold', 'breached'] as const;
export type BudgetState = (typeof budgetStateValues)[number];

export const costLedgerSourceValues = ['status-callback', 'completion-report', 'manual'] as const;
export type CostLedgerSource = (typeof costLedgerSourceValues)[number];
```

`eventTypeValues` gains:

```typescript
  // Budget events (TRD 11)
  'BUDGET_THRESHOLD',
  'BUDGET_BREACH',
  'BUDGET_UPDATED',
```

### 4.2 New tables — `packages/core/src/db/schema/cost.ts`

```typescript
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import {
  budgetScopeValues,
  budgetBreachActionValues,
  budgetStateValues,
  costLedgerSourceValues,
} from './enums';
import { wavePlans } from './wave-planner';
import { horizonItems } from './horizon';
import { rufloSessions } from './fleet';

// ============================================================================
// Cost Budgets
// ============================================================================

export const costBudgets = sqliteTable('cost_budgets', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  scope: text('scope', { enum: budgetScopeValues }).notNull(),
  scopeRef: text('scope_ref'),                 // wavePlanId | horizonItemId | NULL (global-monthly)
  capUsd: real('cap_usd').notNull(),
  softThresholdPct: integer('soft_threshold_pct').notNull().default(80),
  breachAction: text('breach_action', { enum: budgetBreachActionValues })
    .notNull().default('warn-only'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  state: text('state', { enum: budgetStateValues }).notNull().default('ok'),
  periodAnchorDay: integer('period_anchor_day').notNull().default(1),
    // global-monthly only: day-of-month the window resets (1–28)
  lastThresholdAt: integer('last_threshold_at', { mode: 'timestamp' }),  // notification dedupe
  lastBreachAt: integer('last_breach_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull().$defaultFn(() => new Date()),
});

// ============================================================================
// Cost Ledger Entries — one row per observed usage delta
// ============================================================================

export const costLedgerEntries = sqliteTable('cost_ledger_entries', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  sessionId: text('session_id').notNull(),
  wavePlanId: text('wave_plan_id'),            // NULL for non-wave dispatches
  taskCode: text('task_code'),
  horizonItemId: text('horizon_item_id'),
  model: text('model').notNull(),              // raw reported model string, e.g. "sonnet"
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
  cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
  costUsd: real('cost_usd').notNull(),         // computed at write time
  estimated: integer('estimated', { mode: 'boolean' }).notNull().default(false),
    // true when derived from a bare tokensUsed total via the split heuristic (§7.4)
  source: text('source', { enum: costLedgerSourceValues }).notNull(),
  pricingVersion: text('pricing_version').notNull(),  // PRICING_VERSION at write time
  recordedAt: integer('recorded_at', { mode: 'timestamp' })
    .notNull().$defaultFn(() => new Date()),
});

export const costLedgerEntriesRelations = relations(costLedgerEntries, ({ one }) => ({
  session: one(rufloSessions, {
    fields: [costLedgerEntries.sessionId],
    references: [rufloSessions.id],
  }),
  wavePlan: one(wavePlans, {
    fields: [costLedgerEntries.wavePlanId],
    references: [wavePlans.id],
  }),
  horizonItem: one(horizonItems, {
    fields: [costLedgerEntries.horizonItemId],
    references: [horizonItems.id],
  }),
}));

// ============================================================================
// Type Exports
// ============================================================================

export type CostBudget = typeof costBudgets.$inferSelect;
export type NewCostBudget = typeof costBudgets.$inferInsert;
export type CostLedgerEntry = typeof costLedgerEntries.$inferSelect;
export type NewCostLedgerEntry = typeof costLedgerEntries.$inferInsert;
```

Design notes:

- **Budgets carry no FK constraint on `scopeRef`** (deliberately loose,
  matching `wavePlans.planId`'s style at the Drizzle layer): a budget outlives
  the plan it scoped (§10.3), and `scopeRef` semantics vary by scope.
- **Ledger entries are append-only**; nothing updates or deletes them (budget
  deletion does not cascade — entries are attribution records, not children of
  budgets; there is intentionally **no** `budgetId` column, since one entry can
  count against several overlapping budgets).
- `rufloSessions.costUsd` (`integer`, lossy) is **left as-is for
  back-compat** and documented as deprecated in favor of
  `SUM(costLedgerEntries.costUsd)` per session (§10.5).

### 4.3 SQLite adapter DDL — `packages/core/src/db/adapters/sqlite.ts`

Append to `createTableStatements` (`sqlite.ts:13-266`):

```sql
-- Cost Budgets
CREATE TABLE IF NOT EXISTS cost_budgets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('plan', 'item', 'global-monthly')),
  scope_ref TEXT,
  cap_usd REAL NOT NULL,
  soft_threshold_pct INTEGER NOT NULL DEFAULT 80,
  breach_action TEXT NOT NULL DEFAULT 'warn-only' CHECK(breach_action IN ('warn-only', 'pause-plan', 'block-new-dispatch')),
  enabled INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL DEFAULT 'ok' CHECK(state IN ('ok', 'threshold', 'breached')),
  period_anchor_day INTEGER NOT NULL DEFAULT 1,
  last_threshold_at INTEGER,
  last_breach_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Cost Ledger Entries
CREATE TABLE IF NOT EXISTS cost_ledger_entries (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  wave_plan_id TEXT,
  task_code TEXT,
  horizon_item_id TEXT,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL,
  estimated INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL CHECK(source IN ('status-callback', 'completion-report', 'manual')),
  pricing_version TEXT NOT NULL,
  recorded_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cost_budgets_scope ON cost_budgets(scope, scope_ref);
CREATE INDEX IF NOT EXISTS idx_cost_ledger_session ON cost_ledger_entries(session_id);
CREATE INDEX IF NOT EXISTS idx_cost_ledger_wave_plan ON cost_ledger_entries(wave_plan_id);
CREATE INDEX IF NOT EXISTS idx_cost_ledger_item ON cost_ledger_entries(horizon_item_id);
CREATE INDEX IF NOT EXISTS idx_cost_ledger_recorded_at ON cost_ledger_entries(recorded_at);
```

Also widen the `activity_events.type` CHECK (`sqlite.ts:156`) with
`'BUDGET_THRESHOLD', 'BUDGET_BREACH', 'BUDGET_UPDATED'` (same idempotent
migration convention as TRD 10 §4.3 — if both TRDs run concurrently, each adds
only its own values; the edits are line-disjoint but coordinate the rebase).

---

## 5. Enforcement Semantics

### 5.1 Spend attribution

Every ledger entry attributes to up to three scopes simultaneously:

| Scope | Matching rule |
|---|---|
| `plan` | `entry.wavePlanId = budget.scopeRef` |
| `item` | `entry.horizonItemId = budget.scopeRef` (covers all wave-plan versions of the item) |
| `global-monthly` | `entry.recordedAt` within the current anchor window: from the most recent `periodAnchorDay` 00:00 local to the next |

`spend(budget) = SUM(costUsd)` of matching entries (estimated entries count —
an uncertain dollar is still a spent dollar; the UI marks estimated fractions).

### 5.2 Threshold and breach evaluation

Evaluated by `BudgetEnforcer.onLedgerAppend(entry)` for every budget whose
scope matches the entry (and lazily on read for `global-monthly` window
rollover):

```
pct = spend / capUsd * 100

pct < softThresholdPct           → state 'ok'
softThresholdPct ≤ pct < 100     → state 'threshold'  (on first crossing:
                                    BUDGET_THRESHOLD event → budget:threshold SSE
                                    + assist notification; lastThresholdAt set)
pct ≥ 100                        → state 'breached'   (on first crossing:
                                    BUDGET_BREACH event → budget:breach SSE
                                    + breach action executed; lastBreachAt set)
```

Crossing notifications fire **once per window/state transition** (deduped via
`lastThresholdAt`/`lastBreachAt` and `state`); spend continuing to rise inside
a state does not re-notify. A budget edited to a higher cap re-evaluates and
may transition back to `ok`/`threshold` (emitting `BUDGET_UPDATED`).

### 5.3 Breach actions

| Action | Effect on breach |
|---|---|
| `warn-only` | Events/notifications only. Nothing operational changes. |
| `pause-plan` | For `plan` scope: pause that wave plan via the Tier-1 controller path (`WaveExecutionController.pause()` — same transition as `POST /api/wave-plans/[planId]/pause`). For `item` scope: pause the item's active wave plan. For `global-monthly`: pause **all** currently `executing` wave plans. In-flight sessions finish (Non-Goal: no kill); no new tasks dispatch because paused plans don't dispatch. |
| `block-new-dispatch` | Plans keep their status, but `checkPreDispatch` (§5.4) rejects every new task dispatch matched by the breached budget until spend drops below cap (cap raise, window rollover) or the budget is disabled. Softer than pause: the current wave's already-dispatched tasks finish and the plan halts at the next dispatch boundary. |

Resuming a `pause-plan`'d plan while the budget is still breached is allowed
(explicit conductor override via the existing resume route) but each dispatch
still passes through `checkPreDispatch`; with the budget breached and action
`pause-plan`, pre-dispatch **warns** (event) but does not block — the conductor
consciously overrode. `block-new-dispatch` cannot be overridden except by
editing the budget (that is its contract).

### 5.4 Pre-dispatch estimate check

Called by `WaveDispatchCoordinator.dispatchWave()` once per task, before
`dispatchToOrchestrator`:

```
estimate = task.estimatedCostUsd (tasks.estimated_cost_usd via the wave task's
           taskId link) — fallback: plan.estimatedCostUsd / totalTasks
           — fallback: BUDGET_DEFAULT_TASK_ESTIMATE_USD (default 1.00)

for each enabled budget matching the dispatch context:
  projected = spend(budget) + estimate
  if budget.state == 'breached' AND budget.breachAction == 'block-new-dispatch':
      → REJECT (task stays 'pending', reason recorded)
  if projected > capUsd AND breachAction == 'block-new-dispatch':
      → REJECT (would-breach: don't start what we can't afford)
  if projected > capUsd (other actions):
      → ALLOW + emit budget:threshold-style warning ("next dispatch likely breaches")
```

Rejected tasks remain `pending` with an `errorMessage` of
`budget-blocked: <budgetName>`; the wave stays `active`/partially dispatched,
and a single `BUDGET_BREACH`-typed activity event per wave-dispatch attempt
explains the block. When the budget recovers, the normal Tier-1
capacity-freed re-dispatch path picks the pending tasks back up.

### 5.5 Mid-execution accumulation check

Every status callback that carries usage produces a ledger delta (§7.4), which
triggers `onLedgerAppend` → §5.2. Worst-case detection latency is therefore
one status-callback interval; the overshoot bound is
`(number of in-flight sessions) × (spend per callback interval)` — accepted
and documented (see §10.4 for the concurrency race analysis).

---

## 6. API Surface

House style: JSON envelopes, `{ error: string }` failures.

### 6.1 `GET /api/budgets`

Response `200`:
```json
{
  "budgets": [
    {
      "id": "b1", "name": "July plan cap", "scope": "plan", "scopeRef": "wp_k3x9",
      "capUsd": 25, "softThresholdPct": 80, "breachAction": "pause-plan",
      "enabled": true, "state": "threshold",
      "spendUsd": 21.37, "spendPct": 85.5, "estimatedFractionPct": 12.0,
      "windowStart": null, "windowEnd": null
    }
  ]
}
```
`spendUsd`/`spendPct`/`estimatedFractionPct` are computed server-side;
`windowStart/End` are non-null for `global-monthly`.

### 6.2 `POST /api/budgets`

Request:
```json
{ "name": "Monthly ceiling", "scope": "global-monthly", "capUsd": 200,
  "softThresholdPct": 75, "breachAction": "block-new-dispatch", "periodAnchorDay": 1 }
```
Response `201 { budget: {...} }`. Errors: `400` invalid scope/cap ≤ 0/threshold
outside 1–99/`periodAnchorDay` outside 1–28/missing `scopeRef` for
plan|item scopes; `404` `scopeRef` references a nonexistent plan/item; `409`
duplicate enabled budget for the same `(scope, scopeRef)`.

### 6.3 `GET | PATCH | DELETE /api/budgets/[id]`

- `GET` → single budget with computed spend fields (§6.1 shape).
- `PATCH` accepts any mutable subset (`name`, `capUsd`, `softThresholdPct`,
  `breachAction`, `enabled`, `periodAnchorDay`); triggers re-evaluation
  (§5.2) and emits `BUDGET_UPDATED`. Scope/scopeRef are immutable (`400`).
- `DELETE` → `200 { deleted: true }`; ledger entries are untouched (§10.3).
All: `404` unknown id.

### 6.4 `GET /api/budgets/[id]/ledger?limit=50&before=<recordedAt-cursor>`

Response `200`:
```json
{
  "entries": [
    { "id": "e1", "sessionId": "s9", "wavePlanId": "wp_k3x9", "taskCode": "2.1",
      "model": "sonnet", "inputTokens": 120500, "outputTokens": 44800,
      "cacheReadTokens": 310000, "cacheWriteTokens": 12000,
      "costUsd": 1.23, "estimated": false, "source": "status-callback",
      "pricingVersion": "2026-03", "recordedAt": "2026-07-19T14:20:31Z" }
  ],
  "totalUsd": 21.37,
  "nextCursor": "2026-07-19T13:02:00Z"
}
```
Entries are the budget's *matching* entries per §5.1 (the ledger table itself
has no budget FK). `404` unknown budget.

### 6.5 `/api/fleet/state` — summary embed

The existing response gains:

```typescript
budgets: {
  globalMonthly: { capUsd: number; spendUsd: number; spendPct: number; state: BudgetState } | null;
  worst: { budgetId: string; name: string; scope: BudgetScope; spendPct: number; state: BudgetState } | null;
  activeBudgetCount: number;
  monthToDateUsd: number;        // all ledger entries in the current calendar month
}
```

`worst` is the enabled budget with the highest `spendPct` — what the TopBar
pill renders.

### 6.6 SSE events — namespace `budget:*`

Persisted to `activity_events` (uppercase DB type), wire-mapped by the stream
route exactly as TRD 10 §7.8 does for `ci:*`:

| Wire type | DB type | Payload (metadata) |
|---|---|---|
| `budget:threshold` | `BUDGET_THRESHOLD` | `{ budgetId, name, scope, scopeRef, capUsd, spendUsd, spendPct }` |
| `budget:breach` | `BUDGET_BREACH` | `{ budgetId, name, scope, scopeRef, capUsd, spendUsd, action, affectedPlanIds: string[] }` |
| `budget:updated` | `BUDGET_UPDATED` | `{ budgetId, change: 'created' \| 'edited' \| 'deleted' \| 'state', state }` |

The existing `fleet_heartbeat` (stream route) gains a compact
`budget: { spendPct, state }` field mirroring `worst`, so the pill updates
without extra requests.

---

## 7. Core Services

New module `packages/core/src/cost/` exported as
`export * as cost from './cost'` in `packages/core/src/index.ts` (matching
`export * as linear` / `wavePlanner`).

### 7.1 `packages/core/src/cost/pricing.ts`

```typescript
export interface RuntimeModelPricing {
  model: string;                 // canonical short name: 'haiku' | 'sonnet' | 'opus' (extensible)
  inputPer1M: number;
  outputPer1M: number;
  cacheReadPer1M: number;
  cacheWritePer1M: number;
}

/** Bumped whenever DEFAULT_RUNTIME_PRICING changes; stamped on ledger rows. */
export const PRICING_VERSION = '2026-03';

/** Values identical to packages/benchmarks/src/config.ts:40-61 at time of writing. */
export const DEFAULT_RUNTIME_PRICING: RuntimeModelPricing[];

/** Resolution: COST_PRICING_FILE (JSON) > config.yaml budgets.pricing > defaults.
 *  Custom pricing sets pricingVersion to 'custom:<sha256-8>' of the file content. */
export function loadRuntimePricing(): { pricing: RuntimeModelPricing[]; version: string };

/** Normalizes reported model strings ('SONNET', 'claude-sonnet-4-...') to canonical
 *  short names; unknown strings return 'sonnet' with a warn (matches the benchmark
 *  CostCalculator's fallback behavior, cost-calculator.ts:84-89). */
export function canonicalModelName(reported: string): string;
```

The benchmark package is **not** imported by core (dependency direction:
benchmarks may depend on core, never the reverse). A follow-up task makes
`packages/benchmarks` re-export core's table to avoid divergence (CB-W4-T5).

### 7.2 `packages/core/src/cost/calculator.ts`

```typescript
export interface RuntimeTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface RuntimeCostBreakdown {
  inputCost: number; outputCost: number;
  cacheReadCost: number; cacheWriteCost: number;
  totalCost: number;
}

export class RuntimeCostCalculator {
  constructor(pricing?: RuntimeModelPricing[]);      // default: loadRuntimePricing()
  getPricing(model: string): RuntimeModelPricing | undefined;
  calculateBreakdown(model: string, usage: RuntimeTokenUsage): RuntimeCostBreakdown;
  calculateCost(model: string, usage: RuntimeTokenUsage): number;
  estimateCost(model: string, inputTokens: number, outputTokens: number): number;
  static formatCost(costUsd: number): string;        // same precision rules as benchmark version
}
```

Math is a direct port of
`packages/benchmarks/src/metrics/cost-calculator.ts:81-105` (per-1M linear
rates, unknown-model sonnet fallback).

### 7.3 `packages/core/src/cost/ledger.ts`

```typescript
export interface DispatchAttribution {
  wavePlanId?: string;
  taskCode?: string;
  horizonItemId?: string;
}

export class CostLedger {
  constructor(deps: { calculator: RuntimeCostCalculator; pricingVersion: string });

  /** Register attribution at dispatch time (called by WaveDispatchCoordinator
   *  after a successful dispatch) so later callbacks can be attributed without
   *  a DB join on every status ping. Falls back to a DB lookup on miss (restart). */
  setAttribution(sessionId: string, attr: DispatchAttribution): void;

  /** Ingest a status callback. Computes the DELTA vs the last cumulative
   *  snapshot for this session and appends one entry if the delta is positive.
   *  Returns the appended entry or null (no usage / no positive delta). */
  async recordStatus(update: StatusUpdate): Promise<CostLedgerEntry | null>;

  /** Ingest a completion report. Reconciles: appends a final delta entry so
   *  that the session's ledger total equals the report's total usage; if the
   *  report carries costUsd and structured usage is absent, trusts reported
   *  cost (entry flagged estimated=false, tokens estimated=true split). */
  async recordCompletion(report: CompletionReport): Promise<CostLedgerEntry | null>;

  async recordManual(entry: Omit<NewCostLedgerEntry, 'id' | 'recordedAt' | 'source'>): Promise<CostLedgerEntry>;

  // Spend queries (used by enforcer, routes, fleet state, score)
  async spendForPlan(wavePlanId: string): Promise<number>;
  async spendForItem(horizonItemId: string): Promise<number>;
  async spendForWindow(start: Date, end: Date): Promise<number>;
  async spendForSession(sessionId: string): Promise<number>;
  async entriesForBudget(budget: CostBudget, opts?: { limit?: number; before?: Date }):
    Promise<{ entries: CostLedgerEntry[]; totalUsd: number }>;

  /** Hook set by BudgetEnforcer.attach(); invoked after every append. */
  onAppend?: (entry: CostLedgerEntry) => Promise<void>;
}

export function initCostLedger(...): CostLedger;
export function getCostLedger(): CostLedger;
export function isCostLedgerInitialized(): boolean;
```

**Delta logic**: `StatusUpdate` usage is treated as **cumulative for the
session** (that is how `tokensUsed` behaves today — the adapter caches
last-known totals, `claude-session-adapter.ts:330-347`). The ledger keeps the
last snapshot per session in memory (rebuilt from `SUM(entries)` on restart);
`delta = max(0, snapshot_new − snapshot_prev)` per token category. A snapshot
*lower* than the previous one (session restart, adapter reset) is treated as a
new baseline: delta 0, warn logged (§10.1 covers the missing-data family).

### 7.4 Missing-usage fallback (the "estimated split")

When a callback carries only the legacy `tokensUsed` total (no `usage` block,
§7.6) — or nothing at all:

| Situation | Ledger behavior |
|---|---|
| `usage` block present | Exact entry, `estimated: false`. |
| Only `tokensUsed` total | Split via `BUDGET_ESTIMATED_OUTPUT_RATIO` (default 0.25): `outputTokens = round(total × ratio)`, `inputTokens = total − outputTokens`, caches 0. `estimated: true`. |
| `CompletionReport` with `costUsd` but no usable tokens | Entry with token fields 0 and `costUsd` as the reconciliation delta (reported minus already-ledgered), `estimated: true`. |
| No usage anywhere (adapter never reports) | No entries during execution; at completion, fall back to the task's `estimatedCostUsd` as a `manual`-source entry flagged `estimated: true`, and emit a warning event — budgets still see *something* rather than silently metering zero (§10.1). |

### 7.5 `packages/core/src/cost/enforcer.ts`

```typescript
export interface PreDispatchContext {
  wavePlanId: string;
  horizonItemId: string;
  taskCode: string;
  estimatedCostUsd: number;
}

export type PreDispatchDecision =
  | { allowed: true; warnings: BudgetWarning[] }
  | { allowed: false; budgetId: string; budgetName: string; reason: 'breached' | 'would-breach' };

export class BudgetEnforcer {
  constructor(deps: {
    ledger: CostLedger;
    pausePlan: (wavePlanId: string) => Promise<void>;   // Tier-1 controller.pause bridge
  });

  attach(): void;                                       // sets ledger.onAppend

  async onLedgerAppend(entry: CostLedgerEntry): Promise<void>;   // §5.2 evaluation
  async checkPreDispatch(ctx: PreDispatchContext): Promise<PreDispatchDecision>; // §5.4
  async evaluateBudget(budgetId: string): Promise<CostBudget>;   // recompute state (PATCH path)
  async summarize(): Promise<FleetBudgetSummary>;                // §6.5 shape
}

export function initBudgetEnforcer(...): BudgetEnforcer;
export function getBudgetEnforcer(): BudgetEnforcer;
```

State transitions and event emission exactly per §5.2/§5.3. `pause-plan` on a
`global-monthly` breach iterates `wavePlans` with status `executing` and calls
`pausePlan` for each, collecting `affectedPlanIds` for the event payload.

### 7.6 Callback contract extension (extends TRD 01)

Reserved contract surface for this TRD (per `00-PROGRAM-OVERVIEW.md` §2.3 —
disjoint from TRD 10's `git`/PR fields and TRD 12's transcript fields):

`StatusUpdate` (`packages/core/src/orchestrator/types.ts:38-48`) gains:

```typescript
  model?: string;                      // NEW (TRD 11): model serving this session
  usage?: {                            // NEW (TRD 11): CUMULATIVE session totals
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
```

`CompletionReport` (`types.ts:53-71`) gains the same optional `model` and
`usage` block (final totals). Existing `tokensUsed`/`costUsd` stay for
back-compat and feed the fallback path (§7.4). The claude-session dispatch
contract in `spec/trd/01-TIER1-EXECUTION-LOOP.md` is amended so sessions
include `usage` in every status POST — the Claude Code session runtime exposes
cumulative token counts, and the Tier-1 session prompt/harness must forward
them; until agents comply, the fallback path keeps budgets functional.

### 7.7 Wiring modifications

- **`packages/core/src/orchestrator/service.ts`** —
  `ingestStatusUpdate()` (line 389): before emitting the `job:progress` event,
  `if (isCostLedgerInitialized()) await getCostLedger().recordStatus(update)`
  (fire-and-forget with error logging — a ledger failure must never drop a
  status update). `ingestCompletionReport()` (line 410): same with
  `recordCompletion(report)`.
- **`packages/core/src/wave-planner/execution/dispatch-coordinator.ts`** — in
  `dispatchWave()` per-task loop (lines 68-111): resolve the task estimate,
  call `getBudgetEnforcer().checkPreDispatch(...)`; on `allowed: false`, skip
  dispatch, leave status `pending`, set
  `errorMessage: 'budget-blocked: <name>'`, count it in a new
  `DispatchResult.budgetBlocked` field (add to `execution/types.ts:19-23`).
  On success, `getCostLedger().setAttribution(sessionId, {...})`.
- **Bootstrap** — the Tier-1 Next init site (same file TRD 10 uses,
  e.g. `src/lib/orchestrator-init.ts`): `initCostLedger`,
  `initBudgetEnforcer` (+ `.attach()`), passing a `pausePlan` bridge that
  reuses the pause route's controller call.
- **`packages/core/src/cost/index.ts`** barrel; core `index.ts` gains
  `export * as cost`.

### 7.8 Conductor Score — `costEfficiency` from the ledger

New pure function (home: `packages/core/src/cost/score.ts`):

```typescript
/** costEfficiency ∈ [0, 150], neutral 100.
 *  ratio = actual ledger spend / estimated cost, over wave plans completed in
 *  the trailing 14 days (plans with zero ledger data are excluded).
 *    ratio ≤ 0.8  → 120–150 (under budget, scaled)
 *    ratio ≈ 1.0  → ~100
 *    ratio ≥ 1.5  → 40–60  (chronic overrun, scaled, floor 0 at ratio 3)
 *  Estimated-flagged entries are included but the result is dampened toward
 *  100 by the estimated fraction (low-confidence data shouldn't swing score). */
export async function computeCostEfficiency(): Promise<number>;
```

Wired into whichever score recomputation site Tier 2 established (its
`conductorScores.costEfficiency` write path); if that site is absent, the
function ships tested but unwired and task CB-W4-T6 is marked blocked-on-02.

---

## 8. UI

Conventions per `src/components/topbar/` and `src/components/plan/`:
`'use client'`, typed props, `cn()`, Zustand stores.

### 8.1 `src/components/topbar/BudgetPill.tsx` (new)

```typescript
interface BudgetPillProps {
  summary: FleetBudgetSummary | null;   // from fleet state / heartbeat
  onClick: () => void;                  // opens BudgetSettingsPanel
}
```
Rendered in `TopBar.tsx` in the right-hand group, immediately left of
`ConductorScorePill`. Shows `worst` budget as `$21 / $25` with a mini fill
bar. Color: green `ok`, amber `threshold` (pulse, matching the existing
`pulse-amber` pattern from `RufloSessionCard`), red `breached` (pulse). Hidden
when `activeBudgetCount === 0` (replaced by a ghost "+ budget" affordance).

### 8.2 `src/components/plan/CostBreakdown.tsx` (extend)

Props gain optional live data:

```typescript
interface CostBreakdownProps {
  plan: Plan;
  spend?: { actualUsd: number; estimatedFractionPct: number } | null;  // NEW
  budget?: { capUsd: number; state: BudgetState } | null;              // NEW
}
```
Below the existing estimate/savings rows, when `spend` is present, render a
**SpendBar**: horizontal bar with segments for actual spend (solid) and
estimated-flagged spend (hatched), a marker at `plan.estimatedCostUsd`, and —
when a plan/item budget applies — a cap line at `capUsd` with the overflow
zone tinted red. Text row: `Spent $8.12 of est. $11.40 · cap $25.00`.

### 8.3 `src/components/budget/BudgetSettingsPanel.tsx` (new)

```typescript
interface BudgetSettingsPanelProps {
  open: boolean;
  onClose: () => void;
}
```
Lists budgets (§6.1 rows with inline spend bars), create/edit form (scope
selector with plan/item pickers, cap, threshold slider, action radio with a
one-line consequence description each, anchor day for monthly), delete with
confirm. Ledger drawer per budget: paginated table of §6.4 entries (time,
session, task, model, tokens, USD, `~` prefix on estimated). Companion
`src/components/budget/index.ts` barrel.

### 8.4 Store — `src/stores/budgetStore.ts` (new)

`budgets: BudgetView[]`, `summary: FleetBudgetSummary | null`; actions
`loadBudgets()`, `createBudget()`, `patchBudget()`, `deleteBudget()`,
`loadLedger(budgetId, cursor?)`, `applyBudgetEvent(sseEvent)` (subscribed to
`budget:*` wire types via the existing `useSSE` hook), and heartbeat ingestion
for the pill.

### 8.5 Activity feed

`budget:threshold` / `budget:breach` rows render in the existing
`ActivityFeed` with amber/red accent and the `spendPct` inline — no new
component, just the type→style map extension in
`src/components/fleet/ActivityFeed.tsx`.

---

## 9. Configuration

### 9.1 Environment variables

```bash
# Cost tracking & budgets (TRD 11)
COST_TRACKING_ENABLED=true            # false → no ledger writes, no enforcement (routes return 503)
COST_PRICING_FILE=                    # optional JSON file of RuntimeModelPricing[]
BUDGET_ESTIMATED_OUTPUT_RATIO=0.25    # split heuristic for bare token totals (§7.4)
BUDGET_DEFAULT_TASK_ESTIMATE_USD=1.00 # pre-dispatch fallback estimate (§5.4)
BUDGET_DEFAULT_SOFT_THRESHOLD_PCT=80
BUDGET_DEFAULT_BREACH_ACTION=warn-only  # warn-only | pause-plan | block-new-dispatch
```

### 9.2 `.devpilot/config.yaml` (CLI config loader, `packages/cli/src/commands/config.ts`)

```yaml
budgets:
  defaults:
    softThresholdPct: 80
    breachAction: pause-plan
  globalMonthly:                      # optional: declaratively ensure one exists at boot
    capUsd: 200
    periodAnchorDay: 1
  pricing:                            # optional override table (else built-in defaults)
    - model: sonnet
      inputPer1M: 3.0
      outputPer1M: 15.0
      cacheReadPer1M: 0.30
      cacheWritePer1M: 3.75
```

Env overrides YAML. If `budgets.globalMonthly` is present at boot and no
enabled `global-monthly` budget row exists, one is created (idempotent,
name `"Global monthly (config)"`).

---

## 10. Error Handling & Edge Cases

### 10.1 Missing usage data

The whole fallback ladder is §7.4. Additional rules:

- A session that reports usage in *some* callbacks and not others simply
  produces deltas only when data arrives — cumulative snapshots make gaps
  harmless.
- A completion report whose totals are *lower* than already-ledgered spend
  (adapter double-count, restart) produces **no negative entry** — the ledger
  is monotone; the discrepancy is logged and the reconciliation delta clamps
  to 0.
- If `COST_TRACKING_ENABLED=false`, `ingestStatusUpdate` skips the ledger
  entirely; budgets UI shows a "tracking disabled" state instead of zeros
  (avoids the false comfort of an empty ledger).

### 10.2 Pricing drift

Prices change; ledger entries are historical facts. Rules:

- Every entry stamps `pricingVersion` (§4.2); entries are **never** recomputed
  retroactively — a cap is judged against dollars as they were metered.
- Changing `COST_PRICING_FILE`/config pricing changes the version stamp
  (`custom:<hash>`), so mixed-version ledgers are auditable via
  `GET .../ledger`.
- If a reported model has no pricing row, the sonnet fallback applies (same
  behavior as the benchmark calculator, `cost-calculator.ts:84-89`) and the
  entry is flagged `estimated: true` — an unknown price is an estimate by
  definition.
- Bumping `DEFAULT_RUNTIME_PRICING` requires bumping `PRICING_VERSION` in the
  same commit (unit test asserts the table's hash matches the version
  constant).

### 10.3 Budget deleted (or plan deleted) mid-flight

- **Budget deleted**: enforcement stops immediately (enforcer reloads matching
  budgets per append; a missing budget simply doesn't match). Ledger entries
  persist untouched — they carry no `budgetId` (§4.2), so there is nothing to
  orphan. A plan paused by a now-deleted budget **stays paused** (resuming is
  a conductor action via the existing resume route; auto-resume on budget
  deletion would be a silent spend-gate removal).
- **Plan deleted while a `plan`-scoped budget exists**: the budget's spend
  freezes (no new matching entries); it shows as `scopeRef` dangling in the
  settings panel with a "scope no longer exists" note and a one-click disable.
  `checkPreDispatch` naturally never matches it again.
- **Budget disabled** (`enabled: false`): skipped by matching everywhere;
  state is preserved for re-enable.

### 10.4 Concurrent plans sharing a global budget

Multiple executing plans append ledger entries interleaved. Analysis:

- SQLite runs in WAL mode with a single Node process
  (`sqlite.ts:283`) — appends serialize at the DB; `SUM()` in
  `onLedgerAppend` reads its own append. The classic check-then-act race
  (two appends both reading pre-breach sums) can at worst cause **both** to
  evaluate as the first crossing; the transition guard (§5.2: notify only on
  `state` change, single `UPDATE ... WHERE state != 'breached'`-style
  conditional write) makes duplicate notifications impossible — the second
  writer sees the state already advanced.
- Pre-dispatch checks from two plans can both pass against the same remaining
  budget and jointly overshoot by at most the sum of the two estimates —
  bounded, documented, and consistent with §5.5's overshoot bound. Exact
  reservation semantics (escrowing estimates) are deliberately out of scope
  for v1.
- `pause-plan` on a global breach pauses each plan idempotently (pausing an
  already-paused plan is a no-op guarded by the Tier-1 controller's status
  check, `controller.ts:79-81`).

### 10.5 Legacy lossy columns

`rufloSessions.costUsd` is `integer` (`fleet.ts:26`) — sub-dollar session
costs truncate. This TRD does **not** migrate the column (Tier-3 concern);
instead: the completion route keeps writing it (rounded) for back-compat, all
new surfaces read from the ledger, and the column's doc comment gains a
deprecation note pointing to `costLedgerEntries`.

### 10.6 Monthly window rollover

`global-monthly` spend is computed per query from `recordedAt` (§5.1) — no
cron needed for the sum. State, however, must reset when the window rolls: the
enforcer lazily detects rollover on the first evaluation after the anchor
(stored `lastBreachAt`/`lastThresholdAt` older than `windowStart` → reset
state to recomputed value, clear dedupe stamps, emit `BUDGET_UPDATED` with
`change: 'state'`). A plan paused by last month's breach stays paused (same
principle as §10.3).

### 10.7 Restart recovery

In-memory state (cumulative snapshots, attribution map) rebuilds lazily:
snapshot from `SUM(entries) GROUP BY session`, attribution from the wave-task
`assignedSessionId` linkage (`waveTasks.assignedSessionId`,
`wave-planner.ts:109`). Budget `state` is durable in the row, so
threshold/breach notifications do not re-fire after restart.

---

## 11. Testing Strategy

1. **pricing/calculator** — port the benchmark calculator's test expectations
   (same rates ⇒ same dollars, byte-for-byte against
   `cost-calculator.ts` outputs for identical inputs); `canonicalModelName`
   table ('SONNET', 'opus', 'claude-sonnet-4-x', unknown); pricing-version
   hash-lock test (§10.2).
2. **ledger** — in-memory SQLite: cumulative→delta sequences (monotone,
   regressing, gapped); estimated split ratios; completion reconciliation
   (exact, clamped-to-zero, cost-only); restart snapshot rebuild;
   attribution fallback lookup; `spendFor*` query correctness incl. window
   boundaries at the anchor day.
3. **enforcer** — state-machine matrix: crossings up/down, dedupe
   (no double `BUDGET_THRESHOLD` on two appends inside the band), breach
   action execution per scope (mock `pausePlan`, assert `affectedPlanIds`),
   `checkPreDispatch` decision table of §5.4 (breached/would-breach/warn
   paths × three actions), monthly rollover lazy reset, deleted/disabled
   budget behavior.
4. **wiring** — orchestrator service tests: `ingestStatusUpdate` with/without
   usage block writes/skips entries and never throws into the event path;
   dispatch-coordinator test: blocked task stays `pending` with
   `budget-blocked:` message and `DispatchResult.budgetBlocked` counts it;
   recovery: freed budget → task re-dispatches via the existing path.
5. **routes** — CRUD status codes incl. 409 duplicate-scope and immutable-
   scope 400; ledger pagination cursor; fleet-state embed shape; SSE mapping
   test (inserted `BUDGET_BREACH` row arrives as `budget:breach`).
6. **UI** — component tests: pill states (ok/threshold/breached/hidden/
   disabled-tracking), SpendBar segment math (estimated hatch, cap overflow
   tint), settings form validation mirrors API 400 rules.
7. **E2E (scripted)** — dispatch a 2-wave plan with a $0.05 plan budget and a
   mocked adapter reporting usage: assert threshold event, breach, plan
   paused, pending task blocked, cap raise → resume → completion; repeat with
   `block-new-dispatch` asserting the halt-at-dispatch-boundary behavior.

---

## 12. Acceptance Criteria

| ID | Criterion |
|---|---|
| CB-AC-01 | A status callback carrying a `usage` block produces exactly one `costLedgerEntries` row whose token deltas and `costUsd` match the pricing table, attributed to the correct session, wave plan, task, and item. |
| CB-AC-02 | Two consecutive status callbacks with cumulative totals produce delta entries whose sum equals the final cumulative totals (no double counting); a completion report brings the session ledger total to the report's totals exactly. |
| CB-AC-03 | A callback carrying only legacy `tokensUsed` produces an entry flagged `estimated: true` using the configured output-ratio split; a session with no usage at all yields a `manual`-source estimated entry at completion equal to the task's `estimatedCostUsd`. |
| CB-AC-04 | With a `plan` budget at `softThresholdPct: 80`, crossing 80% emits `budget:threshold` (SSE within 2 s) exactly once, even across multiple subsequent appends and a process restart. |
| CB-AC-05 | Breaching a `pause-plan` budget transitions the scoped wave plan to `paused` via the Tier-1 pause path within one status-callback cycle, and the SSE `budget:breach` payload lists it in `affectedPlanIds`. |
| CB-AC-06 | Breaching a `block-new-dispatch` budget leaves plan status untouched but every subsequent task dispatch matched by the budget is rejected: the task stays `pending` with `errorMessage` prefixed `budget-blocked:`, and `DispatchResult.budgetBlocked` reflects it. |
| CB-AC-07 | Pre-dispatch: a task whose estimate would push a `block-new-dispatch` budget past its cap is rejected *before* breach ("would-breach"); with `warn-only`/`pause-plan` it dispatches and a warning event is emitted. |
| CB-AC-08 | A breached `warn-only` budget changes nothing operationally (plans keep executing and dispatching) while `budget:breach` is emitted. |
| CB-AC-09 | `global-monthly` spend covers entries from all plans; the window rolls at `periodAnchorDay` and state/dedupe stamps reset lazily (CB test may inject the clock). |
| CB-AC-10 | Budget CRUD: create validates scope/cap/threshold/anchor and rejects a duplicate enabled `(scope, scopeRef)` with 409; PATCH of `capUsd` re-evaluates state and emits `budget:updated`; DELETE stops enforcement without deleting any ledger entries and without auto-resuming a paused plan. |
| CB-AC-11 | `GET /api/budgets/[id]/ledger` returns matching entries newest-first with a working `before` cursor and a `totalUsd` equal to the sum of all matching entries. |
| CB-AC-12 | `/api/fleet/state` embeds the `budgets` summary of §6.5, and the SSE `fleet_heartbeat` carries the compact `budget` field. |
| CB-AC-13 | The TopBar renders `BudgetPill` left of `ConductorScorePill`, live-updating through SSE without reload, with distinct ok/threshold/breached visuals and hidden/ghost state when no budgets exist. |
| CB-AC-14 | `CostBreakdown` renders the SpendBar with actual vs estimated segments, the estimate marker, and the cap line when a plan/item budget applies. |
| CB-AC-15 | Ledger entries stamp `pricingVersion`; changing the pricing file changes the stamp on new entries only, and the pricing-table hash-lock unit test fails if `DEFAULT_RUNTIME_PRICING` changes without a `PRICING_VERSION` bump. |
| CB-AC-16 | `computeCostEfficiency()` returns ~100 for ratio ≈ 1.0 fixtures, > 100 for under-budget, < 100 for overrun, damped toward 100 as the estimated fraction grows. |
| CB-AC-17 | A fresh database created by `createSQLiteAdapter` contains `cost_budgets` and `cost_ledger_entries` with the constraints of §4.3 and accepts the three `BUDGET_*` activity event types. |
| CB-AC-18 | With `COST_TRACKING_ENABLED=false`, no ledger writes occur, budget routes return 503, and dispatch is never blocked. |

---

## 13. Implementation Plan

Waves of file-disjoint, independently executable tasks. Task IDs `CB-W{wave}-T{n}`.
Complexity S/M/L. No two same-wave tasks touch the same file.

### Wave 1 — Schema, types & pricing (no behavior change)

| ID | Title | Files | Description | Deps | Cx | Done-check |
|---|---|---|---|---|---|---|
| CB-W1-T1 | Budget enums | `packages/core/src/db/schema/enums.ts` | Add `budgetScopeValues`, `budgetBreachActionValues`, `budgetStateValues`, `costLedgerSourceValues` + types; add three `BUDGET_*` members to `eventTypeValues` (§4.1). Coordinate with TRD 10's edit of the same file if concurrent. | — | S | Core build passes; new exports type-resolve. |
| CB-W1-T2 | Cost schema tables | `packages/core/src/db/schema/cost.ts`, `packages/core/src/db/schema/index.ts` | Create `costBudgets` + `costLedgerEntries` per §4.2 (relations, design notes, type exports); barrel export. | CB-W1-T1 (types; parallel OK, resolves at build) | M | Tables + `$inferSelect` types exported from `@devpilot.sh/core`. |
| CB-W1-T3 | SQLite DDL mirror | `packages/core/src/db/adapters/sqlite.ts` | Append §4.3 DDL + indexes; widen `activity_events.type` CHECK with `BUDGET_*` values (idempotent migration per TRD 10 §4.3 convention). | — | M | Fresh DB: both tables present; `activity_events.type='BUDGET_BREACH'` insert succeeds. |
| CB-W1-T4 | Runtime pricing | `packages/core/src/cost/pricing.ts`, `packages/core/src/cost/pricing.test.ts` | Implement §7.1: table, `PRICING_VERSION`, `loadRuntimePricing` resolution chain, `canonicalModelName`, hash-lock test. | — | M | Tests pass incl. hash-lock and custom-file version stamping. |
| CB-W1-T5 | Runtime calculator | `packages/core/src/cost/calculator.ts`, `packages/core/src/cost/calculator.test.ts` | Port per §7.2; parity tests against benchmark calculator outputs for identical inputs. | CB-W1-T4 (imports pricing types; parallel OK) | M | Parity tests pass to the cent for all three models + cache categories. |

### Wave 2 — Ledger & enforcer (pure services)

| ID | Title | Files | Description | Deps | Cx | Done-check |
|---|---|---|---|---|---|---|
| CB-W2-T1 | CostLedger | `packages/core/src/cost/ledger.ts`, `packages/core/src/cost/ledger.test.ts` | Implement §7.3 + §7.4 in full: delta logic, estimated split, completion reconciliation (clamp), attribution map + DB fallback, spend queries, restart rebuild, singleton. | W1 | L | Test suite of §11(2) passes against in-memory SQLite. |
| CB-W2-T2 | BudgetEnforcer | `packages/core/src/cost/enforcer.ts`, `packages/core/src/cost/enforcer.test.ts` | Implement §7.5 + §5.2–5.4: matching, transition guards with conditional writes, breach actions (injected `pausePlan`), pre-dispatch decision table, monthly lazy rollover, `summarize()`. | W1 (ledger consumed via interface; mock in tests) | L | Test suite of §11(3) passes; duplicate-notification race test green. |
| CB-W2-T3 | Score function | `packages/core/src/cost/score.ts`, `packages/core/src/cost/score.test.ts` | Implement `computeCostEfficiency()` per §7.8 with fixture-driven tests. | W1 | M | CB-AC-16 fixtures pass. |
| CB-W2-T4 | Cost barrel + core export | `packages/core/src/cost/index.ts`, `packages/core/src/index.ts` | Barrel the cost module; add `export * as cost` to core index (coordinate with TRD 10's `github` export line if concurrent). | W1 | S | `import { cost } from '@devpilot.sh/core'` exposes ledger/enforcer/pricing/calculator/score. |
| CB-W2-T5 | Contract extension | `packages/core/src/orchestrator/types.ts` | Add optional `model` + `usage` to `StatusUpdate` and `CompletionReport` per §7.6 with doc comments citing this TRD (fields disjoint from TRD 10's additions to the same file — if concurrent, land in one coordinated edit). | — | S | Core build passes; fields optional, no consumer breaks. |

### Wave 3 — Wiring & API routes

| ID | Title | Files | Description | Deps | Cx | Done-check |
|---|---|---|---|---|---|---|
| CB-W3-T1 | Orchestrator ingestion hooks | `packages/core/src/orchestrator/service.ts` | Wire `recordStatus`/`recordCompletion` into `ingestStatusUpdate` (line 389) / `ingestCompletionReport` (line 410) per §7.7, guarded by `isCostLedgerInitialized()`, errors logged never thrown. | W2 | M | Service tests: entries written with usage present; event emission unaffected by ledger throw. |
| CB-W3-T2 | Pre-dispatch check | `packages/core/src/wave-planner/execution/dispatch-coordinator.ts`, `packages/core/src/wave-planner/execution/types.ts` | Wire `checkPreDispatch` + `setAttribution` into `dispatchWave` per §7.7; add `budgetBlocked` to `DispatchResult`. (If TRD 10 runs concurrently, its CI-W3-T3 touches the same two files — serialize these two tasks across programs.) | W2 | M | Coordinator tests: blocked task pending with `budget-blocked:` message; allowed path unchanged. |
| CB-W3-T3 | Budgets CRUD routes | `src/app/api/budgets/route.ts`, `src/app/api/budgets/[id]/route.ts` | GET/POST and GET/PATCH/DELETE per §6.1–6.3 incl. all validation and 503-when-disabled. | W2 | M | Route tests: all status codes of §6.2/6.3. |
| CB-W3-T4 | Ledger route | `src/app/api/budgets/[id]/ledger/route.ts` | Paginated ledger per §6.4. | W2 | S | Cursor pagination test passes; `totalUsd` matches sum. |
| CB-W3-T5 | Fleet-state embed + SSE mapping | `src/app/api/fleet/state/route.ts`, `src/app/api/events/stream/route.ts` | Add `budgets` summary per §6.5 via `enforcer.summarize()`; add `BUDGET_* → budget:*` wire mapping and heartbeat `budget` field per §6.6 (stream route also edited by TRD 10 CI-W4-T5 — coordinate if concurrent). | W2 | M | State route test asserts embed shape; stream test maps `BUDGET_BREACH` → `budget:breach`. |
| CB-W3-T6 | Service bootstrap | Tier-1 Next init site (e.g. `src/lib/orchestrator-init.ts`) | `initCostLedger` + `initBudgetEnforcer().attach()` with the `pausePlan` bridge; honor `COST_TRACKING_ENABLED`; ensure config.yaml `budgets.globalMonthly` idempotent creation (§9.2). | W2 | M | Boot log shows cost services; disabled flag skips init; declared global budget appears once across restarts. |

### Wave 4 — UI, score wiring & docs

| ID | Title | Files | Description | Deps | Cx | Done-check |
|---|---|---|---|---|---|---|
| CB-W4-T1 | budgetStore + hook | `src/stores/budgetStore.ts`, `src/hooks/useBudgets.ts` | Store per §8.4 with SSE subscription for `budget:*` and heartbeat ingestion. | W3 | M | Store tests: each of the three event types + heartbeat updates state. |
| CB-W4-T2 | BudgetPill | `src/components/topbar/BudgetPill.tsx`, `src/components/topbar/TopBar.tsx`, `src/components/topbar/index.ts` | Pill per §8.1; mount in TopBar left of `ConductorScorePill`. | CB-W4-T1 | M | Component tests: 5 visual states; TopBar snapshot updated. |
| CB-W4-T3 | SpendBar in CostBreakdown | `src/components/plan/CostBreakdown.tsx` | Extend props + render SpendBar per §8.2 (backward compatible: absent `spend` renders exactly today's output). | CB-W4-T1 | M | Snapshot without `spend` unchanged; segment-math tests pass. |
| CB-W4-T4 | BudgetSettingsPanel | `src/components/budget/BudgetSettingsPanel.tsx`, `src/components/budget/index.ts` | Panel per §8.3 (list, form with validation mirroring API 400s, ledger drawer, dangling-scope note). | CB-W4-T1 | L | Component tests: create/edit/delete flows; validation parity table. |
| CB-W4-T5 | Benchmarks re-export | `packages/benchmarks/src/config.ts` | Replace the literal `DEFAULT_MODEL_PRICING` with a re-export/adaptation of core's `DEFAULT_RUNTIME_PRICING` so the tables cannot diverge (benchmarks already depends on nothing from core here — add the dep edge benchmarks→core, which is the allowed direction). | W2 | S | Benchmarks build + existing pricing tests pass with the shared table. |
| CB-W4-T6 | costEfficiency wiring | Tier-2 score recomputation site (file per `spec/trd/02-TIER2-SPEC-COMPLETION.md`) | Wire `computeCostEfficiency()` into the `conductorScores.costEfficiency` write path. **Blocked-on-02 if that site does not exist yet** — ship CB-W2-T3 regardless. | CB-W2-T3, TRD 02 | S | Score route reflects ledger-driven value on fixture data. |
| CB-W4-T7 | ActivityFeed styling + docs | `src/components/fleet/ActivityFeed.tsx`, `docs/API-REFERENCE.md`, `docs/ROADMAP.md` | Feed styling for `budget:*` rows (§8.5); document routes/events; flip roadmap item 16 status. | W3 | S | Feed renders both severities; docs list all §6 routes and `budget:*` events. |
| CB-W4-T8 | E2E script | `packages/cli/tests/e2e/cost-budgets.e2e.ts` | Scripted §11(7) flow with a mocked usage-reporting adapter. | W3 | L | Both scenario variants pass locally; CI-skips cleanly without the mock env flag. |

**Cross-TRD coordination note**: if TRD 10 and TRD 11 run as concurrent
programs, four files are edited by both (`enums.ts`, `sqlite.ts`,
`orchestrator/types.ts`, `dispatch-coordinator.ts` + `execution/types.ts`,
`events/stream/route.ts`, core `index.ts`) — each TRD's additions are
line-disjoint and semantically independent as specced, but the conductor must
serialize those specific tasks across programs and rebase deliberately, per
`00-PROGRAM-OVERVIEW.md` §2.3.

---

*DevPilot TRD 11 — Dispatch Cost Budgets · v1.0 · Open Conjecture · July 2026*
