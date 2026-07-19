# TRD 10 — CI-Gated Wave Auto-Advance
## GitHub PR/CI Integration & Green-CI Gating · v1.0 · July 2026 · Status: DRAFT

> **Depends on: Tiers 1–3 (`spec/trd/01-TIER1-EXECUTION-LOOP.md`,
> `spec/trd/02-TIER2-SPEC-COMPLETION.md`, `spec/trd/03-TIER3-HARDENING.md`)** —
> specifically:
> - **01 (hard dependency)**: real wave dispatch —
>   `WaveDispatchCoordinator.dispatchToOrchestrator()` actually dispatches via
>   `OrchestratorService`; `CompletionListener` is wired into the orchestrator
>   status/complete callbacks; the orchestrator is initialized in the Next app;
>   pause/resume routes exist at `/api/wave-plans/[planId]/pause|resume`; the
>   claude-session adapter dispatch contract is real (no placeholder endpoints).
>   This TRD **extends** that dispatch payload and completion callback contract
>   (§7.7). Do not start until 01 has landed.
> - **03 (soft dependency)**: `integrationConfigs` persistence for integration
>   credentials, and webhook signature verification enabled in Next routes. If 03
>   has not landed, the GitHub client falls back to the same in-memory singleton
>   pattern Linear uses today (`packages/core/src/integrations/linear/client.ts:199-215`).

---

## Table of Contents

