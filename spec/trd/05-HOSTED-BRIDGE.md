# TRD 05 — Hosted Bridge (Supabase + Vercel)
## Website-Hosted API · Durable Dispatch Queue · Realtime Transport · Linear Sync-Back · Open Protocol Package
### v1.0 · August 2026 · Status: DRAFT

> **Amends and supersedes** `03-TIER3-HARDENING.md` §3.1, §4.3, §4.4, §6.3, §6.4,
> §6.5, acceptance criteria T3-AC-01…04, and implementation tasks T3-W1-T5,
> T3-W1-T6, T3-W2-T5, T3-W2-T6, T3-W2-T7, T3-W2-T8, T3-W4-T2. TRD 03's §3.2
> (Linear config persistence), §3.3 (measured runway), and Waves 3–4 hygiene are
> **unaffected and still apply.**
>
> **Depends on:** `04-HOSTED-ACCOUNTS.md` (organizations, guards, orchestrator
> tokens, RLS baseline) — hard dependency for Waves 2–4. Wave 1 (the protocol
> package) is independent and may start immediately.
>
> Soft dependency on Tier 1: local dispatch goes through the **existing**
> `OrchestratorService` (`packages/core/src/orchestrator/service.ts:142`), which
> works today in `ao-cli` / `http` mode.
>
> **Repo split — read this first.**
>
> | Repo | Owns |
> |---|---|
> | **`devpilot`** (public, MIT) | `packages/bridge-protocol/` (new, published), `packages/bridge-client/` (0.2.0), `packages/cli/`, deletion of `packages/bridge/`, docs |
> | **`devpilot-website`** (private) | `app/api/**`, `lib/bridge/**`, `lib/db/schema/**`, `supabase/migrations/**`, dashboard |
>
> No task may touch both repos. The only coupling is `@devpilot.sh/bridge-protocol`,
> consumed from npm.
>
> This TRD owns the table `dispatch_queue` and the npm package
> `@devpilot.sh/bridge-protocol`.

---

## 1. Problem Statement & Goals

### 1.1 Problem

The bridge has never worked end-to-end, and the reasons are structural rather
than incidental. Verified against the tree at `378a705`:

1. `packages/bridge/src/api/webhooks/linear.ts:111-113` — creates a
   `dispatchSessions` row, then `// TODO: Publish to Pub/Sub`. **The webhook is a
   dead end.** `repoRoutes` is never consulted at all; repo comes from
   `teamConfig?.defaultRepo || 'unknown'` (`:96`), so routing is not merely
   unpublished, it is unimplemented.
2. `packages/bridge-client/src/client.ts:17-20` sends `{repos, maxConcurrentJobs}`;
   `api/orchestrators/routes.ts:34-36` requires `name`. **Register always 400s.**
   `client.ts:30-31` then discards the JSON error body, so the user sees
   `Registration failed: Bad Request` with no cause.
3. `packages/cli/src/commands/bridge/connect.ts:63` subscribes to
   `devpilot-dispatch-${orchestratorId}`. Repo-wide, the only `.subscription(` is
   the *consumer* at `bridge-client/src/pubsub.ts:31`. **Nothing creates that
   subscription.**
4. `TaskDispatchMessage` is defined twice and differs
   (`bridge/src/services/pubsub/types.ts:1-14` vs `bridge-client/src/pubsub.ts:1-11`),
   and **neither carries `sessionId`** — while `client.ts:39`
   `reportSessionStatus(sessionId, …)` requires one. A client could not report
   progress even if it received a message.
5. `api/sessions/routes.ts:89-90` — TODOs for Linear sync-back and telemetry.
6. `api/webhooks/linear.ts:69` — `if (signature && workspace.webhookSecret)`.
   **Omit the header and verification is skipped entirely.** No replay guard.
7. **No auth anywhere.** `orchestrators/routes.ts` and `sessions/routes.ts` have
   no `preHandler`/`onRequest`. `hashApiKey` (`:17`) runs only at write time; the
   `apiKeys` table is written (`:63`) and never read. `DELETE
   /api/orchestrators/:id` (`:117`) and `POST /api/sessions/:id/complete` (`:54`)
   are open to the internet — the latter lets anyone mark any session complete
   with arbitrary `prUrl`, `tokensUsed`, `costUsd`, and (once §3.1 lands) trigger
   a write into someone's Linear workspace.
8. `workspaces.apiKeyEncrypted` (`schema/workspaces.ts:11`) is a `text` column
   with **no cipher behind it**. `packages/bridge/src/services/` contains only
   `index.ts` and `pubsub/`; `crypto.ts` does not exist.
9. Zero migrations, zero tests, and `.github/workflows/ci.yml:31,34,37` runs
   typecheck/lint/test with `|| true` — **CI is non-gating for the entire
   monorepo.**

Underneath all nine is one architectural fact: **the design requires every user's
laptop to authenticate into our GCP project to pull a subscription.** That
demands per-tenant service-account provisioning, which is why it was never
finished and why finishing it as specced would not be worth the cost.

Breaks 2 and 4 share a single root cause worth naming: **two hand-maintained
copies of one wire contract.** §6.1 removes the possibility.

### 1.2 Goals

1. Delete GCP. No Pub/Sub, no Cloud Run, no CloudSQL, no service accounts on user
   machines.
2. The API is Next route handlers in `devpilot-website`, deployed on Vercel.
3. Cloud→laptop delivery is **at-least-once, guaranteed by a table**, with
   Realtime as a latency optimization and polling as a always-present fallback.
4. Publish the wire contract as `@devpilot.sh/bridge-protocol` (MIT, zero runtime
   deps) so the protocol is open and implementable while the platform stays private.
5. **Every deployed endpoint is authenticated before it is reachable** — breaks 6,
   7, and 8 are a release gate, not polish (§10, T5-AC-09…11).
