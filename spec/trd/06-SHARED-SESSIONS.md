# TRD 06 — Shared Agent Sessions
## Cross-Machine Agent Coordination · End-to-End Encrypted Transcripts · Join Links · MCP Bridge
### v1.0 · August 2026 · Status: DRAFT

> **Depends on:** `04-HOSTED-ACCOUNTS.md` (orgs, guards, tokens, RLS baseline) and
> `05-HOSTED-BRIDGE.md` (queue, Realtime transport, protocol package). Both
> shipped. This TRD extends them rather than replacing anything.
>
> **Repo split:** `devpilot-website` owns schema, routes and portal UI.
> `devpilot` owns the protocol additions, the MCP server, and CLI commands.
> No task touches both.
>
> This TRD owns the tables `shared_sessions`, `session_participants`,
> `session_messages`, and the npm package `@devpilot.sh/mcp-session`.

---

## 1. Problem Statement & Goals

### 1.1 Problem

Two engineers are working the same incident. Each has a coding agent running
locally — Claude Code on one laptop, Codex or `ao` on the other. Today the only
way those agents share context is a human copy-pasting agent output into Slack
and pasting the reply back.

That is bad in four specific ways:

1. **The transcript is lossy.** People paste the interesting half. The agent on
   the other side reasons from a summary of a summary.
2. **There is no shared state.** Neither agent knows what the other has already
   tried, so they duplicate work and contradict each other.
3. **It does not scale past two people.** A third participant means someone is
   manually fanning out.
4. **Nothing is durable.** The reasoning that produced a change lives in a Slack
   scrollback, not next to the ticket.

DevPilot already routes *work* to machines (TRD 05). It does not let the agents
on those machines *talk to each other*.

### 1.2 Goals

1. A **shared session**: an append-only, ordered transcript that multiple
   participants — humans and agents, on different machines, in different
   organizations — read and write.
2. A **join link** (`devpilot.sh/s/<id>#k=<key>`) that admits a participant with
   no prior setup.
3. **End-to-end encryption.** The hosted plane relays ciphertext and cannot read
   message content. This preserves the claim the product is built on.
4. **An MCP bridge** so Claude Code can join a session as a first-class
   participant without DevPilot driving the agent.
5. **A human gate by default.** Agents do not autonomously converse without an
   explicit, budgeted opt-in.
6. Linear remains the system of record: a shared session can be attached to an
   issue, and its outcome summarised back.

### 1.3 Non-Goals

- Real-time collaborative editing of files. This is a message bus, not a CRDT.
- Running agents in the cloud. TRD 05 §1.3 still holds and is not negotiable.
- Cross-org discovery. A session is reachable only by link.
- Replacing Slack. The transcript is the artifact; notification lives elsewhere.
- Key escrow or recovery. Lose the link, lose the transcript (§4.4).

---

## 2. Current State (file-cited)

| Area | File | State |
|---|---|---|
| Session model | `lib/db/schema/sessions.ts` | `dispatchSessions` is **1 Linear issue → 1 orchestrator**. No concept of multiple participants |
| Event log | same, `sessionEvents` | Already an append-only ordered log per session — the right shape, but server-readable and single-writer |
| Transport | `lib/db/schema/queue.ts` + migration `20260802014829` | Realtime publication + RLS-scoped channel per orchestrator. Fan-out exists; it is addressed to one machine |
| Crypto | `lib/bridge/crypto.ts` | AES-256-GCM with authenticated failure. **Server-side key** (`BRIDGE_ENCRYPTION_KEY`) — the wrong model for E2E (§4.4) |
| Tenancy | `lib/db/schema/accounts.ts` | Orgs + memberships + revocable tokens. A session spanning two orgs has no home yet |
| Protocol | `packages/bridge-protocol` | Published wire contract. Message types are dispatch-shaped, not conversation-shaped |
| Agent integration | `packages/cli/src/commands/bridge/dispatch-handler.ts` | DevPilot *drives* the agent. Nothing lets an agent *volunteer* into a conversation |

---

## 3. Architecture

### 3.1 The shape

