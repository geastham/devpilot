# Research brief — memory & code-graph substrates for an agent conductor

**For:** an independent research agent.
**Deliverable:** a comparison table plus a written recommendation, in the format
of §7. We will synthesise from your output — do not implement anything.

**Bias to state up front:** we have already picked two things (§3). Your job is
**not** to confirm them. A brief that comes back agreeing with everything we
already believe has failed. We specifically want the projects we missed and the
evidence that would reverse a decision (§8).

---

## 1. What the product is

DevPilot is an **agent conductor platform**. One technical lead ("the conductor")
runs a fleet of coding agents — currently Claude Code sessions — across multiple
repositories. The product's claim is that the bottleneck is *planning throughput*,
not agent capacity: agents consume specs faster than a human writes them.

Concretely, it:

1. Takes an intent and produces a **wave plan** — a dependency DAG where
   independent tasks are grouped into waves that dispatch in parallel.
2. Dispatches each wave to real Claude Code sessions on the user's machine.
3. Ingests completion callbacks, advances to the next wave, scores the run.

**Distribution shape, which constrains everything:** an MIT-licensed **npm-installed
CLI** (`npm i -g @devpilot.sh/cli`) that runs a local Next.js cockpit and a local
session runner. Plus a hosted tier (Supabase/Vercel) for the paid features.
TypeScript monorepo, pnpm, Node 18+.

## 2. The two problems we are buying for

These are different problems and we expect different tools. **Keep them separate
in your analysis.**

### Problem A — token reduction (near-term, measurable)

Our dispatched agents burn enormous context re-discovering the repository. Real
telemetry from our own verified runs:

| Task | Tokens |
|---|---|
| Add a `CONTRIBUTING.md` | 603,676 |
| Add a `LICENSE` file | 318,834 |
| Add a sync module | 2,112,126 |

These are trivial tasks. The tokens went on the agent working out what the repo
contains. A sibling project of ours independently found the same: *"cost is
INPUT-context-dominated (~1.9M cached read tokens), not output."*

**We want:** a code-structure graph (entities, imports, call graph, schemas,
configs) that an agent queries instead of grepping — and that our *planner* can
read so decompositions reflect real dependencies rather than inferred ones.

### Problem B — experience memory (durable, compounding)

We generate structured **run records**: wave shape, achieved parallelism, cost,
duration, which files two tasks both touched, what failed. We want to recall
"which decompositions actually worked in this repo" when planning the next one.

**We want:** a graph/memory substrate with **temporal validity** — a fact that
was true before a refactor and is now superseded must be expressible, not just
deleted.

## 3. What we have already evaluated — do not re-litigate, do challenge

| Project | Our read | Verdict |
|---|---|---|
| **Graphiti** (getzep) | Apache 2.0, ~20k stars, MCP server 1.0, temporal facts, embedded FalkorDB Lite. Zep discontinued their Community Edition to focus on it *because it powers their commercial product* | **Adopted** for Problem B |
| **Graphify** (Graphify-Labs) | Apache 2.0, 105k stars in 4 months, deterministic AST, no vector store, a Claude Code skill. But **still v0.9.x**, daily releases, **970 of ~1,050 commits from one person**, 911 open issues | Candidate for A, pinned, nothing load-bearing |
| **codebase-memory-mcp** | Native binary, **no language runtime**, 158 languages, published numbers (83% vs 92% answer quality, ~10× fewer tokens, 2.1× fewer tool calls, 31 repos) | Leading candidate for A |
| **Cognee** | Hybrid graph+vector, 14 retrieval modes | Considered; no central temporal model |
| **mem0** | Three-tier scope, TS SDK — but **graph features behind Pro** | **Rejected.** Disqualifying for an open-core product whose own boundary must not look like feature-withholding |
| **Letta** | Agent-managed memory tiers | Considered; needs a new agent architecture |
| **Basic Memory / OpenMemory** | Local-first, markdown on disk | Noted for the local-first pattern |

**Challenge these if the evidence warrants.** Especially: is there a project that
does A *and* B credibly, making one dependency instead of two?

## 4. What we need you to find

Prioritised. Depth beats breadth.

1. **Emerging code-graph / code-memory projects** we have not seen — especially
   anything **shipping a native binary or a pure-Node/TypeScript implementation**,
   because a Python runtime is a real install burden for an npm CLI and is
   currently an unresolved blocker for us.
2. **TypeScript-native graph memory** of any maturity. We found only an
   unmaintained-looking port of Graphiti's paper. If a credible TS option exists,
   it changes our architecture.
3. **Temporal / bi-temporal knowledge graph libraries** beyond Graphiti —
   including general-purpose ones not marketed at agents.
4. **Embedded graph stores** usable in-process with no server: FalkorDB Lite,
   Kuzu (we believe upstream is unmaintained — verify), DuckDB-based graph
   layers, SQLite graph extensions, oxigraph, CozoDB, anything similar.
5. **MCP servers for code intelligence** generally — the registries move fast and
   the good ones are not always the popular ones.
