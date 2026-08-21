# DevPilot — Product Vision

**v1.0 · August 2026**

> Supersedes the positioning in `docs/COCKPIT.md` and the marketing site, which
> describe the cockpit as the product. The cockpit is the surface. This document
> is what it is a surface *for*.

---

## 1. The thesis

**The role of programming has moved from building to conducting.**

Not "AI helps you code faster." The unit of work changed. A technical lead in
2026 spends their day deciding what should be built, in what order, by whom, and
in parallel with what else — then judging what comes back. The typing is
delegated. The judgment is not.

`spec/DESIGN.md` §1 got half of this: *"the bottleneck is planning throughput,
not agent capacity."* That is a statement about a constraint. The stronger claim
is about a **skill**:

> Conducting is a distinct competence. It is now the highest-leverage skill in
> software, and it is the only one with no training, no measurement, and no
> visible standard of excellence.

Every previous shift in this industry produced its own literacy — version
control, code review, TDD, SRE. Each arrived with practices, a vocabulary, and a
way to tell good from bad. Conducting has none of that yet. Its practitioners
cannot tell whether they are good at it, cannot see how anyone else does it, and
have nothing to improve against.

**That absence is the opportunity, and it is larger than the tool.**

---

## 2. Three things that only work together

DevPilot has three assets. Individually each is a feature. Composed, they are a
flywheel.

| Asset | Alone | Composed |
|---|---|---|
| **Conductor Score** | Vanity metric | The scoreboard of a new discipline |
| **Benchmark suite** | Internal QA | The neutral arena where scores are earned |
| **Content engine** | SEO programme | The distribution arm of the discipline |

```
        conduct  ──▶  score  ──▶  rank
                                    │
         ┌──────────────────────────┤
         ▼                          ▼
   winning patterns           published as
   into the graph             content / standards
         │                          │
         ▼                          ▼
   everyone's planner         attracts conductors
   gets better                        │
         └────────────◀───────────────┘
                  more data
```

Each arrow already half-exists. None of them connect yet.

### 2.1 The cockpit is retention. The arena is adoption.

A better cockpit is a reason to keep using DevPilot. It is a weak reason to
*start* — the incumbent is a terminal and a to-do list, and it is free.

A ranked, public standard of conducting skill is a reason to start. Developers
adopt tools that make them legibly good at something. That is what GitHub's
contribution graph, Advent of Code, and every benchmark leaderboard have in
common: the tool is the entry fee, the standing is the draw.

### 2.2 The arena needs a neutral field, and we already built one

**This is the connection nobody had made.** `packages/benchmarks` is essentially
complete — three PRDs, a reproducible subprocess harness, baseline and DevPilot
executors, scoring, history and comparison. It sits unused and out of CI.

It is the arena's playing field, and it solves the two problems a leaderboard
otherwise dies of:

- **Gaming.** A score computed from a conductor's own local activity is trivially
  inflated — dispatch noise, pad the queue, farm the metric. A score earned on
  identical tasks with a common harness is not.
- **Cold start.** Fleet telemetry needs users. `docs/CONTENT-ENGINE.md` §2 says
  so outright about its own strongest asset: *"worthless until there are
  users."* **Benchmarks need no users.** The arena can open with zero customers,
  which is the only reason it can be the adoption mechanism rather than a
  consequence of adoption.

### 2.3 Patterns are the product; content is the distribution

Once conductors are ranked on a common field, the interesting question is not
who won. It is **what the winners did differently** — how they decompose a
migration, when they widen a wave, which dependencies they refuse to parallelise.

That extraction has two outputs from one pipeline:

- **Into the memory graph** — every user's planner inherits what the best
  conductors know. This is the paid tier's actual value (TRD 15 §8.1), and it is
  far more defensible than "we store your history."
- **Into content** — *"how the top decile decomposes a database migration"* is
  the post nobody else can write, because nobody else has the data. The content
  engine already identified anonymised fleet telemetry as its strongest moat and
  correctly refused to plan content against it before the data existed. This is
  where that data comes from.

### 2.4 The rankable unit is a config, not a person

§2.3 assumes patterns are *extracted* — mined out of run records by us, on
everyone's behalf. There is a better version where conductors publish them
deliberately, and it resolves three problems at once.

