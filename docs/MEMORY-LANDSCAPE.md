# Memory: our constructs, and the 2026 landscape

**Evaluation · August 2026.** Written to answer three questions: is the Template
Knowledge Engine still relevant, how does it differ from Synaptic Wiki, and
should we buy rather than build.

Supersedes the build assumption in TRD 15 §8.5 Wave 4.

---

## 0. The plan, in one table

Two different problems, two different tools, and they are not interchangeable.

| Layer | Problem it solves | Tool | Verdict |
|---|---|---|---|
| **Code structure** — what the code *is* | **Token reduction.** Agents burn context re-discovering the repo | Graphify **or** `codebase-memory-mcp` | **BUY** — commodity, measurable, not our moat |
| **Experience + temporal** — what happened when we *tried* | **Core agent quality.** The planner recalls which decompositions actually worked | **Graphiti** (adopted, TRD 18) | **BUY the substrate** |
| **Run records** — the corpus itself | The moat. Nobody else has dispatch outcomes | Ours (`conductor-memory.ts`) | **BUILD** — the only part we should |
| `MemPalaceClient` — the port | Keeps substrates swappable | Ours | **KEEP** — it is why any of this is cheap |
| MemPalace **local shim** | — | — | **REPLACE.** It is the broken one (drawers vs closets) |
| DevPilot **Wiki** | Human-readable docs | Ours | **KEEP**, untouched — different job |
| Synaptic Wiki | Versioned-asset distribution | Org | **BORROW the pattern**, do not import |
| Template Knowledge Engine | Mine-don't-extract; retrieval diversity | Org | **BORROW the pattern**, do not import |

### 0.1 Why token reduction is the near-term win

It is not theoretical for us — it is in our own telemetry. The two verified
conductor runs cost **603,676 and 318,834 tokens** to add a `CONTRIBUTING.md` and
a `LICENSE`. An earlier session spent **2,112,126**. Those tasks are trivial; the
tokens went on the agent working out what the repo contains.

The creative-session harness reached the same conclusion independently: *"render
cost is INPUT-context-dominated (~1.9M cached read tokens) not output."*

A code-structure graph attacks that directly — `codebase-memory-mcp` reports ~10×
fewer tokens and 2.1× fewer tool calls at 83% answer quality against 92% for
file exploration. **It is the only item here with a measurable cost effect on day
one**, and it pays in two places:

1. **Dispatched agents** stop grepping the repo → fewer input tokens per session.
2. **The planner** gets real dependency structure instead of inferring it from a
   spec → better waves, less file contention, fewer wasted sessions.

### 0.2 Why experience memory is the durable win

It changes plan *quality*, not cost, and it compounds — every run makes the next
plan better. It is also the part no vendor sells, because no vendor has dispatch
outcomes. Slower to show value, and the reason anyone pays later.

### 0.3 What we are explicitly NOT doing

- **Not building a graph engine.** Graphiti is Apache 2.0 and maintained by a
  company that runs its product on it.
- **Not building code parsing.** 158 languages is somebody else's problem.
- **Not importing Synaptic Wiki or the Template KE.** Take the patterns —
  versioned-asset distribution, deterministic mining, retrieval diversity — not
  the code. They are tuned to other domains.
- **Not replacing the Wiki.** It writes documentation for humans; the graph
  answers questions for agents. Different jobs, no overlap.

### 0.4 The one decision that gates V1.4

Both code-structure candidates carry a runtime cost we have not accepted yet:
Graphify is Python, Graphiti is Python, `codebase-memory-mcp` ships a **native
binary with no language runtime**. For an npm-distributed CLI that difference
matters more than any capability gap.

**Either** the OSS cockpit tolerates a Python dependency (docker compose is the
documented path), **or** local stays on a lighter substrate and Python-backed
graphs are hosted-tier only. Until that is answered, V1.4 should trial
`codebase-memory-mcp` first — it is the one that costs the user nothing to
install.

---

## 1. We have four memory constructs, not two

This is the finding that reframes the question.

