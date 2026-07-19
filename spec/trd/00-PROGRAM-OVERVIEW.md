# DevPilot Build-Out Program — Master TRD Overview
## Agent Execution Guide · v1.0 · July 2026 · Status: DRAFT

> This directory holds the complete TRD set for the four-tier build-out defined in
> `docs/ROADMAP.md`. It is written to be executed by a **conductor coding agent
> dispatching sub-agents wave-by-wave** — every TRD decomposes its work into waves
> of independent, file-disjoint tasks with agent-executable descriptions and
> testable done-checks.

---

## 1. Document Index

| Doc | Scope | Waves / Tasks / ACs | Depends on |
|---|---|---|---|
| `01-TIER1-EXECUTION-LOOP.md` | Close the dispatch loop: real wave dispatch, orchestrator in the Next app, claude-session adapter contract, unified AI plan generation, pause/resume routes | 4 / 17 / 14 | — |
| `02-TIER2-SPEC-COMPLETION.md` | Finish specced items: DAG modal, replan modal, Phase-4 layouts, Conductor Score completion, Conversational Mode | 5 / 29 / 16 | 01 |
| `03-TIER3-HARDENING.md` | Bridge pipeline completion, Linear config persistence + signature verification, real `devpilot status`, measured runway math, repo hygiene | 4 / 24 / 12 | Items 11–14 parallel to 01/02; item 10 soft-depends on 01 (see doc) |
| `10-CI-GATED-WAVE-ADVANCE.md` | GitHub PR/CI integration; wave auto-advance gated on green CI | 5 / 24 / 17 | 01–03 |
| `11-DISPATCH-COST-BUDGETS.md` | Runtime token/cost tracking, budget caps, enforcement | 4 / 24 / 18 | 01–03 (score task soft-depends on 02) |
| `12-SESSION-TRANSCRIPT-VIEWER.md` | Transcript capture contract, storage, live-tail viewer + replay | 5 / 16 / 12 | 01–03 |
| `13-BENCHMARKS-IN-CI.md` | Benchmark suite in GitHub Actions, regression thresholds, trend UI | 4 / 11 / 12 | 01 only (baseline scenario has zero tier deps — may start early) |
| `14-AI-ASSIST-PANEL.md` | Server-side AI advisor replacing rule-based Assist Panel | 5 / 15 / 13 | 01–03 |

**Program totals: 36 waves · 160 tasks · 122 acceptance criteria** (+5 program-level).

Source specs these build on: `spec/DESIGN.md` (surface/UX TRD), `spec/WAVE-PLANNER.md`
(wave model + execution), `spec/BENCHMARK-SUITE.md` (benchmark harness), `design/*`
(per-surface design docs), `docs/ROADMAP.md` (tier definitions and current-state audit).

---

## 2. Execution Model for Coding Agents

### 2.1 Roles

- **Conductor agent** — owns one TRD at a time. Reads the TRD end-to-end, then
  dispatches each implementation-plan wave as a batch of parallel sub-agent tasks.
  Verifies done-checks before advancing to the next wave. Runs the TRD's testing
  strategy after the final wave.
- **Sub-agent** — owns exactly one task ID (e.g. `T1-W2-T3`). Receives the TRD
  section for its task plus the task row (files, description, done-check). Must not
  modify files outside its task's file list. Reports the done-check result.

### 2.2 Wave protocol

1. Conductor reads the TRD's Implementation Plan. Wave N+1 may only start when every
   task in waves ≤ N passes its done-check.
2. Tasks within a wave are file-disjoint by construction — dispatch them in parallel.
3. A failed done-check pauses the wave: the conductor re-dispatches the task with the
   failure context (max 2 retries), then escalates to the human Conductor.
4. After the final wave: run the TRD's Testing Strategy, then walk the Acceptance
   Criteria list; every AC must pass or be explicitly waived by a human.
5. Commit per wave (one commit per wave, message `<TRD-id> wave N: <summary>`), push
   to the feature branch for that TRD.

### 2.3 Ordering across TRDs

```
        ┌─────────────┐
        │  01 Tier 1   │  ← start here; everything depends on real dispatch
        └──────┬──────┘
     ┌─────────┼───────────────┐
     ▼         ▼               ▼
┌─────────┐ ┌─────────┐  ┌──────────────┐
│02 Tier 2│ │03 Tier 3│  │13 Bench-in-CI│   (02 ∥ 03 ∥ 13 after 01)
└────┬────┘ └────┬────┘  └──────────────┘
     └─────┬─────┘
           ▼
 ┌──────────────────────────────┐
 │ Tier 4: 10 ∥ 11 ∥ 12 ∥ 14    │   (parallel; see per-doc dependency notes)
 └──────────────────────────────┘
```

Tier 4 TRDs are mutually independent and may run as parallel programs, with one
caveat: 10, 11, and 12 all extend the claude-session dispatch/callback contract from
01 (see §3.3) — if run concurrently, land contract changes as the separate optional
fields specced per TRD and rebase deliberately. Files co-edited by multiple TRDs
(sequence-sensitive, rebase between programs): `packages/core/src/orchestrator/types.ts`
(10, 11, 12), `packages/core/src/db/adapters/sqlite.ts` DDL (all schema-adding TRDs),
`src/app/api/fleet/state/route.ts` (01, 03, 11), `src/components/plan/PlanReviewCard.tsx`
(02, 10, 11).

---

## 3. Shared Conventions (all TRDs)

### 3.1 Namespaces

