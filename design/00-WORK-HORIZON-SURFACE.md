# Work Horizon Surface — Design Agent Prompt Library

> DevPilot's primary view. The spatial queue that makes a Conductor faster than the fleet.

---

## Concept Summary

The Work Horizon is a **spatial queue metaphor** where work items flow from right (far/fuzzy) to left (near/ready). Four zones represent increasing levels of structure and readiness. The Conductor's job is to keep the left side fed — if the READY zone empties, agents idle and burn runway.

### Zone Map (right → left)

| Zone | Purpose | Visual Weight | Tint |
|---|---|---|---|
| **DIRECTIONAL** | Raw idea. One-liner. Zero structure. | Smallest, low contrast | Muted near-white `#F3F4F6` |
| **SHAPING** | Feature intent. Planning agent assembling context. | Smaller, purple tint | Soft purple `#EDE9FE` |
| **REFINING** | Claude Code plan generated. Conductor reviewing. | Medium, blue tint | Soft blue `#DBEAFE` |
| **READY** | Fully specced. Ruflo task graph staged. One-click dispatch. | Largest, highest contrast | Full white `#FFFFFF` |

---

## Layout Variants

### Variant A: Gradient Strip (Default)

Full-width horizontal strip. 4 columns: READY (30%) | REFINING (25%) | SHAPING (25%) | DIRECTIONAL (20%). Each column independently scrollable. Top bar spans full width above.

### Variant B: Mission Control

Full viewport CSS Grid. Top strip (5%): Runway, Active hives, Score, System time. Left column (20%): Fleet Status. Center (55%): Work Horizon with zone tabs. Right column (25%): Activity Feed + Agentic Assist.

### Variant C: Three-Panel Minimum

NOW panel (25%): Ruflo feed, monospace. NEXT panel (35%): urgency-ordered flat list, primary action per row. THINK panel (40%): large capture textarea + inline agent response.

### Variant D: Runway Timeline

Horizontal timeline (now → +12h). Top half: Ruflo hive tracks (Gantt rows). Bottom half: Spec queue (READY → DIRECTIONAL bars). "NOW" vertical line, Coverage Gap zones, drag-to-reprioritize.

---

## Card Specifications per Zone

### ReadyCard

```
┌─────────────────────────────────────────────────────┐
│ [ng-pipelines]  ENG-394                    [M] ~$0.26│
│ Multi-touch Attribution Modeling                     │
│                                          [Dispatch →]│
└─────────────────────────────────────────────────────┘
```

- Repo badge (color per repo, consistent hash)
- Linear ticket ID
- Title (truncate at 2 lines)
- Complexity chip: S (green) | M (blue) | L (amber) | XL (red)
- Model routing cost preview
- **Dispatch button** — primary accent blue — one click, no confirmation
- States: Default | Hover (elevation shadow) | Dispatching (spinner, card dims)

### RefiningCard

```
┌─────────────────────────────────────────────────────┐
│ [ng-pipelines]  ENG-394                              │
│ Multi-touch Attribution Modeling         ◉ 65%       │
│ 2 parallel workstreams · 6 tasks · ~$0.26            │
│                               [Re-plan] [Review Plan]│
└─────────────────────────────────────────────────────┘
```

- Spec completion ring (0–100%)
- Workstream count badge, task count, estimated cost
- Review Plan CTA → expands inline or opens panel

### ShapingTile

```
┌─────────────────────────────────────────┐
│ [ng-pipelines]  ● Conflict              │
│ Reward model v2 refinement              │
│ Planning agent ready to invoke          │
└─────────────────────────────────────────┘
```

- Amber dot conflict indicator when files are in-flight
- Smaller, lower visual weight

### DirectionalRow

```
  Improve persona lock threshold logic    [ng-pipelines]  [→ Promote]
```

- Promote button appears on hover
- Zone selector: [Shaping] [Refining]

---

## Key Signals Overlaid on the Horizon

