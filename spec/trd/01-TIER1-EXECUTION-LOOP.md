# TRD 01 — Tier 1: Close the Execution Loop
## Making Dispatch Real: Orchestrator Wiring, Session-Native Execution & AI Plan Unification · v1.0
> July 2026 · Open Conjecture · Status: **DRAFT** · Depends on: none (first tier)

---

## Table of Contents

1. [Problem Statement & Goals](#1-problem-statement--goals)
2. [Current State](#2-current-state)
3. [Architecture](#3-architecture)
4. [Data Model](#4-data-model)
5. [API Surface](#5-api-surface)
6. [Core Services](#6-core-services)
7. [Claude-Session Dispatch Contract](#7-claude-session-dispatch-contract)
8. [Configuration](#8-configuration)
9. [Error Handling & Edge Cases](#9-error-handling--edge-cases)
10. [Testing Strategy](#10-testing-strategy)
11. [Acceptance Criteria](#11-acceptance-criteria)
12. [Implementation Plan](#12-implementation-plan)

---

## 1. Problem Statement & Goals

### Problem Statement

DevPilot's full loop — capture → plan → dispatch → agents execute → progress flows back — is broken at "dispatch" (`docs/ROADMAP.md` §2). Everything upstream (UI, DB, AI wave planning) and downstream (orchestrator callback ingestion, Linear sync, score updates) is real, but the middle never fires:

1. `WaveDispatchCoordinator.dispatchToOrchestrator()` is a `console.log` placeholder — approving a wave plan mutates DB status and nothing else.
2. The Next.js app never initializes any orchestrator, so `POST /api/fleet/dispatch/[itemId]` always takes the unconfigured branch and creates a dead session row pinned at 0% progress.
3. The `claude-session` adapter — the intended native execution engine — is a self-described scaffold with placeholder HTTP endpoints and no defined dispatch contract.
4. Plan generation for the plan-review flow is keyword-template mock data in two places, even though the wave planner right next to it makes real Anthropic API calls.
5. The UI's pause/resume buttons call routes that do not exist and receive 404s.

### Goals

1. **Implement real dispatch**: `dispatchToOrchestrator()` bridges `WaveDispatchCoordinator` → `OrchestratorService.dispatch()`, creating a `rufloSessions` row per wave task and recording the session ↔ task mapping.
2. **Close the completion loop**: wire the existing (exported but never-invoked) `CompletionListener` into orchestrator `job:complete` / `job:error` events via a new `ExecutionBridge`, so task completion advances waves and failure triggers retry re-dispatch (the TODO at `controller.ts:351`).
3. **One orchestration architecture**: the Next app initializes the orchestrator service directly from `packages/core` through a lazy server-side singleton, exactly as the CLI Fastify server does. The CLI server remains a headless alternative using identical wiring. (Consolidation decision documented in §3.3.)
4. **Session-native execution**: finalize the claude-session dispatch contract (endpoints, payloads, auth, callback protocol) so Claude Code sessions are the default execution engine, with `ao-cli` retained as fallback.
5. **One plan-generation pipeline**: delete `generateMockWorkstreams()` and the CLI's canned plan; both plan-generate routes derive workstream plans from the wave planner (`packages/core/src/wave-planner/generator.ts`).
6. **Complete the control surface**: implement `POST /api/wave-plans/[planId]/pause` and `/resume`.

### Non-Goals

- New UI surfaces (DAG modal, replan modal, layouts) — Tier 2.
- Bridge (GCP Cloud Run) middle hop, Linear webhook → dispatch — Tier 3. The claude-session *contract* defined here is what the bridge will later implement server-side; this TRD only requires a transport that satisfies it.
- True push SSE (replacing the 2s DB-poll behind `/api/events/stream`) — the existing `activity_events` poll loop is retained as the UI transport.
- Cross-repo wave coordination, cost guardrails, PR/CI gating — Tier 4.
- Multi-instance deployment. Singletons (orchestrator service, execution bridge) are per-process; a single serving process owns dispatch.

---

## 2. Current State

All paths relative to repo root `/home/user/devpilot`.

### 2.1 The dispatch gap

- `packages/core/src/wave-planner/execution/dispatch-coordinator.ts` — `WaveDispatchCoordinator.dispatchWave()` is real (capacity check, staggering, predecessor context, status writes) but the terminal step, `dispatchToOrchestrator(request)` (lines 217–237), only does `console.log('[WaveDispatchCoordinator] Would dispatch task ...')` (line 236). Nothing ever reaches an agent. `buildDispatchRequest()` (line 123) also has `constraints: []` with a TODO, and `getPredecessorContext()` returns `completionSummary: ''` (line 176, TODO) because completion summaries are never persisted.
- `packages/core/src/wave-planner/execution/controller.ts` — `WaveExecutionController` state machine (`approve`/`pause`/`resume`/`abort`/`dispatchWave`/`onTaskComplete`/`onTaskFailed`) is complete except: `onTaskFailed()` marks a task `retrying` and then hits `// TODO: Re-dispatch task to orchestrator` (line 351) — retrying tasks are stranded forever. `onTaskComplete()` (line 236) exists but nothing calls it.
- `packages/core/src/wave-planner/execution/completion-listener.ts` — `CompletionListener` is fully implemented (`handleTaskStarted`, `handleTaskComplete`, `handleTaskFailed`, wave-completion detection) and exported from `execution/index.ts`, but **no code in the repo constructs one**. Two latent bugs: (a) `handleTaskComplete()` stores the completion summary in the `errorMessage` column (line 77); (b) `emitEvent()` (line 180) inserts lowercase `WaveSSEEvent` types (`'wave_task_complete'`, …) into `activityEvents.type`, whose enum/CHECK constraint only allows uppercase values (`'WAVE_TASK_COMPLETE'`, … — see `packages/core/src/db/schema/enums.ts` lines 19–41 and the CHECK at `packages/core/src/db/adapters/sqlite.ts:156`). The same lowercase-insert bug exists in `execution/auto-advance.ts` (`emitEvent`).
- `packages/core/src/wave-planner/execution/auto-advance.ts` — `autoAdvanceWave()`, `markWavePlanComplete()`, `collectFinalMetrics()`, `advanceToNextWave()` exist and are correct DB-side, but `advanceToNextWave()` does not dispatch the next wave (by design — dispatch needs the coordinator), and nothing calls any of them.

### 2.2 Orchestrator service — real, but only half-hosted

- `packages/core/src/orchestrator/service.ts` — `OrchestratorService` (strategy pattern over `claude-session` / `http` / `ao-cli` / `disabled` adapters) is complete: `dispatch()`, session mappings, `onEvent()` pub/sub, `ingestStatusUpdate()` / `ingestCompletionReport()` for push adapters, singleton via `initOrchestratorService()` / `getOrchestratorServiceOrNull()`.
- `packages/core/src/orchestrator/status-poller.ts` — `StatusPoller` polls pull-based adapters and correctly skips push-based ones (`service.isPushBased`, line 67).
- `packages/cli/src/server/index.ts` (lines 44–114) — the **only** end-to-end wiring: `initOrchestratorService()` + `initStatusPoller()` with callbacks that update `rufloSessions` and insert `activityEvents`. But `packages/cli/src/commands/serve.ts` calls `startServer({ port, dbPath })` **without** an `orchestrator` option, so even `devpilot serve` runs with the orchestrator disabled unless a caller passes options programmatically.
- The Next app (`/src`) never calls `initOrchestratorService` **or** the legacy `initOrchestratorClient` (`packages/core/src/orchestrator/client.ts:127`). `src/app/api/fleet/dispatch/[itemId]/route.ts` gates on `orchestrator.isOrchestratorConfigured()` (line 127) — always `false` — so it creates a `rufloSessions` row at 0% (lines 91–101) that nothing ever advances, locks in-flight files, and deletes the horizon item. The work silently evaporates.
- Callback routes `src/app/api/orchestrator/status/route.ts` and `.../complete/route.ts` update `rufloSessions` / Linear but never call `service.ingestStatusUpdate()` / `ingestCompletionReport()`, never touch `waveTasks`, and are unauthenticated. `complete/route.ts` (lines 43–50) also inserts `completedTasks` fields that do not exist in the Drizzle schema (`taskLabel`, `tokensUsed`, `costUsd`, `filesModified` vs. schema columns `sessionId`, `label`, `model`, `durationMinutes` in `packages/core/src/db/schema/fleet.ts:43`).

### 2.3 Claude-session adapter scaffold

`packages/core/src/orchestrator/claude-session-adapter.ts` — push-based `ClaudeSessionAdapter` (`pushBased = true`, cache + `ingestStatus`/`ingestCompletion`) is structurally done, but its default `HttpSessionTransport` routes are self-described placeholders: the SCAFFOLD NOTE at lines 11–19 and the TODO at lines 87–90 ("the endpoint paths below are placeholders… thread through auth"). Paths used today: `POST /sessions`, `POST /sessions/{id}/messages`, `POST /sessions/{id}/stop`, `GET /sessions/{id}`, `GET /health`. There is no versioning, no callback authentication, and no defined prompt/reporting protocol for the session.

### 2.4 Mock plan generation

- `src/app/api/items/[id]/plan/generate/route.ts` — line 55: `// Simulated plan generation`; line 56 calls `generateMockWorkstreams(item.title, item.repo)`, defined at line 192: keyword matching on "add/fix/refactor" producing canned workstreams with invented file paths.
- `packages/cli/src/server/api/items.ts` — line 221: `// Create a mock plan (in production, this would call AI service)`; inserts a single hardcoded "Implementation / Complete task" plan at $0.18.
- Meanwhile `packages/core/src/wave-planner/generator.ts` (`WavePlanGenerator`, `generateWavePlan()`) is a real Anthropic-SDK pipeline with refinement and a flat-plan fallback, already used by `src/app/api/items/[id]/wave-plan/generate/route.ts`.

### 2.5 Missing pause/resume routes

`src/components/plan/PlanReviewCard.tsx` lines 52 and 61 call `POST /api/wave-plans/${wavePlan.id}/pause` and `/resume`; neither route exists under `src/app/api/wave-plans/[planId]/` (only `dispatch/` and `metrics/`). `WaveExecutionController.pause()`/`resume()` already implement the state transitions — they just have no HTTP surface.

### 2.6 Schema drift (sqlite adapter)

`packages/core/src/db/adapters/sqlite.ts` embeds `CREATE TABLE IF NOT EXISTS` DDL. The `ruflo_sessions` DDL (line 88) is **missing four columns** that the Drizzle schema declares (`packages/core/src/db/schema/fleet.ts:22–26`): `external_session_id`, `orchestrator_mode`, `tokens_used`, `cost_usd`. Any query selecting these against a freshly initialized DB fails. Additionally `orchestratorModeValues` in `enums.ts:43` is `['http','ao-cli','manual','disabled']` — it lacks `'claude-session'`, so the mode of a session-native dispatch cannot be stored.

---

## 3. Architecture

### 3.1 Target topology

```
              ┌────────────────────────────── Serving Process ──────────────────────────────┐
              │  Next.js app (/src, primary)         OR        CLI Fastify (packages/cli,   │
              │                                                headless alternative)        │
              │                                                                             │
  Conductor   │  src/lib/orchestrator.ts                       packages/cli/src/server/     │
  (browser) ──┼─▶ getServerOrchestrator()  ──────────┐         index.ts (same core calls)   │
              │     lazy singleton, env/config-driven │                                     │
              │                                       ▼                                     │
              │        ┌──────────────────────────────────────────────┐                     │
              │        │ packages/core                                │                     │
              │        │                                              │                     │
              │  API   │  WaveExecutionController ──▶ WaveDispatch-   │                     │
              │ routes │   (state machine, retry)      Coordinator    │                     │
              │   │    │        ▲                        │ dispatch-  │                     │
              │   │    │        │ onWaveComplete         │ ToOrch()   │                     │
              │   ▼    │  CompletionListener             ▼            │                     │
              │ pause/ │        ▲              OrchestratorService    │                     │
              │ resume │        │ job:complete   │  (adapter strategy)│                     │
              │ dispatch        │ job:error      │                    │                     │
              │        │  ExecutionBridge ◀──────┘ onEvent()          │                     │
              │        │  (NEW — event router)   │                    │                     │
              │        └─────────────────────────┼────────────────────┘                     │
              │                                  │                                          │
              │            ┌─────────────────────┼──────────────────┐                       │
              │            ▼                     ▼                  ▼                       │
              │   ClaudeSessionAdapter      AoCliAdapter       HttpAdapter                  │
              │   (push; DEFAULT)           (poll; fallback)   (poll; remote)               │
              └────────────┼─────────────────────┼──────────────────┼───────────────────────┘
                           │ POST /v1/sessions   │ ao spawn/status  │ POST /dispatch
                           ▼                     ▼                  ▼
                  Session Dispatcher        local `ao` CLI     remote orchestrator
                  (Claude Code sessions)
                           │
                           │  POST {callbackUrl}/status , {callbackUrl}/complete
                           └───────────────▶  /api/orchestrator/status | /complete
                                             └─▶ service.ingestStatusUpdate / ingestCompletionReport
                                                  └─▶ ExecutionBridge ─▶ CompletionListener/Controller
                                                       └─▶ waveTasks / rufloSessions / activity_events
                                                            └─▶ /api/events/stream (existing SSE poll) ─▶ UI
```

### 3.2 Component responsibilities

| Component | File | Responsibility |
|---|---|---|
| `getServerOrchestrator()` | `src/lib/orchestrator.ts` (NEW) | Lazy, process-wide init of `OrchestratorService`, `StatusPoller`, and `ExecutionBridge` from env vars, mirroring `src/lib/db/index.ts`'s `globalThis` guard. Returns `OrchestratorService`. |
| `OrchestratorService` | `packages/core/src/orchestrator/service.ts` | Unchanged contract. Adapter selection, session↔job mapping, event fan-out, push ingestion. |
| `ClaudeSessionAdapter` | `packages/core/src/orchestrator/claude-session-adapter.ts` | Session-native dispatch per §7 contract; push-based. Default mode. |
| `AoCliAdapter` / `HttpAdapter` | existing | Unchanged; poll-based fallbacks tracked by `StatusPoller`. |
| `WaveDispatchCoordinator` | `.../execution/dispatch-coordinator.ts` | Real `dispatchToOrchestrator()`: creates `rufloSessions` row, calls `service.dispatch()`, records `assignedSessionId`/`externalSessionId`. New `redispatchTask()` for retries. |
| `WaveExecutionController` | `.../execution/controller.ts` | State machine; retry re-dispatch via coordinator; new `handleWaveComplete()` (advance/dispatch-next, pause-aware). |
| `CompletionListener` | `.../execution/completion-listener.ts` | Single writer for task status on completion events; wave-completion detection; fixed event-type mapping; persists `completionSummary`. |
| `ExecutionBridge` (NEW) | `.../execution/execution-bridge.ts` | Subscribes to `OrchestratorService.onEvent()`; maps `job:*` events to wave tasks by `assignedSessionId`; routes to listener/controller. The one place the orchestrator and wave-planner packages meet at runtime. |
| Callback routes | `src/app/api/orchestrator/{status,complete}/route.ts` | Authenticate callback token, persist session progress (existing), **and** forward to `service.ingestStatusUpdate()` / `ingestCompletionReport()` so push adapters and the bridge see the events. |
| Plan projection | `packages/core/src/wave-planner/plan-projection.ts` (NEW) | Convert a `WavePlanGenerationResult` into `plans`/`workstreams`/`tasks` rows so the legacy plan-review UI is fed by the AI pipeline. Shared by Next and CLI routes. |

### 3.3 Consolidation decision: Next app hosts the orchestrator (CLI server stays headless)

**Decision:** The Next.js app initializes the orchestrator service **directly from `packages/core`** via a lazy singleton in `src/lib/orchestrator.ts` — the same `initOrchestratorService()` + `initStatusPoller()` calls `packages/cli/src/server/index.ts` already makes. The Next app does **not** proxy to the CLI Fastify server.

Rationale:

1. The Next app is the only UI. Its API routes already own the DB (`src/lib/db` initializes core's Drizzle client in-process). Proxying dispatch to a second process while both write the same SQLite file adds a network hop, a second failure domain, and SQLite write contention for zero capability gain.
2. All orchestration logic already lives in `packages/core`; hosting is ~60 lines of wiring. Duplicating that wiring is cheaper than maintaining a proxy layer plus process-lifecycle management for the Fastify server.
3. The CLI Fastify server (`devpilot serve`) remains supported as a **headless alternative** for UI-less installs (benchmarks, bridge targets). It gets the same new wiring (`ExecutionBridge`, config-driven orchestrator options — fixing the fact that `serve.ts` never passes `options.orchestrator` today).
4. **Constraint:** exactly one process may run with `DEVPILOT_ORCHESTRATOR_MODE != disabled` against a given DB. Running Next dev and `devpilot serve` simultaneously with both enabled would double-dispatch. This is documented in §8 and enforced only by configuration, not code, in Tier 1.
5. The legacy `OrchestratorClient` singleton path (`initOrchestratorClient` / `isOrchestratorConfigured` / `getOrchestratorClient` in `client.ts`) is **retired from route code**. `OrchestratorClient` itself survives as the internal engine of `HttpAdapter`. `buildDispatchRequest()` in `client.ts` is superseded by the coordinator's request building and may be deleted once `fleet/dispatch` is migrated.

---

## 4. Data Model

No new tables. One new column, one enum extension, and DDL-drift repairs. House conventions: `sqliteTable` + `text`/`integer`/`real`, cuid2 ids, `{ mode: 'json' }` for arrays, `{ mode: 'timestamp' }` for dates, snake_case column names.

### 4.1 `waveTasks.completionSummary` (new column)

`packages/core/src/db/schema/wave-planner.ts`, inside `waveTasks` (after `errorMessage`):

```ts
export const waveTasks = sqliteTable('wave_tasks', {
  // ... existing columns unchanged ...
  errorMessage: text('error_message'),
  completionSummary: text('completion_summary'),   // NEW: summary from CompletionReport.summary
  retryCount: integer('retry_count').notNull().default(0),
});
```

Consumers: `CompletionListener.handleTaskComplete()` writes it (instead of abusing `errorMessage`); `WaveDispatchCoordinator.getPredecessorContext()` reads it (resolving the TODO at `dispatch-coordinator.ts:176`); `WavePlanGenerator.reoptimize()` uses it for the completed-work section.

### 4.2 `orchestratorModeValues` gains `'claude-session'`

`packages/core/src/db/schema/enums.ts:43`:

```ts
export const orchestratorModeValues = ['claude-session', 'http', 'ao-cli', 'manual', 'disabled'] as const;
export type OrchestratorMode = (typeof orchestratorModeValues)[number];
```

This aligns the DB enum with the runtime `OrchestratorMode` in `packages/core/src/orchestrator/adapter.ts:27` (which keeps `'manual'` out; the DB enum is a superset and that is acceptable — `'manual'` marks operator-run sessions).

### 4.3 sqlite adapter DDL changes (`packages/core/src/db/adapters/sqlite.ts`)

The adapter embeds `CREATE TABLE IF NOT EXISTS` statements, so **both** new columns and the pre-existing drift must land here:

1. `wave_tasks` DDL (line 199 block): add `completion_summary TEXT,` after `error_message TEXT,`.
2. `ruflo_sessions` DDL (line 88 block) — repair drift with `fleet.ts` by adding after `pr_url TEXT,`:

```sql
  external_session_id TEXT,
  orchestrator_mode TEXT CHECK(orchestrator_mode IN ('claude-session', 'http', 'ao-cli', 'manual', 'disabled')),
  tokens_used INTEGER,
  cost_usd INTEGER,
```

3. Because `CREATE TABLE IF NOT EXISTS` never alters existing databases, add an idempotent column migration step run at init, after the DDL batch:

```ts
function ensureColumn(db: BetterSQLite3Database, table: string, column: string, ddl: string): void {
  const cols = db.$client.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some(c => c.name === column)) {
    db.$client.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
// invoked for: wave_tasks.completion_summary, ruflo_sessions.external_session_id,
// ruflo_sessions.orchestrator_mode, ruflo_sessions.tokens_used, ruflo_sessions.cost_usd
```

(Adapt the raw-handle access to however `sqlite.ts` holds its better-sqlite3 instance; the requirement is PRAGMA-guarded `ALTER TABLE ADD COLUMN`, executed idempotently at startup.)

### 4.4 Session ↔ wave-task correlation (no schema change)

The mapping is stored in existing columns, written at dispatch time:

- `waveTasks.assignedSessionId` ← `rufloSessions.id` (DevPilot session id)
- `rufloSessions.externalSessionId` ← adapter's `orchestratorJobId`
- `rufloSessions.orchestratorMode` ← active adapter mode

`ExecutionBridge` resolves `job:*` events (keyed by DevPilot `sessionId`) to wave tasks with `WHERE wave_tasks.assigned_session_id = ?`. Non-wave sessions (plain fleet dispatch) simply miss the lookup and are ignored by the bridge. This also survives process restarts, unlike `OrchestratorService.sessionMappings` (in-memory).

---

## 5. API Surface

### 5.1 `POST /api/wave-plans/[planId]/pause` (NEW — Next app)

File: `src/app/api/wave-plans/[planId]/pause/route.ts`. Delegates to `WaveExecutionController.pause()`.

- Request: no body.
- `200`:

```json
{ "message": "Wave plan paused", "wavePlan": { "id": "…", "status": "paused", "currentWaveIndex": 1, "totalWaves": 4 } }
```

- `404` `{ "error": "Wave plan not found" }`
- `409` `{ "error": "Invalid wave plan status", "detail": "Cannot pause wave plan in status: draft" }` — controller throws; route maps "Cannot pause…" to 409.
- `500` `{ "error": "Failed to pause wave plan", "detail": "…" }`

Semantics: `executing → paused`. Running tasks are **not** cancelled; only new dispatches stop (matches `controller.ts:69` docstring).

### 5.2 `POST /api/wave-plans/[planId]/resume` (NEW — Next app)

File: `src/app/api/wave-plans/[planId]/resume/route.ts`. Delegates to `WaveExecutionController.resume()`, which re-dispatches the current wave if incomplete.

- Request: no body.
- `200`:

```json
{
  "message": "Wave plan resumed",
  "wavePlan": { "id": "…", "status": "executing", "currentWaveIndex": 1, "totalWaves": 4 },
  "dispatchResult": { "dispatched": 2, "queued": 1, "errors": [] }
}
```

`dispatchResult` is `null` when the current wave was already complete (nothing re-dispatched).

- `404`, `409` (`"Cannot resume wave plan in status: executing"`), `500` — same shape as pause.

Both routes construct the controller with the shared execution config from `src/lib/orchestrator.ts` (`getWaveExecutionConfig()`, §6.1) — not a route-local copy of `DEFAULT_CONFIG` as `dispatch/route.ts` does today.

### 5.3 `POST /api/items/[id]/plan/generate` (CHANGED — Next app)

File: `src/app/api/items/[id]/plan/generate/route.ts`. `generateMockWorkstreams()` (line 192) is **deleted**. The route:

1. Builds spec content from the item (title + any prior acceptance criteria; the `buildSpecContent()` pattern from `wave-plan/generate/route.ts:115` moves into core, §6.6).
2. Calls `generateWavePlanForItem()` (core) which runs `WavePlanGenerator` (real AI, refinement, flat-plan fallback) with `autoPersist: true`.
3. Calls `projectWavePlanToPlan()` (core, §6.6) to create the `plans` / `workstreams` / `tasks` / `touchedFiles` rows from the wave plan (one workstream per wave; conflict warnings computed against `inFlightFiles` exactly as today, lines 119–124).

Response shape is unchanged (`201` with the plan + relations — the UI contract is preserved). New error:

- `503` `{ "error": "PLAN_AI_UNAVAILABLE", "detail": "ANTHROPIC_API_KEY is not configured" }` when no API key is present. (The generator's internal fallback still covers *AI call failures*; a missing key is a configuration error surfaced honestly, not silently mocked.)

### 5.4 `POST /api/items/:id/plan/generate` (CHANGED — CLI Fastify)

File: `packages/cli/src/server/api/items.ts` (canned plan at lines 221–259 **deleted**). Same pipeline via the same core helpers; same `201` shape; `503 PLAN_AI_UNAVAILABLE` without a key.

### 5.5 `POST /api/fleet/dispatch/[itemId]` (CHANGED — Next app)

File: `src/app/api/fleet/dispatch/[itemId]/route.ts`.

- Replaces `orchestrator.isOrchestratorConfigured()` / `getOrchestratorClient()` (lines 127–147) with `getServerOrchestrator()`.
- **No more dead sessions**: if the orchestrator mode is `disabled`, return `503` *before* creating any rows:

```json
{ "error": "ORCHESTRATOR_UNAVAILABLE", "detail": "Set DEVPILOT_ORCHESTRATOR_MODE (claude-session | ao-cli | http) to enable dispatch" }
```

- If `service.dispatch()` returns `accepted: false`: roll back the created session row and in-flight file locks, keep the horizon item, return `502` `{ "error": "DISPATCH_REJECTED", "detail": "<adapter error>" }`.
- On success, persist `externalSessionId` + `orchestratorMode` on the session row and include in the `200` response:

```json
{ "session": { "…": "…" }, "orchestrator": { "mode": "claude-session", "externalJobId": "sess_abc123" }, "message": "Successfully dispatched \"…\" to fleet" }
```

### 5.6 `POST /api/orchestrator/status` and `POST /api/orchestrator/complete` (CHANGED — Next app)

- New auth: if `DEVPILOT_CALLBACK_TOKEN` is set, require header `X-DevPilot-Callback-Token` to match; else `401` `{ "error": "UNAUTHORIZED" }`. (Unset token = open, for local dev.)
- After the existing `rufloSessions` / Linear / `activityEvents` writes, forward the payload: `getServerOrchestrator().ingestStatusUpdate(update)` / `.ingestCompletionReport(report)`. This feeds the push-adapter cache **and** emits `job:progress` / `job:complete` / `job:error` events that `ExecutionBridge` consumes — this is how a wave task learns its session finished.
- `complete/route.ts` fixes the schema-mismatched `completedTasks` insert (line 43): use `{ sessionId, label: session.ticketTitle, model: null, durationMinutes: report.durationMinutes }` and store `tokensUsed`/`costUsd` on the session row (columns exist per §4.3).
- Response shapes unchanged.

### 5.7 `POST /api/wave-plans/[planId]/dispatch` (CHANGED — Next app)

File: `src/app/api/wave-plans/[planId]/dispatch/route.ts`. Behavior-preserving except:

- Uses `getWaveExecutionConfig()` instead of the local `DEFAULT_CONFIG` (line 19), and calls `getServerOrchestrator()` first; returns the same `503 ORCHESTRATOR_UNAVAILABLE` as §5.5 when disabled.
- `dispatchResult.errors[]` entries now carry real adapter errors instead of never occurring.

### 5.8 Route/error summary

| Method & Path | Status codes | Notes |
|---|---|---|
| `POST /api/wave-plans/[planId]/pause` | 200, 404, 409, 500 | NEW |
| `POST /api/wave-plans/[planId]/resume` | 200, 404, 409, 500 | NEW |
| `POST /api/items/[id]/plan/generate` | 201, 404, 503, 500 | mock deleted |
| CLI `POST /api/items/:id/plan/generate` | 201, 404, 503, 500 | canned plan deleted |
| `POST /api/fleet/dispatch/[itemId]` | 200, 400, 404, 502, 503, 500 | no dead sessions |
| `POST /api/orchestrator/status` | 200, 401, 404, 500 | +auth, +ingest |
| `POST /api/orchestrator/complete` | 200, 401, 404, 500 | +auth, +ingest, insert fix |
| `POST /api/wave-plans/[planId]/dispatch` | 200, 400, 404, 503, 500 | real dispatch |

---

## 6. Core Services

### 6.1 `src/lib/orchestrator.ts` (NEW)

```ts
import type { OrchestratorService, OrchestratorAdapterConfig } from '@devpilot.sh/core/orchestrator';
import type { WaveExecutionConfig } from '@devpilot.sh/core/wave-planner/execution/types';

/** Lazy, process-wide orchestrator bootstrap. Safe to call from any route. */
export function getServerOrchestrator(): OrchestratorService;

/** Shared execution config (limits + callbackUrl) built from env. */
export function getWaveExecutionConfig(): WaveExecutionConfig;

/** Adapter config assembled from env (exported for tests). */
export function buildOrchestratorConfigFromEnv(): OrchestratorAdapterConfig;
```

Behavior:

- Guards with `globalThis` (same pattern as `src/lib/db/index.ts:13`) so Next.js hot reload / route isolation cannot double-init.
- First call: `buildOrchestratorConfigFromEnv()` (env vars per §8) → `initOrchestratorService(config)` → `initStatusPoller(service, { pollIntervalMs: 5000, onStatusUpdate, onComplete, onError })` with the same DB-updating callbacks as `packages/cli/src/server/index.ts:57–111` (extracted into a small shared helper, §6.7) → `initExecutionBridge(service, { execution: getWaveExecutionConfig() }).start()`.
- Mode `disabled` still initializes the service (DisabledAdapter) so routes can uniformly call `service.isEnabled`.
- `getWaveExecutionConfig()` returns `{ maxConcurrentSubagents: 4, maxTotalActiveTasks: 8, subagentDispatchDelayMs: 500, waveAdvanceDelayMs: 2000, retryLimit: 1, failurePolicy: 'halt', autoAdvance: true, callbackUrl }` with numeric/policy overrides from env (§8) and `callbackUrl = `${DEVPILOT_CALLBACK_URL ?? APP_URL ?? 'http://localhost:3000'}/api/orchestrator``.

### 6.2 `packages/core/src/wave-planner/execution/types.ts` (CHANGED)

```ts
export interface WaveExecutionConfig {
  maxConcurrentSubagents: number;
  maxTotalActiveTasks: number;
  subagentDispatchDelayMs: number;
  waveAdvanceDelayMs: number;
  retryLimit: number;
  failurePolicy: 'halt' | 'continue';
  autoAdvance: boolean;
  /** NEW — base URL the executing agent POSTs callbacks to, e.g. "http://localhost:3000/api/orchestrator". */
  callbackUrl: string;
}

/** NEW — per-wave dispatch context loaded once from wavePlan → horizonItem. */
export interface WaveDispatchContext {
  repo: string;
  itemTitle: string;
  linearTicketId?: string | null;
}

/** NEW — result of a single successful task dispatch. */
export interface TaskDispatchOutcome {
  sessionId: string;        // rufloSessions.id
  externalJobId: string;    // adapter job/session id
  mode: string;             // OrchestratorMode
}
```

`callbackUrl` is a **required** field; both existing construction sites (`src/app/api/wave-plans/[planId]/dispatch/route.ts:19` and any tests) are updated in the same change.

### 6.3 `packages/core/src/wave-planner/execution/dispatch-coordinator.ts` (CHANGED)

New/changed members of `WaveDispatchCoordinator`:

```ts
/** Loads repo/title/ticket for a plan (wavePlans → horizonItems). Cached per dispatchWave call. */
private async loadDispatchContext(wavePlanId: string): Promise<WaveDispatchContext>;

/** REPLACES the console.log placeholder (old signature: (request) => Promise<void>). */
private async dispatchToOrchestrator(
  task: WaveTask,
  request: WaveDispatchRequest,
  ctx: WaveDispatchContext
): Promise<TaskDispatchOutcome>;

/** NEW — re-dispatch a task previously marked 'retrying' (controller retry path). */
async redispatchTask(wavePlanId: string, taskCode: string): Promise<DispatchResult>;
```

`dispatchToOrchestrator()` behavior:

1. `const service = getOrchestratorServiceOrNull()`; if `null` or `!service.isEnabled` → throw `new Error('ORCHESTRATOR_UNAVAILABLE')`. `dispatchWave()` catches this specific error and counts the task as **queued** (status stays `pending`) instead of `failed` — an unconfigured orchestrator must not burn tasks (§9.1).
2. Insert a `rufloSessions` row: `{ repo: ctx.repo, linearTicketId: ctx.linearTicketId ?? `DP-${task.taskCode}-${Date.now()}`, ticketTitle: `${ctx.itemTitle} — ${task.taskCode} ${task.label}`, currentWorkstream: `Wave ${task.waveIndex}`, status: 'ACTIVE', progressPercent: 0, inFlightFiles: task.filePaths ?? [] }`.
3. Build the `DispatchRequest` (`packages/core/src/orchestrator/types.ts:16`): `sessionId` = new session id; `repo` = `ctx.repo`; `callbackUrl` = `this.config.callbackUrl`; `taskSpec = { prompt: buildTaskPrompt(request, ctx), filePaths: request.fileScope, model: request.model, workstream: `wave-${request.waveIndex}`, constraints: request.constraints }`; `metadata = { wavePlanId, waveIndex, taskCode }`.
4. `await service.dispatch(req)`. If `!accepted`: delete the session row, throw `new Error(response.error ?? 'DISPATCH_REJECTED')` (caller marks the task failed — existing catch at line 95).
5. On success: update the session row (`externalSessionId`, `orchestratorMode: service.mode`) and set `waveTasks.assignedSessionId = sessionId` (in the same update that sets `status: 'dispatched'` in `dispatchWave()`, line 82 — move that write into the success path so `assignedSessionId` and `status` commit together).
6. Return `{ sessionId, externalJobId, mode }`.

`redispatchTask()` behavior: load the task; require `status === 'retrying'` (else return `{dispatched:0,queued:0,errors:[{taskCode, error:'NOT_RETRYING'}]}`); re-check plan `status === 'executing'` (pause guard, §9.4); rebuild predecessor context and request; run steps 1–6 above; on success set `status:'dispatched', startedAt: new Date()`; on failure set `status:'failed', errorMessage, completedAt` and return the error in `DispatchResult.errors`.

`getPredecessorContext()` change (line 176): `completionSummary: depTask.completionSummary ?? ''`.

`buildDispatchRequest()` change (line 135 TODO): `constraints` = file-scope guard rails derived from the plan: `[`Only modify files within: ${task.filePaths.join(', ')}`]` when `filePaths` is non-empty, else `[]`.

### 6.4 `packages/core/src/wave-planner/execution/controller.ts` (CHANGED)

```ts
/** Resolves the TODO at line 351. */
async onTaskFailed(wavePlanId: string, taskCode: string, error: string): Promise<void>;

/** NEW — invoked by CompletionListener's onWaveComplete callback. */
async handleWaveComplete(wavePlanId: string, waveIndex: number): Promise<void>;
```

- `onTaskFailed()`: after setting `status: 'retrying'` (existing lines 338–349), replace the TODO with:

```ts
const plan = await this.db.query.wavePlans.findFirst({ where: eq(wavePlans.id, wavePlanId) });
if (plan?.status === 'executing') {
  const result = await this.dispatchCoordinator.redispatchTask(wavePlanId, taskCode);
  if (result.errors.length > 0) {
    // re-dispatch itself failed → treat as terminal failure via the existing else-branch logic
    await this.failTask(wavePlanId, taskCode, result.errors[0].error);  // extracted from lines 353-404
  }
}
// if paused: task remains 'retrying'; resume() re-dispatches the current wave which
// must also pick up 'retrying' tasks (see below)
```

- Extract lines 353–404 (mark failed + halt/continue policy) into `private async failTask(wavePlanId, taskCode, error)` so both branches share it.
- `handleWaveComplete(wavePlanId, waveIndex)`: mark the wave `completed` (existing logic from `onTaskComplete` lines 265–277); if last wave → `markWavePlanComplete()` + `collectFinalMetrics()` (from `auto-advance.ts`); else if `this.config.autoAdvance`: re-read plan status — dispatch next wave **only if** still `executing` (§9.4) — then `advanceToNextWave()` + `delay(waveAdvanceDelayMs)` + `dispatchWave(wavePlanId, waveIndex + 1)`.
- `onTaskComplete()` is retained but reduced to: delegate status write to `CompletionListener` semantics is NOT duplicated — the bridge path (§6.5) is authoritative. `onTaskComplete` body becomes `handleWaveComplete` invocation after a completion check, and is marked `@deprecated — use ExecutionBridge`; no current caller exists, so no behavior change.
- `resume()` (line 97): when re-dispatching the current wave, `WaveDispatchCoordinator.dispatchWave()` filters `t.status === 'pending'` (line 46); extend the filter to `'pending' || 'retrying'` so paused-mid-retry tasks are re-dispatched on resume.
- `pause()` docstring commitment unchanged: running sessions are not cancelled.

### 6.5 `packages/core/src/wave-planner/execution/execution-bridge.ts` (NEW)

```ts
import type { OrchestratorService, OrchestratorEvent } from '../../orchestrator';
import type { WaveExecutionConfig } from './types';

export interface ExecutionBridgeOptions {
  execution: WaveExecutionConfig;
}

export class ExecutionBridge {
  constructor(orchestrator: OrchestratorService, options: ExecutionBridgeOptions);
  /** Subscribe to orchestrator events. Idempotent. */
  start(): void;
  /** Unsubscribe. */
  stop(): void;
}

export function initExecutionBridge(orchestrator: OrchestratorService, options: ExecutionBridgeOptions): ExecutionBridge;
export function getExecutionBridgeOrNull(): ExecutionBridge | null;
```

Internally it owns one `WaveDispatchCoordinator`, one `WaveExecutionController`, and one `CompletionListener` constructed as:

```ts
this.coordinator = new WaveDispatchCoordinator(options.execution);
this.controller  = new WaveExecutionController(options.execution, this.coordinator);
this.listener    = new CompletionListener((wavePlanId, waveIndex) =>
  this.controller.handleWaveComplete(wavePlanId, waveIndex)
);
```

Event routing (`orchestrator.onEvent(handler)`):

| Orchestrator event | Bridge action |
|---|---|
| `job:started` | Look up `waveTasks` by `assignedSessionId === event.sessionId`; if found → `listener.handleTaskStarted(wavePlanId, taskCode, sessionId)` (idempotent re-mark as `running`). Miss → ignore (non-wave session). |
| `job:progress` | No wave-task write (session-level progress lives on `rufloSessions` via callbacks/poller). |
| `job:complete` | Lookup as above → `listener.handleTaskComplete(wavePlanId, taskCode, (event.data as CompletionReport).summary)`. |
| `job:error` | Lookup → `controller.onTaskFailed(wavePlanId, taskCode, errorMessage)` (retry path). |
| `job:cancelled` | Lookup → `controller.onTaskFailed(wavePlanId, taskCode, 'cancelled')` with retry **skipped**: cancellation is terminal — bridge calls the controller's terminal path (`failTask`) directly. |

All handlers are wrapped in try/catch with an `activityEvents` insert of type `'WAVE_TASK_FAILED'` on handler crash, so one bad event cannot kill the subscription.

### 6.6 `packages/core/src/wave-planner/plan-projection.ts` (NEW)

```ts
import type { WavePlanGenerationResult } from './generator';

export interface ProjectedPlanIds { planId: string; workstreamIds: string[]; taskIds: string[]; }

/** Build spec markdown from an item + optional existing plan (moved from
 *  src/app/api/items/[id]/wave-plan/generate/route.ts buildSpecContent()). */
export function buildSpecContentForItem(item: {
  title: string;
  plan?: { acceptanceCriteria?: string[]; workstreams?: { label: string; tasks: { label: string; filePaths?: string[] }[] }[] } | null;
}): string;

/** Run the wave planner for a horizon item that has no plan yet: creates the plans row
 *  first (the generator requires a planId), then generates + persists the wave plan. */
export async function generatePlanForItem(params: {
  horizonItemId: string;
  title: string;
  repo: string;
  workingDir: string;
  apiKey: string;
}): Promise<{ generation: WavePlanGenerationResult; planId: string }>;

/** Project a persisted wave plan into legacy plans/workstreams/tasks/touchedFiles rows. */
export async function projectWavePlanToPlan(params: {
  planId: string;
  generation: WavePlanGenerationResult;
  inFlightPaths: string[];               // for conflictWarning computation
}): Promise<ProjectedPlanIds>;
```

Projection rules (deterministic, no AI):

- One `workstreams` row per wave: `label` = wave label, `repo` from the item, `workerCount` = `min(wave.tasks.length, maxParallelism)`, `orderIndex` = `waveIndex`.
- One `tasks` row per wave task: `label` = task description (≤100 chars), `model` = `recommendedModel` (already uppercase `HAIKU|SONNET|OPUS`), `complexity`, `filePaths`, `dependsOn` = `dependencies` (task codes), `orderIndex` = position within wave.
- `estimatedCostUsd` per task from a static table: HAIKU $0.01 / SONNET $0.05 / OPUS $0.15, scaled ×1/×2/×3/×4 for S/M/L/XL. Plan `estimatedCostUsd` = sum; `baselineCostUsd` = sum × `totalTasks / max(criticalPathLength, 1)` capped at ×2 (serial-execution baseline — honest, not the fake "+20%").
- `touchedFiles` + `conflictWarning` computed against `inFlightPaths` exactly as the current route does (lines 119–146 of the Next route).
- `confidenceSignals` = `{ parallelizationScore, refinementIterations, generatedByAI: generation.success }` — no more hardcoded 0.85.

Exported from `packages/core/src/wave-planner/index.ts`.

### 6.7 `packages/core/src/orchestrator/host-wiring.ts` (NEW, small)

Extracts the duplicated status-poller callbacks from `packages/cli/src/server/index.ts:57–111` so Next and CLI share them:

```ts
export function createDbStatusPollerCallbacks(): Pick<StatusPollerConfig, 'onStatusUpdate' | 'onComplete' | 'onError'>;
```

Implementation is the existing CLI callback bodies (update `rufloSessions.progressPercent/status`, on complete set `prUrl`/`tokensUsed`/`costUsd` (cents) + insert `SESSION_COMPLETE` activity event, on error mark `ERROR`), using `getDatabase()` instead of a closed-over `db`. Exported from `packages/core/src/orchestrator/index.ts`. `packages/cli/src/server/index.ts` and `src/lib/orchestrator.ts` both consume it.

### 6.8 `packages/core/src/wave-planner/execution/completion-listener.ts` (CHANGED)

- `handleTaskComplete()`: write `completionSummary: completionSummary ?? null` (new column) and stop writing `errorMessage` (bug at line 77).
- `handleTaskFailed()`: accept `retryLimit` via constructor options (`new CompletionListener(onWaveComplete, { retryLimit })`, default 1) instead of the hardcoded `retryCount < 1` (line 113).
- `emitEvent()` and `auto-advance.ts`'s `emitEvent()`: map `WaveSSEEvent.type` to the uppercase `EventType` enum before insert via a new exported helper:

```ts
// execution/types.ts
export function toActivityEventType(t: WaveSSEEvent['type']): EventType; // 'wave_task_complete' → 'WAVE_TASK_COMPLETE'
```

No new SSE/event names are introduced in Tier 1 — the existing `WaveSSEEvent` union (`packages/core/src/wave-planner/types.ts:340–350`) and `eventTypeValues` enum are sufficient; Tier ≥2 TRDs must reuse them.

### 6.9 `packages/cli/src/commands/serve.ts` + `packages/cli/src/server/index.ts` (CHANGED)

- `serve.ts` gains flags `--orchestrator-mode <mode>`, `--session-api-url <url>`, `--ao-project <name>`, `--ao-path <path>`, `--orchestrator-url <url>`; defaults read from `.devpilot/config.yaml` `orchestrator:` section (§8.2) then env; passes `options.orchestrator` into `startServer()` (today it never does — the wiring at `server/index.ts:44` is dead in practice).
- `server/index.ts`: after `initOrchestratorService`/`initStatusPoller` (now using `createDbStatusPollerCallbacks()`), also `initExecutionBridge(orchestrator, { execution: waveExecutionConfigFromEnv() }).start()`, and extend `OrchestratorAdapterConfig` assembly with `sessionApiUrl`/`sessionEnvironmentId` for `claude-session` mode. `callbackUrl` becomes `http://127.0.0.1:${port}/api/orchestrator` — **note**: the Fastify server must therefore also register `POST /api/orchestrator/status|complete` equivalents in `registerFleetRoutes` (it already has `/api/fleet/callback` at line 51; that path is updated to `/api/orchestrator` for contract symmetry, with `/api/fleet/callback` kept as an alias).

---

## 7. Claude-Session Dispatch Contract

This section is the normative contract that replaces the placeholders flagged at `claude-session-adapter.ts:11–19` and `87–90`. Two halves: the **dispatcher API** (DevPilot → session runner) and the **callback API** (running session → DevPilot).

### 7.1 Dispatcher API (DevPilot → session runner)

Base URL: `DEVPILOT_SESSION_API_URL` (e.g. the hosted DevPilot bridge, or a local session-runner daemon). All requests: `Content-Type: application/json`, `Authorization: Bearer ${DEVPILOT_SESSION_API_KEY}`. `HttpSessionTransport` is updated to these paths (versioned under `/v1`).

#### `POST /v1/sessions` — create & start a session

Request body (`CreateSessionParams`, extended with `callbackToken`):

```json
{
  "sessionId": "cm9x…",                    
  "repo": "openconjecture/devpilot",
  "prompt": "<composed task prompt, see 7.3>",
  "model": "sonnet",
  "filePaths": ["src/lib/foo.ts"],
  "acceptanceCriteria": ["All tests pass"],
  "constraints": ["Only modify files within: src/lib/foo.ts"],
  "linearTicketId": "DP-142",
  "callbackUrl": "https://devpilot.example.com/api/orchestrator",
  "callbackToken": "<DEVPILOT_CALLBACK_TOKEN>",
  "environmentId": "env_…",
  "metadata": { "wavePlanId": "…", "waveIndex": 0, "taskCode": "1.1" }
}
```

Responses:

- `201` `{ "externalSessionId": "sess_abc123", "status": "queued", "createdAt": "2026-07-19T12:00:00Z" }`
- `400` invalid payload · `401` bad bearer token · `409` `sessionId` already dispatched (idempotency key — re-POSTing the same `sessionId` must not create a second session; the runner returns the existing `externalSessionId` with `200`) · `429` `{ "error": "CAPACITY", "retryAfterSeconds": 60 }` · `503` runner unavailable.

`ClaudeSessionAdapter.dispatch()` maps `201/200 → accepted`, `429 → accepted: false, error: 'CAPACITY'` (task becomes queued, §9.2), anything else → `accepted: false` with the error text.

#### `GET /v1/sessions/{externalSessionId}` — pull-fallback status

`200` → partial `JobStatus`: `{ "status": "running", "progressPercent": 40, "currentStep": "…", "currentFile": "…", "message": "…", "filesModified": ["…"] }` · `404` unknown session. Used only when no callback has arrived (`transport.getSession`, adapter line 277).

#### `POST /v1/sessions/{externalSessionId}/messages` — steer

Request `{ "message": "…" }` → `202` `{ "accepted": true }` · `404` · `410` session already terminal.

#### `POST /v1/sessions/{externalSessionId}/stop` — cancel

No body → `202` `{ "success": true, "message": "stopping" }` · `404` · `410` already stopped (treated as success by the adapter).

#### `GET /v1/health`

`200` `{ "status": "healthy", "version": "1.4.0", "activeSessions": 3 }`. Maps onto `OrchestratorHealth` via `transport.health()`.

### 7.2 Callback API (session → DevPilot)

The runner injects reporting instructions into the session (§7.3). The session (or runner on its behalf) POSTs:

- `POST {callbackUrl}/status` — body is exactly `StatusUpdate` (`packages/core/src/orchestrator/types.ts:38`): `{ sessionId, status, progressPercent, currentStep?, currentFile?, message?, filesModified?, tokensUsed?, timestamp }`. Sent on meaningful transitions and at least every 2 minutes while running.
- `POST {callbackUrl}/complete` — body is exactly `CompletionReport` (`types.ts:53`): `{ sessionId, success, prUrl?, commitSha?, filesModified, filesCreated, filesDeleted, summary, tokensUsed, costUsd, durationMinutes, error?, metadata? }`. Sent exactly once, terminal. `sessionId` is always the **DevPilot** session id passed at create time — this is what lets `/api/orchestrator/*` and the `ExecutionBridge` correlate without knowing `externalSessionId`.

Auth: header `X-DevPilot-Callback-Token: {callbackToken}` echoed from the create payload. DevPilot validates against `DEVPILOT_CALLBACK_TOKEN` (§5.6). Retries: at-least-once with exponential backoff for 10 minutes; DevPilot handlers are idempotent (re-POSTing a terminal `complete` for an already-completed session/task is a no-op — see §9.5).

### 7.3 Prompt envelope — `packages/core/src/orchestrator/session-prompt.ts` (NEW)

```ts
export interface SessionPromptInput {
  taskDescription: string;
  repo: string;
  fileScope: string[];
  predecessorContext: { taskCode: string; description: string; filesModified: string[]; completionSummary: string }[];
  acceptanceCriteria?: string[];
  constraints?: string[];
  callbackUrl: string;
  sessionId: string;
}
export function buildSessionPrompt(input: SessionPromptInput): string;
```

Produces a markdown prompt with sections: Task, File Scope (exclusive lock warning), Context From Predecessors, Acceptance Criteria, Constraints, and **Reporting Protocol** (the exact `curl` commands for §7.2 with the session id and callback URL filled in, instructing status posts on milestones and a final complete post). `WaveDispatchCoordinator` uses it for `taskSpec.prompt` (§6.3 step 3); `ao-cli` fallback receives the same prompt text via `ao spawn` (the reporting section is harmless there — the ao poller supersedes it).

### 7.4 Fallback ladder

`DEVPILOT_ORCHESTRATOR_MODE` selects exactly one adapter — there is no silent runtime fallback. The **documented operator ladder** is: `claude-session` (default for new installs) → `ao-cli` (legacy local tmux orchestration) → `http` (remote orchestrator) → `disabled`. `devpilot setup` recommends `claude-session` and falls back to suggesting `ao-cli` when `DEVPILOT_SESSION_API_URL` is unset but `ao` is installed.

---

## 8. Configuration

### 8.1 Environment variables

| Variable | Default | Used by | Meaning |
|---|---|---|---|
| `DEVPILOT_ORCHESTRATOR_MODE` | `disabled` | Next `src/lib/orchestrator.ts`, CLI serve | `claude-session` \| `ao-cli` \| `http` \| `disabled` |
| `DEVPILOT_SESSION_API_URL` | — | claude-session | Base URL of the session runner (§7.1) |
| `DEVPILOT_SESSION_API_KEY` | — | claude-session | Bearer token for the dispatcher API |
| `DEVPILOT_SESSION_ENVIRONMENT_ID` | — | claude-session | Managed environment id (optional) |
| `DEVPILOT_CALLBACK_URL` | `APP_URL` → `http://localhost:3000` | dispatch | Public base of this DevPilot instance; `/api/orchestrator` is appended |
| `DEVPILOT_CALLBACK_TOKEN` | unset (open) | callback routes, dispatch | Shared secret echoed as `X-DevPilot-Callback-Token` |
| `DEVPILOT_ORCHESTRATOR_URL` | — | http mode | Remote orchestrator base URL |
| `DEVPILOT_ORCHESTRATOR_API_KEY` | — | http mode | Bearer token for http mode |
| `DEVPILOT_AO_PROJECT` | `default` | ao-cli | `ao` project name |
| `DEVPILOT_AO_PATH` | `ao` | ao-cli | Path to the `ao` binary |
| `DEVPILOT_WAVE_MAX_CONCURRENT` | `4` | execution config | `maxConcurrentSubagents` |
| `DEVPILOT_WAVE_MAX_TOTAL` | `8` | execution config | `maxTotalActiveTasks` |
| `DEVPILOT_WAVE_RETRY_LIMIT` | `1` | execution config | `retryLimit` |
| `DEVPILOT_WAVE_FAILURE_POLICY` | `halt` | execution config | `halt` \| `continue` |
| `DEVPILOT_WAVE_AUTO_ADVANCE` | `true` | execution config | auto-dispatch wave N+1 |
| `ANTHROPIC_API_KEY` | — (existing) | plan generation | Required for §5.3/§5.4; absence → 503 |
| `WAVE_PLANNER_MODEL`, `WAVE_PLANNER_MAX_TOKENS`, `WAVE_PLANNER_MIN_PARALLELIZATION` | existing | generator | unchanged (`generator.ts:502–508`) |
| `DEVPILOT_SQLITE_PATH`, `APP_URL`, `WORKING_DIR` | existing | — | unchanged |

**Operational constraint (§3.3):** at most one process per DB may set `DEVPILOT_ORCHESTRATOR_MODE != disabled`.

### 8.2 `.devpilot/config.yaml` (CLI)

New top-level `orchestrator:` section consumed by `devpilot serve` (env vars win over config file):

```yaml
orchestrator:
  mode: claude-session        # claude-session | ao-cli | http | disabled
  session_api_url: https://bridge.devpilot.sh
  session_api_key: null       # prefer DEVPILOT_SESSION_API_KEY
  session_environment_id: null
  ao_project: default
  ao_path: ao
  http_url: null
  callback_token: null        # prefer DEVPILOT_CALLBACK_TOKEN
  wave:
    max_concurrent_subagents: 4
    max_total_active_tasks: 8
    retry_limit: 1
    failure_policy: halt
    auto_advance: true
```

---

## 9. Error Handling & Edge Cases

### 9.1 Orchestrator down / disabled

- **Disabled at route time**: `fleet/dispatch` and `wave-plans/dispatch` return `503 ORCHESTRATOR_UNAVAILABLE` before any DB mutation (§5.5, §5.7). No dead session rows, no file locks, item stays in READY.
- **Down mid-wave** (transport error / `503` from runner): `dispatchToOrchestrator()` throws `ORCHESTRATOR_UNAVAILABLE`; `dispatchWave()` catches that specific message, leaves the task `pending`, and counts it in `DispatchResult.queued` (not `errors`). Other errors keep today's behavior: task → `failed` with `errorMessage` (`dispatch-coordinator.ts:95–110`). The Conductor re-dispatches queued tasks via `POST /api/wave-plans/[planId]/dispatch` or `resume`.
- **Health**: hosts log `service.healthCheck()` at init; a `down` result is a warning, not fatal (the runner may come up later).

### 9.2 Partial wave dispatch failure

`dispatchWave()` is per-task fault-isolated (existing loop). Outcomes per task: `dispatched` (session created, request accepted), `queued` (capacity/`429`/unavailable — stays `pending`), `failed` (rejected/threw). A wave with a mix proceeds: dispatched tasks run; queued tasks wait for the next dispatch call; failed tasks flow through `onTaskFailed` retry policy when reported — or immediately if dispatch itself failed (already-marked failed tasks do not block wave-completion detection, which treats `failed` as terminal, `completion-listener.ts:152`). Under `failurePolicy: 'halt'`, the **first terminal failure** fails the plan and skips pending tasks (existing `controller.ts:368–402`); dispatched siblings keep running to completion but no new waves start.

### 9.3 Retry exhaustion

`onTaskFailed`: `retryCount < retryLimit` → `retrying` + `redispatchTask()`. Re-dispatch failure or a subsequent `job:error` when `retryCount >= retryLimit` → `failTask()`: `failed`, `completedAt`, then policy (`halt` → plan `failed`, wave `failed`, pending tasks `skipped`; `continue` → wave completes around it). Each retry creates a **new** `rufloSessions` row (fresh `assignedSessionId`); the old session row keeps its `ERROR` status for the activity trail. `redispatchTask` sets `waveTasks.assignedSessionId` to the new session so bridge correlation follows the latest attempt.

### 9.4 Race: completion vs. pause

Two guards (both re-read `wavePlans.status` immediately before acting):

1. `controller.handleWaveComplete()` re-checks `status === 'executing'` before auto-advancing; if `paused`, it marks the wave `completed` but does **not** dispatch wave N+1. `resume()` then dispatches `currentWaveIndex` (already advanced by `advanceToNextWave` only when executing; if pause won the race, `resume()` finds the completed current wave and — extension to `resume()` — advances to and dispatches the next pending wave).
2. `redispatchTask()` and `dispatchWave()` (first line) re-check plan status; `paused` → return all-queued/no-op. Result: pause is eventually consistent within one event-handling cycle; a completion that slips through only ever writes task/wave status (safe), never new dispatches.
3. Completion arriving for an `abort()`ed plan: task rows were set `skipped` only if `pending`; a running task completing after abort updates its own row to `completed` but `handleWaveComplete` sees plan status `failed` and does nothing.

### 9.5 Duplicate / late callbacks

- Callback routes and `CompletionListener.handleTaskComplete()` are idempotent: re-completing a `completed` task short-circuits (add an early return when `task.status === 'completed'`); `checkWaveCompletion` returning true twice calls `handleWaveComplete` twice — guarded by the wave-status check (already `completed` → return).
- Status update for an unknown `sessionId` → `404` (existing, `status/route.ts:20`); the runner stops retrying on 4xx.
- `job:started` after `job:complete` (out-of-order): `handleTaskStarted` must not downgrade a terminal task — add a status guard (`only when task.status IN ('pending','dispatched','retrying')`).

### 9.6 Process restart

`OrchestratorService.sessionMappings` is in-memory and lost on restart, but: (a) callback correlation uses DB (`rufloSessions.id` in the payload; `waveTasks.assignedSessionId` lookup), so push-based completion still lands after restart — `ingestCompletionReport()` on an unknown mapping still `emitEvent`s a `job:complete` carrying the report (service already falls back to `update.sessionId`, `service.ts:399`) — the bridge therefore keys **only** off `event.sessionId`, never `externalJobId`; (b) poll-based (`ao-cli`/`http`) sessions orphaned by restart are Tier 1 known-limitation: the `StatusPoller` no longer tracks them; the Conductor cancels/re-dispatches manually. Persisting poller state is deferred to Tier 3.

---

## 10. Testing Strategy

### 10.1 Unit (vitest, `packages/core`)

Mock: `getOrchestratorServiceOrNull` (inject a `FakeOrchestratorService` recording `dispatch()` calls and exposing `emit(event)`), `SessionTransport` (in-memory fake), DB via the existing in-memory SQLite pattern (`initDatabase({ type: 'sqlite', sqlitePath: ':memory:' })`).

- `dispatch-coordinator`: dispatch creates session row + sets `assignedSessionId`/`externalSessionId`; `ORCHESTRATOR_UNAVAILABLE` → queued not failed; rejection → failed + session row removed; `redispatchTask` state guards; predecessor context includes `completionSummary`.
- `controller`: retry path calls `redispatchTask`; exhaustion → `failTask` + halt policy; `handleWaveComplete` pause guard; `resume` picks up `retrying` tasks.
- `completion-listener`: `completionSummary` column write; `toActivityEventType` mapping (all 10 variants insert valid `eventTypeValues`); idempotent double-complete; started-after-complete guard.
- `execution-bridge`: each `job:*` event routes correctly by `assignedSessionId`; unknown session ignored; handler exception doesn't unsubscribe.
- `claude-session-adapter` + `HttpSessionTransport`: `/v1` paths, bearer header, `callbackToken` passthrough, `429 → CAPACITY`, `409` idempotency, `410` stop-is-success (against a local `fetch` mock).
- `plan-projection`: wave→workstream mapping, cost table, conflict warnings, deterministic snapshot.
- `session-prompt`: snapshot test — contains callback curl lines with correct URL/sessionId/token placeholders.
- `sqlite` adapter: fresh DB has all `ruflo_sessions`/`wave_tasks` columns; `ensureColumn` upgrades a DB created from the **old** DDL.

### 10.2 Integration (`packages/core`)

Full loop against in-memory SQLite + `FakeOrchestratorService`: seed item → generate wave plan from a canned `ParsedWavePlan` (bypass AI) → `approve()` → assert wave-0 tasks `dispatched` + sessions created → `emit(job:complete)` per task → assert wave 0 `completed`, wave 1 auto-dispatched → fail one wave-1 task once → assert `retrying` + re-dispatch → complete all → assert plan `completed` + `wavePlanMetrics` row. Repeat with `pause()` injected between last-completion emit and assert no wave-2 dispatch; `resume()` dispatches it. Plan-generation integration: `generatePlanForItem` with a mocked `ai-client` (no live Anthropic calls in CI); one opt-in live test behind `ANTHROPIC_API_KEY` (same convention as existing Phase-2 tests).

### 10.3 Route/E2E (Next app)

Route-handler tests invoking the exported `POST` functions with a test DB and `DEVPILOT_ORCHESTRATOR_MODE=claude-session` + injected fake transport: pause/resume happy path + 404 + 409; `fleet/dispatch` 503-when-disabled (assert **zero** rows created), 502 rollback, 200 with `orchestrator.externalJobId`; `plan/generate` 503 without key, 201 shape parity with old contract (UI regression guard: `workstreams[].tasks[]` fields unchanged); callback routes 401 with bad token, ingestion → bridge → `waveTasks` status flip. Manual E2E script (documented in the PR): `DEVPILOT_ORCHESTRATOR_MODE=ao-cli` with a stub `ao` shell script, drive capture → plan → approve → watch SSE events reach the UI.

---

## 11. Acceptance Criteria

- **T1-AC-01** — Approving a wave plan (`POST /api/wave-plans/[planId]/dispatch` or `controller.approve()`) with `DEVPILOT_ORCHESTRATOR_MODE=claude-session` and a reachable runner results in one `POST /v1/sessions` per wave-0 task, one `rufloSessions` row per task with `externalSessionId` and `orchestratorMode` set, and each `waveTasks` row `status='dispatched'` with `assignedSessionId` set. No `console.log` placeholder remains in `dispatch-coordinator.ts`.
- **T1-AC-02** — A `POST {callbackUrl}/complete` for a wave-task session sets that `waveTasks` row to `completed`, stores `completionSummary`, and when it is the wave's last task, marks the wave `completed` and (with `autoAdvance=true`) dispatches wave N+1 without human action.
- **T1-AC-03** — A `job:error` for a task with `retryCount < retryLimit` sets `retrying`, increments `retryCount`, and issues a new dispatch with a fresh session; the TODO at `controller.ts:351` is gone. At exhaustion the task goes `failed` and `failurePolicy` is applied.
- **T1-AC-04** — `POST /api/fleet/dispatch/[itemId]` with mode `disabled` returns `503` and creates no session, file-lock, or item mutation. With a configured orchestrator it returns the external job id and progress subsequently advances past 0% via callbacks or polling.
- **T1-AC-05** — The Next app initializes the orchestrator lazily on first use (`src/lib/orchestrator.ts`); no route imports `initOrchestratorClient`/`isOrchestratorConfigured` from `client.ts` anymore.
- **T1-AC-06** — `devpilot serve --orchestrator-mode ao-cli` (or config.yaml equivalent) actually passes orchestrator options into `createServer` and initializes service + poller + bridge; the same wave loop works headless.
- **T1-AC-07** — `HttpSessionTransport` targets the §7.1 `/v1` endpoints with bearer auth and forwards `callbackToken`; the SCAFFOLD placeholder comments are removed and replaced by a reference to this TRD.
- **T1-AC-08** — Callback routes reject requests with a wrong `X-DevPilot-Callback-Token` when `DEVPILOT_CALLBACK_TOKEN` is set (401) and forward valid payloads to `ingestStatusUpdate`/`ingestCompletionReport`.
- **T1-AC-09** — `generateMockWorkstreams()` and the CLI canned plan are deleted; both plan-generate routes produce plans derived from `WavePlanGenerator` output via `projectWavePlanToPlan()`, and return `503 PLAN_AI_UNAVAILABLE` when `ANTHROPIC_API_KEY` is unset. Response JSON shape for `201` is unchanged (UI renders without modification).
- **T1-AC-10** — `POST /api/wave-plans/[planId]/pause` and `/resume` exist; the `PlanReviewCard` buttons (lines 52, 61) receive `200` for valid transitions and `409` for invalid ones; pausing stops new dispatches without cancelling running sessions; resuming re-dispatches `pending` **and** `retrying` tasks of the current wave.
- **T1-AC-11** — All wave activity events inserted into `activity_events` use uppercase `eventTypeValues` (no CHECK-constraint violations from `completion-listener.ts` / `auto-advance.ts`).
- **T1-AC-12** — A freshly initialized SQLite DB contains `ruflo_sessions.external_session_id/orchestrator_mode/tokens_used/cost_usd` and `wave_tasks.completion_summary`; initializing against a DB created before this TRD upgrades it in place (PRAGMA-guarded `ALTER TABLE`).
- **T1-AC-13** — Completion/pause race: with a pause issued concurrently with the last task completion of a wave, no wave N+1 task is ever dispatched while plan status is `paused` (integration test from §10.2 passes deterministically).
- **T1-AC-14** — Duplicate terminal callbacks are idempotent: re-POSTing the same `CompletionReport` yields `200` and no second `completedTasks` row, score delta, or wave advance.

---

## 12. Implementation Plan

Four waves. Tasks within a wave are file-disjoint and independently dispatchable to parallel sub-agents; wave N+1 depends only on waves ≤ N. Complexity: S ≈ ≤1h, M ≈ half-day, L ≈ day.

### Wave 1 — Contracts & foundations

**T1-W1-T1 · Schema + sqlite DDL repair** — `M`
- Files: `packages/core/src/db/schema/wave-planner.ts`, `packages/core/src/db/schema/enums.ts`, `packages/core/src/db/adapters/sqlite.ts`
- Add `completionSummary: text('completion_summary')` to `waveTasks` (§4.1); add `'claude-session'` to `orchestratorModeValues` (§4.2); add `completion_summary` to `wave_tasks` DDL and the four missing `ruflo_sessions` columns to DDL with updated CHECK (§4.3); implement `ensureColumn()` PRAGMA-guarded migration invoked at sqlite init for all five columns.
- Dependencies: none · Done-check: unit tests — fresh `:memory:` DB exposes all columns via Drizzle select; DB created from pre-change DDL is upgraded without error; `pnpm typecheck` in core passes.

**T1-W1-T2 · Claude-session transport contract** — `M`
- Files: `packages/core/src/orchestrator/claude-session-adapter.ts`, `packages/core/src/orchestrator/session-prompt.ts` (new), `packages/core/src/orchestrator/index.ts`
- Update `HttpSessionTransport` to §7.1 `/v1` paths and status-code mapping (429→CAPACITY, 409 idempotent-create → success with existing id, 410 stop→success); add `callbackToken` to `CreateSessionParams` and thread from config; implement `buildSessionPrompt()` (§7.3); replace SCAFFOLD/TODO comments (lines 11–19, 87–90) with a pointer to `spec/trd/01-TIER1-EXECUTION-LOOP.md §7`; export `session-prompt` from the barrel.
- Dependencies: none · Done-check: unit tests against a mocked `fetch` cover every §7.1 endpoint/status; prompt snapshot contains callback curl instructions.

**T1-W1-T3 · Plan projection module** — `M`
- Files: `packages/core/src/wave-planner/plan-projection.ts` (new), `packages/core/src/wave-planner/index.ts`
- Implement `buildSpecContentForItem`, `generatePlanForItem`, `projectWavePlanToPlan` per §6.6 (cost table, wave→workstream mapping, conflict warnings, confidence signals). No route changes yet.
- Dependencies: none · Done-check: unit tests project a canned `WavePlanGenerationResult` into exact expected `plans/workstreams/tasks/touchedFiles` rows (snapshot).

**T1-W1-T4 · Pause/resume routes** — `S`
- Files: `src/app/api/wave-plans/[planId]/pause/route.ts` (new), `src/app/api/wave-plans/[planId]/resume/route.ts` (new)
- Implement §5.1/§5.2 using `WaveExecutionController` with the same local config construction `dispatch/route.ts` uses today (temporary until T1-W3-T4 switches all three to `getWaveExecutionConfig()`); map "Cannot pause/resume…" errors to 409, "not found" to 404.
- Dependencies: none · Done-check: route tests — 200 transition `executing→paused→executing`, 404 unknown id, 409 pausing a `draft` plan; `PlanReviewCard` buttons no longer 404.

**T1-W1-T5 · Execution types & event mapping** — `S`
- Files: `packages/core/src/wave-planner/execution/types.ts`
- Add `callbackUrl` to `WaveExecutionConfig`; add `WaveDispatchContext`, `TaskDispatchOutcome`; add `toActivityEventType()` (§6.8) with exhaustive `WaveSSEEvent['type'] → EventType` mapping.
- Dependencies: none · Done-check: unit test asserts all 10 event types map to members of `eventTypeValues`; core typecheck flags the two `WaveExecutionConfig` construction sites (fixed in W2/W3 tasks — this task may add `callbackUrl` as required and update **only** `execution/types.ts`, letting dependent tasks compile-fix their own files; if repo CI requires green typecheck per task, mark `callbackUrl` required and include a codemod note in the PR).

### Wave 2 — Core execution loop & hosts

**T1-W2-T1 · Real dispatch + retry re-dispatch** — `L`
- Files: `packages/core/src/wave-planner/execution/dispatch-coordinator.ts`, `packages/core/src/wave-planner/execution/controller.ts`
- Implement §6.3 (`loadDispatchContext`, new `dispatchToOrchestrator`, `redispatchTask`, queued-vs-failed handling, `assignedSessionId` write, predecessor `completionSummary`, constraints) and §6.4 (`failTask` extraction, retry re-dispatch replacing `controller.ts:351` TODO, `handleWaveComplete` with pause guard, `resume`/`dispatchWave` picking up `retrying` tasks). Uses `buildSessionPrompt` (W1-T2) and types (W1-T5).
- Dependencies: T1-W1-T1, T1-W1-T2, T1-W1-T5 · Done-check: §10.1 coordinator/controller unit suites pass; grep confirms no `console.log('[WaveDispatchCoordinator]` and no `TODO: Re-dispatch` remain.

**T1-W2-T2 · CompletionListener fixes** — `S`
- Files: `packages/core/src/wave-planner/execution/completion-listener.ts`, `packages/core/src/wave-planner/execution/auto-advance.ts`
- Write `completionSummary` column (not `errorMessage`); constructor `{ retryLimit }` option; idempotency guard on `handleTaskComplete`; status guard on `handleTaskStarted`; both `emitEvent()`s use `toActivityEventType()`.
- Dependencies: T1-W1-T1, T1-W1-T5 · Done-check: listener unit suite (§10.1) passes; inserting each event type against a real sqlite CHECK constraint succeeds.

**T1-W2-T3 · Next app orchestrator singleton** — `M`
- Files: `src/lib/orchestrator.ts` (new)
- Implement §6.1 (`getServerOrchestrator`, `getWaveExecutionConfig`, `buildOrchestratorConfigFromEnv`, globalThis guard, poller wiring via `createDbStatusPollerCallbacks` — until W2-T5 lands, inline the callbacks and swap in W4-T1).
- Dependencies: T1-W1-T2, T1-W1-T5 · Done-check: unit test — two calls return the same instance; mode `disabled` yields `isEnabled === false`; env matrix builds correct adapter configs.

**T1-W2-T4 · CLI serve orchestrator options** — `M`
- Files: `packages/cli/src/commands/serve.ts`, `packages/cli/src/server/index.ts`
- Add serve flags + config.yaml `orchestrator:` reading (§6.9, §8.2); pass `options.orchestrator` (today dead); extend `ServerOptions.orchestrator` with `sessionApiUrl`/`sessionApiKey`/`sessionEnvironmentId`/`callbackToken`; rename callback base to `/api/orchestrator` (keep `/api/fleet/callback` alias).
- Dependencies: T1-W1-T2 · Done-check: `devpilot serve --orchestrator-mode ao-cli` logs "Orchestrator initialized in ao-cli mode"; config.yaml round-trip test.

**T1-W2-T5 · Shared host wiring helper** — `S`
- Files: `packages/core/src/orchestrator/host-wiring.ts` (new), `packages/core/src/orchestrator/index.ts`
- Implement `createDbStatusPollerCallbacks()` (§6.7) from the CLI callback bodies, using `getDatabase()`.
- Dependencies: T1-W1-T1 · Done-check: unit test drives all three callbacks against `:memory:` DB and asserts session/activity rows.

**T1-W2-T6 · AI plan generation — Next route** — `M`
- Files: `src/app/api/items/[id]/plan/generate/route.ts`
- Delete `generateMockWorkstreams()` (line 192 onward); implement §5.3 using `buildSpecContentForItem` + `generatePlanForItem` + `projectWavePlanToPlan`; 503 without `ANTHROPIC_API_KEY`; preserve 201 shape, zone transition, activity event.
- Dependencies: T1-W1-T3 · Done-check: route test with mocked ai-client returns 201 with schema-identical shape to the pre-change contract; 503 without key; grep: `generateMockWorkstreams` absent from repo.

**T1-W2-T7 · AI plan generation — CLI route** — `M`
- Files: `packages/cli/src/server/api/items.ts`
- Delete the canned plan (lines 221–259); same pipeline/contract as T1-W2-T6 (§5.4).
- Dependencies: T1-W1-T3 · Done-check: Fastify inject test mirrors T1-W2-T6 assertions; the string `'Complete task'` mock insert is gone.

### Wave 3 — Event bridge & route rewiring

**T1-W3-T1 · ExecutionBridge** — `M`
- Files: `packages/core/src/wave-planner/execution/execution-bridge.ts` (new), `packages/core/src/wave-planner/execution/index.ts`
- Implement §6.5: singleton init/get, event routing table, `assignedSessionId` lookup, cancelled-is-terminal, handler fault isolation.
- Dependencies: T1-W2-T1, T1-W2-T2 · Done-check: bridge unit suite (§10.1) passes, including unknown-session no-op and exception resilience.

**T1-W3-T2 · Callback routes: auth + ingestion + insert fix** — `M`
- Files: `src/app/api/orchestrator/status/route.ts`, `src/app/api/orchestrator/complete/route.ts`
- Implement §5.6: `X-DevPilot-Callback-Token` check, `ingestStatusUpdate`/`ingestCompletionReport` forwarding via `getServerOrchestrator()`, `completedTasks` insert corrected to schema (`label`, `durationMinutes`) with tokens/cost persisted on the session row, idempotent terminal handling (§9.5).
- Dependencies: T1-W2-T3 · Done-check: route tests — 401 wrong token, 200 + wave-task flip via bridge with fake service, duplicate `complete` is a no-op (T1-AC-14).

**T1-W3-T3 · Fleet dispatch route rework** — `M`
- Files: `src/app/api/fleet/dispatch/[itemId]/route.ts`
- Implement §5.5: `getServerOrchestrator()`, 503-before-mutation, 502 rollback (session row, `inFlightFiles`, `touchedFiles` status, keep horizon item), success response with `orchestrator` block, remove `client.ts` singleton imports.
- Dependencies: T1-W2-T3 · Done-check: route tests for 503 (zero rows), 502 (rollback verified), 200 (externalSessionId persisted); grep: no `isOrchestratorConfigured` under `src/`.

**T1-W3-T4 · Wave-plans dispatch route config unification** — `S`
- Files: `src/app/api/wave-plans/[planId]/dispatch/route.ts`
- Swap local `DEFAULT_CONFIG` for `getWaveExecutionConfig()`; add `getServerOrchestrator()` + 503 guard (§5.7). (Pause/resume routes switch to the shared config in W4-T1 to avoid same-wave file overlap.)
- Dependencies: T1-W2-T3, T1-W2-T1 · Done-check: route test — dispatch with fake claude-session transport yields `dispatched > 0` and sessions rows; 503 when disabled.

### Wave 4 — Wiring completion, integration & E2E

**T1-W4-T1 · Host bridge wiring + config unification** — `M`
- Files: `src/lib/orchestrator.ts`, `packages/cli/src/server/index.ts`, `src/app/api/wave-plans/[planId]/pause/route.ts`, `src/app/api/wave-plans/[planId]/resume/route.ts`
- Wire `initExecutionBridge(...).start()` into both hosts (§6.1, §6.9); swap inline poller callbacks for `createDbStatusPollerCallbacks()`; switch pause/resume routes to `getWaveExecutionConfig()`.
- Dependencies: T1-W3-T1, T1-W2-T3, T1-W2-T4, T1-W2-T5, T1-W1-T4 · Done-check: booting either host with mode `claude-session` + fake transport, a synthetic `job:complete` event mutates `waveTasks` (bridge live in-process).

**T1-W4-T2 · Core integration suite** — `L`
- Files: `packages/core/src/wave-planner/execution/__tests__/execution-loop.integration.test.ts` (new), `packages/core/src/orchestrator/__tests__/fake-orchestrator.ts` (new)
- Implement §10.2: full approve→dispatch→complete→advance→retry→complete loop; pause-race determinism test (T1-AC-13); restart-resilience test (bridge correlates by DB after service mapping cleared).
- Dependencies: T1-W3-T1 (and transitively W2) · Done-check: suite green in CI without network access.

**T1-W4-T3 · Next route test suite + E2E script** — `M`
- Files: `src/app/api/__tests__/tier1-execution.test.ts` (new), `docs/testing/TIER1-E2E.md` (new)
- Implement §10.3 route tests (pause/resume, fleet dispatch 503/502/200, plan-generate parity + 503, callback auth/idempotency) and the manual stub-`ao` E2E walkthrough.
- Dependencies: T1-W3-T2, T1-W3-T3, T1-W3-T4, T1-W2-T6 · Done-check: all T1-AC items have at least one asserting test or a documented manual step; suite green.

### Wave/file disjointness audit

- W1: T1(schema×3) / T2(orchestrator adapter+prompt) / T3(plan-projection+wave-planner index) / T4(pause,resume routes) / T5(execution/types.ts) — disjoint.
- W2: T1(dispatch-coordinator, controller) / T2(completion-listener, auto-advance) / T3(src/lib/orchestrator.ts) / T4(cli serve, cli server index) / T5(host-wiring, orchestrator index) / T6(next plan-generate route) / T7(cli items.ts) — disjoint. (W1-T2 and W2-T5 both touch `packages/core/src/orchestrator/index.ts` — different waves, allowed.)
- W3: T1(execution-bridge, execution index) / T2(orchestrator callback routes) / T3(fleet dispatch route) / T4(wave-plans dispatch route) — disjoint.
- W4: T1(host files + pause/resume routes) / T2(core test files) / T3(next test files + doc) — disjoint.

Total: 4 waves, 17 tasks.
