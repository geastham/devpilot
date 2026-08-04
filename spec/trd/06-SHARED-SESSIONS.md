# TRD 06 — Shared Agent Sessions
## Cross-Machine Agent Coordination · End-to-End Encrypted Transcripts · Join Links · MCP Bridge
### v1.5 · August 2026 · Status: COMPLETE

> **Change log — v1.5 (4 Aug 2026)**
> - Wave 5 complete. **TRD 06 is done.**
> - §8.1 GENUINELY SATISFIED: `sessionCrypto` verified in a real Chrome engine,
>   both directions — Node encrypt → browser decrypt, browser encrypt → Node
>   decrypt. Waves 1–4 could only assert this statically.
> - T6-AC-12 satisfied, and wider than written: the FAQ and hero carried the
>   same claim in stronger form and were corrected too.
> - Wave 4's duplicate-participant gap closed via expired-token resume.

> **Change log — v1.4 (4 Aug 2026)**
> - Wave 4 complete: `@devpilot.sh/mcp-session` and `devpilot session …`.
>   T6-AC-10 proven against the live platform, not simulated.
> - §5 create route now accepts a MACHINE TOKEN as well as a browser session.
>   `devpilot session new` runs on a laptop, which has no cookie — the spec
>   described a command that could not be built.
> - §6.1 `SharedSessionSchema` gains `lastSeq`, which the Wave 3 route had been
>   returning for a full wave without the contract declaring it.
> - New known gap: re-joining creates a duplicate participant row (§6.3).

> **Change log — v1.3 (3 Aug 2026)**
> - Wave 3 complete: seven routes, participant tokens, rate limits. Verified
>   against a live deployment over HTTPS, not only in-process.
> - **T6-AC-07 REWRITTEN.** Rotation ends access for the old key. Option (a) —
>   keeping superseded verifiers alive for read-only history — was rejected
>   because it would have defeated the only revocation mechanism the design has.
> - §3.2 corrected: server-authored `system` messages are PLAINTEXT. The server
>   cannot encrypt, so it could never have been otherwise; the table now says so.
> - §5 participant tokens are signed with a key derived from
>   BRIDGE_ENCRYPTION_KEY, not SUPABASE_JWT_SECRET. Rationale in §5.
> - Rate limits are counted from `session_messages` itself, exactly.

> **Change log — v1.2 (3 Aug 2026)**
> - Wave 2 complete: three tables, RLS, policies, `seq` trigger, ciphertext
>   gate. Applied live and replayed from zero. §10 records the deviations.
> - §4.1 gains `last_seq`, §4.3 gains `client_nonce` — both forced by
>   acceptance criteria the original schema could not satisfy.
> - `seq` is assigned by trigger and client values are discarded.
> - DECISION A is now a CHECK constraint: unbounded `auto` is unrepresentable.
> - Realtime deliberately not extended; polling is the correct path (TRD 05 §4.2).

> **Change log — v1.1 (3 Aug 2026)**
> - Decisions A (§3.3, `observe` default) and B (§3.4, fragment-only key)
>   **confirmed**. Both are now binding on later waves.
> - §5 join proof **corrected**: `sha256(key)` made the stored column directly
>   replayable. Replaced by an HKDF split with separate content and verify
>   branches. Shipped in Wave 1.
> - §6.1 `sessionCrypto` is **async** and has no Node fallback. Rationale inline.
> - §4.4 rotation: **open issue** raised — T6-AC-07 is unsatisfiable as written.
>   Must be resolved in Wave 3.
> - Wave 1 complete; §10 records what is and is not proven.

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

**One correction, added in Wave 3.** Messages of kind `system` are PLAINTEXT and
the server can read them. It has to be that way: T6-AC-06 requires the server to
announce that `auto` has exhausted its budget or TTL, and the server holds no
session key, so it cannot produce ciphertext. These notices are stored with a
`system:` prefix that cannot be confused with the `iv.ct.tag` format, they
contain nothing but a mode transition and its cause, and a participant who tries
to post one gets a 400. Every message a PARTICIPANT writes remains opaque — but
"the server cannot read the transcript" is now precise rather than absolute, and
the marketing copy (§7.6, T6-AC-12) must match this wording, not the old one.

### 3.3 Turn discipline — DECISION A ✅ CONFIRMED 2026-08-03

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

