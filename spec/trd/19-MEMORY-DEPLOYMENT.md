# TRD 19 — Memory deployment: embedded everywhere, versioned blob for hosted
### v0.1 · August 2026 · Status: DESIGN — one decision recorded, one deferred

---

## 1. The separation that makes this tractable

The **store** and the **framework** are separate decisions, and conflating them
is what made this look hard.

| Layer | Decision |
|---|---|
| **Store** | **FalkorDB Lite, embedded.** Everywhere — OSS local, hosted build, and the pulled hosted asset |
| **Framework** | **Graphiti — optional, on top.** Not required for the store to work |

FalkorDB Lite ships **both** a Python binding (what Graphiti uses) and a
**TypeScript/Node binding** (`falkordblite`, npm) that launches the embedded
engine in-process with no separate server install. Node 20+, persists via
periodic snapshots to a data directory.

That means an embedded store does **not** oblige us to a Python runtime. Graphiti
does. Those are now independent choices.

## 2. OSS: embedded, and Python-free by default

```
devpilot CLI (Node)
  └── falkordblite (TS binding, in-process)        ← default, zero extra install
        └── .devpilot/memory/            snapshots

  optional: Graphiti MCP server (Python) ──▶ the SAME FalkorDB Lite store
```

**Default path needs no Python and no server.** We already decided writes are
deterministic triplets rather than LLM extraction (TRD 18 §4) — our run records
are structured, the plan *is* the record. A subject/predicate/object fact with
`valid_at` / `invalid_at` is a data-model choice, not something only Graphiti can
express.

**Graphiti stays as the opt-in tier**, over the same store, for what it genuinely
adds: entity resolution and dedup, LLM extraction from prose, hybrid search. A
conductor who wants those installs it; nobody is blocked without it.

> **This is a change of emphasis, not a reversal.** TRD 18 stands: the adapter,
> its tests and the port are unchanged, and Graphiti remains the framework we
> recommend. What changes is that it is no longer the *floor* — because a Python
> install as the price of any memory at all is too high for an npm CLI.

### 2.1 Platform reality — name it

`falkordblite` supports **Linux x64 and macOS arm64**. Windows requires WSL2;
Intel Macs and Linux arm64 are unconfirmed.

That is a real gap for an npm-distributed CLI. **Memory must degrade to
`disabled` on unsupported platforms with a clear message, never a crash on
install.** The existing "memory never gates a dispatch" rule already covers the
runtime behaviour; this extends it to installation.

## 3. Hosted: **no customer-facing FalkorDB server**

**Decision: distribute a versioned asset, not a query service.**

```
many orgs' run records ──▶ [ learner job ]  ← hosted FalkorDB lives HERE, internally
                                  │
                                  ▼
                    gs://…/<org>/latest.tar.gz + latest.json
                                  │        history/<version>-<ts>.tar.gz
                                  ▼
              conductor pulls ──▶ queries in-process (embedded)
```

This is the Synaptic Wiki pattern, which is already proven in-house:
`if-generation-match` optimistic locking so a concurrent learner loses cleanly
with a 412, history tarballs, rollback by copying a history blob over latest.

### 3.1 Why a query service is the wrong default

1. **One code path.** The local and hosted paths query the *same engine* over the
   same data format. A hosted server forks them, and the fork is where drift
   lives.
2. **Physical isolation beats logical.** One asset per org means a whole class of
   multi-tenant query-isolation bugs *cannot occur*. Against a shared graph, org
   scoping is a `WHERE` clause someone eventually forgets. For a product whose
   headline claim is that we cannot read your transcripts, that difference is
   worth more than convenience.
3. **Latency improves.** In-process beats a network round trip, per query, on the
   planner's critical path.
4. **Economics.** No standing stateful database, no per-query egress, no scaling
   a graph engine per tenant.
5. **Offline works**, which matters for a local-first product.
6. **Freshness is not the requirement.** The value is *fleet* memory — which
   decompositions worked across many runs. Those patterns move slowly. Daily is
   fine; seconds is not a requirement anyone has.

### 3.2 Hosted FalkorDB still exists — as build infrastructure

Building the graph from many orgs' records is a write-heavy batch job and wants a
real database. Run one **for the learner**, internally. It is never a customer
query surface, so it needs no per-tenant isolation, no public endpoint, and no
availability guarantee beyond the learn cadence.

### 3.3 Triggers to revisit

Adopt a customer-facing hosted graph when **any** of these becomes true:

- The asset exceeds a reasonable pull budget (**set it: 100 MB**) and compaction
  cannot hold it.
- A real-time cross-org signal becomes a product requirement — someone else's run
  minutes ago must change my plan.
- The cockpit wants interactive server-side graph exploration.

None are true today.

## 4. What this obliges us to build

1. **`falkordblite` TS store adapter** behind `MemPalaceClient` — the Python-free
   default. Deterministic triplets, `valid_at` / `invalid_at`.
2. **Asset manifest** — `latest.json` carrying `builtAt`, run count, schema
   version, org. The planner must be able to say *"memory as of 3 days ago,
   1,240 runs"*, because unlabelled recall is untrustworthy recall.
3. **Retention/compaction policy.** Blobs grow. Decide what ages out and when —
   Synaptic Wiki keeps history tarballs, and we should say how many.
4. **Platform gate** — detect unsupported platforms at install and degrade to
   `disabled` with a message.

## 5. Deferred, deliberately

**Whether Graphiti runs locally at all**, or is hosted-learner-only. §2 makes it
optional, which defuses the question — but if the TS store adapter covers our
real recall needs, the honest follow-up is whether Graphiti earns its place on
the local path or belongs solely in the learner. Answer it with the V1.4/V1.5
data, not now.
