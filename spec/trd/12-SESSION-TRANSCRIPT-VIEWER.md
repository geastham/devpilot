# TRD 12 — Session Transcript Viewer
## Full Per-Session Agent Activity Capture, Storage & Replay · v1.0

> July 2026 · Open Conjecture · Status: **DRAFT**
>
> **Depends on: Tiers 1–3 (spec/trd/01..03)**, specifically:
> - `spec/trd/01-TIER1-EXECUTION-LOOP.md` — real `dispatchToOrchestrator()`, wired
>   `CompletionListener`, orchestrator initialized in the Next app
>   (`initOrchestratorClient`), and a **finished claude-session adapter** with a real
>   dispatch/status/complete contract (replacing the placeholder routes in
>   `packages/core/src/orchestrator/claude-session-adapter.ts`). Transcript capture is a
>   contract *extension* of that dispatch contract; it cannot ship before the base
>   contract exists.
> - Tier 3 hardening (Linear config persistence, measured runway) is assumed but only
>   weakly required — nothing here reads Linear or runway math.
>
> Tier 4 feature #17 from `docs/ROADMAP.md`: "Session transcript viewer / replay — the
> orchestrator callbacks already capture completed tasks; surface the full log."

---

## 1. Problem Statement & Goals

### Problem Statement

When a Conductor dispatches work, the only visibility into what an agent session
actually *did* is:

- A progress percentage and `currentStep` string on the session row
  (`src/app/api/orchestrator/status/route.ts` → `ruflo_sessions`).
- A terse `activity_events` row per status callback (`SESSION_PROGRESS`,
  `SESSION_COMPLETE`) with a small metadata blob.
- The final `CompletionReport` (`packages/core/src/orchestrator/types.ts`): summary
  string, files modified/created/deleted, tokens, cost.

There is no record of the *sequence* of actions — which tools were called, which files
were edited and how, what the agent said, where it errored and retried. Debugging a bad
session, auditing an agent's edits, or learning why a plan went sideways requires
information DevPilot throws away today.

### Goals

1. **Capture** a full, ordered event stream per session (tool calls, file edits,
   messages, commands, errors) pushed from the running Claude Code session via a new
   batched callback `POST /api/orchestrator/transcript`, plus a final full-transcript
   flush on completion.
2. **Store** transcripts durably in SQLite via Drizzle: one `session_transcripts`
   summary row per session and append-only `transcript_events` rows indexed by
   `(session_id, seq)`, with payload size caps and a retention/pruning policy.
3. **Serve** transcripts through a paginated, type-filterable read API
   (`GET /api/fleet/sessions/[id]/transcript`) and a live-tail SSE namespace
   (`transcript:*`).
4. **Surface** a TranscriptViewer panel opened from `RufloSessionCard`: virtualized
   event list, type filters, live-tail mode, a replay scrubber over the event sequence,
   and rendered diffs for file-edit events.

### Non-Goals

- Recording raw model I/O (full prompts/responses). Events carry *summarized* payloads
  suitable for operator review, not model-training corpora.
- Transcripts for the legacy `ao-cli` adapter's stdout-scraped jobs
  (`packages/core/src/orchestrator/ao-cli-adapter.ts`). The pull-based poller may emit
  synthetic `status` events only; full capture is claude-session (push) adapter scope.
- Cross-session search/analytics over transcripts (future; the schema is indexed to
  permit it).
- Editing or annotating transcripts.

---

## 2. Current State (file-cited)

- **Callback ingestion**: `src/app/api/orchestrator/status/route.ts` accepts a
  `StatusUpdate` (`sessionId`, `status`, `progressPercent`, `currentStep?`,
  `currentFile?`, `message?`, `filesModified?`, `tokensUsed?`, `timestamp`), updates
  `ruflo_sessions`, inserts one `SESSION_PROGRESS` activity event, and syncs Linear.
  `src/app/api/orchestrator/complete/route.ts` accepts a `CompletionReport`
  (`success`, `prUrl?`, `commitSha?`, `filesModified/Created/Deleted`, `summary`,
  `tokensUsed`, `costUsd`, `durationMinutes`, `error?`), updates the session, inserts a
  `completed_tasks` row, releases `in_flight_files`, bumps the conductor score.
  Neither route persists any per-action history.
- **Contract types**: `packages/core/src/orchestrator/types.ts` defines
  `DispatchRequest`, `TaskSpec`, `StatusUpdate`, `CompletionReport`,
  `DispatchResponse`, `OrchestratorHealth`. No transcript concept exists.
- **Push adapter**: `packages/core/src/orchestrator/claude-session-adapter.ts` —
  `ClaudeSessionAdapter implements IOrchestratorAdapter, IPushCapableAdapter` with
  `ingestStatus()` / `ingestCompletion()` cache hooks and a `SessionTransport`
  interface (`createSession`, `sendMessage`, `stopSession`). Tier 1 replaces its
  placeholder HTTP routes with the real contract; this TRD extends `CreateSessionParams`
  so dispatched sessions know where to POST transcript batches.