**A config is the artifact.** Skills, system prompts, and topology: the thing a
conductor actually builds and tunes. It is versioned, forkable, and attributed
to whoever wrote it. Winning configs earn standing on the arena board; other
people fork them, adapt them, and their forks earn standing too.

Three things this fixes that §2.1–2.3 leave open.

**It makes the arena honest about what it measures.** §2.2 proposes earning a
score on identical benchmark tasks. But `fleetUtilization`, `runwayHealth` and
`velocityTrend` are properties of a live ongoing workload — a one-shot benchmark
run has no runway to be healthy and no fleet to utilise. What a benchmark run
*can* measure is planner + model + config. That is the config. Ranking configs is
not a compromise; it is the only thing the arena was ever able to rank.

**It removes the case for ranking people.** A public score of an individual's
conducting skill is one screenshot away from being a manager's performance
metric, and developer-productivity measurement has a long history of going that
way. Nobody objects to a leaderboard of builds.

**It largely dissolves §4.3.** Cross-org learning is fraught because mined
patterns carry structure — file paths, module names, repo shapes — that can
identify a customer even in aggregate. A *published config* is something a
conductor chose to publish. No mining, no anonymisation threshold, no "we
learned from your code" conversation to have.

#### Forks and attribution, not a marketplace

The open planning agent lives in this repository and is meant to be iterated on
in the open. So the sharing mechanism should be the one already under it:
**a config is a file, a fork is a fork, and attribution is git history.**

Resist building an economy. Trading implies scarcity, and scarcity in a system
whose supply is text invites config farming, sockpuppet accounts, and arguments
about ownership. Fork-plus-attribution captures nearly all of the value — credit
accrues to authors, lineage is visible, good configs spread — at a fraction of
the cost, and it can grow into an economy later if anyone asks. Nobody has asked
yet.

#### Four things to get right before this ships

1. **Configs are not portable, and standings will imply they are.** A config
   tuned on Forgepress wins at Forgepress. Board headings must name the task
   family, or the first person who adopts the top-ranked config for a real
   migration and gets a bad result writes the post that defines this feature.

2. **Overfitting stops being a risk and becomes the objective.** Today
   contamination of a public benchmark is accidental. Under a config board it is
   the explicit goal of every entrant, which moves held-out and rotating tasks
   from prudent to load-bearing.

3. **A shared system prompt is executable code.** This is the one most likely to
   be underweighted, because "gear" and "trading card" are cosmetic framings for
   something that is not cosmetic: adopting a config means running someone
   else's instructions against your codebase with your credentials. That is a
   supply-chain and prompt-injection surface. Provenance, review, and a
   constrained first run belong in v1, not after the first incident.

4. **Entry must not cost the entrant.** If being ranked means burning your own
   tokens on benchmark runs, the board measures willingness to spend. Entrants
   submit a config; we execute it. That also makes results comparable, because
   the executor is identical — which is the same argument §2.2 makes for a
   common harness, applied one level up.

---

## 3. What this makes DevPilot

**Positioning:** the cockpit *and the standard* for conducting a fleet of coding
agents.

**One sentence:** DevPilot makes you measurably better at the skill that replaced
programming.

The business follows the same three layers:

| Layer | Open / Hosted | Why anyone pays |
|---|---|---|
| Cockpit | MIT, local | — |
| Arena | Hosted, free | Standing is public; participation is the funnel |
| Memory + patterns | Hosted, paid | Your planner gets what the best conductors know |

Nothing is withheld from the open core to manufacture the upsell. What you buy is
a corpus and the compute that distils it.

---

## 4. What has to be true, and is not yet

Four honest blockers. The first is fatal to the whole thesis if unaddressed.

### 4.1 The score is not currently a definable number

The implementation caps all five dimensions at 200 (5 × 200 = 1000).
`spec/DESIGN.md` §8.1 specifies 250 / 250 / 200 / 200 / 100. Both are live in the
codebase; the seed data produces a `velocityTrend` of 138, which is impossible
under the spec.

**You cannot rank people on a number whose definition is ambiguous.** Everything
in §2 depends on resolving this first, and it is a product decision — the spec's
weighting deliberately values runway and utilisation above cost — not a bug fix.