| Signal | Visual Treatment |
|---|---|
| Runway < 4h | Amber glow on READY zone header |
| Runway < 2h | Red pulse animation on READY zone header |
| Session > 70% (no next spec) | Amber pulse on related items |
| Session > 90% (no READY item) | Red pulse, "IDLE IMMINENT" badge |
| File conflict | Amber dot on item card |
| Coverage gap | Red zone on timeline variant |

---

## Design Tokens

```css
--bg-base:         #0F1F3D;
--bg-panel:        #060F1E;
--bg-surface:      #1A2E4A;
--zone-ready:      #FFFFFF;
--zone-refining:   #DBEAFE;
--zone-shaping:    #EDE9FE;
--zone-directional:#F3F4F6;
--accent-primary:  #3B82F6;
--accent-amber:    #F59E0B;
--accent-red:      #EF4444;
--accent-green:    #10B981;
--accent-purple:   #8B5CF6;
--text-primary:    #F8FAFC;
--text-secondary:  #94A3B8;
--text-muted:      #475569;
--border:          rgba(255,255,255,0.08);
```

Typography: Inter (system-ui fallback). Monospace: JetBrains Mono.

---

## Pre-Generated Design Agent Prompts

### PROMPT 1 — Full Work Horizon Surface (Gradient Strip)

```
Design a dark-themed dashboard view called "Work Horizon" for a developer productivity platform called DevPilot. This is the primary screen the user sees.

LAYOUT: A full-width horizontal strip divided into 4 columns, flowing left-to-right: READY (30% width), REFINING (25%), SHAPING (25%), DIRECTIONAL (20%). Each column is independently vertically scrollable. Above the strip is a thin top bar.

BACKGROUND: Deep navy (#0F1F3D) base. Each zone column has a subtly different card tint to encode proximity to readiness.

READY ZONE (leftmost, 30%):
- Cards are highest contrast — white (#FFFFFF) card surfaces on the dark background
- Each card shows: a colored repo badge pill (e.g. "ng-pipelines" in a small rounded chip), a ticket ID like "ENG-394", a title ("Multi-touch Attribution Modeling"), a complexity chip (S/M/L/XL with color coding: S=green, M=blue, L=amber, XL=red), a cost preview ("~$0.26"), and a prominent electric blue (#3B82F6) "Dispatch →" button
- Cards have subtle rounded corners (8px), slight elevation shadow on hover
- This zone should feel urgent and action-oriented

REFINING ZONE (25%):
- Cards have a soft blue tint (#DBEAFE)
- Each card shows: repo badge, ticket ID, title, a small circular progress ring showing spec completion percentage (e.g. "65%"), workstream count ("2 parallel workstreams"), task count ("6 tasks"), estimated cost, and two CTAs: "Re-plan" (secondary) and "Review Plan" (primary)
- This zone should feel like active consideration — in-progress but not yet actionable

SHAPING ZONE (25%):
- Tiles have a soft purple tint (#EDE9FE)
- Smaller cards showing: repo badge, title, one-liner description, and an amber dot conflict indicator when relevant
- A subtle status line: "Planning agent ready to invoke"
- This zone should feel anticipatory — ideas gaining form

DIRECTIONAL ZONE (rightmost, 20%):
- Minimal rows, lowest visual weight
- Each row is a single line: title text, repo badge, and a "→ Promote" button that appears on hover with a fade-in
- Near-white muted text (#F3F4F6 tint on dark background)
- This zone should feel like a capture bucket — lightweight and fast

TOP BAR: Spans full width above the horizon strip. Contains:
- A "Runway" indicator showing hours remaining (e.g. "4.2h") with color coding: green > 4h, amber 2-4h, red < 2h
- Fleet summary pills: compact rounded rectangles showing each active repo with a mini progress bar (e.g. "ng-pipelines ████░ 78%")
- A Conductor Score pill in purple showing a number like "847"

OVERALL FEEL: The visual should communicate spatial progression — items become more vivid, larger, and more actionable as they move left. The gradient from muted (right) to vivid (left) should be immediately apparent. Dark, professional, dense but not cluttered. Think Bloomberg terminal meets linear.co aesthetic.

The viewport is 1920x1080. Show 2-3 cards per zone to demonstrate the density. Include realistic sample data using engineering ticket names.
```