- **DB conventions**: `packages/core/src/db/schema/fleet.ts` — `sqliteTable`, cuid2
  text PKs via `$defaultFn(() => createId())`, `integer(..., { mode: 'timestamp' })`,
  `text(..., { mode: 'json' }).$type<...>()`, enums from `./enums`, barrel export in
  `packages/core/src/db/schema/index.ts`. **Embedded DDL** lives in
  `packages/core/src/db/adapters/sqlite.ts` (`createTableStatements`); note it is
  already stale relative to the Drizzle schema (missing wiki/mempalace tables and the
  `external_session_id` / `orchestrator_mode` / `tokens_used` / `cost_usd` columns on
  `ruflo_sessions`) — new tables MUST be added there, and `pnpm run db:check-sync`
  (`scripts/check-schema-sync.ts`) must pass.
- **SSE today**: `src/app/api/events/stream/route.ts` is a single stream that polls the
  DB every 2s and emits `connected`, activity-event rows, `fleet_heartbeat`, and
  `wave_plan_heartbeat` messages. Client: `src/hooks/useSSE.ts` (EventSource, 5s
  reconnect). There is no per-session stream.
- **UI**: `src/components/fleet/RufloSessionCard.tsx` — props
  `{ session: RufloSession }`, click-to-expand card showing recent
  `session.completedTasks`. No drill-down into activity. Shared UI primitives:
  `Card/CardContent`, `RepoBadge`, `StatusBadge`, `ProgressBar` from
  `src/components/ui/*`; store access via zustand (`src/stores`).

---

## 3. Architecture

```
 Claude Code session (dispatched via ClaudeSessionAdapter, Tier 1)
 │  hooks: SessionStart / UserPromptSubmit / PreToolUse / PostToolUse /
 │         Stop / SubagentStop / SessionEnd  →  event emitter (batching, seq)
 │
 │  POST /api/orchestrator/transcript          POST /api/orchestrator/complete
 │  (batches of ≤50 events, ≤5s cadence,       (extended: final transcript
 │   monotonically increasing seq)              digest + finalize flag)
 ▼                                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Next app (src/app/api)                                               │
│  /api/orchestrator/transcript ──► core TranscriptService.ingestBatch │
│  /api/orchestrator/complete ────► TranscriptService.finalize (added) │
│  /api/fleet/sessions/[id]/transcript ──► TranscriptService.getEvents │
│  /api/fleet/sessions/[id]/transcript/stream (SSE, transcript:*)      │
└──────────────┬───────────────────────────────────────────────────────┘
               ▼
┌──────────────────────────────────────────────┐
│ packages/core/src/transcript/                │
│  TranscriptService                           │
│   • ingestBatch (validate, cap, dedupe)      │
│   • finalize (summary rollup, status)        │
│   • getEvents / getSummary (paginated reads) │
│   • prune (retention policy)                 │
└──────────────┬───────────────────────────────┘
               ▼
┌──────────────────────────────────────────────┐
│ SQLite via Drizzle (packages/core/src/db)    │
│  session_transcripts  (1 row / session)      │
│  transcript_events    (append-only, seq idx) │
└──────────────┬───────────────────────────────┘
               ▼
┌──────────────────────────────────────────────────────────┐
│ UI (src/components/transcript/)                          │
│  TranscriptViewer ◄─ opened from RufloSessionCard        │
│   • useTranscript hook (page fetch + SSE live tail)      │
│   • virtualized event list  • type filter bar            │
│   • replay scrubber (seq timeline)  • FileEditDiff       │
└──────────────────────────────────────────────────────────┘
```

**Responsibilities**

| Component | Owns |
|---|---|
| Session-side hook emitter (Tier 1 dispatch payload) | Assigning `seq`, batching, retry with re-send (idempotent) |
| `POST /api/orchestrator/transcript` | AuthN (same trust model as status/complete callbacks), delegation to service |
| `TranscriptService` (core) | Validation, size caps, dedupe, summary rollups, pagination, pruning |
| Drizzle schema + sqlite DDL | Durable storage, `(session_id, seq)` uniqueness |
| SSE route | Live tail per session (`transcript:*` messages), DB-poll bridge like the existing stream |
| TranscriptViewer | Rendering, filtering, replay, diffs; zero business logic |

---

## 4. Data Model

New file `packages/core/src/db/schema/transcripts.ts`, exported from
`packages/core/src/db/schema/index.ts`.

