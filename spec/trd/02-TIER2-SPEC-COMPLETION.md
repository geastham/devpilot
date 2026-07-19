# TRD 02 — Tier 2: Spec Completion
## DAG Modal · Replan Modal · Phase-4 Layouts · Conductor Score Completion · Conversational Mode
### v1.0 · July 2026 · Status: DRAFT

> **Depends on:** `01-TIER1-EXECUTION-LOOP.md` (real dispatch). The DAG modal, wave
> progress states, and chat tool-actions assume dispatch actually runs agents and
> that wave/task statuses advance. Everything in this TRD *renders and edits* real
> data; Tier 1 is what makes that data move. The layouts (Waves 1/3/4 tasks touching
> only `src/components/layouts/*`, `src/components/hud/*`, routing) and the chat
> data model can be built against Tier-1-in-progress, but final acceptance requires
> Tier 1 complete.
>
> Shared conventions, wave protocol, and namespace reservations:
> `spec/trd/00-PROGRAM-OVERVIEW.md`. This TRD owns SSE prefixes `chat:*` and
> `layout:*` and tables `plannerChats` / `plannerChatMessages`.

---

## 1. Problem Statement & Goals

### 1.1 Problem

ROADMAP items 6–9 are the specced-but-unbuilt remainder of `spec/DESIGN.md` Phases
4–5 and `spec/WAVE-PLANNER.md` §11.3 / §9.6:

- Two UI dead-ends ship as `console.log` TODOs on the highest-stakes surface
  (Plan Review): the **View DAG** button and both **Re-plan** buttons.
- Two of four layout variants in the `LayoutSwitcher` silently fall back to
  Gradient Strip; the FloatingHUD state machine exists in the store but has no
  component; there is no Velocity Dashboard.
- The Conductor Score is missing its `parallelizationQuality` dimension even
  though the wave planner already persists every input it needs, and leaderboard
  opt-in (DESIGN §8.2, `design/03-CONDUCTOR-SCORE.md` PROMPT 4) has no mechanism.
- DESIGN Phase 5 (Conversational Mode) has zero commits: no chat data model, no
  chat API, no ThinkAloudPlanner, no FocusedInput sprint mode.

### 1.2 Goals

1. **DAG visualization modal** — wire the existing `DAGVisualization` component
   into a modal opened from `PlanReviewCard`, with node states gray/blue/green/red
   and gold critical-path borders per WAVE-PLANNER §11.3.
2. **Replan constraint modal** — a real constraint-input modal driving the existing
   `POST /api/items/[id]/plan/replan` backend, opened from both `PlanReviewCard`
   and `RefiningCard`.
3. **Phase-4 layouts** — `RunwayTimeline` (Recharts, DESIGN §5.1 Variant D),
   `VelocityDashboard` (design/03 PROMPT 3), `ThreePanelMinimum` (Variant C),
   `FloatingHUD` (DESIGN §12.2, 3 states), and full layout-switcher wiring with
   routes `/timeline` and `/velocity` (DESIGN §12.1).
4. **Conductor Score completion** — `parallelizationQuality` (0–150, WAVE-PLANNER
   §9.6) computed from persisted wave-plan metrics; leaderboard opt-in toggle.
5. **Conversational Mode** — persisted chat (`plannerChats`/`plannerChatMessages`),
   a chat API route running a real Anthropic tool-use loop (conventions of
   `packages/core/src/wave-planner/ai-client.ts`), tool-actions that call the
   existing item/plan API routes, ThinkAloudPlanner split view (C1), FocusedInput
   sprint mode (C2), and system-message rendering.

### 1.3 Non-Goals

- Token-level streaming of chat responses (a chat turn returns as one POST
  response; live updates ride the existing SSE stream). Streaming is future work.
- Drag-to-reprioritize on the RunwayTimeline (DESIGN Variant D mentions it;
  reordering remains available in Gradient Strip; deferred).
- A real multi-user leaderboard service. DevPilot is single-user local; opt-in is
  persisted and honored in the UI, and rank display is gated on it. Server-side
  ranking is future cloud work.
- dagre / d3-dag as a dependency. The shipped `DAGVisualization.tsx` already
  implements a wave-layered layout (waves are natural DAG layers), which satisfies
  §11.3's intent without a new dependency. We keep and finish it. (Documented
  deviation from the "library like dagre or d3-dag" suggestion.)
- Replacing the SSE 2-second DB poll with true push (ROADMAP Phase-3 note; owned
  elsewhere).

---

## 2. Current State (file-cited)

| Area | File | State |
|---|---|---|
| View DAG TODO | `src/components/plan/PlanReviewCard.tsx:76-80` | `handleViewDAG` logs `'View DAG for wave plan:'` — TODO comment at line 78 |
| Replan TODO (review card) | `src/components/plan/PlanReviewCard.tsx:44-47` | `handleReplan` logs `'Replan requested'` — TODO at line 45 |
| Replan TODO (refining card) | `src/components/horizon/RefiningCard.tsx:79-88` | Re-plan button `onClick` TODO at line 84 |
| Replan backend | `src/app/api/items/[id]/plan/replan/route.ts` | **Real.** POST accepts `{ constraint, avoidFiles, preferModel, maxCost }`, versions the plan, returns full plan with `previousPlan` relation |
| Replan store action | `src/stores/horizonStore.ts:282-310` | `requestReplan(id, constraint)` posts `constraint` only — no modal calls it |
| DAG component | `src/components/wave-planner/DAGVisualization.tsx` | Exists, unmounted anywhere. SVG wave-layered layout, zoom, legend, info panel. Bugs: handles nonexistent status `'blocked'`, misses `'dispatched'`/`'retrying'`/`'skipped'`, uses raw Tailwind palette instead of design tokens, no bold critical-path edges |
| Wave-plan read API | `src/app/api/items/[id]/wave-plan/route.ts` | GET returns wavePlan with `waves(tasks)`, `waveTasks`, `dependencyEdges`, `metrics` |
| Critical path API | `src/app/api/items/[id]/wave-plan/critical-path/route.ts` | GET returns computed `criticalPath` with annotations |
| Layout switcher | `src/components/topbar/LayoutSwitcher.tsx` | All 4 variants listed and selectable |
| Layout dispatch | `src/app/(main)/page.tsx:12-17` | `mission-control` renders `MissionControl`; `three-panel` and `timeline` fall back to gradient strip |
| Layout deep link pattern | `src/app/(main)/mission-control/page.tsx` | Pins a layout regardless of saved variant — pattern to replicate for `/timeline`, `/velocity` |
| Existing layout | `src/components/layouts/MissionControl.tsx` | CSS grid `[20%_55%_25%]`, composes `FleetStatusPanel` / `WorkHorizonSurface` / `ActivityFeed` + `AgenticAssistPanel variant="inline"` — house pattern for new layouts |
| HUD state | `src/stores/uiStore.ts:44-45,137-139` | `hudState: 'minimized' | 'quick-add' | 'expanded'` + setter exist; no component, no enable toggle |
| Score schema | `packages/core/src/db/schema/score.ts` | `conductorScores` / `scoreHistory`: five dimensions, `leaderboardRank`; **no** `parallelizationQuality`, **no** opt-in flag |
| Score DDL | `packages/core/src/db/adapters/sqlite.ts:126-151` | Embedded `CREATE TABLE IF NOT EXISTS` DDL — **schema changes must also edit this file**; `IF NOT EXISTS` will not alter existing DBs, so new columns need an explicit `ALTER TABLE` path |
| Score API | `src/app/api/score/route.ts` | Breakdown hardcodes `max: 200` for all five dimensions — contradicts DESIGN §8.1 (250/250/200/200/100) |
| Score inputs | `packages/core/src/db/adapters/sqlite.ts:164-247` | `wave_plans.parallelization_score`, `critical_path_length`, `total_tasks`, `max_parallelism`; `wave_plan_metrics.parallelization_efficiency` — everything §9.6 needs is persisted |
| Score pill | `src/components/topbar/ConductorScorePill.tsx` | Pill only; `title="Click to view score breakdown"` but no expanded card |
| SSE stream | `src/app/api/events/stream/route.ts` | 2s DB poll; emits activity events + `fleet_heartbeat` + `wave_plan_heartbeat`. `activity_events.type` has a SQL `CHECK` constraint (sqlite.ts:156) — adding event types means altering a CHECK, which SQLite cannot do in place |
| AI conventions | `packages/core/src/wave-planner/ai-client.ts` | `@anthropic-ai/sdk`, config `{ apiKey, model, maxTokens, timeout }`, `generateWithRetry` exponential backoff. `ANTHROPIC_API_KEY` read in `src/app/api/items/[id]/wave-plan/generate/route.ts:34` |
| Root deps | `package.json` (repo root) | Monorepo scripts only — **no runtime dependencies declared**. `recharts` exists only in `packages/ui/package.json` (deleted by TRD 03). `@anthropic-ai/sdk` exists only in `packages/core`. The root Next app needs both declared |
| Chat | — | Nothing exists. No `src/components/chat/`, no chat tables, no chat routes |