### PROMPT 2 — Work Horizon: ReadyCard Component (Isolated)

```
Design a single card component called "ReadyCard" for a dark-themed developer dashboard.

DIMENSIONS: Approximately 340px wide, height auto-sizing to content (typically ~100px).

BACKGROUND: White (#FFFFFF) card surface on a deep navy (#0F1F3D) page background. Rounded corners (8px). Subtle border: rgba(255,255,255,0.08).

CONTENT LAYOUT (top to bottom, left to right):
- TOP ROW: Left-aligned colored repo badge pill (e.g. "ng-pipelines" — small rounded chip with a saturated background color generated from the repo name). Right-aligned: ticket ID "ENG-394" in secondary text (#94A3B8).
- MIDDLE ROW: Title text "Multi-touch Attribution Modeling" in primary dark text, truncated at 2 lines. Right-aligned: complexity chip "[M]" in a small rounded badge (S=green #10B981, M=blue #3B82F6, L=amber #F59E0B, XL=red #EF4444) and cost preview "~$0.26" in muted text.
- BOTTOM ROW: Right-aligned "Dispatch →" button — electric blue (#3B82F6) background, white text, rounded, prominent.

STATES — show 3 variants side by side:
1. DEFAULT: As described above
2. HOVER: Slight elevation shadow increase, card lifts 2px
3. DISPATCHING: Button shows a small spinner icon, card surface dims to 60% opacity, "Dispatching..." text overlay

Typography: Inter for all text. 14px body, 12px for badges and secondary text, 14px semibold for the button.
```

### PROMPT 3 — Work Horizon: Zone Transition Animation

```
Design a motion/animation storyboard showing how items transition between zones in the Work Horizon.

SCENARIO: A DIRECTIONAL row gets promoted to SHAPING.

FRAME 1 (IDLE): Show a DIRECTIONAL row at far right: "Improve persona lock threshold logic [ng-pipelines] [→ Promote]". The Promote button is visible on hover state.

FRAME 2 (ZONE SELECTOR): User clicked Promote. A small popover appears below the button with two options: "[Shaping]" and "[Refining]" as rounded pills. Subtle drop shadow on the popover.

FRAME 3 (TRANSITION — 0ms): User selected "Shaping". The row begins to animate. The row morphs — it starts expanding slightly in height, the background tint shifts from near-white muted to soft purple (#EDE9FE).

FRAME 4 (TRANSITION — 150ms): The row slides left horizontally from the DIRECTIONAL column into the SHAPING column. A faint trail/ghost of the original position fades out. The card is mid-flight between columns.

FRAME 5 (ARRIVAL — 300ms): The item has landed in the SHAPING zone as a ShapingTile. It's now a card (not a row) with the purple tint, showing the title and a new status line: "Planning agent ready to invoke". A subtle pulse animation plays once on arrival.

FRAME 6 (SETTLED — 500ms): The ShapingTile is in its final state. A small activity indicator (spinning dots or pulsing circle) appears on the card indicating the planning agent is assembling context.

Show all 6 frames in a horizontal storyboard strip. Dark background (#0F1F3D). Use arrows or dotted lines between frames to show temporal flow. Label each frame with its timestamp.
```

### PROMPT 4 — Work Horizon: Gradient Strip with Runway Urgency States

