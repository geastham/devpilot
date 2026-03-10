# Design System Tokens & Theme — Design Agent Prompt Library

> The shared visual language across all DevPilot surfaces. Every color, font, spacing, and motion value in one reference.

---

## Color Palette (Dark Theme — Primary)

### Backgrounds

| Token | Hex | Usage |
|---|---|---|
| `--bg-base` | `#0F1F3D` | Main page background |
| `--bg-panel` | `#060F1E` | Deeper panels (sidebars, overlays) |
| `--bg-surface` | `#1A2E4A` | Card surfaces, elevated elements |

### Zone Tints

| Token | Hex | Usage |
|---|---|---|
| `--zone-ready` | `#FFFFFF` | READY cards — maximum contrast |
| `--zone-refining` | `#DBEAFE` | REFINING cards — soft blue |
| `--zone-shaping` | `#EDE9FE` | SHAPING tiles — soft purple |
| `--zone-directional` | `#F3F4F6` | DIRECTIONAL rows — muted near-white |

### Accent Colors

| Token | Hex | Usage |
|---|---|---|
| `--accent-primary` | `#3B82F6` | Electric blue — Dispatch buttons, CTAs, active states |
| `--accent-amber` | `#F59E0B` | Warnings, needs-spec states |
| `--accent-red` | `#EF4444` | Critical states, idle-imminent, errors |
| `--accent-green` | `#10B981` | Healthy states, completions, Haiku model |
| `--accent-purple` | `#8B5CF6` | Conductor Score, plan events, Opus model |

### Model Colors

| Token | Hex | Model |
|---|---|---|
| `--model-haiku` | `#10B981` | Green — fast, cheap tasks |
| `--model-sonnet` | `#3B82F6` | Blue — balanced tasks |
| `--model-opus` | `#8B5CF6` | Purple — complex tasks |

### Text Colors

| Token | Hex | Usage |
|---|---|---|
| `--text-primary` | `#F8FAFC` | Primary content text |
| `--text-secondary` | `#94A3B8` | Labels, metadata, descriptions |
| `--text-muted` | `#475569` | Placeholders, hints, disabled text |

### Border Colors

| Token | Value | Usage |
|---|---|---|
| `--border` | `rgba(255,255,255,0.08)` | Default card/panel borders |
| `--border-amber` | `rgba(245,158,11,0.6)` | Warning state borders |
| `--border-red` | `rgba(239,68,68,0.6)` | Critical state borders |

---

## Typography

| Context | Font Family | Size | Weight |
|---|---|---|---|
| UI text (default) | Inter, system-ui | 14px | 400 |
| UI text (dense panels) | Inter, system-ui | 12px | 400 |
| Primary input | Inter, system-ui | 16px | 400 |
| Runway number | Inter, system-ui | 24px+ | 700 |
| Card titles | Inter, system-ui | 14px | 600 |
| Badges/chips | Inter, system-ui | 12px | 500 |
| Monospace (Fleet/Activity) | JetBrains Mono, Fira Code, monospace | 12-13px | 400 |
| File paths | JetBrains Mono | 12px | 400 |

---

## Spacing Scale

| Token | Value | Usage |
|---|---|---|
| `--space-1` | 4px | Tight inline spacing |
| `--space-2` | 8px | Card internal padding, gap between pills |
| `--space-3` | 12px | Section padding |
| `--space-4` | 16px | Card padding, column gaps |
| `--space-5` | 24px | Section gaps, panel padding |
| `--space-6` | 32px | Zone column gaps |

---

## Border Radius

| Token | Value | Usage |
|---|---|---|
| `--radius-sm` | 4px | Badges, chips |
| `--radius-md` | 8px | Cards, panels |
| `--radius-lg` | 12px | Major surfaces, overlays |
| `--radius-full` | 9999px | Pills, dots, circular elements |

---

## Motion / Animation

### Item Launch (Quick Capture submit)

```css
@keyframes itemLaunch {
  0%   { transform: translateY(0); opacity: 1; }
  60%  { transform: translateY(-40px); opacity: 0.6; }
  100% { transform: translateY(0); opacity: 0; }
}
/* Duration: 300ms. Easing: ease-out. */
```

### Border Pulse (amber/red warning states)

```css
@keyframes borderPulse {
  0%, 100% { box-shadow: 0 0 0 0 var(--pulse-color); }
  50%       { box-shadow: 0 0 0 4px var(--pulse-color); }
}
/* Duration: 2000ms. Easing: ease-in-out. Infinite loop. */
```

### Feed Item Slide-In

```css
@keyframes slideInFromTop {
  from { transform: translateY(-8px); opacity: 0; }
  to   { transform: translateY(0); opacity: 1; }
}
/* Duration: 200ms. Easing: ease-out. */
```

