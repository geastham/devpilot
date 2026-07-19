# TRD 03 — Tier 3: Hardening & Truth-Telling
## Bridge Pipeline · Linear Config Persistence & Webhook Verification · Real `devpilot status` · Measured Runway · Repo Hygiene
### v1.0 · July 2026 · Status: DRAFT

> **Depends on:** partially independent of Tier 1/2.
>
> | Item | Parallelism |
> |---|---|
> | 11 Linear config persistence + webhook verify | Fully parallel to Tier 1 and Tier 2 |
> | 12 Real `devpilot status` | Fully parallel |
> | 13 Measured runway math | Fully parallel — **but** `src/app/api/fleet/state/route.ts` is also touched by TRD 01 (orchestrator init); land whichever first and rebase the other deliberately |
> | 14 Repo hygiene | Fully parallel; the root-`package.json` task must merge with (not revert) TRD 02's W1-T7 dependency additions if 02 has landed |
> | 10 Bridge middle hop | Parallel to Tier 2. Soft dependency on Tier 1: local dispatch goes through the **existing** `OrchestratorService` (`packages/core/src/orchestrator/service.ts`), which works today in `ao-cli` / `http` mode; Tier 1's finished `claude-session` adapter improves it but is not required |
>
> Shared conventions and namespace reservations: `spec/trd/00-PROGRAM-OVERVIEW.md`.
> This TRD owns the table `integrationConfigs`. It reuses TRD 02's `ensureColumn`
> helper in `sqlite.ts` if present; otherwise task T3-W1-T2 introduces it
> (identical code — merge is trivial).

---

## 1. Problem Statement & Goals

### 1.1 Problem

Tier 3 is about making DevPilot stop lying:

- The **bridge** receives Linear webhooks and creates dispatch sessions, then
  drops them on the floor: `packages/bridge/src/api/webhooks/linear.ts:111`
  `// TODO: Publish to Pub/Sub for dispatch`. The completion path never syncs
  back: `packages/bridge/src/api/sessions/routes.ts:89-90`
  `// TODO: Update Linear issue status` / `// TODO: Publish telemetry event`.
  The client side receives dispatches and does nothing:
  `packages/cli/src/commands/bridge/connect.ts:66`
  `// TODO: Trigger local orchestrator dispatch`.
- **Linear config** in the Next app is an in-memory singleton
  (`packages/core/src/integrations/linear/client.ts:243-259`) lost on every
  restart, and the webhook route ships with
  `// TODO: Verify signature with webhook secret`
  (`src/app/api/integrations/linear/webhook/route.ts:10`) even though
  `verifyLinearWebhookSignature` exists in core **with a unit test**
  (`packages/core/tests/unit/webhook-verify.test.ts`).
- **`devpilot status`** prints hardcoded fiction — 3 sessions, score 742,
  rank #23 (`packages/cli/src/commands/status.ts:11-38`).
- **Runway math** hardcodes `avgCompletionMinutes = 45` and `maxSessions = 8`
  (`src/app/api/fleet/state/route.ts:52,58`), and uses an amber threshold of
  8h that contradicts DESIGN §2.2 (amber < 4h).
- **Dead weight**: `apps/web` is a placeholder Next app, `packages/ui` an unused
  component shell; `QuickCaptureInput` hardcodes the `'ng-pipelines'` demo repo
  and a canned fake assist response
  (`src/components/capture/QuickCaptureInput.tsx:43,49-55`).

### 1.2 Goals

1. **Bridge middle hop** — full pipeline: Linear webhook → signature verify →
   Pub/Sub publish (per-orchestrator subscription) → `bridge-client`
   subscription → local `OrchestratorService` dispatch → status/complete
   reported back to the bridge → Linear issue commented and moved.
2. **Persist Linear config** — DB-backed `integrationConfigs` table in core;
   Next connect/webhook routes read/write it; singleton re-hydrates from DB on
   cold start; webhook signature verification enforced.
3. **Real `devpilot status`** — read the actual SQLite DB (zones, sessions,
   score, measured runway), `--json` output, honest empty states.
4. **Measured runway** — rolling velocity from `completed_tasks` history in a
   shared core module used by both the Next route and the CLI; configurable
   fleet capacity; DESIGN-correct thresholds.
5. **Repo hygiene** — delete `apps/web` and `packages/ui`; declare the root
   app's real dependencies; remove the stale npm `package-lock.json` and the
   broken `db:check-sync` script; replace the hardcoded demo repo with a real
   repo list and the canned capture response with an honest one.

### 1.3 Non-Goals

- Encrypting the Linear API key in the local SQLite DB. The DB
  (`.devpilot/data.db`) sits in the same trust domain as
  `.devpilot/config.yaml`, which already stores the key in plaintext
  (`packages/cli/src/commands/config.ts:31`). Accepted risk, documented. (The
  **bridge** side is multi-tenant cloud and DOES encrypt — §6.4.)
- A message-broker abstraction. GCP Pub/Sub stays the one transport
  (`@google-cloud/pubsub` is already the dependency on both sides).
- Bridge-side wave planning. The bridge dispatches one session per Linear
  issue; wave execution remains local (WAVE-PLANNER non-goal).
- Replacing the CLI Fastify server or consolidating the two half-servers
  (TRD 01 owns that decision).
- A generic multi-provider integrations UI. `integrationConfigs` is
  provider-keyed and generic by shape, but only `linear` is implemented.

---

## 2. Current State (file-cited)

