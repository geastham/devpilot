# TRD 14 — AI-Driven Assist Panel
## Server-Side AssistService: Deterministic Triggers, Generated Suggestions · v1.0

> July 2026 · Open Conjecture · Status: **DRAFT**
>
> **Depends on: Tiers 1–3 (spec/trd/01..03)**, specifically:
> - `spec/trd/01-TIER1-EXECUTION-LOOP.md` — real dispatch and the wired
>   `CompletionListener` so session progress/completion events are real (assist
>   triggers fire on them); the `pause`/`resume` routes under
>   `/api/wave-plans/[planId]/` (Tier 1 item 5) because a suggested action may be
>   "pause plan"; real AI plan generation (Tier 1 item 4) so "generate plan" actions
>   invoke the genuine pipeline.
> - Tier 3 item 13 (measured runway math) — the runway-low trigger reads runway from
>   fleet state; it works against today's constant-based math but its advice is only
>   trustworthy once runway is measured. Soft dependency: feature functions without it.
> - Tier 2 is not required.
>
> Tier 4 feature #19 from `docs/ROADMAP.md`: "Truly agentic Assist Panel — today it's
> client-side heuristics; give it the Claude API + fleet/wiki/MemPalace context so
> suggestions are generated, not rule-matched."

---

## 1. Problem Statement & Goals

### Problem Statement

The Agentic Assist Panel is specified as DevPilot's "proactive intelligence layer …
a push-based advisor that speaks only when it has something worth saying"
(`design/04-AGENTIC-ASSIST-PANEL.md`). What shipped is
`src/components/assist/AgenticAssistPanel.tsx`: a client-side `useAssistTriggers()`
hook that pattern-matches zustand store state against two of the five designed
triggers (session ≥70/90% with no READY spec; runway <4h/<2h) and emits hardcoded
template strings. Consequences:

- Suggestions are rule-matched sentences, not advice. They cannot reference wiki
  knowledge, MemPalace memory, wave-plan state, or cross-item relationships (the
  "related-item chips" in the design are limited to the triggering ticket/repo).
- Three designed triggers are missing entirely: *new item added*, *plan approved*,
  *re-plan requested*.
- Nothing is persisted: suggestions vanish on reload, there is no accepted/dismissed
  history, no learning loop, and no quiet mode (designed in
  `design/04-AGENTIC-ASSIST-PANEL.md` PROMPT 4).
- Action buttons exist in the type (`AssistSuggestion.action` in
  `src/types/index.ts:212`) but no trigger populates them.

### Goals

1. **Server-side AssistService** (`packages/core/src/assist/`): trigger detection
   stays **deterministic** (server-side evaluation of fleet/horizon/wave-plan state on
   event writes — no LLM in the trigger path), while suggestion **generation** becomes
   an Anthropic API call mirroring `packages/core/src/wave-planner/ai-client.ts`
   conventions, with assembled context: fleet state, horizon items, wave-plan status,
   wiki articles (`packages/core/src/wiki/`), and MemPalace L0–L3 context via
   `MemPalaceService.assemblePromptContext()` + `renderBlock()`
   (`packages/core/src/mempalace/service.ts`).
2. **Structured output**: each suggestion carries type/severity, text, related item
   ids, and **suggested actions where every action is an existing API call** (create
   item, promote item, generate plan, pause plan, dispatch item).
3. **Cost discipline**: per-trigger cooldowns, max-N-suggestions/hour, duplicate
   suppression, server-honored quiet mode, and explicit degradation to the current
   client heuristics when no API key is configured (the existing
   `useAssistTriggers()` hook is **kept** as the fallback path).
4. **Persistence + feedback loop**: `assist_suggestions` table (trigger, content,
   actions JSON, status pending/shown/accepted/dismissed, timestamps); accept/dismiss
   outcomes are recorded and fed into future generation prompts.
5. **Delivery**: `GET /api/assist/suggestions`,
   `POST /api/assist/suggestions/[id]/accept|dismiss`, trigger evaluation hooked into
   the routes that already write activity events, and SSE namespace `assist:*`
   (`assist:suggestion`) over the existing event stream.
6. **UI rework**: `AgenticAssistPanel` renders server suggestions with action buttons
   that execute the suggested API calls, loading states, and a persisted quiet-mode
   toggle.

### Non-Goals

- A chatbot. The design is explicit: push-based advisor, no free-form conversation,
  no user→assistant text input.
- Autonomous action execution. Every action requires a click; accept ≠ auto-execute
  of anything beyond the single named API call.
- Retraining/fine-tuning from feedback; the loop is prompt-context only.
- Replacing the inline QuickCapture response (design PROMPT 2) — the panel is the
  scope; the inline surface can consume the same API later.

---

## 2. Current State (file-cited)

- **Client heuristics**: `src/components/assist/AgenticAssistPanel.tsx` —
  `useAssistTriggers()` reads `useFleetStore` (sessions, runwayHours) and
  `useHorizonStore` (items), upserts/prunes suggestions in `useUIStore`
  (`assistSuggestions`, `addAssistSuggestion`, `removeAssistSuggestion`; store slice
  in `src/stores/uiStore.ts`). Implements DESIGN.md §9.1 triggers: `idle-imminent-*`
  (≥90%), `needs-spec-*` (≥70%), `runway-low` (<4h, urgent <2h). Panel variants
  `overlay | inline`; `SuggestionCard` renders chips (`src/components/ui/chip`) and an
  optional action button.
- **Types**: `src/types/index.ts:212` — `AssistSuggestion { id, type:
  'urgent'|'warning'|'confirmation'|'info', message, chips: SuggestionChip[],
  action?: { label, handler }, timestamp }`.
- **Product intent**: `design/04-AGENTIC-ASSIST-PANEL.md` — five triggers (session
  ≥70% no READY spec; new item added; runway <4h; plan approved; re-plan requested),
  related-item chips, actionable CTA card (PROMPT 3), quiet mode + empty state
  (PROMPT 4), severity left-border color coding.
