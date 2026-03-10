# Conductor Score — Design Agent Prompt Library

> Gamified performance metric that keeps the Conductor honest. Visible everywhere, drillable on demand.

---

## Concept Summary

The Conductor Score is a composite metric (0–1000) that measures how well the human technical lead is keeping the agent fleet productive. It turns fleet management into a legible performance signal — visible at a glance in the top bar, drillable into component dimensions, and optionally competitive via a leaderboard.

The score answers: "Am I staying ahead of my fleet?"

### Score Composition

```
ConductorScore (0–1000)
├── Fleet Utilization     (0–250)  — % of Ruflo capacity in active use
├── Runway Health         (0–250)  — avg runway maintained over session
├── Plan Accuracy         (0–200)  — plan estimates vs actual outcomes
├── Cost Efficiency       (0–200)  — savings vs all-Sonnet baseline
└── Velocity Trend        (0–100)  — planning velocity ratio trending up/down
```

### Display Contexts

| Context | Format |
|---|---|
| Top bar pill | `Score: 847` purple pill |
| Expanded card | Full breakdown with sparklines per dimension |
| Velocity Dashboard | Score card with trend arrow |
| Leaderboard | Rank badge (opt-in) |

---

## Design Tokens

```css
--accent-purple:   #8B5CF6;  /* score pill, score-related elements */
--accent-green:    #10B981;  /* positive trends, high scores */
--accent-amber:    #F59E0B;  /* medium scores, declining trends */
--accent-red:      #EF4444;  /* low scores, negative trends */
--bg-surface:      #1A2E4A;
--bg-panel:        #060F1E;
```

---

## Pre-Generated Design Agent Prompts

### PROMPT 1 — Conductor Score Pill (Top Bar)

```
Design a small inline pill component called "Conductor Score Pill" that sits inside a top navigation bar on a dark background (#060F1E).

PILL DIMENSIONS: ~120px wide, 32px tall. Rounded corners (16px full-round).

BACKGROUND: Purple gradient — from #7C3AED (left) to #8B5CF6 (right). Subtle inner glow.

CONTENT: Left side: a small icon or "⧡" glyph in white. Right side: "847" in white bold text, 14px.

STATES — show 3 variants side by side:
1. HIGH SCORE (800+): Purple gradient as described, subtle sparkle/shimmer effect
2. MEDIUM SCORE (500-799): Muted purple, no gradient, flat (#6D28D9 background). Number: "623"
3. LOW SCORE (<500): Dark muted purple (#4C1D95 background), number in amber text. Number: "312"

INTERACTION: On hover, the pill slightly expands (grows 4px wider) and shows a tooltip preview: "Fleet Util: 220 · Runway: 185 · Accuracy: 162 · Cost: 180 · Trend: 100" — in a small dark tooltip below.

On click: Expands into the full Conductor Score Card (separate component).

Typography: Inter, 14px bold for the number.
```

### PROMPT 2 — Conductor Score Expanded Card

```
Design an expanded "Conductor Score Card" that appears when the user clicks the score pill. This is a floating card/popover, not a full page.

DIMENSIONS: 380px wide, ~400px tall. Rounded corners 12px. Background: #1A2E4A. Border: rgba(255,255,255,0.08). Subtle drop shadow.

HEADER:
- "Conductor Score" title in white, 18px bold
- Large score number "847" prominently displayed — 48px font, purple (#8B5CF6) text
- Below the number: a trend arrow "↑ +12 from yesterday" in green (#10B981) text
- Subtitle: "Top 8% of conductors" in muted text (if leaderboard opted in)

BREAKDOWN SECTION — 5 rows, each representing a score dimension:

Each row layout:
- Left: Dimension name (14px white text)
- Center: Horizontal bar showing score fill (max width proportional to max possible)
- Right: Score value (e.g. "220/250")

ROW 1: Fleet Utilization — 220/250, bar fill: 88%, green (#10B981)
ROW 2: Runway Health — 185/250, bar fill: 74%, green
ROW 3: Plan Accuracy — 162/200, bar fill: 81%, green
ROW 4: Cost Efficiency — 180/200, bar fill: 90%, green
ROW 5: Velocity Trend — 100/100, bar fill: 100%, green with sparkle

Each bar has a dark track (#0F1F3D) and a colored fill. If a dimension is below 50% of its max, the fill color switches to amber. Below 25%, red.

SPARKLINES: To the right of each bar, show a tiny sparkline chart (40px wide, 16px tall) showing the last 7 data points for that dimension. Subtle, monochrome line in secondary text color.

FOOTER:
- "View Velocity Dashboard →" link in electric blue (#3B82F6)
- "Leaderboard" toggle switch (if opted out, shows "Opt into leaderboard")

The card should feel like a premium stats card — clean, data-rich, satisfying to look at. Think fitness app achievement card meets trading portfolio summary.
```