| Area | File | State |
|---|---|---|
| Bridge webhook | `packages/bridge/src/api/webhooks/linear.ts` | Verifies signature **only when both** header and secret present (:69-74 — unsigned requests pass); creates `dispatchSessions` row; TODO at :111 — never publishes |
| Bridge Pub/Sub | `packages/bridge/src/services/pubsub/service.ts` | Real `PubSubService.publishTaskDispatch` / `publishTelemetry` / `ensureTopicsExist`; singleton throws if uninitialized (`getPubSubService`); **no subscription management** |
| Bridge msg type | `packages/bridge/src/services/pubsub/types.ts` | `TaskDispatchMessage` has `messageId`, `targetOrchestratorId`, `dispatchedAt` — **no `sessionId`**, so a client could never report back |
| Client msg type | `packages/bridge-client/src/pubsub.ts:1-11` | Different `TaskDispatchMessage` (no `messageId`/`sessionId`/`dispatchedAt`) — the two sides disagree |
| Bridge sessions | `packages/bridge/src/api/sessions/routes.ts` | Status/complete endpoints real; TODOs at :89-90 (Linear sync, telemetry) |
| Bridge register | `packages/bridge/src/api/orchestrators/routes.ts` | Registers orchestrator + `repoRoutes` + API key; **does not create the Pub/Sub subscription** the client subscribes to |
| Client register bug | `packages/bridge-client/src/client.ts:17-37` vs bridge `:33-36` | Client sends `{ repos, maxConcurrentJobs }`; bridge **requires `name`** → register always 400s. The pipeline has never connected end-to-end |
| CLI connect | `packages/cli/src/commands/bridge/connect.ts:60-72` | Subscribes to `devpilot-dispatch-${orchestratorId}` (a subscription nothing creates); `onMessage` logs + TODO at :66 |
| Local dispatch | `packages/core/src/orchestrator/service.ts:142,230` | `OrchestratorService.dispatch(request)` real; `initOrchestratorService` / `buildDispatchRequest` (`client.ts:146`) available — the client-side dispatch target exists |
| Linear singleton | `packages/core/src/integrations/linear/client.ts:243-259` | `initLinearClient`/`getLinearClient`/`isLinearConfigured` module-level singleton; no reset; nothing persists |
| Next connect route | `src/app/api/integrations/linear/connect/route.ts` | POST inits singleton only; GET reports `configured:false` after every restart; DELETE literally says "restart required to take effect" |
| Next webhook route | `src/app/api/integrations/linear/webhook/route.ts` | `request.json()` (raw body discarded — can't verify), TODO at :10; calls `handleLinearWebhook(payload)` **without options**, so `botUserId` matching (`sync.ts:171`) can never fire |
| Verify util | `packages/core/src/integrations/linear/webhook-verify.ts` | Complete, timing-safe, tested (`packages/core/tests/unit/webhook-verify.test.ts`) |
| Status cmd | `packages/cli/src/commands/status.ts` | 100% hardcoded output; `// TODO: Read from actual database` at :11 |
| Runway calc | `src/app/api/fleet/state/route.ts:51-71` | `maxSessions = 8`, `avgCompletionMinutes = 45` hardcoded; amber at `< 8h` (DESIGN §2.2 says amber < 4h, red < 2h) |
| Velocity data | `packages/core/src/db/schema/fleet.ts:43-52` | `completed_tasks.duration_minutes` + `completed_at` — enough for a rolling average |
| Workspace layout | `pnpm-workspace.yaml` | `packages/*` + `apps/*` |
| `apps/web` | `apps/web/` | Placeholder Next app; depends on `@devpilot.sh/core` + `@devpilot.sh/ui`; **only workspace declaration of `next`/`react`** — the root app builds off its hoisted install |
| `packages/ui` | `packages/ui/` | Built dist + package.json; imported only by `apps/web`. Declares `recharts` (nothing else does) |
| Root package.json | `package.json` | Monorepo scripts only, zero runtime deps; references `scripts/check-schema-sync.ts` (`db:check-sync`) — **the `scripts/` directory does not exist**; stale npm `package-lock.json` (Prisma-era) beside `pnpm-lock.yaml` |
| Root app imports | `src/**` | `next`, `react`, `react-dom`, `zustand`, `clsx`, `tailwind-merge`, `drizzle-orm`, `@devpilot.sh/core` — none declared at root |
| Stale reference | `packages/cli/src/commands/serve.ts:55` | Prints `cd apps/web && pnpm dev` |
| QuickCapture | `src/components/capture/QuickCaptureInput.tsx:43` | `addItem(..., 'ng-pipelines') // Default repo for demo`; :49-55 canned response citing fictional `ENG-388` / `ng-core` workers |
| SQLite DDL | `packages/core/src/db/adapters/sqlite.ts` | Embedded `CREATE TABLE IF NOT EXISTS` — every schema change must be mirrored here |

---

## 3. Architecture

### 3.1 Bridge pipeline (item 10)

```
Linear cloud                         DevPilot Bridge (GCP, Fastify, Postgres)
────────────                         ─────────────────────────────────────────
issue assigned to bot ──webhook──▶  POST /api/webhooks/linear
                                      1 verify sha256 signature (MANDATORY —
                                        401 if header or secret missing)
                                      2 workspace + teamConfig lookup
                                      3 insert dispatch_sessions (pending)
                                      4 repoRoutes lookup → orchestratorId
                                        └ none? → session status 'error',
                                          event 'error', respond
                                          action:'no_orchestrator'
                                      5 pubsub.publishTaskDispatch(msg)
                                        attrs: targetOrchestratorId
                                        └ publish fails? → event 'error',
                                          session stays 'pending',
                                          respond queued:false
                                              │
                    topic devpilot-task-dispatch
                                              │  subscription
                                              │  devpilot-dispatch-{orchId}
                                              │  filter: attributes.
                                              │    targetOrchestratorId="{orchId}"
                                              ▼  (created at register time)
Conductor laptop (devpilot bridge connect)
──────────────────────────────────────────
PubSubSubscriber.onMessage(msg)
  → createBridgeDispatchHandler:
      1 buildDispatchRequest(title/description/repo/…)
      2 OrchestratorService.dispatch(request)      ← existing core service
      3 BridgeClient.reportSessionStatus(msg.sessionId,
          { status:'dispatched', progressPercent:0 })
      4 service.onEvent → progress → reportSessionStatus
      5 completion → BridgeClient.reportSessionComplete(msg.sessionId, …)
                                              │
                                              ▼
Bridge POST /api/sessions/:id/complete
  1 update dispatch_sessions (existing)
  2 LinearApiService: comment + move issue      ← replaces TODO :89
      (workspace.apiKeyEncrypted, AES-256-GCM
       decrypted with BRIDGE_ENCRYPTION_KEY)
  3 pubsub.publishTelemetry('session_complete')  ← replaces TODO :90
```

### 3.2 Linear config persistence (item 11)

```
POST /api/integrations/linear/connect { apiKey, teamId, defaultProjectId?, webhookSecret?, botUserId? }
  → validate via DevPilotLinearClient.getTeam()
  → upsert integration_configs (provider='linear')
  → initLinearClient(...)                      (refresh singleton)

any request needing Linear (webhook, sync, GET connect)
  → linear.ensureLinearClientFromDb(db)        (lazy re-hydrate after restart)

POST /api/integrations/linear/webhook
  → raw = await request.text()                 (raw body preserved)
  → cfg = getLinearIntegrationConfig(db)
  → !cfg?.webhookSecret → 503 'webhook secret not configured'
  → verifyLinearWebhookSignature(raw, header, cfg.webhookSecret) → 401 on fail
  → |now − payload.webhookTimestamp| > 60s → 401 'stale webhook' (replay guard)
  → handleLinearWebhook(payload, { botUserId: cfg.botUserId })
  → action 'bot_assigned' → create horizonItem (zone SHAPING,
    linearTicketId = identifier) + ITEM_CREATED activity event
```

### 3.3 Measured runway (items 12–13)

One computation, two consumers:

```
packages/core/src/fleet/velocity.ts   computeVelocityStats(db, opts)
packages/core/src/fleet/runway.ts     computeRunway(db, opts)
        ▲                                   ▲
        │                                   │
src/app/api/fleet/state/route.ts    packages/cli/src/commands/status.ts
(GET /api/fleet/state)              (devpilot status [--json])
```

---

## 4. Data Model

### 4.1 New file `packages/core/src/db/schema/integrations.ts`

House conventions (cuid2 text PK, timestamp-mode integers):

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';

// ============================================================================
// Integration Configs
// ============================================================================
// One row per provider. Only 'linear' is implemented today. Values are stored
// unencrypted in the local single-user DB — same trust domain as
// .devpilot/config.yaml (documented accepted risk, §1.3).

export const integrationConfigs = sqliteTable('integration_configs', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  provider: text('provider').notNull().unique(),   // 'linear'
  apiKey: text('api_key'),
  teamId: text('team_id'),
  defaultProjectId: text('default_project_id'),
  webhookSecret: text('webhook_secret'),
  botUserId: text('bot_user_id'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type IntegrationConfig = typeof integrationConfigs.$inferSelect;
export type NewIntegrationConfig = typeof integrationConfigs.$inferInsert;
```

Export `* from './integrations'` in `packages/core/src/db/schema/index.ts`.

### 4.2 SQLite DDL — `packages/core/src/db/adapters/sqlite.ts`

Append to `createTableStatements`:

```sql
-- Integration Configs
CREATE TABLE IF NOT EXISTS integration_configs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL UNIQUE,
  api_key TEXT,
  team_id TEXT,
  default_project_id TEXT,
  webhook_secret TEXT,
  bot_user_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

(New table only — no `ensureColumn` calls needed. If TRD 02 has not landed,
this task also introduces the `ensureColumn` helper verbatim from TRD 02 §4.3
so the file converges identically either way.)

### 4.3 Bridge (Postgres) — no schema change

`workspaces.apiKeyEncrypted` and `webhookSecret` already exist
(`packages/bridge/src/db/schema/workspaces.ts:10-11`). `dispatchSessions`
already carries everything the pipeline needs. The unified
`TaskDispatchMessage` (below) is a type change, not a schema change.

### 4.4 Unified `TaskDispatchMessage`

Single source of truth in `packages/bridge/src/services/pubsub/types.ts`;
`packages/bridge-client/src/pubsub.ts` mirrors it exactly (bridge-client cannot
depend on bridge — it is published independently — so the shape is duplicated
with a comment pointing here):

```typescript
export interface TaskDispatchMessage {
  messageId: string;               // cuid2, set at publish time
  sessionId: string;               // dispatch_sessions.id — the report-back key
  workspaceId: string;
  linearIssueId: string;
  linearIdentifier: string;        // e.g. 'ENG-394'
  title: string;
  description?: string;
  teamId: string;
  priority?: number;
  labels?: string[];
  repo: string;
  targetOrchestratorId: string;    // required — routing is resolved before publish
  dispatchedAt: string;            // ISO
}
```

---

## 5. API Surface

### 5.1 Next app — Linear connect (rewrite, same paths)

`src/app/api/integrations/linear/connect/route.ts`:

| Method | Request | Response | Behavior change |
|---|---|---|---|
| POST | `{ apiKey: string; teamId: string; defaultProjectId?: string; webhookSecret?: string; botUserId?: string }` | `{ success: true, team: {id,name,key}, webhookConfigured: boolean }` | Validates via `client.getTeam()` **then upserts `integration_configs`** and refreshes the singleton. 400 on missing apiKey/teamId; 502 `{ error }` on Linear validation failure (config NOT saved) |
| GET | — | `{ configured: boolean, team?: {...}, webhookConfigured: boolean }` | Reads the DB via `ensureLinearClientFromDb` — survives restart |
| DELETE | — | `{ success: true }` | Deletes the `linear` row and calls `resetLinearClient()` — effective immediately, no "restart required" |

### 5.2 Next app — Linear webhook (hardened, same path)

`src/app/api/integrations/linear/webhook/route.ts` POST:

1. `raw = await request.text()`; `payload = JSON.parse(raw)` (400 on parse fail).
2. Config via `getLinearIntegrationConfig(db)`. No row or no `webhookSecret`
   → `503 { error: 'Linear webhook secret not configured — POST /api/integrations/linear/connect with webhookSecret' }`.
3. `verifyLinearWebhookSignature(raw, request.headers.get('linear-signature') ?? '', cfg.webhookSecret)`
   → invalid/missing → `401 { error: 'invalid signature' }`.
4. Replay guard: payload `webhookTimestamp` (ms epoch, Linear-standard) older
   than 60s → `401 { error: 'stale webhook' }`; absent field → skip guard.
5. `handleLinearWebhook(payload, { botUserId: cfg.botUserId ?? undefined })`.
6. On `action === 'bot_assigned'` with a `dispatch` intent: insert a
   `horizonItems` row (`zone: 'SHAPING'`, `title`, `repo:` teamId-mapped via
   `cfg.defaultProjectId`-independent fallback `'unknown'` — honest, no guess —
   `linearTicketId: dispatch.linearIdentifier`) unless one with that
   `linearTicketId` exists; write `ITEM_CREATED` activity event. Response
   `{ success: true, action, itemId? }`.
7. GET stays as the health responder (unchanged).

### 5.3 Fleet state (modified) — `GET /api/fleet/state`

Existing response preserved; changes:

- `runway` computed by `fleet.computeRunway` (§6.1): thresholds **amber < 4h,
  red < 2h** (fixes the 8h WARNING deviation), measured `avgCompletionMinutes`.
- `fleet.maxSessions` from `DEVPILOT_MAX_SESSIONS` env → `config.yaml
  fleet.max_sessions` → default 8 (route reads env only; the CLI passes config).
- New top-level block:

```typescript
velocity: {
  avgCompletionMinutes: number;   // measured, or fallback
  measured: boolean;              // false when samples < minSamples
  sampleCount: number;
  windowHours: number;            // default 168
  tasksPerHour: number;           // completed tasks / window
}
```

### 5.4 Repos — new `GET /api/repos`

`src/app/api/repos/route.ts`:

```typescript
{ repos: Array<{ name: string; source: 'horizon' | 'fleet' | 'both'; lastUsedAt: string }> }
```

Distinct union of `horizon_items.repo` and `ruflo_sessions.repo`, ordered by
most recent `updatedAt` across both. Empty DB → `{ repos: [] }` (no seeded
fakes).

### 5.5 Bridge routes (same paths, changed behavior)

- `POST /api/webhooks/linear` — signature now **mandatory** (§3.1 step 1;
  `workspaces.webhookSecret` is `notNull`, so absence of the header is a 401 —
  removes the skip-when-missing branch at `linear.ts:69`). Success response
  becomes `{ handled, action: 'dispatch_created', sessionId, queued: boolean, messageId? }`;
  new failure action `'no_orchestrator'`.
- `POST /api/orchestrators/register` — after creating `repoRoutes`, calls
  `pubsub.ensureOrchestratorSubscription(orchestrator.id)` when Pub/Sub is
  configured; response gains `subscription: string | null`.
- `POST /api/sessions/:id/complete` — after the DB update: Linear comment +
  state move via `LinearApiService` (best-effort: failures logged to
  `sessionEvents` type `'error'`, never fail the HTTP response) and
  `publishTelemetry({ eventType: 'session_complete', sessionId, workspaceId,
  orchestratorId, data: { success, costUsd, tokensUsed }, timestamp })`.
  Response gains `linearSynced: boolean`.

### 5.6 CLI

`devpilot status [--verbose] [--json]` — reads the DB directly (no server
required):

```
📊 DevPilot Status                        --json shape:
Fleet:   N active, N needs-spec …         {
Horizon: READY n · REFINING n ·             fleet: { active, needsSpec, complete, error,
         SHAPING n · DIRECTIONAL n                   utilizationPercent, maxSessions },
Runway:  X.Xh (healthy|amber|critical)      horizon: { READY, REFINING, SHAPING, DIRECTIONAL },
         avg task Xm (measured|default)     runway: { hours, status, avgCompletionMinutes,
Score:   NNN/1000 (+rank iff opted in)               measured },
                                            score: { total, breakdown, leaderboardRank } | null
                                          }
```

No DB / uninitialized (`.devpilot/config.yaml` missing) → exit 1 with
`Run "devpilot init" first.` Empty DB → zeros, not invented numbers. Rank line
printed only when a score row exists with `leaderboard_rank` set (and, if the
TRD-02 column exists, `leaderboard_opt_in` true — feature-detect the column).

---

## 6. Core Services / Components

### 6.1 `packages/core/src/fleet/` (new module)

`velocity.ts`:

```typescript
export interface VelocityStats {
  avgCompletionMinutes: number;
  tasksPerHour: number;
  sampleCount: number;
  windowHours: number;
  measured: boolean;               // sampleCount >= minSamples
}
export async function computeVelocityStats(
  db: Database,
  opts?: { windowHours?: number; minSamples?: number; fallbackAvgMinutes?: number }
  // defaults: 168, 5, 45
): Promise<VelocityStats>;
// avg(completed_tasks.duration_minutes) where duration_minutes IS NOT NULL
// and completed_at >= now - windowHours. Below minSamples → fallback + measured:false.
```

`runway.ts`:

```typescript
export type RunwayStatus = 'HEALTHY' | 'WARNING' | 'CRITICAL';
export interface RunwayResult {
  totalMinutes: number; hours: number; status: RunwayStatus;
  readyItems: number; refiningItems: number;
  velocity: VelocityStats;
}
export async function computeRunway(
  db: Database,
  opts?: { velocity?: VelocityStats }   // pass to avoid recomputation
): Promise<RunwayResult>;
// Formula (preserves the existing shape of fleet/state/route.ts:59-62 with
// the measured average substituted):
//   runwayMinutes = readyItems * avg + Σ sessions.estimatedRemainingMinutes
//                 + refiningItems * avg * 0.5
// Thresholds per DESIGN §2.2: CRITICAL < 2h, WARNING < 4h, else HEALTHY.
```

`index.ts` barrel; `packages/core/src/index.ts` adds `export * as fleet from './fleet'`.

### 6.2 `packages/core/src/integrations/linear/config-store.ts` (new)

```typescript
export async function getLinearIntegrationConfig(db: Database): Promise<IntegrationConfig | null>;
export async function saveLinearIntegrationConfig(
  db: Database,
  cfg: { apiKey: string; teamId: string; defaultProjectId?: string;
         webhookSecret?: string; botUserId?: string }
): Promise<IntegrationConfig>;                       // upsert on provider='linear'
export async function deleteLinearIntegrationConfig(db: Database): Promise<void>;
export async function ensureLinearClientFromDb(db: Database): Promise<DevPilotLinearClient | null>;
// isLinearConfigured() ? getLinearClient()
// : row with apiKey+teamId ? initLinearClient(row) : null
```

`client.ts` adds `export function resetLinearClient(): void { clientInstance = null; }`.
`integrations/linear/index.ts` re-exports the new module.

### 6.3 Bridge Pub/Sub extensions — `packages/bridge/src/services/pubsub/service.ts`

```typescript
export function getPubSubServiceOrNull(): PubSubService | null;   // no-throw accessor
export class PubSubService {
  // existing members unchanged, plus:
  async ensureOrchestratorSubscription(orchestratorId: string): Promise<string> {
    // name: `devpilot-dispatch-${orchestratorId}` (matches connect.ts:63)
    // create on dispatchTopic with filter:
    //   attributes.targetOrchestratorId = "<orchestratorId>"
    // idempotent: exists() check first; returns the subscription name
  }
}
```

`types.ts`: unified `TaskDispatchMessage` (§4.4).

### 6.4 Bridge Linear + crypto services (new)

`packages/bridge/src/services/crypto.ts`:

```typescript
// AES-256-GCM, key = 32-byte base64 BRIDGE_ENCRYPTION_KEY.
// Format: base64(iv).base64(ciphertext).base64(authTag)
export function encryptSecret(plain: string, key: string): string;
export function decryptSecret(payload: string, key: string): string;  // throws on tamper
```

`packages/bridge/src/services/linear/index.ts` — raw GraphQL over `fetch`
(the bridge intentionally does not depend on `@devpilot.sh/core` or
`@linear/sdk`; it needs two mutations and one query):

```typescript
export class LinearApiService {
  constructor(apiKey: string, apiUrl = 'https://api.linear.app/graphql');
  async addComment(issueId: string, body: string): Promise<void>;         // commentCreate
  async getCompletedStateId(teamId: string): Promise<string | null>;      // workflowStates, first type='completed'
  async moveIssueToState(issueId: string, stateId: string): Promise<void>; // issueUpdate
}
export async function syncSessionCompletionToLinear(params: {
  apiKey: string; issueId: string; teamId: string;
  success: boolean; prUrl?: string; summary?: string; errorMessage?: string;
}): Promise<{ synced: boolean; error?: string }>;
// success: comment (PR link + summary) + move to completed state
// failure: comment only (":warning: Session failed — {errorMessage}")
// never throws — returns { synced:false, error }
```

Comment bodies reuse the formats of
`packages/core/src/integrations/linear/sync.ts:266-292` (copied, cited).

### 6.5 Bridge-client + CLI dispatch handler

`packages/bridge-client/src/client.ts` — fix register to match the bridge
contract (`orchestrators/routes.ts:33-36`):

```typescript
async register(capabilities: {
  name: string;                       // NEW — required by the bridge
  repos: string[];
  maxConcurrentJobs: number;
}): Promise<{ orchestratorId: string; apiKey: string; subscription: string | null }>;
```

`packages/bridge-client/src/pubsub.ts` — `TaskDispatchMessage` mirrors §4.4.

`packages/cli/src/commands/bridge/dispatch-handler.ts` (new):

```typescript
export interface DispatchHandlerOptions {
  client: BridgeClient;
  orchestratorMode: 'ao-cli' | 'http' | 'claude-session';
  aoProjectName?: string; httpUrl?: string; apiKey?: string;
}
export function createBridgeDispatchHandler(
  opts: DispatchHandlerOptions
): (message: TaskDispatchMessage) => Promise<void>;
```

Behavior: lazily `initOrchestratorService` (core) with the given mode; build the
request via `buildDispatchRequest({ itemId: message.sessionId, title, repo,
description… })`; `service.dispatch(request)`; immediately
`client.reportSessionStatus(message.sessionId, { status: 'dispatched',
progressPercent: 0 })`; subscribe `service.onEvent` — progress events →
`reportSessionStatus(… status:'running' …)`, completion →
`reportSessionComplete(message.sessionId, { success, prUrl, summary,
tokensUsed, costUsd })`. Dispatch errors →
`reportSessionStatus(sessionId, { status: 'error', progressPercent: 0,
message })` and log; the handler never throws (a throw would nack + redeliver —
we report instead and ack).

`connect.ts` changes: `--name <name>` option (default `os.hostname()`),
`--mode <mode>` option (default `ao-cli`); pass `name` to `register`; replace
the TODO at :66 with `createBridgeDispatchHandler(...)`; log each dispatch
result line.

### 6.6 Next app — QuickCapture de-faking

- `src/hooks/useRepos.ts` (new): `useRepos()` → `{ repos, isLoading }` from
  `GET /api/repos`, refetched on window focus.
- `src/components/capture/RepoSelector.tsx` (new): dropdown of known repos +
  free-text entry row ("Use '{typed}'") so a fresh install can name its first
  repo; selection stored in `uiStore.quickCaptureRepo`.
- `src/stores/uiStore.ts`: add `quickCaptureRepo: string | null` +
  `setQuickCaptureRepo` (persisted in `partialize`).
- `src/components/capture/QuickCaptureInput.tsx`: remove `'ng-pipelines'`
  (line 43) — submit uses `quickCaptureRepo`; if null, block submit and focus
  the RepoSelector with hint "Pick a repo first". Replace the canned response
  (lines 49-55) with a truthful one computed from real store state:
  `→ Added to {zone} · {repo}` plus, when `n > 0` other horizon items share the
  repo, ` — {n} related item{s} in horizon.`; chips: exactly one real repo chip
  `[{repo}]`. No invented ticket IDs, no invented worker claims.

### 6.7 Repo hygiene mechanics

- Delete `apps/web/` and `packages/ui/` entirely; `pnpm-workspace.yaml` drops
  the `- "apps/*"` line.
- Root `package.json`: add the root app's actual dependencies —
  `next@^14.2.0`, `react@^18.2.0`, `react-dom@^18.2.0`, `zustand@^4.5.0`,
  `clsx@^2.1.0`, `tailwind-merge@^2.2.0`, `drizzle-orm` (match
  `packages/core`), `@devpilot.sh/core: workspace:*`; devDependencies
  `@types/react`, `@types/react-dom`, `tailwindcss@^3.4.0`, `postcss`,
  `autoprefixer`, `eslint`, `eslint-config-next@14.2.0`. Preserve TRD 02's
  `recharts` / `@anthropic-ai/sdk` entries if present. Add scripts
  `dev:app: "next dev --port 3847"`, `build:app: "next build"`,
  `start:app: "next start"`. Remove the broken `db:check-sync` script (its
  target `scripts/check-schema-sync.ts` does not exist). Delete the stale npm
  `package-lock.json`. Run `pnpm install` to refresh `pnpm-lock.yaml`.
- `packages/cli/src/commands/serve.ts:55`: message becomes
  `pnpm dev:app` (repo root).

---

## 7. Config

| Env var / key | Default | Used by |
|---|---|---|
| `BRIDGE_ENCRYPTION_KEY` | — (Linear sync skipped with a logged warning when unset) | bridge crypto (§6.4) |
| `GCP_PROJECT_ID` | — (Pub/Sub features disabled) | bridge + `devpilot bridge connect` (existing) |
| `PUBSUB_TOPIC_DISPATCH` | `devpilot-task-dispatch` | bridge (existing, `config.ts:8`) |
| `DEVPILOT_BRIDGE_URL` / `DEVPILOT_BRIDGE_API_KEY` | — | connect command (existing) |
| `DEVPILOT_MAX_SESSIONS` | `8` | fleet capacity (`/api/fleet/state`) |
| `DEVPILOT_VELOCITY_WINDOW_HOURS` | `168` | `computeVelocityStats` |
| `DEVPILOT_SQLITE_PATH` | `.devpilot/data.db` | existing (`src/lib/db/index.ts:19`) |
| `LINEAR_API_URL` | `https://api.linear.app/graphql` | bridge LinearApiService (test override) |

`.devpilot/config.yaml` additions (read by the CLI; documented in `devpilot
config`): `fleet.max_sessions: 8`. Linear keys keep their existing home
(`integrations.linear.apiKey` / `teamId`, `commands/config.ts:31-40`); the CLI
`config linear` command additionally writes through to `integration_configs`
via `saveLinearIntegrationConfig` so CLI and Next app agree.

---

## 8. Error Handling & Edge Cases

- **Unsigned/forged webhooks**: Next route — 503 until a secret is configured
  (never silently unverified), 401 on bad signature, 401 on >60s-old timestamp.
  Bridge route — signature always required (secret is `notNull` per workspace).
- **Publish failure** (Pub/Sub down): session row survives as `pending` with an
  `error` sessionEvent; webhook still returns 200 (`queued:false`) so Linear
  doesn't retry-storm; operator re-drives via existing session endpoints.
- **No orchestrator for repo**: no publish; session marked `error` with reason;
  response `action: 'no_orchestrator'`.
- **Duplicate Pub/Sub delivery** (at-least-once): the dispatch handler checks
  `GET {bridgeUrl}/api/sessions/{sessionId}` first; status ≠ `pending` → ack and
  skip.
- **Dispatch handler failure**: never nacks (would loop); reports `error`
  status to the bridge and acks.
- **Linear sync failure on complete**: response still 200 with
  `linearSynced:false`; error recorded in `sessionEvents`.
- **Missing `BRIDGE_ENCRYPTION_KEY` or undecryptable API key**: skip Linear
  sync, log once per session, `linearSynced:false`.
- **Restart of the Next app**: first Linear-touching request re-hydrates the
  singleton from `integration_configs` (`ensureLinearClientFromDb`); GET
  connect reports `configured:true` after restart (the current bug).
- **`devpilot status` with no `.devpilot/`**: exit 1 + init hint; with empty
  DB: real zeros. Never the old fiction.
- **Velocity with <5 samples**: fallback 45 min with `measured:false` surfaced
  all the way to the UI/CLI (no silent pretending).
- **Runway threshold change** (8h→4h amber): fleet store consumes `status`
  verbatim; `RunwayIndicator` colors follow automatically. Called out in the
  changelog since dashboards will show more green.
- **Repo deletions** (`apps/web`, `packages/ui`): guarded by a pre-delete grep
  (done-check of T3-W3-T1/T2) — the only known references are
  `pnpm-workspace.yaml`, `serve.ts:55`, and the two packages' own files.
- **First-run QuickCapture** (empty repo list): free-text repo entry creates
  the first repo name; submit is blocked (with hint) until a repo is chosen —
  never a hardcoded default.

## 9. Testing Strategy

vitest throughout; `@google-cloud/pubsub`, `fetch` (Linear GraphQL), and the
Anthropic-independent bridge pieces are mocked. Bridge tests use mocked drizzle
or a throwaway Postgres only if `DATABASE_URL_TEST` is set — otherwise
service-level units with injected fakes.

1. **Unit — fleet math** (`packages/core/tests/unit/fleet-velocity.test.ts`):
   seeded `:memory:` SQLite; measured average, window filtering, minSamples
   fallback, runway formula, threshold table (1.9h→CRITICAL, 3.9h→WARNING,
   4.1h→HEALTHY).
2. **Unit — config store** (`packages/core/tests/unit/linear-config-store.test.ts`):
   upsert semantics, `ensureLinearClientFromDb` re-hydration after
   `resetLinearClient`, delete path.
3. **Unit — bridge crypto** (`packages/bridge/tests/crypto.test.ts`):
   round-trip, tamper detection, bad-key failure.
4. **Unit — bridge Linear service**: mocked fetch; comment/state-move GraphQL
   bodies; `syncSessionCompletionToLinear` never throws.
5. **Route — Next webhook** (`src/app/api/__tests__/linear-webhook.test.ts`):
   valid signature (real HMAC via the tested util) → 200; wrong secret → 401;
   no secret configured → 503; stale timestamp → 401; bot-assigned creates a
   SHAPING item exactly once (idempotent on redelivery).
6. **Route — connect**: POST persists + GET-after-"restart"
   (`resetLinearClient()` between calls) still `configured:true`; DELETE is
   immediate.
7. **Pipeline — bridge webhook→publish** (mock PubSubService): publish called
   with unified message incl. `sessionId` + `targetOrchestratorId`; no-route →
   `no_orchestrator`; publish throw → `queued:false` + pending session.
8. **Pipeline — dispatch handler** (mock BridgeClient + mock
   OrchestratorService): dispatch→status→complete reporting order; duplicate
   delivery skip; error path reports and acks.
9. **e2e — status** (`packages/cli/tests/e2e/status.test.ts`, existing e2e
   style): seeded temp DB → `devpilot status --json` matches seeds; missing
   config dir → exit 1.
10. **Hygiene checks**: `pnpm build` from a clean checkout after deletions;
    `grep -rn "ng-pipelines" src/` returns nothing;
    `grep -rn "apps/web\|@devpilot.sh/ui" --include='*.{ts,tsx,json,yaml}'`
    (excluding lockfiles/docs) returns nothing.

## 10. Acceptance Criteria

- **T3-AC-01** A Linear issue assigned to the bot (valid signature) produces a
  Pub/Sub message on `devpilot-task-dispatch` containing `sessionId` and
  `targetOrchestratorId`; the TODO at `bridge/src/api/webhooks/linear.ts:111`
  is gone.
- **T3-AC-02** `POST /api/orchestrators/register` creates (idempotently) the
  filtered subscription `devpilot-dispatch-{id}`, and `BridgeClient.register`
  sends the required `name` (the historical 400 is fixed).
- **T3-AC-03** `devpilot bridge connect` receiving a dispatch message calls
  `OrchestratorService.dispatch` and reports `dispatched` →
  progress → `complete` to the bridge; the TODO at `connect.ts:66` is gone.
- **T3-AC-04** Session completion at the bridge comments on the Linear issue
  and moves it to the team's `completed` state (success case), and publishes a
  `session_complete` telemetry event; both TODOs at `sessions/routes.ts:89-90`
  are gone; Linear failure never fails the HTTP response.
- **T3-AC-05** Linear config in the Next app survives restart:
  POST connect → process restart → GET connect returns `configured: true` from
  `integration_configs`; DELETE disconnects immediately.
- **T3-AC-06** The Next webhook route verifies signatures with
  `verifyLinearWebhookSignature`: 401 on invalid, 503 when no secret is
  configured, 401 on stale timestamp; the TODO at `webhook/route.ts:10` is gone.
- **T3-AC-07** Bot-assignment via the Next webhook creates exactly one SHAPING
  horizon item with the Linear identifier (idempotent on redelivery).
- **T3-AC-08** `devpilot status` prints only DB-derived numbers (fresh DB shows
  zeros; seeded DB matches seeds), supports `--json`, and contains no
  hardcoded stats.
- **T3-AC-09** `GET /api/fleet/state` computes runway from measured
  `completed_tasks` history (`velocity.measured: true` with ≥5 samples in the
  window; explicit fallback flagged otherwise); constants 45/8 no longer appear
  as literals in the route; thresholds are 4h/2h per DESIGN §2.2.
- **T3-AC-10** `apps/web/` and `packages/ui/` are deleted; `pnpm-workspace.yaml`
  no longer lists `apps/*`; no source/config file references them;
  root `package.json` declares the root app's runtime deps; the stale
  `package-lock.json` and the broken `db:check-sync` script are removed;
  `pnpm install && pnpm build` passes from clean checkout.
- **T3-AC-11** QuickCapture has no `'ng-pipelines'` literal: repos come from
  `GET /api/repos` (+ free-text first-repo entry), and the post-capture
  response contains only true statements about the created item and real
  related-item counts — no invented tickets or workers.
- **T3-AC-12** All new/changed routes documented in `docs/API-REFERENCE.md`;
  ROADMAP items 10–14 flipped.

## 11. Implementation Plan

Wave protocol per `00-PROGRAM-OVERVIEW.md` §2.2. No two same-wave tasks share a
file. Complexity S/M/L.

### Wave 1 — Schema & core services

| ID | Title | Files | Description | Deps | Cx | Done-check |
|---|---|---|---|---|---|---|
| T3-W1-T1 | integrationConfigs schema | create `packages/core/src/db/schema/integrations.ts`; edit `schema/index.ts` | Exact definition §4.1 + barrel export | — | S | core typecheck; `integrationConfigs` importable from `@devpilot.sh/core/db` |
| T3-W1-T2 | SQLite DDL | edit `packages/core/src/db/adapters/sqlite.ts` | Append §4.2 DDL (introduce `ensureColumn` verbatim from TRD 02 §4.3 iff absent) | — | S | `:memory:` adapter test: table exists, idempotent reopen |
| T3-W1-T3 | fleet module | create `packages/core/src/fleet/{velocity.ts,runway.ts,index.ts}`; edit `packages/core/src/index.ts` | §6.1 exactly (formulas, defaults, thresholds); export `* as fleet` | — | M | §9.1 unit tests pass |
| T3-W1-T4 | Linear config store | create `packages/core/src/integrations/linear/config-store.ts`; edit `linear/client.ts`, `linear/index.ts` | §6.2: CRUD + `ensureLinearClientFromDb` + `resetLinearClient` | T1 | M | §9.2 unit tests pass |
| T3-W1-T5 | Bridge Pub/Sub extensions | edit `packages/bridge/src/services/pubsub/{service.ts,types.ts,index.ts}` | `getPubSubServiceOrNull`, `ensureOrchestratorSubscription` (filtered, idempotent), unified `TaskDispatchMessage` §4.4 | — | M | Mock-pubsub unit: subscription created once with correct filter string |
| T3-W1-T6 | Bridge crypto + Linear API | create `packages/bridge/src/services/crypto.ts`, `services/linear/index.ts`; edit `services/index.ts` | §6.4 exactly (AES-256-GCM format; GraphQL ops; non-throwing sync fn) | — | M | §9.3/§9.4 unit tests pass |

### Wave 2 — Routes & commands

| ID | Title | Files | Description | Deps | Cx | Done-check |
|---|---|---|---|---|---|---|
| T3-W2-T1 | Next connect route | edit `src/app/api/integrations/linear/connect/route.ts` | §5.1 rewrite: validate→persist→refresh; DELETE via `deleteLinearIntegrationConfig` + `resetLinearClient` | W1-T1,T2,T4 | M | §9.6 route tests pass |
| T3-W2-T2 | Next webhook route | edit `src/app/api/integrations/linear/webhook/route.ts` | §5.2 rewrite: raw-body verify, 503/401 ladder, replay guard, `botUserId` pass-through, idempotent SHAPING item creation | W1-T4 | M | §9.5 route tests pass; TODO removed |
| T3-W2-T3 | Measured fleet state | edit `src/app/api/fleet/state/route.ts` | Replace inline math with `fleet.computeRunway`/`computeVelocityStats`; add `velocity` block; `DEVPILOT_MAX_SESSIONS`; keep response back-compat (§5.3). **Coordinate with TRD 01 edits to this file** | W1-T3 | M | Route test: literals `45`/`8` absent; velocity block correct against seeds |
| T3-W2-T4 | Real status command | edit `packages/cli/src/commands/status.ts` | §5.6: config load, `initDatabase`, zone/session/score queries, `fleet.computeRunway`, `--json`, exit-1 path, column feature-detect for opt-in | W1-T3 | M | §9.9 e2e passes; `grep -n "742\|#23" status.ts` empty |
| T3-W2-T5 | Bridge webhook publish | edit `packages/bridge/src/api/webhooks/linear.ts` | §3.1 steps 1-5: mandatory signature, repoRoutes lookup, unified message publish, `no_orchestrator` / `queued:false` paths; remove TODO :111 | W1-T5 | M | §9.7 pipeline tests pass |
| T3-W2-T6 | Bridge complete → Linear + telemetry | edit `packages/bridge/src/api/sessions/routes.ts` | §5.5: decrypt workspace key, `syncSessionCompletionToLinear`, telemetry publish, `linearSynced` flag; remove TODOs :89-90 | W1-T5,T6 | M | Unit: success/failure/missing-key paths; response shape |
| T3-W2-T7 | Bridge register subscription | edit `packages/bridge/src/api/orchestrators/routes.ts` | Call `ensureOrchestratorSubscription` when configured; add `subscription` to response (§5.5) | W1-T5 | S | Unit: register → ensure called with new orchestrator id |
| T3-W2-T8 | Client dispatch wiring | edit `packages/bridge-client/src/{client.ts,pubsub.ts,index.ts}`, `packages/cli/src/commands/bridge/connect.ts`; create `packages/cli/src/commands/bridge/dispatch-handler.ts` | §6.5: register `name` fix + mirrored message type; handler (dedupe check, dispatch, status/complete reporting, never-throw); `--name`/`--mode` options; remove TODO :66 | W1-T5 | L | §9.8 handler tests pass; TODO gone |

### Wave 3 — Hygiene

| ID | Title | Files | Description | Deps | Cx | Done-check |
|---|---|---|---|---|---|---|
| T3-W3-T1 | Remove apps/web | delete `apps/web/**`; edit `pnpm-workspace.yaml`, `packages/cli/src/commands/serve.ts` | Drop `apps/*` from workspace; fix serve.ts:55 message to `pnpm dev:app` | — | S | `grep -rn "apps/web" --include='*.{ts,tsx,json,yaml,mjs}' .` (excl. lockfiles, docs, spec) empty |
| T3-W3-T2 | Remove packages/ui | delete `packages/ui/**` | Pre-verified: only `apps/web` imported it | T3-W3-T1 (workspace edit ordering) | S | `grep -rn "@devpilot.sh/ui"` (excl. lockfiles) empty |
| T3-W3-T3 | Root package.json truth | edit `package.json` (root); delete `package-lock.json`; run `pnpm install` | §6.7 dependency/script list verbatim; preserve TRD-02 additions; remove `db:check-sync` | T1,T2 | M | Clean-checkout `pnpm install && pnpm build` green; `package-lock.json` absent |
| T3-W3-T4 | Repos API + hook | create `src/app/api/repos/route.ts`, `src/hooks/useRepos.ts`; edit `src/hooks/index.ts` | §5.4 union query + hook | — | S | Route test: distinct union, recency order, `[]` on empty |
| T3-W3-T5 | QuickCapture de-fake | create `src/components/capture/RepoSelector.tsx`; edit `QuickCaptureInput.tsx`, `capture/index.ts`, `src/stores/uiStore.ts` | §6.6: repo selector (+free text), `quickCaptureRepo` persisted, truthful response, no literals | T3-W3-T4 | M | `grep -n "ng-pipelines\|ENG-388" src/components/capture/` empty; blocked-submit hint works |

### Wave 4 — Tests & docs

| ID | Title | Files | Description | Deps | Cx | Done-check |
|---|---|---|---|---|---|---|
| T3-W4-T1 | Core fleet + config tests | create `packages/core/tests/unit/fleet-velocity.test.ts`, `linear-config-store.test.ts` | §9.1–9.2 scenarios | W1 | M | `pnpm --filter @devpilot.sh/core test` green |
| T3-W4-T2 | Bridge tests | create `packages/bridge/tests/{crypto.test.ts,linear-service.test.ts,webhook-pipeline.test.ts}` (+ vitest config for the package if absent) | §9.3–9.4, §9.7 with mocked pubsub/fetch/db | W2-T5,T6,T7 | L | `pnpm --filter @devpilot.sh/bridge test` green |
| T3-W4-T3 | Next route tests | create `src/app/api/__tests__/{linear-webhook.test.ts,linear-connect.test.ts,fleet-state.test.ts,repos.test.ts}` | §9.5–9.6 + fleet-state velocity assertions + repos | W2-T1,T2,T3; W3-T4 | M | root `pnpm test` green |
| T3-W4-T4 | Handler + status e2e | create `packages/cli/tests/e2e/status.test.ts`, `packages/cli/tests/unit/dispatch-handler.test.ts` | §9.8–9.9 | W2-T4,T8 | M | `pnpm --filter @devpilot.sh/cli test` green |
| T3-W4-T5 | Docs | edit `docs/API-REFERENCE.md`, `docs/ROADMAP.md`, `README.md` (config keys) | Document §5 routes/flags/env vars; flip items 10–14; document runway-threshold change | all | S | Every §5 surface documented; ROADMAP updated |

---

### Decisions other TRDs must respect

- `integration_configs` (`integrationConfigs`) is the home for provider
  credentials in the local DB; provider rows are unique by `provider`.
  Future integrations reuse it — do not create per-provider tables.
- The unified `TaskDispatchMessage` (§4.4) with `sessionId` +
  `targetOrchestratorId` is the bridge wire contract; TRDs extending the bridge
  add fields, never repurpose these.
- Subscription naming `devpilot-dispatch-{orchestratorId}` with an
  attribute-filter on `targetOrchestratorId` is fixed.
- Runway status thresholds are DESIGN §2.2 (amber < 4h, red < 2h) —
  `packages/core/src/fleet/runway.ts` is the single implementation; no route
  reimplements the formula.
- `apps/web` and `packages/ui` are gone; the root app's dependencies live in
  the root `package.json`. Nothing may reintroduce a placeholder app package.

*TRD 03 · v1.0 · July 2026 · DRAFT*
