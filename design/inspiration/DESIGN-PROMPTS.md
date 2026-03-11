# DevPilot — Visual Design Inspiration Prompts

> Reference prompts for generating UI/UX mockups. Each prompt targets a core screen and encodes the DevPilot aesthetic: deep navy backgrounds, teal/cyan accents, terminal-native elements, and Bloomberg-meets-Linear information density.

---

## Aesthetic DNA (carry into every prompt)

These constants are derived from the deployed DevPilot marketing site and should permeate every generated mockup:

- **Background:** Near-black navy (`#060F1E` panels, `#0F1F3D` base) — never pure black, always blue-shifted
- **Accent:** Electric teal/cyan (`#06B6D4`, `#22D3EE`) for hero emphasis and key interactive elements, complemented by electric blue (`#3B82F6`) for primary CTAs
- **Terminal motif:** Rounded-corner panels with macOS-style traffic light dots (red/yellow/green circles), monospace green text (`#10B981`) for status output, command-line aesthetic for activity feeds
- **Typography:** Large bold sans-serif headlines (Inter or similar), monospace (JetBrains Mono) for data-dense panels and code-like outputs
- **Glass effect:** Subtle semi-transparent card borders (`rgba(255,255,255,0.08)`), faint inner glow on elevated surfaces
- **Interaction cues:** Teal/blue pill buttons with arrow icons (`→`), hover states with elevation shadow, no heavy chrome
- **Density philosophy:** Bloomberg terminal information density but with Linear's clean spacing — every pixel earns its place

---

## PROMPT 1 — Work Horizon Dashboard (Gradient Strip)

```
Design a full-viewport dark dashboard called "Work Horizon" for DevPilot, an AI agent conductor platform. This is the primary screen — think Bloomberg terminal meets Linear.co on a near-black navy background.

BACKGROUND & ATMOSPHERE:
- Page background: deep navy-black (#0F1F3D), never pure black — always blue-shifted
- Subtle radial gradient emanating from center-left, very faint teal (#06B6D4 at 3% opacity), creating depth without distraction
- All panels and cards have hairline borders: rgba(255,255,255,0.08)

LAYOUT:
- Thin top bar (48px tall) spanning full width on deep panel background (#060F1E)
- Below: a full-width horizontal strip divided into 4 zone columns flowing left to right: READY (30% width), REFINING (25%), SHAPING (25%), DIRECTIONAL (20%)
- Each zone column is independently vertically scrollable
- Zone headers are minimal: zone name in small caps, muted text (#94A3B8), with an item count badge

TOP BAR CONTENTS (left to right):
- DevPilot logo: stacked chevron icon in teal/cyan gradient, "DevPilot" in white semibold text
- Runway indicator: large number "4.2h" in green (#10B981) with a small pulsing green dot and label "Runway" in muted text
- Fleet summary pills: 3 compact rounded rectangles with repo names and tiny inline progress bars — "ng-pipelines ████░ 78%" / "ng-core ██░░░ 42%" / "arthaus ✓" — subtle dark surface background (#1A2E4A), white text
- Conductor Score: purple (#8B5CF6) pill reading "847" with a small sparkline trend arrow

READY ZONE (leftmost, highest visual weight):
- Cards are bright white (#FFFFFF) surfaces on the dark background — maximum contrast, they pop
- Each card (340px wide, ~100px tall, 8px rounded corners): top row has a colored repo badge pill (small saturated chip, color derived from repo name hash) and ticket ID "ENG-394" in secondary text. Middle row: title "Multi-touch Attribution Modeling" in dark text, complexity chip [M] in blue, cost "~$0.26" in muted text. Bottom row: right-aligned "Dispatch →" button — electric blue (#3B82F6) background, white text, rounded, prominent
- This zone feels urgent, action-oriented — the launchpad

REFINING ZONE:
- Cards have soft blue tint (#DBEAFE) surfaces
- Each card shows: repo badge, ticket ID, title, a circular progress ring (65% filled, teal stroke), "2 parallel workstreams · 6 tasks · ~$0.26", two CTAs: "Re-plan" (ghost/outline) and "Review Plan" (filled blue)
- Zone feels like active consideration — work in progress

SHAPING ZONE:
- Tiles have soft purple tint (#EDE9FE) surfaces, smaller than REFINING cards
- Each tile: repo badge, title, one-liner description, amber dot conflict indicator on one card, status line "Planning agent ready to invoke" in muted italic
- Zone feels anticipatory — ideas gaining form

DIRECTIONAL ZONE (rightmost, lowest visual weight):
- Minimal single-line rows, muted text (#F3F4F6 on dark)
- Each row: title text, small repo badge, "→ Promote" button that subtly appears
- Zone feels like a capture bucket — lightweight

SPATIAL PROGRESSION: The visual gradient from right to left must be immediately obvious — items become larger, more vivid, higher contrast, and more actionable as they move leftward. The eye is naturally drawn to the READY zone.

Show 3 cards in READY, 2 in REFINING, 3 tiles in SHAPING, 4 rows in DIRECTIONAL. Use realistic engineering ticket names. Viewport: 1920×1080.
```