```
  Alice's laptop                 devpilot.sh                 Bob's laptop
  ──────────────                 ───────────                 ────────────
  Claude Code                                                Claude Code
      │                                                          │
      │ MCP tools                                       MCP tools │
      ▼                                                          ▼
  @devpilot.sh/mcp-session                       @devpilot.sh/mcp-session
      │                                                          │
      │  POST /api/sessions/:id/messages  (CIPHERTEXT)            │
      └──────────────────────────▶ ┌──────────────┐ ◀────────────┘
                                   │ session_     │
         Realtime (ciphertext) ◀── │ messages     │
                                   └──────────────┘
                                    server stores bytes
                                    it cannot decrypt

  key k lives ONLY in the URL fragment: devpilot.sh/s/<id>#k=<key>
  browsers never transmit fragments; the server never receives k
```

### 3.2 What the server can and cannot see

This is the load-bearing table for the whole design. It must stay accurate.

| Server sees | Server cannot see |
|---|---|
| session id, title (optional, plaintext by choice) | message content |
| participant ids, display names, join/leave times | file paths, diffs, error output |
| message count, size, ordering, timestamps | which files were touched |
| which org owns the session | agent reasoning |

Traffic analysis is possible and we should say so rather than imply perfect
privacy: message *sizes and timing* leak activity patterns. What does not leak
is content.

### 3.3 Turn discipline — DECISION A

**Agents do not autonomously converse by default.** A message from an agent
lands in the transcript; it does not automatically wake the other agent.

Three modes, per session:

| Mode | Behaviour | Default |
|---|---|---|
| `observe` | Agents read the transcript when asked. Humans relay. | ✅ |
| `relay` | An agent is notified on new messages but must be prompted to act | opt-in |
| `auto` | Agents respond to each other automatically, bounded by a budget | opt-in, per session, expires |

`auto` carries a hard **message budget** (default 20) and a **wall-clock TTL**
(default 30 min). Exhausting either drops the session back to `observe` and
posts a system message saying so.

**Why this is the default rather than `auto`:** two agents replying to each
other is an unbounded token spend and a plausible route to a bad change landing
unsupervised at 3am. The interesting product is *shared context*, which
`observe` already delivers in full. Autonomy is a separate, riskier feature and
should be opted into deliberately with a bound on the blast radius.

### 3.4 Trust model of the link — DECISION B

**Anyone with the full link can read the transcript.** The key is in the
fragment; possession is authorisation. This is the Google-Docs-link model, and
it is the right one here because participants are frequently in different orgs
and pre-provisioning them would kill the use case.

Consequences we state plainly rather than paper over:

- Pasting the full link into a public channel exposes the transcript to that
  channel. The UI must say this at copy time, not in a footnote.
- Revocation is **rotation**: `POST /rotate` re-keys the session, and old links
  stop decrypting new messages. Prior messages remain readable to whoever
  already had the old key — we cannot unsee.
- The server can enumerate *that* a session exists, never its content.

---

## 4. Data Model

New file `lib/db/schema/shared-sessions.ts`.

### 4.1 `shared_sessions`