```ts
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { transcriptEventTypeValues, transcriptStatusValues } from './enums';

// ============================================================================
// Session Transcripts — one summary row per session
// ============================================================================

export const sessionTranscripts = sqliteTable('session_transcripts', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  /** FK → ruflo_sessions.id (one transcript per session) */
  sessionId: text('session_id').notNull().unique(),
  status: text('status', { enum: transcriptStatusValues })
    .notNull()
    .default('recording'), // 'recording' | 'complete' | 'truncated' | 'abandoned'
  eventCount: integer('event_count').notNull().default(0),
  /** Highest seq accepted so far (dense from 1; gaps recorded in metadata) */
  lastSeq: integer('last_seq').notNull().default(0),
  totalBytes: integer('total_bytes').notNull().default(0),
  toolCallCount: integer('tool_call_count').notNull().default(0),
  fileEditCount: integer('file_edit_count').notNull().default(0),
  errorCount: integer('error_count').notNull().default(0),
  /** Final summary copied from CompletionReport.summary at finalize time */
  summary: text('summary'),
  firstEventAt: integer('first_event_at', { mode: 'timestamp' }),
  lastEventAt: integer('last_event_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull().$defaultFn(() => new Date()),
});

// ============================================================================
// Transcript Events — append-only
// ============================================================================

export const transcriptEvents = sqliteTable(
  'transcript_events',
  {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    sessionId: text('session_id').notNull(),
    /** Session-assigned monotonically increasing sequence number, starts at 1 */
    seq: integer('seq').notNull(),
    type: text('type', { enum: transcriptEventTypeValues }).notNull(),
    /** Session-side wall-clock time of the event (ISO parsed to Date) */
    occurredAt: integer('occurred_at', { mode: 'timestamp' }).notNull(),
    /** One-line human label, always renderable without parsing payload */
    label: text('label').notNull(),
    /** Type-specific body, JSON text, capped (see §10) */
    payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>(),
    payloadBytes: integer('payload_bytes').notNull().default(0),
    /** 1 if payload was truncated to fit the cap */
    truncated: integer('truncated').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    sessionSeqUnique: uniqueIndex('idx_transcript_events_session_seq')
      .on(t.sessionId, t.seq),
    sessionTypeIdx: index('idx_transcript_events_session_type')
      .on(t.sessionId, t.type),
    createdAtIdx: index('idx_transcript_events_created_at').on(t.createdAt),
  })
);

export const sessionTranscriptsRelations = relations(sessionTranscripts, ({ many }) => ({
  events: many(transcriptEvents),
}));
export const transcriptEventsRelations = relations(transcriptEvents, ({ one }) => ({
  transcript: one(sessionTranscripts, {
    fields: [transcriptEvents.sessionId],
    references: [sessionTranscripts.sessionId],
  }),
}));

export type SessionTranscript = typeof sessionTranscripts.$inferSelect;
export type NewSessionTranscript = typeof sessionTranscripts.$inferInsert;
export type TranscriptEventRow = typeof transcriptEvents.$inferSelect;
export type NewTranscriptEventRow = typeof transcriptEvents.$inferInsert;
```

Additions to `packages/core/src/db/schema/enums.ts`:

```ts
export const transcriptEventTypeValues = [
  'session_start',   // SessionStart hook
  'message',         // UserPromptSubmit / assistant turn summary (Stop hook)
  'tool_call',       // PreToolUse (non-file, non-bash tools)
  'tool_result',     // PostToolUse result summary
  'file_edit',       // PostToolUse for Edit/Write/NotebookEdit — carries diff
  'command',         // PreToolUse for Bash — command line + description
  'error',           // tool error, refusal, or session-reported failure
  'status',          // synthetic: mirrors StatusUpdate milestones
  'subagent',        // SubagentStop summary
  'session_end',     // SessionEnd hook
] as const;
export type TranscriptEventType = (typeof transcriptEventTypeValues)[number];

export const transcriptStatusValues = [
  'recording', 'complete', 'truncated', 'abandoned',
] as const;
export type TranscriptStatus = (typeof transcriptStatusValues)[number];
```

**Payload shapes by type** (JSON text in `payload`; all fields optional-safe):

| type | payload |
|---|---|
| `session_start` | `{ model, repo, taskCode?, prompt_preview }` (prompt truncated to 2 KB) |
| `message` | `{ role: 'user'\|'assistant', text }` (text capped) |
| `tool_call` | `{ tool, input_preview }` |
| `tool_result` | `{ tool, ok: boolean, output_preview }` |
| `file_edit` | `{ path, op: 'edit'\|'create'\|'delete', old_snippet?, new_snippet?, unified_diff? }` |
| `command` | `{ command, description?, exit_code?, duration_ms? }` |
| `error` | `{ code?, message, recoverable? }` |
| `status` | `{ status, progressPercent, currentStep? }` |
| `subagent` | `{ agent_type?, summary }` |
| `session_end` | `{ reason: 'complete'\|'stopped'\|'error' }` |

**sqlite adapter DDL** — append to `createTableStatements` in
`packages/core/src/db/adapters/sqlite.ts`:

```sql
CREATE TABLE IF NOT EXISTS session_transcripts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'recording'
    CHECK(status IN ('recording','complete','truncated','abandoned')),
  event_count INTEGER NOT NULL DEFAULT 0,
  last_seq INTEGER NOT NULL DEFAULT 0,
  total_bytes INTEGER NOT NULL DEFAULT 0,
  tool_call_count INTEGER NOT NULL DEFAULT 0,
  file_edit_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  summary TEXT,
  first_event_at INTEGER,
  last_event_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transcript_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('session_start','message','tool_call','tool_result',
    'file_edit','command','error','status','subagent','session_end')),
  occurred_at INTEGER NOT NULL,
  label TEXT NOT NULL,
  payload TEXT,
  payload_bytes INTEGER NOT NULL DEFAULT 0,
  truncated INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transcript_events_session_seq
  ON transcript_events(session_id, seq);
CREATE INDEX IF NOT EXISTS idx_transcript_events_session_type
  ON transcript_events(session_id, type);
CREATE INDEX IF NOT EXISTS idx_transcript_events_created_at
  ON transcript_events(created_at);
```

