# Agentic Assist Panel — Design Agent Prompt Library

> DevPilot's proactive AI advisor. Context-sensitive suggestions that keep the Conductor one step ahead of the fleet.

---

## Concept Summary

The Agentic Assist Panel is DevPilot's proactive intelligence layer. It monitors fleet state, runway health, and horizon items, then surfaces timely, actionable suggestions to the Conductor. It's not a chatbot — it's a push-based advisor that speaks only when it has something worth saying. Suggestions appear as contextual inline responses or in a dedicated right-side panel.

---

## Trigger Conditions & Example Suggestions

| Trigger | Example Suggestion |
|---|---|
| Session at 70%+ with no READY spec | `ENG-391 completing — ng-core has 1 worker freeing up. Suggest promoting 'Reward model v2' to Shaping — no conflicting files in-flight.` |
| New item added | `Added to Directional. ng-core has 1 worker freeing soon — 2 related items already in horizon.` |
| Runway drops below 4h | `Runway at 3.8h. 2 items in Shaping could be promoted. ENG-395 has no conflicts — start planning?` |
| Plan approved | `Approved. Linear ticket ENG-394 created. Ruflo task graph staged. Dispatch when ready.` |
| Re-plan requested | `Constraint noted: avoid persona_assignment.py. Invoking Plan Mode with updated fleet context...` |

### Related Item Chips

Inline clickable chips embedded in suggestions:

```
[ ENG-388 ]  [ persona-lock ]  [ ng-pipelines ]
```

Clicking jumps to that item or applies that filter.

---

## Design Tokens

```css
--bg-panel:        #060F1E;
--bg-surface:      #1A2E4A;
--accent-primary:  #3B82F6;
--accent-purple:   #8B5CF6;
--accent-amber:    #F59E0B;
--accent-green:    #10B981;
--text-primary:    #F8FAFC;
--text-secondary:  #94A3B8;
--border:          rgba(255,255,255,0.08);
```

---

## Pre-Generated Design Agent Prompts

### PROMPT 1 — Agentic Assist Panel (Right Side-In)

```
Design a right-side panel called "Agentic Assist" for a dark-themed developer dashboard called DevPilot. This panel provides proactive AI-powered suggestions to the user.

DIMENSIONS: 400px wide, full viewport height. Slides in from the right edge. Background: #060F1E. Thin left border: rgba(255,255,255,0.08).

HEADER:
- "Assist" title in white, 16px bold
- Small purple AI icon or sparkle (✦) next to the title
- Right side: minimize "−" button and close "×" button
- Below title: "Context-aware suggestions" in muted text (#475569)

CONTENT: A vertically scrolling list of suggestion cards, most recent at the top. Each card is a self-contained suggestion.

SUGGESTION CARD FORMAT:
- Background: #1A2E4A, rounded corners 8px, 16px padding
- Top: Timestamp "2 min ago" in tiny muted text, right-aligned
- Trigger icon: Small icon indicating the trigger type (e.g. ⚠ for warnings, ✓ for confirmations, 💡 for suggestions)
- Body text: 13px Inter, white text (#F8FAFC). The suggestion message. Key values are bold (numbers, ticket IDs, repo names).
- Related item chips: Small rounded pill buttons at the bottom of the card. Each chip shows a ticket ID or keyword (e.g. "ENG-388", "ng-pipelines"). Chips have a subtle border and are clickable — styled with rgba(255,255,255,0.08) background, hover state: blue (#3B82F6) border.

Show 4 suggestion cards:

CARD 1 (URGENT — amber left border):
⚠ "ENG-391 at 85% — ng-core has 1 worker freeing up in ~20min. Suggest promoting 'Reward model v2' to Shaping — no conflicting files in-flight."
Chips: [ENG-391] [Reward model v2] [ng-core]
Action button: "Promote to Shaping →" in blue

CARD 2 (WARNING — amber tint):
⚠ "Runway at 3.8h. 2 items in Shaping could be promoted. ENG-395 has no conflicts — start planning?"
Chips: [ENG-395] [ng-pipelines]
Action button: "Start Planning →"

CARD 3 (CONFIRMATION — green left border):
✓ "Approved. Linear ticket ENG-394 created. Ruflo task graph staged. Dispatch when ready."
Chips: [ENG-394] [ng-pipelines]

CARD 4 (INFO — blue left border):
💡 "Added to Directional. ng-core has 1 worker freeing soon — 2 related items already in horizon."
Chips: [ENG-388] [persona-lock]

Each card has a colored left border (4px) indicating severity: amber for warnings, green for confirmations, blue for info, purple for planning events.

The panel should feel like a proactive assistant — not a chat log. Suggestions are discrete, scannable, and actionable. Think GitHub notifications panel meets Slack's thread sidebar.
```