---

## PROMPT 2 — Plan Review Surface (Inline Card)

```
Design the "Plan Review" interaction for DevPilot — the highest-stakes screen in the product. The Conductor reviews an AI-generated execution plan before dispatching it to agent fleets. No modals — everything is inline.

BACKGROUND: Deep navy-black (#0F1F3D). The Plan Review Card floats as an elevated panel on this dark canvas.

PLAN REVIEW CARD (centered, ~900px wide, auto-height):
- Surface: dark panel (#060F1E) with a subtle teal (#06B6D4) top border accent (2px) and hairline borders rgba(255,255,255,0.08)
- Slight elevation glow: faint teal box-shadow at 5% opacity

CARD HEADER:
- Left: repo badge pill "ng-pipelines" (saturated color chip), ticket ID "ENG-394" in secondary text (#94A3B8)
- Title: "Multi-touch Attribution Modeling" in white (#F8FAFC) semibold, 16px
- Subtitle: "Plan Ready — 2 parallel workstreams · 6 tasks · ~$0.26" in secondary text
- Right: two buttons — "Re-plan ↺" as a ghost/outline button, "Approve →" as a filled electric blue (#3B82F6) button, both with rounded corners

CARD BODY — Workstream Columns:
- Two columns side by side, separated by a thin vertical border
- LEFT COLUMN header: "Workstream A" in white, "ng-pipelines · 2 workers" in muted text
- RIGHT COLUMN header: "Workstream B" in white, "ng-core · 1 worker" in muted text
- Each column contains task rows:

TASK ROW FORMAT (each ~48px tall):
- Model badge: small rounded chip — "Haiku" in green (#10B981), "Sonnet" in blue (#3B82F6), "Opus" in purple (#8B5CF6) — with subtle background fill
- Task description: white text, truncated single line
- Complexity chip: right-aligned, [S] green / [M] blue / [L] amber / [XL] red
- One task row shows a conflict badge: "⚠ in-flight: ENG-391" in amber (#F59E0B) text with amber dot

Below the columns, spanning full width:
- Arrow indicator: "↓ Sequential (depends on A + B complete)" in muted text
- One sequential task row: "[Sonnet] Integration tests [M]"

CARD FOOTER:
- Cost breakdown in monospace (JetBrains Mono): "Haiku ×3: $0.04 · Sonnet ×3: $0.22 · Total: $0.26"
- Savings line: "vs all-Sonnet baseline: $0.42 → Saving 38%" with "38%" in green
- Two collapsible sections: "[▶ Acceptance Criteria (3)]" and "[▶ Files Touched (8)]" in secondary text

RIGHT PANEL (slide-in, 380px wide, adjacent to the card):
- Title: "Plan Confidence" in white
- Section 1 — Fleet Context: monospace text block describing workers available and avoided files, terminal-style with green bullet points
- Section 2 — Memory Surfaced: a small card with date, ticket reference, and constraint applied — dark surface (#1A2E4A) with hairline border
- Section 3 — Confidence Signals: 4-row grid with traffic light indicators — green circles for HIGH, amber for MEDIUM — dimensions: Parallelization, Conflict Risk, Complexity Calibration, Cost Estimate Accuracy

Typography: Inter for all UI text, JetBrains Mono for cost breakdowns, file paths, and fleet context. Overall feel: precise, clinical, every data point visible at a glance. The Conductor should feel confident dispatching from this view.
```