- **AI conventions**: `packages/core/src/wave-planner/ai-client.ts` —
  `WavePlannerAIClient` wrapping `@anthropic-ai/sdk` `messages.create`, config
  `{ apiKey, model, maxTokens, timeout? }`, `GenerationResult` with token counts and
  duration, `generateWithRetry` exponential backoff (1s/2s/4s). Env pattern in
  `src/app/api/items/[id]/wave-plan/reoptimize/route.ts`: `ANTHROPIC_API_KEY`,
  `WAVE_PLANNER_MODEL` default `claude-sonnet-4-20250514`, `WAVE_PLANNER_MAX_TOKENS`.
- **Memory/context sources**: `packages/core/src/mempalace/service.ts` —
  `MemPalaceService.assemblePromptContext({ wingSlug?, topicHints?, maxTokens? })`
  returns a `PalaceContextBlock` (L0 identity, L1 critical facts, L2 topical
  closets) or null; static `MemPalaceService.renderBlock()` renders it as a markdown
  prompt snippet. Wiki: `packages/core/src/wiki/` exports `WikiCompiler` /
  `createWikiCompiler` and the `wikiArticles` table
  (`packages/core/src/db/schema/wiki.ts`) is queryable directly via Drizzle.
- **Event write sites (trigger hook points, verified by grep)**:
  `src/app/api/items/route.ts` (ITEM_CREATED),
  `src/app/api/orchestrator/status/route.ts` (SESSION_PROGRESS),
  `src/app/api/orchestrator/complete/route.ts` (SESSION_COMPLETE),
  `src/app/api/items/[id]/wave-plan/status/route.ts` (wave-plan status transitions,
  incl. approval), `src/app/api/items/[id]/wave-plan/reoptimize/route.ts`
  (WAVE_PLAN_REOPTIMIZING). Runway is computed in
  `src/app/api/fleet/state/route.ts` (HEALTHY/WARNING/CRITICAL bands).
- **SSE**: `src/app/api/events/stream/route.ts` single stream, 2s DB poll, JSON
  `type` discriminator; client `src/hooks/useSSE.ts`.
- **DB conventions**: as TRD 12 §2 — Drizzle schema files + barrel
  (`packages/core/src/db/schema/index.ts`) + embedded DDL in
  `packages/core/src/db/adapters/sqlite.ts` + `pnpm run db:check-sync`.

---

## 3. Architecture

```
        API routes that write activity events
        (items POST · orchestrator status/complete ·
         wave-plan status · wave-plan reoptimize)
                    │  evaluateAssistTriggers(eventType, payload)
                    ▼  (fire-and-forget, never blocks the route)
┌─────────────────────────────────────────────────────────────────┐
│ packages/core/src/assist/                                       │
│                                                                 │
│  TriggerEngine (deterministic, no LLM)                          │
│   • SESSION_ENDGAME  (≥70% / ≥90%, no READY item)               │
│   • ITEM_ADDED       (new horizon item)                         │
│   • RUNWAY_LOW       (<4h, urgent <2h)                          │
│   • PLAN_APPROVED    (wave plan → approved)                     │
│   • REPLAN_REQUESTED (reoptimize invoked)                       │
│        │ TriggerFiring (passes cooldown/dedupe/quiet/rate gate) │
│        ▼                                                        │
│  ContextAssembler                                               │
│   fleet snapshot · horizon items · wave-plan status ·           │
│   wiki article summaries · MemPalace L0–L2 block ·              │
│   recent accepted/dismissed feedback                            │
│        ▼                                                        │
│  AssistAIClient (Anthropic, mirrors wave-planner ai-client)     │
│   strict-JSON structured output → zod-validated Suggestion      │
│        ▼                                            (no key?)   │
│  AssistService ──────────────► heuristic fallback: server does  │
│   persist assist_suggestions      nothing; existing client      │
│   status lifecycle                useAssistTriggers() renders   │
└──────┬──────────────────────────────────────────────────────────┘
       ▼
 assist_suggestions / assist_settings (SQLite via Drizzle)
       │
       ├── GET  /api/assist/suggestions            (list + config)
       ├── POST /api/assist/suggestions/[id]/accept|dismiss
       ├── GET/PATCH /api/assist/settings          (quiet mode)
       └── SSE /api/events/stream  → assist:suggestion messages
                    ▼
        AgenticAssistPanel (reworked): server suggestions,
        action buttons → existing API calls, quiet toggle
```

**Responsibilities**

| Component | Owns |
|---|---|
| `TriggerEngine` | Pure predicate evaluation over a state snapshot; emits `TriggerFiring` with dedupe key. Deterministic and unit-testable — no I/O beyond reads. |
| `AssistService` | Orchestration: gates (cooldown, rate, quiet, dedupe), context assembly, generation, persistence, lifecycle transitions, feedback recording. |
| `ContextAssembler` | Bounded prompt context (token-budgeted) from DB + wiki + MemPalace + feedback history. |
| `AssistAIClient` | One Anthropic call per suggestion; retry; strict-JSON parse + zod validation; refuses to invent actions outside the whitelist. |
| API routes | Thin delegation; SSE bridge marks `pending → shown`. |
| Panel | Rendering + executing action HTTP calls; falls back to client heuristics when server reports `aiEnabled: false`. |

---

## 4. Data Model

New file `packages/core/src/db/schema/assist.ts`, exported from
`packages/core/src/db/schema/index.ts`.