### PROMPT 2 — Inline Assist Response (Below Quick Capture)

```
Design an inline suggestion response that appears temporarily below the Quick Capture input in DevPilot.

CONTEXT: The user just typed "Reward model v2 refinement" in the Quick Capture input and pressed Enter. An AI-generated response appears below the input.

LAYOUT: Full-width inline bar, 48px tall, positioned directly below the Quick Capture input. Background: rgba(26,46,74,0.8) with backdrop blur. Rounded bottom corners 8px. Thin top border: rgba(255,255,255,0.04).

CONTENT:
- Left: Small purple sparkle icon (✦)
- Center: Response text in 13px white: "→ Added to Directional. ng-core has 1 worker freeing soon — 2 related items already in horizon."
- Right: Two clickable chips: [ENG-388] [ng-core] — small rounded pills with subtle borders

ANIMATION: The response slides down from behind the input (translateY from -8px to 0), fading in from 0 to 1 opacity over 200ms.

FADE BEHAVIOR: After 8 seconds, the response fades out (opacity 0 over 500ms) unless the user hovers over it — in which case it stays visible. Show a subtle progress bar at the bottom of the response indicating time until auto-dismiss.

Show 3 states:
1. APPEARING: Mid-slide animation, 80% opacity
2. VISIBLE: Full response with chips, 100% opacity, progress bar at 60%
3. FADING: 40% opacity, progress bar at 95%, about to disappear

Dark background (#0F1F3D) behind everything. The input bar is visible above.
```

### PROMPT 3 — Assist Suggestion with Actionable CTA

```
Design a single Agentic Assist suggestion card that includes an actionable CTA button. This is the most important card variant — it asks the Conductor to take a specific action.

DIMENSIONS: ~360px wide, height auto. Background: #1A2E4A. Rounded corners 8px.

LEFT BORDER: 4px amber (#F59E0B) — this is an urgent suggestion.

CONTENT:
- Top right: "just now" timestamp in muted text
- Icon: ⚠ amber warning icon
- Body text (13px, white):
  "ENG-391 completing in ~20 min. ng-pipelines will have 2 idle workers.
  
  'Multi-touch Attribution Modeling' (ENG-394) is READY — dispatch now to prevent idle time."

- Related chips row: [ENG-391] [ENG-394] [ng-pipelines]
  Each chip is a small rounded pill (background rgba(255,255,255,0.06), border rgba(255,255,255,0.12))

- CTA row (below chips, 8px top margin):
  Primary button: "Dispatch ENG-394 →" — solid electric blue (#3B82F6), white text, full-width
  Secondary link: "Dismiss" — subtle muted text link, right-aligned below the button

HOVER STATE on CTA: Button brightens slightly, subtle shadow appears.

Show the card on a dark panel background (#060F1E). The amber left border and the blue CTA button should be the two most eye-catching elements.

This card represents the core value proposition of the assist system: it connects fleet state to actionable planning decisions without the Conductor needing to mentally track dependencies.
```

### PROMPT 4 — Empty State & Quiet Mode

```
Design two states for the Agentic Assist Panel when there are no active suggestions.

STATE 1 — EMPTY (No suggestions):
- Panel is 400px wide, full height, background #060F1E
- Center-aligned content:
  - A subtle icon: a checkmark inside a circle, in muted purple (#6D28D9)
  - Headline: "All clear" in white, 16px
  - Subtext: "No suggestions right now. Your fleet is healthy and runway is strong." in muted text (#94A3B8), 13px
  - Below: current fleet status summary in small text: "4 sessions active · Runway: 6.1h · Score: 847"

STATE 2 — QUIET MODE ENABLED:
- Same panel dimensions
- A banner at the top of the panel:
  - Background: rgba(139,92,246,0.1) — faint purple
  - Content: "🔕 Quiet mode — suggestions paused" in purple text
  - Right side: "Resume" link in electric blue
- Below the banner: dimmed previous suggestions at 40% opacity, non-interactive
- This mode exists for when the Conductor wants to focus without interruption

Show both states side by side on a dark background.
```

---

## Design Review Checklist

- [ ] Suggestions are scannable — key information is bold/highlighted
- [ ] Related item chips are clickable and visually distinct from body text
- [ ] Urgency levels are encoded by left border color (amber, red, green, blue)
- [ ] CTA buttons are prominent when action is required
- [ ] Inline responses below Quick Capture auto-dismiss appropriately
- [ ] Panel doesn't feel like a chat interface — it's push-based, not conversational
- [ ] Empty state is reassuring, not empty-feeling
- [ ] Quiet mode provides escape from notification fatigue