| # | Construct | Where | Shape |
|---|---|---|---|
| 1 | **Wiki** | `devpilot/packages/core/src/wiki` | LLM-compiled articles, backlinked, human-readable |
| 2 | **MemPalace** | `devpilot/packages/core/src/mempalace` | Wings → rooms → drawers → closets, tiered L0–L3 recall |
| 3 | **Synaptic Wiki** | `OpenConjecture/synaptic-wiki`, vendored in `arthaus/portfolios` | Graph (falkordblite), LLM extract + **evolve**, versioned-asset distribution |
| 4 | **Template Knowledge Engine** | `avant-garde/creative-agent` | Corpus **mined** into a typed graph, JSON-dump retrieval, critic-scored |

**DevPilot alone carries two** (1 and 2), and 2 is the one that does not work —
drawers are written, closets are read, nothing evolves between them.

Before adopting anything new, that is the number to reduce.

---

## 2. Is the Template Knowledge Engine still relevant?

**Yes — and it is the better precedent for DevPilot than Synaptic Wiki is.**

That is the opposite of what TRD 15 §8 assumed.

### 2.1 How they actually differ

| | Synaptic Wiki | Template Knowledge Engine |
|---|---|---|
| Where knowledge comes from | LLM **extracts** it from prose/sessions | A pipeline **mines** it from a corpus of artifacts |
| Determinism | LLM-mediated; deterministic mode is a fallback | `build_graph` is deterministic and rebuildable from local artifacts |
| Consolidation | An explicit `evolve` stage | Falls out of mining — there is no separate stage to run |
| Outcome signal | None intrinsic | **`days_active` longevity** — the corpus records what survived |
| Retrieval | `recall` by topic, tiered | Pluggable retriever, promo-aware, round-robin for **diversity** |
| Feedback | None closed | **VLM critic scores adherence** per candidate |
| Distribution | Versioned tarball + manifest, optimistic locking | JSON dump read in-process, `falkordb_lite`, **no hosted graph** |

Both landed on the same distribution instinct — **an artifact you pull, not a
service you call.** That is a house pattern arrived at twice independently, and
§4 shows the rest of the industry moved the same way.

### 2.2 Why the Template KE fits DevPilot better

DevPilot's memory is **not prose about what happened**. It is structured records
carrying outcomes: wave shape, achieved parallelism, cost, duration, file
contention, what failed. That is a corpus of artifacts with outcome signals —
structurally identical to 148 templates carrying `days_active`.

The loop maps one-to-one:

```
Template KE:  mine corpus → typed graph → retrieve k → generate candidates → critic scores adherence
DevPilot:     run records → typed graph → retrieve k → generate plan       → plan scorer scores it
```

**DevPilot already has the critic.** `PlanScorer` and the Conductor Score are the
adherence scorer, already deterministic, already in the loop.

Three things this changes:

1. **The `evolve` gap (TRD 15 §8.3) may be the wrong thing to build.** Template
   KE has no evolve stage because mining is deterministic and rebuildable. If
   run records are mined into the graph rather than accreted as drawers, there
   is nothing to consolidate after the fact.
2. **Outcome weighting is the point, not a feature.** `days_active` separates
   templates that survived from ones that died. DevPilot's equivalent —
   plans that completed clean vs plans that contended and failed — is exactly
   the signal §5 of the vision wants to extract from top conductors.
3. **Retrieval diversity is a solved problem there.** Round-robin across layout
   patterns fixed "all ads look the same." DevPilot will hit the identical
   failure: recall the three highest-scoring past plans and every future plan
   converges on one decomposition shape.

### 2.3 What Synaptic Wiki still wins on

Distribution. The versioned asset with `if-generation-match` locking, history
tarballs and clean 412 on concurrent writers is more mature than a JSON dump in
a bucket, and it is what a hosted tier would serve.

**They are complementary: mine like the Template KE, distribute like Synaptic
Wiki.**

---

## 3. The landscape has moved, and it splits in two

