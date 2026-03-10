# DevPilot — Work Horizon & Plan Review
## Technical Requirements Document · v0.4-draft
> Prepared for coding agent expansion · Open Conjecture · March 2026

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Core Mental Model](#2-core-mental-model)
3. [Data Model](#3-data-model)
4. [Component Architecture](#4-component-architecture)
5. [Work Horizon Surface](#5-work-horizon-surface)
6. [Plan Review Surface (REFINING)](#6-plan-review-surface-refining)
7. [Fleet Status Surface](#7-fleet-status-surface)
8. [Conductor Score](#8-conductor-score)
9. [Agentic Assist Panel](#9-agentic-assist-panel)
10. [Interaction Specifications](#10-interaction-specifications)
11. [State Management](#11-state-management)
12. [Routing & Layout Variants](#12-routing--layout-variants)
13. [Design Tokens & Theme](#13-design-tokens--theme)
14. [Implementation Phases](#14-implementation-phases)
15. [Evaluation Criteria](#15-evaluation-criteria)

---

## 1. System Overview

DevPilot is an **Agent Conductor Platform**. A single technical lead (the "Conductor") manages a fleet of AI coding agents (Ruflo hive sessions) running in parallel across multiple repositories.

**The core bottleneck is planning throughput, not agent capacity.** Agents consume specs faster than a human can write them. DevPilot's entire UX is designed to make the Conductor faster than the fleet.

### 1.1 Key Actors

| Actor | Description |
|---|---|
| **Conductor** | The human technical lead. One person managing the full agent fleet. |
| **Ruflo Session** | An active AI coding agent hive running on a repo. Executes workstreams in parallel. |
| **Planning Agent** | DevPilot's internal agent. Assembles fleet context and invokes Claude Code Plan Mode. |
| **Claude Code Plan Mode** | The spec engine. Generates parallelization-aware task plans (workstreams + tasks + estimates). |

### 1.2 Planning Pipeline (end-to-end)

```
Conductor captures idea (DIRECTIONAL)
    ↓
Conductor promotes to SHAPING
    ↓
Planning Agent assembles fleet context
  - Which Ruflo sessions are active
  - Which files are in-flight (locked)
  - Available worker capacity per repo
    ↓
Planning Agent constructs fleet-aware prompt → Claude Code Plan Mode
    ↓
Plan Mode outputs: workstreams + tasks + complexity estimates + model routing
    ↓
DevPilot elevates plan to /docs/specs/ and into REFINING zone
    ↓
Conductor reviews plan in REFINING (inline or panel)
  - Edit task model assignments
  - Edit complexity estimates
  - Add/remove constraints
  - Request re-plan if needed
    ↓
Conductor approves plan
    ↓
Linear ticket created + Ruflo task graph staged
    ↓
Conductor dispatches (one click)
    ↓
Ruflo hive spawned → agents execute parallel workstreams
```

---

## 2. Core Mental Model

### 2.1 The Work Horizon — 4 Zones

The Work Horizon is a **spatial queue metaphor**: work gets more structured as it moves from right (far/fuzzy) to left (near/ready).

| Zone | Name | Description | Visual Weight | Entry Condition |
|---|---|---|---|---|
| 1 | **READY** | Fully specced. Ruflo task graph staged. Dispatch on one click. | Largest, highest contrast | Conductor approves plan |
| 2 | **REFINING** | Claude Code plan generated. Conductor reviewing. | Medium, soft blue tint | Plan Mode run completes |
| 3 | **SHAPING** | Feature-level intent. Planning agent about to be invoked. | Smaller, purple tint | Conductor promotes from DIRECTIONAL |
| 4 | **DIRECTIONAL** | Rough idea / one-liner. Capture-first, zero structure. | Smallest, low contrast | New item added |

### 2.2 Key Signals

| Signal | Definition | Display Threshold |
|---|---|---|
| **Runway** | Time until READY queue empties at current Ruflo velocity | Always visible. Amber < 4h. Red < 2h. |
| **Idle Warning** | A Ruflo session > 70% complete with no next spec queued | Amber pulse on session card |
| **Idle Imminent** | A Ruflo session > 90% complete with no READY item | Red pulse. "IDLE IMMINENT" badge. |
| **File Conflict** | A file needed by a pending spec is in-flight in an active session | Amber dot / badge on item |
| **Coverage Gap** | A Ruflo session will complete before any READY spec exists | Red zone on timeline view |

---

## 3. Data Model

### 3.1 HorizonItem

```typescript
interface HorizonItem {
  id: string;                        // e.g. "ENG-394"
  title: string;
  zone: 'READY' | 'REFINING' | 'SHAPING' | 'DIRECTIONAL';
  repo: string;                      // e.g. "ng-pipelines"
  complexity: 'S' | 'M' | 'L' | 'XL' | null;
  priority: number;                  // drag-sortable integer
  plan: Plan | null;                 // null unless zone === REFINING or READY
  linearTicketId: string | null;
  createdAt: Date;
  updatedAt: Date;
  conflictingFiles: InFlightFile[];
}
```

### 3.2 Plan

```typescript
interface Plan {
  version: number;                   // increments on re-plan
  previousPlan: Plan | null;         // for diff view
  workstreams: Workstream[];
  sequentialTasks: Task[];           // tasks that depend on all workstreams completing
  estimatedCostUsd: number;
  baselineCostUsd: number;           // all-Sonnet cost for comparison
  acceptanceCriteria: string[];
  filesTouched: TouchedFile[];
  fleetContextSnapshot: FleetContextSnapshot;
  memorySessionsUsed: MemorySession[];
  confidenceSignals: ConfidenceSignals;
  generatedAt: Date;
}
```

### 3.3 Workstream

```typescript
interface Workstream {
  id: string;                        // e.g. "workstream-a"
  label: string;                     // e.g. "Workstream A"
  repo: string;
  workerCount: number;
  tasks: Task[];
}
```

### 3.4 Task

```typescript
interface Task {
  id: string;
  label: string;
  model: 'haiku' | 'sonnet' | 'opus';
  modelOverride: 'haiku' | 'sonnet' | 'opus' | null;  // conductor-set
  complexity: 'S' | 'M' | 'L' | 'XL';
  estimatedCostUsd: number;
  filePaths: string[];
  conflictWarning: string | null;    // e.g. "in-flight: ENG-391"
  dependsOn: string[];               // task IDs
}
```

### 3.5 RufloSession

```typescript
interface RufloSession {
  id: string;
  repo: string;
  linearTicketId: string;
  ticketTitle: string;
  currentWorkstream: string;
  progressPercent: number;           // 0–100
  elapsedMinutes: number;
  estimatedRemainingMinutes: number;
  status: 'active' | 'needs-spec' | 'complete' | 'error';
  inFlightFiles: string[];
  completedTasks: CompletedTask[];   // last N tasks
}
```

### 3.6 FleetState

```typescript
interface FleetState {
  sessions: RufloSession[];
  runwayHours: number;
  runwayStatus: 'healthy' | 'amber' | 'critical';
  conductorScore: ConductorScore;
  avgVelocityTasksPerHour: number;
  planningVelocityPerHour: number;
  velocityRatio: number;             // planning / Ruflo. Goal > 1.0.
}
```

### 3.7 ConductorScore

```typescript
interface ConductorScore {
  total: number;                     // composite 0–1000
  fleetUtilization: number;
  runwayHealth: number;
  planAccuracy: number;
  costEfficiency: number;
  velocityTrend: number;
  leaderboardRank: number | null;    // null if opt-out
}
```

### 3.8 ConfidenceSignals

```typescript
interface ConfidenceSignals {
  parallelization: 'HIGH' | 'MEDIUM' | 'LOW';
  conflictRisk: 'HIGH' | 'MEDIUM' | 'LOW';
  complexityCalibration: 'HIGH' | 'MEDIUM' | 'LOW';
  costEstimateAccuracy: 'HIGH' | 'MEDIUM' | 'LOW';
}
```

### 3.9 Supporting Types

```typescript
interface InFlightFile {
  path: string;
  activeSessionId: string;
  linearTicketId: string;
  estimatedMinutesRemaining: number;
}

interface TouchedFile {
  path: string;
  status: 'available' | 'in-flight' | 'recently-modified';
  inFlightVia?: string;
}

interface MemorySession {
  date: Date;
  ticketId: string;
  summary: string;
  constraintApplied: string;
}

interface FleetContextSnapshot {
  availableWorkers: Record<string, number>;   // repo → count
  avoidedFiles: string[];
  deferredReason: string | null;
}

interface CompletedTask {
  label: string;
  completedAt: Date;
}
```

---

## 4. Component Architecture

### 4.1 Top-Level Component Tree

```
<DevPilotApp>
  ├── <TopBar>
  │     ├── <RunwayIndicator />
  │     ├── <FleetSummaryPills />
  │     └── <ConductorScorePill />
  │
  ├── <WorkHorizonSurface>          ← primary view (multiple layout variants)
  │     ├── <HorizonZone zone="READY" />
  │     ├── <HorizonZone zone="REFINING" />
  │     ├── <HorizonZone zone="SHAPING" />
  │     └── <HorizonZone zone="DIRECTIONAL" />
  │
  ├── <FleetStatusPanel>            ← left sidebar or overlay
  │     └── <RufloSessionCard /> × N
  │
  ├── <PlanReviewSurface>           ← inline card or right panel
  │     ├── <PlanWorkstreamGrid />
  │     ├── <PlanCostBreakdown />
  │     ├── <PlanConfidencePanel />
  │     └── <PlanDiffView />        ← shown after re-plan
  │
  ├── <AgenticAssistPanel />        ← right panel, context-sensitive
  │
  ├── <QuickCaptureInput />         ← always visible, bottom or center
  │
  └── <FloatingHUD />               ← optional minimal overlay mode
```

### 4.2 Zone Component — `<HorizonZone>`

Each zone renders items appropriate to its density and information level:

| Zone | Item Component | Key Fields Shown |
|---|---|---|
| READY | `<ReadyCard>` | Title, repo badge, complexity chip, model routing cost, Dispatch button |
| REFINING | `<RefiningCard>` | Title, workstream count badge, spec completion ring, Review Plan CTA |
| SHAPING | `<ShapingTile>` | Title, one-liner, conflict indicator dot |
| DIRECTIONAL | `<DirectionalRow>` | Title only; Promote button on hover |

---

## 5. Work Horizon Surface

### 5.1 Layout Variants

The Work Horizon can be rendered in four layout modes. The default is **Gradient Strip**. A settings toggle switches modes.

#### Variant A: Gradient Strip (default)
- Full-width horizontal strip
- 4 columns: READY (30%), REFINING (25%), SHAPING (25%), DIRECTIONAL (20%)
- Each column independently scrollable
- Top bar: Runway + Ruflo pills + Conductor Score

#### Variant B: Mission Control
- CSS Grid, full viewport, no outer scroll
- Top strip (5%): Runway | Active hives | Score | System time
- Left column (20%): Fleet Status (Ruflo session rows)
- Center (55%): Work Horizon with zone tabs
- Right column (25%): Activity Feed + Agentic Assist

#### Variant C: Three-Panel Minimum
- NOW panel (25%): Ruflo feed, monospace
- NEXT panel (35%): urgency-ordered flat list, primary action per row
- THINK panel (40%): large capture textarea + inline agent response

#### Variant D: Runway Timeline
- Horizontal timeline (now → +12h)
- Top half: Ruflo hive tracks (Gantt rows)
- Bottom half: Spec queue (READY → DIRECTIONAL bars)
- "NOW" vertical line, Coverage Gap zones, drag-to-reprioritize

### 5.2 ReadyCard Specification

```
┌─────────────────────────────────────────────────────┐
│ [ng-pipelines]  ENG-394                    [M] ~$0.26│
│ Multi-touch Attribution Modeling                     │
│                                          [Dispatch →]│
└─────────────────────────────────────────────────────┘
```

**Fields:**
- Repo badge (color per repo, consistent hash)
- Linear ticket ID
- Title (truncate at 2 lines)
- Complexity chip: `S` | `M` | `L` | `XL` — colored: green/blue/amber/red
- Model routing cost preview: `~$0.26`
- **Dispatch button** — primary accent blue — one click only, no confirmation dialog

**States:**
- Default
- Hover: slight elevation shadow
- Dispatching: button shows spinner, card dims

### 5.3 RefiningCard Specification

```
┌─────────────────────────────────────────────────────┐
│ [ng-pipelines]  ENG-394                              │
│ Multi-touch Attribution Modeling         ◉ 65%       │
│ 2 parallel workstreams · 6 tasks · ~$0.26            │
│                               [Re-plan] [Review Plan]│
└─────────────────────────────────────────────────────┘
```

**Fields:**
- Repo badge + ticket ID
- Title
- Spec completion ring (0–100% — progress of plan generation)
- Workstream count badge
- Task count
- Estimated cost
- `Review Plan` CTA → expands to full Plan Review inline or opens panel

### 5.4 ShapingTile Specification

```
┌─────────────────────────────────────────┐
│ [ng-pipelines]  ● Conflict              │
│ Reward model v2 refinement              │
│ Planning agent ready to invoke          │
└─────────────────────────────────────────┘
```

**Conflict indicator:** amber dot if any files in the item's expected scope are in-flight.

### 5.5 DirectionalRow Specification

```
  Improve persona lock threshold logic    [ng-pipelines]  [→ Promote]
```

Promote button appears on hover. Clicking opens zone selector: `[Shaping] [Refining]`.

### 5.6 Quick Capture Input

Always visible. Behavior:

```
[  What needs to happen next...                          ] [Add]
   Zone: [+ Directional ▾]
```

- `Enter` submits
- `Tab` cycles zone selector
- On submit: item launches upward (brief CSS keyframe animation)
- Agent response appears inline (single line):
  > `→ Added to Directional. ng-core has 1 worker freeing soon — 2 related items in horizon.`
- Response chips: related ticket IDs, clickable

---

## 6. Plan Review Surface (REFINING)

> **This is the highest-stakes interaction in DevPilot.** The Conductor sees the Claude Code plan, edits it if needed, and approves. The UX must maximize: plan clarity, conflict visibility, cost transparency, and dispatch confidence.

### 6.1 Plan Review Card (Inline)

Rendered inline in the Work Horizon canvas. No modal. Full card visible.

#### 6.1.1 Card Header

```
ENG-394 · Multi-touch Attribution Modeling
[ng-pipelines]   Plan Ready — 2 parallel workstreams · 6 tasks · ~$0.26
                                              [Re-plan ↺]  [Approve → ]
```

#### 6.1.2 Card Body — Workstream Layout

Two-column layout for parallel workstreams. Sequential tasks span full width below.

```
┌──────────────────────────────┬──────────────────────────────┐
│ Workstream A                 │ Workstream B                 │
│ ng-pipelines · 2 workers     │ ng-core · 1 worker           │
├──────────────────────────────┼──────────────────────────────┤
│ [Haiku]  attribution_engine  │ [Sonnet] BQ schema migration │
│          .py              [S]│                           [M] │
│ [Sonnet] reward_model.py  [M]│ [Haiku]  dimension tables [S]│
│ [Haiku]  DAG registry     [S]│                              │
└──────────────────────────────┴──────────────────────────────┘
         ↓ Sequential (depends on A + B complete)
         [Sonnet] Integration tests                        [M]
```

#### 6.1.3 Task Row Specification

Each task row is **editable on click**:

```
[Haiku ▾]  Add attribution_engine.py   [S ▾]   ⚠ in-flight: ENG-391
```

- Model badge dropdown: `Haiku` (green) | `Sonnet` (blue) | `Opus` (purple)
- Complexity chip dropdown: `S` | `M` | `L` | `XL`
- Description: inline text edit on click
- Conflict badge: `⚠ in-flight: ENG-391` — amber — appears when file is locked

#### 6.1.4 Card Footer

```
Cost:  Haiku ×3: $0.04  ·  Sonnet ×3: $0.22  ·  Total: $0.26
       vs all-Sonnet baseline: $0.42  →  Saving 38%

[▶ Acceptance Criteria (3)]
[▶ Files Touched (8)]
```

Collapsible sections for Acceptance Criteria and Files Touched.

Files Touched list — each file row:
```
  ● available       ng-pipelines/src/attribution_engine.py
  ⚠ in-flight       ng-pipelines/src/reward_model.py        via ENG-391, ~45min
  ◎ recently-mod    ng-core/schema/dimensions.sql
```

### 6.2 Plan Diff View

Shown when Conductor clicks **Re-plan** or edits a constraint and a new plan is generated.

#### Layout: Side-by-Side Diff

```
┌─────────────────────────────┬─────────────────────────────┐
│ Previous Plan               │ Updated Plan                │
│ (grayed)                    │ (normal)                    │
├─────────────────────────────┼─────────────────────────────┤
│ ~~[Sonnet] Update           │                             │
│   persona_assignment.py [M]~~│  (REMOVED — in-flight)     │
│ [Haiku] attribution_eng  [S]│ [Haiku] attribution_eng  [S]│
│ [Sonnet] BQ migration    [M]│ [Sonnet] BQ migration    [M]│
│                             │ [Sonnet] Wait: ENG-391   [M]│ ← ADDED
└─────────────────────────────┴─────────────────────────────┘

1 task removed · 1 dependency added · Cost: $0.26 → $0.24 (–8%)

[Approve Updated Plan →]                [← Back to previous]
```

**Diff Highlighting Rules:**
- Unchanged: normal white text
- Removed (left only): red background, strikethrough
- Added (right only): green background
- Changed model badge: amber highlight on badge
- Changed complexity: amber highlight on chip

#### Variant: Unified Diff

Single column, interleaved `–` red lines and `+` green lines. Git-style.

### 6.3 Plan Confidence Panel

Right-side slide-in panel (~380px) when a REFINING item is selected. Surfaces *why* the plan is structured as it is.

#### Section 1 — Fleet Context Used

```
This plan was shaped around the following fleet state:
• ng-pipelines: 2 workers available
• ng-core: 1 worker available
• Avoided: persona_assignment.py, reward_model.py
  (in-flight via ENG-391, ~45 min remaining)
Workstream B deferred until ENG-391 completes.
```

#### Section 2 — Memory Surfaced

Up to 3 prior session cards:

```
┌──────────────────────────────────────────────────────┐
│ Mar 4 — ENG-381: Similar attribution work.           │
│ Lock threshold file caused merge conflict.           │
│ Constraint applied: do not modify lock_manager.py    │
│ in same session.                                     │
└──────────────────────────────────────────────────────┘
```

#### Section 3 — Confidence Signals

Traffic light grid:

| Dimension | Signal | Indicator |
|---|---|---|
| Parallelization | HIGH | 🟢 |
| Conflict Risk | LOW | 🟢 |
| Complexity Calibration | MEDIUM | 🟡 |
| Cost Estimate Accuracy | HIGH | 🟢 |

Optional: radar/spider chart variant for visual overview.

#### Section 4 — Files Touched

Expandable. Same format as Plan Review Card footer files list.

**Footer:** `[Approve Plan →]` primary button always pinned to bottom.

---

## 7. Fleet Status Surface

### 7.1 RufloSessionCard

Rendered in a fleet grid or sidebar column.

```
┌─────────────────────────────────────────────────────┐
│ [ng-pipelines]    ENG-391 · Reward model v2         │
│ Workstream A: refactoring r_gcn_model.py            │
│ ████████░░  78%   Elapsed: 42m                      │
│                                         ● active    │
└─────────────────────────────────────────────────────┘
```

**Status variants:**

| Status | Border | Badge |
|---|---|---|
| `active` | Default (none) | Blue dot |
| `needs-spec` (>70%) | Amber pulse | `⚠ NEXT SPEC NEEDED` |
| `idle-imminent` (>90%, no READY) | Red pulse | `🔴 IDLE IMMINENT` |
| `complete` | Dim | Green checkmark |
| `error` | Solid red | `ERROR` |

**Expandable state:** Last 3 completed tasks shown as monospace log rows.

**Mini Timeline variant:** Each session card shows a Gantt row with estimated completion.

### 7.2 Fleet Summary Pills (Top Bar)

```
[ ng-pipelines ████░ 78% ]  [ ng-core ██░░░ 42% ]  [ arthaus ✓ ]
```

Compact pills. Click expands to full Fleet Status panel.

### 7.3 Activity Feed

Live scrolling log (right panel or Mission Control right column):

```
14:32  [ng-pipelines] ENG-391 · Workstream A complete — 3 tasks done
14:29  [ng-core]      ENG-389 dispatched — Ruflo hive spawned
14:27  Plan generated: ENG-394 · 2 workstreams · ~$0.26
14:19  [arthaus]      ENG-388 complete ✓
```

New items slide in from top. Color-coded by event type:
- Completion: green
- Dispatch: blue
- Plan generation: purple
- Error: red
- Idle warning: amber

---

## 8. Conductor Score

### 8.1 Score Composition

```
ConductorScore (0–1000)
├── Fleet Utilization     (0–250)  — % of Ruflo capacity in use
├── Runway Health         (0–250)  — avg runway over session
├── Plan Accuracy         (0–200)  — plan estimates vs actuals
├── Cost Efficiency       (0–200)  — savings vs all-Sonnet baseline
└── Velocity Trend        (0–100)  — velocity ratio trending up/down
```

### 8.2 Score Display Contexts

| Context | Format |
|---|---|
| Top bar pill | `Score: 847` purple pill |
| Expanded card | Full breakdown with sparklines per dimension |
| Velocity Dashboard | Score card with trend arrow |
| Leaderboard | Rank badge (opt-in) |

---

## 9. Agentic Assist Panel

Context-sensitive suggestion panel. Appears as right-side slide-in or inline response.

### 9.1 Trigger Conditions

| Trigger | Example Suggestion |
|---|---|
| Session at 70%+ with no READY spec | `ENG-391 completing — ng-core has 1 worker freeing up. Suggest promoting 'Reward model v2' to Shaping — no conflicting files in-flight.` |
| New item added | `Added to Directional. ng-core has 1 worker freeing soon — 2 related items already in horizon.` |
| Runway drops below 4h | `Runway at 3.8h. 2 items in Shaping could be promoted. ENG-395 has no conflicts — start planning?` |
| Plan approved | `Approved. Linear ticket ENG-394 created. Ruflo task graph staged. Dispatch when ready.` |
| Re-plan requested | `Constraint noted: avoid persona_assignment.py. Invoking Plan Mode with updated fleet context...` |

### 9.2 Related Item Chips

Inline clickable chips that appear in assist responses:

```
[ ENG-388 ]  [ persona-lock ]  [ ng-pipelines ]
```

Clicking jumps to that item or filter.

---

## 10. Interaction Specifications

### 10.1 Dispatch Flow

```
Conductor clicks [Dispatch →] on a READY card
  → Button shows spinner (300ms)
  → Card dims with "Dispatching..." overlay
  → On success: card slides out (left), Activity Feed shows "Hive spawned"
  → Fleet grid gains a new RufloSessionCard (slides in)
  → Runway recalculates
```

No confirmation dialog. One click only.

### 10.2 Promote Flow (DIRECTIONAL → SHAPING)

```
Conductor hovers DIRECTIONAL row
  → [→ Promote] button appears (fade in)
Conductor clicks [→ Promote]
  → Zone selector appears: [Shaping] [Refining]
Conductor selects Shaping
  → Row animates up into SHAPING zone
  → Planning agent begins assembling fleet context (activity indicator on card)
```

### 10.3 Re-plan Flow

```
Conductor clicks [Re-plan ↺] on REFINING card
  → Text field appears: "Add constraint or describe what to change"
  → Conductor types constraint, presses Enter
  → Card shows "Re-planning..." spinner
  → Plan Diff View renders on completion
  → Conductor reviews diff, clicks [Approve Updated Plan →]
```

### 10.4 Quick Capture Flow

```
Conductor types in Quick Capture input
  → Tab cycles zone: Directional → Shaping → Refining
  → Enter submits
  → Item "launches" upward (CSS translateY keyframe, 300ms)
  → Agent response appears above input (single line, fades after 8s unless hovered)
```

### 10.5 Inline Task Edit Flow

```
Conductor clicks task row in Plan Review Card
  → Row enters edit mode inline
  → Model badge becomes dropdown
  → Complexity chip becomes dropdown
  → Description becomes text input
  → [Save] on blur or Enter
  → Cost preview updates in real-time
```

### 10.6 Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+K` | Open Quick Capture / Command Palette |
| `Tab` | Cycle zone selector in Quick Capture |
| `Enter` | Submit in Quick Capture |
| `Escape` | Close panels / collapse expanded states |
| `D` | Focus Dispatch button on selected READY item |
| `R` | Open Review Plan on selected REFINING item |

---

## 11. State Management

### 11.1 Store Shape (Zustand recommended)

```typescript
interface DevPilotStore {
  // Work Horizon
  items: HorizonItem[];
  selectedItemId: string | null;
  
  // Fleet
  fleetState: FleetState;
  
  // UI
  layoutVariant: 'gradient-strip' | 'mission-control' | 'three-panel' | 'timeline';
  assistPanelOpen: boolean;
  confidencePanelItemId: string | null;
  diffViewItemId: string | null;
  
  // Actions
  addItem: (title: string, zone: Zone) => void;
  promoteItem: (id: string, targetZone: Zone) => void;
  dispatchItem: (id: string) => Promise<void>;
  approveplan: (id: string) => Promise<void>;
  requestReplan: (id: string, constraint: string) => Promise<void>;
  updateTaskModel: (itemId: string, taskId: string, model: Model) => void;
  updateTaskComplexity: (itemId: string, taskId: string, complexity: Complexity) => void;
  reorderItems: (zone: Zone, fromIndex: number, toIndex: number) => void;
}
```

### 11.2 Real-Time Updates

Ruflo session state (progress %, status, in-flight files) streams via WebSocket or SSE.

```typescript
// WebSocket message types
type FleetUpdate =
  | { type: 'session_progress'; sessionId: string; progress: number }
  | { type: 'session_complete'; sessionId: string; ticketId: string }
  | { type: 'session_needs_spec'; sessionId: string }
  | { type: 'file_unlocked'; filePath: string; sessionId: string }
  | { type: 'plan_ready'; itemId: string; plan: Plan }
  | { type: 'runway_update'; runwayHours: number; status: RunwayStatus };
```

---

## 12. Routing & Layout Variants

### 12.1 Routes

```
/                     → WorkHorizonSurface (default: gradient-strip layout)
/timeline             → RunwayTimeline layout
/mission-control      → MissionControl layout
/review/:itemId       → Focused PlanReview for a specific item
/velocity             → VelocityDashboard
```

### 12.2 Floating HUD Mode

Toggled independently of route. Renders as a floating widget over any view.

**States:**

| State | Dimensions | Trigger |
|---|---|---|
| MINIMIZED | Pill (~200px × 40px) | Default |
| QUICK-ADD | Pill (~200px × 120px) | Click `[+]` |
| EXPANDED | Panel (400px × 600px) | Click pill body |

MINIMIZED pill content: `⧡ DevPilot  Runway: 4.2h ⚠  6 hives  [+]`

Glow effect when runway < 4h. Pulse animation when runway < 2h.

---

## 13. Design Tokens & Theme

### 13.1 Color Palette (Dark Theme — Primary)

```css
--bg-base:        #0F1F3D;   /* main background */
--bg-panel:       #060F1E;   /* deeper panels */
--bg-surface:     #1A2E4A;   /* card surfaces */

--zone-ready:     #FFFFFF;   /* READY cards — full contrast */
--zone-refining:  #DBEAFE;   /* soft blue */
--zone-shaping:   #EDE9FE;   /* soft purple */
--zone-directional:#F3F4F6;  /* near-white / muted */

--accent-primary: #3B82F6;   /* electric blue — dispatch, CTAs */
--accent-amber:   #F59E0B;   /* warnings, needs-spec */
--accent-red:     #EF4444;   /* critical, idle-imminent */
--accent-green:   #10B981;   /* complete, healthy runway */
--accent-purple:  #8B5CF6;   /* conductor score, plan events */

--model-haiku:    #10B981;   /* green */
--model-sonnet:   #3B82F6;   /* blue */
--model-opus:     #8B5CF6;   /* purple */

--text-primary:   #F8FAFC;
--text-secondary: #94A3B8;
--text-muted:     #475569;

--border:         rgba(255,255,255,0.08);
--border-amber:   rgba(245,158,11,0.6);
--border-red:     rgba(239,68,68,0.6);
```

### 13.2 Typography

- **UI:** `Inter` (system-ui fallback)
- **Monospace (Fleet/Activity):** `JetBrains Mono`, `Fira Code`, `monospace`
- **Scale:** 12px base for dense panels, 14px default, 16px primary inputs, 24px+ for runway number

### 13.3 Motion

```css
/* Item launch on add */
@keyframes itemLaunch {
  0%   { transform: translateY(0); opacity: 1; }
  60%  { transform: translateY(-40px); opacity: 0.6; }
  100% { transform: translateY(0); opacity: 0; }
}

/* Card pulse for amber/red states */
@keyframes borderPulse {
  0%, 100% { box-shadow: 0 0 0 0 var(--pulse-color); }
  50%       { box-shadow: 0 0 0 4px var(--pulse-color); }
}

/* Feed item slide-in */
@keyframes slideInFromTop {
  from { transform: translateY(-8px); opacity: 0; }
  to   { transform: translateY(0); opacity: 1; }
}
```

---

## 14. Implementation Phases

### Phase 1 — Core Work Horizon (Week 1–2)

**Goal:** Conductor can see, manage, and interact with all 4 zones.

- [ ] `HorizonItem` data model + mock data seed (NeuroGraph domain language)
- [ ] `WorkHorizonStrip` — gradient strip layout with 4 zone columns
- [ ] `ReadyCard`, `RefiningCard`, `ShapingTile`, `DirectionalRow` components
- [ ] `QuickCaptureInput` — add items, zone selector, submit animation
- [ ] `TopBar` — Runway indicator (color-coded), Fleet summary pills, Score pill
- [ ] Promote flow (hover → zone selector → animation)
- [ ] Dispatch flow (one-click, spinner, card exit animation)
- [ ] Zustand store: items CRUD, zone transitions

### Phase 2 — Plan Review Surface (Week 2–3)

**Goal:** Conductor can review, edit, and approve Claude Code plans inline.

- [ ] `PlanReviewCard` — inline two-column workstream layout
- [ ] Task row edit mode (model dropdown, complexity dropdown, description edit)
- [ ] Cost breakdown + baseline comparison footer
- [ ] Files Touched collapsible list with status indicators
- [ ] Conflict badge (`⚠ in-flight: ENG-391`) on affected tasks
- [ ] `PlanConfidencePanel` — right slide-in panel, all 4 sections
- [ ] `PlanDiffView` — side-by-side diff with color highlighting
- [ ] Re-plan constraint input flow
- [ ] Real-time cost preview update on task edits

### Phase 3 — Fleet Awareness (Week 3–4)

**Goal:** Conductor never loses sight of what the fleet is doing.

- [ ] `RufloSessionCard` — all status variants + pulse animations
- [ ] Fleet grid layout (B1 variant)
- [ ] `ActivityFeed` — live log, slide-in animation, color coding
- [ ] `AgenticAssistPanel` — trigger conditions + suggestion rendering
- [ ] WebSocket/SSE integration for real-time fleet updates
- [ ] Runway recalculation on fleet events

### Phase 4 — Alternative Layouts & Score (Week 4–5)

**Goal:** Power user layouts + Conductor Score fully instrumented.

- [ ] `MissionControl` layout (B2)
- [ ] `ThreePanelMinimum` layout (E1)
- [ ] `RunwayTimeline` with Recharts (D1)
- [ ] `VelocityDashboard` with sparklines (D2)
- [ ] `FloatingHUD` — all 3 states + transitions (E2)
- [ ] `ConductorScore` — full breakdown card + leaderboard opt-in
- [ ] Layout switcher in settings/nav

### Phase 5 — Conversational Mode (Week 5–6)

**Goal:** Think-aloud planning via chat.

- [ ] `ThinkAloudPlanner` — split chat + live horizon (C1)
- [ ] System message rendering (promotion, plan generation events)
- [ ] Chat history persistence
- [ ] `FocusedInput` generation sprint mode (C2)

---

## 15. Evaluation Criteria

A built feature passes review if it satisfies the following:

| Dimension | Pass Criteria | Fail Signal |
|---|---|---|
| **Planning Speed** | New idea captured in < 5 seconds from thought | More than 2 clicks or any form fields for rough capture |
| **Fleet Awareness** | Ruflo session status visible without any context switch | Fleet status requires opening separate view |
| **Plan Clarity** | Workstreams immediately distinguishable; model + complexity visible per task | Plan is a wall of text; no visual workstream separation |
| **Dispatch Confidence** | Approve + Dispatch in ≤ 2 clicks from plan review | Confirmation dialogs; any context switch required |
| **Runway Clarity** | Runway status obvious at a glance without reading a number | Runway only shown as a number, no color / visual encoding |
| **Conflict Visibility** | In-flight file conflicts visible *before* conductor approves plan | Conflicts only discoverable post-dispatch |
| **Cost Transparency** | Model routing cost visible before dispatch | Cost only visible after session completes |
| **Cognitive Load** | UI reduces mental overhead vs ad-hoc planning | More UI = more forced decisions on the conductor |
| **Conductor Score** | Score visible on primary surface without navigation | Score requires opening separate metrics view |

---

*DevPilot Work Horizon TRD · v0.4-draft · Open Conjecture · March 2026*
*Source: Work Horizon UX Design Agent Prompt Library v1.1*