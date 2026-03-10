# Top Bar & Floating HUD — Design Agent Prompt Library

> Persistent status surfaces. The Top Bar is always visible in full layouts; the Floating HUD provides minimum viable awareness when DevPilot is backgrounded.

---

## Top Bar — Concept Summary

The Top Bar is the Conductor's ambient awareness strip. It spans the full viewport width at the top of every layout variant. Three pieces of information are always present: Runway health, Fleet status, and Conductor Score. The Conductor should never need to navigate away from their current view to answer "how is my fleet doing right now?"

### Top Bar Anatomy

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ⧡ DevPilot   Runway: 4.2h ●   [ ng-pipelines ████░ 78% ] [ ng-core ██░░░ 42% ]   Score: 847  │
└──────────────────────────────────────────────────────────────────────────────┘
```

Components (left to right):
1. **Logo/wordmark**: "⧡ DevPilot" — small, non-interactive
2. **RunwayIndicator**: Hours remaining, color-coded dot (green/amber/red)
3. **FleetSummaryPills**: Compact progress pills per active repo
4. **ConductorScorePill**: Purple pill with current score

---

## Floating HUD — Concept Summary

The Floating HUD is an independently toggled overlay widget. It renders as a floating pill/panel over any view — even when DevPilot is minimized or the Conductor is in another application. Three states with progressive disclosure:

| State | Dimensions | Trigger |
|---|---|---|
| MINIMIZED | Pill (~200px x 40px) | Default |
| QUICK-ADD | Pill (~200px x 120px) | Click [+] |
| EXPANDED | Panel (400px x 600px) | Click pill body |

### Minimized Pill Content

```
⧡ DevPilot  Runway: 4.2h ⚠  6 hives  [+]
```

Glow effect when runway < 4h. Pulse animation when runway < 2h.

---

## Design Tokens

```css
--bg-topbar:       #060F1E;
--bg-hud:          rgba(6,15,30,0.95);
--accent-primary:  #3B82F6;
--accent-amber:    #F59E0B;
--accent-red:      #EF4444;
--accent-green:    #10B981;
--accent-purple:   #8B5CF6;
--text-primary:    #F8FAFC;
--text-secondary:  #94A3B8;
--border:          rgba(255,255,255,0.08);
```

---

## Pre-Generated Design Agent Prompts

### PROMPT 1 — Top Bar: Full Width with All Components

```
Design a full-width top navigation/status bar for a dark-themed developer dashboard called DevPilot.

DIMENSIONS: 1920px wide, 48px tall. Fixed to top of viewport. Background: #060F1E. Bottom border: rgba(255,255,255,0.08).

LAYOUT (left to right):