---

## PROMPT 3 — Mission Control Layout (Full Viewport)

```
Design a full-viewport "Mission Control" layout for DevPilot — maximum information density for a power-user Conductor managing 5+ parallel AI agent sessions. Every pixel earns its place. Think NASA mission control crossed with a modern trading terminal.

VIEWPORT: 1920×1080, no outer scroll. CSS Grid — every region fills its space.

BACKGROUND: Near-black navy (#060F1E for panels, #0F1F3D for center). All panel borders: rgba(255,255,255,0.08).

TOP STRIP (full width, 54px tall, #060F1E):
- Left: DevPilot logo (stacked chevron icon, teal gradient) + "DevPilot" in white
- Center-left: Runway indicator — large "4.2h" in green (#10B981), pulsing green dot, "Runway" label in muted text. Adjacent: "Velocity Ratio: 1.3×" in teal (#06B6D4)
- Center-right: "5 Active Hives" with 5 tiny colored dots representing each session
- Right: Conductor Score "847" in purple (#8B5CF6) pill with trend sparkline, UTC clock "14:32 UTC" in monospace muted text

LEFT COLUMN (384px wide, full height minus top strip):
- Title: "Fleet Status" in small caps, muted text
- 5 vertically stacked RufloSessionCards, each on dark surface (#1A2E4A):
  - Card 1: "ng-pipelines ENG-391 · Reward model v2" — progress bar 78% filled in electric blue, "Elapsed: 42m", blue status dot "● active"
  - Card 2: "ng-core ENG-389 · Schema migration" — 42% progress, blue dot
  - Card 3: "arthaus ENG-388 · UI components" — 95% progress, amber pulsing border, "⚠ NEXT SPEC NEEDED" amber badge
  - Card 4: "ng-pipelines ENG-392 · DAG registry" — 23% progress, blue dot
  - Card 5: "data-lake ENG-390 · ETL pipeline" — 100% complete, dimmed, green "✓" checkmark
- Progress bars: thin horizontal bars with filled portion in the repo's assigned color, unfilled in dark (#0F1F3D)
- Each card shows current workstream label in monospace italic

CENTER (1056px wide):
- Title area: horizontal tab bar — "READY" (active, underlined in teal) | "REFINING" | "SHAPING" | "DIRECTIONAL" — each tab has an item count badge
- Below tabs: responsive grid of ReadyCards (since READY tab is active)
  - 3 ReadyCards in a 2-column grid, bright white surfaces popping against the dark background
  - Each card: repo badge, ticket ID, title, complexity chip, cost, "Dispatch →" blue button
  - One card is in "hover" state with elevation shadow
- Empty space below cards shows the Work Horizon gradient indicator — a subtle horizontal bar fading from bright (left) to muted (right) as a spatial orientation cue

RIGHT COLUMN (480px wide, split vertically):
- TOP 60% — Activity Feed:
  - Title: "Activity" in small caps
  - Scrolling monospace log entries (JetBrains Mono, 12px) on dark surface, each entry color-coded:
    - "14:32 [ng-pipelines] ENG-391 · Workstream A complete — 3 tasks done" in green
    - "14:29 [ng-core] ENG-389 dispatched — Ruflo hive spawned" in blue
    - "14:27 Plan generated: ENG-394 · 2 workstreams · ~$0.26" in purple
    - "14:19 [arthaus] ENG-388 complete ✓" in green
    - "14:15 ⚠ ENG-393 file conflict: reward_model.py in-flight" in amber
  - Terminal aesthetic: entries appear like log output, newest at top, faint alternating row shading

- BOTTOM 40% — Agentic Assist:
  - Title: "Assist" in small caps with a small teal AI sparkle icon
  - A suggestion card on dark surface (#1A2E4A) with left teal accent border:
    "ENG-391 completing in ~12min — ng-pipelines will have 2 workers free. Suggest dispatching ENG-394 (Multi-touch Attribution) which is READY. No conflicting files."
  - Below: clickable chips — "[ENG-394]" "[ENG-391]" "[ng-pipelines]" — small rounded pills in dark surface with hairline borders
  - At bottom: a text input with placeholder "Ask about fleet state..." with subtle focus glow

OVERALL FEEL: Dense, alive, professional. The left column anchors fleet awareness, the center focuses action, the right provides context. Every panel breathes — generous internal padding despite high density. The teal accent and terminal motifs tie it to the DevPilot brand from the marketing site.
```