1. [Problem Statement & Goals](#1-problem-statement--goals)
2. [Current State](#2-current-state)
3. [Architecture](#3-architecture)
4. [Data Model](#4-data-model)
5. [Gate Semantics](#5-gate-semantics)
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

After Tier 1, DevPilot's wave execution loop is real: agents execute wave tasks,
report completion via `/api/orchestrator/complete`, and the
`WaveExecutionController` auto-advances to the next wave the moment every task in
the current wave reaches a terminal status
(`packages/core/src/wave-planner/execution/controller.ts:236-316`). "Complete"
here means *the agent says it finished* — nothing verifies that the code the
agent produced actually builds, lints, or passes tests. A wave-N agent can
report success with broken code, and wave-N+1 agents immediately start building
on top of it. The `CompletionReport` contract already carries a `prUrl`
(`packages/core/src/orchestrator/types.ts:53-71`) and `rufloSessions` already
stores it (`packages/core/src/db/schema/fleet.ts:21`), but DevPilot never looks
at the PR again after storing the URL.

This TRD makes CI status a first-class execution signal: agents open a PR (or
push a branch) per task/wave, DevPilot tracks the PR and its check runs via a
GitHub integration layer, and wave auto-advance is **gated on green CI**, not
just task completion.

### Goals

1. **GitHub integration layer** at `packages/core/src/integrations/github/`,
   mirroring the structure and conventions of
   `packages/core/src/integrations/linear/` (client + types + webhook-verify +
   handler + barrel).
2. **PR tracking**: every dispatched wave task is associated with a branch and
   (optionally) a PR; check-run status flows into DevPilot via webhooks with a
   polling fallback.
3. **CI gate primitive**: per-plan and per-wave gate config with three modes —
   `off`, `advisory` (warn but advance), `required` (block advance until green).
4. **New wave state `awaiting-ci`** between task completion and next-wave
   activation, integrated into the existing controller/auto-advance state
   machine.
5. **Conductor controls**: timeout alerts, manual override, check re-run
   request, and fix-task re-dispatch when CI is red.
6. **Full surface**: API routes, `ci:*` SSE events, and CI status chips/banners
   in the existing plan and fleet UI.

### Non-Goals

- **Merging PRs.** DevPilot observes CI and gates advancement; merging remains
  a human (or external automation) action. Post-merge branch cleanup is out of
  scope.
- **GitHub App multi-tenant installation flows.** v1 authenticates with a
  fine-grained PAT (or GitHub App installation token supplied as an opaque
  token). A first-class App install flow is future work.
- **Non-GitHub forges** (GitLab, Bitbucket). The gate service is
  forge-agnostic by design (it consumes `pullRequestRefs` rows), but only the
  GitHub provider is built here.
- **Creating commits/branches on the agent's behalf.** Branch creation and
  pushing is the executing agent's job, driven by dispatch-payload
  instructions (§7.7). DevPilot only creates a PR itself in the optional
  `pr-per-wave` strategy.
- **Review-approval gating** (required reviewers, CODEOWNERS). CI checks only.

---

## 2. Current State

All file references verified against the repo as of July 2026.

| Concern | Where it stands today |
|---|---|
| Wave completion → advance | `WaveExecutionController.onTaskComplete()` (`packages/core/src/wave-planner/execution/controller.ts:236-316`) marks the wave `completed` as soon as `checkWaveComplete()` sees all tasks terminal, then dispatches the next wave after `waveAdvanceDelayMs`. A parallel path exists in `autoAdvanceWave()` (`packages/core/src/wave-planner/execution/auto-advance.ts:11-41`), invoked via `CompletionListener`'s `onWaveComplete` callback (`completion-listener.ts:14,94-98`). Neither consults any external signal. |
| Wave states | `waveStatusValues = ['pending','dispatching','active','completed','failed','skipped']` (`packages/core/src/db/schema/enums.ts:58-65`). No CI-related state. |
| PR linkage | `CompletionReport.prUrl?` and `commitSha?` exist (`packages/core/src/orchestrator/types.ts:56-57`); `/api/orchestrator/complete` writes `prUrl` onto `rufloSessions` (`src/app/api/orchestrator/complete/route.ts:31-40`). No structured PR record, no CI status, no link back to wave tasks. |
| Dispatch payload | `DispatchRequest.taskSpec` (`orchestrator/types.ts:16-33`) has prompt/filePaths/model/constraints — **no branch or PR instructions**. `WaveDispatchCoordinator.buildDispatchRequest()` (`dispatch-coordinator.ts:123-137`) builds `WaveDispatchRequest` with an empty `constraints` TODO. |
| Integration precedent | `packages/core/src/integrations/linear/`: `client.ts` (SDK wrapper class + `initLinearClient`/`getLinearClient`/`isLinearConfigured` singleton), `types.ts`, `sync.ts` (webhook handler), `webhook-verify.ts` (HMAC-SHA256 + `timingSafeEqual`), `index.ts` barrel; exported as `export * as linear` from `packages/core/src/index.ts:8`. Routes at `src/app/api/integrations/linear/connect/route.ts` and `.../webhook/route.ts`. |
| Schema DDL duplication | `packages/core/src/db/adapters/sqlite.ts:13-266` embeds `createTableStatements` (raw `CREATE TABLE` DDL + `CHECK` constraints + indexes) executed at startup. **Every schema addition in this TRD must also update this DDL string** — including the `waves.status` CHECK and the `activity_events.type` CHECK. |
| SSE | `src/app/api/events/stream/route.ts` polls `activity_events` every 2 s and streams rows as SSE. Event types are constrained by `eventTypeValues` (`enums.ts:19-41`) and the uppercase CHECK list in `sqlite.ts:156`. (Known hazard: the wave executors insert lowercase types like `wave_task_complete` while the CHECK lists uppercase — pre-existing mismatch, see §10.7.) |
| UI hooks | `src/components/plan/PlanReviewCard.tsx` renders `WaveProgressBar` and calls `/api/wave-plans/[id]/pause|resume` (real after Tier 1). `src/components/fleet/RufloSessionCard.tsx` renders per-session cards. `src/components/wave-planner/` holds `WaveProgressBar`, `WaveTableView`, etc. |
| GitHub deps | None. No `@octokit/*` in any `package.json`. |

---

## 3. Architecture

```
                     GitHub (repo of the executing agents)
                        │  ▲                      ▲
      webhooks:         │  │ REST (Octokit):      │ git push / gh pr create
      check_suite,      │  │ checks, PRs,         │ (done by agent sessions,
      check_run,        │  │ re-run requests      │  per dispatch instructions)
      workflow_run,     │  │                      │
      pull_request      ▼  │                      │
┌─────────────────────────────────────────────────┴──────────────────────────┐
│ DevPilot                                                                   │
│                                                                            │
│  src/app/api/integrations/github/webhook  ──► verify sig ──┐               │
│  src/app/api/integrations/github/connect                   ▼               │
│                                          ┌──────────────────────────────┐  │
│  packages/core/src/integrations/github/  │  GitHubWebhookHandler        │  │
│  ┌────────────────────┐                  │  (event → pullRequestRefs    │  │
│  │ DevPilotGitHub-    │◄─────────────────│   upsert → gate notify)      │  │
│  │ Client (Octokit)   │                  └──────────────┬───────────────┘  │
│  └─────────▲──────────┘                                 │                  │
│            │ poll fallback / reconcile                  ▼                  │
│  ┌─────────┴──────────┐            ┌────────────────────────────────────┐  │
│  │ GitHubCiPoller     │───────────►│ CiGateService                      │  │
│  └────────────────────┘  check     │ (wave-planner/execution/ci-gate.ts)│  │
│                          updates   │ • resolve gate config (plan/wave)  │  │
│                                    │ • evaluate: all wave PRs green?    │  │
│  ┌──────────────────────────────┐  │ • timeout sweep, override, re-run  │  │
│  │ WaveExecutionController      │◄─┤ • emits ci:* events                │  │
│  │ + CompletionListener         │  └────────────────────────────────────┘  │
│  │  all tasks terminal ──►      │                                          │
│  │  wave 'awaiting-ci' ──gate──►│  gate passed → wave 'completed'          │
│  │  auto-advance next wave      │  gate failed (required) → plan 'paused'  │
│  └──────────────┬───────────────┘                                          │
│                 │ dispatch payload now carries git/PR instructions         │
│                 ▼                                                          │
│  OrchestratorService ──► agent sessions ──► POST /api/orchestrator/        │
│                                             status | complete (prUrl,      │
│                                             branchName, prNumber)          │
└────────────────────────────────────────────────────────────────────────────┘
```

### Component responsibilities

| Component | Responsibility |
|---|---|
| `DevPilotGitHubClient` | Typed GitHub REST access (Octokit): fetch PRs by branch, list check runs for a SHA, re-request check suites, re-run failed workflow runs, create PR (pr-per-wave strategy only). Singleton lifecycle mirrors the Linear client. |
| `GitHubWebhookHandler` | Translate `check_suite` / `check_run` / `workflow_run` / `pull_request` webhook payloads into `pullRequestRefs` upserts and forward check-state changes to `CiGateService.onCheckUpdate()`. |
| `verifyGitHubWebhookSignature` | HMAC-SHA256 verification of `X-Hub-Signature-256` against the raw request body, timing-safe — same shape as `verifyLinearWebhookSignature`. |
| `GitHubCiPoller` | Pull-based fallback + reconciliation: for tracked open PRs, poll check-run status when webhooks are not configured (`CI_POLL_INTERVAL_SECONDS`) and run a low-frequency reconcile sweep even when they are (§10.1). |
| `CiGateService` | The gate brain. Resolves effective gate config (wave override → plan default → env default), evaluates whether a wave's linked PRs are green, drives gate state transitions, handles timeout/override/re-run, and calls back into the controller to release or block advancement. |
| `WaveExecutionController` / `CompletionListener` / `autoAdvanceWave` | Extended: on last-task-terminal, transition the wave to `awaiting-ci` (instead of `completed`) whenever the effective gate mode ≠ `off`, and only advance when `CiGateService` resolves the gate. |
| `WaveDispatchCoordinator` | Extended: computes the branch name per task, injects the `git` block into the dispatch payload, and (in `pr-per-wave` mode) pre-creates the shared wave branch PR record. |
| Next routes | Connect/webhook endpoints under `/api/integrations/github/*`; gate state/config/override/re-run under `/api/wave-plans/[planId]/ci-gate*`. |
| UI | `CiStatusChip`, `CiGateBanner`, override dialog; wired into `WaveProgressBar`, `RufloSessionCard`, `PlanReviewCard`. |

### Octokit vs raw REST — decision

**Use `@octokit/rest`** (server-side only, in `packages/core`):

1. **Precedent**: the Linear integration uses the official `@linear/sdk` rather
   than raw GraphQL — the house pattern is "official SDK wrapped in a thin
   DevPilot client class".
2. **Checks API ergonomics**: check runs/suites require pagination,
   `Accept` header handling, and rate-limit awareness; `@octokit/rest` +
   `@octokit/plugin-retry` + `@octokit/plugin-throttling` give this for free,
   which matters for the polling fallback.
3. **Typed responses** eliminate a class of parsing bugs in webhook/poll
   reconciliation, where the same check data arrives via two shapes.

Webhook **signature verification is hand-rolled** (Node `crypto`, ~40 lines)
rather than pulling `@octokit/webhooks` — mirroring
`linear/webhook-verify.ts` exactly, which is already tested house code, and
keeping the dependency surface minimal.

---

## 4. Data Model

House conventions followed (from `packages/core/src/db/schema/wave-planner.ts`
and `fleet.ts`): `sqliteTable`, cuid2 text PKs via `$defaultFn(() => createId())`,
`integer(..., { mode: 'timestamp' })` dates, `text(..., { enum: ... })` backed by
`as const` value arrays in `enums.ts`, `{ mode: 'json' }` columns with `$type<>`,
`relations()` blocks, and `$inferSelect`/`$inferInsert` type exports. New file:
`packages/core/src/db/schema/ci.ts`, exported from `schema/index.ts`.

### 4.1 Enum additions — `packages/core/src/db/schema/enums.ts`

```typescript
// CI gate enums (TRD 10)
export const ciGateModeValues = ['off', 'advisory', 'required'] as const;
export type CiGateMode = (typeof ciGateModeValues)[number];

export const ciGateStateValues = [
  'idle',        // wave not yet awaiting CI
  'waiting',     // wave tasks done, checks pending
  'passed',      // all required checks green
  'failed',      // at least one required check red
  'timed-out',   // pending longer than timeoutMinutes
  'overridden',  // conductor forced advance
] as const;
export type CiGateState = (typeof ciGateStateValues)[number];

export const ciStatusValues = ['unknown', 'pending', 'passing', 'failing'] as const;
export type CiStatus = (typeof ciStatusValues)[number];

export const prStateValues = ['draft', 'open', 'merged', 'closed'] as const;
export type PrState = (typeof prStateValues)[number];

export const prStrategyValues = ['pr-per-task', 'pr-per-wave', 'branch-only'] as const;
export type PrStrategy = (typeof prStrategyValues)[number];
```

`waveStatusValues` gains one member (placed before the terminal states):

```typescript
export const waveStatusValues = [
  'pending',
  'dispatching',
  'active',
  'awaiting-ci',   // NEW: all tasks terminal, CI gate unresolved
  'completed',
  'failed',
  'skipped',
] as const;
```

`eventTypeValues` gains:

```typescript
  // CI gate events (TRD 10)
  'CI_PR_LINKED',
  'CI_CHECK_UPDATE',
  'CI_GATE_PASSED',
  'CI_GATE_BLOCKED',
  'CI_GATE_TIMEOUT',
  'CI_GATE_OVERRIDDEN',
```

### 4.2 New tables — `packages/core/src/db/schema/ci.ts`

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import {
  ciGateModeValues,
  ciGateStateValues,
  ciStatusValues,
  prStateValues,
} from './enums';
import { wavePlans } from './wave-planner';
import { rufloSessions } from './fleet';

// ============================================================================
// CI Gates — per-wave gate config + state (waveIndex NULL = plan-level default)
// ============================================================================

export const ciGates = sqliteTable('ci_gates', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  wavePlanId: text('wave_plan_id').notNull(),
  waveIndex: integer('wave_index'),                    // NULL → plan-level default row
  mode: text('mode', { enum: ciGateModeValues }).notNull().default('off'),
  requiredChecks: text('required_checks', { mode: 'json' })
    .$type<string[]>().notNull().default([]),          // [] → all checks required
  timeoutMinutes: integer('timeout_minutes').notNull().default(30),
  state: text('state', { enum: ciGateStateValues }).notNull().default('idle'),
  waitingSince: integer('waiting_since', { mode: 'timestamp' }),
  resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
  overrideReason: text('override_reason'),
  overriddenBy: text('overridden_by'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull().$defaultFn(() => new Date()),
});

export const ciGatesRelations = relations(ciGates, ({ one }) => ({
  wavePlan: one(wavePlans, {
    fields: [ciGates.wavePlanId],
    references: [wavePlans.id],
  }),
}));

// ============================================================================
// Pull Request Refs — session/wave/task → PR mapping + CI status
// ============================================================================

export interface CheckRunSummary {
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion:
    | 'success' | 'failure' | 'neutral' | 'cancelled'
    | 'timed_out' | 'action_required' | 'skipped' | 'stale' | null;
  detailsUrl: string | null;
  completedAt: string | null;                          // ISO timestamp
}

export const pullRequestRefs = sqliteTable('pull_request_refs', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  sessionId: text('session_id'),                       // NULL until callback links it (§10.3)
  wavePlanId: text('wave_plan_id'),
  waveIndex: integer('wave_index'),
  taskCode: text('task_code'),                         // NULL for pr-per-wave shared PRs
  repo: text('repo').notNull(),                        // "owner/name"
  branchName: text('branch_name').notNull(),
  prNumber: integer('pr_number'),                      // NULL for branch-only strategy
  prUrl: text('pr_url'),
  headSha: text('head_sha'),
  prState: text('pr_state', { enum: prStateValues }).notNull().default('open'),
  ciStatus: text('ci_status', { enum: ciStatusValues }).notNull().default('unknown'),
  checkSummary: text('check_summary', { mode: 'json' })
    .$type<CheckRunSummary[]>().notNull().default([]),
  rerunCount: integer('rerun_count').notNull().default(0),
  lastEventAt: integer('last_event_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull().$defaultFn(() => new Date()),
});

export const pullRequestRefsRelations = relations(pullRequestRefs, ({ one }) => ({
  wavePlan: one(wavePlans, {
    fields: [pullRequestRefs.wavePlanId],
    references: [wavePlans.id],
  }),
  session: one(rufloSessions, {
    fields: [pullRequestRefs.sessionId],
    references: [rufloSessions.id],
  }),
}));

// ============================================================================
// Type Exports
// ============================================================================

export type CiGate = typeof ciGates.$inferSelect;
export type NewCiGate = typeof ciGates.$inferInsert;
export type PullRequestRef = typeof pullRequestRefs.$inferSelect;
export type NewPullRequestRef = typeof pullRequestRefs.$inferInsert;
```

### 4.3 SQLite adapter DDL — `packages/core/src/db/adapters/sqlite.ts`

The embedded `createTableStatements` (`sqlite.ts:13-266`) must gain, verbatim:

```sql
-- CI Gates
CREATE TABLE IF NOT EXISTS ci_gates (
  id TEXT PRIMARY KEY,
  wave_plan_id TEXT NOT NULL REFERENCES wave_plans(id) ON DELETE CASCADE,
  wave_index INTEGER,
  mode TEXT NOT NULL DEFAULT 'off' CHECK(mode IN ('off', 'advisory', 'required')),
  required_checks TEXT NOT NULL DEFAULT '[]',
  timeout_minutes INTEGER NOT NULL DEFAULT 30,
  state TEXT NOT NULL DEFAULT 'idle' CHECK(state IN ('idle', 'waiting', 'passed', 'failed', 'timed-out', 'overridden')),
  waiting_since INTEGER,
  resolved_at INTEGER,
  override_reason TEXT,
  overridden_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Pull Request Refs
CREATE TABLE IF NOT EXISTS pull_request_refs (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  wave_plan_id TEXT REFERENCES wave_plans(id) ON DELETE CASCADE,
  wave_index INTEGER,
  task_code TEXT,
  repo TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  pr_number INTEGER,
  pr_url TEXT,
  head_sha TEXT,
  pr_state TEXT NOT NULL DEFAULT 'open' CHECK(pr_state IN ('draft', 'open', 'merged', 'closed')),
  ci_status TEXT NOT NULL DEFAULT 'unknown' CHECK(ci_status IN ('unknown', 'pending', 'passing', 'failing')),
  check_summary TEXT NOT NULL DEFAULT '[]',
  rerun_count INTEGER NOT NULL DEFAULT 0,
  last_event_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ci_gates_wave_plan_id ON ci_gates(wave_plan_id);
CREATE INDEX IF NOT EXISTS idx_pull_request_refs_wave_plan_id ON pull_request_refs(wave_plan_id);
CREATE INDEX IF NOT EXISTS idx_pull_request_refs_branch ON pull_request_refs(repo, branch_name);
CREATE INDEX IF NOT EXISTS idx_pull_request_refs_ci_status ON pull_request_refs(ci_status);
```

Additionally, two existing CHECK constraints must be widened in the same DDL
string:
- `waves.status` CHECK gains `'awaiting-ci'` (`sqlite.ts:193`).
- `activity_events.type` CHECK gains the six `CI_*` values (`sqlite.ts:156`).

> **Migration note**: `CREATE TABLE IF NOT EXISTS` does not alter existing
> databases. The schema task must ship an idempotent migration snippet (executed
> in `createSQLiteAdapter` after `exec`) that rebuilds `waves` and
> `activity_events` CHECKs for pre-existing DB files, or documents `devpilot db
> reset` as the upgrade path — follow whichever convention Tier 1 established
> for its own enum widening.

---

## 5. Gate Semantics

### 5.1 Effective gate resolution

For wave *W* of plan *P*, the effective gate config is resolved most-specific-first:

1. `ciGates` row with `wavePlanId = P, waveIndex = W` (per-wave override), else
2. `ciGates` row with `wavePlanId = P, waveIndex = NULL` (plan default), else
3. Environment default `CI_GATE_DEFAULT_MODE` (default `off`).

`mode = 'off'` short-circuits: waves complete exactly as they do today, and no
`awaiting-ci` transition occurs. Rows are created lazily — a plan with no gate
configured has zero `ciGates` rows.

### 5.2 Wave state machine (extended)

```
 pending ─► dispatching ─► active ─► [all tasks terminal]
                                          │
                          gate mode off?  ├── yes ──► completed ─► auto-advance
                                          │
                                          ▼ no
                                     awaiting-ci        (gate.state = 'waiting')
                                          │
        ┌─────────────────┬───────────────┼──────────────────┬─────────────────┐
        ▼                 ▼               ▼                  ▼                 ▼
  all checks green   check failed    timeout expiry     conductor         PR closed
  (or advisory:      (required)      (gate 'timed-out', override          unmerged
  any resolution)    gate 'failed'   conductor alert;   (gate            (treated as
  gate 'passed'      plan PAUSED     wave stays         'overridden')    check failure,
        │            via controller  awaiting-ci)             │           §10.4)
        ▼            .pause())            │                   ▼
    completed             │          override or          completed
        │                 │          checks resolve           │
        ▼                 ▼               │                   ▼
   auto-advance      conductor: re-run /  └──────────►   auto-advance
   next wave         override / fix task
```

Plan-level statuses are **unchanged** — a blocked required gate reuses the
existing `paused` plan status (set through `WaveExecutionController.pause()`),
so the Tier-1 pause/resume routes and all existing UI handling of `paused`
apply without modification.

### 5.3 Mode behavior

| Mode | Checks pending | Checks green | Checks red | Timeout |
|---|---|---|---|---|
| `off` | ignored | ignored | ignored | n/a |
| `advisory` | wave `awaiting-ci`, advance **not** blocked: after `waveAdvanceDelayMs` the wave completes and advances, gate keeps evaluating in the background and emits `ci:gate-blocked` as a warning if checks later fail | gate `passed`, `ci:gate-passed` | gate `failed`, `ci:gate-blocked` (warning severity), plan **continues** | `ci:gate-timeout` warning only |
| `required` | wave holds in `awaiting-ci` | gate `passed`, wave `completed`, auto-advance fires | gate `failed`, plan `paused`, `ci:gate-blocked`; conductor chooses re-run / override / fix dispatch | gate `timed-out`, `ci:gate-timeout` + assist alert; wave stays `awaiting-ci` until checks resolve or override |

### 5.4 Green definition

A wave's gate passes when **every** `pullRequestRefs` row linked to the wave
(matching `wavePlanId + waveIndex`, `prState` ∈ {`open`,`draft`,`merged`}) has
`ciStatus = 'passing'`. A PR is `passing` when every *required* check run on its
`headSha` has `status = 'completed'` with conclusion `success`, `neutral`, or
`skipped`. If `requiredChecks` is non-empty, only check runs whose `name` is in
that list are considered (a listed check that never reports counts as pending →
timeout path). A wave with **zero** linked PR refs and mode `required` cannot
pass — it times out with a distinct message ("no PR reported by any task"),
prompting override or investigation. Failure conclusions: `failure`,
`timed_out`, `cancelled`, `action_required`, `stale`.

### 5.5 Failure-recovery actions (required mode, gate `failed`)

1. **Re-run request** — `POST .../ci-gate/rerun`: for each failing PR ref, call
   `rerequestCheckSuite` (Checks API) or `rerunFailedJobs` (Actions API) based
   on what produced the failing run; increments `rerunCount`; gate returns to
   `waiting`, plan stays `paused` until green (then auto-resume, §7.5).
2. **Override** — `POST .../ci-gate/override`: gate `overridden`, wave
   `completed`, plan resumed, advance fires. Reason string is mandatory and
   recorded (`overrideReason`, `overriddenBy`) and emitted in the SSE event.
3. **Fix-task re-dispatch** — conductor triggers the existing Tier-1 replan /
   reoptimize flow (`/api/items/[id]/wave-plan/reoptimize`) with an
   auto-composed constraint containing the failing check names and
   `detailsUrl`s. This TRD ships the UI affordance and the constraint
   composition helper only — the reoptimize machinery is existing.

---

## 6. API Surface

All routes are Next.js route handlers under `src/app/api/`, JSON envelope,
errors as `{ error: string }` (house style per `00-PROGRAM-OVERVIEW.md` §3.2).

### 6.1 `POST /api/integrations/github/connect`

Configure the GitHub integration (mirrors `linear/connect`).

Request:
```json
{ "token": "github_pat_...", "webhookSecret": "whsec-...", "defaultRepo": "openconjecture/ng-pipelines" }
```
Response `200`:
```json
{ "success": true, "authenticatedAs": "garrett-oc", "scopes": ["repo", "checks:read"], "webhookConfigured": true }
```
Errors: `400` missing token; `401` token rejected by GitHub; `500` other.
`GET` returns `{ configured, authenticatedAs?, defaultRepo?, webhookConfigured }`;
`DELETE` clears the singleton (and the `integrationConfigs` row once TRD 03 has
landed).

### 6.2 `POST /api/integrations/github/webhook`

Receiver for `check_suite`, `check_run`, `workflow_run`, `pull_request` events.

- Reads the **raw body** (`await request.text()`) before JSON parsing —
  signature is computed over raw bytes.
- Verifies `X-Hub-Signature-256` with `verifyGitHubWebhookSignature`; on
  failure returns `401 { error: 'invalid signature' }`. If
  `GITHUB_WEBHOOK_SECRET` is unset, returns `503` (webhooks disabled → polling
  mode) rather than accepting unverified payloads.
- Dispatches on the `X-GitHub-Event` header to `handleGitHubWebhook`.
- Always `200 { handled: boolean, action?: string }` for verified events, even
  unhandled types (so GitHub does not retry storms). `GET` returns
  `{ status: 'ok', service: 'devpilot-github-webhook' }` for ping.

Handled payload → effect matrix:

| Event / action | Effect |
|---|---|
| `pull_request` / `opened`, `ready_for_review`, `reopened` | Upsert `pullRequestRefs` by `(repo, branchName)`; set `prNumber`, `prUrl`, `headSha`, `prState` |
| `pull_request` / `synchronize` | Update `headSha`, reset `ciStatus → 'pending'`, clear `checkSummary` (force-push / new commits invalidate old checks, §10.2) |
| `pull_request` / `closed` | `prState → merged` if `merged: true` else `closed`; unmerged-close triggers §10.4 |
| `check_run` / `created`, `completed`, `rerequested` | Merge into `checkSummary` for the ref matching `headSha`; recompute `ciStatus`; notify gate |
| `check_suite` / `completed` | Recompute `ciStatus` from suite conclusion; notify gate |
| `workflow_run` / `completed` | Same as check_suite for repos using Actions without the Checks API granularity |

### 6.3 `GET /api/wave-plans/[planId]/ci-gate`

Response `200`:
```json
{
  "planDefault": { "mode": "required", "requiredChecks": [], "timeoutMinutes": 30 },
  "waveOverrides": [ { "waveIndex": 3, "mode": "advisory" } ],
  "activeGate": {
    "waveIndex": 2, "state": "waiting", "waitingSince": "2026-07-19T14:02:11Z",
    "pullRequests": [
      {
        "taskCode": "2.1", "repo": "openconjecture/ng-pipelines",
        "branchName": "devpilot/k3x9/w2-2.1", "prNumber": 118,
        "prUrl": "https://github.com/openconjecture/ng-pipelines/pull/118",
        "prState": "open", "ciStatus": "pending",
        "checkSummary": [ { "name": "test", "status": "in_progress", "conclusion": null, "detailsUrl": "...", "completedAt": null } ]
      }
    ]
  }
}
```
`activeGate` is `null` when no wave is `awaiting-ci`. `404` unknown plan.

### 6.4 `PATCH /api/wave-plans/[planId]/ci-gate`

Upsert gate config. Request:
```json
{ "waveIndex": null, "mode": "required", "requiredChecks": ["build", "test"], "timeoutMinutes": 45 }
```
`waveIndex: null` targets the plan default; an integer targets that wave.
Response `200 { gate: CiGate }`. Errors: `400` invalid mode/waveIndex out of
range; `404` unknown plan; `409` attempting to loosen a gate for a wave that is
currently `awaiting-ci` with state `failed` (must use override instead — keeps
the audit trail honest).

### 6.5 `POST /api/wave-plans/[planId]/ci-gate/override`

Request: `{ "reason": "flaky e2e, verified locally", "actor": "conductor" }`
(`reason` required, min length 4). Effect: §5.5(2). Response
`200 { overridden: true, advancedToWave: 3 }`. Errors: `400` missing reason;
`409` no wave currently `awaiting-ci`; `404` unknown plan.

### 6.6 `POST /api/wave-plans/[planId]/ci-gate/rerun`

Request: `{ "prNumbers": [118] }` (optional; default = all failing refs of the
awaiting wave). Effect: §5.5(1). Response
`200 { requested: [{ "prNumber": 118, "method": "rerequest_check_suite" }] }`.
Errors: `409` gate not in `failed`/`timed-out`; `502` GitHub API rejection
(propagated message).

### 6.7 SSE events — namespace `ci:*`

Persisted to `activity_events` with the uppercase DB type, streamed with the
lowercase wire `type` by the existing stream route mapping (§7.8):

| Wire type | DB type | Payload (metadata) |
|---|---|---|
| `ci:pr-linked` | `CI_PR_LINKED` | `{ wavePlanId, waveIndex, taskCode, repo, prNumber, prUrl, branchName }` |
| `ci:check-update` | `CI_CHECK_UPDATE` | `{ wavePlanId, waveIndex, prNumber, ciStatus, changedCheck: { name, status, conclusion } }` |
| `ci:gate-passed` | `CI_GATE_PASSED` | `{ wavePlanId, waveIndex, durationMs }` |
| `ci:gate-blocked` | `CI_GATE_BLOCKED` | `{ wavePlanId, waveIndex, mode, failingChecks: [{ prNumber, name, detailsUrl }] }` |
| `ci:gate-timeout` | `CI_GATE_TIMEOUT` | `{ wavePlanId, waveIndex, pendingChecks: string[], timeoutMinutes }` |
| `ci:gate-overridden` | `CI_GATE_OVERRIDDEN` | `{ wavePlanId, waveIndex, reason, actor }` |

---

## 7. Core Services

### 7.1 `packages/core/src/integrations/github/types.ts`

```typescript
export interface GitHubConfig {
  token: string;                       // fine-grained PAT or installation token
  webhookSecret?: string;
  defaultRepo?: string;                // "owner/name"
  apiBaseUrl?: string;                 // GHES support; default https://api.github.com
}

export interface PullRequestInfo {
  number: number;
  url: string;
  state: 'open' | 'closed';
  merged: boolean;
  draft: boolean;
  headRef: string;                     // branch name
  headSha: string;
  baseRef: string;
  title: string;
}

export type { CheckRunSummary } from '../../db/schema/ci';

export interface CiSnapshot {
  headSha: string;
  overall: 'pending' | 'passing' | 'failing';
  checks: CheckRunSummary[];
}

/** Discriminated union of the webhook payload subset DevPilot consumes. */
export type GitHubWebhookEvent =
  | { event: 'pull_request'; action: string; payload: PullRequestWebhookPayload }
  | { event: 'check_run'; action: string; payload: CheckRunWebhookPayload }
  | { event: 'check_suite'; action: string; payload: CheckSuiteWebhookPayload }
  | { event: 'workflow_run'; action: string; payload: WorkflowRunWebhookPayload };
```

(Payload interfaces model only the fields consumed: `repository.full_name`,
`pull_request.{number,html_url,state,merged,draft,head.{ref,sha},base.ref}`,
`check_run.{name,status,conclusion,details_url,completed_at,head_sha,check_suite.id}`,
`check_suite.{head_sha,head_branch,status,conclusion}`,
`workflow_run.{head_sha,head_branch,status,conclusion,name,html_url}`.)

### 7.2 `packages/core/src/integrations/github/client.ts`

```typescript
export class DevPilotGitHubClient {
  constructor(config: GitHubConfig);
  getOctokit(): Octokit;                                        // escape hatch, mirrors getClient()
  async whoAmI(): Promise<{ login: string; scopes: string[] }>;
  async getPullRequest(repo: string, prNumber: number): Promise<PullRequestInfo | null>;
  async findPullRequestByBranch(repo: string, branchName: string): Promise<PullRequestInfo | null>;
  async getCiSnapshot(repo: string, ref: string, requiredChecks?: string[]): Promise<CiSnapshot>;
  async rerequestCheckSuite(repo: string, checkSuiteId: number): Promise<void>;
  async rerunFailedJobs(repo: string, workflowRunId: number): Promise<void>;
  async createPullRequest(repo: string, params: {
    head: string; base: string; title: string; body: string; draft?: boolean;
  }): Promise<PullRequestInfo>;                                 // pr-per-wave strategy only
}

// Singleton lifecycle — identical shape to linear/client.ts:199-215
export function initGitHubClient(config: GitHubConfig): DevPilotGitHubClient;
export function getGitHubClient(): DevPilotGitHubClient;        // throws if uninitialized
export function isGitHubConfigured(): boolean;
```

Behavior notes: `getCiSnapshot` pages through
`GET /repos/{owner}/{repo}/commits/{ref}/check-runs` (deduping by check `name`,
keeping the latest run per name), filters to `requiredChecks` when non-empty,
and derives `overall` per §5.4. Octokit is constructed with retry + throttling
plugins; all methods surface GitHub errors as thrown `Error` with the status
code in the message (callers map to `502`).

### 7.3 `packages/core/src/integrations/github/webhook-verify.ts`

```typescript
export function verifyGitHubWebhookSignature(
  payload: string,          // RAW request body
  signature: string,        // "sha256=<hex>" from X-Hub-Signature-256
  secret: string
): { valid: boolean; error?: string };
```

Implementation is a line-for-line adaptation of
`linear/webhook-verify.ts` (HMAC-SHA256, length check, `timingSafeEqual`), with
the header name and doc comment changed.

### 7.4 `packages/core/src/integrations/github/webhook-handler.ts`

```typescript
export interface WebhookHandleResult {
  handled: boolean;
  action?: string;                     // e.g. "pr-linked", "check-updated", "pr-closed"
  prRefId?: string;
}

export async function handleGitHubWebhook(
  eventName: string,                   // X-GitHub-Event header
  payload: unknown
): Promise<WebhookHandleResult>;
```

Behavior: validates/narrows the payload, performs the upsert matrix of §6.2
against `pullRequestRefs` (match key: `(repo, branchName)`; fall back to
`(repo, prNumber)`), stamps `lastEventAt`, emits `CI_PR_LINKED` /
`CI_CHECK_UPDATE` activity events, and calls
`getCiGateService().onCheckUpdate(prRef)` when a tracked ref's `ciStatus`
changed. Events for untracked branches (no matching ref and branch name not
matching the `devpilot/` prefix) return `{ handled: false }`.

### 7.5 `packages/core/src/wave-planner/execution/ci-gate.ts`

```typescript
export interface EffectiveGateConfig {
  mode: CiGateMode;
  requiredChecks: string[];
  timeoutMinutes: number;
  source: 'wave' | 'plan' | 'env-default';
}

export type GateDecision =
  | { kind: 'advance' }                          // off, or passed, or advisory
  | { kind: 'hold' }                             // required + pending
  | { kind: 'block'; failing: CheckRunSummary[] }; // required + failed

export class CiGateService {
  constructor(deps: {
    controller: WaveExecutionController;         // for pause()/resume paths
    onAdvance: (wavePlanId: string, waveIndex: number) => Promise<void>;
  });

  async resolveGate(wavePlanId: string, waveIndex: number): Promise<EffectiveGateConfig>;

  /** Called by controller/CompletionListener when a wave's tasks are all terminal.
   *  Returns the initial decision; on 'hold' it flips the wave to 'awaiting-ci'
   *  and gate state to 'waiting' (stamping waitingSince). */
  async enterGate(wavePlanId: string, waveIndex: number): Promise<GateDecision>;

  /** Called by webhook handler / poller on any tracked check-state change.
   *  Re-evaluates the awaiting wave; on pass → marks gate 'passed', wave
   *  'completed', resumes the plan if it was gate-paused, invokes onAdvance.
   *  On fail (required) → gate 'failed', controller.pause(), emit ci:gate-blocked. */
  async onCheckUpdate(prRef: PullRequestRef): Promise<void>;

  async override(wavePlanId: string, reason: string, actor: string): Promise<{ advancedToWave: number }>;
  async requestRerun(wavePlanId: string, prNumbers?: number[]): Promise<RerunResult[]>;

  /** Timeout sweep — invoked on an interval (started with orchestrator init in
   *  the Next instrumentation hook from Tier 1). Marks gates 'timed-out' past
   *  timeoutMinutes and emits ci:gate-timeout once per gate. */
  async sweepTimeouts(now?: Date): Promise<void>;

  start(intervalMs?: number): void;              // starts sweep + poller if polling mode
  stop(): void;
}

export function initCiGateService(deps: ...): CiGateService;
export function getCiGateService(): CiGateService;
export function isCiGateServiceInitialized(): boolean;
```

**Auto-resume rule**: if the plan's `paused` status was set *by the gate*
(recorded via the gate row's `state = 'failed'`), a subsequent green
re-evaluation resumes the plan automatically through the Tier-1 resume path. A
manually paused plan is never auto-resumed by the gate.

### 7.6 Executor modifications

- **`controller.ts`** — `onTaskComplete()` (line 236): where the wave is
  currently marked `completed` (lines 265-315), first call
  `ciGateService.enterGate(wavePlanId, waveIndex)`. On `{ kind: 'advance' }`
  proceed exactly as today; on `hold`/`block` do **not** mark completed / do not
  advance (the gate service owns the transition from here). The `isLastWave`
  branch also routes through the gate — a required gate on the final wave holds
  plan completion until green.
- **`completion-listener.ts`** — no signature change; its `onWaveComplete`
  callback (constructor arg, line 14) is now wired (in the Tier-1 wiring site)
  to a function that calls `enterGate` before `autoAdvanceWave`.
- **`auto-advance.ts`** — `autoAdvanceWave()` gains a precondition: it is only
  invoked for gate-cleared waves (called from `CiGateService.onAdvance` or
  directly when mode is `off`). No internal changes beyond a doc comment; the
  gate owns sequencing.
- **`dispatch-coordinator.ts`** — `buildDispatchRequest()` (line 123) gains the
  `git` block (§7.7): branch name computed as
  `devpilot/{wavePlanId.slice(0,6)}/w{waveIndex + 1}-{taskCode}` (config
  template §9), PR strategy from config. In `pr-per-wave` mode it also
  pre-inserts one `pullRequestRefs` row per wave with the shared branch
  `devpilot/{planShort}/wave-{n}` and `taskCode: null`.
- **`execution/types.ts`** — `WaveExecutionConfig` gains
  `ciGate: { defaultMode: CiGateMode; timeoutMinutes: number; prStrategy: PrStrategy; branchTemplate: string }`.

### 7.7 Dispatch/callback contract extension (extends TRD 01)

The claude-session dispatch contract defined in
`spec/trd/01-TIER1-EXECUTION-LOOP.md` is extended — these fields are this TRD's
**reserved contract surface** (per `00-PROGRAM-OVERVIEW.md` §2.3, TRDs 10 and 12
must not collide on contract fields):

`TaskSpec` (`packages/core/src/orchestrator/types.ts:25-33`) gains an optional
block, threaded through `CreateSessionParams`
(`claude-session-adapter.ts:41-56`) unchanged:

```typescript
export interface GitInstructions {
  branchName: string;                  // agent MUST create/checkout this branch
  baseBranch: string;                  // default "main"
  openPr: boolean;                     // false for 'branch-only' / 'pr-per-wave'
  prTitle?: string;                    // e.g. "[DevPilot w2] 2.1 TypeScript interfaces"
  prBodyTemplate?: string;             // includes wavePlanId/taskCode markers
}

export interface TaskSpec {
  // ...existing fields (prompt, filePaths, model, workstream,
  //    acceptanceCriteria, constraints, estimatedMinutes)...
  git?: GitInstructions;               // NEW (TRD 10)
}
```

`CompletionReport` (`orchestrator/types.ts:53-71`) — `prUrl` and `commitSha`
already exist; gains:

```typescript
  branchName?: string;                 // NEW (TRD 10)
  prNumber?: number;                   // NEW (TRD 10)
```

`/api/orchestrator/complete` (existing route,
`src/app/api/orchestrator/complete/route.ts`) additionally: upserts the
`pullRequestRefs` row for `(repo, branchName)` — linking `sessionId`,
`wavePlanId`, `waveIndex`, `taskCode` from the session's wave-task association
established in Tier 1 — and emits `ci:pr-linked`. If a webhook already created
the row (race, §10.3), the upsert fills the session linkage fields.

### 7.8 SSE stream mapping — `src/app/api/events/stream/route.ts`

The stream route gains a static map from DB event types to wire types
(`CI_GATE_PASSED → 'ci:gate-passed'`, etc.); rows whose type starts with `CI_`
are emitted with the mapped lowercase `type` and their `metadata` verbatim.
While a wave is `awaiting-ci`, the existing `wave_plan_heartbeat` payload gains
`awaitingCi: { waveIndex, ciStatus, pendingChecks: number, failingChecks: number }`.

### 7.9 Barrel & package exports

- `packages/core/src/integrations/github/index.ts`:
  `export * from './types' | './client' | './webhook-verify' | './webhook-handler' | './poller';`
- `packages/core/src/index.ts`: add `export * as github from './integrations/github';`
  (matches `export * as linear`, line 8).
- `packages/core/package.json`: add `@octokit/rest`, `@octokit/plugin-retry`,
  `@octokit/plugin-throttling`.

---

## 8. UI

Component conventions follow `src/components/plan/` / `src/components/fleet/`:
`'use client'`, typed props interfaces, `cn()` from `@/lib/utils`, Zustand
stores from `@/stores`, primitives from `@/components/ui/*`.

### 8.1 `src/components/ci/CiStatusChip.tsx` (new)

```typescript
interface CiStatusChipProps {
  ciStatus: 'unknown' | 'pending' | 'passing' | 'failing';
  prUrl?: string | null;
  prNumber?: number | null;
  compact?: boolean;              // icon-only for wave progress rows
}
```
States: `unknown` → gray dash; `pending` → amber pulsing dot + "CI"; `passing`
→ green check + "#118"; `failing` → red cross + "#118". Chip is an `<a>` to
`prUrl` when present. Used in:
- `src/components/plan/WaveProgressBar.tsx` — one compact chip per wave row
  when any PR ref exists for that wave; the `awaiting-ci` wave row renders
  `⏳ awaiting CI` in place of the `pending`/`complete` label.
- `src/components/wave-planner/WaveTableView.tsx` — per-task chip column.
- `src/components/fleet/RufloSessionCard.tsx` — chip next to the existing
  `prUrl` display in the expanded card body.

### 8.2 `src/components/ci/CiGateBanner.tsx` (new)

```typescript
interface CiGateBannerProps {
  planId: string;                 // wavePlanId
  gate: ActiveGateView;           // from GET /api/wave-plans/[planId]/ci-gate
  onOverride: (reason: string) => Promise<void>;
  onRerun: () => Promise<void>;
  onFixTask: () => void;          // opens reoptimize flow pre-filled (§5.5.3)
}
```
Rendered inside `PlanReviewCard` (between `WaveProgressBar` and the action
buttons) whenever `activeGate` is non-null. Visual states: waiting (amber, list
of pending checks + elapsed timer vs `timeoutMinutes`), blocked (red, failing
check list with `detailsUrl` links, three action buttons), timed-out (amber/red
striped, same actions), advisory-warning (amber outline, dismissible).
Override opens an inline confirm requiring the reason text (min 4 chars).

### 8.3 `src/components/ci/CiGateSettings.tsx` (new)

Mode selector (`off`/`advisory`/`required`), required-checks tag input,
timeout minutes input; per-plan default plus per-wave override rows. Rendered
in the `PlanReviewCard` expanded settings area and PATCHes §6.4.

### 8.4 Store — `src/stores/ciStore.ts` (new)

Zustand store: `gateByPlanId: Record<string, GateStateView>`,
`prRefsByWaveKey: Record<string, PullRequestRefView[]>`; actions
`loadGate(planId)`, `applyCiEvent(sseEvent)` (subscribed from the existing
`useSSE` hook for `ci:*` types), `override`, `rerun`, `patchConfig`.

---

## 9. Configuration

### 9.1 Environment variables

```bash
# GitHub integration (TRD 10)
GITHUB_TOKEN=                         # fine-grained PAT; enables the integration
GITHUB_WEBHOOK_SECRET=                # unset → webhook route returns 503, polling mode on
GITHUB_API_BASE_URL=                  # optional, GHES
GITHUB_DEFAULT_REPO=                  # "owner/name" fallback when session repo is bare

# CI gate
CI_GATE_DEFAULT_MODE=off              # off | advisory | required
CI_GATE_TIMEOUT_MINUTES=30
CI_GATE_PR_STRATEGY=pr-per-task       # pr-per-task | pr-per-wave | branch-only
CI_GATE_BRANCH_TEMPLATE=devpilot/{planShort}/w{wave}-{task}
CI_POLL_INTERVAL_SECONDS=60           # polling-mode check refresh
CI_RECONCILE_INTERVAL_SECONDS=300     # webhook-mode reconcile sweep (§10.1)
```

### 9.2 `.devpilot/config.yaml` (CLI config loader, `packages/cli/src/commands/config.ts`)

```yaml
integrations:
  github:
    defaultRepo: openconjecture/ng-pipelines
    webhook: true                     # false forces polling mode
ciGate:
  defaultMode: required
  timeoutMinutes: 30
  prStrategy: pr-per-task
  requiredChecks: []                  # [] = all checks
```

Env vars override YAML. Secrets (`GITHUB_TOKEN`, `GITHUB_WEBHOOK_SECRET`) are
env-only, never written to YAML.

---

## 10. Error Handling & Edge Cases

### 10.1 Webhook delivery gaps

GitHub webhooks are at-least-once but deliveries do get dropped (endpoint down,
redeploy). Mitigation: even in webhook mode, `GitHubCiPoller.reconcile()` runs
every `CI_RECONCILE_INTERVAL_SECONDS` — but **only while at least one wave is
`awaiting-ci`** — fetching `getCiSnapshot` for each awaiting-wave PR ref and
diffing against `checkSummary`. Any drift is applied exactly as a webhook would
be (same `onCheckUpdate` path), so a lost `check_suite completed` delivery
delays gate resolution by at most one reconcile interval, never forever.
Poller and webhook writes go through one serialized upsert helper to avoid
interleaved partial updates (SQLite WAL, single process).

### 10.2 Force-push / new commits after checks passed

`pull_request.synchronize` changes `headSha`. Handler resets `ciStatus` to
`pending` and clears `checkSummary`. If the wave's gate was already `passed`
and the wave advanced, nothing is retroactively undone (advance is a one-way
door — the next wave's own gate protects downstream). If the gate is still
`waiting`/`failed`, evaluation restarts against the new SHA. Stale `check_run`
events whose `head_sha` ≠ current `headSha` are ignored (logged at debug).

### 10.3 PR opened before the completion callback (or webhook-first race)

Agents open PRs mid-session; the `pull_request opened` webhook can precede the
`/api/orchestrator/complete` callback. The handler matches the branch name
against the `CI_GATE_BRANCH_TEMPLATE` pattern to extract `{planShort, wave,
task}` and creates the ref with `sessionId: NULL`; the completion callback's
upsert (§7.7) later fills `sessionId`. The reverse race (callback first,
webhook later) is the ordinary upsert path. Branch names that match no tracked
plan produce `{ handled: false }` and no row.

### 10.4 PR closed without merge

`pull_request closed` with `merged: false` while its wave is `awaiting-ci`:
the ref's `prState → 'closed'` and it is treated as a **failing** signal for a
`required` gate (`ci:gate-blocked` with reason `pr-closed-unmerged`) — someone
deliberately discarded the work, so advancing would build on nothing. The
conductor resolves via override (accept: work landed some other way) or fix
task. For `advisory`, it is a warning. A closed PR that is later reopened
(`reopened` action) returns to `open` and re-evaluates.

### 10.5 Flaky checks

A check that fails then passes on re-run is healthy from the gate's
perspective — only the latest run per check name on the current `headSha`
counts (§7.2 dedupe). `rerunCount` on the ref tracks conductor-requested
re-runs; the gate banner shows "re-ran ×N" as a flakiness hint, and refs with
`rerunCount >= 2` emit an assist-panel note suggesting the check be
investigated or added to `requiredChecks` exclusions. No automatic re-run in
v1 (explicitly: auto-retry of red checks is a conductor decision, not a
default).

### 10.6 Timeout while checks are genuinely slow

`sweepTimeouts` fires `ci:gate-timeout` **once** per gate entry (guarded by
state transition to `timed-out`, not repeated emission). Checks completing
after timeout still resolve the gate normally — `timed-out` is an alerting
state, not a terminal one. Timer resets if `headSha` changes.

### 10.7 Pre-existing event-type case mismatch

The wave executors insert lowercase event types (e.g. `wave_task_complete` in
`completion-listener.ts:180-184`) while the `activity_events` CHECK constraint
lists uppercase values (`sqlite.ts:156`). This TRD does **not** repeat the
mistake: all `CI_*` emissions use the uppercase DB values with lowercase wire
mapping at the stream route (§7.8). Fixing the legacy mismatch belongs to
TRD 03 hardening; the CI event emitter must not depend on it being fixed.

### 10.8 Integration unconfigured / GitHub down

Gate mode `required` with `isGitHubConfigured() === false` degrades loudly: at
`enterGate`, the gate immediately transitions to `timed-out` with message
"GitHub integration not configured" (no silent auto-advance past a gate the
conductor asked for). GitHub API failures during poll/reconcile are retried by
Octokit plugins; persistent failure (> 3 sweeps) emits `ci:gate-timeout` with
the API error. Webhook route failures never 500 into GitHub retries for
handled-but-erroring events; errors are caught, logged, and returned as
`200 { handled: false }` after signature verification succeeded.

### 10.9 Concurrent plans, same repo/branch collision

Branch template includes the plan-short id, so two plans never share a branch.
A webhook for a branch matching two refs (should be impossible; defensive)
updates the most recently created ref and logs a warning.

---

## 11. Testing Strategy

Unit tests colocated per package convention (`*.test.ts` beside sources);
integration tests under the package's `tests/` dir; UI smoke via the existing
component-test setup.

1. **webhook-verify** — valid/invalid/missing signature, tampered payload,
   wrong prefix, length mismatch (mirror the existing Linear verify tests).
2. **webhook-handler** — table-driven: each event/action row of §6.2 against
   fixture payloads (recorded from real GitHub deliveries, committed under
   `packages/core/src/integrations/github/__fixtures__/`); assert ref upserts,
   emitted activity events, and `onCheckUpdate` invocations. Includes
   webhook-first race (§10.3), force-push reset (§10.2), unmerged close
   (§10.4), stale-SHA ignore.
3. **client** — Octokit mocked at the transport layer (`nock`-style):
   `getCiSnapshot` pagination + latest-run-per-name dedupe + requiredChecks
   filter; rerequest/rerun error propagation.
4. **CiGateService** — in-memory SQLite: gate resolution precedence
   (wave > plan > env); mode matrix of §5.3 (parameterized over
   off/advisory/required × pending/green/red/timeout); auto-resume only for
   gate-paused plans; override audit fields; zero-PR required gate;
   `sweepTimeouts` single-emission guard; final-wave gate holds plan completion.
5. **Controller integration** — extend the existing execution tests: wave with
   gate `required` does not advance on task completion; advances after
   simulated green webhook; plan pauses on red; `off` mode is byte-identical to
   pre-TRD behavior (regression guard).
6. **Routes** — handler-level tests for §6.1–6.6 status codes and error
   envelopes; webhook route rejects bad signatures with 401 and unsigned-mode
   with 503.
7. **E2E (manual/scripted)** — against a scratch GitHub repo with a trivial
   Actions workflow: dispatch a 2-wave plan with `required` gate, verify hold →
   green → advance, then a red run → pause → re-run → advance.

---

## 12. Acceptance Criteria

| ID | Criterion |
|---|---|
| CI-AC-01 | With `GITHUB_TOKEN` set, `POST /api/integrations/github/connect` verifies the token and `GET` reports `configured: true` with the authenticated login. |
| CI-AC-02 | A webhook with a valid `X-Hub-Signature-256` is accepted; an invalid or missing signature returns 401; with no secret configured the route returns 503 and the poller is active instead. |
| CI-AC-03 | Every dispatched wave task's payload contains a `git` block with a branch name matching `CI_GATE_BRANCH_TEMPLATE`, and no two tasks in a plan share a branch name. |
| CI-AC-04 | A completion report carrying `prUrl`/`branchName` produces a `pullRequestRefs` row linked to the correct session, wave, and task, and a `ci:pr-linked` SSE event within 2 s (one SSE poll cycle). |
| CI-AC-05 | A `check_run completed` webhook updates `checkSummary` and `ciStatus` on the matching ref and emits `ci:check-update` within 2 s. |
| CI-AC-06 | With gate mode `off`, wave completion and auto-advance behavior is unchanged from Tier 1 (verified by the pre-TRD regression test passing unmodified). |
| CI-AC-07 | With gate mode `required` and checks pending, the wave transitions to `awaiting-ci` and the next wave is NOT dispatched; when all required checks are green, the gate passes and the next wave dispatches within `waveAdvanceDelayMs` + one event-delivery cycle. |
| CI-AC-08 | With gate mode `required` and a failing check, the plan transitions to `paused`, `ci:gate-blocked` is emitted with the failing check names and details URLs, and the CiGateBanner shows re-run / override / fix-task actions. |
| CI-AC-09 | With gate mode `advisory` and a failing check, the plan advances anyway and a warning-severity `ci:gate-blocked` event is emitted. |
| CI-AC-10 | A gate pending longer than `timeoutMinutes` emits `ci:gate-timeout` exactly once and surfaces a conductor alert; checks completing afterwards still resolve the gate. |
| CI-AC-11 | `POST .../ci-gate/override` with a reason advances the wave, records `overrideReason`/`overriddenBy`, and emits `ci:gate-overridden`; without a reason it returns 400. |
| CI-AC-12 | `POST .../ci-gate/rerun` triggers a GitHub re-run for failing refs, increments `rerunCount`, and returns the gate to `waiting`; after the re-run goes green the plan auto-resumes and advances. |
| CI-AC-13 | A PR closed without merging while gated `required` blocks the gate with reason `pr-closed-unmerged`. |
| CI-AC-14 | With webhooks disabled, the poller resolves a green gate within `CI_POLL_INTERVAL_SECONDS` + 5 s; with webhooks enabled, a deliberately dropped delivery is reconciled within `CI_RECONCILE_INTERVAL_SECONDS`. |
| CI-AC-15 | Per-wave gate config overrides the plan default (e.g. plan `required`, wave 3 `advisory` behaves per §5.3 for wave 3 only). |
| CI-AC-16 | CI chips render on wave progress rows and session cards for every linked PR, reflecting live SSE updates without reload; the `awaiting-ci` wave row is visually distinct. |
| CI-AC-17 | A fresh database created by `createSQLiteAdapter` contains `ci_gates` and `pull_request_refs` with the constraints of §4.3, and accepts `waves.status = 'awaiting-ci'` and all six `CI_*` activity event types. |

---

## 13. Implementation Plan

Waves of file-disjoint, independently executable tasks. Task IDs `CI-W{wave}-T{n}`.
Complexity S/M/L. No two same-wave tasks touch the same file.

### Wave 1 — Schema & types (no behavior change)

| ID | Title | Files | Description | Deps | Cx | Done-check |
|---|---|---|---|---|---|---|
| CI-W1-T1 | CI enums | `packages/core/src/db/schema/enums.ts` | Add `ciGateModeValues`, `ciGateStateValues`, `ciStatusValues`, `prStateValues`, `prStrategyValues` + types (§4.1); add `'awaiting-ci'` to `waveStatusValues`; add six `CI_*` members to `eventTypeValues`. | — | S | `pnpm --filter @devpilot.sh/core build` passes; new exports type-resolve. |
| CI-W1-T2 | CI schema tables | `packages/core/src/db/schema/ci.ts`, `packages/core/src/db/schema/index.ts` | Create `ciGates` + `pullRequestRefs` per §4.2 (incl. `CheckRunSummary`, relations, type exports); add `export * from './ci'` to the barrel. | CI-W1-T1 (types only — may run in parallel; imports resolve at build) | M | Tables and `$inferSelect` types exported from `@devpilot.sh/core`. |
| CI-W1-T3 | SQLite DDL mirror | `packages/core/src/db/adapters/sqlite.ts` | Append §4.3 DDL + indexes to `createTableStatements`; widen `waves.status` CHECK (line 193) and `activity_events.type` CHECK (line 156); add the idempotent CHECK-widening migration per the Tier-1 convention. | — | M | Fresh DB: `INSERT` of `waves.status='awaiting-ci'` and `activity_events.type='CI_GATE_PASSED'` succeed; both new tables present via `sqlite_master`. |
| CI-W1-T4 | GitHub types | `packages/core/src/integrations/github/types.ts` | Define `GitHubConfig`, `PullRequestInfo`, `CiSnapshot`, webhook payload interfaces + `GitHubWebhookEvent` union per §7.1. | — | S | File compiles standalone; no runtime imports beyond schema types. |
| CI-W1-T5 | Octokit dependency | `packages/core/package.json` | Add `@octokit/rest`, `@octokit/plugin-retry`, `@octokit/plugin-throttling`; run install to update the lockfile. | — | S | `pnpm install` clean; `import { Octokit } from '@octokit/rest'` resolves in core. |

### Wave 2 — Integration layer (pure services, no route/executor changes)

| ID | Title | Files | Description | Deps | Cx | Done-check |
|---|---|---|---|---|---|---|
| CI-W2-T1 | GitHub client | `packages/core/src/integrations/github/client.ts` | Implement `DevPilotGitHubClient` + singleton per §7.2, Octokit with retry/throttle plugins; `getCiSnapshot` pagination + per-name dedupe + requiredChecks filter. | W1 | L | Unit tests (mocked transport) for snapshot dedupe/filter and singleton lifecycle pass. |
| CI-W2-T2 | Webhook signature verify | `packages/core/src/integrations/github/webhook-verify.ts`, `packages/core/src/integrations/github/webhook-verify.test.ts` | Port `linear/webhook-verify.ts` to `X-Hub-Signature-256` per §7.3, with tests mirroring the Linear suite. | — | S | Test suite passes incl. tamper + timing-shape cases. |
| CI-W2-T3 | Webhook handler | `packages/core/src/integrations/github/webhook-handler.ts`, `packages/core/src/integrations/github/__fixtures__/*.json` | Implement §7.4 event→upsert matrix with fixtures; emit `CI_PR_LINKED`/`CI_CHECK_UPDATE`; call gate `onCheckUpdate` when configured (guard `isCiGateServiceInitialized()`). | W1 | L | Table-driven tests for §6.2 matrix + §10.2/10.3/10.4 races pass against in-memory SQLite. |
| CI-W2-T4 | CI poller | `packages/core/src/integrations/github/poller.ts` | Implement `GitHubCiPoller` (`start/stop/reconcile`) per §3 + §10.1: awaiting-waves-only scoping, snapshot diff through the same upsert path as webhooks. | W1 (uses client interface via injection — mock in tests) | M | Test: seeded awaiting ref + mocked snapshot drift → ref updated and callback fired; idle plans → zero API calls. |
| CI-W2-T5 | Barrel + core export | `packages/core/src/integrations/github/index.ts`, `packages/core/src/index.ts` | Barrel-export the github module; add `export * as github` to core index per §7.9. | W1 | S | `import { github } from '@devpilot.sh/core'` exposes `initGitHubClient`, `verifyGitHubWebhookSignature`, `handleGitHubWebhook`. |

### Wave 3 — Gate service & executor integration

| ID | Title | Files | Description | Deps | Cx | Done-check |
|---|---|---|---|---|---|---|
| CI-W3-T1 | CiGateService | `packages/core/src/wave-planner/execution/ci-gate.ts`, `packages/core/src/wave-planner/execution/ci-gate.test.ts` | Implement §7.5 in full: resolution precedence, `enterGate`, `onCheckUpdate`, `override`, `requestRerun`, `sweepTimeouts`, auto-resume rule, singleton init. | W2 | L | Unit matrix of §5.3 passes (all mode × outcome cells), plus §10.6/10.8 cases. |
| CI-W3-T2 | Controller gate hook | `packages/core/src/wave-planner/execution/controller.ts` | In `onTaskComplete`, route wave-terminal handling through `enterGate` per §7.6; keep `off`-mode path byte-equivalent (regression test exists from W3-T1's fixtures). | W3-T1 (interface only; parallel OK within wave since files are disjoint — controller imports the ci-gate module built in this same wave, so run T1 first if serial) | M | Existing controller tests pass unmodified with mode `off`; new test: `required` + pending → wave `awaiting-ci`, no dispatch of next wave. |
| CI-W3-T3 | Dispatch git block | `packages/core/src/wave-planner/execution/dispatch-coordinator.ts`, `packages/core/src/wave-planner/execution/types.ts` | Add `git` block construction to `buildDispatchRequest` (branch template, strategy, pr-per-wave pre-insert) and extend `WaveExecutionConfig` per §7.6. | W1 | M | Test: built request contains branch matching template; pr-per-wave inserts one shared ref per wave. |
| CI-W3-T4 | Contract extension | `packages/core/src/orchestrator/types.ts` | Add `GitInstructions`, `TaskSpec.git?`, `CompletionReport.branchName?/prNumber?` per §7.7 with doc comments citing this TRD. | — | S | Core build passes; no consumer breaks (fields optional). |
| CI-W3-T5 | Completion-callback PR linking | `src/app/api/orchestrator/complete/route.ts` | On reports carrying `prUrl`/`branchName`: upsert `pullRequestRefs` with session/wave/task linkage, emit `CI_PR_LINKED` per §7.7. | W1, W3-T4 | M | Route test: completion with prUrl creates/updates the ref and links `sessionId`. |
| CI-W3-T6 | Auto-advance doc guard | `packages/core/src/wave-planner/execution/auto-advance.ts` | Add the gate-cleared precondition doc + defensive check (throw if wave status is `awaiting-ci`) per §7.6. | W1 | S | New test: calling `autoAdvanceWave` on an awaiting-ci wave throws. |

### Wave 4 — API routes & SSE

| ID | Title | Files | Description | Deps | Cx | Done-check |
|---|---|---|---|---|---|---|
| CI-W4-T1 | Connect route | `src/app/api/integrations/github/connect/route.ts` | POST/GET/DELETE per §6.1, mirroring the Linear connect route structure; TRD-03 `integrationConfigs` persistence if available, else singleton. | W2 | M | Route tests: 200/400/401 paths. |
| CI-W4-T2 | Webhook route | `src/app/api/integrations/github/webhook/route.ts` | Raw-body read, signature verify, event dispatch, response policy per §6.2 (incl. 503 unsigned-mode). | W2 | M | Route tests: valid sig 200, bad sig 401, no secret 503, GET ping 200. |
| CI-W4-T3 | Gate state/config routes | `src/app/api/wave-plans/[planId]/ci-gate/route.ts` | GET + PATCH per §6.3/§6.4 incl. the 409 loosen-while-failed rule. | W3 | M | Route tests for response shapes + 400/404/409. |
| CI-W4-T4 | Override & re-run routes | `src/app/api/wave-plans/[planId]/ci-gate/override/route.ts`, `src/app/api/wave-plans/[planId]/ci-gate/rerun/route.ts` | POST handlers per §6.5/§6.6 delegating to `CiGateService`. | W3 | M | Route tests: override 200/400/409; rerun 200/409/502. |
| CI-W4-T5 | SSE mapping + heartbeat | `src/app/api/events/stream/route.ts` | Add `CI_* → ci:*` wire mapping and the `awaitingCi` heartbeat block per §7.8. | W1 | S | Stream test: inserted `CI_GATE_PASSED` row arrives as `type: 'ci:gate-passed'`. |
| CI-W4-T6 | Service bootstrap | Next instrumentation/init file established by Tier 1 (e.g. `src/lib/orchestrator-init.ts`) | Initialize GitHub client from env, `initCiGateService`, `start()` sweep/poller alongside orchestrator init. | W2, W3 | S | Boot log shows gate service started; sweep fires in dev. |

### Wave 5 — UI & E2E

| ID | Title | Files | Description | Deps | Cx | Done-check |
|---|---|---|---|---|---|---|
| CI-W5-T1 | CiStatusChip | `src/components/ci/CiStatusChip.tsx`, `src/components/ci/index.ts` | Chip per §8.1 (4 states, compact mode, link). | — | S | Renders all 4 states in component test. |
| CI-W5-T2 | CiGateBanner + settings | `src/components/ci/CiGateBanner.tsx`, `src/components/ci/CiGateSettings.tsx` | Banner per §8.2 (4 visual states, 3 actions, reason-required override confirm) and settings per §8.3. | CI-W5-T4 (store types) | L | Component tests: blocked state shows failing checks + actions; override disabled until reason ≥ 4 chars. |
| CI-W5-T3 | Chip wiring | `src/components/plan/WaveProgressBar.tsx`, `src/components/wave-planner/WaveTableView.tsx`, `src/components/fleet/RufloSessionCard.tsx` | Wire chips + `awaiting-ci` row treatment per §8.1. | CI-W5-T1 | M | Snapshot tests updated; awaiting-ci wave renders distinct label. |
| CI-W5-T4 | ciStore + SSE subscribe | `src/stores/ciStore.ts`, `src/hooks/useCiGate.ts` | Store + hook per §8.4, subscribing `ci:*` via the existing SSE hook. | W4 | M | Store test: `applyCiEvent` updates gate/ref views for each of the six event types. |
| CI-W5-T5 | PlanReviewCard integration | `src/components/plan/PlanReviewCard.tsx` | Mount `CiGateBanner` + settings entry point per §8.2. | CI-W5-T2 | S | Card renders banner when store has an active gate; hidden otherwise. |
| CI-W5-T6 | Docs | `docs/API-REFERENCE.md`, `docs/ROADMAP.md` | Document new routes/events; flip roadmap item 15 status. | W4 | S | Docs list all §6 routes and `ci:*` events. |
| CI-W5-T7 | E2E script | `packages/cli/tests/e2e/ci-gate.e2e.ts` | Scripted §11(7) flow against a scratch repo (skipped without `GITHUB_E2E_REPO` env). | W3, W4 | L | Passes locally against the scratch repo; CI-skips cleanly. |

**Sequencing note**: within Wave 3, run T1 before T2 if executing serially
(T2 imports T1's module); they remain file-disjoint so parallel dispatch with a
shared build step is also valid per the wave protocol.

---

*DevPilot TRD 10 — CI-Gated Wave Auto-Advance · v1.0 · Open Conjecture · July 2026*
