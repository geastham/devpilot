# Fleet Status Surface — Design Agent Prompt Library

> The Conductor's eyes on the fleet. Real-time awareness of every active Ruflo hive session, their progress, and what comes next.

---

## Concept Summary

The Fleet Status Surface gives the Conductor persistent visibility into every active Ruflo session. It answers three questions at a glance: What is running? How far along is it? What's about to need attention? The surface exists in multiple contexts — as a sidebar panel, as fleet summary pills in the top bar, and as the left column in Mission Control layout.

---

## Component Anatomy

### RufloSessionCard

```
┌─────────────────────────────────────────────────────┐
│ [ng-pipelines]    ENG-391 · Reward model v2         │
│ Workstream A: refactoring r_gcn_model.py            │
│ ████████░░  78%   Elapsed: 42m                      │
│                                         ● active    │
└─────────────────────────────────────────────────────┘
```

**Status Variants:**

| Status | Border Treatment | Badge |
|---|---|---|
| `active` | Default (none) | Blue dot |
| `needs-spec` (>70%) | Amber pulse animation | `⚠ NEXT SPEC NEEDED` |
| `idle-imminent` (>90%, no READY) | Red pulse animation | `🔴 IDLE IMMINENT` |
| `complete` | Dim opacity | Green checkmark |
| `error` | Solid red border | `ERROR` |

**Expandable State:** Last 3 completed tasks shown as monospace log rows.

### Fleet Summary Pills (Top Bar)

```
[ ng-pipelines ████░ 78% ]  [ ng-core ██░░░ 42% ]  [ arthaus ✓ ]
```

Compact rounded rectangles. Click expands to full Fleet Status panel.

### Activity Feed

```
14:32  [ng-pipelines] ENG-391 · Workstream A complete — 3 tasks done
14:29  [ng-core]      ENG-389 dispatched — Ruflo hive spawned
14:27  Plan generated: ENG-394 · 2 workstreams · ~$0.26
14:19  [arthaus]      ENG-388 complete ✓
```