---

## PROMPT 4 — Terminal-Style Activity Feed & Fleet Console

```
Design a "Fleet Console" panel for DevPilot — a terminal-inspired real-time feed that shows everything happening across the AI agent fleet. This panel sits in the right column of Mission Control or as a slide-out overlay.

DIMENSIONS: 480px wide, full viewport height minus 54px top bar. Dark panel background (#060F1E).

PANEL STRUCTURE:

PANEL HEADER (48px):
- macOS-style traffic light dots (red #EF4444, amber #F59E0B, green #10B981) in the top-left corner, 10px diameter, 6px spacing — purely decorative, establishing the terminal aesthetic
- Title: "Fleet Console" in Inter semibold, white, centered
- Right: a "Live" badge — small rounded pill with pulsing green dot and "Live" text in green (#10B981)

ACTIVITY FEED (top 55% of panel):
- Monospace font (JetBrains Mono, 13px) on near-black background (#060F1E)
- Each log entry is a single line or wrapped pair, with timestamp and color coding:

```
14:32  ✓ [ng-pipelines] ENG-391 · Workstream A complete     ← green text
14:29  → [ng-core] ENG-389 dispatched — hive spawned        ← blue text
14:27  ◆ Plan generated: ENG-394 · 2 workstreams · ~$0.26   ← purple text
14:22  ✓ [ng-pipelines] ENG-391 · Task: refactor r_gcn      ← green text
14:19  ✓ [arthaus] ENG-388 complete — all tasks passing      ← green text, brighter
14:15  ⚠ File conflict: reward_model.py in-flight via 391   ← amber text
14:12  → [ng-pipelines] ENG-392 dispatched                   ← blue text
14:08  ✗ [data-lake] ENG-387 · Test failure in etl_core     ← red text
```

- Timestamps in muted text (#475569)
- Prefix glyphs: ✓ (completion), → (dispatch), ◆ (plan event), ⚠ (warning), ✗ (error)
- New entries slide in from the top with a brief fade animation
- Faint alternating row shading (every other row: rgba(255,255,255,0.02))
- A thin horizontal separator between feed and fleet status

FLEET STATUS (bottom 45% of panel):
- Title: "Active Sessions" in small caps, muted text, with count badge "5"
- 5 compact session rows, each 56px tall on dark surface (#1A2E4A) with 4px rounded corners:

Session row format:
```
● ng-pipelines  ENG-391  ████████░░ 78%  42m elapsed
```

- Status dot: colored circle (blue=active, amber=needs-spec, red=idle-imminent, green=complete)
- Repo name in white, ticket ID in secondary text
- Thin progress bar: filled portion in teal (#06B6D4), unfilled in dark (#0F1F3D)
- Elapsed time in monospace muted text
- One session row (arthaus ENG-388, 95%) has an amber pulsing border and "⚠ NEXT SPEC NEEDED" badge
- One session row (data-lake ENG-390, 100%) is dimmed with green "✓ complete"

BOTTOM INPUT:
- Quick command input: dark surface (#1A2E4A), monospace placeholder text "$ ask about fleet state..." in muted green (#475569), subtle teal focus ring on click
- Resembles a terminal prompt — the "$" prefix reinforces the CLI aesthetic

OVERALL: This panel should feel like watching a live terminal feed of agent activity — dense, monospace, real-time, with just enough color coding to parse status at a glance. The traffic light dots and terminal prompt ground it in the developer tool aesthetic from the DevPilot marketing site.
```