```
Design three variations of the Work Horizon top bar to show different runway health states.

All three are the same top bar layout: full-width, dark background (#060F1E), containing a Runway indicator on the left, fleet summary pills in the center, and a Conductor Score pill on the right.

VARIATION 1 — HEALTHY (Runway > 4h):
- Runway indicator: "Runway: 6.1h" in green (#10B981) text with a green dot
- Fleet pills show normal blue progress bars
- Conductor Score pill: "847" in purple (#8B5CF6)
- Overall calm, no urgency signals

VARIATION 2 — AMBER (Runway 2-4h):
- Runway indicator: "Runway: 3.2h" in amber (#F59E0B) text with an amber pulsing dot
- One fleet pill shows "⚠ NEXT SPEC NEEDED" badge in amber
- A subtle amber glow emanates from the Runway indicator
- The READY zone header below should have a faint amber tint wash

VARIATION 3 — CRITICAL (Runway < 2h):
- Runway indicator: "Runway: 1.4h" in red (#EF4444) text, the number is larger/bolder
- Red pulsing dot animation
- One fleet pill shows "🔴 IDLE IMMINENT" in red
- A red glow emanates from the Runway indicator
- The entire top bar has a subtle red border-bottom pulse animation
- The READY zone below is visually highlighted — "FEED ME" energy

Show all three as stacked horizontal bars, 1920px wide, approximately 48px tall each. Dark theme throughout.
```

### PROMPT 5 — Work Horizon: Mission Control Layout

```
Design a full-viewport "Mission Control" layout for the DevPilot Work Horizon. This is an alternative layout to the default gradient strip — designed for maximum information density.

VIEWPORT: 1920x1080, no outer scroll. CSS Grid, every pixel used.

GRID LAYOUT:
- TOP STRIP (5% height, ~54px): Spans full width. Contains: Runway indicator (left), active hive count (center-left), Conductor Score (center-right), system time / UTC clock (right). Deep panel background (#060F1E).
- LEFT COLUMN (20% width, ~384px): Fleet Status panel. Contains vertically stacked RufloSessionCards — each showing repo badge, ticket title, workstream label, progress bar (e.g. "████████░░ 78%"), elapsed time, and a status indicator dot (blue=active, amber=needs-spec, red=idle-imminent, green=complete). Panel background: #060F1E.
- CENTER (55% width, ~1056px): The Work Horizon surface. Four zone tabs at the top: READY | REFINING | SHAPING | DIRECTIONAL. Below the tabs, the active zone's cards are displayed in a responsive grid. Default tab: READY. Tab indicator shows item count per zone. Background: #0F1F3D.
- RIGHT COLUMN (25% width, ~480px): Split vertically — top 60% is Activity Feed (live scrolling log entries, color-coded by event type: green=completion, blue=dispatch, purple=plan generated, red=error, amber=warning). Bottom 40% is the Agentic Assist panel showing context-sensitive suggestions. Background: #060F1E.

FEEL: Dense, professional, no wasted space. Think NASA mission control meets a modern trading terminal. Every panel has thin borders (rgba(255,255,255,0.08)). Monospace font (JetBrains Mono) for the Activity Feed and fleet status. Inter for everything else.

Populate with realistic sample data: 3 active Ruflo sessions at various progress levels, 2 READY items, 1 REFINING item, 3 SHAPING items, 4 DIRECTIONAL items, 8 activity feed entries, 1 agentic assist suggestion.
```

### PROMPT 6 — Work Horizon: Runway Timeline Layout

```
Design a "Runway Timeline" layout variant for DevPilot's Work Horizon. This is a Gantt-style temporal view showing how agent work and spec readiness align over time.

VIEWPORT: 1920x1080. Horizontal timeline spanning from NOW to +12 hours into the future.

TIMELINE AXIS: Horizontal axis at the center of the screen. Tick marks every hour. "NOW" is a bold vertical line on the left side with a pulsing blue dot.

TOP HALF — Ruflo Hive Tracks:
- Horizontal Gantt-style bars, one per active Ruflo session
- Each bar shows: repo badge, ticket ID, progress shading (filled portion = completed, unfilled = remaining), estimated completion time marker
- Bar colors map to repo (consistent hash coloring)
- Label each bar with the session's current workstream
- Example: "ng-pipelines ENG-391" bar starts at NOW, extends to +2.5h, 78% filled

BOTTOM HALF — Spec Queue:
- Horizontal bars representing horizon items, ordered by zone
- READY items: bright white bars, positioned at NOW (ready to dispatch immediately)
- REFINING items: blue-tinted bars, positioned slightly future (estimated plan completion time)
- SHAPING items: purple-tinted bars, positioned further future
- DIRECTIONAL items: muted gray bars at the far right

COVERAGE GAP ZONES: Red-shaded vertical bands on the timeline where a Ruflo session will complete but no READY spec exists to feed it. These are the danger zones — visually alarming.

INTERACTIONS (annotate):
- Drag bars to reprioritize
- Click a spec bar to open its Plan Review
- Hover over a coverage gap to see which session will idle

Dark theme (#0F1F3D background). Show 3 Ruflo sessions and 6 spec items across all zones. Include one visible coverage gap zone in red.
```