LEFT SECTION:
- Logo: "⧡ DevPilot" — the "⧡" symbol in electric blue (#3B82F6), "DevPilot" in white (#F8FAFC), 14px semibold Inter. Small and unobtrusive.

CENTER-LEFT — Runway Indicator:
- Text: "Runway:" label in muted text (#94A3B8), followed by "4.2h" in green (#10B981), 16px bold
- A small colored dot (green) to the right of the number, gently pulsing
- This is the single most important number on screen

CENTER — Fleet Summary Pills:
- 3 compact pills in a row, 8px gap between
- Each pill: ~160px wide, 28px tall, rounded corners (14px)
- Background: rgba(255,255,255,0.06)
- Content: Repo name (12px white) + mini progress bar (50px, 3px tall) + percentage (12px)
- Pill 1: "ng-pipelines" with blue progress bar at 78%
- Pill 2: "ng-core" with blue progress bar at 42%
- Pill 3: "arthaus ✓" — completed, green checkmark, dimmed

RIGHT SECTION — Conductor Score:
- Purple pill (#8B5CF6 background), ~100px wide, 28px tall
- Content: "Score: 847" in white, 13px bold
- Subtle inner glow

Show the full bar on the #060F1E background. Below it, show a faint hint of the Work Horizon content area (#0F1F3D) to give context of where the bar sits.
```

### PROMPT 2 — Top Bar: Runway Urgency Cascade

```
Design 3 variants of the Runway Indicator component (part of the DevPilot top bar) to show the full urgency cascade.

Each variant is a section of the top bar approximately 200px wide, showing the runway indicator in isolation on a #060F1E background.

VARIANT 1 — HEALTHY (Runway > 4h):
- "Runway: 6.1h" — number in green (#10B981), bold 16px
- Green dot indicator, subtle steady pulse
- Calm, no urgency

VARIANT 2 — AMBER (Runway 2-4h):
- "Runway: 3.2h" — number in amber (#F59E0B), bold 16px
- Amber dot indicator, more noticeable pulse
- A subtle amber glow emanating from behind the number (box-shadow)
- Below (optional): tiny text "⚠ 2 items in Shaping could be promoted" in amber, 11px

VARIANT 3 — CRITICAL (Runway < 2h):
- "Runway: 1.1h" — number in red (#EF4444), bold 20px (LARGER than normal — urgency scaling)
- Red dot indicator, aggressive pulse animation
- Red glow behind the number, more intense than amber variant
- The entire section has a faint red background tint
- Below: tiny text "Fleet running dry — promote specs now" in red, 11px, bold

Show all 3 variants stacked vertically with labels. The visual progression from calm → concerned → alarming should be immediately obvious.
```

### PROMPT 3 — Floating HUD: All Three States

```
Design a floating widget called "Floating HUD" for DevPilot with 3 progressive disclosure states. Show all 3 states arranged vertically on a blurred desktop background (simulate a code editor or browser behind).

STATE 1 — MINIMIZED (default):
- Pill shape: 220px wide, 40px tall, fully rounded corners (20px)
- Background: rgba(6,15,30,0.95) with backdrop-filter: blur(16px)
- Border: rgba(255,255,255,0.12)
- Content: "⧡ DevPilot  Runway: 4.2h ⚠  6 hives  [+]"
  - "⧡" in blue, "DevPilot" in white 12px
  - "Runway: 4.2h" in amber (it's below 4h threshold) 12px bold
  - "⚠" amber warning icon
  - "6 hives" in muted text
  - "[+]" button on far right — small circle with plus icon
- Subtle amber glow around the pill (runway < 4h)
- This should look like a macOS floating widget — premium, minimal, always-on-top

STATE 2 — QUICK-ADD (click [+]):
- Same pill position but expanded downward: 220px wide, 130px tall
- Top section: same as minimized pill content
- Below: A compact text input (the Quick Capture, mini version)
  - Placeholder: "Quick add..."
  - Small zone pill selector: [D] [S] [R]
  - Tiny "Enter ↵" hint
- Rounded bottom corners, same backdrop blur
- Transition: The pill smoothly expands downward (height animation 200ms)

STATE 3 — EXPANDED (click pill body):
- Full panel: 400px wide, 600px tall
- Anchored to the same position as the pill
- Contains:
  - Header: Runway indicator + Score pill (same as top bar)
  - Mini Work Horizon: Compact zone tabs (READY | REFINING | SHAPING | DIR) with item counts
  - Below tabs: 4-5 compact item rows from the selected zone
  - Fleet summary: 2-3 compact session rows with progress bars
  - Quick Capture input at the bottom
- Transition: Pill morphs into panel (width + height animate, content fades in 200ms later)

Background for all states: A blurred screenshot of a code editor (dark theme) to simulate the HUD floating over another application.

The Floating HUD should feel like the Raycast or Spotlight — always accessible, minimal footprint, progressive disclosure.
```

### PROMPT 4 — Floating HUD: Critical State with Red Pulse

```
Design the Floating HUD pill in its CRITICAL state — runway is below 2 hours and agents are about to idle.

PILL: 220px wide, 40px tall, fully rounded.

CONTENT: "⧡ DevPilot  Runway: 0.8h 🔴  4 hives  [+]"

URGENCY EFFECTS:
- The pill has a pulsing red border — animated box-shadow that oscillates between 0 and 6px spread in red (#EF4444 at 40% opacity)
- "Runway: 0.8h" is in red, bold, slightly larger than normal (14px vs 12px)
- The red dot "🔴" pulses in sync with the border
- A faint red glow radiates outward from the pill into the blurred background
- The overall pill background shifts slightly warmer — rgba(30,10,10,0.95)

ANIMATION KEYFRAMES (annotate):
- Frame 1 (0ms): box-shadow at 0px spread, dot at normal size
- Frame 2 (500ms): box-shadow at 6px spread, dot slightly larger (1.2x scale)
- Frame 3 (1000ms): back to 0px spread, dot normal — loop

Show the pill on a blurred desktop background. The red pulse should feel like a heartbeat — urgent but not jarring. It should draw attention without causing anxiety. Think "car dashboard warning light" energy.
```

### PROMPT 5 — Top Bar: Layout Switcher

```
Design a layout switcher control that sits inside the DevPilot top bar (or as a small dropdown). The Conductor can switch between 4 layout modes.

TRIGGER: A small icon button in the top bar — a grid/layout icon (⊞). On click, a dropdown appears.

DROPDOWN:
- Dimensions: 280px wide, auto height. Background: #1A2E4A. Rounded 8px. Drop shadow.
- Position: Below the layout icon, right-aligned

OPTIONS (4 rows):

ROW 1 — GRADIENT STRIP (default, selected):
- Small preview thumbnail (40px × 24px): 4 vertical columns in gradient from muted to vivid
- Label: "Gradient Strip" in white, 13px
- Sublabel: "Default — 4-zone horizontal flow" in muted text, 11px
- Selected indicator: blue left border + blue checkmark

ROW 2 — MISSION CONTROL:
- Thumbnail: Grid layout with left sidebar, center content, right panel
- Label: "Mission Control"
- Sublabel: "Full density — fleet + horizon + feed"

ROW 3 — THREE-PANEL:
- Thumbnail: 3 equal vertical panels
- Label: "Three Panel"
- Sublabel: "NOW / NEXT / THINK"

ROW 4 — RUNWAY TIMELINE:
- Thumbnail: Horizontal Gantt bars with a NOW line
- Label: "Runway Timeline"
- Sublabel: "Temporal view — Gantt tracks + queue"

Each row has a hover state: background rgba(255,255,255,0.04). Thumbnails are miniature, abstract representations — just shapes and colors to convey the layout structure.

Show the dropdown open, with Gradient Strip selected.
```

---

## Design Review Checklist

- [ ] Runway health is the most prominent element in the top bar
- [ ] Fleet pills are compact enough for 3-5 sessions without overflow
- [ ] Score pill is visible but not competing with runway for attention
- [ ] Floating HUD is usable at minimized size — key info without interaction
- [ ] HUD state transitions (minimize → quick-add → expand) feel smooth
- [ ] Critical state pulse is attention-getting but not anxiety-inducing
- [ ] Layout switcher thumbnails are immediately distinguishable
- [ ] Top bar works at narrow viewport widths (responsive collapse strategy)