### Panel Expand/Collapse

```css
/* Height transition for accordion/expand states */
transition: height 200ms ease-out, opacity 150ms ease-out;
```

### Card Hover Elevation

```css
transition: box-shadow 150ms ease, transform 150ms ease;
/* Hover: transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.3); */
```

---

## Shadows

| Token | Value | Usage |
|---|---|---|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.2)` | Subtle card elevation |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.3)` | Hover state, dropdowns |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,0.4)` | Floating HUD, command palette |
| `--shadow-glow-amber` | `0 0 16px rgba(245,158,11,0.3)` | Amber warning glow |
| `--shadow-glow-red` | `0 0 16px rgba(239,68,68,0.3)` | Critical state glow |
| `--shadow-glow-purple` | `0 0 16px rgba(139,92,246,0.2)` | Score/plan event glow |

---

## Pre-Generated Design Agent Prompts

### PROMPT 1 — Full Design System Reference Sheet

```
Design a comprehensive design system reference sheet for a dark-themed developer dashboard called DevPilot. This should be a single-page visual reference showing all design tokens.

VIEWPORT: 1920x1200 (allow scrolling). Background: #0F1F3D.

SECTION 1 — COLOR PALETTE:
Show colored swatches organized in rows:
- Backgrounds: #0F1F3D (base), #060F1E (panel), #1A2E4A (surface) — large rectangles with hex labels
- Zone tints: #FFFFFF (ready), #DBEAFE (refining), #EDE9FE (shaping), #F3F4F6 (directional) — shown as card-shaped swatches on the dark background
- Accents: Electric Blue #3B82F6, Amber #F59E0B, Red #EF4444, Green #10B981, Purple #8B5CF6 — shown as filled circles with labels
- Model colors: Haiku (green), Sonnet (blue), Opus (purple) — shown as model badge pills
- Text: Primary #F8FAFC, Secondary #94A3B8, Muted #475569 — shown as text samples on dark bg

SECTION 2 — TYPOGRAPHY:
Show font samples:
- "Inter — Primary UI font" in Inter, showing weights 400/500/600/700 at sizes 12/14/16/24px
- "JetBrains Mono — Monospace" in JetBrains Mono, showing sample code text at 12/13px
- Hierarchy example: A card mock showing title (14px 600), metadata (12px 400), body (14px 400), badge (12px 500)

SECTION 3 — COMPONENT LIBRARY:
A grid of small component samples:
- ReadyCard (thumbnail)
- RefiningCard (thumbnail)
- ShapingTile (thumbnail)
- DirectionalRow (thumbnail)
- Model badge: [Haiku] [Sonnet] [Opus]
- Complexity chips: [S] [M] [L] [XL]
- Repo badge pill: [ng-pipelines]
- Fleet summary pill: [ng-core ██░░░ 42%]
- Score pill: [Score: 847]
- Runway indicator: "Runway: 4.2h ●"
- Status dots: blue (active), amber (warning), red (critical), green (complete)
- Button styles: Primary (blue solid), Secondary (outline), Ghost (text only)

SECTION 4 — SPACING & RADIUS:
Visual spacing scale (4/8/12/16/24/32px) shown as horizontal bars with pixel labels.
Border radius samples: 4px (badge), 8px (card), 12px (panel), full-round (pill).

SECTION 5 — MOTION:
Small storyboard strips showing:
- Item launch animation (3 frames)
- Border pulse animation (3 frames)
- Slide-in animation (2 frames)
- Hover elevation (2 frames: default, hover)

The reference sheet should feel like a Figma design system page — organized, precise, and immediately useful for a designer or engineer implementing the system.
```

### PROMPT 2 — Component States Matrix

```
Design a component states matrix for DevPilot's primary interactive elements. This is a reference grid showing every component in every possible state.

