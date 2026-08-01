# TRD 04 — Hosted Accounts & Tenancy
## Supabase Auth · Organizations & Memberships · Orchestrator Tokens · RLS Baseline · Migration Toolchain
### v1.0 · August 2026 · Status: DRAFT

> **Depends on:** nothing in Tiers 1–3. This TRD introduces the first user model
> anywhere in DevPilot and is a prerequisite for `05-HOSTED-BRIDGE.md`.
>
> **Repo split — read this first.** Every task in this TRD lands in the
> **`devpilot-website`** repo (private), *except* T4-W4-T2 which edits
> `.env.example` in **`devpilot`** (public). The two repos are separate remotes;
> no task may touch both.
>
> **Supersedes** `03-TIER3-HARDENING.md` §4.3 ("Bridge (Postgres) — no schema
> change"). There is now a schema change, and it is the foundation of the
> hosted product.
>
> Shared conventions and wave protocol: `spec/trd/00-PROGRAM-OVERVIEW.md` §2.2.
> This TRD owns the tables `users`, `organizations`, `memberships`,
> `orchestrator_tokens`, and the function `public.is_org_member`.

---

## 1. Problem Statement & Goals

### 1.1 Problem

There is no user model anywhere in DevPilot. No `users` table, no auth, no
billing, no concept of an account. Tenancy today is a single `workspaces` row per
Linear org (`packages/bridge/src/db/schema/workspaces.ts:5-20`), which means **the
Linear organization *is* the tenant.**

That model cannot carry a hosted product:

- A user signs up *before* they connect Linear. There is no row to put them in.
- A user may connect zero Linear orgs, or two. `workspaces` is 1:1 with Linear.
- Billing attaches to an account, not to someone else's Linear workspace.
- A laptop (`orchestrators`) belongs to a person, not to a Linear org.
- Nothing authenticates. `orchestrators/routes.ts` has no auth middleware at all;
  the `apiKeys` table is written at `:63` and **never read**. `DELETE
  /api/orchestrators/:id` (`:117`) is open to the internet, and `cloudbuild.yaml:24`
  deploys with `--allow-unauthenticated`.

### 1.2 Goals

1. Supabase Auth is the identity provider. `auth.users` is canonical for identity.
2. An `organizations` / `memberships` layer sits between users and all existing
   business tables. `workspaces` becomes *a Linear connection owned by an org*,
   not the tenant root.
3. Reconcile `auth.users.id` (uuid) with the existing text/cuid2 primary keys
   **without converting either** (§4.2).
4. Every table has RLS enabled in the same migration that creates it, over a
   default-deny grant baseline (§4.5). No table is publicly readable.
5. A laptop authenticates with a revocable, long-lived credential that is *not* a
   user JWT (§6.3) — `devpilot bridge connect` runs headless for days.
6. One migration toolchain, one source of truth: drizzle-kit generates, Supabase
   CLI applies (§6.5).

### 1.3 Non-Goals

- **Billing.** `organizations.plan` and `stripe_customer_id` columns exist and are
  unused. Stripe is a later TRD.
- Org invitations by email, SSO/SAML, audit logs, per-seat limits.
- Migrating the local/self-hosted SQLite schema. Local mode has no accounts and
  must keep working with none (T4-AC-10).
- Any change to `@devpilot.sh/core`.

---

## 2. Current State (file-cited)

| Area | File | State |
|---|---|---|
| User model | — | **Does not exist.** No `users` table in any schema |
| Auth | — | **Does not exist.** No middleware, no session, no token verification |
| Tenancy root | `packages/bridge/src/db/schema/workspaces.ts:5-20` | `workspaces.linearOrgId` unique — the Linear org is the tenant |
| API keys | `packages/bridge/src/db/schema/orchestrators.ts:29-38` | `apiKeys` table with `keyHash`, `scopes`, `expiresAt` — correct shape, **never read** |
| Key hashing | `packages/bridge/src/api/orchestrators/routes.ts:17-19` | SHA-256 `hashApiKey`, used only at write time (`:39`, `:63`) |
| Key generation | `.../routes.ts:21-25` | `dp_orch_` + 32 random bytes base64url — sound; reused as-is |
| Secret at rest | `.../schema/workspaces.ts:10-11` | `webhookSecret` plaintext; `apiKeyEncrypted` is a `text` column with **no cipher behind it** — `services/crypto.ts` does not exist |
| Migrations | `packages/core/drizzle.config.ts` only | **Zero Postgres migrations exist.** The bridge schema has never been materialized |
| DB driver | `packages/bridge/src/db/index.ts:9-13` | `drizzle-orm/node-postgres` + `new Pool` per `initBridgeDatabase()` call — fatal under serverless |
| Supabase project | — | `jcvzmiajkudchngjxwpm` · org `suaphvqmtnbwcziokjaa` · `us-east-2` · empty |
| Host | `devpilot-website` | Next 15.2.4 App Router, Vercel `prj_InCi2T9Cbx5dDfPezAOcqN5Fowr3`, git-connected to `geastham/devpilot-website` since 7/15/25. **Zero API routes today** |

---

## 3. Architecture

### 3.1 Identity and tenancy layering

```
Supabase auth schema (managed)
  auth.users (uuid)
        │ 1:1, FK + ON DELETE CASCADE
        ▼
public.users            id uuid PK  ← mirrors auth.users, profile only
        │
        │ N:M via memberships (user_id uuid, org_id text)
        ▼
public.organizations    id text cuid2 PK   ← THE TENANT ROOT
        ├── workspaces      + org_id text FK   (a connected Linear org)
        ├── orchestrators   + org_id text FK   (a registered laptop)
        └── dispatch_sessions inherits tenancy via workspace_id → org_id
```

The type seam is **exactly one table**: `memberships`, holding `user_id uuid` and
`org_id text`. Mixed FK types *across* two tables is ordinary Postgres. A
heterogeneous PK type *within* one table would not be — and we never create one.

### 3.2 Two credential classes

A hosted account and a headless laptop need different credentials. Conflating
them is what makes long-running CLI sessions break.

```
BROWSER (dashboard)                     LAPTOP (devpilot bridge connect)
──────────────────                      ────────────────────────────────
Supabase Auth session                   orchestrator_tokens row
  magic link / GitHub OAuth               dp_orch_<32B base64url>
  short-lived JWT, auto-refresh           SHA-256 at rest, no expiry
  anon key + RLS                          revoked by DELETE
        │                                        │
        │                                        │ POST /api/orchestrators/token
        │                                        ▼
        │                                 short-lived Supabase JWT (1h)
        │                                 claims: orchestrator_id, org_id
        │                                        │
        ▼                                        ▼
   RLS via is_org_member(org_id)         RLS via auth.jwt()->>'orchestrator_id'
```

The exchanged JWT is what lets the laptop hold an **RLS-scoped Realtime
subscription** in TRD 05 without ever seeing the service_role key. This is the
piece that makes the transport decision in 05 §3.2 viable.

### 3.3 Connection topology

```
Vercel function ──▶ Supavisor TRANSACTION pooler :6543 ──▶ Postgres   (runtime)
supabase CLI    ──▶ direct / session mode      :5432 ──▶ Postgres   (DDL only)
```

Transaction mode **does not support prepared statements**. The driver moves from
`node-postgres` to `postgres.js` (what Supabase documents, lighter for serverless,
first-class in Drizzle) with `prepare: false` — mandatory, not optional. DDL and
advisory locks require session mode, so migrations use `DIRECT_URL`.

Direct Supabase connections are IPv6-only without the IPv4 add-on; Supavisor is
IPv4. Second independent reason for the pooler on Vercel.

---

## 4. Data Model

All new tables live in `devpilot-website/lib/db/schema/`. Drizzle is canonical
(§6.5).

### 4.1 New file `lib/db/schema/accounts.ts`

```typescript
import { pgTable, text, uuid, timestamp, jsonb, index, unique } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

// 1:1 mirror of auth.users. uuid PK, real FK — deleting the auth user cascades.
export const users = pgTable('users', {
  id: uuid('id').primaryKey(),           // REFERENCES auth.users(id) ON DELETE CASCADE
  email: text('email').notNull(),        // denormalized from auth.users for joins
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const organizations = pgTable('organizations', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  plan: text('plan', { enum: ['free', 'pro', 'enterprise'] }).notNull().default('free'),
  stripeCustomerId: text('stripe_customer_id'),   // reserved; unused in this TRD
  settings: jsonb('settings').$type<{ defaultRepo?: string }>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable('memberships', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  orgId: text('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['owner', 'admin', 'member'] }).notNull().default('member'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqUserOrg: unique('memberships_user_org_uniq').on(t.userId, t.orgId),
  byOrg: index('memberships_org_idx').on(t.orgId),
  byUser: index('memberships_user_idx').on(t.userId),
}));

// Long-lived, revocable laptop credential. Supersedes the unread `apiKeys` table.
export const orchestratorTokens = pgTable('orchestrator_tokens', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  orgId: text('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  orchestratorId: text('orchestrator_id'),        // set on first successful register
  tokenHash: text('token_hash').notNull().unique(),  // SHA-256 hex
  tokenPrefix: text('token_prefix').notNull(),       // first 12 chars, for display only
  name: text('name').notNull(),
  scopes: jsonb('scopes').$type<string[]>().notNull().default(['dispatch', 'status', 'heartbeat']),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ byOrg: index('orchestrator_tokens_org_idx').on(t.orgId) }));
```

`timestamp` is `withTimezone: true` throughout — the existing bridge schema uses
naked `timestamp` (`schema/sessions.ts:25-28`), which is a latent bug across
regions. The port in TRD 05 §4.2 fixes it while the tables are still empty.

### 4.2 Changed tables (ported from `packages/bridge/src/db/schema/`)

The existing seven tables port over **unchanged in PK type** — text/cuid2 stays.
Two gain an owner column, one is retired:

| Table | Change |
|---|---|
| `workspaces` | `+ orgId text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE`. `linearOrgId` unique constraint becomes `UNIQUE(org_id, linear_org_id)` — two orgs may connect the same Linear workspace |
| `orchestrators` | `+ orgId text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE` |
| `repo_routes` | `repo` unique becomes `UNIQUE(org_id, repo)` via join through `orchestrators`; add `orgId` denormalized for RLS without a join |
| `api_keys` | **Dropped.** Never read (`routes.ts:63` writes only). Replaced by `orchestrator_tokens` |
| `team_configs`, `dispatch_sessions`, `session_events` | Unchanged except `withTimezone` |

**No `createId()` call site changes. No FK retyping. No data migration** — every
table is empty.

### 4.3 Rejected alternatives for the uuid/cuid2 seam

| Approach | Why rejected |
|---|---|
| Convert all business tables to uuid | Touches 7 tables, every FK, every `createId()` site. Buys nothing — cuid2 ids are already opaque |
| Store user ids as `text`, compare `auth.uid()::text` | Works, and is a common pattern — but forfeits the FK to `auth.users`, so deleting an auth user orphans rows instead of cascading |
| Give `organizations` a uuid PK | Would split the business-table PK convention in half for no gain |

### 4.4 RLS helper

```sql
CREATE OR REPLACE FUNCTION public.is_org_member(target_org_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE org_id = target_org_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(target_org_id text, roles text[])
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE org_id = target_org_id AND user_id = auth.uid() AND role = ANY(roles)
  );
$$;
```

`SECURITY DEFINER` is required — a member reading `organizations` must not need
direct SELECT on `memberships`. `SET search_path` is required to make the
definer function injection-safe. **One function to audit instead of N policies
with inline subqueries.**

### 4.5 RLS matrix

Every table: `ENABLE ROW LEVEL SECURITY` **in the same migration that creates
it.** Never a follow-up.

| Table | anon/authenticated SELECT | INSERT/UPDATE/DELETE |
|---|---|---|
| `users` | `auth.uid() = id` | self, profile columns only |
| `organizations` | `is_org_member(id)` | `has_org_role(id, '{owner,admin}')` |
| `memberships` | `is_org_member(org_id)` | `has_org_role(org_id, '{owner,admin}')` |
| `workspaces` | **column-limited** — see below | service_role only |
| `orchestrators` | `is_org_member(org_id)` | service_role; DELETE also `has_org_role(org_id,'{owner,admin}')` |
| `repo_routes` | `is_org_member(org_id)` | service_role only |
| `orchestrator_tokens` | **no policy at all** → invisible | service_role only |
| `dispatch_sessions` | `is_org_member(org_id)` | service_role only |
| `session_events` | via `dispatch_sessions` join | service_role only |
| `team_configs` | `is_org_member` via `workspaces` | service_role only |

**`workspaces` is the dangerous one.** It holds `webhook_secret` and
`api_key_encrypted`. Do **not** grant table-wide SELECT to `authenticated`:

```sql
REVOKE ALL ON public.workspaces FROM anon, authenticated;
GRANT SELECT (id, org_id, linear_org_id, linear_org_name, is_active, settings,
              created_at, updated_at)
  ON public.workspaces TO authenticated;
```

Baseline for the whole schema, applied **first**, in migration `0000`:

```sql
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
```

Supabase's stock grants are permissive. RLS *without* revoking still exposes
column metadata, and leaves the table fully open if a policy is ever dropped.

---

## 5. API Surface

All routes are Next App Router handlers in `devpilot-website/app/api/`.
`runtime = 'nodejs'` on every one (crypto + `postgres.js`).

### 5.1 Auth

| Route | Behavior |
|---|---|
| `GET /api/auth/callback` | Supabase OAuth/magic-link code exchange → cookie session → redirect `/dashboard`. On first-ever login, `ensureUserAndOrg()` (§6.2) |
| `POST /api/auth/signout` | Clears session, 204 |

Sign-in UI uses `@supabase/ssr` browser client directly; no custom route.
Providers: email magic link + GitHub OAuth (configured in the Supabase dashboard,
**not** via env vars).

### 5.2 Organizations

| Route | Auth | Behavior |
|---|---|---|
| `GET /api/orgs` | session | Orgs the caller is a member of, with role |
| `PATCH /api/orgs/:id` | session, owner/admin | `name`, `settings` |
| `GET /api/orgs/:id/members` | session, member | Members + roles |
| `PATCH /api/orgs/:id/members/:userId` | session, owner | Change role. Last owner cannot be demoted → 409 |
| `DELETE /api/orgs/:id/members/:userId` | session, owner/admin | Remove. Last owner cannot be removed → 409 |

### 5.3 Orchestrator tokens

| Route | Auth | Behavior |
|---|---|---|
| `POST /api/orgs/:id/tokens` | session, owner/admin | Mint `dp_orch_…`. **Returns the plaintext exactly once.** Stores SHA-256 + 12-char prefix |
| `GET /api/orgs/:id/tokens` | session, member | List: id, name, prefix, scopes, lastUsedAt, revokedAt. **Never the token** |
| `DELETE /api/orgs/:id/tokens/:tokenId` | session, owner/admin | Sets `revokedAt`. Revocation is immediate — §6.3 does not cache |
| `POST /api/orchestrators/token` | **bearer `dp_orch_…`** | Exchange for a 1h Supabase JWT (§6.3). 401 on unknown/revoked/expired |

### 5.4 Error envelope (all routes, all TRDs)

```typescript
{ error: { code: string, message: string, details?: unknown } }
```

Codes: `unauthenticated` 401 · `forbidden` 403 · `not_found` 404 ·
`invalid_request` 400 · `conflict` 409 · `rate_limited` 429 · `internal` 500.

`404`, not `403`, for a resource in an org the caller is not a member of —
membership must not be probeable.

---

## 6. Core Services / Components

### 6.1 `lib/db/index.ts` — serverless-safe singleton

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Cached on globalThis: Vercel reuses the module across invocations on a warm
// instance, but re-evaluates on cold start. A per-call `new Pool` (the old
// packages/bridge/src/db/index.ts:9-13 shape) exhausts connections under load.
const g = globalThis as unknown as { __dpSql?: ReturnType<typeof postgres> };

const client = g.__dpSql ?? postgres(process.env.DATABASE_URL!, {
  prepare: false,        // MANDATORY: Supavisor transaction mode
  max: 1,                // one socket per function instance; pooling is Supavisor's job
  idle_timeout: 20,
});
if (process.env.NODE_ENV !== 'production') g.__dpSql = client;

export const db = drizzle(client, { schema });
```

Two clients, never confused:
- `lib/supabase/server.ts` — `createServerClient` (anon key + user cookie) for
  anything read **on behalf of a signed-in user**. RLS applies.
- `lib/supabase/admin.ts` — service_role. **Import-guarded**: throws at module
  load if `typeof window !== 'undefined'`. Used only by webhook and orchestrator
  routes.

### 6.2 `lib/auth/provisioning.ts`

```typescript
export async function ensureUserAndOrg(authUser: { id: string; email: string; ... }): Promise<{
  userId: string; orgId: string; created: boolean;
}>;
```

Idempotent, single transaction: upsert `users` from the auth row; if the user has
zero memberships, create an `organizations` row (name from email local-part, slug
`slugify(name)` + collision suffix) and an `owner` membership. Safe to call on
every login — first login creates, subsequent ones no-op.

### 6.3 `lib/auth/orchestrator-token.ts`

```typescript
export function generateOrchestratorToken(): { token: string; hash: string; prefix: string };
export async function verifyOrchestratorToken(bearer: string): Promise<
  { ok: true; tokenId: string; orgId: string; orchestratorId: string | null; scopes: string[] } |
  { ok: false; reason: 'malformed' | 'unknown' | 'revoked' | 'expired' }
>;
export async function mintOrchestratorJwt(p: {
  orchestratorId: string; orgId: string;
}): Promise<{ jwt: string; expiresAt: string }>;
```

`generateOrchestratorToken` reuses `routes.ts:21-25` verbatim (`dp_orch_` + 32
random bytes base64url) — the existing generator is sound.

`verifyOrchestratorToken` looks up by SHA-256 hash (indexed unique), rejects
`revokedAt IS NOT NULL` and expired, and updates `lastUsedAt` **fire-and-forget**
(never awaited — it must not add latency to the hot path). No caching: revocation
is immediate.

`mintOrchestratorJwt` signs HS256 with `SUPABASE_JWT_SECRET`:
`{ sub: orchestratorId, role: 'authenticated', orchestrator_id, org_id, exp: now+3600 }`.

> **Risk, flagged deliberately.** Supabase is migrating from a shared HS256 JWT
> secret to asymmetric signing keys; minting your own HS256 tokens against the
> legacy secret works today but is on a deprecation path. **Fallback if
> unavailable:** the laptop skips Realtime and polls
> `GET /api/dispatch/poll` (TRD 05 §5.3) authenticated by the opaque
> `dp_orch_…` token, with the server using service_role to read the queue. That
> costs push latency and keeps correctness intact, because TRD 05's delivery
> guarantee lives in the table, not the transport. T5-W2-T4 must implement the
> poll route regardless — it is also the WebSocket-blocked-by-proxy fallback.

### 6.4 `lib/auth/guards.ts`

```typescript
export async function requireSession(): Promise<{ userId: string }>;                  // 401
export async function requireOrgMember(orgId: string): Promise<{ userId: string; role: string }>; // 404
export async function requireOrgRole(orgId: string, roles: string[]): Promise<...>;   // 403
export async function requireOrchestrator(req: Request): Promise<{ orgId: string; ... }>; // 401
```

Each **throws a typed `ApiError`** caught by a shared `withRoute()` wrapper that
renders §5.4. Guards throw rather than return so a forgotten `if` cannot fail
open — the failure mode that produced the audit's finding 7.

**Every route handler in this TRD and TRD 05 calls exactly one guard as its
first statement.** T4-AC-09 greps for it.

### 6.5 Migration toolchain

`drizzle.config.ts`:
```typescript
export default {
  schema: './lib/db/schema/index.ts',
  out: './supabase/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DIRECT_URL! },
  migrations: { prefix: 'supabase' },   // timestamp names the Supabase CLI accepts
};
```

Loop, in order, every time:
1. Edit the Drizzle schema.
2. `pnpm drizzle-kit generate` → SQL in `supabase/migrations/`.
3. **Hand-edit that SQL** to append `ENABLE ROW LEVEL SECURITY`, `REVOKE`,
   `GRANT`, and `CREATE POLICY`. drizzle-kit does not emit these. **This
   hand-edit is the security review checkpoint on every schema change** — it is a
   feature, not a workaround.
4. `supabase db push` (or `migration up`).
5. Commit schema + SQL together, always in the same commit.

Hard rules:
- **Never `drizzle-kit push`** against Supabase — it bypasses the migration ledger.
- **Supabase Studio schema edits are forbidden.** Anything done in the dashboard
  must be reverse-engineered back into Drizzle or it is lost on the next push.
- CI runs `supabase db diff --linked` as the drift gate (T4-W4-T1), which also
  closes the audit's finding 9 ("not in CI").

  > **A bare "output must be empty" check does not work — verified against the
  > live project on 2026-08-01.** `db diff --linked` compares the remote against
  > a shadow database built only from migrations, so two classes of
  > platform-managed object show up as permanent, irreducible noise:
  >
  > 1. `drop extension if exists "pg_net"` — Supabase preinstalls `pg_net` on the
  >    remote; the shadow DB has no such extension.
  > 2. `grant {select,insert,update,delete} on table public.* to service_role` —
  >    Supabase's default privileges grant `service_role` on the remote (7 grants
  >    per table, confirmed present); the shadow DB does not reproduce them.
  >
  > Neither is real drift. The gate must therefore **filter these two classes and
  > fail on anything that remains**, not assert emptiness. Do not "fix" the noise
  > by adding service_role grants to the migration — they are already correct on
  > the remote, and adding them would mask genuine future drift.

Rejected: Supabase-canonical + `drizzle-kit introspect`. Introspect output is
machine-generated and unreviewable, and would lose the `$type<>()` jsonb
annotations the schema relies on (`workspaces.ts:13-17`).

---

## 7. Config

| Env var | Where | Secret | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | website | no | `https://jcvzmiajkudchngjxwpm.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | website | no | RLS is the guard. Safe in the browser |
| `SUPABASE_SERVICE_ROLE_KEY` | website, **server only** | **YES** | Never `NEXT_PUBLIC_*`. Never in the browser bundle |
| `SUPABASE_JWT_SECRET` | website, server only | **YES** | Signs orchestrator JWTs (§6.3) |
| `DATABASE_URL` | website, server only | **YES** | Supavisor transaction pooler, **:6543** |
| `DIRECT_URL` | website, server only | **YES** | Direct/session, **:5432**. Migrations only |
| `NEXT_PUBLIC_SITE_URL` | website | no | OAuth redirect base |

Per-workspace Linear API keys and webhook secrets are **encrypted in the
database**, never in env (TRD 05 §6.2).

`devpilot` (public repo) `.env.example` gains `DEVPILOT_BRIDGE_URL` and
`DEVPILOT_BRIDGE_TOKEN`, and **loses `GCP_PROJECT_ID`** (T4-W4-T2).

> If the Supabase project offers the newer `sb_publishable_…` / `sb_secret_…`
> key pair, use it in place of anon/service_role and keep the variable names above.

---

## 8. Error Handling & Edge Cases

| Case | Behavior |
|---|---|
| Auth user deleted in Supabase | `ON DELETE CASCADE` clears `users` → `memberships`. Orgs where they were sole owner become **ownerless** — a nightly check flags these; not auto-deleted (data loss) |
| Last owner demoted/removed | 409 `conflict`, message names the constraint |
| Two concurrent first-logins | `ensureUserAndOrg` is one transaction; `memberships_user_org_uniq` makes the loser a no-op retry |
| Slug collision | Append `-2`, `-3`… Bounded at 50 attempts, then cuid2 suffix |
| Token used after revoke | 401 `unauthenticated`. No cache means no window |
| Token with `orchestratorId` pointing at a deleted orchestrator | Treated as unbound; next register re-binds |
| `SUPABASE_JWT_SECRET` unset | `/api/orchestrators/token` returns 503 with an actionable message; poll fallback (§6.3) still works |
| Migration applied out of band via Studio | `supabase db diff --linked` in CI fails the build |
| Request to an org the caller is not in | **404, never 403** |

---

## 9. Testing Strategy

**9.1 RLS policy tests** (`supabase/tests/rls.test.sql`, pgTAP) — the highest-value
suite in this TRD. For each table: as `anon`, as a member of org A, as a member of
org B, assert exactly the §4.5 matrix. Explicit assertions that
`orchestrator_tokens` returns **zero rows** for any non-service role, and that
`workspaces.webhook_secret` / `api_key_encrypted` are **not selectable** by
`authenticated`.

**9.2 Guard unit tests** — each guard's 401/403/404 path; membership-probe returns
404 not 403.

**9.3 Token lifecycle** — mint → verify ok → revoke → verify `revoked`; expired;
malformed; `lastUsedAt` updated without blocking the response.

**9.4 Provisioning** — first login creates org + owner membership; second login
no-ops; concurrent logins yield one org.

**9.5 Migration integrity** — apply all migrations to a clean `supabase start`
database; assert every table in `public` has `relrowsecurity = true` (a loop over
`pg_class`, so a future table cannot silently ship without RLS).

**9.6 Driver** — assert `prepare: false` is set; a smoke query through the
transaction pooler.

---

## 10. Acceptance Criteria

- **T4-AC-01** A new user signing in with a magic link or GitHub lands on
  `/dashboard` with exactly one `organizations` row and one `owner` membership;
  signing in again creates nothing further.
- **T4-AC-02** Every table in schema `public` has RLS enabled, verified by the
  §9.5 `pg_class` loop, not by inspection.
- **T4-AC-03** As `anon` and as `authenticated`, `SELECT` on
  `orchestrator_tokens` returns zero rows; `SELECT webhook_secret` and
  `SELECT api_key_encrypted` on `workspaces` are rejected at the grant level.
- **T4-AC-04** A member of org A receives **404** for every `/api/orgs/:id/*`
  route of org B — never 403, never 200.
- **T4-AC-05** `POST /api/orgs/:id/tokens` returns the plaintext token exactly
  once; no subsequent route or DB read can reproduce it; `GET .../tokens` returns
  only the 12-char prefix.
- **T4-AC-06** `DELETE .../tokens/:id` makes the next
  `POST /api/orchestrators/token` with that token return 401 with no delay or
  cache window.
- **T4-AC-07** `POST /api/orchestrators/token` returns a JWT whose
  `orchestrator_id` claim satisfies the `dispatch_queue` RLS policy from TRD 05
  §4.4, proven by a query executed as that JWT.
- **T4-AC-08** Demoting or removing the last `owner` of an org returns 409 and
  changes nothing.
- **T4-AC-09** Every handler under `app/api/` calls a `require*` guard as its
  first statement. `grep -L 'require\(Session\|OrgMember\|OrgRole\|Orchestrator\)'
  app/api/**/route.ts` returns only explicitly-listed public routes.
- **T4-AC-10** The `devpilot` repo still works with **zero** bridge configuration:
  `devpilot status`, local dispatch, and the root Next app are unaffected by this
  TRD. No file in `packages/core` or `packages/cli` changed except `.env.example`.
- **T4-AC-11** `supabase db diff --linked`, **filtered per §6.5** (dropping the
  `pg_net` extension line and `service_role` grant lines), is empty on a clean CI
  run; a deliberately introduced Studio-side change makes CI fail. An unfiltered
  emptiness check is not acceptable — it is red on every run and would be
  disabled within a week.
- **T4-AC-12** No secret value appears in any committed file. `.env.example`
  carries names only; `git grep -iE 'service_role|sb_secret_|eyJ[A-Za-z0-9_-]{20,}'`
  is empty across both repos.

---

## 11. Implementation Plan

Wave protocol per `00-PROGRAM-OVERVIEW.md` §2.2. No two same-wave tasks share a
file. Complexity S/M/L. **All tasks in `devpilot-website` unless marked.**

### Wave 0 — Gates (blocking; nothing else may start)

| ID | Title | Files | Description | Deps | Cx | Done-check |
|---|---|---|---|---|---|---|
| T4-W0-T1 | Build gates on | `next.config.mjs` | Remove `typescript.ignoreBuildErrors` and `eslint.ignoreDuringBuilds` (`:6-8`, `:3-5`). A broken API route must not deploy green | — | S | Introduce a deliberate type error → `next build` fails |
| T4-W0-T2 | Project identity | `package.json`, `README.md` | Rename `my-v0-project` → `devpilot-website`; replace the v0 README | — | S | `name` field correct; README describes the platform |
| T4-W0-T3 | Disconnect v0; link tooling | *(dashboard + local)* | Disconnect the v0.dev integration from `geastham/devpilot-website`; `vercel link`; `supabase init`; `supabase link --project-ref jcvzmiajkudchngjxwpm` | — | S | `.vercel/` and `supabase/config.toml` exist; v0 integration absent |
| T4-W0-T4 | Vercel plan + domain | *(dashboard)* | **Hobby plan forbids commercial use** — upgrade to Pro before launch. Attach the production apex domain *before* any Linear webhook is registered. Clear the "critical vulnerabilities" advisory | — | S | Plan is Pro; apex domain resolves; advisory cleared |

### Wave 1 — Schema, migrations, RLS

| ID | Title | Files | Description | Deps | Cx | Done-check |
|---|---|---|---|---|---|---|
| T4-W1-T1 | Accounts schema | create `lib/db/schema/accounts.ts`, `lib/db/schema/index.ts` | §4.1 exactly | W0 | M | Typechecks; tables importable |
| T4-W1-T2 | Port bridge schema | create `lib/db/schema/{workspaces,orchestrators,sessions}.ts` | Port from `packages/bridge/src/db/schema/` with §4.2 changes: `orgId`, composite uniques, `withTimezone`, drop `apiKeys` | W0 | M | Typechecks; `api_keys` absent; every `timestamp` has `withTimezone` |
| T4-W1-T3 | DB client + Supabase clients | create `lib/db/index.ts`, `lib/supabase/{server,admin,client}.ts`; `drizzle.config.ts` | §6.1 + §6.5 config. `admin.ts` throws if imported client-side | W0 | M | Unit: `prepare:false` set; importing `admin` in a client component fails the build |
| T4-W1-T4 | Baseline migration | create `supabase/migrations/0000_*.sql` | Generate via drizzle-kit, then hand-append §4.5 REVOKE baseline, `is_org_member`/`has_org_role` (§4.4), `ENABLE RLS` + every policy, column-level `workspaces` grant | W1-T1,T2,T3 | L | `supabase db reset` clean; §9.5 RLS loop passes |
| T4-W1-T5 | RLS pgTAP suite | create `supabase/tests/rls.test.sql` | §9.1 in full, incl. the token-invisibility and `workspaces` column assertions | W1-T4 | L | `supabase test db` green |

### Wave 2 — Auth, guards, provisioning

| ID | Title | Files | Description | Deps | Cx | Done-check |
|---|---|---|---|---|---|---|
| T4-W2-T1 | Guards + error envelope | create `lib/auth/guards.ts`, `lib/api/{errors,with-route}.ts` | §6.4 + §5.4. Guards **throw**; `withRoute` renders. 404-not-403 for non-members | W1-T3 | M | §9.2 passes |
| T4-W2-T2 | Provisioning | create `lib/auth/provisioning.ts` | §6.2, single transaction, idempotent | W1-T1 | M | §9.4 passes incl. the concurrency case |
| T4-W2-T3 | Auth routes + UI | create `app/api/auth/callback/route.ts`, `app/api/auth/signout/route.ts`, `app/(auth)/sign-in/page.tsx` | §5.1. Magic link + GitHub. Calls `ensureUserAndOrg` | W2-T2 | M | Manual: sign in → org exists; sign out clears session |
| T4-W2-T4 | Orchestrator tokens lib | create `lib/auth/orchestrator-token.ts` | §6.3 incl. non-awaited `lastUsedAt`, HS256 minting, 503 path when the secret is unset | W1-T1 | M | §9.3 passes |

### Wave 3 — Org & token routes, dashboard shell

| ID | Title | Files | Description | Deps | Cx | Done-check |
|---|---|---|---|---|---|---|
| T4-W3-T1 | Org routes | create `app/api/orgs/route.ts`, `app/api/orgs/[id]/route.ts`, `app/api/orgs/[id]/members/**` | §5.2 incl. last-owner 409 | W2-T1 | M | Route tests; T4-AC-04 and AC-08 |
| T4-W3-T2 | Token routes | create `app/api/orgs/[id]/tokens/**`, `app/api/orchestrators/token/route.ts` | §5.3. Plaintext returned once | W2-T4 | M | T4-AC-05, AC-06, AC-07 |
| T4-W3-T3 | Dashboard shell | create `app/(dashboard)/layout.tsx`, `app/(dashboard)/dashboard/page.tsx`, `app/(dashboard)/settings/tokens/page.tsx` | Authed shell reusing the existing shadcn set. Token mint/list/revoke UI with copy-once affordance | W3-T1,T2 | M | Manual: mint, copy, revoke round-trip |
| T4-W3-T4 | Marketing route group | move `app/page.tsx` → `app/(marketing)/page.tsx`; edit `app/layout.tsx` | Isolate the v0 landing page from the authed tree so future marketing edits cannot touch `app/api` | W0 | S | `/` renders unchanged; `/dashboard` uses the authed layout |

### Wave 4 — CI, docs, contract

| ID | Title | Files | Description | Deps | Cx | Done-check |
|---|---|---|---|---|---|---|
| T4-W4-T1 | CI | create `.github/workflows/ci.yml` | typecheck + lint + `next build` + `supabase test db` + `supabase db diff --linked` (fails if non-empty). **No `\|\| true` anywhere** | W1-T5 | M | T4-AC-11; a Studio drift makes CI red |
| T4-W4-T2 | Env contract | create `.env.example` (website); edit `.env.example` (**`devpilot` repo**) | §7 names only, zero values. devpilot gains `DEVPILOT_BRIDGE_URL`/`DEVPILOT_BRIDGE_TOKEN`, loses `GCP_PROJECT_ID` | — | S | T4-AC-12; both files names-only |
| T4-W4-T3 | Secret scan | create `.github/workflows/secret-scan.yml`, `.gitignore` audit | Block `.env.local`; grep gate from T4-AC-12 | W4-T1 | S | Committing a fake service_role key fails CI |
| T4-W4-T4 | Docs | create `docs/HOSTED-ARCHITECTURE.md` (website) | Tenancy model, RLS matrix, migration loop, the two credential classes, and the three deployment modes | all | M | Every §5 route and §7 var documented |

---

### Decisions other TRDs must respect

- **`organizations` is the tenant root.** `workspaces` is a *connected Linear org
  owned by an organization*, never the tenant. Nothing may reintroduce
  Linear-org-as-tenant.
- **User-scoped columns are `uuid` and FK to `auth.users`. Business tables stay
  `text`/cuid2.** The only mixed-type table is `memberships`. Do not convert
  either side; do not add a second heterogeneous seam.
- **RLS is enabled in the creating migration, over the §4.5 REVOKE baseline.** A
  migration that adds a table without RLS is a defect, caught by T4-AC-02.
- **`text('col', { enum: [...] })` in Drizzle is a TypeScript-only constraint.**
  It narrows the inferred type and **emits no DDL** — Postgres will accept any
  text. Migration 0000 shipped four such columns (`memberships.role`,
  `organizations.plan`, `dispatch_sessions.status`, `session_events.type`) with
  no database-level enforcement; a test wrote `role = 'superuser'` successfully.
  Fixed in `20260801193005_enum_check_constraints.sql`.
  **Every enum-typed column must get a matching `CHECK` in the hand-edit step**
  (§6.5 step 3). Prefer `CHECK` over a native enum type: adding a value to a
  CHECK is one `ALTER`, whereas `ALTER TYPE … ADD VALUE` cannot run inside a
  transaction and cannot be reversed.
- **Drizzle is canonical; drizzle-kit generates, Supabase CLI applies.** No
  `drizzle-kit push`. No Studio schema edits.
- **service_role never leaves server-side code.** `lib/supabase/admin.ts` is the
  only module permitted to read it.
- **Every `app/api` handler calls a guard as its first statement** (T4-AC-09).
  Guards throw; they never return a falsy value a caller might ignore.
- **Local mode owes nothing to this TRD.** `devpilot` must run with no bridge, no
  account, and no network (T4-AC-10).

*TRD 04 · v1.0 · August 2026 · DRAFT*