6. `packages/bridge` is deleted. One implementation, no drift.
7. Local mode is untouched. `devpilot` runs with no bridge, no account, no network.

### 1.3 Non-Goals

- Running agents in the cloud. **The hosted plane never executes an agent, clones
  a repo, or sees source.** It handles identity, webhooks, routing, queueing, and
  status. This invariant is what keeps the open-source promise honest.
- Multi-region, HA, or >500 concurrently-connected orchestrators (§3.3 records
  the ceiling and the exit).
- Billing, telemetry warehousing (BigQuery is dropped with the rest of GCP),
  dead-letter tooling beyond `attempts`/`last_error`.
- Changing the local Linear webhook at `src/app/api/integrations/linear/webhook/route.ts`
  — that is TRD 03 §3.2's job and stays local-only.

---

## 2. Current State (file-cited)

Beyond §1.1, the facts that shape the design:

| Area | File | State |
|---|---|---|
| Local dispatch target | `packages/core/src/orchestrator/service.ts:142,230` | `OrchestratorService.dispatch` real; `initOrchestratorService` / `buildDispatchRequest` (`client.ts:146`) available. **The client-side dispatch target already exists** |
| Bridge Pub/Sub | `packages/bridge/src/services/pubsub/service.ts` | Real publish/telemetry/`ensureTopicsExist`; **no subscription management**; `getPubSubService` throws if uninit |
| Deploy config | `packages/bridge/{Dockerfile,cloudbuild.yaml}` | Cloud Run, `--allow-unauthenticated` (`cloudbuild.yaml:24`). Never deployed |
| Content-type hack | `api/webhooks/linear.ts:39-47` | Global `addContentTypeParser` to retain a raw body — replaced by `await request.text()` |
| npm state | — | `@devpilot.sh/bridge-client@0.1.1` published 2026-03-11. `packages/cli/package.json:40` depends `workspace:*`; the published CLI carries it. **The published client cannot work** (break 2) |
| Core boundary | `packages/bridge/package.json` | No `@devpilot.sh/*` dependency — TRD 03 §6.4's deliberate boundary. Holds, and becomes structural after the repo split |
| Second webhook | `src/app/api/integrations/linear/webhook/route.ts` | The **local** Linear webhook. Stays. §3.4 names the split |
| Linear formats | `packages/core/src/integrations/linear/sync.ts:266-292` | Comment bodies TRD 03 §6.4 says to copy. Now moves into `bridge-protocol` instead of being copied |

---

## 3. Architecture

### 3.1 Bridge pipeline — amends TRD 03 §3.1

```
Linear cloud                      devpilot-website (Vercel, Next route handlers)
────────────                      ──────────────────────────────────────────────
issue assigned to bot ─webhook─▶  POST /api/webhooks/linear          runtime=nodejs
                                   1 raw = await request.text()
                                   2 org+workspace lookup by organizationId
                                   3 verify sha256 signature — MANDATORY
                                     401 if header OR stored secret missing
                                   4 |now − webhookTimestamp| > 60s → 401 stale
                                   5 teamConfig → autoDispatch gate
                                   6 repoRoutes lookup → orchestratorId
                                     └ none → session 'error',
                                       event 'error', respond
                                       action:'no_orchestrator'
                                   7 ── ONE TRANSACTION ──────────────
                                     INSERT dispatch_sessions (pending)
                                     INSERT session_events   ('created')
                                     INSERT dispatch_queue   (payload,
                                            org_id, orchestrator_id)
                                     ───────────────────────────────────
                                     No publish-after-commit window:
                                     the enqueue IS the commit.
                                            │
                                            │ Postgres logical replication
                                            ▼
                        Supabase Realtime — channel filtered
                        orchestrator_id=eq.{id}, RLS-scoped by the
                        orchestrator JWT (TRD 04 §6.3)
                                            │
                              ┌─────────────┴─────────────┐
                              │ push (fast path)          │ sweep (guarantee)
                              ▼                           ▼
Conductor laptop — devpilot bridge connect
──────────────────────────────────────────
RealtimeSubscriber.onNotify            sweep() on connect + every 30s:
        └──────────────┬────────────────────────┘
                       ▼
        claim(id):  UPDATE dispatch_queue
                    SET claimed_at=now(), attempts=attempts+1
                    WHERE id=$1 AND claimed_at IS NULL
                    RETURNING *
        ── zero rows returned ⇒ someone else has it ⇒ drop. The
           conditional UPDATE IS the ack, and it is atomic.
                       │
                       ▼
        createBridgeDispatchHandler:
          1 buildDispatchRequest(title/description/repo/…)
          2 OrchestratorService.dispatch(request)   ← existing core service
          3 reportSessionStatus(msg.sessionId, 'dispatched', 0)
          4 service.onEvent → progress → reportSessionStatus(… 'running' …)
          5 completion → reportSessionComplete(msg.sessionId, …)
          Never throws. A throw would strand a claimed row; we report + settle.
                       │
                       ▼
POST /api/sessions/:id/complete          ← authenticated: orchestrator token
  1 update dispatch_sessions
  2 DELETE dispatch_queue row (settle)
  3 syncSessionCompletionToLinear(…)     ← replaces TODO :89
     workspace.apiKeyEncrypted, AES-256-GCM, BRIDGE_ENCRYPTION_KEY
  4 INSERT session_events ('complete')   ← replaces TODO :90
     (telemetry is a table now, not a Pub/Sub topic)
```

Every numbered break from §1.1 is closed by a labelled step above except 8
(§6.2) and 9 (Wave 5).

### 3.2 Transport decision — why not Pub/Sub