**Retention**: `transcript_events` older than `TRANSCRIPT_RETENTION_DAYS` (default 30)
are deleted; the `session_transcripts` summary row is kept forever (cheap) with status
unchanged, so cards can still show "transcript pruned" metadata. Pruning runs
opportunistically inside `ingestBatch` (at most once per hour, guarded by an in-memory
timestamp) — no cron infrastructure required.

---

## 5. API Surface

### 5.1 Contract extension — `POST /api/orchestrator/transcript`

New callback, sibling of `/api/orchestrator/status`. Same trust model (Tier 1 callback
auth). Sessions post batches; batching contract: flush every 5 s or 50 events,
whichever first; re-send on failure (idempotent via `(sessionId, seq)`).

Request:

```json
{
  "sessionId": "cku...",
  "events": [
    {
      "seq": 41,
      "type": "file_edit",
      "occurredAt": "2026-07-19T18:03:22.114Z",
      "label": "Edit src/lib/utils.ts",
      "payload": { "path": "src/lib/utils.ts", "op": "edit", "unified_diff": "@@ -10,4 +10,6 @@..." }
    }
  ],
  "final": false
}
```

Response `200`:

```json
{ "accepted": true, "stored": 12, "duplicates": 0, "lastSeq": 53 }
```

Errors: `404 { "error": "Session not found" }` (unknown `sessionId`, mirrors status
route); `400 { "error": "Invalid transcript batch", "details": [...] }` (zod);
`413 { "error": "Batch too large" }` (> `TRANSCRIPT_MAX_BATCH_BYTES`); `409` is never
returned — duplicate seqs are silently dropped and counted in `duplicates`. `final:
true` triggers `finalize()` (idempotent).

### 5.2 Completion flush

`CompletionReport` in `packages/core/src/orchestrator/types.ts` gains one optional
field (backward compatible — existing senders omit it):

```ts
export interface CompletionReport {
  // ...existing fields unchanged...
  /** Final transcript digest; also acts as finalize signal. */
  transcript?: {
    lastSeq: number;        // highest seq the session emitted
    eventCount: number;     // session-side count, for gap detection
    /** Optional tail flush: any events not yet delivered via /transcript */
    events?: TranscriptEvent[];
  };
}
```

`src/app/api/orchestrator/complete/route.ts` is extended (after its existing session
update) to call `TranscriptService.ingestBatch` with `transcript.events` (if any) and
then `TranscriptService.finalize`.

### 5.3 Read API — `GET /api/fleet/sessions/[id]/transcript`

Query params: `after` (seq cursor, default 0), `limit` (default 200, max 1000),
`types` (comma-separated `TranscriptEventType` filter), `order` (`asc` default,
`desc`).

Response `200`:

```json
{
  "session": { "id": "cku...", "ticketTitle": "...", "status": "COMPLETE" },
  "transcript": {
    "status": "complete",
    "eventCount": 412, "lastSeq": 412, "totalBytes": 199032,
    "toolCallCount": 120, "fileEditCount": 34, "errorCount": 2,
    "firstEventAt": "...", "lastEventAt": "...", "summary": "..."
  },
  "events": [ { "seq": 1, "type": "session_start", "occurredAt": "...", "label": "...", "payload": {}, "truncated": false } ],
  "page": { "nextAfter": 200, "hasMore": true }
}
```

Errors: `404 { "error": "Session not found" }`; `404 { "error": "No transcript for
session" }` (session exists, never sent events); `400` for bad `types`/`limit`.

### 5.4 Live tail — `GET /api/fleet/sessions/[id]/transcript/stream`

SSE endpoint following the DB-poll pattern of `src/app/api/events/stream/route.ts`
(1 s poll interval, abort-signal cleanup). Messages use the `transcript:*` namespace in
the JSON `type` field (consistent with the untyped `data:` framing the existing stream
uses — no SSE `event:` lines, so `EventSource.onmessage` keeps working):

| message `type` | payload |
|---|---|
| `transcript:connected` | `{ sessionId, lastSeq }` |
| `transcript:events` | `{ sessionId, events: TranscriptEvent[] }` (batch, ≤50/message) |
| `transcript:complete` | `{ sessionId, status, eventCount }` — stream closes after |
| `transcript:error` | `{ message }` (stream stays alive) |

Query param: `after` (resume cursor).

---

## 6. Core Services

### `packages/core/src/transcript/types.ts`