---

## 3. Architecture

### 3.1 Surface map after this TRD

```
 TopBar ──────────────────────────────────────────────────────────────┐
 │ Runway · FleetPills · [LayoutSwitcher] · [HUD toggle] · ScorePill │
 └──────────────┬────────────────────────────────────┬───────────────┘
                │ (click ScorePill)                  │
                ▼                                    ▼
      ConductorScoreCard (popover)          FloatingHUD (overlay, 3 states)
      6 dims incl parallelizationQuality    MINIMIZED ⇄ QUICK-ADD ⇄ EXPANDED
      leaderboard opt-in toggle             glow <4h · red pulse <2h
      "View Velocity Dashboard →"
                │
   Routes ──────┼──────────────────────────────────────────────
   /            layoutVariant switch: gradient-strip | mission-control
                | three-panel (ThreePanelMinimum) | timeline (RunwayTimeline)
   /timeline    pins RunwayTimeline          /velocity  pins VelocityDashboard
   /mission-control (existing)               /chat      ThinkAloudPlanner (C1)
   /review/:itemId (existing scope)          /sprint    FocusedInput (C2)

   PlanReviewCard ── [View DAG] ──▶ DAGModal( DAGVisualization )
                 └── [Re-plan ↺] ──▶ ReplanModal ──▶ POST /api/items/:id/plan/replan
   RefiningCard ──── [Re-plan ↺] ──▶ ReplanModal (same component)
```

### 3.2 Chat pipeline (Phase 5)

```
 ThinkAloudPlanner (C1)                      FocusedInput (C2)
 ┌───────────────┬───────────────┐           full-screen capture sprint
 │ Chat column   │ Live horizon  │           Enter ⇒ POST /api/items
 │ (40%)         │ (60%)         │           (no AI in the loop)
 └──────┬────────┴───────────────┘
        │ POST /api/chat/:chatId/messages { content }
        ▼
 chat agent loop (src/lib/chat/agent.ts, server-side)
   Anthropic messages.create with tools, max 6 tool iterations
   ┌ tools ──────────────────────────────────────────────┐
   │ create_item      → POST  /api/items                 │
   │ promote_item     → PATCH /api/items/[id]            │
   │ generate_plan    → POST  /api/items/[id]/plan/generate │
   │ list_horizon     → GET   /api/items?zone=           │
   │ get_fleet_state  → GET   /api/fleet/state           │
   └─────────────────────────────────────────────────────┘
        │ persists user / assistant / system rows in plannerChatMessages
        ▼
 SSE stream poll picks up new plannerChatMessages rows
   ⇒ emits `chat:message` events ⇒ useSSE ⇒ chatStore
   (horizon changes made by tools surface through the EXISTING
    activity-event / heartbeat plumbing — the right panel is live for free)
```

**Design decisions (binding):**

- Chat SSE events do **not** go through `activity_events` (its `type` column has a
  SQL CHECK constraint that SQLite cannot alter). The stream route polls
  `planner_chat_messages` directly with its own cursor and emits `chat:message`.
- A chat turn is synchronous: `POST .../messages` returns the completed assistant
  turn (including executed tool calls). SSE is for *other* windows/panels.
- Tool executors call the existing Next API routes via `fetch` against
  `request.nextUrl.origin` — one code path for human and agent actions.
- The `layout:*` SSE prefix is reserved to this TRD but **unused** in v1.0 (layout
  switching is client-local). Do not repurpose it elsewhere.

---

## 4. Data Model

All definitions follow house conventions (`text` cuid2 PK via `createId`, enum
values in `packages/core/src/db/schema/enums.ts`, timestamps as
`integer(..., { mode: 'timestamp' })`, mirrored DDL in
`packages/core/src/db/adapters/sqlite.ts`).

### 4.1 New file `packages/core/src/db/schema/chat.ts`

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { chatModeValues, chatMessageRoleValues } from './enums';

// ============================================================================
// Planner Chats
// ============================================================================