```typescript
export const sharedSessions = pgTable('shared_sessions', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  /** Owning org. Participants may be from elsewhere; billing/limits land here. */
  orgId: text('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  /** Plaintext BY CHOICE — shown in the portal list. Never put secrets here. */
  title: text('title').notNull(),
  /** Optional link to the system of record. */
  linearIssueId: text('linear_issue_id'),
  linearIdentifier: text('linear_identifier'),
  /** §3.3. Anything but 'observe' is time- and budget-bounded. */
  mode: text('mode', { enum: ['observe', 'relay', 'auto'] }).notNull().default('observe'),
  autoBudgetRemaining: integer('auto_budget_remaining').notNull().default(0),
  autoExpiresAt: timestamp('auto_expires_at', { withTimezone: true }),
  /**
   * SHA-256 of the join key. Lets the server verify a joiner holds the key
   * WITHOUT being able to derive it — the key itself never reaches us.
   */
  joinKeyHash: text('join_key_hash').notNull(),
  /** Bumped by rotation; old links fail the hash check. */
  keyVersion: integer('key_version').notNull().default(1),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

### 4.2 `session_participants`

```typescript
export const sessionParticipants = pgTable('session_participants', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  sessionId: text('session_id').notNull()
    .references(() => sharedSessions.id, { onDelete: 'cascade' }),
  /** 'human' | 'agent'. An agent participant is bound to an orchestrator. */
  kind: text('kind', { enum: ['human', 'agent'] }).notNull(),
  /** Null for participants from outside the owning org — link-only access. */
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  orchestratorId: text('orchestrator_id').references(() => orchestrators.id, { onDelete: 'set null' }),
  /** What the transcript shows. Chosen by the joiner; not authenticated. */
  displayName: text('display_name').notNull(),
  /** Which agent, when kind='agent': claude-code | codex | ao | other. */
  agentKind: text('agent_kind'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  leftAt: timestamp('left_at', { withTimezone: true }),
}, (t) => ({ bySession: index('session_participants_session_idx').on(t.sessionId) }));
```

### 4.3 `session_messages`

```typescript
export const sessionMessages = pgTable('session_messages', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  sessionId: text('session_id').notNull()
    .references(() => sharedSessions.id, { onDelete: 'cascade' }),
  participantId: text('participant_id')
    .references(() => sessionParticipants.id, { onDelete: 'set null' }),
  /**
   * AES-256-GCM ciphertext, base64(iv).base64(ct).base64(tag) — the same format
   * as lib/bridge/crypto.ts, but the key is HELD BY PARTICIPANTS, never by us.
   * The server treats this as opaque bytes.
   */
  ciphertext: text('ciphertext').notNull(),
  /** Which key version encrypted this, so rotation does not orphan history. */
  keyVersion: integer('key_version').notNull().default(1),
  /**
   * PLAINTEXT and deliberately coarse: 'chat' | 'agent_output' | 'system'.
   * Enough for the UI to render and for rate limits to work, not enough to
   * reveal content.
   */
  kind: text('kind', { enum: ['chat', 'agent_output', 'system'] }).notNull().default('chat'),
  /** Monotonic per session. The client orders by this, not by clock. */
  seq: integer('seq').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqSeq: unique('session_messages_seq_uniq').on(t.sessionId, t.seq),
  bySession: index('session_messages_session_seq_idx').on(t.sessionId, t.seq),
}));
```

### 4.4 Key handling — why not reuse `BRIDGE_ENCRYPTION_KEY`

`lib/bridge/crypto.ts` encrypts *with a server-held key*, which is right for
Linear credentials the server must use, and **wrong here**: a server-held key
means the server can read the transcript, which defeats the entire point.

So:

- The key is generated **client-side** at session creation
  (`crypto.getRandomValues`, 32 bytes, base64url).
- It is placed in the URL **fragment**. Browsers do not transmit fragments, so
  it never reaches our logs, our proxies, or our database.
- The server stores only `sha256(key)` to verify a joiner has it.
- `packages/bridge-protocol` gains `sessionCrypto` — the *same* AES-256-GCM
  format, but taking the key as a parameter, so the CLI, the MCP server and the
  browser all encrypt identically.

**Rotation** (`POST /api/sessions/:id/rotate`) generates a new key, increments
`keyVersion`, and returns a new link. Old messages keep their old `keyVersion`
and stay readable to holders of the old key. This is honest: rotation stops
future leakage, it does not retract past access.

---

## 5. API Surface

`devpilot-website/app/api/`. Every handler calls a guard first (TRD 04 §6.4).

| Route | Auth | Behaviour |
|---|---|---|
| `POST /api/sessions/shared` | session | Create. Body carries `joinKeyHash` (client-computed); the key itself is never sent |
| `GET /api/sessions/shared` | session | Sessions for the caller's org. Titles only |
| `GET /api/sessions/shared/:id` | **join proof** | Metadata + participants. Requires `X-Session-Key-Proof` |
| `POST /api/sessions/shared/:id/join` | join proof | Register a participant, return a participant token |
| `GET /api/sessions/shared/:id/messages` | participant token | Ciphertext page, `?since=<seq>` |
| `POST /api/sessions/shared/:id/messages` | participant token | Append. Server assigns `seq` |
| `POST /api/sessions/shared/:id/mode` | session, org member | Set mode; `auto` requires budget + TTL |
| `POST /api/sessions/shared/:id/rotate` | session, org member | Re-key |
| `POST /api/sessions/shared/:id/close` | session, org member | Close to further messages |

**Join proof** is `HMAC-SHA256(key, sessionId)` sent in a header — it proves
possession of the key without transmitting it. The server recomputes against
`joinKeyHash`… which it cannot, since it holds only the hash. So the proof is
instead: the client sends `sha256(key)`, the server compares to `joinKeyHash` in
constant time. That reveals the hash to the server, which is already stored, and
never the key.

**Participant tokens** are short-lived JWTs scoped to one session, minted at
join. They keep message routes off the org-membership path entirely, which is
what lets an outside collaborator participate.

**Rate limits are mandatory here**, not aspirational: a shared session is
write-heavy and reachable by anyone with a link. Per participant, per session:
default 60 messages/minute and 256 KB/message.

---

## 6. Core Components

### 6.1 `packages/bridge-protocol` additions

```typescript
export const SessionMessageSchema = z.object({
  id: z.string(), sessionId: z.string(), participantId: z.string().nullable(),
  ciphertext: z.string(), keyVersion: z.number().int(),
  kind: z.enum(['chat', 'agent_output', 'system']),
  seq: z.number().int(), createdAt: z.string().datetime(),
});