### PROMPT 3 — Velocity Dashboard (Full Page)

```
Design a full-page "Velocity Dashboard" for DevPilot. This is the dedicated analytics view where the Conductor can see their performance trends over time.

VIEWPORT: 1920x1080. Background: #0F1F3D.

LAYOUT — 2 columns with a header strip:

HEADER STRIP (64px tall, full width):
- Left: "Velocity Dashboard" title, 20px bold white
- Center: Time range selector pills: "24h" | "7d" | "30d" | "All" — with "7d" selected (blue highlight)
- Right: Conductor Score card (compact): Score "847" in large purple text with trend arrow

LEFT COLUMN (55%):
Two large chart cards stacked vertically:

CHART 1 — "Planning vs Fleet Velocity" (line chart):
- X-axis: time (last 7 days)
- Two lines: Planning Velocity (purple line) and Fleet Velocity (blue line)
- The area between them shaded: green when planning > fleet (healthy), red when fleet > planning (falling behind)
- Y-axis: tasks/hour
- A horizontal dashed line at the intersection: "Goal: planning > fleet"
- Current values annotated: "Planning: 4.2 tasks/h" and "Fleet: 3.8 tasks/h"

CHART 2 — "Runway Over Time" (area chart):
- X-axis: time (last 7 days)
- Y-axis: hours
- Green fill when > 4h, amber when 2-4h, red when < 2h
- Horizontal dashed lines at 4h and 2h thresholds
- Current value: "4.2h" annotated

RIGHT COLUMN (45%):
Three metric cards stacked:

METRIC 1 — Score Breakdown:
- Full Conductor Score breakdown with bars (same as expanded card but larger)

METRIC 2 — Cost Savings:
- "Total Cost: $14.82 (last 7d)"
- "vs All-Sonnet Baseline: $23.40"
- "Savings: $8.58 (37%)" in large green text
- Pie chart showing model distribution: Haiku (green), Sonnet (blue), Opus (purple)

METRIC 3 — Fleet Utilization Heatmap:
- 7-column (days) × 24-row (hours) heatmap grid
- Color intensity: dark (low utilization) to bright green (high utilization)
- Gaps/dark spots represent idle time
- Current hour highlighted with a border

Charts: Clean, minimal axes. No heavy gridlines. Subtle dot markers on data points. Smooth bezier curves. Think Stripe dashboard or Linear analytics.
```

### PROMPT 4 — Leaderboard View (Opt-In)

```
Design an opt-in "Conductor Leaderboard" component for DevPilot. This is a competitive ranking of conductors by their Conductor Score.

CONTAINER: Card component, 400px wide, ~500px tall. Background: #1A2E4A. Rounded corners 12px.

HEADER: "Conductor Leaderboard" title, trophy icon in gold (#EAB308), "March 2026" period label.

LIST: Ranked entries, 1-10 visible (scrollable for more):

Each row:
- Rank number (large, bold): #1, #2, #3... — top 3 get gold/silver/bronze coloring
- Avatar placeholder (32px circle with initials)
- Conductor name
- Score (bold, purple text)
- Trend indicator: ↑ (green) or ↓ (red) or → (gray)

CURRENT USER HIGHLIGHT:
- Row #8 is highlighted with a subtle purple background tint and "YOU" badge
- Score: "847", trend: "↑ +12"

TOP 3 SPECIAL TREATMENT:
- #1: Gold (#EAB308) rank number, subtle gold glow on row
- #2: Silver (#94A3B8) rank number
- #3: Bronze (#CD7F32) rank number

FOOTER: "Your best: 891 (Feb 2026)" in muted text. Toggle: "Opt out of leaderboard" link.

The leaderboard should feel aspirational and competitive — like a gaming leaderboard meets professional performance ranking. Not childish, but motivating.
```

---

## Design Review Checklist

- [ ] Score pill is visible at all times in the top bar without navigation
- [ ] Score number is the largest/most prominent element in expanded view
- [ ] Dimension breakdowns are scannable — bar fills provide instant understanding
- [ ] Trend direction (up/down) is conveyed by color AND icon (not just one)
- [ ] Sparklines add trend context without creating visual noise
- [ ] Velocity dashboard charts are clean and minimal — not overloaded
- [ ] Leaderboard feels motivating, not punishing for lower-ranked conductors
- [ ] Purple is consistently the score accent color across all contexts