```ts
import type { TranscriptEventType } from '../db/schema/enums';

export interface TranscriptEvent {
  seq: number;
  type: TranscriptEventType;
  occurredAt: string;           // ISO-8601
  label: string;
  payload?: Record<string, unknown>;
}

export interface TranscriptBatch {
  sessionId: string;
  events: TranscriptEvent[];
  final?: boolean;
}

export interface IngestResult {
  accepted: boolean;
  stored: number;
  duplicates: number;
  lastSeq: number;
}

export interface TranscriptServiceConfig {
  maxEventBytes: number;        // default 65536
  maxBatchBytes: number;        // default 1_048_576
  maxEventsPerSession: number;  // default 10000
  retentionDays: number;        // default 30
}
```

### `packages/core/src/transcript/service.ts`

Exports:

```ts
export class TranscriptService {
  constructor(config?: Partial<TranscriptServiceConfig>);

  /** Validate, cap, dedupe, insert; upsert summary row counters. */
  async ingestBatch(batch: TranscriptBatch): Promise<IngestResult>;

  /** Mark complete/truncated, copy summary, record gap metadata. Idempotent. */
  async finalize(sessionId: string, opts?: {
    summary?: string;
    expectedLastSeq?: number;
    expectedEventCount?: number;
  }): Promise<SessionTranscript | null>;

  async getSummary(sessionId: string): Promise<SessionTranscript | null>;

  async getEvents(sessionId: string, opts?: {
    after?: number;
    limit?: number;
    types?: TranscriptEventType[];
    order?: 'asc' | 'desc';
  }): Promise<{ events: TranscriptEventRow[]; nextAfter: number; hasMore: boolean }>;

  /** Delete events older than retentionDays; keep summary rows. */
  async prune(now?: Date): Promise<{ deletedEvents: number }>;
}

export function createTranscriptService(
  config?: Partial<TranscriptServiceConfig>
): TranscriptService;
```

Behavior notes:

- Uses `getDatabase()` from `packages/core/src/db` (same pattern as
  `packages/core/src/wave-planner/execution/completion-listener.ts`).
- `ingestBatch` creates the `session_transcripts` row lazily on first batch
  (`status: 'recording'`); per-event: serialize payload, if `> maxEventBytes` replace
  string values greedily with `"...[truncated]"` until under cap and set
  `truncated = 1`; insert with `ON CONFLICT DO NOTHING` semantics on
  `(session_id, seq)`; counters updated in one summary UPDATE per batch.
- Once `eventCount >= maxEventsPerSession`, further events are dropped and the
  transcript status becomes `truncated` (still finalizable).
- `finalize` with `expectedLastSeq > lastSeq` records the gap in the summary `summary`
  suffix (`"[n events lost in transit]"`) but still completes.

### `packages/core/src/transcript/index.ts`

`export * from './types'; export { TranscriptService, createTranscriptService } from './service';`
plus `export * as transcript from './transcript';` added to
`packages/core/src/index.ts` (mirrors `wiki`/`mempalace` namespacing).

### Contract types — `packages/core/src/orchestrator/types.ts`

Add `TranscriptEvent` re-export and the `CompletionReport.transcript?` field (§5.2),
and extend `CreateSessionParams` in
`packages/core/src/orchestrator/claude-session-adapter.ts` with:

```ts
/** URL the session should POST transcript batches to; omit to disable capture. */
transcriptCallbackUrl?: string;
```

`ClaudeSessionAdapter.dispatch()` populates it from `request.callbackUrl` +
`/api/orchestrator/transcript` when `TRANSCRIPT_CAPTURE_ENABLED` (§9). The Tier 1
session bootstrap (hook installation in the dispatched session) maps Claude Code hooks
→ event types per §4's table; that mapping ships as part of the dispatch prompt/hook
config already defined in `spec/trd/01-TIER1-EXECUTION-LOOP.md` and is extended, not
redesigned, here.

---

## 7. UI

All new components in `src/components/transcript/` (new folder, barrel `index.ts`),
following existing conventions: `'use client'`, `cn()` from `src/lib/utils`, design
tokens (`bg-bg-panel`, `text-text-primary`, `accent-*`), zustand for open/close state.

### Components

| Component | File | Props | Notes |
|---|---|---|---|
| `TranscriptViewer` | `TranscriptViewer.tsx` | `{ sessionId: string; open: boolean; onClose: () => void }` | Right slide-over (matches `AgenticAssistPanel` overlay pattern, w-[560px]). Header: session title, transcript status badge, live-tail toggle, close. Body: filter bar → virtualized list → scrubber footer. |
| `TranscriptEventRow` | `TranscriptEventRow.tsx` | `{ event: TranscriptEventView; expanded: boolean; onToggle: () => void }` | Icon + color per type (tool `→`, edit `±`, error `●` red, message `❯`), mono `label`, timestamp via `formatTime`. Expanded: payload details; `file_edit` renders `FileEditDiff`. |
| `TranscriptFilterBar` | `TranscriptFilterBar.tsx` | `{ counts: Record<TranscriptEventType, number>; active: TranscriptEventType[]; onChange: (t: TranscriptEventType[]) => void }` | Chip toggles (reuse `Chip`/`ChipGroup` from `src/components/ui/chip`). |
| `TranscriptScrubber` | `TranscriptScrubber.tsx` | `{ minSeq: number; maxSeq: number; value: number; markers: { seq: number; type: TranscriptEventType }[]; onChange: (seq: number) => void; playing: boolean; onPlayToggle: () => void }` | Range slider mapped to seq; error/file_edit tick markers; play advances value on an interval (replay mode reveals events with `seq <= value`). |
| `FileEditDiff` | `FileEditDiff.tsx` | `{ payload: FileEditPayload }` | Renders `unified_diff` with +/− line coloring; falls back to old/new snippet panes. No external diff lib — payload already carries the diff text. |

