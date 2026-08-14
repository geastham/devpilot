# TRD 20 — How the two memories compose
### v0.1 · August 2026 · Status: DESIGN

Answers a question the previous four TRDs left implicit: we are adopting two
memory systems, so **where do they meet, and what does joining them buy that
neither has alone?**

---

## 1. First, the narrow claim about binaries

"The native binary sidesteps this class of problem" was imprecise. What it
sidesteps is **the dependency chain**, not platform-specific builds.

| | `falkordblite` | `codebase-memory-mcp` |
|---|---|---|
| Ships the engine | Module `.so`, downloaded | Whole thing, static |
| **Needs a separate runtime already installed** | **Yes — `redis-server`, arch-matched** | No |
| Failure mode when it is missing | `dlopen` "incompatible architecture" inside a redis log | n/a |
| Still per-OS/arch builds | Yes | Yes |

Both need the right build for the machine. Only one needs *a second program the
user installed themselves, at a matching architecture, that we do not control*.
That is the class avoided — and it is the exact thing that stopped V1.6
validating.

## 2. What each memory actually knows

They are not two flavours of the same thing. They answer different questions and
have different lifecycles.

| | **Code graph** | **Experience memory** |
|---|---|---|
| Question | What the code **is** | What happened when we **tried** |
| Entities | Files, symbols, imports, call edges | Runs, waves, tasks, outcomes |
| Truth | Current HEAD only | Historical, with validity intervals |
| Update | Per commit, deterministic, rebuildable | Per run, append-only |
| Size | Large, regenerable, disposable | Small, irreplaceable |
| If lost | Re-index in minutes | **Gone forever** |

That last row is the one that decides the architecture. The code graph is a
**cache**. Experience memory is a **record**. Never conflate a cache with a
record — you will eventually treat the record as regenerable, and it is not.

## 3. The join key is a file path

Both systems already speak paths, and neither had to be changed to make it so:

- Code graph: `src/graph.js` → imported by 14 modules, exports 3 symbols
- Run record: *"CONTENTION: `src/graph.js` appeared in more than one task"*

Symbols are the finer join where a code graph exposes them; path is the floor and
is always available.

## 4. What the join buys

Each of these is impossible with one store alone. That is the test of whether
composing them is worth the cost.

| Capability | Needs from structure | Needs from experience |
|---|---|---|
| **Contention prediction** | `src/graph.js` has 14 inbound edges — a hub | It contended in a past run |
| **Seam-aware decomposition** | Where the real module boundaries are | Which seams produced clean runs before |
| **Estimate calibration** | Fan-in / size of the files in scope | How long comparable tasks actually took |
| **Blast-radius scoping** | What else calls this | What broke last time we touched it |

The first is the sharpest illustration: structure alone says a file is a hub but
not that hubs are dangerous; experience alone says a file contended once but not
whether that generalises. **Together they support "do not split tasks across a
hub file", which is an actionable planning rule and neither store can state it.**

Stated as a hypothesis rather than a claim, because it is: *files with high
fan-in predict wave contention.* The joined data is what would test it — and if
it is false, we will find out cheaply.

## 5. How they come together — two mechanisms, in order

### 5.1 Plan-time join (build this first)

`PromptConstructor` already assembles planning context. It gains a second source:

```
plan request
   ├── code graph (MCP)          → real dependency structure of the target area
   ├── experience memory (port)  → outcomes of comparable past plans
   └── join on file path         → composed planning context
```

No new storage, no duplication, each store keeps its own lifecycle. The planner
is the only consumer, so the join belongs there.

### 5.2 Write-time enrichment (build this second — and it is the subtle one)

When a run record is written, **snapshot the structural attributes of the files
it touched into the record itself.**

Not a reference — a copy. Because:

> **Code changes. A structural fact looked up later is a fact about a different
> codebase.** "`src/graph.js` had 14 inbound edges *when this contention
> happened*" is durable and learnable. "`src/graph.js` has 14 inbound edges" is
> true until the next commit and teaches nothing about the past.

This is precisely what a temporal store is for, and it is the reason experience
memory needs bi-temporality while the code graph does not. The code graph can be
current-only because it is a cache of HEAD; the record must carry its own
history because nothing else will.

Concretely, a run record grows a `structure` block:

```
files: [{ path, inboundEdges, module, sizeLines }]   ← as of the run, not now
```

That block is what makes cross-run pattern mining possible later (V3), because
it lets a query ask "across every run, did high fan-in correlate with
contention?" without needing to reconstruct historical code state.

## 6. Where each lives

```
 ┌ LOCAL ────────────────────────────────────────────────────────────┐
 │  codebase-memory-mcp ──┐                                          │
 │   (cache of HEAD)      ├──▶ PromptConstructor ──▶ wave plan       │
 │  experience memory ────┘         │                                │
 │   (the record)                   └── dispatched agents also query │
 │                                      the code graph directly      │
 └───────────────────────────────────────────────────────────────────┘
                    │ run records only — never the code graph
                    ▼
 ┌ HOSTED ───────────────────────────────────────────────────────────┐
 │  fleet memory: run records across orgs → mined patterns → asset    │
 └───────────────────────────────────────────────────────────────────┘
```

**The code graph never leaves the machine.** It is derived from source, so
uploading it is uploading the source in another shape — which TRD 15 §1.2
forbids. Only run records travel, and they carry *structural attributes*
(fan-in, module name, line counts) rather than code.

That distinction is what makes the hosted tier defensible: "files with high
fan-in contend" is a portable, non-identifying lesson. The graph it was derived
from is not portable at all.

## 7. Order of work

| Step | Why here |
|---|---|
| **V1.4** — adopt the code graph, feed the dispatched agent | Standalone token win; needs no join |
| **V1.4b** — feed the planner too | The plan-time join (§5.1) |
| **V1.6** — experience store validated | Prerequisite for anything durable |
| **V2** — write-time enrichment (§5.2) | Needs both live; cheap once they are |
| **V3** — cross-run mining | Needs enriched records to exist first |

§5.2 is cheap to build and expensive to retrofit — records written without the
structural snapshot can never be enriched retroactively, because the code they
described is gone. **Do it before we accumulate records worth mining.**

## 8. Open

- **Does the code graph expose fan-in cheaply?** The join in §4 assumes an
  inbound-edge count is a query away. Verify against `codebase-memory-mcp`'s tool
  surface before designing around it.
- **Symbol-level join, or path-level only?** Path is the floor. Symbol is better
  and depends on what the code graph exposes stably.
- **What structural attributes are worth snapshotting?** Start with fan-in,
  module, size. Adding later is easy; the ones we omit are lost forever.
