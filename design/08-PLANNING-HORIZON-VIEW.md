# Planning Horizon View — Design Requirements

> The wave structure IS the planning signal. Surface it so the Conductor can manage scale.

---

## Problem Statement

The planning agent already optimizes work into waves of parallel execution — sequential layers of independent tasks that can fan out across the fleet. This wave structure encodes critical information about plan complexity, parallelism potential, and execution depth. But today, almost none of that structure is visible at the planning stage. The Conductor sees workstream columns and task lists, but not the **shape** of execution.

As Conductors manage larger and larger pods of work, they need a view that answers:

- **How deep is this plan?** (number of waves = sequential depth)
- **How wide is each wave?** (tasks per wave = parallelism at each stage)
- **What's the critical path?** (minimum time through the graph)
- **How does this plan compare to others in the queue?** (relative complexity)
- **Can I absorb this into the current fleet load?** (wave width vs available capacity)

The Planning Horizon View makes the wave decomposition a first-class UI primitive — not just an execution detail, but the primary lens through which the Conductor evaluates and sequences work.

---

## Core Concept: Wave Shape as Planning Signal

```
                    ┌─────────────────────────────────────────────────┐
  PLAN A (shallow)  │ W1 ████████████████████████████████████ (6 tasks)│
  2 waves, wide     │ W2 ██████████████████ (3 tasks)                 │
                    └─────────────────────────────────────────────────┘

                    ┌─────────────────────────────────────────────────┐
  PLAN B (deep)     │ W1 ██████ (2)                                   │
  5 waves, narrow   │ W2 █████████ (3)                                │
                    │ W3 ██████ (2)                                   │
                    │ W4 ███ (1)                                      │
                    │ W5 █████████ (3)                                │
                    └─────────────────────────────────────────────────┘
```

**Plan A** is highly parallel — 2 waves, most work fans out immediately. Good for a fleet with capacity.
**Plan B** is deep and sequential — 5 waves, narrow parallelism. Occupies fewer agents but for longer.

This shape distinction is invisible in the current workstream-column view. The Planning Horizon View makes it the primary visual.

---

## Component Anatomy

### 1. Wave Depth Indicator (Inline on Horizon Cards)

A compact indicator shown on every RefiningCard and ReadyCard:

```
┌──────────────────────────────────────────────────┐
│ ENG-394 · Multi-touch Attribution Modeling        │
│ [ng-pipelines]                                    │
│                                                   │
│  ▐▐▐▐▐▐│▐▐▐│▐▐▐▐▐   3 waves · 11 tasks · ~38min │
│  W1(6)  W2(3) W3(2)   ◆ max ∥ 6 · crit 4        │
│                                    [Review Plan →]│
└──────────────────────────────────────────────────┘
```

- **Wave bar segments**: Proportional-width bars per wave, width = task count relative to max wave
- **Wave count + total tasks**: "3 waves · 11 tasks · ~38min"
- **Max parallelism**: "max ∥ 6" — widest wave's task count (fleet capacity needed)
- **Critical path length**: "crit 4" — number of tasks on longest sequential chain

### 2. Planning Horizon Summary (Top Bar Extension)

Extends the existing TopBar with aggregate wave stats across all active/queued plans:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Runway: 4.2h  │  Fleet: 4/6 active  │  Queue: 3 plans · 12 waves · 28 tasks  │  Score: 847 │
│               │                      │  avg depth 4.0 · max ∥ 8 · ◆ crit 6   │             │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Queue aggregate**: Total plans, total waves, total tasks across READY + REFINING
- **Avg depth**: Average wave count across queued plans (higher = more sequential work ahead)
- **Max parallelism**: Widest single wave across all plans (peak fleet demand)
- **Critical path**: Longest critical path across all plans (bottleneck indicator)

### 3. Planning Horizon Panel (Expanded View)