### Hook — `src/hooks/useTranscript.ts` (exported from `src/hooks/index.ts`)

```ts
export function useTranscript(sessionId: string, opts?: { live?: boolean }): {
  summary: TranscriptSummaryView | null;
  events: TranscriptEventView[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  liveConnected: boolean;
}
```

Fetches pages from §5.3; when `live` and session status is `ACTIVE`, opens an
`EventSource` on §5.4 (reconnect-after-5s pattern copied from `src/hooks/useSSE.ts`)
and appends `transcript:events` batches, deduping by seq.

### Virtualization

Add dependency `@tanstack/react-virtual` (^3) to the root Next app — the only new
frontend dependency in this TRD. List rows are height-estimated at 36 px collapsed;
expanded rows re-measure.

### Entry point — `RufloSessionCard`

`src/components/fleet/RufloSessionCard.tsx` expanded section gains a
"View transcript →" button (rendered whenever a transcript summary exists — fetched
lazily on expand via `GET .../transcript?limit=0`). Clicking sets
`uiStore.openTranscriptSessionId` (new field + `openTranscript(sessionId)` /
`closeTranscript()` actions in `src/stores/uiStore.ts`). A single `TranscriptViewer`
instance is mounted in `src/app/(main)/page.tsx` and `mission-control/page.tsx`
alongside the existing panels.

### View types

`src/types/index.ts` gains `TranscriptEventView`, `TranscriptSummaryView`,
`FileEditPayload` (client-side mirrors of §4 shapes, `occurredAt: Date`).

### States

- **Loading**: skeleton rows (existing shimmer conventions).
- **Empty**: "No transcript captured for this session" (pre-feature sessions).
- **Recording**: live-tail toggle available, auto-scroll pinned-to-bottom unless the
  user scrolls up (then a "↓ N new events" pill).
- **Pruned**: summary shown, events list replaced by retention notice.
- **Replay**: scrubber engaged → list windowed to `seq <= value`, live-tail disabled.

---

## 8. Config

Env vars (Next app + core; all optional, defaults shown):

| Var | Default | Meaning |
|---|---|---|
| `TRANSCRIPT_CAPTURE_ENABLED` | `true` | Master switch; when false, dispatch omits `transcriptCallbackUrl` and the ingest route returns 202-noop |
| `TRANSCRIPT_MAX_EVENT_BYTES` | `65536` | Per-event payload cap (truncate) |
| `TRANSCRIPT_MAX_BATCH_BYTES` | `1048576` | Reject batch with 413 above this |
| `TRANSCRIPT_MAX_EVENTS_PER_SESSION` | `10000` | Hard cap → status `truncated` |
| `TRANSCRIPT_RETENTION_DAYS` | `30` | Event pruning horizon |

No `config.yaml` exists in the repo today; configuration stays env-based, consistent
with the wave planner (`WAVE_PLANNER_MODEL` etc. in
`src/app/api/items/[id]/wave-plan/reoptimize/route.ts`). If a config file is
introduced later these map to a `transcript:` block 1:1.

---

## 9. Error Handling & Edge Cases

1. **Out-of-order batches**: seq is authoritative; inserts are order-independent.
   Reads sort by seq. `lastSeq` = MAX(seq) seen.
2. **Duplicate delivery** (session retries a failed POST): unique index drops dupes;
   response reports `duplicates` so the sender can advance its cursor.
3. **Lost batches**: detected at finalize via `expectedLastSeq`/`expectedEventCount`
   mismatch; transcript still completes with a gap note. The viewer renders a
   "n events missing" divider where seq gaps exist.
4. **Unknown session**: 404 (matches status route). Sessions must exist before events
   are accepted — dispatch creates the session row first (Tier 1 invariant).
5. **Oversized payload**: truncated per §6, never rejected (an event with a mangled
   payload beats a hole in the record). Oversized *batch* → 413; sender splits.
6. **Session dies without complete callback**: transcript stays `recording`. A sweep in
   `prune()` marks transcripts `abandoned` when the linked session is
   `COMPLETE`/`ERROR` or `lastEventAt` is older than 24 h.
7. **DB write failure mid-batch**: batch inserts run in a single transaction; on error
   the route returns 500 and the session retries the whole batch (idempotent).
8. **Live tail on a completed session**: stream immediately emits buffered events then
   `transcript:complete` and closes.
9. **ao-cli sessions**: no transcript row is created; read API returns the
   "No transcript" 404 variant; card hides the button.
10. **Capture disabled mid-flight**: ingest route accepts and discards (202) so
    in-flight sessions don't error.

