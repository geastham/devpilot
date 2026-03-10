# Plan Review Surface — Design Agent Prompt Library

> The highest-stakes interaction in DevPilot. The Conductor sees the Claude Code plan, edits it, and approves — all inline, no modal.

---

## Concept Summary

When a horizon item reaches REFINING, Claude Code Plan Mode has generated a structured plan: parallel workstreams, tasks with model assignments and complexity estimates, cost projections, and file conflict analysis. The Plan Review Surface is where the Conductor decides whether to approve, edit, or re-plan. Speed and clarity are paramount — every second spent reviewing is a second agents could be executing.

---

## Component Anatomy

### Plan Review Card (Inline — rendered inside the Work Horizon canvas)

```
┌─────────────────────────────────────────────────────────────────────┐
│ HEADER                                                              │
│ ENG-394 · Multi-touch Attribution Modeling                         │
│ [ng-pipelines]   Plan Ready — 2 parallel workstreams · 6 tasks     │
│                                         [Re-plan ↺]  [Approve → ] │
├─────────────────────────────────────────────────────────────────────┤
│ BODY — Workstream Layout (two columns)                              │
│ ┌──────────────────────────┬───────────────────────────┐            │
│ │ Workstream A             │ Workstream B              │            │
│ │ ng-pipelines · 2 workers │ ng-core · 1 worker        │            │
│ ├──────────────────────────┼───────────────────────────┤            │
│ │ [Haiku]  attribution_    │ [Sonnet] BQ schema     [M]│            │
│ │          engine.py    [S]│          migration        │            │
│ │ [Sonnet] reward_model [M]│ [Haiku]  dimension     [S]│            │
│ │ [Haiku]  DAG registry [S]│          tables           │            │
│ └──────────────────────────┴───────────────────────────┘            │
│          ↓ Sequential (depends on A + B complete)                   │
│          [Sonnet] Integration tests                            [M] │
├─────────────────────────────────────────────────────────────────────┤
│ FOOTER                                                              │
│ Cost: Haiku ×3: $0.04 · Sonnet ×3: $0.22 · Total: $0.26           │
│       vs all-Sonnet baseline: $0.42 → Saving 38%                  │
│ [▶ Acceptance Criteria (3)]                                        │
│ [▶ Files Touched (8)]                                              │
└─────────────────────────────────────────────────────────────────────┘
```

### Task Row (Editable)

```
[Haiku ▾]  Add attribution_engine.py   [S ▾]   ⚠ in-flight: ENG-391
```