```ts
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';
import {
  assistTriggerValues,
  assistSeverityValues,
  assistStatusValues,
} from './enums';

// ============================================================================
// Assist Suggestions — generated advice with lifecycle + feedback
// ============================================================================

export const assistSuggestions = sqliteTable(
  'assist_suggestions',
  {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    trigger: text('trigger', { enum: assistTriggerValues }).notNull(),
    severity: text('severity', { enum: assistSeverityValues })
      .notNull().default('info'), // maps to AssistSuggestion.type in the UI
    /** Generated advisory text (≤ 500 chars enforced at generation) */
    message: text('message').notNull(),
    /** Related-item chips: [{ label, type: 'ticket'|'repo'|'keyword', itemId? }] */
    chips: text('chips', { mode: 'json' })
      .$type<{ label: string; type: 'ticket' | 'repo' | 'keyword'; itemId?: string }[]>()
      .default([]),
    /** Suggested actions — each one is an existing API call (see §5.4) */
    actions: text('actions', { mode: 'json' })
      .$type<AssistActionSpec[]>().default([]),
    relatedItemIds: text('related_item_ids', { mode: 'json' })
      .$type<string[]>().default([]),
    status: text('status', { enum: assistStatusValues })
      .notNull().default('pending'), // pending → shown → accepted | dismissed | expired
    /** Stable key for duplicate suppression, e.g. "SESSION_ENDGAME:cku123:90" */
    dedupeKey: text('dedupe_key').notNull(),
    generatedBy: text('generated_by', { enum: ['ai', 'heuristic'] as const })
      .notNull().default('ai'),
    model: text('model'),
    tokensUsed: integer('tokens_used'),
    /** Which action was executed on accept, if any (index into actions) */
    acceptedActionIndex: integer('accepted_action_index'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull().$defaultFn(() => new Date()),
    shownAt: integer('shown_at', { mode: 'timestamp' }),
    resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
  },
  (t) => ({
    statusIdx: index('idx_assist_suggestions_status').on(t.status),
    dedupeIdx: index('idx_assist_suggestions_dedupe')
      .on(t.dedupeKey, t.createdAt),
    createdAtIdx: index('idx_assist_suggestions_created_at').on(t.createdAt),
  })
);

// ============================================================================
// Assist Settings — single-row server-side preferences
// ============================================================================

export const assistSettings = sqliteTable('assist_settings', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  quietMode: integer('quiet_mode').notNull().default(0),
  /** Optional auto-expiry for quiet mode */
  quietUntil: integer('quiet_until', { mode: 'timestamp' }),
  maxSuggestionsPerHour: integer('max_suggestions_per_hour').notNull().default(6),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull().$defaultFn(() => new Date()),
});

export type AssistSuggestionRow = typeof assistSuggestions.$inferSelect;
export type NewAssistSuggestionRow = typeof assistSuggestions.$inferInsert;
export type AssistSettingsRow = typeof assistSettings.$inferSelect;
```

Additions to `packages/core/src/db/schema/enums.ts`:

```ts
export const assistTriggerValues = [
  'SESSION_ENDGAME',   // session ≥70% with no READY spec (≥90% ⇒ urgent)
  'ITEM_ADDED',        // new horizon item created
  'RUNWAY_LOW',        // runway < 4h (<2h ⇒ urgent)
  'PLAN_APPROVED',     // wave plan transitioned to 'approved'
  'REPLAN_REQUESTED',  // reoptimize invoked with constraints
] as const;
export type AssistTrigger = (typeof assistTriggerValues)[number];

export const assistSeverityValues = ['urgent', 'warning', 'confirmation', 'info'] as const;
export type AssistSeverity = (typeof assistSeverityValues)[number];

export const assistStatusValues = ['pending', 'shown', 'accepted', 'dismissed', 'expired'] as const;
export type AssistStatus = (typeof assistStatusValues)[number];
```

**sqlite adapter DDL** — append to `createTableStatements` in
`packages/core/src/db/adapters/sqlite.ts`:

```sql
CREATE TABLE IF NOT EXISTS assist_suggestions (
  id TEXT PRIMARY KEY,
  trigger TEXT NOT NULL CHECK(trigger IN ('SESSION_ENDGAME','ITEM_ADDED','RUNWAY_LOW','PLAN_APPROVED','REPLAN_REQUESTED')),
  severity TEXT NOT NULL DEFAULT 'info' CHECK(severity IN ('urgent','warning','confirmation','info')),
  message TEXT NOT NULL,
  chips TEXT DEFAULT '[]',
  actions TEXT DEFAULT '[]',
  related_item_ids TEXT DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','shown','accepted','dismissed','expired')),
  dedupe_key TEXT NOT NULL,
  generated_by TEXT NOT NULL DEFAULT 'ai' CHECK(generated_by IN ('ai','heuristic')),
  model TEXT,
  tokens_used INTEGER,
  accepted_action_index INTEGER,
  created_at INTEGER NOT NULL,
  shown_at INTEGER,
  resolved_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_assist_suggestions_status ON assist_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_assist_suggestions_dedupe ON assist_suggestions(dedupe_key, created_at);
CREATE INDEX IF NOT EXISTS idx_assist_suggestions_created_at ON assist_suggestions(created_at);

CREATE TABLE IF NOT EXISTS assist_settings (
  id TEXT PRIMARY KEY,
  quiet_mode INTEGER NOT NULL DEFAULT 0,
  quiet_until INTEGER,
  max_suggestions_per_hour INTEGER NOT NULL DEFAULT 6,
  updated_at INTEGER NOT NULL
);
```

---

## 5. API Surface

### 5.1 `GET /api/assist/suggestions`

Query: `status` (comma list, default `pending,shown`), `limit` (default 20, max 100),
`since` (ISO timestamp).

```json
{
  "aiEnabled": true,
  "quietMode": false,
  "suggestions": [
    {
      "id": "cku...",
      "trigger": "SESSION_ENDGAME",
      "severity": "urgent",
      "message": "ENG-391 is at 92% and ng-core has no READY spec. 'Reward model v2' (ENG-395) touches no in-flight files and its wiki page notes it unblocks two Shaping items — promote and plan it now.",
      "chips": [
        { "label": "ENG-391", "type": "ticket" },
        { "label": "ENG-395", "type": "ticket", "itemId": "cku_item1" },
        { "label": "ng-core", "type": "repo" }
      ],
      "actions": [
        { "label": "Promote ENG-395 to Ready", "kind": "promote_item",
          "method": "PATCH", "path": "/api/items/cku_item1", "body": { "zone": "READY" } },
        { "label": "Generate wave plan", "kind": "generate_plan",
          "method": "POST", "path": "/api/items/cku_item1/wave-plan/generate", "body": {} }
      ],
      "relatedItemIds": ["cku_item1"],
      "status": "shown",
      "generatedBy": "ai",
      "createdAt": "2026-07-19T18:04:11Z"
    }
  ]
}
```

