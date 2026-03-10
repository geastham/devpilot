# Quick Capture Input — Design Agent Prompt Library

> Zero-friction idea capture. The Conductor's fastest path from thought to horizon item.

---

## Concept Summary

The Quick Capture Input is always visible — pinned to the bottom or center of the viewport. It's DevPilot's fastest interaction: a thought enters the Conductor's mind, they type it, hit Enter, and it's in the horizon. No forms, no modals, no decisions beyond "which zone?" The input also serves as the entry point for agentic responses — after submitting, a brief inline response confirms the action and surfaces related context.

### Behavior Spec

```
[  What needs to happen next...                          ] [Add]
   Zone: [+ Directional ▾]
```

- `Enter` submits
- `Tab` cycles zone selector: Directional → Shaping → Refining
- On submit: item launches upward (CSS translateY keyframe animation, 300ms)
- Agent response appears inline (single line, fades after 8s unless hovered)
- Response chips: related ticket IDs, clickable

### Example Agent Response

```
→ Added to Directional. ng-core has 1 worker freeing soon — 2 related items in horizon.
```

---

## Design Tokens

```css
--bg-base:         #0F1F3D;
--bg-surface:      #1A2E4A;
--accent-primary:  #3B82F6;
--text-primary:    #F8FAFC;
--text-secondary:  #94A3B8;
--text-muted:      #475569;
--border:          rgba(255,255,255,0.08);
```

---

## Pre-Generated Design Agent Prompts

### PROMPT 1 — Quick Capture Input: Full Component

```
Design an always-visible input component called "Quick Capture" for a dark-themed developer dashboard called DevPilot. This is the primary way users add new work items.

POSITION: Fixed to the bottom center of the viewport. Floating above the content with a subtle backdrop blur.

DIMENSIONS: 640px wide, ~80px tall (including the zone selector row). Centered horizontally. 24px from the bottom of the viewport.

BACKGROUND: #1A2E4A with backdrop-filter: blur(12px) and rgba(26,46,74,0.9) semi-transparency. Rounded corners 12px. Subtle shadow: 0 -4px 24px rgba(0,0,0,0.3). Thin border: rgba(255,255,255,0.08).

TOP ROW — Input:
- A text input field spanning most of the width
- Placeholder text: "What needs to happen next..." in muted text (#475569)
- On the right: an "Add" button — small, rounded, electric blue (#3B82F6) background, white text
- Input text: white (#F8FAFC), 15px Inter
- Input has no visible border in default state, subtle blue bottom-border on focus

BOTTOM ROW — Zone Selector:
- Below the input, left-aligned
- Label: "Zone:" in muted text (#475569), 12px
- Zone selector pills: A set of small rounded pills showing the target zone
- Default selected: "+ Directional" with a subtle highlight
- Other options (shown on Tab cycle or click): "Shaping", "Refining"
- Selected pill: rgba(255,255,255,0.1) background, white text
- Unselected pills: transparent, muted text
- A small "Tab to cycle" hint in tiny muted text to the right

STATES — show 4 variants stacked vertically:

1. DEFAULT: Empty input with placeholder, Directional selected
2. TYPING: Input contains "Improve persona lock threshold logic", Directional selected, cursor visible
3. ZONE CYCLING: Input contains text, "Shaping" is selected (highlighted), a subtle transition indicator between Directional and Shaping
4. SUBMITTED: Input is clearing, the typed text is animating upward (translateY(-40px), opacity fading) — a "launch" animation. Below the input, an inline agent response is appearing: "→ Added to Directional. ng-core has 1 worker freeing soon — 2 related items in horizon." with chips [ENG-388] [ng-core]

Dark page background (#0F1F3D) behind everything.
```

### PROMPT 2 — Quick Capture: Submit Animation Storyboard

```
Design a 5-frame animation storyboard showing the item "launch" animation when a user submits an idea via Quick Capture in DevPilot.

FRAME 1 — READY TO SUBMIT (0ms):
The Quick Capture input contains "Improve persona lock threshold logic". The zone is "Directional". The "Add" button is highlighted (hover state). The user is about to press Enter.

FRAME 2 — LAUNCH START (0-100ms):
The text content of the input begins to animate upward. A ghost copy of the text rises from the input, starting its translateY movement. The input field itself begins to clear. The text ghost has full opacity.

FRAME 3 — LAUNCH MID (100-200ms):
The text ghost is now 40px above the input, opacity at 60%. It's visually "flying" toward the DIRECTIONAL zone column above. The input field is now empty. A subtle particle trail or blur effect follows the text ghost upward.

FRAME 4 — LAUNCH COMPLETE (200-300ms):
The text ghost has faded to 0% opacity. In the DIRECTIONAL zone column (visible above), a new DirectionalRow is appearing with a brief "pop" scale animation (scale from 0.95 to 1.0). The input is clean and ready for the next item.

FRAME 5 — AGENT RESPONSE (300-600ms):
Below the Quick Capture input, an inline response slides down into view: "→ Added to Directional. ng-core has 1 worker freeing soon — 2 related items in horizon." with two clickable chips [ENG-388] [ng-core]. A subtle progress bar at the bottom indicates this response will auto-dismiss in 8 seconds.

Show all 5 frames in a horizontal strip. Dark background (#0F1F3D). Label timestamps on each frame. Use motion lines or blur effects to indicate movement direction.
```