Full panel showing all queued plans with their wave shapes side-by-side:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PLANNING HORIZON                                              [collapse ▲] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ENG-394  Attribution Modeling         ENG-401  Reward Model v2             │
│  ┌─────────────────────┐               ┌─────────────────────┐              │
│  │ W1 ████████████ (6) │  ⏱ ~12min    │ W1 ██████ (2)       │  ⏱ ~8min    │
│  │ W2 ██████ (3)       │  ⏱ ~15min    │ W2 █████████ (3)    │  ⏱ ~15min   │
│  │ W3 ████ (2)         │  ⏱ ~10min    │ W3 ██████ (2)       │  ⏱ ~12min   │
│  └─────────────────────┘               │ W4 ███ (1)          │  ⏱ ~5min    │
│  ◆ crit 4 · max ∥ 6                   │ W5 █████████ (3)    │  ⏱ ~10min   │
│  ∥ efficiency: 0.82                    └─────────────────────┘              │
│  ⏱ est: ~37min                         ◆ crit 6 · max ∥ 3                 │
│  [READY — Dispatch →]                   ∥ efficiency: 0.54                  │
│                                         ⏱ est: ~50min                       │
│                                         [REFINING — Review →]               │
│                                                                             │
│  ─── Fleet Capacity Line: 4 agents ──────────────────────────────────────  │
│  W1 of ENG-394 needs 6 agents — exceeds current fleet by 2               │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ TOTALS: 2 plans · 8 waves · 17 tasks · est ~87min                         │
│ Peak demand: 6 concurrent · Fleet: 4 available · ⚠ over-subscribed at W1  │
└─────────────────────────────────────────────────────────────────────────────┘
```

Key elements:
- **Side-by-side wave shapes**: Each plan rendered as proportional horizontal bars
- **Per-wave time estimates**: Duration per wave based on complexity of constituent tasks
- **Parallelism efficiency score**: 0–1 ratio (higher = more work runs in parallel)
- **Fleet capacity line**: Horizontal reference showing current fleet size
- **Over-subscription warnings**: When a wave's width exceeds fleet capacity
- **Plan status + CTA**: Current zone + primary action

### 4. Wave Shape Sparkline (Compact, for Lists/Tables)

Tiny inline visualization for use in tables and dense list views:

```
▐▐▐▐▐▐│▐▐▐│▐▐   3w · max∥6
```

- 48px wide, 12px tall
- Segments proportional to task count per wave
- Color-coded by wave status (pending/active/complete)

---

## Interaction Design

### Hover on Wave Segment
Shows tooltip with wave details:
```
Wave 2 of 3
3 tasks: [Haiku] attribution_engine.py, [Sonnet] reward_model.py, [Haiku] DAG registry
Est. ~15min · depends on: Wave 1 completion
```

### Click on Plan in Horizon Panel
Expands to show full DAG visualization inline, with waves as horizontal layers.

### Drag to Reorder Plans
Plans in the Horizon Panel can be drag-reordered to signal priority. The fleet capacity analysis updates in real-time as order changes.

### Wave Width vs Fleet Capacity
When a wave's task count exceeds fleet capacity:
- Amber highlight on that wave segment
- Tooltip: "Wave 1 needs 6 agents — 4 available. Tasks will queue within wave."
- The estimated time adjusts to account for intra-wave queuing

---

## Data Sources

All data already exists in the system:

| Signal | Source | Field |
|---|---|---|
| Wave count | `WavePlan` | `totalWaves` |
| Tasks per wave | `Wave` | `taskCount` |
| Critical path length | `WavePlanMetric` | `criticalPathLength` |
| Parallelism efficiency | `WavePlanMetric` | `parallelismEfficiency` |
| Max parallelism | `WavePlanMetric` | derived: `max(wave.taskCount)` |
| Wave utilization | `WavePlanMetric` | `waveUtilization` |
| Task distribution | `WavePlanMetric` | `taskDistributionVariance` |
| Time per wave | `Wave` | `estimatedMinutes` |
| Fleet capacity | `FleetStore` | active session count |

No new API endpoints required — the existing `/api/wave-plans/active` and `/api/items/[id]/wave-plan` endpoints return all necessary data.

---

## Design Tokens

```css
/* Wave shape bars */
--wave-bar-pending:     #1E293B;   /* slate-800 */
--wave-bar-ready:       #3B82F6;   /* blue-500 */
--wave-bar-executing:   #3B82F6;   /* blue-500, animated pulse */
--wave-bar-complete:    #10B981;   /* green-500 */
--wave-bar-failed:      #EF4444;   /* red-500 */

/* Capacity indicators */
--capacity-ok:          #10B981;   /* green — wave fits in fleet */
--capacity-tight:       #F59E0B;   /* amber — wave near fleet limit */
--capacity-exceeded:    #EF4444;   /* red — wave exceeds fleet */

/* Efficiency score */
--efficiency-high:      #10B981;   /* > 0.7 */
--efficiency-medium:    #F59E0B;   /* 0.4–0.7 */
--efficiency-low:       #EF4444;   /* < 0.4 */
```

---

## Design Review Checklist

- [ ] Wave depth (count) is visible without expanding or hovering
- [ ] Wave width (tasks per wave) is visually proportional — wide waves look wide
- [ ] Critical path length is always displayed alongside wave count
- [ ] Max parallelism is visible and compared against fleet capacity
- [ ] Plans can be compared side-by-side by their wave shapes
- [ ] Over-subscription warnings are clear but not blocking
- [ ] Parallelism efficiency score provides at-a-glance plan quality signal
- [ ] Aggregate stats across all queued plans are in the top bar
- [ ] Per-wave time estimates help Conductor gauge total execution time
- [ ] The view works at both the individual plan level (card) and the aggregate level (panel)
- [ ] Wave shape sparkline fits inline in dense list/table views
- [ ] Hover on any wave segment reveals constituent tasks