| Option | Latency | At-least-once | Reconnect | Verdict |
|---|---|---|---|---|
| **Pub/Sub** (TRD 03) | ~100ms | Native (ack/nack, DLQ) | Native | **Rejected** — requires distributing GCP service-account credentials to every user's laptop, or server-side per-tenant SA provisioning. This is why the pipeline was never finished |
| **Realtime + queue table** | sub-second | **From the table** (§3.1 claim) | Auto-backoff + sweep-on-connect | **Chosen** |
| **pgmq / Supabase Queues** | poll interval | Native (visibility timeout) | N/A (pull) | Deferred — pull-only, so it needs Realtime as a wake-up anyway. Revisit when crashed-orchestrator redelivery needs visibility timeouts |
| **Long-poll only** | poll interval | Manual | Trivial | Retained as the **fallback**, not the primary (§5.3) |

**Read this carefully, because it is the load-bearing claim.** Supabase Realtime
alone is *at-most-once*: fire-and-forget, no replay after a disconnect. **The
delivery guarantee comes from `dispatch_queue`, not from the socket.** Realtime
only tells the laptop to look sooner. Remove Realtime entirely and the system is
still correct, merely slower — which is precisely why the poll fallback (§5.3) is
a first-class route and not an afterthought.

This is **strictly more robust than the design it replaces**, for two reasons the
Pub/Sub version could not offer: the enqueue is transactional with the session
insert (today's publish-after-commit is a lost-message window), and the queue is
`SELECT`-able in SQL when something goes wrong.

**What it costs, recorded honestly:**
- No native dead-letter queue → `attempts` + `last_error` columns, status `failed`
  after `DISPATCH_MAX_ATTEMPTS` (§4.1, §8).
- No ordering guarantee. There was none that mattered.
- **Supabase Realtime has a per-plan concurrent-connection cap.** Past roughly
  500 simultaneously-connected orchestrators this becomes a real cost line where
  Pub/Sub is effectively unbounded. **Exit if that binds:** reintroduce a broker
  *behind* `/api/dispatch/poll` and the protocol package; `dispatch_queue` stays
  the source of truth and the client contract does not change. The abstraction is
  deliberately placed so this is a server-side swap.

### 3.3 Repo topology and the open-core line

```
devpilot (public, MIT)                    devpilot-website (private)
──────────────────────                    ──────────────────────────
packages/bridge-protocol/  ──npm──▶       lib/bridge/*  (imports it)
  TaskDispatchMessage                     app/api/webhooks/linear/
  zod request/response schemas            app/api/orchestrators/
  session status vocabulary               app/api/sessions/
  Linear comment formatters               app/api/dispatch/poll/
        │                                 lib/db/schema/
        ▼                                 supabase/migrations/
packages/bridge-client/ 0.2.0             app/(dashboard)/
packages/cli/
src/app/api/**  ← LOCAL mode, unchanged
packages/bridge/  ← DELETED
```

`bridge-protocol` is the contract both sides compile against. Anyone can
implement a conforming bridge; the hosted platform is not required to run
DevPilot. That is the open-core line, and §6.1 is what makes it real rather than
aspirational.

The `@devpilot.sh/core` boundary from TRD 03 §6.4 survives and hardens:
`devpilot-website` is a separate remote and **cannot resolve `workspace:*`**, so
the boundary is now structural rather than a convention someone could violate.

### 3.4 Three deployment modes — one CLI

| Mode | Control plane | Linear webhook lands at | Auth |
|---|---|---|---|
| **Local / solo** (exists today) | devpilot root Next app on localhost | local route via tunnel | none |
| **Hosted** (this TRD) | devpilot-website on Vercel + Supabase | `<apex>/api/webhooks/linear` | Supabase Auth + orchestrator tokens |
| **Self-hosted bridge** (later) | their own conforming implementation | their domain | theirs |

The CLI binary is **identical in all three**. It points `DEVPILOT_BRIDGE_URL`
somewhere different, or nowhere. T5-AC-14 enforces "or nowhere".

---

## 4. Data Model

Tables live in `devpilot-website/lib/db/schema/`. Migration toolchain and RLS
baseline: TRD 04 §6.5 and §4.5.

### 4.1 New table `dispatch_queue` — `lib/db/schema/queue.ts`

```typescript
export const dispatchQueue = pgTable('dispatch_queue', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  orgId: text('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  orchestratorId: text('orchestrator_id').notNull().references(() => orchestrators.id, { onDelete: 'cascade' }),
  sessionId: text('session_id').notNull().references(() => dispatchSessions.id, { onDelete: 'cascade' }),
  payload: jsonb('payload').$type<TaskDispatchMessage>().notNull(),   // §4.3
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // the sweep query's index — unclaimed work for one orchestrator, oldest first
  pending: index('dispatch_queue_pending_idx')
    .on(t.orchestratorId, t.availableAt)
    .where(sql`claimed_at IS NULL`),
  bySession: index('dispatch_queue_session_idx').on(t.sessionId),
}));
```

Settled rows are **deleted**, not tombstoned — `dispatch_sessions` +
`session_events` are the durable history. The queue stays small and its index hot.

`availableAt` carries retry backoff: a released row is re-armed at
`now() + backoff(attempts)` rather than immediately.

### 4.2 Realtime publication — narrow by construction

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatch_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatch_sessions;
```

**Only these two.** Adding a table to `supabase_realtime` is an explicit,
reviewed act; T5-AC-13 asserts the publication contains exactly these two.

### 4.3 Unified `TaskDispatchMessage` — supersedes TRD 03 §4.4

**Single definition, in `packages/bridge-protocol/src/messages.ts`. Not
duplicated anywhere.** This is the fix for breaks 2 and 4 at the root.

```typescript
export interface TaskDispatchMessage {
  messageId: string;               // cuid2, set at enqueue time
  sessionId: string;               // dispatch_sessions.id — THE REPORT-BACK KEY
  queueId: string;                 // dispatch_queue.id — the claim/settle key
  orgId: string;
  workspaceId: string;
  linearIssueId: string;
  linearIdentifier: string;        // e.g. 'ENG-394'
  title: string;
  description?: string;
  teamId: string;
  priority?: number;
  labels?: string[];
  repo: string;
  targetOrchestratorId: string;    // required — routing resolved before enqueue
  dispatchedAt: string;            // ISO 8601
}
```

Changes from TRD 03 §4.4: `+ queueId`, `+ orgId`. `sessionId` and
`targetOrchestratorId` retain their §4.4 meaning and remain non-repurposable.

### 4.4 `dispatch_queue` RLS — what makes Realtime safe

```sql
ALTER TABLE public.dispatch_queue ENABLE ROW LEVEL SECURITY;

-- The orchestrator JWT minted by TRD 04 §6.3 carries orchestrator_id.
CREATE POLICY dq_orch_select ON public.dispatch_queue FOR SELECT TO authenticated
  USING (orchestrator_id = (auth.jwt() ->> 'orchestrator_id'));

-- Claim: only its own rows, only unclaimed ones. This policy is the ack's guard.
CREATE POLICY dq_orch_claim ON public.dispatch_queue FOR UPDATE TO authenticated
  USING (orchestrator_id = (auth.jwt() ->> 'orchestrator_id') AND claimed_at IS NULL)
  WITH CHECK (orchestrator_id = (auth.jwt() ->> 'orchestrator_id'));

-- No INSERT or DELETE policy: enqueue and settle are service_role only.
```

Realtime honors RLS **only on an authenticated channel** — the client must
actually set the JWT (`realtime.setAuth`). T5-AC-12 proves a second
orchestrator's JWT receives nothing, rather than assuming it.

### 4.5 `session_events` absorbs telemetry

TRD 03 §3.1 step 3 published a `session_complete` Pub/Sub event to feed BigQuery.
BigQuery is dropped with GCP. `session_events` already carries the shape
(`schema/sessions.ts:32-41`); telemetry becomes an INSERT in the same transaction
as the completion update. Aggregate in SQL.

---

## 5. API Surface

`devpilot-website/app/api/`. **Every handler declares `export const runtime =
'nodejs'`** (crypto + `postgres.js`) and calls a TRD 04 §6.4 guard as its first
statement.

### 5.1 Webhook

| Route | Auth | Behavior |
|---|---|---|
| `POST /api/webhooks/linear` | **HMAC-SHA256, mandatory** | §3.1 steps 1–7. 401 if the header is absent **or** the stored secret is absent — never a skip. 401 on stale timestamp (>60s). Publicly routable by necessity; the signature is the auth |

Explicitly listed as a public route for T4-AC-09's grep, with the signature check
standing in for a guard.

### 5.2 Orchestrators

| Route | Auth | Behavior |
|---|---|---|
| `POST /api/orchestrators/register` | `requireOrchestrator` (bearer `dp_orch_…`) | Body `{ name, repos, maxConcurrentJobs? }`. Creates/updates the orchestrator **scoped to the token's `orgId`**, upserts `repo_routes`, binds `orchestrator_tokens.orchestratorId`. Returns `{ orchestratorId, orgId, realtime: { channel, jwt, expiresAt } }` |
| `POST /api/orchestrators/:id/heartbeat` | `requireOrchestrator` + ownership | `{ activeJobs? }`. 404 if the id is not in the token's org |
| `GET /api/orchestrators/:id` | session **or** orchestrator token | Never returns `apiKeyHash` |
| `DELETE /api/orchestrators/:id` | **session, owner/admin only** | Closes break 7's worst case. A leaked orchestrator token cannot deregister |

Register no longer returns an API key — the caller already holds one. Removing
that response field also removes the confused-deputy shape where an
unauthenticated call minted a credential.

### 5.3 Sessions and dispatch

| Route | Auth | Behavior |
|---|---|---|
| `POST /api/sessions/:id/status` | `requireOrchestrator` + **session ownership** | Update status/progress, append `session_events` |
| `POST /api/sessions/:id/complete` | `requireOrchestrator` + **session ownership** | §3.1: update, settle the queue row, Linear sync-back, telemetry event. Returns `{ status, session, linearSynced }` |
| `GET /api/sessions/:id` | session (org member) or owning orchestrator | Detail |
| `GET /api/dispatch/poll` | `requireOrchestrator` | **Fallback + sweep.** Returns unclaimed rows for the caller's orchestrator. Works with no Realtime and no `SUPABASE_JWT_SECRET` (TRD 04 §6.3 risk note) |
| `POST /api/dispatch/:queueId/claim` | `requireOrchestrator` | Server-side claim for the poll path. 409 if already claimed |
| `POST /api/dispatch/:queueId/release` | `requireOrchestrator` | Nack: clears `claimedAt`, sets `lastError`, re-arms `availableAt` with backoff |

**Session ownership is the fix for the most dangerous instance of break 7.**
`sessions/routes.ts:54` currently lets anyone complete any session. Every session
route resolves `dispatch_sessions.orchestratorId` and 404s unless it matches the
bearer token's orchestrator.

### 5.4 CLI — amends TRD 03 §5.6

```
devpilot bridge connect [--url <url>] [--token <tok>] [--name <name>]
                        [--repos <csv>] [--mode <ao-cli|http|claude-session>]
                        [--transport <realtime|poll>]
```

`--name` defaults to `os.hostname()`. `--transport` defaults to `realtime` with
automatic fallback to `poll`. `-p, --project` (GCP) is **removed**.

---

## 6. Core Services / Components

### 6.1 `packages/bridge-protocol/` (new, public, published) — replaces TRD 03 §4.4's duplication

```
packages/bridge-protocol/
  src/messages.ts   TaskDispatchMessage (§4.3) + zod schema
  src/api.ts        zod request/response schemas for every §5 route
  src/status.ts     SessionStatus union — single vocabulary
  src/linear.ts     comment formatters, ported from
                    packages/core/src/integrations/linear/sync.ts:266-292
  src/index.ts
```

`package.json`: MIT, `"dependencies": { "zod": "^3.22.0" }` — nothing else.

TRD 03 §4.4 instructed the two sides to duplicate the type "with a comment
pointing here". **That instruction is withdrawn.** Duplication is the direct
cause of breaks 2 and 4; a published package makes the class of bug impossible.
Zod schemas mean the bridge validates request bodies against the same definition
the client serializes from, so break 2 becomes a compile error rather than a
runtime 400.

Ported formatters, not copied: `sync.ts:266-292` moves into `linear.ts`, and
`packages/core` re-exports from `bridge-protocol` so there is still exactly one
definition inside the public repo.

### 6.2 `lib/bridge/crypto.ts` — adopts TRD 03 §6.4 verbatim

```typescript
// AES-256-GCM, key = 32-byte base64 BRIDGE_ENCRYPTION_KEY.
// Format: base64(iv).base64(ciphertext).base64(authTag)
export function encryptSecret(plain: string, key: string): string;
export function decryptSecret(payload: string, key: string): string;  // throws on tamper
```

Unchanged from TRD 03 §6.4 — the spec was correct, only unimplemented. Closes
break 8. `workspaces.apiKeyEncrypted` is written **only** through `encryptSecret`;
T5-AC-11 asserts no other write path exists.

`webhookSecret` also moves behind encryption — TRD 03 left it plaintext; there is
no reason for that once the primitive exists.

### 6.3 `lib/bridge/linear.ts` — adopts TRD 03 §6.4

```typescript
export class LinearApiService {
  constructor(apiKey: string, apiUrl = 'https://api.linear.app/graphql');
  async addComment(issueId: string, body: string): Promise<void>;
  async getCompletedStateId(teamId: string): Promise<string | null>;
  async moveIssueToState(issueId: string, stateId: string): Promise<void>;
}
export async function syncSessionCompletionToLinear(params: {…}):
  Promise<{ synced: boolean; error?: string }>;   // NEVER throws
```

Raw GraphQL over `fetch`; no `@linear/sdk`, no `@devpilot.sh/core`. Comment
bodies come from `@devpilot.sh/bridge-protocol` (§6.1), not copied. Closes break 5.

**Never throws** — a Linear outage must not fail the orchestrator's completion
report. Failure sets `linearSynced: false` and appends a `session_events` row.

### 6.4 `lib/bridge/queue.ts`

```typescript
export async function enqueueDispatch(tx, p: {…}): Promise<{ queueId: string; messageId: string }>;
export async function settleDispatch(sessionId: string): Promise<void>;
export async function releaseDispatch(queueId: string, error: string): Promise<void>;
export async function sweepStale(): Promise<number>;  // claimed but never settled
```

`enqueueDispatch` **takes a transaction handle** — it cannot be called outside
one, which is how the "no publish-after-commit window" property is enforced by
the type system rather than by discipline.

`sweepStale` releases rows claimed longer than `DISPATCH_CLAIM_TIMEOUT_MS` ago
(orchestrator died mid-job), incrementing `attempts`. Runs on a Vercel Cron every
5 minutes. This is the redelivery behavior Pub/Sub gave for free; it is ~30 lines
here.

### 6.5 `packages/bridge-client/` 0.2.0 — supersedes TRD 03 §6.5

```typescript
export class RealtimeSubscriber {          // replaces PubSubSubscriber
  constructor(cfg: { supabaseUrl: string; jwt: string; orchestratorId: string;
                     onNotify: (queueId: string) => void; onReconnect: () => void });
  async start(): Promise<void>;
  stop(): void;
}
export class DispatchLoop {                // the guarantee, transport-independent
  // sweep on start, on every onReconnect, and every SWEEP_INTERVAL_MS
  // claim → handler → settle | release
}
export class BridgeClient {
  async register(c: { name: string; repos: string[]; maxConcurrentJobs: number }):
    Promise<{ orchestratorId: string; orgId: string; realtime: {…} }>;
  async reportSessionStatus(sessionId: string, s: {…}): Promise<void>;
  async reportSessionComplete(sessionId: string, r: {…}): Promise<void>;
  getOrchestratorId(): string | null;      // fixes the getOrchestatorId typo at :71
}
```

**Breaking changes, shipped deliberately as 0.2.0:**
- `PubSubSubscriber` removed. Exported for one minor as a **shim that throws** a
  clear message ("Pub/Sub transport removed in 0.2.0 — upgrade the DevPilot CLI"),
  so an old install fails legibly instead of at an opaque GCP auth error.
- `register()` gains required `name` (break 2).
- `@google-cloud/pubsub` dropped — it was the package's only dependency
  (`package.json:41-43`). Replaced by `@supabase/supabase-js` +
  `@devpilot.sh/bridge-protocol`.
- Errors surface the JSON body, not bare `response.statusText` (`client.ts:30-31`).

**Justification for breaking a published package:** `0.1.1` **cannot work
end-to-end** — break 2 means `register()` always 400s. There is no functioning
installed base to protect, and 0.x semver permits it. The CLI bumps in lockstep.

### 6.6 `packages/cli/src/commands/bridge/dispatch-handler.ts` — adopts TRD 03 §6.5

```typescript
export function createBridgeDispatchHandler(opts: DispatchHandlerOptions):
  (message: TaskDispatchMessage) => Promise<void>;
```

Behavior per TRD 03 §6.5, with one change forced by §3.1: **the handler never
throws.** Under Pub/Sub a throw meant nack-and-redeliver; here a throw would
strand a claimed row until `sweepStale`. Errors call
`reportSessionStatus(sessionId, { status:'error' })` **and**
`releaseDispatch(queueId, message)`, then return. Closes break 3's downstream TODO
at `connect.ts:66`.

### 6.7 Deletions

`packages/bridge/**` (including `Dockerfile`, `cloudbuild.yaml`), and every
`@google-cloud/pubsub` dependency across the monorepo. `docs/LINEAR-BRIDGE.md`'s
GCP architecture diagram (`:25-45`) and deploy section (`:181-192`) are rewritten.

---

## 7. Config

| Env var | Where | Secret | Notes |
|---|---|---|---|
| `BRIDGE_ENCRYPTION_KEY` | website, server | **YES** | 32-byte base64. `openssl rand -base64 32`. Linear sync skipped with a logged warning if unset |
| `LINEAR_API_URL` | website, server | no | Default `https://api.linear.app/graphql`; test override |
| `DISPATCH_MAX_ATTEMPTS` | website | no | Default `3` |
| `DISPATCH_CLAIM_TIMEOUT_MS` | website | no | Default `1800000` (30 min) |
| `DEVPILOT_BRIDGE_URL` | CLI | no | e.g. `https://<apex>` |
| `DEVPILOT_BRIDGE_TOKEN` | CLI | **YES** | `dp_orch_…`. Replaces `DEVPILOT_BRIDGE_API_KEY` |
| `DEVPILOT_BRIDGE_TRANSPORT` | CLI | no | `realtime` \| `poll`. Default `realtime` |

Plus TRD 04 §7 (Supabase URL/keys, `DATABASE_URL`, `DIRECT_URL`,
`SUPABASE_JWT_SECRET`).

**Removed:** `GCP_PROJECT_ID`, `PUBSUB_TOPIC_DISPATCH`, `DEVPILOT_BRIDGE_API_KEY`.

Per-workspace Linear API keys and webhook secrets live **encrypted in the
database** (§6.2), never in env.

---

## 8. Error Handling & Edge Cases

| Case | Behavior |
|---|---|
| Webhook: no signature header | **401.** Not a skip. This is break 6 |
| Webhook: workspace has no stored secret | **401** with `code:'webhook_not_configured'` |
| Webhook: timestamp >60s skew | 401 `stale_webhook` |
| Webhook: Linear redelivers | `dispatch_sessions` unique on `(workspace_id, linear_issue_id)` where status ∉ terminal → second delivery returns the existing `sessionId`, enqueues nothing |
| No `repo_routes` match | Session `error`, event `error`, `action:'no_orchestrator'`, **no queue row** |
| Two orchestrators claim the same row | The conditional UPDATE returns zero rows for the loser; it drops silently. No lock needed |
| Orchestrator dies after claim | `sweepStale` releases after `DISPATCH_CLAIM_TIMEOUT_MS`, `attempts++`, re-armed via `availableAt` backoff |
| `attempts` reaches `DISPATCH_MAX_ATTEMPTS` | Row deleted, session `error`, `lastError` copied to `errorMessage`, `session_events` row |
| Realtime disconnects | supabase-js reconnects with backoff; `onReconnect` triggers an immediate sweep. **No message loss — the table holds it** |
| WebSocket blocked by proxy | `--transport poll`, or automatic fallback after 3 failed connects |
| `SUPABASE_JWT_SECRET` unset | Realtime unavailable → poll path only. Logged once at connect, not per-cycle |
| `BRIDGE_ENCRYPTION_KEY` unset | Completion succeeds, `linearSynced:false`, warning logged. Never a 500 |
| Linear API down / key revoked | `syncSessionCompletionToLinear` returns `{synced:false, error}`. HTTP response is still 200 |
| Decrypt fails (key rotated) | Treated as "no key": `linearSynced:false` + event. Never throws into the response |
| Vercel function timeout mid-completion | Transaction rolls back; the orchestrator retries the report (idempotent on `sessionId` + terminal status) |

---

## 9. Testing Strategy

**9.1 Protocol** (`packages/bridge-protocol/tests/`) — every zod schema round-trips;
`TaskDispatchMessage` requires `sessionId`, `queueId`, `targetOrchestratorId`
(regression guard for break 4).

**9.2 Webhook pipeline** (`app/api/__tests__/linear-webhook.test.ts`) — valid
signature → session + event + **queue row in one transaction**; **no header →
401**; no stored secret → 401; stale timestamp → 401; tampered body → 401; no
route → `no_orchestrator` and **zero** queue rows; redelivery → same `sessionId`,
no second enqueue. Break 6 has a named test.

**9.3 Auth** (`app/api/__tests__/auth-matrix.test.ts`) — **a table-driven sweep of
every route × {no credential, session, foreign-org session, orchestrator token,
foreign-org orchestrator token}** asserting the §5 matrix. `DELETE
/api/orchestrators/:id` with a valid orchestrator token must 403. `POST
/api/sessions/:id/complete` for another orchestrator's session must 404. This is
the gate for break 7 and it is a sweep, not spot checks.

**9.4 Crypto** — round-trip; tamper → throw; wrong key → throw; format is
`b64.b64.b64`; ciphertext differs across calls (IV freshness).

**9.5 Queue semantics** — concurrent claim: exactly one winner; release re-arms
with backoff; `sweepStale` releases only past the timeout; `attempts` cap →
session `error`; settle deletes the row.

**9.6 RLS on `dispatch_queue`** (pgTAP, extends TRD 04 §9.1) — orchestrator A's
JWT sees only A's rows; cannot UPDATE a claimed row; cannot INSERT or DELETE;
`anon` sees nothing.

**9.7 Linear sync** — success comments + moves state; failure comments only;
missing key → `{synced:false}` and no throw; API 500 → no throw.

**9.8 Client + handler** (`packages/cli/tests/unit/dispatch-handler.test.ts`) —
register sends `name`; handler dispatches, reports `dispatched` → progress →
complete; **a throwing orchestrator produces `error` + `release`, never an
exception**; sweep-on-reconnect claims a row Realtime never delivered.

**9.9 End-to-end** (`tests/e2e/bridge.test.ts`) — against `supabase start` +
`next dev` + a stub orchestrator: signed webhook → queue → claim → dispatch →
status → complete → Linear stub called → queue empty → session `complete`.
**This is the test that has never existed.**

---

## 10. Acceptance Criteria

Supersedes T3-AC-01…04.

- **T5-AC-01** A bot-assigned Linear issue with a valid signature produces, in one
  transaction, a `dispatch_sessions` row, a `session_events` row, and a
  `dispatch_queue` row whose payload carries `sessionId`, `queueId`, and
  `targetOrchestratorId`. The TODO at `webhooks/linear.ts:111` is gone. *(break 1)*
- **T5-AC-02** `BridgeClient.register` sends `name` and succeeds against the
  deployed route; the historical 400 is fixed and covered by a test. *(break 2)*
- **T5-AC-03** `devpilot bridge connect` receives dispatches with **no GCP
  credential, no subscription creation, and no `GCP_PROJECT_ID`**; `grep -rn
  'pubsub\|google-cloud' packages/` returns nothing outside CHANGELOGs. *(break 3)*
- **T5-AC-04** `TaskDispatchMessage` is defined **once**, in
  `@devpilot.sh/bridge-protocol`; no other file in either repo declares it.
  *(break 4)*
- **T5-AC-05** Session completion comments on the Linear issue and moves it to the
  team's completed state, and writes a telemetry `session_events` row; both TODOs
  at `sessions/routes.ts:89-90` are gone; a Linear failure never fails the HTTP
  response. *(break 5)*
- **T5-AC-06** Killing the orchestrator between enqueue and claim, then
  restarting it, results in the job being dispatched — proving the guarantee
  lives in the table, not the socket.
- **T5-AC-07** With Realtime disabled entirely (`--transport poll`), the full
  pipeline still completes.
- **T5-AC-08** Two orchestrators racing the same row: exactly one dispatches.
- **T5-AC-09 · GATE** A webhook request with **no** `linear-signature` header
  returns **401** and writes nothing. Likewise when the workspace has no stored
  secret. *(break 6 — release gate)*
- **T5-AC-10 · GATE** The §9.3 auth-matrix sweep passes for **every** route.
  Specifically: no unauthenticated request reaches any handler body; `DELETE
  /api/orchestrators/:id` requires an owner/admin **session** and rejects a valid
  orchestrator token; `POST /api/sessions/:id/complete` 404s for a session the
  bearer does not own. *(break 7 — release gate)*
- **T5-AC-11 · GATE** `workspaces.apiKeyEncrypted` and `webhookSecret` are written
  only via `encryptSecret`; a row read directly from Postgres shows ciphertext in
  `b64.b64.b64` form; no plaintext write path exists. *(break 8 — release gate)*
- **T5-AC-12** A second orchestrator's JWT subscribed to the `dispatch_queue`
  Realtime channel receives **zero** events for the first's rows, proven by test.
- **T5-AC-13** `supabase_realtime` contains exactly `dispatch_queue` and
  `dispatch_sessions`.
- **T5-AC-14** `devpilot` works with **no bridge configured**: `devpilot status`,
  local dispatch, and the root Next app pass with `DEVPILOT_BRIDGE_URL` unset and
  no network. The open-source path owes nothing to the hosted plane.
- **T5-AC-15** `packages/bridge/` is deleted; `Dockerfile` and `cloudbuild.yaml`
  are gone; `grep -rn 'packages/bridge\b'` (excluding lockfiles, docs, spec)
  is empty.
- **T5-AC-16** `@devpilot.sh/bridge-protocol` and `@devpilot.sh/bridge-client@0.2.0`
  publish from CI; the CLI depends on the new versions; importing
  `PubSubSubscriber` throws the documented upgrade message.
- **T5-AC-17** `docs/LINEAR-BRIDGE.md` describes the Supabase architecture and the
  three deployment modes; no GCP diagram remains. *(break 9's docs half)*
- **T5-AC-18** `.github/workflows/ci.yml` has **no `|| true`**; typecheck, lint,
  and test are gating in both repos. *(break 9)*

---

## 11. Implementation Plan

Wave protocol per `00-PROGRAM-OVERVIEW.md` §2.2. No two same-wave tasks share a
file. Repo marked per task. **Waves 2+ require TRD 04 Wave 3 complete.**

### Wave 1 — Protocol (public repo; independent of TRD 04)

| ID | Title | Repo | Files | Description | Deps | Cx | Done-check |
|---|---|---|---|---|---|---|---|
| T5-W1-T1 | bridge-protocol package | devpilot | create `packages/bridge-protocol/**` | §6.1: messages, zod api schemas, status vocab, Linear formatters ported from `core/.../sync.ts:266-292` | — | M | §9.1 green; zero deps but zod |
| T5-W1-T2 | core re-export | devpilot | edit `packages/core/src/integrations/linear/{sync.ts,index.ts}` | Re-export formatters from bridge-protocol so one definition exists in-repo | T5-W1-T1 | S | core tests still green; no duplicated format strings |
| T5-W1-T3 | Publish protocol | devpilot | edit `.github/workflows/publish.yml` | Add bridge-protocol to the publish matrix ahead of bridge-client | T5-W1-T1 | S | Dry-run publish succeeds |

### Wave 2 — Queue, crypto, Linear (website)

| ID | Title | Repo | Files | Description | Deps | Cx | Done-check |
|---|---|---|---|---|---|---|---|
| T5-W2-T1 | dispatch_queue schema + migration | website | create `lib/db/schema/queue.ts`, `supabase/migrations/0001_*.sql` | §4.1, §4.2 publication, §4.4 policies. Hand-append RLS per TRD 04 §6.5 | TRD04-W1 | M | §9.6 pgTAP green; T5-AC-13 |
| T5-W2-T2 | crypto | website | create `lib/bridge/crypto.ts` | §6.2 verbatim | TRD04-W1 | M | §9.4 green |
| T5-W2-T3 | Linear service | website | create `lib/bridge/linear.ts` | §6.3, never-throwing | T5-W1-T3 | M | §9.7 green |
| T5-W2-T4 | queue service | website | create `lib/bridge/queue.ts` | §6.4. `enqueueDispatch` requires a tx handle | T5-W2-T1 | M | §9.5 green |
| T5-W2-T5 | stale sweep cron | website | create `app/api/cron/sweep-stale/route.ts`, `vercel.json` | `sweepStale` every 5 min; Vercel Cron secret header check | T5-W2-T4 | S | Claimed-and-abandoned row is released |

### Wave 3 — Routes (website) · **security gate**

| ID | Title | Repo | Files | Description | Deps | Cx | Done-check |
|---|---|---|---|---|---|---|---|
| T5-W3-T1 | Webhook route | website | create `app/api/webhooks/linear/route.ts` | §3.1 steps 1-7. **Mandatory signature**, replay guard, `no_orchestrator` path, transactional enqueue | W2-T1,T2,T4 | L | §9.2 green; **T5-AC-09** |
| T5-W3-T2 | Orchestrator routes | website | create `app/api/orchestrators/**` | §5.2. Every route guarded; DELETE is session-only | TRD04-W3 | M | **T5-AC-10** for these routes |
| T5-W3-T3 | Session routes | website | create `app/api/sessions/**` | §5.3 incl. ownership checks, settle, Linear sync, telemetry | W2-T3,T4; TRD04-W3 | L | **T5-AC-10**, T5-AC-05 |
| T5-W3-T4 | Dispatch poll/claim/release | website | create `app/api/dispatch/**` | §5.3 fallback path — must work with `SUPABASE_JWT_SECRET` unset | W2-T4 | M | T5-AC-07 |
| T5-W3-T5 | Auth matrix sweep | website | create `app/api/__tests__/auth-matrix.test.ts` | §9.3 table-driven over **every** route × 5 credential classes | W3-T1..T4 | M | **T5-AC-10 — release gate** |

### Wave 4 — Client & CLI (public repo)

| ID | Title | Repo | Files | Description | Deps | Cx | Done-check |
|---|---|---|---|---|---|---|---|
| T5-W4-T1 | bridge-client 0.2.0 | devpilot | rewrite `packages/bridge-client/src/**`, `package.json` | §6.5: `RealtimeSubscriber`, `DispatchLoop`, register `name`, throwing `PubSubSubscriber` shim, drop `@google-cloud/pubsub` | T5-W1-T1; W3 | L | §9.8 green; T5-AC-16 |
| T5-W4-T2 | dispatch handler | devpilot | create `packages/cli/src/commands/bridge/dispatch-handler.ts` | §6.6, never throws; error → report + release | T5-W4-T1 | M | §9.8; TODO at `connect.ts:66` gone |
| T5-W4-T3 | connect/status/disconnect | devpilot | edit `packages/cli/src/commands/bridge/{connect,status,disconnect}.ts` | §5.4 flags; remove `--project`; wire the handler; transport fallback | T5-W4-T2 | M | T5-AC-03 |
| T5-W4-T4 | Delete packages/bridge | devpilot | delete `packages/bridge/**`; edit `pnpm-workspace.yaml`, root `package.json` | §6.7 | W3 complete | S | T5-AC-15 |

### Wave 5 — Tests, CI, docs (both repos)

| ID | Title | Repo | Files | Description | Deps | Cx | Done-check |
|---|---|---|---|---|---|---|---|
| T5-W5-T1 | E2E pipeline | website | create `tests/e2e/bridge.test.ts` | §9.9 against `supabase start` + `next dev` + stub orchestrator | W3, W4 | L | Full green path; T5-AC-06, AC-08 |
| T5-W5-T2 | CI un-gating fix | devpilot | edit `.github/workflows/ci.yml` | **Remove every `\|\| true`** (`:31,34,37`); add bridge-protocol + bridge-client to the test matrix | W4 | S | **T5-AC-18**; a deliberate type error fails CI |
| T5-W5-T3 | Docs | devpilot | rewrite `docs/LINEAR-BRIDGE.md`; edit `docs/API-REFERENCE.md`, `README.md`, `docs/ROADMAP.md` | Supabase architecture, three deployment modes, self-host-a-bridge guide, protocol reference | all | M | T5-AC-17 |
| T5-W5-T4 | TRD 03 supersession | devpilot | edit `spec/trd/03-TIER3-HARDENING.md` | Mark §3.1, §4.3, §4.4, §6.3-6.5, T3-AC-01…04, and the six superseded W1/W2 tasks as superseded by this TRD | — | S | No contradictory guidance remains in 03 |

---

### Decisions other TRDs must respect

- **`@devpilot.sh/bridge-protocol` is the single definition of the wire
  contract.** TRDs extending the bridge add fields there and republish. Nothing
  re-declares `TaskDispatchMessage` — that duplication caused breaks 2 and 4.
- **`dispatch_queue` is the delivery guarantee; the transport is replaceable.**
  Any future transport swap happens behind `/api/dispatch/*` and the protocol
  package, without a client-contract change.
- **The hosted plane never executes agents.** No TRD may add code that clones a
  repo or runs an agent in the cloud. Execution is always local
  `OrchestratorService.dispatch`.
- **Local mode must run with zero bridge configuration** (T5-AC-14). No hosted-only
  concept may leak into `@devpilot.sh/core` or the CLI's local path.
- **Signature verification is unconditional.** A missing header or a missing
  stored secret is 401, never a skip.
- **Guards throw and run first** (TRD 04 §6.4). A route that returns before
  authenticating is a defect caught by T5-AC-10.
- **Secrets at rest go through `encryptSecret`.** No new plaintext credential
  column may be added to any table.

*TRD 05 · v1.0 · August 2026 · DRAFT*