/** Same AES-256-GCM format as lib/bridge/crypto.ts, key supplied by the caller. */
export const sessionCrypto: {
  generateKey(): string;                                   // 32B base64url
  keyFingerprint(key: string): string;                     // sha256 hex
  encrypt(plain: string, key: string): string;
  decrypt(payload: string, key: string): string;           // throws on tamper
};
```

Runs in Node **and** the browser, so it uses WebCrypto with a Node fallback —
one implementation, three consumers.

### 6.2 `packages/mcp-session` (new, published)

An MCP server any Claude Code session can load:

```
devpilot_session_join     (url)              join via the link
devpilot_session_read     (since?)           recent transcript, decrypted locally
devpilot_session_post     (message)          append, encrypted locally
devpilot_session_who      ()                 current participants
```

**The agent chooses when to look.** DevPilot does not drive it — the tools are
available the way a file read is available. That keeps the invariant intact and
means no changes to Claude Code itself.

The key is read from the link and held in process memory only; it is never
written to disk and never sent to devpilot.sh.

### 6.3 CLI

```
devpilot session new "Fixing the checkout 500s"   → prints the join link
devpilot session join <url>                       → attaches this machine
devpilot session tail <url>                       → live transcript in the terminal
```

`session new` prints the link **with a warning** that anyone holding it can read
the transcript.

---

## 7. Security Requirements

These are gates, not preferences.

1. **The key never reaches the server.** No route accepts it; no log line can
   contain it. A test asserts the string never appears in any request body or
   query across the suite.
2. **RLS on all three tables**, in the creating migration, over the §4.5
   REVOKE baseline (TRD 04). `session_messages` is service-role-write only;
   participants read via their scoped token, not via org membership.
3. **Ciphertext columns are never rendered server-side.** Extend
   `scripts/check-secret-columns.mjs` to cover `session_messages.ciphertext` —
   an RSC payload containing it would be a leak even though it is encrypted,
   because it pairs ciphertext with metadata.
4. **Rate limits enforced server-side**, per participant and per session.
5. **`auto` mode is bounded** by budget and TTL, enforced server-side, and
   drops to `observe` on exhaustion.
6. **The marketing claim must be updated in the same change** as this ships.
   "Your source code never leaves your machine" becomes precise: the hosted
   plane relays end-to-end encrypted transcripts it cannot read. Shipping the
   feature without the copy change would make the site untrue.

---

## 8. Testing Strategy

**8.1 Crypto round-trip** — encrypt in Node, decrypt in the browser build, and
vice versa. One format, three consumers, or the product silently splits.

**8.2 Server blindness** — the highest-value test. Seed a session, post
messages, then assert that **no server-side query can recover the plaintext**:
`session_messages.ciphertext` decrypts only with the client key, and the key is
absent from every table.

**8.3 Join proof** — wrong key → 401; right key → participant token; rotated
session → old proof 401.

**8.4 Ordering** — concurrent posts from three participants produce a strict
`seq` with no gaps or duplicates (real database, like TRD 05 §9.5).

**8.5 Budget** — `auto` stops at the message cap and at TTL, and posts the
system message announcing it.

**8.6 Rate limits** — a participant exceeding the cap gets 429 and is not
recorded.

**8.7 MCP bridge** — join, post, read against a live session; assert the key
never appears in any outbound request.

**8.8 Cross-org** — a participant with no membership in the owning org can join
by link and post, and can read *nothing else* in that org.

---

## 9. Acceptance Criteria

- **T6-AC-01** A session created in one browser can be joined from a different
  browser, on a different machine, using only the link.
- **T6-AC-02** `sha256(key)` is stored; the key appears in no table, no log, and
  no request body. Asserted by test, not by inspection.
- **T6-AC-03** A message posted by Alice's agent is readable by Bob's agent, and
  the server cannot produce the plaintext of either.
- **T6-AC-04** A participant outside the owning org can post to the session and
  read nothing else belonging to that org.
- **T6-AC-05** Default mode is `observe`; agents do not post unprompted.
- **T6-AC-06** `auto` stops at its budget and at its TTL, dropping to `observe`
  with a system message.
- **T6-AC-07** Rotation issues a new link; the old proof 401s; pre-rotation
  messages remain readable with the old key.
- **T6-AC-08** Rate limits return 429 and record nothing.
- **T6-AC-09** `seq` is strictly increasing with no gaps under concurrent posts.
- **T6-AC-10** Claude Code joins via MCP, posts, and reads — with no change to
  Claude Code itself.
- **T6-AC-11** `check-secret-columns` covers `ciphertext`; no server component
  renders it.
- **T6-AC-12** The marketing security section is updated in the same PR and is
  accurate about what the server can see (§3.2).

---

## 10. Implementation Plan

Wave protocol per `00-PROGRAM-OVERVIEW.md` §2.2.

### Wave 1 — Protocol & crypto (public repo; independent)

| ID | Title | Repo | Files | Cx | Done-check |
|---|---|---|---|---|---|
| T6-W1-T1 | `sessionCrypto` | devpilot | `packages/bridge-protocol/src/session-crypto.ts` | M | §8.1 passes in Node and browser builds |
| T6-W1-T2 | Message schemas | devpilot | `packages/bridge-protocol/src/messages.ts` | S | Round-trip tests |

### Wave 2 — Schema & RLS (website)

| ID | Title | Files | Cx | Done-check |
|---|---|---|---|---|
| T6-W2-T1 | Three tables | `lib/db/schema/shared-sessions.ts` | M | Typechecks |
| T6-W2-T2 | Migration + RLS + policies | `supabase/migrations/*` | L | pgTAP; §8.2 |
| T6-W2-T3 | Extend ciphertext gate | `scripts/check-secret-columns.mjs` | S | T6-AC-11 |

### Wave 3 — Routes (website)

| ID | Title | Files | Cx | Done-check |
|---|---|---|---|---|
| T6-W3-T1 | Create/list/get | `app/api/sessions/shared/**` | M | Guards pass |
| T6-W3-T2 | Join + participant tokens | `.../[id]/join` | M | §8.3 |
| T6-W3-T3 | Messages + `seq` | `.../[id]/messages` | L | §8.4 |
| T6-W3-T4 | Mode/rotate/close | `.../[id]/{mode,rotate,close}` | M | §8.5, T6-AC-07 |
| T6-W3-T5 | Rate limits | `lib/sessions/rate-limit.ts` | M | §8.6 |

### Wave 4 — Clients (public repo)

| ID | Title | Files | Cx | Done-check |
|---|---|---|---|---|
| T6-W4-T1 | `@devpilot.sh/mcp-session` | `packages/mcp-session/**` | L | §8.7, T6-AC-10 |
| T6-W4-T2 | CLI `session` commands | `packages/cli/src/commands/session/**` | M | Manual round trip |

### Wave 5 — Portal, docs, copy

| ID | Title | Repo | Files | Cx | Done-check |
|---|---|---|---|---|---|
| T6-W5-T1 | Session UI + join page | website | `app/(dashboard)/sessions/shared/**`, `app/s/[id]/**` | L | T6-AC-01 |
| T6-W5-T2 | Copy-link warning | website | same | S | §3.4 stated at copy time |
| T6-W5-T3 | **Marketing accuracy** | website | `components/code-quality-section.tsx` | S | **T6-AC-12 — ships in the same PR** |
| T6-W5-T4 | Docs | both | `docs/SHARED-SESSIONS.md` | M | §3.2 table published |

---

### Decisions other TRDs must respect

- **The server never holds a session key.** Any future feature needing
  server-side reads of a transcript is a new design, not an extension.
- **`observe` is the default mode.** Autonomy is opt-in, bounded, and expiring.
- **Possession of the link is authorisation.** Do not add silent org-based
  access on top; it would make the security model two things at once.
- **Ciphertext is never rendered server-side**, encrypted or not.
- The invariant from TRD 05 stands: **agents run locally.**

*TRD 06 · v1.0 · August 2026 · DRAFT*