`aiEnabled: false` (no API key) tells the client to run its heuristic fallback;
`suggestions` will then only contain history rows, if any. Errors:
`400` bad params; `500 { "error": "Failed to load suggestions" }`.

### 5.2 `POST /api/assist/suggestions/[id]/accept`

Body: `{ "actionIndex": 0 }` (optional; which suggested action the user executed —
the **client** performs the actual action call, then reports acceptance).
Response `200 { "id": "...", "status": "accepted" }`.
Errors: `404` unknown id; `409 { "error": "Suggestion already resolved" }`.

### 5.3 `POST /api/assist/suggestions/[id]/dismiss`

Body: none. Response `200 { "id": "...", "status": "dismissed" }`. Same errors as
accept. Dismissing extends the trigger's dedupe window ×4 (a dismissed suggestion
should not reappear quickly).

### 5.4 Action whitelist (`AssistActionSpec`)

Every generated action MUST be one of these kinds, each mapping to an **existing**
route (validated server-side post-generation; non-conforming actions are dropped):

| kind | method + path template | Existing route file |
|---|---|---|
| `create_item` | `POST /api/items` | `src/app/api/items/route.ts` |
| `promote_item` | `PATCH /api/items/[id]` (body `{ zone }`) | `src/app/api/items/[id]/route.ts` |
| `generate_plan` | `POST /api/items/[id]/wave-plan/generate` | `src/app/api/items/[id]/wave-plan/generate/route.ts` |
| `pause_plan` | `POST /api/wave-plans/[planId]/pause` | Tier 1 deliverable (`spec/trd/01`, ROADMAP item 5) |
| `dispatch_item` | `POST /api/fleet/dispatch/[itemId]` | `src/app/api/fleet/dispatch/[itemId]/route.ts` |

```ts
export interface AssistActionSpec {
  label: string;                       // button text, ≤ 40 chars
  kind: 'create_item' | 'promote_item' | 'generate_plan' | 'pause_plan' | 'dispatch_item';
  method: 'POST' | 'PATCH';
  path: string;                        // concrete path, ids resolved at generation
  body?: Record<string, unknown>;
}
```

### 5.5 Settings — `GET/PATCH /api/assist/settings`

`GET` → `{ "quietMode": false, "quietUntil": null, "maxSuggestionsPerHour": 6 }`.
`PATCH` body: any subset of those fields; creates the singleton row if absent.
Errors: `400` on invalid values (`maxSuggestionsPerHour` 1–60).

### 5.6 Internal trigger evaluation

No public route. `src/lib/assist.ts` exports
`evaluateAssistTriggers(eventType, payload)` which is called (fire-and-forget,
`void`-ed promise with `.catch(console.error)`) from the five event-writing routes
listed in §2 immediately after their `db.insert(activityEvents)` call. RUNWAY_LOW is
additionally evaluated on every `SESSION_PROGRESS`/`SESSION_COMPLETE` evaluation pass
using the same runway math as `src/app/api/fleet/state/route.ts` (extracted, see
AP-W3-T3) — no separate scheduler needed.

### 5.7 SSE — `assist:*` namespace

`src/app/api/events/stream/route.ts` gains one query in its existing 2s poll loop:
`assist_suggestions` with `status = 'pending'` → for each, emit

```json
{ "type": "assist:suggestion", "suggestion": { ...same shape as §5.1 item } }
```

then mark the row `shown` (`shownAt` set) in the same pass. When a suggestion is
resolved (accept/dismiss), the poll also emits
`{ "type": "assist:resolved", "id": "...", "status": "accepted" }` for rows resolved
since the last tick, so multiple clients stay in sync.

---

## 6. Core Services

All under `packages/core/src/assist/` (new), namespaced from
`packages/core/src/index.ts` as `export * as assist from './assist';` (mirrors
`wiki`/`mempalace`/`orchestrator`).

### `types.ts`

```ts
export interface AssistStateSnapshot {
  sessions: { id: string; repo: string; linearTicketId: string; ticketTitle: string;
              status: string; progressPercent: number }[];
  items: { id: string; title: string; zone: string; repo: string;
           linearTicketId?: string | null }[];
  activeWavePlans: { id: string; horizonItemId: string; status: string;
                     currentWaveIndex: number; totalWaves: number }[];
  runwayHours: number;
}

export interface TriggerFiring {
  trigger: AssistTrigger;
  severity: AssistSeverity;
  dedupeKey: string;                    // e.g. 'SESSION_ENDGAME:cku123:90'
  subject: Record<string, unknown>;     // trigger-specific facts for the prompt
}

export interface AssistSuggestionDraft {
  severity: AssistSeverity;
  message: string;
  chips: { label: string; type: 'ticket' | 'repo' | 'keyword'; itemId?: string }[];
  actions: AssistActionSpec[];
  relatedItemIds: string[];
}

export interface AssistServiceConfig {
  apiKey?: string;                      // undefined ⇒ degraded mode
  model: string;                        // default 'claude-sonnet-4-20250514'
  maxTokens: number;                    // default 1024
  cooldownMinutes: Partial<Record<AssistTrigger, number>>; // defaults §6 table
  dedupeWindowMinutes: number;          // default 30
  contextTokenBudget: number;           // default 3000
}
```

### `trigger-engine.ts`

```ts
export class TriggerEngine {
  /** Pure: evaluate all trigger predicates against a snapshot + the causing event. */
  evaluate(
    eventType: 'ITEM_CREATED' | 'SESSION_PROGRESS' | 'SESSION_COMPLETE'
             | 'PLAN_APPROVED' | 'REPLAN_REQUESTED',
    payload: Record<string, unknown>,
    snapshot: AssistStateSnapshot
  ): TriggerFiring[];
}
export function createTriggerEngine(): TriggerEngine;
```