Color coding by event type:
- Completion: green (#10B981)
- Dispatch: blue (#3B82F6)
- Plan generation: purple (#8B5CF6)
- Error: red (#EF4444)
- Idle warning: amber (#F59E0B)

New items slide in from top.

---

## Design Tokens

```css
--bg-panel:        #060F1E;
--bg-surface:      #1A2E4A;
--status-active:   #3B82F6;
--status-warning:  #F59E0B;
--status-critical: #EF4444;
--status-complete: #10B981;
--border:          rgba(255,255,255,0.08);
--border-amber:    rgba(245,158,11,0.6);
--border-red:      rgba(239,68,68,0.6);
```

---

## Pre-Generated Design Agent Prompts

### PROMPT 1 — RufloSessionCard: All Status Variants

```
Design a card component called "RufloSessionCard" that represents an active AI coding agent session. Show 5 variants of this card, one for each status state, stacked vertically on a dark background (#060F1E).

CARD DIMENSIONS: ~400px wide, ~120px tall. Rounded corners 8px. Background: #1A2E4A.

COMMON ELEMENTS (all variants):
- Top row: Colored repo badge pill (e.g. "ng-pipelines"), ticket ID "ENG-391", title "Reward model v2" — all on one line
- Second row: Current workstream label "Workstream A: refactoring r_gcn_model.py" in monospace font (JetBrains Mono), secondary text color (#94A3B8)
- Third row: Progress bar (filled/unfilled segments), percentage "78%", elapsed time "Elapsed: 42m"
- Bottom right: Status indicator

VARIANT 1 — ACTIVE:
- Progress bar fill: electric blue (#3B82F6)
- Status: small blue dot with "active" label
- Normal border (rgba(255,255,255,0.08))
- Progress at 78%

VARIANT 2 — NEEDS-SPEC (>70%):
- Progress bar fill: amber (#F59E0B)
- Status: amber pulsing dot with "⚠ NEXT SPEC NEEDED" badge in amber
- Border: amber, with a subtle pulsing glow animation (show glow state)
- Progress at 85%
- The card should feel like it's asking for attention

VARIANT 3 — IDLE IMMINENT (>90%, no READY item):
- Progress bar fill: red (#EF4444)
- Status: red pulsing dot with "IDLE IMMINENT" badge in red, bold
- Border: red, aggressive pulse animation (show glow state)
- Progress at 94%
- This card should feel urgent — the fleet is about to have a gap

VARIANT 4 — COMPLETE:
- Progress bar fill: green (#10B981), fully filled
- Status: green checkmark "✓ complete"
- Overall card opacity reduced to 0.6 — dimmed
- Progress at 100%
- Border: none

VARIANT 5 — ERROR:
- Progress bar fill: red, stopped at whatever percentage
- Status: "ERROR" badge in red with solid red border
- An error description line below the progress: "Build failure in test suite" in red text
- Progress at 67%

Typography: Inter for labels, JetBrains Mono for workstream description and progress details.

For the pulsing variants (NEEDS-SPEC and IDLE IMMINENT), show a subtle CSS box-shadow glow animation radiating from the card border. The pulse should be smooth and rhythmic, not jarring.
```

### PROMPT 2 — Fleet Status Sidebar Panel

```
Design a sidebar panel called "Fleet Status" for DevPilot. This panel shows all active Ruflo sessions stacked vertically.

DIMENSIONS: 360px wide, full viewport height. Positioned on the left side of the screen. Background: #060F1E (deep panel). Thin right border: rgba(255,255,255,0.08).

HEADER: "Fleet Status" title in white (#F8FAFC), 16px bold. Right side: session count "4 sessions" in muted text. Below: a thin horizontal divider.

CONTENT: 4 RufloSessionCards stacked vertically with 8px gap between them. Each card is full panel width (minus 16px padding).

SESSION 1: ng-pipelines, ENG-391, 78% progress, active (blue)
SESSION 2: ng-core, ENG-389, 42% progress, active (blue)
SESSION 3: ng-pipelines, ENG-395, 91% progress, idle-imminent (red pulse)
SESSION 4: arthaus, ENG-388, 100% complete (dimmed, green checkmark)

The idle-imminent session should visually draw the eye — it's the most important card because the Conductor needs to act on it.

FOOTER: Pinned to bottom. Fleet aggregate stats:
"Total workers: 6 · Avg velocity: 3.2 tasks/h · Fleet utilization: 82%"
In small muted text.

Below the stats: A "View Timeline →" link in electric blue, leading to the Runway Timeline layout.

The overall panel should feel like a live status board — dense, scannable, real-time.
```

### PROMPT 3 — Activity Feed (Live Log)

```
Design a live activity feed component for DevPilot. This is a scrolling log of real-time events from the agent fleet.

DIMENSIONS: 400px wide, 500px tall (or full height of its container). Background: #060F1E. Thin border all around.

HEADER: "Activity" title in white, with a small green pulsing "LIVE" dot indicator.

CONTENT: A vertically scrolling list of log entries. Most recent at the top. Each entry is a single row:

ROW FORMAT: [timestamp] [repo badge] [event description]
- Timestamp: Monospace (JetBrains Mono), muted color (#475569), 11px
- Repo badge: Small colored pill (consistent color per repo)
- Description: 13px Inter, color-coded by event type

Show 10 entries with variety:

1. "14:42  [ng-pipelines] ENG-391 · Workstream A complete — 3 tasks done" — GREEN text
2. "14:38  [ng-core] ENG-389 dispatched — Ruflo hive spawned" — BLUE text
3. "14:35  Plan generated: ENG-394 · 2 workstreams · ~$0.26" — PURPLE text
4. "14:33  [ng-pipelines] ENG-395 at 90% — IDLE IMMINENT" — RED text, bold
5. "14:29  [arthaus] ENG-388 complete ✓" — GREEN text
6. "14:27  [ng-core] Runway update: 4.2h → 3.8h" — AMBER text
7. "14:22  [ng-pipelines] File unlocked: reward_model.py" — muted white text
8. "14:19  Plan approved: ENG-393 · Conductor approved" — BLUE text
9. "14:15  [arthaus] ENG-387 dispatched" — BLUE text
10. "14:10  Conductor Score: 847 → 852 (+5)" — PURPLE text

NEW ENTRY ANIMATION: The topmost entry should show a "slide in from top" animation state — slightly above its final position with 80% opacity, transitioning to full position and opacity. Show this as a subtle offset on entry #1.

Each row has a thin bottom border separator. Hover state on any row: subtle background highlight.

The feed should feel like a terminal log with color coding — informational, scannable, not decorative.
```

### PROMPT 4 — Fleet Summary Pills (Top Bar Inline)

```
Design a set of inline "Fleet Summary Pills" that sit inside a top bar. These are compact indicators showing each active Ruflo session's repo and progress at a glance.

CONTAINER: A horizontal row of pills, 8px gap between each. Background transparent (they sit on a #060F1E top bar).

PILL FORMAT: Rounded rectangle (~160px wide, 32px tall). Background: rgba(255,255,255,0.06). Border: rgba(255,255,255,0.08). Inside:
- Left: Repo name in 12px white text
- Right: Mini progress bar (50px wide, 4px tall) with percentage label

Show 4 pills:
1. "ng-pipelines ████░ 78%" — blue fill on progress bar
2. "ng-core ██░░░ 42%" — blue fill
3. "ng-pipelines ████▓ 91%" — red fill (idle imminent, faint red glow on pill)
4. "arthaus ✓" — no progress bar, green checkmark, slightly dimmed

The third pill should have a subtle red pulse/glow to indicate urgency — matching the IDLE IMMINENT state.

Show the pills in context: inside a 1920px wide top bar strip, 48px tall, #060F1E background. The pills are center-aligned. To the left: a Runway indicator. To the right: a Conductor Score pill.
```

### PROMPT 5 — Session Card Expanded State (Task Log)

```
Design the expanded state of a RufloSessionCard. When a Conductor clicks a session card, it expands to reveal the last 3 completed tasks as a monospace log.

COLLAPSED STATE (default):
Standard RufloSessionCard: repo badge, ticket, title, workstream label, progress bar, status dot. Height ~120px.

EXPANDED STATE (clicked):
Card height grows to ~220px with a smooth expand animation.

Below the progress bar, a new section appears with a thin top divider:

COMPLETED TASKS LOG (monospace):
```
14:32  ✓ Add attribution_engine.py scaffold    [Haiku]   2m
14:28  ✓ Update DAG registry configuration     [Haiku]   4m
14:19  ✓ Refactor reward model base class      [Sonnet]  9m
```

Each log row:
- Timestamp in muted text
- Green checkmark
- Task description in white monospace
- Model badge (colored: Haiku=green, Sonnet=blue)
- Duration

Font: JetBrains Mono, 12px for the log section.

Show both states (collapsed and expanded) side by side on dark background, with an arrow indicating the transition. The expand animation should feel like an accordion — content pushes down smoothly.
```

---

## Design Review Checklist

- [ ] Session status is identifiable without reading text (color/animation alone suffices)
- [ ] Idle imminent is the most visually urgent state — impossible to miss
- [ ] Progress bars are scannable — percentage visible at a glance
- [ ] Activity feed color coding is consistent and learnable
- [ ] Fleet summary pills work at small size — not too dense
- [ ] Expanded task log uses monospace and feels like a terminal
- [ ] Pulse animations are smooth, not jarring — rhythmic, professional
- [ ] Complete sessions are clearly deprioritized (dimmed)