### 3.4 Trust model of the link — DECISION B ✅ CONFIRMED 2026-08-03

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
  /**
   * ADDED IN WAVE 2. Monotonic counter backing session_messages.seq, bumped by
   * trigger inside the inserting transaction. A SEQUENCE cannot be used —
   * nextval() is non-transactional and leaves gaps, and T6-AC-09 says no gaps.
   */
  lastSeq: integer('last_seq').notNull().default(0),
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
  /**
   * Monotonic per session. The client orders by this, not by clock.
   *
   * ASSIGNED SERVER-SIDE, INSIDE THE INSERTING TRANSACTION — never read-then-
   * write, and never supplied by the client (PostSessionMessageRequestSchema is
   * `.strict()` and has no `seq`, so an invented one is a 400). A SELECT max(seq)
   * followed by an INSERT is exactly the race §8.4 exists to catch, and it is
   * the same discipline TRD 05 applied to enqueueDispatch. The unique index
   * below is the backstop, not the mechanism.
   *
   * SHIPPED IN WAVE 2 as a BEFORE INSERT trigger over shared_sessions.last_seq.
   * The trigger DISCARDS any client-supplied value, so choosing your own place
   * in the transcript is impossible rather than merely refused. The `.default(0)`
   * exists only so inserts may omit the column; it is never observed.
   */
  seq: integer('seq').notNull().default(0),
  /**
   * ADDED IN WAVE 2. Client-supplied idempotency key, unique per session where
   * present. The transport is at-least-once, so a POST retried after a timeout
   * must not double-post — and only the client knows two requests were one
   * intent.
   */
  clientNonce: text('client_nonce'),
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

> **RESOLVED IN WAVE 3 — option (b).** As specified, `shared_sessions` holds
> exactly one `joinKeyHash`, so after rotation a holder of only the old key
> cannot authenticate and therefore cannot *fetch* the pre-rotation ciphertext
> T6-AC-07 said they could still read.
>
> The choice was between (a) keeping superseded verifiers valid for read-only
> requests bounded to the rotation seq, and (b) accepting that rotation ends
> access outright.
>
> **(b), and not merely because it is simpler.** Rotation is the ONLY revocation
> mechanism this design has, and the reason anyone reaches for it is that a link
> leaked. Option (a) would have left the leaked credential able to fetch the
> entire pre-rotation transcript — which is not revocation, so (a) would have
> defeated the feature rather than softened it.
>
> Rotation therefore cuts the old link off from the server completely: the old
> verifier stops matching, and every outstanding participant token carries the
> old `key_version` and is rejected on its next request. What rotation still
> cannot do is retract bytes someone already downloaded. That is stated below
> and remains true.

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

**Join proof** — *corrected in Wave 1; the original text is preserved below
because the reasoning matters.*

> ~~`HMAC-SHA256(key, sessionId)` sent in a header — it proves possession of the
> key without transmitting it. The server recomputes against `joinKeyHash`…
> which it cannot, since it holds only the hash. So the proof is instead: the
> client sends `sha256(key)`, the server compares to `joinKeyHash` in constant
> time.~~

That fallback is wrong, and wrong in a way worth naming: the value stored in the
database is the same value the wire accepts, so `joinKeyHash` is **directly
replayable**. A leaked backup, or anyone with read access to the table, could
join any session. It is the store-the-password-verbatim mistake. It also made
§7.1 false: `sha256(key)` is a function of the key, sent on every request.

The shipped scheme splits one root secret into two independent HKDF branches:

```
k            32 random bytes, base64url — the fragment value, never sent
 ├─ HKDF(k, salt="devpilot-session/v1", info="dp-session-content/v1") ──▶ encKey
 └─ HKDF(k, salt="devpilot-session/v1", info="dp-session-verify/v1")  ──▶ joinVerifier
                                                     │
                                                     └─ sha256 ──▶ joinKeyHash  (stored)
```

- **Create** sends `joinKeyHash` only.
- **Join** sends `joinVerifier` in `X-Session-Key-Proof`; the server hashes it
  and compares to the stored `joinKeyHash` in constant time.
- A database read yields `sha256(verifier)`, which cannot join and cannot
  decrypt. The verifier is a different branch from the content key, so the
  server — which receives the verifier on every join — can never derive
  plaintext from it. `sessionCrypto` has a test asserting exactly that.