6. **Benchmarks and evaluations** measuring token reduction or answer quality for
   codebase-graph-augmented agents. We care much more about a reproducible
   benchmark than a landing page claim.
7. **Anything that makes run-outcome mining a solved problem** — retrieval over
   structured records with outcome weighting, diversity-aware retrieval (we
   expect "every plan converges on one shape" as a failure mode).

## 5. How to search — go long-tail

Do not stop at the first page of obvious queries. Specific angles:

- **GitHub search directly**, sorted by recently-updated as well as by stars:
  topics `knowledge-graph`, `code-graph`, `agent-memory`, `mcp-server`,
  `temporal-graph`, `ast-parser`, `code-intelligence`. Filter to repos created or
  substantially active in the last 6–9 months.
- **Awesome lists and surveys** — `DEEP-PolyU/Awesome-GraphMemory` is one we know;
  find the others, and mine their *link lists* rather than their prose.
- **MCP registries**: glama.ai, mcpservers.org, mcp.directory, the official
  registry. Look at what is newly listed, not just what is top-ranked.
- **arXiv** (cs.SE, cs.AI) for 2026 papers on code knowledge graphs, agent memory
  benchmarks, context compression for coding agents — then check whether the
  authors shipped code.
- **Release notes and changelogs** of the incumbents, to catch capabilities that
  landed after the blog posts we read.
- **Issue trackers of the projects in §3** — the honest limitations surface there.
  Graphify's own tracker had an issue proposing exactly the A+B split.
- **Adjacent ecosystems**: Sourcegraph/SCIP, tree-sitter tooling, LSP-based
  indexers, Glean, Stack Graphs. Not agent-marketed, possibly better engineered.

## 6. How to evaluate — hard signals only

**We have been burned by star counts.** Graphify has 105k stars and one
maintainer. Weight accordingly.

For every serious candidate, report:

| Signal | Why we care |
|---|---|
| **Licence** (SPDX) | Must permit hosted redistribution. Note trademark constraints |
| **Commercial incentive alignment** | Is it a lead magnet with features withheld, or does the vendor *depend* on it? Note anything gated behind a paid tier |
| **Version** | Has it shipped 1.0? Pre-1.0 with daily releases means pinning and churn |
| **Bus factor** | Commits by top contributor vs total. One-person projects are a risk we may still accept, but not unknowingly |
| **Release cadence + trend** | Weekly commit counts over the last 8 weeks. Accelerating or decaying? |
| **Issue health** | Open vs closed, and whether maintainers respond |
| **Runtime + distribution** | Native binary / Node / Python / JVM / Docker-only. **This is close to decisive for us** |
| **Determinism** | Does ingestion require an LLM call and an API key? We strongly prefer deterministic — memory must not fail closed when no key is set |
| **Storage** | Embedded/in-process, or does it require a standing server? |
| **Temporal model** | Can it express "this stopped being true"? |
| **Interface** | MCP? Library? Both? |
| **Evidence** | Reproducible benchmark, or marketing claim? Say which |

## 7. Output format

A single markdown document:

1. **Executive summary** — max 10 lines. What we should standardise on and why.
2. **The comparison table** — every serious candidate, columns from §6.
3. **Deep dives** — 1–2 paragraphs each on the top 5, including *what is wrong
   with them*. A candidate with no stated weakness reads as unresearched.
4. **Projects we should watch but not adopt yet**, with the trigger that would
   change that ("adopt when it ships 1.0", "when a second maintainer appears").
5. **Disconfirming evidence** — see §8.
6. **Open questions you could not resolve**, and what would resolve them.
7. **Sources** — every claim linked. Distinguish *documentation*, *independent
   benchmark*, and *vendor marketing*. We will discount the third.

Flag anything you could not verify. **An honest "could not determine" is worth
more to us than a confident guess** — we have been bitten repeatedly this month by
claims that were true once and were never rechecked.

## 8. Disconfirming evidence — answer these explicitly

1. **What would make Graphiti the wrong choice?** Known scaling limits, ingestion
   cost, operational complexity, dissatisfied production users, a Python
   dependency we cannot live with.
2. **Is there a credible single tool covering both A and B?** One dependency
   beats two if it does not compromise either.
3. **Is the "buy structure, build experience" split wrong?** Is anyone shipping
   run-outcome memory for coding agents such that our moat is thinner than we
   think?
4. **Does anything solve token reduction better than a code graph?** Context
   compression, semantic caching, retrieval reranking, smaller context-efficient
   models — we assumed a graph is the answer and would like that challenged.

## 9. Constraints that are not negotiable

- **Open source, OSI licence.** The core product is MIT and self-hostable.
- **Must not require a paid tier for core function.** See mem0.
- **Must degrade gracefully.** Memory improves a plan; it must never gate one. A
  substrate that throws when unavailable is unusable to us.
- **Must not require sending source code to a third-party service** for the
  local/OSS path. Hosted is a separate conversation.