- Model badge dropdown: Haiku (green #10B981) | Sonnet (blue #3B82F6) | Opus (purple #8B5CF6)
- Complexity chip dropdown: S | M | L | XL
- Description: inline text edit on click
- Conflict badge: amber `⚠ in-flight: ENG-391`

### Files Touched List

```
  ● available       ng-pipelines/src/attribution_engine.py
  ⚠ in-flight       ng-pipelines/src/reward_model.py        via ENG-391, ~45min
  ◎ recently-mod    ng-core/schema/dimensions.sql
```

### Plan Diff View (Side-by-Side)

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

### Plan Confidence Panel (Right Slide-In, ~380px)

Sections:
1. Fleet Context Used — what fleet state shaped this plan
2. Memory Surfaced — up to 3 prior session cards with constraints
3. Confidence Signals — traffic light grid (Parallelization, Conflict Risk, Complexity Calibration, Cost Estimate Accuracy)
4. Files Touched — expandable file list

Footer: `[Approve Plan →]` pinned to bottom.

---

## Design Tokens

```css
--model-haiku:     #10B981;   /* green */
--model-sonnet:    #3B82F6;   /* blue */
--model-opus:      #8B5CF6;   /* purple */
--bg-surface:      #1A2E4A;   /* card surface */
--bg-panel:        #060F1E;   /* confidence panel */
--accent-amber:    #F59E0B;   /* conflict warnings */
--accent-red:      #EF4444;   /* removed in diff */
--accent-green:    #10B981;   /* added in diff */
--border:          rgba(255,255,255,0.08);
```

---

## Pre-Generated Design Agent Prompts

### PROMPT 1 — Full Plan Review Card (Inline)

```
Design an inline card component called "Plan Review Card" for a dark-themed developer dashboard called DevPilot. This card appears inside a larger canvas — it is NOT a modal or dialog.

DIMENSIONS: Approximately 720px wide (it sits within a zone column that's ~55% of viewport). Height auto-sizes to content.

BACKGROUND: Card surface #1A2E4A on a deep navy #0F1F3D page. Rounded corners 12px. Thin border rgba(255,255,255,0.08).

HEADER:
- Left: Ticket ID "ENG-394" in secondary text (#94A3B8), followed by "·", followed by title "Multi-touch Attribution Modeling" in primary white text (#F8FAFC), bold
- Below title: repo badge pill "[ng-pipelines]" with colored background, then "Plan Ready — 2 parallel workstreams · 6 tasks · ~$0.26" in secondary text
- Right side: Two buttons — "Re-plan ↺" (ghost/outline style, subtle) and "Approve →" (solid electric blue #3B82F6, prominent, white text)

BODY — WORKSTREAM GRID:
- Two columns side by side, each representing a parallel workstream
- Each column header: "Workstream A" / "Workstream B" in bold white, with "ng-pipelines · 2 workers" / "ng-core · 1 worker" below in muted text
- Thin vertical divider between columns
- Inside each column: task rows stacked vertically

TASK ROW (repeated):
- Left: Model badge — a small rounded pill. "Haiku" gets green (#10B981) background, "Sonnet" gets blue (#3B82F6), "Opus" gets purple (#8B5CF6). White text inside.
- Center: Task description in white text, e.g. "Add attribution_engine.py"
- Right: Complexity chip — small rounded square badge. S=green, M=blue, L=amber, XL=red.
- If conflict exists: amber "⚠ in-flight: ENG-391" text after the complexity chip

SEQUENTIAL TASKS SECTION:
- Below the two-column grid, spanning full width
- A "↓ Sequential (depends on A + B complete)" label in muted text
- One or more task rows below that label

FOOTER:
- Cost breakdown line: "Cost: Haiku ×3: $0.04 · Sonnet ×3: $0.22 · Total: $0.26"
- Savings line: "vs all-Sonnet baseline: $0.42 → Saving 38%" with the savings percentage in green
- Two collapsible section headers: "[▶ Acceptance Criteria (3)]" and "[▶ Files Touched (8)]" — styled as subtle expandable rows

Typography: Inter, 14px body, 12px for badges and metadata, 16px for the title.

Show the card populated with realistic data: 3 tasks in Workstream A, 2 tasks in Workstream B, 1 sequential task. One task should have a conflict warning.
```

### PROMPT 2 — Task Row Edit Mode

```
Design a task row component in two states: READ mode and EDIT mode. This row sits inside a Plan Review Card on a dark background (#1A2E4A card surface).

READ MODE (default):
- Row height: 40px
- Left: Model badge pill (e.g. "Haiku" on green #10B981 background, 12px text, rounded)
- Center: Task description "Add attribution_engine.py" in white (#F8FAFC) 14px
- Right: Complexity chip "[S]" in a small green rounded badge
- Far right (conditional): "⚠ in-flight: ENG-391" in amber text
- Hover: entire row gets a subtle background highlight (rgba(255,255,255,0.04))
- Cursor: pointer on hover

EDIT MODE (triggered by click):
- Row expands slightly in height to ~48px
- Model badge becomes a dropdown selector showing three options in a popover: "Haiku" (green), "Sonnet" (blue), "Opus" (purple) — each as a colored pill. Current selection highlighted.
- Task description becomes an inline text input with a subtle bottom border, editable
- Complexity chip becomes a dropdown: S | M | L | XL options in a small popover, each with its color
- A "Save" micro-button appears on far right, or save-on-blur behavior (show both)
- Below the row: a real-time cost preview line updates: "Task cost: ~$0.04 → ~$0.12" showing the delta

Show both states stacked vertically on a dark card surface. Add a small arrow indicating the transition from read to edit mode.
```

### PROMPT 3 — Plan Diff View (Side-by-Side)

```
Design a side-by-side diff view for comparing two versions of a task plan in DevPilot. This view appears when the Conductor clicks "Re-plan" and a new plan is generated.

LAYOUT: Two columns, equal width, inside a card on dark background (#1A2E4A surface).

LEFT COLUMN — "Previous Plan":
- Header: "Previous Plan" in muted text (#94A3B8), slightly grayed overall
- Task rows rendered normally but with reduced opacity (0.6)
- Removed tasks: red background tint (#EF4444 at 15% opacity), text has strikethrough
- Unchanged tasks: normal rendering but dimmed

RIGHT COLUMN — "Updated Plan":
- Header: "Updated Plan" in white text, full opacity
- Added tasks: green background tint (#10B981 at 15% opacity), with a small "← ADDED" label in green
- Changed model badges: amber highlight ring around the badge
- Changed complexity chips: amber highlight ring around the chip
- Unchanged tasks: normal rendering

DIFF HIGHLIGHTING RULES (annotate):
- Unchanged: white text, normal
- Removed (left only): red background stripe, strikethrough text
- Added (right only): green background stripe
- Changed model: amber glow on the badge
- Changed complexity: amber glow on the chip

SUMMARY LINE below columns:
"1 task removed · 1 dependency added · Cost: $0.26 → $0.24 (–8%)"
The percentage change in green since it's a savings.

BUTTONS below summary:
- Left: "← Back to previous" — ghost/outline button
- Right: "Approve Updated Plan →" — solid electric blue (#3B82F6)

Show realistic data: 5 tasks total, 1 removed, 1 added, 1 with changed model assignment, 2 unchanged.
```

### PROMPT 4 — Plan Confidence Panel (Right Slide-In)

```
Design a right-side slide-in panel called "Plan Confidence" for DevPilot. It appears when a Conductor selects a REFINING item to understand WHY the plan is structured the way it is.

DIMENSIONS: 380px wide, full viewport height. Slides in from the right edge. Dark panel background (#060F1E). Thin left border rgba(255,255,255,0.08).

HEADER: "Plan Confidence" title in white, with a close "×" button on the right.

SECTION 1 — Fleet Context Used:
- Card with subtle surface background (#1A2E4A), rounded corners
- Content:
  "This plan was shaped around the following fleet state:"
  • "ng-pipelines: 2 workers available" (with a small green dot)
  • "ng-core: 1 worker available" (with a small green dot)
  • "Avoided: persona_assignment.py, reward_model.py" (with amber dot)
  • "(in-flight via ENG-391, ~45 min remaining)" in muted text
  • "Workstream B deferred until ENG-391 completes." in italics

SECTION 2 — Memory Surfaced:
- Up to 3 cards stacked vertically, each with subtle border
- Each card: Date + ticket ID header, summary text, "Constraint applied:" label in bold followed by the constraint
- Example: "Mar 4 — ENG-381: Similar attribution work. Lock threshold file caused merge conflict. Constraint applied: do not modify lock_manager.py in same session."

SECTION 3 — Confidence Signals:
- Traffic light grid — 4 rows, 2 columns
- Each row: Dimension name (left), colored dot indicator (right)
  - HIGH = green dot (#10B981)
  - MEDIUM = amber dot (#F59E0B)
  - LOW = red dot (#EF4444)
- Dimensions: Parallelization, Conflict Risk, Complexity Calibration, Cost Estimate Accuracy
- Optional: Show a small radar/spider chart above the grid with the 4 dimensions as axes

SECTION 4 — Files Touched:
- Collapsible section, default collapsed
- When expanded: file list with status indicators (● available in green, ⚠ in-flight in amber, ◎ recently-modified in blue)

FOOTER: Pinned to bottom of panel — "Approve Plan →" full-width button in electric blue (#3B82F6).

Typography: Inter, 13px for panel body text, 11px for metadata. JetBrains Mono for file paths.
```

### PROMPT 5 — Re-plan Constraint Flow

```
Design a 4-frame interaction storyboard showing the Re-plan flow in DevPilot's Plan Review Surface.

FRAME 1 — TRIGGER:
Show a Plan Review Card with the "Re-plan ↺" button highlighted (hover state). The Conductor is about to click it. Card is in normal state on dark background.

FRAME 2 — CONSTRAINT INPUT:
The "Re-plan ↺" button has been clicked. Below the header, a text input field has appeared with a slide-down animation. Placeholder text: "Add constraint or describe what to change". The input has a subtle blue bottom border. A small "Enter to submit" hint appears below the input. The rest of the card remains visible but slightly dimmed.

FRAME 3 — RE-PLANNING:
The constraint has been entered ("Avoid persona_assignment.py — conflict with ENG-391"). The input field shows the submitted text in a disabled state. Below it, a progress indicator: "Re-planning with updated constraints..." with a subtle animated spinner. The workstream grid below is fully dimmed with a frosted overlay.

FRAME 4 — DIFF RESULT:
The Plan Diff View has replaced the workstream grid. Side-by-side comparison showing the previous plan (dimmed, left) vs the updated plan (full contrast, right). One task removed (red strikethrough on left), one dependency added (green highlight on right). Summary line below: "1 task removed · 1 dependency added · Cost: $0.26 → $0.24 (–8%)". Two buttons: "← Back to previous" and "Approve Updated Plan →".

Show all 4 frames in a 2×2 grid. Dark background throughout. Label each frame with step number and description.
```

---

## Design Review Checklist

- [ ] Workstreams are visually separated — parallel structure is immediately obvious
- [ ] Model badges are color-coded and scannable at a glance
- [ ] Conflict warnings (amber ⚠) are visible without requiring interaction
- [ ] Cost breakdown is transparent — total, per-model, and baseline comparison visible
- [ ] Approve button is the most prominent element — dispatch confidence is high
- [ ] Edit mode for task rows feels lightweight (inline, not modal)
- [ ] Diff view clearly distinguishes added, removed, and changed elements
- [ ] Confidence panel provides "why" context without overwhelming
- [ ] No confirmation dialogs in the critical path
- [ ] Sequential task dependencies are visually distinct from parallel tasks