export const plannerChats = sqliteTable('planner_chats', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  title: text('title').notNull().default('New planning session'),
  mode: text('mode', { enum: chatModeValues }).notNull().default('think-aloud'),
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const plannerChatsRelations = relations(plannerChats, ({ many }) => ({
  messages: many(plannerChatMessages),
}));

// ============================================================================
// Planner Chat Messages
// ============================================================================

export interface ChatToolCall {
  tool: string;                       // e.g. 'create_item'
  input: Record<string, unknown>;     // tool input as sent to the executor
  result: 'ok' | 'error';
  summary: string;                    // human-readable, e.g. 'Created item in SHAPING'
  itemId?: string;                    // horizon item affected, when applicable
}

export const plannerChatMessages = sqliteTable('planner_chat_messages', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  chatId: text('chat_id').notNull(),
  role: text('role', { enum: chatMessageRoleValues }).notNull(),
  content: text('content').notNull(),
  toolCalls: text('tool_calls', { mode: 'json' })
    .$type<ChatToolCall[]>()
    .default([]),
  relatedItemIds: text('related_item_ids', { mode: 'json' })
    .$type<string[]>()
    .default([]),
  model: text('model'),               // assistant rows: responding model id
  tokensInput: integer('tokens_input'),
  tokensOutput: integer('tokens_output'),
  error: text('error'),               // set when the turn failed after retries
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const plannerChatMessagesRelations = relations(
  plannerChatMessages,
  ({ one }) => ({
    chat: one(plannerChats, {
      fields: [plannerChatMessages.chatId],
      references: [plannerChats.id],
    }),
  })
);

export type PlannerChat = typeof plannerChats.$inferSelect;
export type NewPlannerChat = typeof plannerChats.$inferInsert;
export type PlannerChatMessage = typeof plannerChatMessages.$inferSelect;
export type NewPlannerChatMessage = typeof plannerChatMessages.$inferInsert;
```

New enum values in `packages/core/src/db/schema/enums.ts`:

```typescript
export const chatModeValues = ['think-aloud', 'focused'] as const;
export type ChatMode = (typeof chatModeValues)[number];

export const chatMessageRoleValues = ['user', 'assistant', 'system'] as const;
export type ChatMessageRole = (typeof chatMessageRoleValues)[number];
```

Export `* from './chat'` in `packages/core/src/db/schema/index.ts`.

### 4.2 Score schema additions — `packages/core/src/db/schema/score.ts`

Add to `conductorScores`:

```typescript
  parallelizationQuality: integer('parallelization_quality').notNull().default(0), // 0–150, WAVE-PLANNER §9.6
  leaderboardOptIn: integer('leaderboard_opt_in', { mode: 'boolean' })
    .notNull()
    .default(false),
```

Add to `scoreHistory`:

```typescript
  parallelizationQuality: integer('parallelization_quality').notNull().default(0),
```

### 4.3 SQLite adapter — `packages/core/src/db/adapters/sqlite.ts`

1. Append to `createTableStatements`:

```sql
-- Planner Chats
CREATE TABLE IF NOT EXISTS planner_chats (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'New planning session',
  mode TEXT NOT NULL DEFAULT 'think-aloud' CHECK(mode IN ('think-aloud', 'focused')),
  archived_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Planner Chat Messages
CREATE TABLE IF NOT EXISTS planner_chat_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES planner_chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tool_calls TEXT NOT NULL DEFAULT '[]',
  related_item_ids TEXT NOT NULL DEFAULT '[]',
  model TEXT,
  tokens_input INTEGER,
  tokens_output INTEGER,
  error TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_planner_chat_messages_chat_id ON planner_chat_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_planner_chat_messages_created_at ON planner_chat_messages(created_at);
```

Score columns are added to the base `CREATE TABLE` DDL for `conductor_scores`
(`parallelization_quality INTEGER NOT NULL DEFAULT 0`,
`leaderboard_opt_in INTEGER NOT NULL DEFAULT 0`) and `score_history`.

2. Because `CREATE TABLE IF NOT EXISTS` never alters an existing DB, add a
   column-migration helper run inside `createSQLiteAdapter` after `exec`:

```typescript
function ensureColumn(
  conn: Database.Database,
  table: string,
  column: string,
  ddl: string // e.g. 'INTEGER NOT NULL DEFAULT 0'
): void {
  const cols = conn
    .pragma(`table_info(${table})`) as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    conn.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}
// invocations:
ensureColumn(sqliteConnection, 'conductor_scores', 'parallelization_quality', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn(sqliteConnection, 'conductor_scores', 'leaderboard_opt_in', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn(sqliteConnection, 'score_history', 'parallelization_quality', 'INTEGER NOT NULL DEFAULT 0');
```

(`ensureColumn` is exported for reuse; TRD 03 uses the same mechanism.)

---

## 5. API Surface

Error envelope everywhere: `{ error: string }` with 4xx/5xx status.

### 5.1 Chat

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/chat` | List chats (query `includeArchived=true` optional). Returns `{ chats: Array<PlannerChat & { messageCount: number; lastMessageAt: string \| null }> }`, newest `updatedAt` first |
| POST | `/api/chat` | Body `{ mode?: 'think-aloud' \| 'focused'; title?: string }` → `201` created `PlannerChat` |
| GET | `/api/chat/[chatId]` | `{ chat: PlannerChat; messages: PlannerChatMessage[] }`, messages ascending by `createdAt` |
| PATCH | `/api/chat/[chatId]` | Body `{ title?: string; archived?: boolean }` (archived toggles `archivedAt`) → updated chat |
| DELETE | `/api/chat/[chatId]` | Deletes chat + messages (cascade). `{ success: true }` |
| POST | `/api/chat/[chatId]/messages` | **The agent turn.** Body `{ content: string }` (1–4000 chars). Persists the user row, runs the tool loop, persists one `system` row per executed tool call and one final `assistant` row. Returns `{ userMessage, systemMessages: PlannerChatMessage[], assistantMessage }`. `503 { error: 'ANTHROPIC_API_KEY not configured' }` when unset. On model failure after retries: persists an assistant row with `error` set and `content` = apology line, returns `502` with that row in the payload |

### 5.2 Velocity

**GET `/api/fleet/velocity?range=24h|7d|30d`** (default `7d`) — powers the
VelocityDashboard and the RunwayTimeline queue math.

```typescript
{
  range: '24h' | '7d' | '30d';
  bucketMinutes: number;              // 60 for 24h, 360 for 7d, 1440 for 30d
  buckets: Array<{
    t: string;                        // bucket start, ISO
    planningTasksPerHour: number;     // PLAN_GENERATED + PLAN_APPROVED activity_events in bucket / bucket hours
    fleetTasksPerHour: number;        // completed_tasks rows in bucket / bucket hours
    runwayHours: number | null;       // latest RUNWAY_UPDATE event metadata.hours in bucket, else null
  }>;
  cost: {                             // plans generated in range
    estimatedUsd: number;             // sum plans.estimated_cost_usd
    baselineUsd: number;              // sum plans.baseline_cost_usd
    savingsUsd: number;
    savingsPercent: number;           // 0 when baseline is 0
  };
  current: { planningTasksPerHour: number; fleetTasksPerHour: number; velocityRatio: number };
}
```

### 5.3 Score

- **GET `/api/score`** (modified, `src/app/api/score/route.ts`) — before building
  the response, recompute `parallelizationQuality` via
  `score.computeParallelizationQuality` (§7.2) and persist it; append a
  `score_history` row if the newest history row is older than 60 minutes.
  Breakdown gains a sixth entry and the per-dimension `max` values are corrected
  to DESIGN §8.1 + WAVE-PLANNER §9.6:
  `fleetUtilization: 250, runwayHealth: 250, planAccuracy: 200,
  costEfficiency: 200, velocityTrend: 100, parallelizationQuality: 150`.
  Response adds top-level `leaderboardOptIn: boolean`; `leaderboardRank` is
  returned as `null` whenever `leaderboardOptIn` is false.
  `total` remains on the 0–1000 scale: `total = min(1000, sum(all six))`
  (parallelizationQuality is a bonus dimension per §9.6).
- **PATCH `/api/score/leaderboard`** (new route file
  `src/app/api/score/leaderboard/route.ts`) — body `{ optIn: boolean }` →
  updates `conductor_scores.leaderboard_opt_in`; when opting out also nulls
  `leaderboard_rank`. Returns `{ leaderboardOptIn, leaderboardRank }`.

### 5.4 SSE additions (`src/app/api/events/stream/route.ts`)

Inside the existing 2-second poll, keep a `lastChatMessageAt` cursor
(initialized to stream-start) and query
`planner_chat_messages WHERE created_at > cursor ORDER BY created_at ASC LIMIT 50`.
For each row emit:

```typescript
{ type: 'chat:message', chatId: string, message: PlannerChatMessage, timestamp: string }
```

No other `chat:*` events in v1.0. `layout:*` reserved, unused.

---

## 6. Core Services & Components

### 6.1 Chat agent (server, Next app)

**`src/lib/chat/client.ts`** — mirrors `ai-client.ts` conventions:

```typescript
export interface ChatClientConfig {
  apiKey: string;    // from process.env.ANTHROPIC_API_KEY
  model: string;     // process.env.CHAT_MODEL ?? 'claude-sonnet-4-20250514'
  maxTokens: number; // parseInt(process.env.CHAT_MAX_TOKENS ?? '4096', 10)
  timeout?: number;
}
export class PlannerChatClient {
  constructor(config: ChatClientConfig);
  // one Anthropic messages.create call, tools passed through, returns raw response
  send(params: {
    system: string;
    messages: Anthropic.MessageParam[];
    tools: Anthropic.Tool[];
  }): Promise<Anthropic.Message>;
  // wraps send with 3-attempt exponential backoff (1s/2s/4s), same as
  // WavePlannerAIClient.generateWithRetry
  sendWithRetry(params: ...): Promise<Anthropic.Message>;
}
```

**`src/lib/chat/tools.ts`** — tool schemas + executors. Executors receive
`{ origin: string }` (from `request.nextUrl.origin`) and `fetch` the existing
routes. Exact tool set:

| Tool name | Input schema | Executor call | Returns to model |
|---|---|---|---|
| `create_item` | `{ title: string; zone?: 'DIRECTIONAL'\|'SHAPING'\|'REFINING'; repo?: string }` | `POST {origin}/api/items` (repo defaults to the most recent horizon item's repo; zone defaults `DIRECTIONAL`) | `{ id, title, zone, repo }` |
| `promote_item` | `{ itemId: string; targetZone: 'SHAPING'\|'REFINING'\|'READY' }` | `PATCH {origin}/api/items/{itemId}` body `{ zone }` | updated `{ id, zone }` |
| `generate_plan` | `{ itemId: string }` | `POST {origin}/api/items/{itemId}/plan/generate` | `{ planId, workstreamCount, taskCount, estimatedCostUsd }` summary |
| `list_horizon` | `{ zone?: Zone }` | `GET {origin}/api/items?zone=` | array of `{ id, title, zone, repo, complexity }` (max 50) |
| `get_fleet_state` | `{}` | `GET {origin}/api/fleet/state` | `{ runway, fleet, sessions: [{id, repo, status, progressPercent}] }` condensed |

Each executed tool also produces a persisted `system` message row, content e.g.
`"Created 'Reward model v2' in SHAPING"`, `toolCalls` = the single `ChatToolCall`,
`relatedItemIds` populated when an item is involved.

**`src/lib/chat/prompts.ts`** — `buildSystemPrompt(snapshot)` where `snapshot` is
zone counts + up to 20 item titles/zones/repos + fleet summary (queried directly
via `@/lib/db`). The prompt states the conductor mental model (DESIGN §2), the
tool contract, and the rule: *never invent ticket IDs, repos, or fleet facts —
use tools to look them up.*

**`src/lib/chat/agent.ts`**:

```typescript
export interface ChatTurnResult {
  systemMessages: PlannerChatMessage[];
  assistantMessage: PlannerChatMessage;
}
export async function runChatTurn(params: {
  chatId: string;
  userContent: string;
  origin: string;
}): Promise<ChatTurnResult>;
```

Loop: load last 40 messages as history → `sendWithRetry` → while
`stop_reason === 'tool_use'` (max **6** iterations): execute each tool call,
persist system rows, feed `tool_result` blocks back → persist final assistant
row with `model`, `tokensInput`/`tokensOutput` accumulated across iterations.
On iteration-limit hit, append a final forced text request (no tools) and use
its output.

### 6.2 Score service (core)

**`packages/core/src/score/parallelization-quality.ts`** (new; plus
`packages/core/src/score/index.ts`; add `export * as score from './score'` to
`packages/core/src/index.ts`):

```typescript
export interface ParallelizationQualityResult {
  total: number;          // 0–150, rounded
  avgPlanScore: number;   // 0–50: avg(wave_plans.parallelization_score) * 50
  criticalPathEfficiency: number; // 0–50: avg(1 - critical_path_length/total_tasks) * 50
  waveUtilization: number;        // 0–50: avg(clamp(wave_plan_metrics.parallelization_efficiency, 0, 1)) * 50
  sampleCount: number;    // wave plans considered
  measured: boolean;      // false when sampleCount === 0 (total = 0)
}
export function computeParallelizationQuality(
  db: Database,
  opts?: { windowDays?: number } // default 30; wave_plans.created_at window,
                                 // statuses: 'completed' | 'executing' | 'approved'
): Promise<ParallelizationQualityResult>;
```

Weights are exactly WAVE-PLANNER §9.6's 50/50/50 table. Guard `total_tasks > 0`;
plans without a metrics row contribute only to the first two components (the
wave-utilization average is over plans that have metrics).

### 6.3 UI components

All components: dark-theme design tokens from `spec/DESIGN.md` §13 /
`tailwind.config.ts`, `'use client'`, named exports, barrel `index.ts` updates
as listed in the task table.

**`src/components/ui/modal.tsx`** (new primitive)
`Modal({ open, onClose, title, size = 'md' | 'lg' | 'full', children })` —
fixed overlay `bg-black/60 backdrop-blur-sm`, centered panel `bg-bg-surface
border border-border-default rounded-xl`, closes on Escape and overlay click,
traps focus, `size='full'` = 90vw × 85vh (used by the DAG modal).

**`src/components/wave-planner/DAGModal.tsx`** (new)

```typescript
export function DAGModal(): JSX.Element | null;
```

Reads `uiStore.dagModalItemId` (§6.4). When set: fetches
`GET /api/items/{itemId}/wave-plan` and
`GET /api/items/{itemId}/wave-plan/critical-path`, renders `Modal size="full"`
titled `"Dependency Graph — {itemTitle}"` containing `DAGVisualization` with
`wavePlan`, `waveTasks`, `dependencyEdges`, `criticalPath` (array of task codes
from the critical-path route). Loading spinner and error state
(`"No wave plan exists for this item"` on 404).

**Fixes inside `src/components/wave-planner/DAGVisualization.tsx`** (edit):

- `getTaskStatusColor`: map exactly the DB statuses
  (`packages/core/src/db/schema/enums.ts` `waveTaskStatusValues`):
  `pending` → gray (`--text-muted` fill), `dispatched`/`running` → blue
  (`--accent-primary`), `completed` → green (`--accent-green`),
  `failed` → red (`--accent-red`), `retrying` → amber (`--accent-amber`),
  `skipped` → gray at 50% opacity. Delete the nonexistent `'blocked'` case.
- Critical path: node border gold (`#EAB308`, 3px) — replace the
  `ring-yellow-500` class approach with an explicit `stroke` on the `rect`
  (SVG `ring-*` classes don't render).
- Edges on the critical path (both endpoints in `criticalPath`, consecutive):
  `strokeWidth 3` + gold stroke; soft edges stay dashed (WAVE-PLANNER §11.3
  edge styles).

**`src/components/plan/ReplanModal.tsx`** (new)

```typescript
export function ReplanModal(): JSX.Element | null;
```

Reads `uiStore.replanModalItemId`. Form (DESIGN §10.3 flow): required
`constraint` textarea (placeholder `"Add constraint or describe what to
change"`), optional chips input `avoidFiles` (comma/Enter separated), optional
`preferModel` dropdown (`HAIKU`/`SONNET`/`OPUS`/none), optional `maxCost`
number. Submit (Enter or button) → `POST /api/items/{itemId}/plan/replan` with
exactly those keys (matches route body at
`src/app/api/items/[id]/plan/replan/route.ts:22`). Pending state
`"Re-planning..."`. On success: update the item's plan in `horizonStore`
(reuse the merge logic of `requestReplan`; extend `requestReplan` signature to
`requestReplan(id, { constraint, avoidFiles?, preferModel?, maxCost? })` and
route the modal through it), close modal, call `uiStore.openDiffView(itemId)`.
Version banner: `PlanReviewCard` shows `"v{n} · re-planned"` chip when
`plan.version > 1`.

**`src/components/layouts/ThreePanelMinimum.tsx`** (new — DESIGN §5.1 Variant C)
Grid `[25%_35%_40%]`, no outer scroll:
- **NOW** (25%): `ActivityFeed` (existing, monospace) above a compact fleet list
  (session id, repo, progress %) — reuse `FleetStatusPanel` with a `compact`
  className.
- **NEXT** (35%): flat list of all horizon items ordered by zone urgency
  (READY → REFINING → SHAPING → DIRECTIONAL) then `priority`. One primary
  action per row: READY → `Dispatch` (`horizonStore.dispatchItem`), REFINING →
  `Review` (`setSelectedItem` + `openConfidencePanel`), SHAPING → `Plan`
  (`POST /api/items/{id}/plan/generate` via horizonStore), DIRECTIONAL →
  `Promote` (`promoteItem(id, 'SHAPING')`).
- **THINK** (40%): large textarea (min 6 rows, 16px) submitting via
  `horizonStore.addItem(value, 'DIRECTIONAL', repo)` (repo = current
  quick-capture repo) + the existing inline response area
  (`uiStore.inlineResponse`).

**`src/components/layouts/RunwayTimeline.tsx`** (new — DESIGN §5.1 Variant D,
Recharts) Time window: now → +12h, hours as the numeric axis (0–12).
- **Top half — session tracks**: Recharts `BarChart layout="vertical"`, one row
  per active session; `XAxis type="number" domain={[0,12]}`; each session bar =
  `estimatedRemainingMinutes / 60` from x=0 (all active work starts "now"),
  filled `--accent-primary`, label `{ticketId} · {repo}`.
- **Bottom half — spec queue**: READY then REFINING items by priority, laid out
  sequentially per repo lane using the stacked-invisible-offset technique (first
  `Bar` transparent = cumulative start offset, second `Bar` = duration). Item
  duration: `complexityMinutes(complexity) / 60` where
  `complexityMinutes = { S: 20, M: velocity.avgCompletionMinutes ?? 45, L: 90, XL: 180 }`
  scaled by `avgCompletionMinutes / 45` (fetched once from
  `/api/fleet/velocity?range=7d`; falls back to the map itself on error).
  READY bars white (`--zone-ready` at 90%), REFINING bars `--zone-refining`.
- `ReferenceLine x={0}` labeled **NOW** (red); **Coverage Gap** = for each repo
  lane, if the session track ends before the queue provides work,
  `ReferenceArea` in `--accent-red` at 15% opacity labeled `COVERAGE GAP`
  (DESIGN §2.2).
- Data: `useFleetState` (sessions/runway already in `fleetStore`) +
  `horizonStore.items`.

**`src/components/velocity/VelocityDashboard.tsx`** (new dir + `index.ts` —
design/03 PROMPT 3) Full page on `--bg-base`:
- Header strip: title, range pills `24h | 7d | 30d` (state local, drives the
  fetch), compact score (from `/api/score`).
- Left column: **Planning vs Fleet Velocity** (`LineChart`, two lines purple
  `--accent-purple` / blue `--accent-primary`, current values annotated) and
  **Runway Over Time** (`AreaChart` with `ReferenceLine` at 4h and 2h; null
  runway buckets rendered as gaps via `connectNulls={false}`), both from
  `GET /api/fleet/velocity?range=`.
- Right column: **Score Breakdown** (six bars incl. parallelizationQuality,
  fill green ≥50% of max, amber ≥25%, red below — design/03 PROMPT 2 rules),
  **Cost Savings** card from the velocity route's `cost` block (PieChart of
  model distribution is out of scope — omit, keep the three numbers + savings
  line). Fleet-utilization heatmap: **out of scope v1.0** (documented cut).

**`src/components/hud/FloatingHUD.tsx`** (new dir + `index.ts` — DESIGN §12.2,
design/06 PROMPTs 3–4) Rendered from `(main)/layout.tsx` when
`uiStore.isHudEnabled`. Fixed bottom-right, `z-[60]`,
`bg-[rgba(6,15,30,0.95)] backdrop-blur-lg`. Three states from the existing
`uiStore.hudState`:
- **MINIMIZED** (220×40 pill): `⧡ DevPilot · Runway: {h}h {dot} · {n} hives · [+]`.
  Runway number colored by status; `[+]` → `setHudState('quick-add')`; pill body
  click → `'expanded'`.
- **QUICK-ADD** (220×130): pill row + mini capture input (submits through
  `horizonStore.addItem`, zone chips `[D][S][R]` bound to
  `uiStore.quickCaptureZone`), Escape → minimized.
- **EXPANDED** (400×600 panel): header (runway + score pill), zone tabs with
  counts, up to 5 compact item rows for the selected tab, up to 3 compact
  session rows, capture input at bottom. Click header → minimized.
- Urgency: `runwayHours < 4` → amber glow (`box-shadow 0 0 12px rgba(245,158,11,.5)`);
  `< 2` → animated red border pulse (reuse `borderPulse` keyframes, DESIGN §13.3)
  and warmer background `rgba(30,10,10,0.95)`. Data from `fleetStore`
  (`runwayHours`, `runwayStatus`, `sessions.length`).

**`src/components/chat/`** (new dir): `ThinkAloudPlanner.tsx` (split
`[40%_60%]`: chat column = header w/ chat picker + `ChatMessageList` +
`ChatComposer`; right = `<WorkHorizonSurface />` live), `ChatMessageList.tsx`
(user right-aligned `--bg-surface`; assistant left `--bg-panel`; system rows via
`SystemMessageRow`), `SystemMessageRow.tsx` (centered muted monospace row,
`✦ {content}`, item chips from `relatedItemIds` that `setSelectedItem` on
click — DESIGN Phase 5 "system message rendering"), `ChatComposer.tsx`
(textarea, Enter submits / Shift+Enter newline, disabled while a turn is
pending, inline error row on 502/503), `FocusedInput.tsx` (C2 sprint mode:
full-screen, giant single input 24px, every Enter →
`horizonStore.addItem(value, 'DIRECTIONAL', repo)` and appends to a session-local
captured list shown below with count + elapsed timer; Escape exits to `/`;
zero AI calls), `index.ts`.

**`src/stores/chatStore.ts`** (new): `chats`, `activeChatId`,
`messagesByChat: Record<string, PlannerChatMessage[]>`, `pendingTurn: boolean`,
actions `loadChats`, `openChat`, `createChat`, `sendMessage(content)` (POST,
optimistic user row, replaces with server rows), `ingestSSEMessage(chatId, msg)`
(dedupe by id). **`src/hooks/useChat.ts`**: thin fetch helpers used by the store.

### 6.4 Store & wiring edits

- `src/stores/uiStore.ts`: add `dagModalItemId: string | null` +
  `openDagModal(itemId)` / `closeDagModal()`; `replanModalItemId: string | null`
  + `openReplanModal(itemId)` / `closeReplanModal()`; `isHudEnabled: boolean`
  (default `false`, persisted in `partialize`) + `toggleHud()`.
- `src/components/plan/PlanReviewCard.tsx`: `handleReplan` →
  `openReplanModal(item.id)` (delete TODO at :45); `handleViewDAG` →
  `openDagModal(item.id)` (delete TODO at :78); render `v{version}` chip.
- `src/components/horizon/RefiningCard.tsx`: Re-plan button →
  `openReplanModal(item.id)` (delete TODO at :84).
- `src/app/(main)/page.tsx`: add `three-panel` → `<ThreePanelMinimum />` and
  `timeline` → `<RunwayTimeline />` branches; delete the fallback comment.
- New pages, each following the `mission-control/page.tsx` deep-link pattern:
  `(main)/timeline/page.tsx`, `(main)/velocity/page.tsx`,
  `(main)/chat/page.tsx`, `(main)/sprint/page.tsx`.
- `(main)/layout.tsx`: mount `<DAGModal />`, `<ReplanModal />`, `<FloatingHUD />`.
- `src/components/topbar/TopBar.tsx`: HUD toggle icon button + `/chat` nav link.
- `src/components/topbar/ConductorScorePill.tsx`: clicking opens a popover
  **ConductorScoreCard** (same file): 48px total, trend arrow vs oldest
  sparkline point, six dimension bars with sparklines from `/api/score`
  `sparklineData`, leaderboard toggle (`PATCH /api/score/leaderboard`), footer
  link `View Velocity Dashboard →` → `/velocity` (design/03 PROMPT 2).
- `src/hooks/useSSE.ts`: handle `chat:message` →
  `chatStore.ingestSSEMessage`.
- `src/types/index.ts`: add `PlannerChat`, `PlannerChatMessage`, `ChatToolCall`,
  `ChatMode`, `VelocityResponse` types mirroring §4/§5.

---

## 7. Config

| Var / key | Default | Used by |
|---|---|---|
| `ANTHROPIC_API_KEY` | — (chat returns 503 without it) | chat agent (existing var) |
| `CHAT_MODEL` | `claude-sonnet-4-20250514` | `src/lib/chat/client.ts` |
| `CHAT_MAX_TOKENS` | `4096` | `src/lib/chat/client.ts` |
| `CHAT_MAX_TOOL_ITERATIONS` | `6` | `src/lib/chat/agent.ts` |
| `SCORE_PARALLELIZATION_WINDOW_DAYS` | `30` | `computeParallelizationQuality` |

Root `package.json` gains runtime deps: `recharts@^2.12.0`,
`@anthropic-ai/sdk` (same major as `packages/core`). No `.devpilot/config.yaml`
keys in this TRD.

---

## 8. Error Handling & Edge Cases

- **Chat without API key** → 503 with actionable error; composer shows a
  persistent hint row. FocusedInput and all layouts never touch the API key.
- **Tool executor failure** (route 4xx/5xx): the tool result fed to the model is
  `{ error }`; the system row records `result: 'error'`; the model may recover
  in the same loop. The turn as a whole still returns 200.
- **Model failure after retries**: assistant row persisted with `error`;
  HTTP 502; composer shows retry affordance (re-sends the same content).
- **Tool loop runaway**: hard cap 6 iterations, then a forced no-tools closing
  call (§6.1).
- **DAG modal, no wave plan** (item approved pre-wave-planner or plan 404):
  modal shows an empty state, no crash — `PlanReviewCard` only shows the button
  when `wavePlan` exists (current behavior preserved).
- **Replan on an executing wave plan**: `PlanReviewCard` already hides Re-plan
  when a wave plan exists (Re-optimize covers that path); `RefiningCard` items
  never have wave plans executing. No new guard needed — assert in tests.
- **Score with no wave plans**: `parallelizationQuality = 0`, `measured: false`;
  the score card renders the row grayed with tooltip "No wave plans yet".
- **Existing DBs**: `ensureColumn` migrates in place at adapter init; fresh DBs
  get the columns from base DDL. Both paths tested.
- **Velocity with sparse data**: empty buckets return 0 rates and `null`
  runway; charts render gaps, not fabricated lines.
- **SSE chat cursor**: stream-start initialization means a reconnecting client
  re-fetches history via `GET /api/chat/[chatId]` (chatStore does this on
  `openChat`), so missed events are not a correctness problem.
- **HUD + QuickCaptureInput overlap**: HUD is bottom-right; the quick-capture
  bar is bottom-center `max-w-2xl` — verified non-overlapping ≥1280px; below
  that the HUD hides its QUICK-ADD state (minimized only).

## 9. Testing Strategy

Runner: vitest (root `vitest.config.ts` for `src/**`; package configs for
`packages/core`). Anthropic SDK is always mocked (`vi.mock('@anthropic-ai/sdk')`).

1. **Unit — score** (`packages/core/tests/unit/parallelization-quality.test.ts`):
   seed an in-memory SQLite via `createSQLiteAdapter(':memory:')` with wave
   plans/metrics; assert component weights (50/50/50), window filtering,
   `measured:false` on empty, `total_tasks=0` guard, and `ensureColumn`
   idempotency on a pre-migration DB fixture.
2. **Unit — chat agent** (`src/lib/chat/__tests__/agent.test.ts`): mocked
   Anthropic returning scripted tool_use sequences; mocked `fetch`; assert tool
   execution order, system-row persistence, iteration cap, retry/backoff on API
   error, 503 path without key.
3. **Route tests** (`src/app/api/__tests__/chat.test.ts`,
   `.../velocity.test.ts`, `.../score.test.ts`): invoke route handlers directly
   with `NextRequest` against a temp SQLite (`DEVPILOT_SQLITE_PATH` to tmp);
   assert response shapes in §5, cascade delete, leaderboard opt-out nulling
   rank, corrected breakdown maxima.
4. **Component smoke** (existing patterns; only where logic is nontrivial):
   `DAGVisualization` status-color mapping table, `ReplanModal` payload
   construction, RunwayTimeline queue-offset math (extracted as a pure function
   `buildQueueLanes()` exported for test).
5. **Manual acceptance script** (documented in the PR): create item → chat
   "promote it and plan it" → watch tools fire → open DAG modal → re-plan with
   constraint → toggle layouts (all four) → enable HUD → `/velocity` renders.

## 10. Acceptance Criteria

- **T2-AC-01** Clicking **View DAG** on a `PlanReviewCard` with a wave plan opens
  a modal rendering every wave task as a node; node colors: gray=pending,
  blue=dispatched/running, green=completed, red=failed; critical-path nodes have
  a gold border; critical-path edges are bold. No `console.log` remains.
- **T2-AC-02** Clicking **Re-plan** on `PlanReviewCard` or `RefiningCard` opens
  the constraint modal; submitting POSTs to `/api/items/[id]/plan/replan` with
  `{ constraint, avoidFiles?, preferModel?, maxCost? }`; the plan version
  increments and the diff view opens.
- **T2-AC-03** The layout switcher renders all four variants for real:
  `three-panel` → ThreePanelMinimum, `timeline` → RunwayTimeline (no more
  gradient-strip fallback in `page.tsx`).
- **T2-AC-04** `/timeline` and `/velocity` routes exist and pin their layouts
  (DESIGN §12.1).
- **T2-AC-05** RunwayTimeline shows a NOW line, per-session tracks, a
  priority-ordered queue, and renders a COVERAGE GAP area when a repo's session
  ends before queued work covers it.
- **T2-AC-06** VelocityDashboard shows planning-vs-fleet velocity and
  runway-over-time charts driven by `GET /api/fleet/velocity`, with working
  24h/7d/30d range switching, plus score breakdown and cost-savings cards.
- **T2-AC-07** FloatingHUD toggles from the TopBar, persists enablement across
  reload, cycles MINIMIZED → QUICK-ADD → EXPANDED per DESIGN §12.2, glows amber
  when runway < 4h and pulses red when < 2h, and QUICK-ADD creates a real item.
- **T2-AC-08** `conductor_scores` has `parallelization_quality` (0–150) computed
  per WAVE-PLANNER §9.6 weights from `wave_plans` + `wave_plan_metrics`;
  `GET /api/score` returns it with `max: 150` and corrected maxima
  (250/250/200/200/100/150); an existing pre-migration DB upgrades in place.
- **T2-AC-09** Leaderboard opt-in is persisted; `leaderboardRank` is `null` in
  API responses whenever opted out; the score card exposes the toggle.
- **T2-AC-10** `POST /api/chat/[chatId]/messages` runs a real Anthropic tool
  loop; asking it to create + promote + plan an item results in real DB rows via
  the existing routes and persisted `system` messages for each action.
- **T2-AC-11** Chat history survives restart: chats and messages load from
  `planner_chats` / `planner_chat_messages` on `/chat`.
- **T2-AC-12** ThinkAloudPlanner shows chat and live horizon side-by-side; an
  item created by the agent appears in the right panel within one SSE poll (≤2s)
  without manual refresh.
- **T2-AC-13** A second browser window on `/chat` receives the assistant/system
  messages via SSE `chat:message`.
- **T2-AC-14** FocusedInput (`/sprint`) captures one DIRECTIONAL item per Enter,
  shows the running list + count, exits on Escape, makes no AI calls.
- **T2-AC-15** With `ANTHROPIC_API_KEY` unset, chat returns 503 with a clear
  error and the rest of the app is unaffected.
- **T2-AC-16** `pnpm build` and the test suite pass; no new TODO markers in
  shipped paths; `docs/API-REFERENCE.md` documents every new route.

## 11. Implementation Plan

Wave protocol per `00-PROGRAM-OVERVIEW.md` §2.2. No two same-wave tasks touch
the same file. Complexity S/M/L.

### Wave 1 — Schema, primitives, dependencies

| ID | Title | Files | Description | Deps | Cx | Done-check |
|---|---|---|---|---|---|---|
| T2-W1-T1 | Chat schema | create `packages/core/src/db/schema/chat.ts`; edit `schema/index.ts`, `schema/enums.ts` | Exact definitions §4.1 incl. relations, `ChatToolCall`, enum values, barrel export | — | S | `pnpm --filter @devpilot.sh/core typecheck`; `plannerChats` importable from `@devpilot.sh/core/db` |
| T2-W1-T2 | Score schema columns | edit `packages/core/src/db/schema/score.ts` | Add `parallelizationQuality` + `leaderboardOptIn` to `conductorScores`, `parallelizationQuality` to `scoreHistory` (§4.2) | — | S | typecheck; `$inferSelect` includes new fields |
| T2-W1-T3 | SQLite DDL + column migration | edit `packages/core/src/db/adapters/sqlite.ts` | Append chat DDL + indexes; add score columns to base DDL; implement + export `ensureColumn`; invoke for the three columns (§4.3) | — | M | New unit: open `:memory:` adapter → both chat tables and all new columns exist; re-open → idempotent |
| T2-W1-T4 | Core score service | create `packages/core/src/score/parallelization-quality.ts`, `packages/core/src/score/index.ts`; edit `packages/core/src/index.ts` | Implement §6.2 exactly (weights 50/50/50, 30-day window, status filter, guards); export `* as score` | — | M | Unit test from §9.1 seeds pass |
| T2-W1-T5 | Modal primitive | create `src/components/ui/modal.tsx`; edit `src/components/ui/index.ts` | §6.3 Modal spec (sizes, Escape/overlay close, focus trap) | — | S | Renders in isolation; Escape closes (component test) |
| T2-W1-T6 | uiStore + types | edit `src/stores/uiStore.ts`, `src/types/index.ts` | Add dagModal/replanModal/isHudEnabled state + actions (§6.4); add chat + velocity types (§5) | — | S | typecheck; `isHudEnabled` in `partialize` |
| T2-W1-T7 | Root deps | edit `package.json` (root); run `pnpm install` | Add `dependencies`: `recharts@^2.12.0`, `@anthropic-ai/sdk` (match `packages/core` version) | — | S | `pnpm install` clean; `import 'recharts'` resolves from `src/` |

### Wave 2 — Backend services & routes

| ID | Title | Files | Description | Deps | Cx | Done-check |
|---|---|---|---|---|---|---|
| T2-W2-T1 | Chat agent lib | create `src/lib/chat/client.ts`, `tools.ts`, `prompts.ts`, `agent.ts` | §6.1 exactly: client config/env, 5 tools with schemas + fetch executors, system prompt builder, `runChatTurn` loop (6-iteration cap, retries, persistence) | W1-T1,T3,T7 | L | §9.2 agent unit tests pass |
| T2-W2-T2 | Chat CRUD routes | create `src/app/api/chat/route.ts`, `src/app/api/chat/[chatId]/route.ts` | §5.1 GET/POST list-create and GET/PATCH/DELETE per-chat (message counts via aggregate query; cascade delete) | W1-T1,T3 | M | Route tests: shapes + cascade |
| T2-W2-T3 | Velocity route | create `src/app/api/fleet/velocity/route.ts` | §5.2 exactly: bucketing (60/360/1440 min), event + completed_tasks aggregation, cost block from `plans` | W1 none (existing tables) | M | Route test with seeded events/tasks matches expected buckets |
| T2-W2-T4 | Score routes | edit `src/app/api/score/route.ts`; create `src/app/api/score/leaderboard/route.ts` | Recompute-on-read + hourly history row; corrected maxima; sixth dimension; opt-in PATCH (§5.3) | W1-T2,T3,T4 | M | Route tests: maxima, bonus-capped total, rank nulling |
| T2-W2-T5 | SSE chat events | edit `src/app/api/events/stream/route.ts` | `planner_chat_messages` cursor poll → `chat:message` per §5.4; cursor starts at stream start; ≤50 rows/poll | W1-T1,T3 | S | Manual: `curl -N /api/events/stream` shows `chat:message` after inserting a row; existing events unaffected |

### Wave 3 — Components

| ID | Title | Files | Description | Deps | Cx | Done-check |
|---|---|---|---|---|---|---|
| T2-W3-T1 | Chat messages route | create `src/app/api/chat/[chatId]/messages/route.ts` | §5.1 POST turn endpoint: validate, persist user row, `runChatTurn`, return `{userMessage, systemMessages, assistantMessage}`; 503/502 paths | W2-T1 | M | Route test with mocked SDK: full turn round-trips |
| T2-W3-T2 | DAG modal + viz fixes | create `src/components/wave-planner/DAGModal.tsx`; edit `DAGVisualization.tsx`, `wave-planner/index.ts` | §6.3: modal fetch/render; status-color table fix, gold `stroke` borders, bold critical edges | W1-T5,T6 | M | Status-map component test; modal renders fixture plan |
| T2-W3-T3 | ReplanModal | create `src/components/plan/ReplanModal.tsx`; edit `plan/index.ts`, `src/stores/horizonStore.ts` | §6.3: form, extended `requestReplan(id, opts)` posting all four keys, success → diff view | W1-T5,T6 | M | Payload unit test; store merge keeps `previousPlan` |
| T2-W3-T4 | ThreePanelMinimum | create `src/components/layouts/ThreePanelMinimum.tsx` | §6.3 Variant C spec (zone-urgency ordering, per-row primary actions, THINK capture) | W1-T6 | M | Renders with store fixtures; action per zone dispatches correct store call (test) |
| T2-W3-T5 | RunwayTimeline | create `src/components/layouts/RunwayTimeline.tsx` | §6.3 Variant D spec; export pure `buildQueueLanes(items, sessions, avgMinutes)` | W1-T7 | L | `buildQueueLanes` unit tests (offsets, coverage gaps) |
| T2-W3-T6 | VelocityDashboard | create `src/components/velocity/VelocityDashboard.tsx`, `velocity/index.ts` | §6.3 dashboard spec; fetches `/api/fleet/velocity` + `/api/score` | W2-T3,T4; W1-T7 | L | Renders all cards from mocked fetch fixtures |
| T2-W3-T7 | FloatingHUD | create `src/components/hud/FloatingHUD.tsx`, `hud/index.ts` | §6.3 HUD spec: 3 states, urgency effects, quick-add via `horizonStore.addItem` | W1-T6 | M | State-cycle component test; glow/pulse classes by runway fixture |
| T2-W3-T8 | Chat UI + store | create `src/components/chat/{ThinkAloudPlanner,ChatMessageList,SystemMessageRow,ChatComposer,FocusedInput,index}.tsx`, `src/stores/chatStore.ts`, `src/hooks/useChat.ts` | §6.3 chat components + §6.4 store (optimistic send, SSE ingest dedupe) | W2-T2; contract of W3-T1 | L | Store unit tests (optimistic replace, dedupe); components render fixtures |

### Wave 4 — Wiring

| ID | Title | Files | Description | Deps | Cx | Done-check |
|---|---|---|---|---|---|---|
| T2-W4-T1 | PlanReviewCard wiring | edit `src/components/plan/PlanReviewCard.tsx` | Replace both TODOs with `openDagModal` / `openReplanModal`; version chip | W3-T2,T3 | S | `grep -n TODO` returns nothing in file; buttons open modals in dev |
| T2-W4-T2 | RefiningCard wiring | edit `src/components/horizon/RefiningCard.tsx` | Replace :84 TODO with `openReplanModal(item.id)` | W3-T3 | S | No TODO; modal opens |
| T2-W4-T3 | Routing + mounts | edit `src/app/(main)/page.tsx`, `(main)/layout.tsx`, `src/components/layouts/index.ts`; create `(main)/timeline/page.tsx`, `(main)/velocity/page.tsx`, `(main)/chat/page.tsx`, `(main)/sprint/page.tsx` | Layout branches; deep-link pages (mission-control pattern); mount DAGModal/ReplanModal/FloatingHUD in layout | W3-T4..T8 | M | All routes 200 in `next build`; switcher renders each variant |
| T2-W4-T4 | Score card popover | edit `src/components/topbar/ConductorScorePill.tsx` | §6.4 expanded card: six bars, sparklines, opt-in toggle, `/velocity` link | W2-T4 | M | Toggle round-trips PATCH; card shows 6 dimensions |
| T2-W4-T5 | TopBar + SSE client | edit `src/components/topbar/TopBar.tsx`, `src/hooks/useSSE.ts` | HUD toggle + `/chat` link; `chat:message` → `chatStore.ingestSSEMessage` | W3-T7,T8 | S | Second-window SSE test (manual, T2-AC-13) |

### Wave 5 — Tests & docs

| ID | Title | Files | Description | Deps | Cx | Done-check |
|---|---|---|---|---|---|---|
| T2-W5-T1 | Core score tests | create `packages/core/tests/unit/parallelization-quality.test.ts` | §9.1 scenarios incl. migration idempotency | W1-T3,T4 | M | `pnpm --filter @devpilot.sh/core test` green |
| T2-W5-T2 | Chat agent tests | create `src/lib/chat/__tests__/agent.test.ts` | §9.2 scenarios (mocked SDK + fetch) | W2-T1, W3-T1 | M | root `pnpm test` green |
| T2-W5-T3 | Route tests | create `src/app/api/__tests__/{chat,velocity,score}.test.ts`; edit `vitest.config.ts` include if needed | §9.3 scenarios on temp SQLite | W2, W3-T1 | M | root `pnpm test` green |
| T2-W5-T4 | Docs | edit `docs/API-REFERENCE.md`, `docs/ROADMAP.md` | Document all §5 routes + SSE `chat:message`; flip ROADMAP items 6–9 status | all | S | Docs mention every new route; ROADMAP updated |

---

### Decisions other TRDs must respect

- SSE `chat:*` is emitted by polling `planner_chat_messages` — **not** via
  `activity_events` (its CHECK constraint is treated as frozen; any TRD adding
  activity event *types* must solve the SQLite CHECK migration first).
- `ensureColumn` in `sqlite.ts` is the sanctioned in-place column-migration
  mechanism (TRD 03 reuses it).
- Root `package.json` now declares app runtime deps (`recharts`,
  `@anthropic-ai/sdk`); TRD 03's hygiene work builds on, and must not revert, this.
- Conductor Score is six-dimensional with `total = min(1000, sum)`;
  `parallelizationQuality` max 150; breakdown maxima 250/250/200/200/100/150.

*TRD 02 · v1.0 · July 2026 · DRAFT*