Predicates (deterministic, mirrors + extends the client hook logic in
`AgenticAssistPanel.tsx`):

| Trigger | Fires when | dedupeKey | severity |
|---|---|---|---|
| SESSION_ENDGAME | on SESSION_PROGRESS: session ACTIVE, `progressPercent ≥ 70`, zero READY items | `SESSION_ENDGAME:<sessionId>:<70\|90>` | ≥90 urgent, else warning |
| ITEM_ADDED | on ITEM_CREATED | `ITEM_ADDED:<itemId>` | info |
| RUNWAY_LOW | any evaluation pass with `runwayHours > 0 && < 4` | `RUNWAY_LOW:<floor(runwayHours)>` | <2h urgent, else warning |
| PLAN_APPROVED | on wave-plan status → approved | `PLAN_APPROVED:<wavePlanId>` | confirmation |
| REPLAN_REQUESTED | on reoptimize invocation | `REPLAN_REQUESTED:<wavePlanId>:<version>` | info |

### `context-assembler.ts`

```ts
export class ContextAssembler {
  constructor(opts: { mempalace?: MemPalaceService; tokenBudget?: number });
  /** Markdown context block, hard-capped at tokenBudget (estimateTokens). */
  async assemble(firing: TriggerFiring, snapshot: AssistStateSnapshot): Promise<string>;
}
```

Sections, in priority order until the budget is exhausted:
1. Trigger facts (`firing.subject`, always included).
2. Fleet + horizon snapshot table (compact, ≤ 40 rows).
3. Active wave-plan status lines.
4. Wiki: top 3 `wikiArticles` rows whose title/tags match the firing's repo/item
   keywords (direct Drizzle query; the `WikiCompiler` is not invoked — read-only).
5. MemPalace: `assemblePromptContext({ topicHints: [...repo, ...itemTitleWords] })`
   rendered via `MemPalaceService.renderBlock()` (returns '' when disabled/null).
6. Feedback: last 10 resolved suggestions for this trigger as one-liners —
   `"[accepted] ...msg"` / `"[dismissed] ...msg"` — so generation learns preferences.

### `ai-client.ts`

```ts
export class AssistAIClient {
  constructor(config: { apiKey: string; model: string; maxTokens: number; timeout?: number });
  /** One messages.create call; strict-JSON output; zod-parsed; throws on invalid. */
  async generateSuggestion(prompt: string): Promise<{
    draft: AssistSuggestionDraft;
    tokensInput: number; tokensOutput: number; durationMs: number; model: string;
  }>;
  async generateWithRetry(prompt: string, maxRetries?: number): Promise<...>; // same backoff as WavePlannerAIClient
}
```

The prompt instructs: respond with a single JSON object
`{ severity, message, chips, actions, relatedItemIds }`; actions restricted to the
§5.4 whitelist with concrete ids taken from the provided context; ≤ 2 actions;
message ≤ 500 chars, imperative advisory tone, no markdown. Parsing: extract the
first `{...}` block, `JSON.parse`, validate with a zod schema of
`AssistSuggestionDraft`; invalid actions filtered; if zero valid fields remain,
throw (caller falls back to skipping the suggestion — never a malformed card).

### `service.ts`

```ts
export class AssistService {
  constructor(config?: Partial<AssistServiceConfig>, deps?: {
    mempalace?: MemPalaceService; aiClient?: AssistAIClient;
  });
  get aiEnabled(): boolean;

  /** Full pipeline: gates → assemble → generate → persist. Returns created row or null (gated/degraded/failed). */
  async onEvent(
    eventType: Parameters<TriggerEngine['evaluate']>[0],
    payload: Record<string, unknown>,
    snapshot: AssistStateSnapshot
  ): Promise<AssistSuggestionRow[]>;

  async list(opts?: { statuses?: AssistStatus[]; limit?: number; since?: Date }): Promise<AssistSuggestionRow[]>;
  async markShown(ids: string[]): Promise<void>;
  async accept(id: string, actionIndex?: number): Promise<AssistSuggestionRow>;  // throws NotFound/AlreadyResolved
  async dismiss(id: string): Promise<AssistSuggestionRow>;
  async getSettings(): Promise<AssistSettingsRow>;
  async updateSettings(patch: Partial<Pick<AssistSettingsRow, 'quietMode' | 'quietUntil' | 'maxSuggestionsPerHour'>>): Promise<AssistSettingsRow>;
  /** Expire pending/shown suggestions older than 24h. Called opportunistically from list(). */
  async expireStale(): Promise<number>;
}
export function createAssistService(...): AssistService;
export function getAssistService(): AssistService; // lazy singleton for route usage
```

Gate order in `onEvent` (cheapest first, all before any API spend):
1. **Quiet mode** (`assist_settings.quietMode`, or `quietUntil` in the future) →
   drop all firings, generate nothing (zero cost; the design's quiet banner shows
   dimmed history only).
2. **Dedupe**: an unresolved or recently-resolved row with the same `dedupeKey`
   within `dedupeWindowMinutes` (×4 if it was dismissed) → drop.
3. **Cooldown per trigger**: defaults SESSION_ENDGAME 15 min, ITEM_ADDED 5 min,
   RUNWAY_LOW 30 min, PLAN_APPROVED 0, REPLAN_REQUESTED 0 (confirmations always
   pass; they are cheap and expected).
4. **Rate cap**: count of suggestions created in the trailing hour ≥
   `maxSuggestionsPerHour` → drop (urgent severity is exempt up to 2× the cap).
5. **Degraded mode**: `!aiEnabled` → drop (server generates nothing; the client
   heuristics in `useAssistTriggers()` remain active — see §7).

### `src/lib/assist.ts` (Next app glue)

```ts
export async function evaluateAssistTriggers(
  eventType: 'ITEM_CREATED' | 'SESSION_PROGRESS' | 'SESSION_COMPLETE' | 'PLAN_APPROVED' | 'REPLAN_REQUESTED',
  payload: Record<string, unknown>
): Promise<void>;
```