Same UX, same single secret in the fragment, no extra round trip.

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
  generateKey(): string;                                          // 32B base64url
  deriveJoinCredentials(key: string): Promise<JoinCredentials>;    // { verifier, joinKeyHash }
  hashJoinVerifier(verifier: string): Promise<string>;             // server-side half
  verifyJoinProof(verifier: string, storedHash: string): Promise<boolean>;  // constant-time
  encrypt(plain: string, key: string): Promise<string>;
  decrypt(payload: string, key: string): Promise<string>;          // throws on tamper
  open(key: string): Promise<SessionCipher>;                       // derive once, reuse
};

export function buildJoinLink(baseUrl: string, sessionId: string, key: string): string;
export function parseJoinLink(link: string): { sessionId: string; key: string };
```

Runs in Node **and** the browser. Two corrections to the sketch above, both made
while building Wave 1:

**The API is async.** SubtleCrypto is promise-returning throughout, and
WebCrypto is the only AES implementation present in both Node 18+ and the
browser. The alternatives were a Node/browser split — two implementations, the
exact drift TRD 05 deleted `packages/bridge` to prevent — or a hand-rolled AES
in JS. One async implementation, three consumers.

**`keyFingerprint` is replaced by `deriveJoinCredentials`**, per the §5
correction: `sha256(key)` was never safe to use as a join proof.

There is no Node fallback and no platform branching anywhere in the module,
including base64: the encoders are hand-rolled so the CLI and the browser cannot
produce different bytes. A test asserts the compiled module references no
`Buffer`, no `node:` import, and no `process`, and round-trips with those
globals deleted.

**Wave 1 file layout.** The session schemas live in
`packages/bridge-protocol/src/session-messages.ts`, not in the existing
`messages.ts`, which is dispatch-shaped: one issue, one orchestrator,
server-readable. Keeping the conversation schemas separate keeps visible the one
distinction a reader most needs — which payloads the server can read and which
it cannot.

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
- **T6-AC-07** *(rewritten in v1.3 — the original was unsatisfiable, see §4.4)*
  Rotation issues a new link and **ends access for the old one**: the old proof
  is rejected, and every outstanding participant token is invalidated on its
  next request. Pre-rotation messages remain in the transcript under their old
  `keyVersion` — still undecryptable by a holder of only the new key, and still
  decryptable by anyone who retained the old one *and already has the bytes*.
  Rotation stops future access; it does not unsee.
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

### Wave 1 — Protocol & crypto (public repo; independent) ✅ COMPLETE

| ID | Title | Repo | Files | Cx | Done-check |
|---|---|---|---|---|---|
| T6-W1-T1 | `sessionCrypto` | devpilot | `packages/bridge-protocol/src/session-crypto.ts` | M | ✅ §8.1 — 47 tests |
| T6-W1-T2 | Message schemas | devpilot | `packages/bridge-protocol/src/session-messages.ts` | S | ✅ 41 tests |

Gates green: `typecheck | lint | test | build`, 148 tests (was 60). The built
ESM bundle was executed directly, not just compiled — golden vector, join proof,
replay rejection and link round-trip all verified against `dist/`.

**Proven in Wave 1**

- Round-trip across ASCII, unicode, empty, and 200 KB payloads.
- Wrong key and tampering in any of the three ciphertext parts throw
  `SessionDecryptionError` — no garbage returns.
- No IV reuse across 50 encryptions of identical plaintext under one key.
- The verifier the server receives **cannot decrypt** — the load-bearing
  assertion behind §3.2.
- Replaying the stored `joinKeyHash` as a proof **fails**; regression guard for
  the §5 defect.
- Golden vectors pin both HKDF branches, so a change to the salt or info strings
  fails here rather than in production as an undecryptable message.

**Not proven in Wave 1 — stated rather than implied**

- **Execution in a real browser engine.** jsdom has no SubtleCrypto, so a jsdom
  run would fail for reasons unrelated to this code and prove nothing. The
  browser guarantee is currently *static*: the compiled module references no
  `Buffer`, no `node:` import and no `process`, and round-trips with those
  globals deleted. T6-W5-T1's join page is the first consumer that runs it in a
  browser for real, and §8.1 is only genuinely satisfied there.
- Nothing on the server exists yet, so §8.2 (server blindness) is asserted at
  the schema boundary only — `.strict()` rejects a key-bearing create request.
  The database half is Wave 2.

### Wave 2 — Schema & RLS (website) ✅ COMPLETE

| ID | Title | Files | Cx | Done-check |
|---|---|---|---|---|
| T6-W2-T1 | Three tables | `lib/db/schema/shared-sessions.ts` | M | ✅ |
| T6-W2-T2 | Migration + RLS + policies | `supabase/migrations/20260803194850_*` | L | ✅ 35 pgTAP (was 18); §8.2 |
| T6-W2-T3 | Extend ciphertext gate | `scripts/check-secret-columns.mjs` | S | ✅ T6-AC-11 |

Gates green: `typecheck | lint | check:guards | check:secrets | test | test:db | check:drift`.
258 vitest tests (was 218), 35 pgTAP (was 18). Migration applied to the live
project and replayed from zero locally, so the ledger is known complete.

**Three schema additions not in §4:**

- `shared_sessions.last_seq` — the counter backing `session_messages.seq`.
  Required by T6-AC-09, which asks for *no gaps*. That rules out a Postgres
  SEQUENCE, whose `nextval()` is deliberately non-transactional and burns a
  number on every rollback. It also cannot be done from the route layer without
  the read-then-write race §8.4 exists to catch.
- `session_messages.client_nonce` — unique per session where present. The
  transport is at-least-once, so a POST retried after a timeout must not
  double-post, and only the client knows two requests were one intent.
- CHECK constraints for every "enum" column. `text('col', { enum: [...] })` is
  TypeScript-only and emits no DDL — the lesson of migration `20260801193005`,
  where four columns the app treated as closed sets accepted arbitrary text.

**`seq` is assigned by trigger, not by the route.** A BEFORE INSERT trigger
bumps `last_seq` with `UPDATE … RETURNING` inside the caller's transaction: the
row lock serialises concurrent posters and a rollback returns the number. The
trigger *discards* whatever `seq` the caller supplied, so a client cannot choose
its position in the transcript even if a future route forgets to strip the
field. It also refuses appends to a closed session and posts under a superseded
`key_version` — a stale client would otherwise write a message nobody can
decrypt, a silent hole in the transcript.

**DECISION A is enforced by a CHECK, not by a handler.** `mode = 'auto'` without
both a budget and an expiry is unrepresentable in the database. Combined with
Wave 1's schema refinement, an unbounded autonomous session cannot be
constructed at either layer.

**The §7.3 gate is path-based, not a blanket ban.** Forbidding the identifier
`ciphertext` outright would make the product unimplementable: the transcript API
*must* return it and the browser *must* receive it, because the key is in the
fragment and decryption is client-side. The rule is about which path carries it
— permitted on the participant-token API and in client components, forbidden in
anything server-rendered. A server component renders for a viewer authorised by
org membership rather than by possession of the key, so an RSC payload carrying
a transcript would hand it to an admin who never had the link, quietly turning
§3.4 into "link OR org", which §10 forbids in those words.

`check-secret-columns.mjs` also now covers `join_key_hash`, and has 17 fixtures
of its own asserting it actually fires — a control nobody has watched fail is
indistinguishable from one that cannot, which is the shape of the `|| true`
defect this program already paid for once.

**Realtime deliberately untouched.** TRD 05 §4.2 asserts the publication is
exactly `dispatch_queue` and `dispatch_sessions`. Wave 2 adds nothing to it, for
the reason TRD 05 made the queue table the delivery guarantee: Realtime is a
latency optimisation, `SUPABASE_JWT_SECRET` is still unset, and it has never
connected in this project. `GET /messages?since=<seq>` is fully correct without
it. A test pins the publication membership so adding one stays an explicit act.

**Not proven in Wave 2.** No route exists yet, so the participant token is
modelled in pgTAP by setting the JWT claim directly. That `shared_session_id`
claim is only as good as the Wave 3 minting code that sets it, and nothing here
verifies that code — because it does not exist. Rate limits (§5) are likewise
Wave 3: the database caps message *size*, not rate.

### Wave 3 — Routes (website) ✅ COMPLETE

| ID | Title | Files | Cx | Done-check |
|---|---|---|---|---|
| T6-W3-T1 | Create/list/get | `app/api/sessions/shared/**` | M | ✅ |
| T6-W3-T2 | Join + participant tokens | `.../[id]/join` | M | ✅ §8.3 |
| T6-W3-T3 | Messages + `seq` | `.../[id]/messages` | L | ✅ §8.4 |
| T6-W3-T4 | Mode/rotate/close | `.../[id]/{mode,rotate,close}` | M | ✅ §8.5, T6-AC-07 |
| T6-W3-T5 | Rate limits | `lib/sessions/rate-limit.ts` | M | ✅ §8.6 |

305 vitest tests (was 258), 35 pgTAP. All gates green. Verified against a live
Vercel deployment over HTTPS with `tests/harness/run-shared-session.mjs`, which
drives the real routes with the real `sessionCrypto` as the client — the
in-process suite proves the code is right and proves nothing about whether the
deployed application serves it.

**Participant tokens are not Supabase JWTs.** §5 did not say what signs them.
They are signed with a key derived from `BRIDGE_ENCRYPTION_KEY` by HKDF with its
own info string. `SUPABASE_JWT_SECRET` is unset in this project and Supabase is
migrating off shared HS256 secrets, so building on it would make the feature
undeployable today; and the routes reach Postgres as `postgres` (BYPASSRLS), so
RLS was never the enforcement path for this API — the guard is. The Wave 2
policies stay as the second line, and the JWT claim names match
`public.current_shared_session()` exactly so a future direct-to-Supabase read
needs no second vocabulary. Reusing one key for both encryption and
authentication is the mistake Wave 1 avoided with its content/verify split.

**Rate limits are counted from `session_messages`, exactly.** In-memory counters
are per-instance-per-lifetime on Vercel, i.e. absent; there is no KV on Hobby.
Counting the trailing minute from the table makes the limit a property of the
data rather than of a cache that can drift from it. It is exact rather than
approximate because the transaction takes the session row lock FIRST — the lock
the seq trigger takes anyway — so a rejection costs no extra contention and
rolls back, which is what §8.6's "is not recorded" requires.

**`auto` TTL is enforced on read as well as on write.** Clients read `mode` to
decide whether to respond autonomously, so a lapsed TTL must not keep granting
autonomy to whoever polls before the next post reconciles the row. Reads report
a lapsed `auto` as `observe`; the stored row is settled by the next message and
by the maintenance cron.

**Not proven in Wave 3.** No MCP server or CLI exists yet, so nothing has
exercised these routes as an actual agent would — that is Wave 4. The join page
does not exist, so `sessionCrypto` still has not run in a real browser engine
(Wave 1's outstanding gap, closed by T6-W5-T1). And T6-AC-12 — the marketing
copy — is Wave 5 and is now MORE load-bearing than when written, because §3.2
gained the `system`-message correction.

### Wave 4 — Clients (public repo) ✅ COMPLETE

| ID | Title | Files | Cx | Done-check |
|---|---|---|---|---|
| T6-W4-T1 | `@devpilot.sh/mcp-session` | `packages/mcp-session/**` | L | ✅ §8.7, T6-AC-10 |
| T6-W4-T2 | CLI `session` commands | `packages/cli/src/commands/session/**` | M | ✅ live round trip |

165 tests (was 148). Both clients share ONE implementation —
`SharedSessionClient` in `packages/bridge-client` — because two copies of the
join/encrypt/decrypt logic is the drift that got `packages/bridge` deleted.

**Verified against the deployed platform, not simulated.** The real CLI created
a session, two named participants joined and posted from separate invocations,
`session tail` decrypted the transcript locally, and the MCP server was spawned
as a real subprocess speaking real MCP over stdio to join, post, read and list.
The server held three messages and **zero** rows matching any plaintext.

**§5 CORRECTED — the create route accepts a machine token.** §6.3 specifies
`devpilot session new`, run by a human at a laptop; that laptop holds a
`dp_orch_…` token and no browser cookie, so the documented command could not be
built against a session-only guard. The token is bound to one org and already
dispatches work there, so creating a session in that org is inside its existing
authority. The org is taken FROM THE TOKEN — a body `orgId` that disagrees is a
404, not a silent substitution.

**T6-AC-10 is satisfied without touching Claude Code.** The MCP server is
installed the way any MCP server is; nothing about the agent changes. DECISION A
is carried in the tool *descriptions*, because those are what a model actually
reads: `read` reports the session mode, and the default guidance is "do not post
unprompted — a human is relaying this conversation." A test asserts that
wording, since a future edit saying "reply as others post" would move the real
default while the database still said `observe`.

**Undecryptable messages are shown, not skipped.** Post-rotation history and
server-authored `system` notices both render as visible entries. A transcript
with silent holes is worse than one with marked gaps — the reader would not know
to go looking, which is the §1.1 "summary of a summary" failure returning by
another route.

**KNOWN GAP — duplicate participants on re-join.** Participant tokens last an
hour and the client re-joins transparently when one expires, but `POST /join`
always INSERTs, so a long-running `session tail` gains a roster entry per hour.
The transcript itself is unaffected (both ids resolve to the same display name);
`devpilot_session_who` shows duplicates. The fix is for `/join` to accept an
existing `participantId` and reuse that row when it belongs to the session —
a route change, so it belongs with the Wave 5 portal work that surfaces rosters.

**Not proven in Wave 4.** `sessionCrypto` still has not run in a real browser
engine — Wave 1's outstanding gap, closed by T6-W5-T1's join page. No agent has
yet run in `auto` mode against another agent; the budget and TTL are tested
server-side, but two agents actually conversing has never been observed.

### Wave 5 — Portal, docs, copy ✅ COMPLETE

| ID | Title | Repo | Files | Cx | Done-check |
|---|---|---|---|---|---|
| T6-W5-T1 | Session UI + join page | website | `app/(dashboard)/sessions/shared/**`, `app/s/[id]/**` | L | ✅ T6-AC-01 |
| T6-W5-T2 | Copy-link warning | website | same | S | ✅ §3.4 at copy time |
| T6-W5-T3 | **Marketing accuracy** | website | `code-quality-section.tsx`, `faq-section.tsx`, `hero-section.tsx` | S | ✅ **T6-AC-12, same PR** |
| T6-W5-T4 | Docs | both | `docs/SHARED-SESSIONS.md` | M | ✅ §3.2 table published |

**§8.1 IS NOW GENUINELY SATISFIED.** The join page is the first place
`sessionCrypto` runs in a real browser engine. Verified in Chrome against a live
deployment, in both directions:

```
CLI (Node)  ──encrypt──▶  relay  ──▶  Chrome decrypts:
    "posted from the CLI — the browser should decrypt this"

Chrome  ──encrypt──▶  relay  ──▶  CLI (Node) decrypts:
    "encrypted in Chrome — the CLI should read this back"

server holds: msgs=2  plaintext_hits=0
```

Every earlier wave could only assert this statically — jsdom has no
SubtleCrypto, so a jsdom run would have failed for reasons unrelated to the
code. "One format, three consumers" is now observed rather than argued.

**T6-AC-12 was wider than the AC said.** §7.6 names the security section, and
correcting it alone would have satisfied the letter while leaving the site
untrue two scrolls further down. The FAQ ended *"there is no code path that
uploads source"* and the hero said *"No source code leaving your laptop"* —
both stronger than the corrected §3.2, and both now false in one specific case:
pasting a diff into a shared transcript does move that text, encrypted and by
your own choice. All three were fixed together.

**The portal deliberately cannot preview a transcript.** The list page is a
server component and the server cannot read messages, so a preview would either
be impossible or would mean the design had been abandoned. `/s/[id]` sits
outside `(dashboard)` because a participant may have no account at all.

**Wave 4's duplicate-participant gap is closed.** Resume takes an EXPIRED
participant token rather than a client-supplied `participantId`: an id would let
anyone holding the link post as an existing participant and inherit their
history, whereas an expired token is unforgeable proof the caller was that
participant. Expiry is overlooked only to re-establish identity — the join proof
still has to succeed independently.

---

## Remaining gaps, carried forward rather than closed

TRD 06 is complete. These are known and belong to whatever comes next:

- **`auto` mode has never been observed running.** The budget, TTL, transition
  and system notice are all enforced and tested server-side, but two agents
  actually conversing autonomously has not been watched happen.
- **Realtime is still unwired** for `session_messages`, by choice. Polling with
  a `seq` cursor cannot miss or duplicate a message; `SUPABASE_JWT_SECRET`
  remains unset and Realtime has never connected in this project.
- **Rotation has no UI.** `POST /rotate` works and is tested, but the portal
  offers no button, so re-keying is currently an API call.
- **Linear attachment is unused.** `linearIssueId` / `linearIdentifier` are
  stored and settable, but nothing writes a session back to an issue — §1.2's
  sixth goal is the one thing in this TRD not delivered.

---

### Decisions other TRDs must respect

- **The server never holds a session key.** Any future feature needing
  server-side reads of a transcript is a new design, not an extension.
- **`observe` is the default mode.** Autonomy is opt-in, bounded, and expiring.
- **Possession of the link is authorisation.** Do not add silent org-based
  access on top; it would make the security model two things at once.
- **Ciphertext is never rendered server-side**, encrypted or not.
- The invariant from TRD 05 stands: **agents run locally.**

*TRD 06 · v1.5 · August 2026 · COMPLETE*