The important thing about the 2026 market is that it is **two markets**, and
DevPilot needs them differently.

### 3.1 Code-structure memory — commoditised, buy it

*What the code **is**.* Entities, call graphs, dependencies, parsed from the repo.

`codebase-memory-mcp` indexes a codebase into a persistent knowledge graph, parses
158 languages, and ships as a native executable with no language runtime. Across
31 real-world repositories it reaches **83% answer quality against 92% for a
file-exploration agent, at ~10× fewer tokens and 2.1× fewer tool calls**.

Cognee covers similar ground with a hybrid graph-vector architecture and a
self-improving pipeline.

**DevPilot has none of this and should not build it.** It is a commodity with an
MCP interface, it is measurably good, and the planner would benefit immediately —
a wave planner that knows the real dependency structure of the code makes better
decompositions than one inferring it from a spec.

### 3.2 Experience memory — nobody sells it, own it

*What happened when we **tried**.* Which decomposition parallelised, which
estimates were wrong, which files collided.

**No vendor has this, because no vendor has dispatch outcomes.** Mem0, Zep,
Cognee and Letta all store what you *tell* them. DevPilot's run records are
generated by execution — a different substrate entirely.

This is the moat named in the vision. It should be built, and it is the only part
that should be.

### 3.3 What the frameworks are worth taking

| Framework | The idea worth stealing |
|---|---|
| **Zep / Graphiti** | Temporal facts — records *when* something became valid and when it was superseded. A decomposition that worked before a refactor is now wrong, and nothing in our constructs can express that |
| **Cognee** | Hybrid graph + vector, multiple retrieval modes |
| **Letta** | Agent-managed tiers — the agent decides what stays in context. Close to MemPalace's L0–L3 |
| **Mem0** | Three-tier scope: user / session / agent. **Graph features are behind Pro** — relevant precedent for our own paid boundary |
| **Basic Memory / OpenMemory** | Local-first, human-readable on disk. Memory as a folder you can open, not a black box |

**Temporal invalidation is the biggest gap in all four of our constructs.** None
of them can say "this stopped being true." For code memory that is not a nicety —
it is the difference between recall that helps and recall that misleads.

---

## 3.4 Graphify — the structural half, evaluated Aug 2026

**Graphify is not a competitor to Graphiti. It is the other half of §3.1**, and an
issue on its own tracker proposes exactly the split this document argues for:
*"graphify's structural knowledge (`auth.ts` imports `jwt.ts`) with agent memory's
temporal knowledge (you refactored `auth.ts` 3 days ago)."*

What it is: turns a codebase — plus docs, SQL schemas, configs, PDFs — into a
queryable graph via **local deterministic AST parsing, no vector store**, shipped
as a `/graphify` skill for Claude Code, Cursor, Codex and Gemini CLI.

Three properties match our principles better than anything else surveyed:
deterministic rather than LLM-extracted, no vector store, no API key. It is the
"mine, don't extract" conclusion applied to code.

**The maturity picture is genuinely mixed, and stars are the least of it.**

| Signal | Reading |
|---|---|
| 105,638 stars in ~4 months (created 2026-04-03) | Explosive. Also the noisiest signal here |
| Apache 2.0 | Clean |
| **Still `v0.9.41` — never shipped 1.0** | Pre-stable, by its own versioning |
| Releases **daily** (v0.9.37 → v0.9.41 in five days) | Very high churn; pinning is mandatory |
| **970 of ~1,050 commits from one person** | Bus factor of one |
| 911 open / 874 closed issues | Triaging hard, backlog still growing |
| Weekly commits 101 → 83 → 35 → 34 | Decelerating |

Compare `codebase-memory-mcp`, which ships as a **native executable needing no
language runtime** — a real advantage for an npm-distributed CLI, where Graphify
and Graphiti both drag in Python — and carries published numbers (83% vs 92%
answer quality, ~10× fewer tokens, 31 repos).

**Verdict: adopt Graphify for V1.4 behind the port, pinned, and do not build
anything load-bearing on it until it reaches 1.0 with a second maintainer.** Its
being a Claude Code *skill* is a bonus we are unusually placed to use — dispatched
sessions are already Claude Code.