Builds `AssistStateSnapshot` (sessions, items, active wave plans via Drizzle; runway
via the extracted `computeRunway()` — AP-W3-T3) and calls
`getAssistService().onEvent`. Wrapped in try/catch; assist failures never affect the
calling route's response.

---

## 7. UI

### Reworked `src/components/assist/AgenticAssistPanel.tsx`

- Keeps its export names and `variant: 'overlay' | 'inline'` contract so
  `(main)/page.tsx` and `mission-control/page.tsx` need no changes.
- New data flow: `useAssistSuggestions()` hook (new,
  `src/hooks/useAssistSuggestions.ts`) — initial `GET /api/assist/suggestions`,
  then subscribes to `assist:suggestion` / `assist:resolved` messages via the
  existing SSE stream (extend the switch in `src/hooks/useSSE.ts` to forward
  `assist:*` messages into the uiStore).
- **Fallback (explicit)**: when the API responds `aiEnabled: false`, the panel
  invokes the **existing** `useAssistTriggers()` heuristics exactly as today (the
  hook is retained unmodified apart from being conditionally enabled) and tags those
  cards with a subtle "heuristic" badge. Server rows and heuristic rows never mix:
  heuristics run only in degraded mode.
- `SuggestionCard` rework: renders `actions[]` as buttons (primary style per design
  PROMPT 3 — first action solid blue full-width, second as secondary). Clicking an
  action: button → spinner state → `fetch(action.path, { method, body })` → on 2xx,
  `POST .../accept { actionIndex }` → card flips to a green confirmation state and
  fades; on failure, inline error text with retry. Dismiss link →
  `POST .../dismiss` → remove.
- Chips: `itemId`-bearing chips call `useHorizonStore` selection (jump-to-item);
  repo chips apply the repo filter — matching the design's chip semantics.
- **Quiet mode**: header gains a bell toggle. State from
  `GET /api/assist/settings`, toggled via `PATCH` (persisted server-side, honored
  server-side per §6). When quiet: purple banner
  ("Quiet mode — suggestions paused" + Resume link, per design PROMPT 4), existing
  cards dimmed to 40% and non-interactive.
- States: **loading** (3 skeleton cards), **empty** ("All clear" + fleet summary
  line, per design PROMPT 4), **degraded** (heuristic cards + one-time footer note
  "AI suggestions off — set ANTHROPIC_API_KEY"), **quiet**, **error** (retry
  banner).

### Types & store

- `src/types/index.ts`: extend `AssistSuggestion` with optional
  `serverId?: string`, `trigger?: string`, `actions?: AssistActionView[]`,
  `generatedBy?: 'ai' | 'heuristic'` (existing fields unchanged — client heuristics
  keep compiling).
- `src/stores/uiStore.ts`: add `quietMode: boolean`, `setQuietMode`,
  `resolveAssistSuggestion(serverId, status)`; `assistSuggestions` slice reused for
  both server and heuristic entries.

---

## 8. Config

Env vars (Next app; assist reads them in `getAssistService()`):

| Var | Default | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Shared with wave planner; absent ⇒ degraded mode (`aiEnabled: false`) |
| `ASSIST_MODEL` | `claude-sonnet-4-20250514` | Suggestion model (haiku acceptable for cost) |
| `ASSIST_MAX_TOKENS` | `1024` | Generation cap |
| `ASSIST_MAX_PER_HOUR` | `6` | Default rate cap (settings row overrides) |
| `ASSIST_DEDUPE_WINDOW_MIN` | `30` | Duplicate suppression window |
| `ASSIST_CONTEXT_TOKEN_BUDGET` | `3000` | Context assembler budget |
| `ASSIST_ENABLED` | `true` | Master kill switch: false ⇒ behave as degraded mode |

No config.yaml exists in the repo; env-only, matching the wave-planner pattern
(`WAVE_PLANNER_MODEL` etc.).

---

## 9. Error Handling & Edge Cases

1. **Generation failure** (API error after retries, invalid JSON): suggestion is
   skipped, trigger cooldown is NOT consumed (next event may retry); error logged.
   Never surface a broken card.
2. **Hallucinated actions/ids**: post-generation validation resolves every
   `path`/`itemId` against the snapshot; unknown ids ⇒ action dropped; suggestion
   with zero remaining actions is still valid (advice-only card).
3. **Action execution fails client-side** (e.g. pause route 404 pre-Tier-1-complete):
   card shows the HTTP error inline; suggestion stays `shown` (not auto-accepted).
4. **Race: accept vs dismiss** from two tabs: first write wins;
   second gets 409 and the SSE `assist:resolved` message reconciles both UIs.
5. **Event storm** (e.g. 20 SESSION_PROGRESS callbacks/min): cooldown + dedupe keys
   make evaluation cheap no-ops; context/AI cost only on gate-passing firings.
6. **Quiet mode enabled mid-generation**: in-flight generation completes and persists
   as `pending`; the SSE bridge does not deliver while quiet (delivery check reads
   settings each tick); on resume, pending cards deliver.
7. **MemPalace/wiki unavailable**: `assemblePromptContext` returns null / query
   empty ⇒ sections omitted; generation proceeds (both sources are optional
   enrichment).
8. **DB row vs. client heuristic duplication** in degraded→enabled transition: when
   `aiEnabled` flips true, the client stops heuristic evaluation on the next poll
   (flag from GET) and prunes heuristic-tagged cards.
9. **Stale suggestions**: `expireStale()` marks `pending`/`shown` rows >24h old as
   `expired`; they leave the default list filter.
10. **Payload injection**: suggestion text and wiki/mempalace context originate from
    LLM/user content — rendered as plain text only (no dangerouslySetInnerHTML);
    action buttons only ever call whitelisted paths built server-side.

---

## 10. Testing Strategy

