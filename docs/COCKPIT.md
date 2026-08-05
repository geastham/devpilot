# The cockpit

The cockpit is DevPilot's operating surface: a work horizon, a planning agent,
wave-based dispatch, and the instruments that tell a conductor whether their
fleet is about to run dry.

It ships inside the open-source CLI.

```bash
npm i -g @devpilot.sh/cli
devpilot serve            # → http://127.0.0.1:3847
```

That was not true until recently. `devpilot serve` used to start a second,
Fastify implementation of the API and serve no UI at all — its source read
`// Note: In a full implementation, this would open the UI`. The cockpit
existed and ran only from a repo checkout. See *Packaging* below.

---

## The mental model

Everything you intend to build sits in one queue and gets more structured as it
moves toward dispatch.

```
DIRECTIONAL  →  SHAPING  →  REFINING  →  READY  →  dispatched to the fleet
 a one-liner    feature      plan under   specced,
 you captured   intent       review       staged
```

| Zone | Means | Visual weight |
|---|---|---|
| `READY` | Specced, dependency-resolved, staged. One click dispatches. | Largest, highest contrast |
| `REFINING` | A plan exists and you are reviewing it. | Medium |
| `SHAPING` | Feature-level intent; the planning agent can pick it up. | Smaller |
| `DIRECTIONAL` | A rough thought. Capture-first, zero structure. | Smallest, quietest |

The weights are not decoration — they are `spec/DESIGN.md` §2.1, and they exist
so a conductor can tell dispatchable work from a scratchpad thought without
reading a word.

**The core claim:** the bottleneck is planning throughput, not agent capacity.
Agents consume specs faster than a human writes them, so the cockpit's job is to
make the conductor faster than the fleet.

---

## Instruments

| Signal | What it measures | Thresholds |
|---|---|---|
| **Runway** | How long the READY queue lasts at current fleet velocity | Amber < 4h, red < 2h |
| **Idle warning** | A session >70% done with nothing queued behind it | Amber pulse |
| **Idle imminent** | >90% done with no READY item | Red pulse + badge |
| **Conductor score** | Planning throughput over time | — |

An idle agent is the one cost that is entirely avoidable, which is why two of
the four instruments are about seeing it coming.

---

## Motion language

Defined in `src/styles/motion.css`. One rule governs it:

> **Motion is diegetic.** Every animation encodes fleet state. If a motion does
> not represent state, it does not belong.

That rule is what makes an animated operational screen defensible rather than
exhausting — in a cockpit, a blinking light means something.

| Class | Encodes |
|---|---|
| `dp-sweep` | Runway. **The rate is the signal** — 4.5s healthy, 2.2s amber, 1.1s critical |
| `dp-pulse-warn` / `dp-pulse-urgent` | Idle risk, at two urgencies |
| `dp-breathe` | A live agent. Slow and low-contrast: "working" must not compete with a warning |
| `dp-flow` | The critical path through a dependency graph |
| `dp-enter` / `dp-stagger` | Arrivals — a zone reads as assembled, not repainted |
| `dp-launch` | An item leaving READY for the fleet |
| `dp-ambient` / `dp-radar` | **The only exception.** Atmosphere, confined to backdrops carrying no data |

### Accessibility

Every animation is switched off by a single `prefers-reduced-motion` block at
the bottom of `motion.css`. It is a wildcard list rather than per-rule opt-ins,
so a new animation cannot forget to participate.

Motion is always a **second channel** — colour and text carry the same signal —
so reduced motion loses emphasis and never information. Add animations to that
block when you add them.

---

## Wave planning

A plan is not a checklist. The planning agent assembles live fleet context —
which sessions are active, which files are locked in flight, what capacity each
repo has — and returns a **dependency graph**. Independent tasks are grouped
into waves that dispatch concurrently; when every task in wave N finishes, wave
N+1 stages itself.

Because it is a DAG, the **critical path** is computed rather than guessed: you
find out which task gates the release before you start it.

View an executing plan at `/waves`. Critical edges render emerald and flow;
everything else stays grey.

> An edge is on the critical path only when **both endpoints are on it and are
> adjacent in it**. Testing endpoints alone lights up every edge that merely
> touches the path, which turns the longest chain into a bush.

---

## Running it locally

```bash
pnpm dev:app                      # cockpit on :3000 (PORT= to change)
pnpm --filter @devpilot.sh/core db:seed     # horizon items, sessions, plans
node scripts/seed-wave-plan.mjs             # an executing wave plan
```

Two traps worth knowing:

**Seed paths are relative to cwd.** Running the core seed through
`pnpm --filter` puts you in `packages/core`, so it silently creates a *second*
database there. Pass an absolute path:

```bash
DEVPILOT_SQLITE_PATH="$PWD/.devpilot/data.db" pnpm --filter @devpilot.sh/core db:seed
```

**Never run `pnpm build:app` while `pnpm dev:app` is running.** The production
build overwrites `.next` underneath the dev server and every route starts
500ing with `Cannot read properties of undefined (reading '/_app')`. Stop the
dev server, `rm -rf .next`, then build.

---

## Packaging

`devpilot serve` runs the cockpit's own Next server. There is **one** API
implementation and one UI.

```
next.config.mjs         output: 'standalone' — traces the server and its deps
scripts/bundle-cockpit  assembles that into packages/cli/ui (~24 MB)
package.json            "ui" in files; prepublishOnly runs the bundler
```

The bundler copies `.next/static` and `public` explicitly. **Next does not do
this for you**, and a cockpit missing `.next/static` boots fine and renders with
no CSS — a failure that looks like a styling bug rather than a packaging one. The
script hard-fails instead.

`tests/e2e/cockpit-serve.test.ts` guards the contract: if `ui` falls out of
`files`, npm publishes a CLI with no cockpit and no other test would notice.

---

## Known gaps

- **Wave hand-off is not animated.** When wave N completes and N+1 stages, the
  product's most satisfying moment happens invisibly.
- **Comprehension.** The zone names are jargon, the flow direction is never
  stated, and `Runway` / `Score` are unlabelled numbers. The screen is dense
  before it is legible.
- **`three-panel` and `timeline` layouts** are declared in the switcher and fall
  back to the default.
- **The DAG is visually flat** compared to the marketing hero image it echoes —
  no layered depth, haze, or bloom.