## 3.5 Are we missing anything else?

[Awesome-GraphMemory](https://github.com/DEEP-PolyU/Awesome-GraphMemory) (DEEP-PolyU)
is a maintained survey of graph-based agent memory — papers, benchmarks and
open-source projects. **Use it as the watchlist instead of ad-hoc searching**, and
re-read it when V3 starts.

The honest position on further evaluation: **the architecture is what makes this
question cheap.** Every substrate sits behind `MemPalaceClient`. The Graphiti
adapter is ~350 lines and its tests run against a stub. Swapping or adding a
backend is a day's work, not a migration — so the cost of being wrong is low and
the cost of continued evaluation is not obviously repaid.

## 4. Recommendation

**Stop building memory infrastructure. Build the corpus and the mining.**

1. **Adopt an off-the-shelf code-structure graph** and feed it to the planner as
   context. Two candidates, and the choice turns on distribution rather than
   capability: `codebase-memory-mcp` (native binary, **no language runtime**,
   published benchmarks) versus **Graphify** (deterministic AST, no vector store,
   multi-modal, a Claude Code skill — but `0.9.x`, daily releases, one
   maintainer; see §3.4). Trial Graphify, ship whichever survives a week.
2. **Mine run records rather than accreting drawers**, following the Template KE
   — deterministic build, rebuildable from local artifacts, outcome-weighted.
   This likely **deletes V1.2's `evolve` work** instead of implementing it.
3. **Keep Synaptic Wiki's distribution** — versioned asset, optimistic locking,
   pulled and queried in-process. It matches where the local-first market went
   and it is the hosted tier's delivery mechanism.
4. **Add temporal validity to run records now**, while the schema is young.
   Cheap today, a migration later.
5. **Consolidate to one construct in DevPilot.** Two in `packages/core`, one of
   which does not work, is the actual problem. Retire or merge before adopting
   anything new.

### What this does to the roadmap

| Item | Change |
|---|---|
| **V1.2** (close the memory loop) | **Re-scope.** Evaluate mining-instead-of-evolve first; the fix may be to delete the stage, not build it |
| **New V1.4** | Adopt a code-structure MCP for planner context. Small, independent, immediately measurable |
| **V3** (pattern extraction) | Unchanged in intent, cheaper — mining *is* extraction |

### Open questions

- Does `codebase-memory-mcp`'s licence permit hosted redistribution, or only
  local use? Decides whether it can back the paid tier or only the OSS cockpit.
- Is `falkordb_lite` still the right embedded store, or does Graphiti's temporal
  model justify the dependency?
- Mem0 gates graph behind Pro. Ours is memory-behind-hosted. Same shape — worth
  checking how that lands with an open-source audience before committing.

---

## Sources

- [Persistent Codebase Memory for Coding Agents 2026 — Cognee](https://www.cognee.ai/blog/guides/ai-coding-agent-persistent-codebase-memory)
- [codebase-memory-mcp](https://deusdata.github.io/codebase-memory-mcp/)
- [Codebase-Memory: Tree-Sitter-Based Knowledge Graphs for LLM Code Exploration via MCP (arXiv)](https://arxiv.org/html/2603.27277v1)
- [Best AI Agent Memory Systems in 2026: 8 Frameworks Compared](https://vectorize.io/articles/best-ai-agent-memory-systems)
- [Best AI Agent Memory Frameworks in 2026 — Atlan](https://atlan.com/know/best-ai-agent-memory-frameworks-2026/)
- [Survey of AI Agent Memory Frameworks — Graphlit](https://www.graphlit.com/blog/survey-of-ai-agent-memory-frameworks)
- [Introducing OpenMemory MCP — mem0](https://mem0.ai/blog/introducing-openmemory-mcp)
- [Best Memory & Knowledge MCP Servers in 2026 — ChatForest](https://chatforest.com/guides/best-memory-mcp-servers/)