---

## 10. Testing Strategy

- **Unit (core, vitest — repo already uses vitest at root)**:
  `packages/core/src/transcript/__tests__/service.test.ts` — ingest happy path, dedupe,
  truncation at `maxEventBytes`, per-session cap → `truncated`, finalize idempotency,
  gap detection, prune retention math. Use in-memory SQLite via
  `createSQLiteAdapter(':memory:')`.
- **Unit (schema sync)**: extend `scripts/check-schema-sync.ts` expectations so the new
  DDL in `sqlite.ts` matches the Drizzle schema.
- **Route tests**: `src/app/api/orchestrator/transcript/route.test.ts` — 200/400/404/413,
  duplicate handling; complete-route extension calls finalize.
- **SSE test**: poll-loop unit test with fake timers asserting `transcript:events`
  batching and `transcript:complete` close.
- **UI**: component tests for `TranscriptEventRow` (per-type rendering, diff),
  `TranscriptScrubber` (seq windowing); hook test for `useTranscript` pagination +
  live dedupe with a mocked EventSource.
- **Integration (manual, gated on Tier 1)**: dispatch a real claude-session against a
  scratch repo; verify batches land, viewer live-tails, replay works post-completion.

---

## 11. Acceptance Criteria

- **TV-AC-01**: `POST /api/orchestrator/transcript` with a valid batch for an existing
  session returns 200 with accurate `stored`/`lastSeq`; rows appear in
  `transcript_events` with the exact seq/type/payload sent.
- **TV-AC-02**: Re-sending the same batch stores 0 new rows and reports
  `duplicates == events.length`.
- **TV-AC-03**: A payload larger than `TRANSCRIPT_MAX_EVENT_BYTES` is stored truncated
  with `truncated = 1` and the row remains valid JSON.
- **TV-AC-04**: After a `CompletionReport` containing `transcript.events` +
  `lastSeq`, the summary row has `status = 'complete'`, correct counters, and
  `summary` copied from the report.
- **TV-AC-05**: `GET /api/fleet/sessions/[id]/transcript?types=file_edit&limit=50`
  returns only `file_edit` events, ≤50, with a working `nextAfter` cursor
  (subsequent call returns the next page, no overlap).
- **TV-AC-06**: The SSE stream delivers a newly ingested event to a connected client
  within 2 s, and emits `transcript:complete` then closes when the transcript
  finalizes.
- **TV-AC-07**: Opening TranscriptViewer from an expanded RufloSessionCard renders the
  event list; a 5,000-event transcript scrolls at 60 fps (virtualized — DOM node count
  stays under 100).
- **TV-AC-08**: Replay scrubber at seq N shows exactly events 1..N; play mode advances
  automatically; error markers are visible on the track.
- **TV-AC-09**: `file_edit` events render a colored unified diff; events with only
  snippets render side-by-side old/new.
- **TV-AC-10**: With `TRANSCRIPT_CAPTURE_ENABLED=false`, dispatch omits the transcript
  callback, ingest returns 202 without writing, and the UI shows the empty state — no
  errors anywhere.
- **TV-AC-11**: `prune()` deletes events older than the retention window, keeps
  summary rows, and marks stale `recording` transcripts `abandoned`.
- **TV-AC-12**: `pnpm run db:check-sync` passes with the new tables.

---

## 12. Implementation Plan

Waves are strictly ordered; tasks within a wave are independent and touch disjoint
files.

### Wave TV-W1 — Contract & Schema

- **TV-W1-T1 — Transcript contract types**
  Files: `packages/core/src/orchestrator/types.ts`,
  `packages/core/src/orchestrator/claude-session-adapter.ts`
  Add `TranscriptEvent`, `TranscriptBatch` re-export surface, optional
  `CompletionReport.transcript` field, `CreateSessionParams.transcriptCallbackUrl`,
  and populate it in `ClaudeSessionAdapter.dispatch()` per §6. No behavior change when
  the field is absent. Deps: none. Complexity: **S**.
  Done-check: `pnpm run typecheck` passes; existing adapter tests green.
- **TV-W1-T2 — Drizzle schema**
  Files: `packages/core/src/db/schema/transcripts.ts` (new),
  `packages/core/src/db/schema/enums.ts`, `packages/core/src/db/schema/index.ts`
  Implement §4 exactly (tables, indexes, relations, enum values, type exports); add
  barrel export. Deps: none. Complexity: **S**.
  Done-check: `db.query.sessionTranscripts` / `transcriptEvents` typecheck.
- **TV-W1-T3 — sqlite adapter DDL**
  Files: `packages/core/src/db/adapters/sqlite.ts`
  Append §4 DDL to `createTableStatements`. Deps: none. Complexity: **S**.
  Done-check: fresh `:memory:` adapter boots; `pnpm run db:check-sync` passes.
- **TV-W1-T4 — Client view types**
  Files: `src/types/index.ts`
  Add `TranscriptEventView`, `TranscriptSummaryView`, `FileEditPayload`,
  `TranscriptEventType` union per §7, matching §4 shapes verbatim. Deps: none.
  Complexity: **S**. Done-check: typecheck passes.