### 4.2 The memory loop is write-only

`addDrawer` writes drawers; `assemblePromptContext` reads closets; nothing
converts one to the other. Verified live: write a run record, recall it, get zero
results. This is Synaptic Wiki's **`evolve`** step, and DevPilot has no
equivalent. Pattern extraction cannot ship over a memory nothing can read.

### 4.3 Cross-org learning is currently forbidden — deliberately

TRD 15 §4.3 rules it out of scope: *"'We train on your code to help other
customers' is not a thing to arrive at by accident."*

§2.3 requires exactly that boundary to be crossed. It must be crossed
**explicitly**: separate consent, aggregate patterns rather than plans, and a
clear statement of what leaves an org. Get this wrong once and the trust cost
exceeds anything the feature earns.

Note what makes this tractable: run records are built from plan structure and
outcomes, never transcripts (TRD 15 §8.2), and shared-session transcripts are
E2E encrypted and unreadable by the server. The material is already the
least-sensitive form of itself.

### 4.4 A leaderboard nobody is on is worse than none

An empty arena reads as a dead product. The benchmark substrate lets us seed it
with *our own* runs across models and configurations before a single customer
arrives — a comparison table that is useful on its own and becomes a leaderboard
when others join.

---

## 5. First roadmap

Ordered by dependency, not by appeal. Items 1–3 are prerequisites; nothing in
§2 works until they land.

### V1 — Make the score real *(blocks everything)*

1. **Resolve the score weighting.** Pick the spec's 250/250/200/200/100 or the
   implemented flat 5×200, update the loser, and add `parallelizationQuality`
   from wave metrics (ROADMAP Tier 2 item 8). Ship a written definition of each
   dimension — a public score needs a public method.
2. **Close the memory loop** — implement `evolve` (drawers → closets), or adopt
   Synaptic Wiki and inherit its. Decide which; two graph memories in one
   organisation is one too many.
3. **Benchmarks into CI**, publishing results per model and configuration. This
   is the arena substrate and the seed data for §4.4.

### V2 — Open the arena

4. **Benchmark leaderboard v1** — public, opt-in, scored on identical tasks.
   Our own runs seed it. Explicitly *not* backed by self-reported local metrics.
   Ranks **configs**, not people (§2.4), and headings name the task family so a
   standing cannot be read as a general claim.
5. **Score provenance** — every score traceable to the run that produced it.
   Unverifiable standings are worth less than none.
6. **Consent model for fleet telemetry** — opt-in, per-org, aggregate-only, with
   a plain statement of what leaves. §4.3's prerequisite.

### V3 — Extract and distribute

7. **Config publishing** — a config is a file in this repository, forkable,
   attributed by git history. No marketplace, no scarcity (§2.4). Needs
   provenance and a constrained first run before anyone adopts a config they
   did not write.
8. **Pattern extraction** over run records: which decomposition shapes correlate
   with high scores, which file-contention signatures predict failure. Note that
   published configs may make much of this unnecessary — extraction is the
   fallback for what conductors do not publish deliberately.
9. **Patterns into the planner** — the paid tier's real payload.
10. **Patterns into content** — the posts only we can write, feeding the engine
   that is already built and waiting for exactly this.

### Deliberately later

- Anything requiring large-scale fleet telemetry, until there are fleets.
- Cross-org pattern sharing, until item 6 exists.
- Arena mechanics beyond a leaderboard — seasons, teams, challenges. Rich, and
  worthless before anyone is on the board.

---

## 6. How to know if this is working

State the falsifiers now, while it is still cheap to be wrong.

| Claim | Falsified if |
|---|---|
| Conducting is a distinct skill | Scores cluster tightly — everyone is equally good, so there is nothing to teach |
| The arena drives adoption | Leaderboard traffic does not convert to installs |
| Patterns transfer | Memory-enabled orgs show no `planAccuracy` / `parallelizationQuality` lift over their own baseline |
| Content compounds | Pattern posts do not outperform hand-written ones |

The third is the one to instrument first. It is measurable with the score
dimensions we already have, against each org's own history rather than against
other orgs — which sidesteps §4.3 entirely for the first read.
