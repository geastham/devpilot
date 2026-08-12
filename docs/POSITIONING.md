# Positioning

**The shared language.** Derived from `docs/VISION.md`. If you are writing
marketing copy, docs, content-engine briefs, or release notes, use this. If it
disagrees with the vision doc, the vision doc wins and this needs updating.

Written for the content/SEO workstream as much as for the product.

---

## The one sentence

> DevPilot makes you measurably better at the skill that replaced programming.

## The thesis in three lines

The role of programming has moved from **building to conducting**. A technical
lead now decides what gets built, in what order, in parallel with what — and
judges what comes back. The typing is delegated; the judgment is not.

Conducting is a distinct skill. It is the highest-leverage one in software, and
the only one with **no training, no measurement, and no visible standard of
excellence.**

## What DevPilot is

| | |
|---|---|
| **Cockpit** | Where you conduct. Open source, local, MIT |
| **Arena** | Where you find out how good you are. Hosted, free |
| **Memory** | Where your planner learns what the best conductors know. Hosted, paid |

The cockpit is retention. **The arena is adoption.** A better cockpit is a weak
reason to start — the incumbent is a terminal and a to-do list, and it is free.
A public standard of skill is a reason to start.

---

## Language

### Use

- **conductor**, **conducting**, **the fleet**
- **planning throughput** — the bottleneck is planning, not agent capacity
- **runway** — how long the READY queue lasts at current fleet velocity
- **wave** — a set of tasks that can safely run in parallel
- **the cockpit** — the operating surface

### Avoid

- "AI pair programmer", "copilot", "10x developer" — wrong category, and the
  category we are arguing has been replaced
- "orchestration platform" — accurate and inert; it describes plumbing when the
  claim is about a skill
- "manage your agents" — management is not the interesting verb. Conducting is
- Any framing where the product writes the code. It does not. It decides what
  gets written and by whom

### Say precisely

- Transcripts are **end-to-end encrypted**; the server cannot read message
  content. Sizes, timing and participant metadata do leak, and system notices
  are plaintext. Say that rather than implying perfect privacy — TRD 06 §3.2 is
  the load-bearing table and marketing copy must match its wording.
- The **open core remembers your machine; the hosted product remembers your
  fleet.** Nothing is withheld from the OSS build to create the upsell.

---

## Claims we can make, and the evidence

Only these. Each is checkable, which is the point — the March 2026 core update
deleted the pages that were not.

| Claim | Evidence |
|---|---|
| Runs real coding agents end to end on your machine | Two verified sessions, real cost and token telemetry (`docs/SESSION-RUNNER.md`) |
| Plans are dependency graphs, not checklists; the critical path is computed | `packages/core/src/wave-planner`, rendered at `/waves` |
| The conductor loop is a resumable agent with human review as a real pause | `docs/CONDUCTOR-AGENT.md`, verified live |
| Transcripts the server cannot read | TRD 06, `packages/bridge-protocol`, pgTAP + crypto tests |
| Reproducible benchmarks across agents and models | `packages/benchmarks` — **not yet published; do not claim results until V1.3** |

## Claims we cannot make yet

Listed so nobody reaches for them by accident:

- ❌ Anything about a leaderboard, ranking, or "top conductors" — the arena does
  not exist and the score has no agreed definition (V1.1)
- ❌ "Learns from your fleet" / "gets smarter over time" — memory is currently
  **write-only** (V1.2)
- ❌ Benchmark numbers comparing agents or models — the harness exists, the
  published results do not (V1.3)
- ❌ Cross-customer insight of any kind — explicitly forbidden today
  (TRD 15 §4.3)

**When these unblock, this file changes first.** A claim that ships before its
evidence is the failure mode the content engine was built to avoid.

---

## Audience

The **conductor**: a technical lead or senior engineer already running multiple
coding agents and feeling the planning bottleneck. They are not asking "should I
use AI." They are asking why their agents are idle, or why two of them just
edited the same file.

They search for narrow, high-intent things — *"claude code linear integration"*,
*"run coding agent on my own machine"*, *"codex vs claude code parallel tasks"*.
See `devpilot-website/docs/CONTENT-ENGINE.md` §1.

## The content angle the vision unlocks

Once the arena exists, the strongest content is **what the best conductors do
differently** — how they decompose a migration, when they widen a wave, which
dependencies they refuse to parallelise. Nobody else can write it, because
nobody else has the data.

`CONTENT-ENGINE.md` §2 already lists anonymised fleet telemetry as the strongest
long-term moat and correctly refuses to plan content against it before the data
exists. **V1 → V3 is where that data comes from.** Until then, the durable
material is the engineering: dispatch architecture, the crypto design, the `ao`
integration failure, the benchmark methodology.