- **Unit (core)** — `packages/core/src/assist/__tests__/`:
  - `trigger-engine.test.ts`: table-driven cases per trigger incl. boundary values
    (69/70/89/90%, 1.9/2.0/3.9/4.0h), READY-item suppression, dedupe key stability.
  - `service.test.ts`: gate ordering (quiet beats dedupe beats cooldown beats rate),
    dismissed-×4 window, urgent rate exemption, degraded mode no-spend
    (assert injected fake AI client never called), accept/dismiss lifecycle + 409,
    expiry. In-memory SQLite.
  - `context-assembler.test.ts`: budget truncation order, mempalace-null path,
    feedback lines included.
  - `ai-client.test.ts`: JSON extraction, zod rejection, action whitelist filtering,
    retry/backoff (mocked SDK — no network).
- **Route tests**: suggestions list (filters, aiEnabled flag), accept/dismiss
  (200/404/409), settings GET/PATCH validation, event-route wiring (spy that
  `evaluateAssistTriggers` is called and route response unchanged when it throws).
- **SSE**: fake-timer test — pending row emitted as `assist:suggestion` once, marked
  shown; resolved row emits `assist:resolved`; quiet mode suppresses delivery.
- **UI**: panel tests for the four states (server, degraded/heuristic, quiet, empty);
  SuggestionCard action flow (fetch → accept call → confirmation state) with mocked
  fetch; regression test that legacy heuristic cards still render.
- **Prompt/eval (manual)**: fixture snapshots for each trigger run against the real
  API behind a `pnpm --filter core test:assist-live` script (skipped without key);
  reviewer sanity-checks tone/action validity.

---

## 11. Acceptance Criteria

- **AP-AC-01**: Creating a horizon item via `POST /api/items` produces (given an API
  key) exactly one `ITEM_ADDED` suggestion row within one evaluation, with
  `generatedBy = 'ai'`, non-empty message, and chips referencing the created item.
- **AP-AC-02**: A `SESSION_PROGRESS` callback at ≥90% with zero READY items yields a
  `SESSION_ENDGAME` suggestion with `severity = 'urgent'`; at 69% it yields nothing;
  with a READY item present it yields nothing.
- **AP-AC-03**: Trigger detection is deterministic: with the AI client mocked out,
  `TriggerEngine.evaluate` outputs identical `TriggerFiring[]` for identical
  snapshots (property test over fixtures) — no LLM involvement pre-generation.
- **AP-AC-04**: Every persisted action passes the §5.4 whitelist: kind ∈ the five
  kinds, path matches the kind's template, ids exist in the snapshot. A mocked
  generation returning a rogue action (`DELETE /api/items/x`) is stored with that
  action stripped.
- **AP-AC-05**: With `quietMode = true`, no suggestions are generated (zero Anthropic
  calls, verified via injected client spy) and the SSE stream delivers nothing;
  toggling off resumes delivery of prior `pending` rows.
- **AP-AC-06**: Rate cap: the 7th non-urgent firing within an hour (default cap 6)
  creates no row; an urgent firing still passes until 12.
- **AP-AC-07**: Re-firing the same dedupeKey within 30 min creates no duplicate; after
  a dismiss, the window is 120 min.
- **AP-AC-08**: Without `ANTHROPIC_API_KEY`: `GET /api/assist/suggestions` returns
  `aiEnabled: false`, the panel renders heuristic cards from the unmodified
  `useAssistTriggers()` logic, and no server rows are created — feature-parity with
  today's behavior.
- **AP-AC-09**: Accept flow: clicking an action button executes exactly the
  suggestion's `method + path + body`, then records `accepted` with the
  `actionIndex`; the row's status survives reload; a second accept returns 409.
- **AP-AC-10**: Feedback loop: after ≥1 accepted and ≥1 dismissed suggestion for a
  trigger, the next assembled context for that trigger contains both one-liners
  (assert on `ContextAssembler.assemble` output).
- **AP-AC-11**: `assist:suggestion` reaches a connected SSE client within 4 s (two
  poll ticks) of row creation, and the row transitions `pending → shown` exactly once.
- **AP-AC-12**: Wiki + MemPalace enrichment: with a seeded wiki article and palace
  wing matching the item's repo, the assembled context contains the article summary
  and the rendered Palace block; with both empty, generation still succeeds.
- **AP-AC-13**: `pnpm run db:check-sync` passes with the two new tables; all five
  event-writing routes still return their pre-existing response shapes when assist
  throws (fault-injection test).

---

## 12. Implementation Plan

### Wave AP-W1 — Schema & Types

- **AP-W1-T1 — Drizzle schema + DDL**
  Files: `packages/core/src/db/schema/assist.ts` (new),
  `packages/core/src/db/schema/enums.ts`, `packages/core/src/db/schema/index.ts`,
  `packages/core/src/db/adapters/sqlite.ts`
  Implement §4 exactly (both tables, enums, indexes, DDL, barrel export). Deps: none.
  Complexity: **M**. Done-check: AP-AC-13 schema-sync portion; typecheck green.
- **AP-W1-T2 — Core assist types module**
  Files: `packages/core/src/assist/types.ts` (new)
  All §6 interfaces (`AssistStateSnapshot`, `TriggerFiring`,
  `AssistSuggestionDraft`, `AssistActionSpec`, `AssistServiceConfig`) plus the zod
  schema for `AssistSuggestionDraft` and the action whitelist validator
  (`validateActionSpec(spec, snapshot): AssistActionSpec | null`). Deps: none
  (imports enum types from schema via type-only import against W1-T1's declared
  exports; files disjoint). Complexity: **S**.
  Done-check: whitelist validator unit tests pass (AP-AC-04 logic).
- **AP-W1-T3 — Client type extensions**
  Files: `src/types/index.ts`
  Extend `AssistSuggestion` per §7 (`serverId?`, `trigger?`, `actions?`,
  `generatedBy?`) + `AssistActionView`. Deps: none. Complexity: **S**.
  Done-check: existing panel compiles unchanged.

### Wave AP-W2 — Engine, Context, AI Client (independent of each other)