### PROMPT 3 — Quick Capture: Keyboard-First Interaction

```
Design an annotation diagram showing all keyboard interactions for the Quick Capture input in DevPilot. This should be an educational/reference visual — not a wireframe, but a component with overlaid annotations.

BACKGROUND: Dark (#0F1F3D). The Quick Capture component is centered.

COMPONENT: The Quick Capture input in its typing state, with "Multi-touch attribution" entered and "Shaping" zone selected.

ANNOTATIONS (callout arrows pointing to relevant parts):

1. Arrow to the input field: "Focus: Cmd+K (also opens command palette)"
2. Arrow to the zone selector: "Tab: Cycle zone — Directional → Shaping → Refining → Directional"
3. Arrow to the text: "Enter: Submit item to selected zone"
4. Arrow to the zone pills: "Click: Select zone directly"
5. Arrow to the "Add" button: "Click or Enter: Same action"
6. Arrow to the overall component: "Escape: Blur input, close any expanded state"

STYLE: Annotations are thin lines with small circular terminals, leading to text labels in a handwritten or annotation font. Labels are in white on semi-transparent dark backgrounds. Think Figma annotation style.

Below the main component, show a small keyboard shortcut reference card:
┌──────────────────────────────────┐
│ Cmd+K   Focus / Command Palette  │
│ Tab     Cycle zone               │
│ Enter   Submit                   │
│ Escape  Dismiss                  │
└──────────────────────────────────┘

Background of reference card: rgba(255,255,255,0.04). Monospace font for shortcuts.
```

### PROMPT 4 — Quick Capture: Command Palette Mode

```
Design an extended state of the Quick Capture input where it functions as a command palette (triggered by Cmd+K). This is a dual-purpose component — it captures new items AND provides quick navigation.

DIMENSIONS: Same width (640px) but taller (~400px) when in command palette mode. Centered on screen with a dark overlay behind.

BACKGROUND: #1A2E4A, rounded corners 12px, backdrop-filter blur. Semi-transparent dark overlay on the rest of the viewport.

INPUT: Same as Quick Capture but with a "⌘" icon prefix and placeholder: "Search items, run commands, or capture an idea..."

BELOW INPUT — Command Results:
A scrollable list of results, grouped by category:

GROUP 1 — "Horizon Items" (3 results):
Each row: Zone badge (READY/REFINING/SHAPING), ticket ID, title
- [READY] ENG-394 · Multi-touch Attribution Modeling
- [REFINING] ENG-395 · Persona Lock Threshold
- [SHAPING] ENG-396 · Reward Model v2

GROUP 2 — "Actions" (3 results):
Each row: Action icon, action name
- ⊕ New item → Directional
- ↺ Re-plan selected item
- ▶ Dispatch next READY item

GROUP 3 — "Fleet" (2 results):
- [ng-pipelines] 78% — ENG-391
- [ng-core] 42% — ENG-389

SELECTION: Arrow keys navigate the list. Currently selected row has a subtle blue background highlight. Enter executes the selected action or navigates to the selected item.

FOOTER: Keyboard hints: "↑↓ Navigate · Enter Select · Esc Close" in tiny muted text.

Show the command palette in its populated state with "attr" typed in the input, filtering results to show matching items. The dark overlay should dim the background content visible behind.
```

---

## Design Review Checklist

- [ ] Input is visible without scrolling or navigating — always present
- [ ] Capture to submission is achievable in < 5 seconds
- [ ] Zone selector doesn't require a click — Tab cycling is sufficient
- [ ] Submit animation provides satisfying visual feedback
- [ ] Agent response is informative but not blocking — auto-dismisses
- [ ] Related item chips in the response are actionable
- [ ] Keyboard shortcuts are discoverable (hints visible)
- [ ] Command palette mode provides power-user speed without cluttering default state
- [ ] Backdrop blur creates depth separation from underlying content