LAYOUT: Table/grid format on dark background (#0F1F3D).

COLUMNS: Default | Hover | Active/Pressed | Disabled | Loading

ROWS (one component per row):

ROW 1 — Primary Button ("Dispatch →"):
- Default: #3B82F6 solid, white text
- Hover: Slightly brighter blue, subtle shadow
- Active: Darker blue, pressed effect
- Disabled: #3B82F6 at 40% opacity, no cursor
- Loading: Spinner icon replacing text, same blue

ROW 2 — Secondary Button ("Re-plan ↺"):
- Default: Transparent, white border, white text
- Hover: rgba(255,255,255,0.06) fill
- Active: rgba(255,255,255,0.1) fill
- Disabled: 40% opacity
- Loading: Spinner replacing text

ROW 3 — Ghost Button ("← Back"):
- Default: No border, no fill, blue text
- Hover: Subtle underline
- Active: Darker blue text
- Disabled: Muted text

ROW 4 — Model Badge Pill:
- Three sub-rows: Haiku (green), Sonnet (blue), Opus (purple)
- Default: Filled pill
- Hover: Slight brightness increase
- Active: Ring/outline emphasis
- Disabled: Desaturated
- N/A for loading

ROW 5 — Complexity Chip:
- Four sub-rows: S (green), M (blue), L (amber), XL (red)
- Default: Filled small badge
- Hover: Slight scale up (1.05x)
- Active: Ring emphasis
- Disabled: Desaturated

ROW 6 — Repo Badge:
- Default: Colored pill with repo name
- Hover: Slight brightness
- Active: Outline emphasis
- N/A for disabled, loading

ROW 7 — Text Input:
- Default: No visible border, placeholder text
- Focus: Blue bottom border, cursor visible
- Filled: White text, no border
- Disabled: Muted bg, reduced opacity
- N/A for loading

Show each cell as a small component sample (~100px wide) at its actual rendering size. Label rows and columns clearly.
```

### PROMPT 3 — Dark Theme vs Potential Light Theme Comparison

```
Design a side-by-side comparison of DevPilot's primary view (Work Horizon, Gradient Strip layout) in two theme modes: the primary Dark Theme and a hypothetical Light Theme.

LEFT HALF — DARK THEME (current):
- Background: #0F1F3D
- Cards: Dark surfaces (#1A2E4A) with zone tints
- Text: White/gray on dark
- Show 2 ReadyCards, 1 RefiningCard, top bar
- All existing color tokens as specified

RIGHT HALF — LIGHT THEME (hypothetical):
- Background: #F8FAFC (near-white)
- Cards: White (#FFFFFF) with subtle shadows for elevation instead of bright-on-dark
- Zone tints: READY = white with blue-gray shadow, REFINING = light blue (#EFF6FF), SHAPING = light purple (#F5F3FF), DIRECTIONAL = light gray (#F9FAFB)
- Text: Dark gray (#1E293B) on light
- Accent colors remain the same (blue, amber, red, green, purple)
- Same component structure, adapted for light
- Top bar: White or very light gray with subtle bottom border

A vertical divider separates the two halves. Label each half clearly.

This comparison helps validate that the design system's structure (zone progression, visual weight, component hierarchy) works independently of the theme, and that a future light theme is achievable without redesigning the architecture.
```

### PROMPT 4 — Iconography Set

```
Design a minimal icon set for DevPilot. These icons appear throughout the UI in badges, buttons, and status indicators.

STYLE: Minimal line art, 1.5px stroke weight, rounded line caps. Designed for 16px and 20px rendering. Single color (white #F8FAFC on dark background).

ICONS TO DESIGN (show each at 16px and 20px side by side):

STATUS ICONS:
1. Active (blue dot) — filled circle
2. Warning (amber) — triangle with exclamation
3. Critical (red) — filled circle with pulse ring
4. Complete (green) — checkmark in circle
5. Error (red) — X in circle

ACTION ICONS:
6. Dispatch (→) — arrow pointing right
7. Promote (↗) — arrow pointing up-right
8. Re-plan (↺) — circular refresh arrow
9. Add (+) — plus sign
10. Expand (▶) — right-pointing triangle

OBJECT ICONS:
11. Workstream — parallel horizontal lines (railroad tracks)
12. Task — single checkbox outline
13. Plan — document with lines
14. Fleet — grid of dots (3×2)
15. Runway — horizontal gauge/meter
16. Score — star or trophy outline
17. File — document outline
18. Conflict — two overlapping documents with warning

SYSTEM ICONS:
19. Settings (gear)
20. Layout switcher (grid)
21. Close (×)
22. Minimize (−)
23. Search/command (⌘)
24. Keyboard shortcut indicator (⌨)

Show all icons on a dark background (#0F1F3D) arranged in a 6×4 grid. Each icon has a label below it in 10px muted text. Group by category with subtle section headers.

The icon style should be consistent with the Inter + JetBrains Mono typography — geometric, clean, professional. Think Lucide or Heroicons aesthetic.
```

---

## Design Review Checklist

- [ ] All zone tints are distinguishable from each other and from the background
- [ ] Model colors (Haiku/Sonnet/Opus) are distinct and memorable
- [ ] Accent colors provide clear semantic meaning (blue=action, amber=warning, red=critical, green=good, purple=score)
- [ ] Typography scale provides clear hierarchy without too many sizes
- [ ] Monospace font is used consistently for technical content (files, logs)
- [ ] Animation durations are short enough to feel snappy (200-300ms)
- [ ] Shadows are subtle — dark theme relies on color/border, not heavy shadows
- [ ] Spacing scale is consistent and predictable
- [ ] All interactive elements have clear hover/active states