| Concern | Reservation |
|---|---|
| SSE event prefixes | `wave:*` (existing), `ci:*` (10), `budget:*` (11), `transcript:*` (12), `assist:*` (14), `chat:*` / `layout:*` (02) |
| New Drizzle tables | 02: `plannerChats`, `plannerChatMessages`; 03: `integrationConfigs`; 10: `ciGates`, `pullRequestRefs`; 11: `costBudgets`, `costLedgerEntries`; 12: `sessionTranscripts`, `transcriptEvents`; 13: `benchmarkRuns`; 14: `assistSuggestions` |
| Task-ID prefixes | `T1-`, `T2-`, `T3-`, `CI-`, `CB-`, `TV-`, `BC-`, `AP-` |
| AC prefixes | `T1-AC-`, `T2-AC-`, `T3-AC-`, `CI-AC-`, `CB-AC-`, `TV-AC-`, `BC-AC-`, `AP-AC-` |

### 3.2 Binding cross-TRD decisions

Decisions made in one TRD that all others must respect:

- **`ensureColumn` migrations** — TRD 01 introduces a PRAGMA-guarded `ensureColumn`
  helper in `packages/core/src/db/adapters/sqlite.ts`; it is the sanctioned mechanism
  for adding columns to live databases (`CREATE TABLE IF NOT EXISTS` cannot alter
  existing tables). TRD 02+ reuse it, never reinvent it.
- **Activity-event CHECK constraint is frozen** — new event families that don't fit
  the existing `activity_events.type` CHECK either widen it explicitly in DDL (TRD 10
  does) or bypass `activity_events` entirely (TRD 02's `chat:message` polls its own
  table). Lowercase wire event names map to uppercase DB types via TRD 01's
  `toActivityEventType()`.
- **Conductor Score is six-dimensional** after TRD 02: fleetUtilization 250,
  runwayHealth 250, planAccuracy 200, costEfficiency 200, velocityTrend 100,
  parallelizationQuality 150; `total = min(1000, sum)`.
- **`integrationConfigs` is the home for all provider credentials** (TRD 03). TRD
  10's GitHub connect persists there too — not in a new table or in-memory singleton.
- **Runway math lives once** in `packages/core/src/fleet/runway.ts` (TRD 03); no
  route re-implements it.
- **Pricing/cost logic lives in core** (`packages/core/src/cost/`, TRD 11);
  `packages/benchmarks` re-exports core's pricing table, never the reverse.

### 3.3 Claude-session contract extension registry

TRD 01 defines the versioned dispatch/callback contract (`/v1/sessions`, `StatusUpdate`,
`CompletionReport`, callback auth). Later TRDs extend it ONLY via these optional,
backward-compatible fields:

| TRD | Extension |
|---|---|
| 10 | `TaskSpec.git?: GitInstructions` (branchName, baseBranch, openPr, prTitle); `CompletionReport.branchName?`, `prNumber?` |
| 11 | `StatusUpdate.usage?` / `CompletionReport.usage?` `{inputTokens, outputTokens, cacheReadTokens?, cacheWriteTokens?}` + `model?` |
| 12 | `CreateSessionParams.transcriptCallbackUrl?`; `CompletionReport.transcript?` |
| 13 | benchmark harness `ScenarioResult.failureReason?` (not part of the session contract, listed for completeness) |

### 3.4 Code conventions

- **Schema changes**: add the Drizzle definition under `packages/core/src/db/schema/`,
  export it from `schema/index.ts`, AND mirror the DDL in the SQLite adapter if it
  embeds `CREATE TABLE` statements (`packages/core/src/db/adapters/sqlite.ts`) and in
  the Postgres adapter path. A schema task is not done until both are updated.
- **AI calls**: follow `packages/core/src/wave-planner/ai-client.ts` conventions —
  `@anthropic-ai/sdk`, retry with backoff, explicit model config, `ANTHROPIC_API_KEY`.
- **API routes**: Next.js route handlers under `src/app/api/`, JSON bodies, standard
  error envelope `{ error: string }` with appropriate status codes. Keep parity with
  the CLI Fastify server (`packages/cli/src/server/api/`) only where the TRD says so.
- **SSE**: new event types flow through the existing stream at
  `src/app/api/events/stream/route.ts`; document each event's payload shape in the TRD.
- **UI**: components live under `src/components/<area>/`, state in Zustand stores
  under `src/stores/`, data fetching in hooks under `src/hooks/`. Match existing
  patterns (see `horizonStore.ts`, `useSSE.ts`).
- **Config**: env vars documented per TRD; user-facing settings go in
  `.devpilot/config.yaml` handled by the CLI config loader.
- **Tests**: unit tests colocated per package conventions; e2e in
  `packages/cli/tests/e2e/` style. Every TRD's Testing Strategy section is normative.

### 3.5 Definition of done (per TRD)

1. All waves complete, all done-checks pass.
2. All Acceptance Criteria pass (or carry an explicit human waiver).
3. `pnpm build` and the test suite pass at the repo root.
4. No new TODO/mock/placeholder markers introduced in shipped paths.
5. Docs updated: `docs/API-REFERENCE.md` for new routes; `docs/ROADMAP.md` tier
   status flipped.

---

## 4. Program-Level Acceptance

The program is complete when the original evaluation criteria in `spec/DESIGN.md` §15
hold against the REAL system (no mocks in the loop), plus:

- **P-AC-01** — An item captured in the UI can be planned (real AI), approved,
  dispatched, executed by real agent sessions, and marked complete with progress
  visible live — with zero manual DB intervention.
- **P-AC-02** — Wave auto-advance blocks on red CI when a `required` gate is set
  (TRD 10) and spend is enforced against an active budget (TRD 11).
- **P-AC-03** — Every dispatched session has a browsable transcript (TRD 12).
- **P-AC-04** — Benchmark trend data for at least two versions is visible in the UI
  (TRD 13).
- **P-AC-05** — Assist suggestions are AI-generated with actionable buttons, and the
  panel degrades to heuristics without an API key (TRD 14).