### PROMPT 7 — Work Horizon: Mobile / Tablet Responsive Considerations

```
Design a responsive adaptation of the DevPilot Work Horizon for a 768px wide tablet viewport (portrait).

The full gradient strip layout doesn't work at this width. Instead, adapt to a vertically stacked card feed:

LAYOUT:
- Top bar remains fixed: Runway indicator + Score pill (fleet pills collapse to a "3 active" summary)
- Below: a horizontal zone tab bar: READY | REFINING | SHAPING | DIRECTIONAL — with item count badges
- Below tabs: vertically scrolling card list for the selected zone
- Bottom: Quick Capture input fixed to bottom of viewport

CARD ADAPTATIONS:
- ReadyCard: Full width, same content but horizontally laid out — repo badge and ticket ID on one line, title below, complexity + cost + dispatch button on bottom row
- RefiningCard: Full width, progress ring moves inline next to title
- ShapingTile: Full width, compact
- DirectionalRow: Full width, promote button always visible (no hover on touch)

NAVIGATION: Swipe left/right to switch between zone tabs.

Dark theme, same color tokens. Show the READY tab active with 3 ReadyCards stacked vertically.
```

### PROMPT 8 — Work Horizon: Empty States

```
Design empty state illustrations for each of the 4 Work Horizon zones in DevPilot.

Each empty state should be shown as it would appear inside its respective zone column on the dark (#0F1F3D) background.

READY ZONE EMPTY STATE:
- Illustration: A subtle outline of a rocket on a launchpad, waiting
- Headline: "Nothing ready to launch"
- Subtext: "Promote items from Refining to keep your fleet fed."
- CTA: "View Refining →" link in electric blue
- Urgency variant: If runway < 2h, the background pulses red and headline changes to "Fleet running dry — promote specs now"

REFINING ZONE EMPTY STATE:
- Illustration: A magnifying glass over a document outline
- Headline: "No plans under review"
- Subtext: "Shape an idea to trigger plan generation."

SHAPING ZONE EMPTY STATE:
- Illustration: A clay/pottery wheel outline (shaping metaphor)
- Headline: "Nothing being shaped"
- Subtext: "Promote a directional idea to start planning."

DIRECTIONAL ZONE EMPTY STATE:
- Illustration: A compass pointing forward
- Headline: "Capture your next idea"
- Subtext: "Use Quick Capture below to add a rough thought."
- Arrow pointing down toward the Quick Capture input

Style: Minimal line art illustrations, single accent color per zone (matching zone tint), no heavy fills. Elegant and unobtrusive. The illustrations should feel like they belong in a premium developer tool, not a consumer app.
```

---

## Design Review Checklist

When reviewing generated designs for the Work Horizon, verify:

- [ ] Spatial progression is visually obvious (muted right → vivid left)
- [ ] READY zone has highest visual weight and contrast
- [ ] Dispatch button is the most prominent interactive element
- [ ] Runway indicator is visible without scrolling or navigating
- [ ] Zone boundaries are clear but not heavy-handed (no thick dividers)
- [ ] Cards within each zone have consistent sizing
- [ ] Conflict indicators (amber dots) are visible but not alarming
- [ ] Typography hierarchy is clear: title > metadata > actions
- [ ] Dark theme feels professional, not gloomy
- [ ] Information density is high but not overwhelming