- **AP-W2-T1 — TriggerEngine**
  Files: `packages/core/src/assist/trigger-engine.ts` (new)
  Pure predicate table per §6, boundary-exact (≥70, ≥90, <4, <2), dedupe key
  construction. Deps: AP-W1-T2. Complexity: **M**.
  Done-check: AP-AC-02/03 unit tests pass.
- **AP-W2-T2 — ContextAssembler**
  Files: `packages/core/src/assist/context-assembler.ts` (new)
  §6 section assembly with `estimateTokens` budgeting (import from
  `packages/core/src/mempalace/client.ts`), wiki Drizzle query, MemPalace
  `renderBlock`, feedback one-liners. Deps: AP-W1-T1, AP-W1-T2. Complexity: **M**.
  Done-check: AP-AC-10/12 assembler tests pass.
- **AP-W2-T3 — AssistAIClient**
  Files: `packages/core/src/assist/ai-client.ts` (new)
  Anthropic call + prompt template + strict-JSON parse + zod validation + retry,
  mirroring `WavePlannerAIClient` structure (constructor config, GenerationResult
  metadata, exponential backoff). Deps: AP-W1-T2. Complexity: **M**.
  Done-check: ai-client unit tests (mocked SDK) pass incl. rogue-action filtering.

### Wave AP-W3 — Service & Glue

- **AP-W3-T1 — AssistService + barrel + core export**
  Files: `packages/core/src/assist/service.ts` (new),
  `packages/core/src/assist/index.ts` (new), `packages/core/src/index.ts`
  Implement §6 `AssistService` (gate pipeline in the specified order, persistence,
  lifecycle, settings singleton, `expireStale`, lazy `getAssistService`). Deps: all
  AP-W2. Complexity: **L**.
  Done-check: AP-AC-05/06/07 service tests pass with injected fake AI client.
- **AP-W3-T2 — Next glue `evaluateAssistTriggers`**
  Files: `src/lib/assist.ts` (new)
  Snapshot builder (sessions, items, active wave plans, runway via AP-W3-T3's
  `computeRunway`) + fire-and-forget wrapper per §5.6. Deps: AP-W3-T1 declared API
  (same wave, disjoint files, codes against the spec'd export). Complexity: **M**.
  Done-check: unit test — snapshot shape correct; thrown service errors swallowed.
- **AP-W3-T3 — Extract runway computation**
  Files: `src/lib/runway.ts` (new), `src/app/api/fleet/state/route.ts`
  Move the runway math out of the fleet-state route into
  `computeRunway(sessions, readyCount): { runwayHours, runwayStatus }` and re-use it
  in the route (response unchanged). Deps: none. Complexity: **S**.
  Done-check: fleet-state route test output byte-identical to before.

### Wave AP-W4 — API Routes & Event Wiring

- **AP-W4-T1 — Suggestions list route**
  Files: `src/app/api/assist/suggestions/route.ts` (new)
  GET per §5.1 incl. `aiEnabled`/`quietMode` envelope and `expireStale` side-call.
  Deps: AP-W3-T1. Complexity: **S**. Done-check: route tests (filters, degraded flag).
- **AP-W4-T2 — Accept/dismiss routes**
  Files: `src/app/api/assist/suggestions/[id]/accept/route.ts` (new),
  `src/app/api/assist/suggestions/[id]/dismiss/route.ts` (new)
  §5.2/§5.3 semantics (404/409, actionIndex, dismissal dedupe extension). Deps:
  AP-W3-T1. Complexity: **S**. Done-check: AP-AC-09 lifecycle route test passes.
- **AP-W4-T3 — Settings routes**
  Files: `src/app/api/assist/settings/route.ts` (new)
  GET/PATCH per §5.5 with validation. Deps: AP-W3-T1. Complexity: **S**.
  Done-check: settings tests pass; PATCH persists across process restart.
- **AP-W4-T4 — Trigger wiring into event-writing routes**
  Files: `src/app/api/items/route.ts`,
  `src/app/api/orchestrator/status/route.ts`,
  `src/app/api/orchestrator/complete/route.ts`,
  `src/app/api/items/[id]/wave-plan/status/route.ts`,
  `src/app/api/items/[id]/wave-plan/reoptimize/route.ts`
  Insert the `void evaluateAssistTriggers(...)` call after each route's activity
  event insert, mapping route context → eventType/payload per §5.6. No response
  changes. Deps: AP-W3-T2. Complexity: **M**.
  Done-check: AP-AC-13 fault-injection tests pass; AP-AC-01/02 integration tests
  create rows end-to-end with a mocked AI client.
- **AP-W4-T5 — SSE bridge**
  Files: `src/app/api/events/stream/route.ts`
  Add the pending-suggestion query + `assist:suggestion`/`assist:resolved` emission
  + shown-marking + quiet-mode delivery gate to the existing poll loop per §5.7.
  Deps: AP-W3-T1. Complexity: **M**. Done-check: AP-AC-11 fake-timer test passes.

### Wave AP-W5 — UI

- **AP-W5-T1 — useAssistSuggestions hook + SSE forwarding + store**
  Files: `src/hooks/useAssistSuggestions.ts` (new), `src/hooks/useSSE.ts`,
  `src/hooks/index.ts`, `src/stores/uiStore.ts`
  Fetch + subscribe + reconcile per §7; store additions (`quietMode`,
  `resolveAssistSuggestion`). Deps: AP-W4-T1/T5, AP-W1-T3. Complexity: **M**.
  Done-check: hook tests (initial load, SSE append, resolve reconcile, degraded
  flag) pass.
- **AP-W5-T2 — Panel rework**
  Files: `src/components/assist/AgenticAssistPanel.tsx`
  Server-suggestion rendering, action-button execution flow, quiet-mode banner +
  toggle, degraded fallback keeping `useAssistTriggers()` intact, all §7 states.
  Deps: AP-W5-T1 (hook API — same wave, disjoint files, codes against declared
  export). Complexity: **L**.
  Done-check: AP-AC-08/09 UI tests pass; visual pass against design/04 PROMPT 1/3/4.

Total: 5 waves, 15 tasks.
