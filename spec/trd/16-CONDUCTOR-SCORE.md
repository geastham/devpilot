# TRD 16 — The Conductor Score
## Making the number rankable
### v0.1 · August 2026 · Status: DESIGN — one decision required

---

## 1. Why this is first

`docs/VISION.md` makes the Conductor Score the scoreboard of a discipline and
the arena the adoption mechanism. **None of it works until the score is a single,
defined, defensible number.** It currently is not.

This is V1.1, and it blocks V2 entirely.

## 2. What is actually true today

Two weightings are live in the codebase at once.

| Dimension | `DESIGN.md` §8.1 | Implementation |
|---|---|---|
| Fleet Utilization | 0–250 | 0–200 |
| Runway Health | 0–250 | 0–200 |
| Plan Accuracy | 0–200 | 0–200 |
| Cost Efficiency | 0–200 | 0–200 |
| Velocity Trend | 0–100 | 0–200 |
| **Total** | 1000 | 1000 |

The implementation is internally consistent — schema defaults,
`/api/score/route.ts` (`max: 200`), and the `Math.min(200, …)` clamps in the
dispatch and orchestrator-complete routes all agree. The spec is the outlier.

But the seed sets `velocityTrend: 138`, which is **impossible** under the spec's
cap of 100. That is how the divergence surfaced: nothing rendered the dimensions
until the score breakdown was built, so a total of 742 concealed a component that
could not exist.

### 2.1 What is missing regardless

- **`parallelizationQuality`** — specified in `WAVE-PLANNER.md` §6 and never
  added. The wave metrics route computes it; the score ignores it.
- **A written method.** No document says how a dimension is computed. A public
  score needs a public method or it is astrology.
- **Provenance.** Scores mutate in place (`+10 for dispatching`, `+15 for
  completion`). Nothing records which run produced which delta, so no standing
  can be audited or recomputed.

---

## 3. The decision

**Pick one weighting.** This is a product decision, not a bug fix — the spec's
version encodes a claim, and the flat version encodes the absence of one.

### Option A — the spec's weighting (250/250/200/200/100)

Fleet Utilization and Runway Health together are **half the score**. That is a
deliberate assertion: conducting well means *keeping the fleet fed*, and it
matches the core product claim that the conductor must be faster than the fleet.
Cost efficiency matters less than throughput. Velocity trend is a tiebreak.

Cost: update DB clamps, `/api/score`, the pill, and the seed. Small.

### Option B — the implemented flat weighting (5 × 200)

Every dimension equally important. Nothing to change. But it says nothing about
what good conducting is, and an arena scored on an opinion-free metric teaches
nobody anything.

### Recommendation — **Option A**

The score is about to become the public face of a discipline we are claiming
exists. It should encode a point of view, and the spec's already does. "Keeping
your fleet fed is half of conducting well" is a defensible, arguable, teachable
claim. "All five things matter equally" is what you write when you have not
decided.

### 3.1 The objection to answer first

**Fleet Utilization rewards having a bigger fleet.** A conductor with sixteen
agents can score higher than one with two, and that is capacity, not skill. For
a leaderboard this is fatal — it ranks compute budget.

Two mitigations, both needed:

1. **Utilization is a ratio, not a count** — capacity *in use* over capacity
   *available*. Already how `fleetUtilization` is computed
   (`activeSessions / maxSessions`), so this is preserved rather than built.
2. **Arena scores come from the benchmark substrate** (`VISION.md` §2.2), where
   fleet size is fixed by the harness. Local scores stay personal-best; ranked
   scores are earned on identical tasks.

Without (2), the leaderboard measures budget. This is the strongest argument
that the arena must be benchmark-backed rather than telemetry-backed, and it is
worth restating in TRD 17.

---

## 4. Design

### 4.1 One definition, one place

A single exported `SCORE_MODEL` in `packages/core` — dimension keys, maxes, and
the human description of each — consumed by the API, the pill, the seed, and the
clamps. Today those four each hard-code their own maxes, which is exactly how
they drifted.

```ts
export interface ScoreDimension {
  key: 'fleetUtilization' | 'runwayHealth' | 'planAccuracy'
     | 'costEfficiency' | 'velocityTrend' | 'parallelizationQuality';
  max: number;
  label: string;
  /** What it measures, in one line. Rendered in the UI and the docs. */
  meaning: string;
  /** How it is computed. Rendered in the public method doc. */
  method: string;
}
export const SCORE_MODEL: readonly ScoreDimension[];
export const SCORE_TOTAL = 1000;
```

**Invariant, enforced by test:** `sum(max) === SCORE_TOTAL`. The divergence this
TRD exists to fix would have been caught on the day it was introduced.

### 4.2 Adding `parallelizationQuality`

Six dimensions summing to 1000 under Option A:

| Dimension | Max | Rationale |
|---|---|---|
| Fleet Utilization | 200 | Was 250; yields 50 to parallelization |
| Runway Health | 250 | Unchanged — the product's core signal |
| Plan Accuracy | 200 | Unchanged |
| Cost Efficiency | 150 | Was 200; cheapest thing to be wrong about |
| Velocity Trend | 100 | Unchanged |
| **Parallelization Quality** | **100** | New — how well the DAG exploited real independence |

Parallelization is the thing this product is *for*, and it was the one dimension
of conducting the score could not see.

### 4.3 Provenance

New `score_events` table: one append-only row per delta — dimension, before,
after, cause, `wavePlanId`/`sessionId`, timestamp.

Two reasons, and the second is the important one:

1. A standing nobody can audit is worth nothing in a competitive context.
2. **Rescoring.** The weighting will change again. Without an event log, a model
   change orphans every historical score; with one, totals are recomputed from
   events. The current design mutates in place and cannot be replayed.

### 4.4 Migration

Existing scores were produced under the flat model. **Do not silently reinterpret
them** — a 742 under 5×200 is not a 742 under the new model.

Recompute where events exist; where they do not, mark the score
`model_version: 0` and exclude it from any ranking. One-time honesty cost, in
exchange for never explaining why everyone's score moved overnight.

---

## 5. Acceptance criteria

- **T16-AC-01** — Exactly one weighting exists in the codebase; `SCORE_MODEL` is
  the only place maxes are declared. Guard test greps for hard-coded `200`/`250`
  in the score paths.
- **T16-AC-02** — `sum(max) === 1000`, asserted.
- **T16-AC-03** — `parallelizationQuality` is populated from wave metrics on
  completion.
- **T16-AC-04** — Every mutation writes a `score_events` row; total is
  reproducible by replaying events.
- **T16-AC-05** — Pre-migration scores are `model_version: 0` and excluded from
  ranking.
- **T16-AC-06** — The method is documented publicly, per dimension, generated
  from `SCORE_MODEL` so it cannot drift from the code.
- **T16-AC-07** — The breakdown UI renders six dimensions with no value
  exceeding its max.

## 6. Waves

| Wave | Work | Depends on |
|---|---|---|
| 1 | `SCORE_MODEL` + invariant test; consume it in API, pill, seed, clamps | §3 decision |
| 2 | `score_events` + replay | 1 |
| 3 | `parallelizationQuality` from wave metrics | 1 |
| 4 | Migration + `model_version` | 2 |
| 5 | Public method doc generated from `SCORE_MODEL` | 1 |

Wave 1 is mechanical once §3 is answered, and is the whole blocker for V2.

---

## 7. Explicitly out of scope

- **The leaderboard itself** — TRD 17, and it needs the benchmark substrate.
- **Cross-org comparison** — needs the consent model (TRD 15 §4.3).
- **Anti-gaming beyond §3.1** — real once scores are public, not before.