---

## PROMPT 5 — Conductor Top Bar & Runway Urgency States

```
Design 3 variations of the DevPilot top navigation bar showing different system health states. Each bar is 1920px wide, 54px tall, on a deep panel background (#060F1E).

All bars share the same layout structure (left to right):
- DevPilot logo: a stacked chevron/mountain icon rendered in a teal-to-cyan gradient (#06B6D4 → #22D3EE), "DevPilot" text in white semibold 16px, separated by a thin vertical divider
- Runway indicator: large numeric display with status dot and "Runway" label
- Fleet summary pills: 3 compact rounded rectangles showing repo names with inline micro progress bars
- Navigation links: "Horizon" (active, teal underline) | "Timeline" | "Velocity" in secondary text
- Conductor Score: purple (#8B5CF6) rounded pill with score number and micro trend sparkline
- User avatar: small circle with initials, subtle border

VARIATION 1 — HEALTHY (Runway > 4h):
- Runway: "6.1h" displayed large (24px, bold) in green (#10B981) with a solid green dot (8px)
- "Runway" label in muted text (#94A3B8) below the number
- Fleet pills in calm state: "ng-pipelines ████░ 78%" / "ng-core ██░░░ 42%" / "arthaus ✓" — progress fills in electric blue (#3B82F6), text in white, surfaces in dark (#1A2E4A)
- Score: "847" in purple pill
- Overall mood: calm, professional, everything nominal

VARIATION 2 — AMBER WARNING (Runway 2-4h):
- Runway: "3.2h" in amber (#F59E0B), the dot pulses with a subtle glow animation
- A faint amber glow (radial gradient, 8% opacity) emanates from the runway indicator region
- One fleet pill shows an additional amber badge: "⚠ NEXT SPEC NEEDED" — the pill has a faint amber border
- Score: "712" (lower) in purple pill, trend arrow pointing slightly down
- Below the top bar, a thin amber warning stripe (2px) spans the full width
- Overall mood: attention needed — not alarming, but the Conductor should act

VARIATION 3 — CRITICAL (Runway < 2h):
- Runway: "1.4h" in red (#EF4444), larger/bolder (28px), the dot pulses rapidly with a red glow
- A red glow (radial gradient, 12% opacity) emanates from the runway region
- One fleet pill shows "🔴 IDLE IMMINENT" in red with a red pulsing border
- The entire top bar has a subtle red border-bottom that pulses: 1px solid alternating between rgba(239,68,68,0.6) and rgba(239,68,68,0.2)
- Score: "583" in purple pill, red trend arrow pointing down
- Below the top bar, a pulsing red warning stripe (3px)
- Overall mood: urgency — the fleet is about to starve. This should create visceral "feed the machine" energy without being garish

Show all 3 variations stacked vertically with labels. Between each variation, show a subtle arrow indicating escalation. The progression from green calm → amber caution → red urgency should be visually dramatic but always premium and professional — never cheap alarm-bell UI.

Typography: Inter for all text, JetBrains Mono for the fleet progress bars. Pill buttons have 6px rounded corners. The teal/cyan gradient on the DevPilot logo remains constant across all states — it's the brand anchor while everything else shifts with urgency.
```

---

## Usage Notes

- Feed these prompts to an image generation model (GPT-4o, Midjourney, DALL-E 3, Ideogram, etc.) to produce reference mockups
- Generated images should be saved to `/design/inspiration/` alongside this file
- When providing to the UX coding agent, pair each image with its corresponding design spec document (`00-WORK-HORIZON-SURFACE.md`, `01-PLAN-REVIEW-SURFACE.md`, etc.)
- The aesthetic constants in the "Aesthetic DNA" section override any conflicting values in individual prompts