### Wave TV-W2 — Core Service

- **TV-W2-T1 — TranscriptService**
  Files: `packages/core/src/transcript/types.ts`, `.../service.ts`, `.../index.ts`,
  `packages/core/src/index.ts`
  Implement §6 in full (ingest/finalize/getEvents/getSummary/prune, truncation,
  dedupe, transactional batch insert, abandoned sweep). Deps: TV-W1-T2, TV-W1-T3.
  Complexity: **L**.
  Done-check: unit tests in `packages/core/src/transcript/__tests__/service.test.ts`
  cover TV-AC-01..04, TV-AC-11 logic and pass.

### Wave TV-W3 — API Routes

- **TV-W3-T1 — Ingest callback route**
  Files: `src/app/api/orchestrator/transcript/route.ts` (new)
  POST handler per §5.1: zod validation, 404/400/413 semantics, capture-disabled 202,
  delegate to `TranscriptService`. Deps: TV-W2-T1. Complexity: **M**.
  Done-check: route tests for all status codes pass.
- **TV-W3-T2 — Complete-route finalize hook**
  Files: `src/app/api/orchestrator/complete/route.ts`
  After the existing session update, ingest `report.transcript?.events` and call
  `finalize` with expected counters (§5.2). Must not change existing response shape.
  Deps: TV-W2-T1. Complexity: **S**.
  Done-check: existing complete-route behavior unchanged; finalize invoked in test.
- **TV-W3-T3 — Read API**
  Files: `src/app/api/fleet/sessions/[id]/transcript/route.ts` (new)
  GET per §5.3 (pagination, type filter, summary envelope). Deps: TV-W2-T1.
  Complexity: **M**. Done-check: TV-AC-05 test passes.
- **TV-W3-T4 — SSE live tail**
  Files: `src/app/api/fleet/sessions/[id]/transcript/stream/route.ts` (new)
  1 s DB-poll stream per §5.4, modeled on `src/app/api/events/stream/route.ts`
  (abort cleanup, keep-alive headers). Deps: TV-W2-T1. Complexity: **M**.
  Done-check: TV-AC-06 fake-timer test passes.

### Wave TV-W4 — UI Building Blocks

- **TV-W4-T1 — useTranscript hook**
  Files: `src/hooks/useTranscript.ts` (new), `src/hooks/index.ts`
  Implement §7 hook (paged fetch, SSE live mode, seq dedupe, reconnect). Deps:
  TV-W3-T3, TV-W3-T4, TV-W1-T4. Complexity: **M**.
  Done-check: hook unit test with mocked fetch/EventSource passes.
- **TV-W4-T2 — Event row + diff renderer**
  Files: `src/components/transcript/TranscriptEventRow.tsx` (new),
  `src/components/transcript/FileEditDiff.tsx` (new)
  Per-type icons/colors, expand/collapse, unified-diff coloring, snippet fallback.
  Deps: TV-W1-T4. Complexity: **M**. Done-check: TV-AC-09 component test passes.
- **TV-W4-T3 — Filter bar**
  Files: `src/components/transcript/TranscriptFilterBar.tsx` (new)
  Chip toggles with counts, reusing `src/components/ui/chip`. Deps: TV-W1-T4.
  Complexity: **S**. Done-check: toggling chips calls `onChange` with correct sets.
- **TV-W4-T4 — Replay scrubber**
  Files: `src/components/transcript/TranscriptScrubber.tsx` (new)
  Range input over seq domain, type markers, play/pause interval. Deps: TV-W1-T4.
  Complexity: **M**. Done-check: TV-AC-08 component test passes.
- **TV-W4-T5 — uiStore + virtualization dep**
  Files: `src/stores/uiStore.ts`, `package.json` (root)
  Add `openTranscriptSessionId: string | null`, `openTranscript`, `closeTranscript`;
  add `@tanstack/react-virtual` dependency. Deps: none. Complexity: **S**.
  Done-check: store actions unit-tested; `pnpm install` lockfile updated.

### Wave TV-W5 — Assembly

- **TV-W5-T1 — TranscriptViewer container**
  Files: `src/components/transcript/TranscriptViewer.tsx` (new),
  `src/components/transcript/index.ts` (new)
  Compose hook + row + filter + scrubber with virtualized list, live-tail pinning,
  loading/empty/pruned/replay states per §7. Deps: all TV-W4. Complexity: **L**.
  Done-check: TV-AC-07 rendering test (virtualized DOM bound) passes.
- **TV-W5-T2 — Fleet integration**
  Files: `src/components/fleet/RufloSessionCard.tsx`, `src/app/(main)/page.tsx`,
  `src/app/(main)/mission-control/page.tsx`
  "View transcript" button in the expanded card (lazy summary probe), mount a single
  viewer instance per page wired to uiStore. Deps: TV-W5-T1, TV-W4-T5.
  Complexity: **M**.
  Done-check: TV-AC-07 end-to-end open flow works in dev against seeded data.

Total: 5 waves, 16 tasks.
