# TRD 15 — Linked Agent Sessions & Hosted Fleet Memory
## Capture in the open core · recall from the hosted stack
### v0.2 · August 2026 · Status: DESIGN — REVISED against prior art

> **v0.2 revision.** v0.1 was written without reference to OpenConjecture's
> existing graph-memory work (Synaptic Wiki) or the marketing-os hosted-adapter
> pattern. Both change the design materially. §8 records what was wrong and what
> replaces it; the sections above it have NOT been rewritten, so read §8 first.

---

## 0. The two halves, and why they are one document

**Half A — the conductor runs *linked* Claude Code sessions.** Today the session
runner spawns anonymous `claude -p` processes. Their reasoning is discarded the
moment the process exits: the runner keeps the result envelope (cost, tokens,
files) and throws the rest away. Nobody can watch a dispatched agent work, join
it to help, or read back what it tried.

**Half B — a hosted memory the planner calls.** Plans get better when the
planner knows what happened last time: which decompositions actually
parallelised, which tasks blow their estimates, which files are contention
hotspots, which approaches were tried and abandoned.

These are one document because **A is what produces the material B consumes.**
Building B without A means a memory of nothing. Building A without B means
capturing transcripts nobody reads.

---

## 1. The constraint that shapes everything

> **TRD 06 §3.2: the server cannot read session content.** Transcripts are
> end-to-end encrypted; the key lives only in a URL fragment and never reaches
> devpilot.sh.

So **"a hosted memory built from all captured agent logs" cannot mean what it
sounds like.** The hosted stack is structurally incapable of reading the
transcripts. Any design that requires it either breaks the E2EE promise — which
is a headline claim of TRD 06 and the marketing site — or quietly weakens it,
which is worse because the wording would stay up while the guarantee left.

There are exactly three honest ways to get memory out of encrypted material:

| Option | Verdict |
|---|---|
| Upload plaintext transcripts to the hosted stack | ❌ Breaks §3.2. Non-starter |
| Server-side decryption with an escrowed key | ❌ Same thing wearing a hat |
| **Derive structure locally, upload only the derivation** | ✅ This design |

**The third is already how the codebase works.** `DualFeedSessionHook` states it
outright: *"MemPalace never sees the raw session log directly — it only gets the
structured, backlinked articles the Wiki compiler already produced."* The privacy
boundary this TRD needs was drawn a release ago; it just was not connected to
anything hosted.

### 1.1 What the hosted memory therefore holds

Two categories, both legitimately visible to the hosted stack:

**Tier 1 — execution metadata it already receives.** Plans, DAG shapes, wave
outcomes, completion reports, durations, costs, token counts, file paths,
failure reasons. This already crosses the bridge in plaintext (TRD 05) and no new
consent question arises. It is also, on its own, most of the value: parallelism
that worked, estimates that were wrong, files that collide.

**Tier 2 — locally-derived lessons, opt-in.** Wiki articles and MemPalace drawers
compiled *on the user's machine* from the session log, then pushed. Prose the
compiler wrote about what happened — never raw transcript, never diffs.

Tier 2 is **off by default and per-repo.** A user who never enables it still gets
a useful memory from Tier 1.

### 1.2 What must never be uploaded

Raw transcript text, file contents, diffs, secrets, and the session key. The
uploader is an allowlist over derived artifacts, not a denylist over transcripts
— a denylist gets this wrong the first time someone adds a field.

---

## 2. Architecture

```
  ┌─ OPEN CORE (MIT, runs on the user's machine) ──────────────────────────┐
  │                                                                        │
  │  conductor-agent ──dispatch──▶ session-runner ──▶ claude -p            │
  │        ▲                            │              │                   │
  │        │                            │              └─ MCP: mcp-session │
  │        │                            │                 joins the LINKED │
  │        │                            │                 shared session   │
  │        │                            ▼                                  │
  │        │                     session log (local)                       │
  │        │                            │                                  │
  │        │                    DualFeedSessionHook                        │
  │        │                     ├─▶ Wiki (human-readable)                 │
  │        │                     └─▶ MemPalace drawers (structured)        │
  │        │                            │                                  │
  │  PromptConstructor ◀── MemPalaceService ──┐                            │
  │   (planning recall)      mode: local | mcp | disabled                  │
  └────────────────────────────────────────────┼───────────────────────────┘
                                               │  mode=mcp
                                               ▼
  ┌─ HOSTED (devpilot.sh, paid) ──────────────────────────────────────────┐
  │   /api/memory/mcp    fleet memory across every repo, machine, run      │
  │   ingest: Tier 1 always · Tier 2 opt-in                                │
  │   NEVER holds: transcripts, diffs, session keys                        │
  └───────────────────────────────────────────────────────────────────────┘
```

**The open-core seam already exists.** `MemPalaceConfig.mode` is
`'local' | 'mcp' | 'disabled'` and `createMemPalaceClient` returns
`McpAdapterClient` for `mcp`. Self-hosters get `local` — a real, working memory
scoped to one machine. Paying users point `mcp` at the hosted endpoint and get
memory across their whole fleet.

That is the value prop stated precisely: **the open core remembers your machine;
the hosted product remembers your fleet.** No feature is removed from the OSS
build to create the upsell, which is the failure mode that makes open-core feel
like a bait and switch.

---

## 3. Half A — linked sessions

### 3.1 Contract change

`CreateSessionRequest` (TRD-01 §7.1) gains one optional field:

```ts
/** Join link for the shared session this dispatch belongs to, including #k=. */
sessionLink?: string;
```

The runner, when it is present:

1. Writes an ephemeral MCP config naming `@devpilot.sh/mcp-session`.
2. Spawns `claude --mcp-config <file> --strict-mcp-config`.
3. Prepends a directive to the prompt: join the session, post a plan before
   acting and a summary after.

### 3.2 The link is a secret

It carries the session key in its fragment. Therefore:

- **Never** as an argv element — `ps` on a shared box would show it.
- Written to a `0600` file passed by path, deleted when the session exits.
- Never logged. The runner logs the session id, never the link.
- Never echoed into a tool result: `mcp-session`'s join tool already refuses to,
  *"it contains the key, and a tool result is transcript the model may later
  repeat."* The same reasoning applies to the runner.

### 3.3 Why this is worth doing on its own

Independent of memory: a conductor can watch a dispatched agent work, join it
mid-flight to redirect it, and read back what it tried after it fails. Today a
failed dispatch yields an exit code and a summary sentence.

---

## 4. Half B — hosted memory

### 4.1 Endpoint

`POST /api/memory/mcp` on devpilot.sh, speaking MCP over HTTP, authenticated
with the existing bridge machine token (TRD 04). Tools mirror
`MemPalaceClient`'s surface so `McpAdapterClient` needs no changes:

| Tool | Purpose |
|---|---|
| `memory_search` | L2 recall by topic hints, org-scoped |
| `memory_context` | Assemble a `PalaceContextBlock` under a token budget |
| `memory_add_drawer` | Ingest one derived artifact |
| `memory_stats` | Coverage, for the value story |

### 4.2 Ingest

- **Tier 1** rides the existing bridge report path — no new client work beyond a
  server-side projection into drawers.
- **Tier 2** posts from `DualFeedSessionHook` when
  `DEVPILOT_MEMORY_UPLOAD=true`, per repo.

### 4.3 Scoping and isolation

Every drawer is org-scoped; recall never crosses an org boundary. This is RLS at
the database, not a `WHERE` clause in application code — same posture as TRD 06
§4.2. **Cross-org learning is out of scope and stays that way** until there is an
explicit, separately-consented product decision. "We train on your code to help
other customers" is not a thing to arrive at by accident.

### 4.4 Degradation

If the hosted endpoint is unreachable, `MemPalaceService` falls back to `local`
and planning proceeds. A memory outage must never block a dispatch — memory
improves plans, it does not gate them.

---

## 5. Why this validates the paid path

The moat is not the code — it is MIT. The moat is **the corpus**, and it compounds
per-org:

1. Fleet-wide recall a single machine cannot reconstruct.
2. Cross-repo pattern recognition — "this decomposition failed in two other
   repos."
3. Calibration: real durations and costs make estimates converge on truth.
4. Continuity across machines and rebuilds.

And it is measurable, which matters more than the narrative: the Conductor Score
already tracks `planAccuracy` and `parallelizationQuality`. **The claim to
validate is that both rise for memory-enabled orgs relative to their own
baseline.** If they do not, the paid tier is not earning its price and we should
know that from our own telemetry rather than from churn.

---

## 6. Acceptance criteria

- **T15-AC-01** — `sessionLink` in a dispatch causes the spawned agent to join
  the shared session; its turns appear in the transcript.
- **T15-AC-02** — The link never appears in argv, logs, or a tool result. Test
  asserts the config file is `0600` and removed on exit.
- **T15-AC-03** — A completed run produces MemPalace drawers locally.
- **T15-AC-04** — `PromptConstructor` injects a `PalaceContextBlock` into
  conductor planning, under the token budget.
- **T15-AC-05** — `mode=mcp` against the hosted endpoint returns org-scoped
  results; a second org sees none of them.
- **T15-AC-06** — With the endpoint unreachable, planning still completes.
- **T15-AC-07** — No raw transcript, diff, or key reaches the hosted stack.
  Enforced by an allowlist and a guard test.
- **T15-AC-08** — Tier 2 upload is off unless explicitly enabled.

---

## 7. Implementation plan

| Wave | Where | Work |
|---|---|---|
| 1 | public | `sessionLink` in the runner; MCP config; secret handling (AC-01, 02) |
| 2 | public | Wire `DualFeedSessionHook` to runner completion (AC-03) |
| 3 | public | `MemPalaceService` into the conductor's `PromptConstructor` (AC-04) |
| 4 | website | `/api/memory/mcp`, schema, RLS, Tier 1 projection (AC-05, 07) |
| 5 | public | `HttpMcpTransport`, fallback, config (AC-06) |
| 6 | website | Tier 2 ingest, consent surface (AC-08) |

Waves 1–3 are useful on their own and ship first: they make dispatched agents
observable and give self-hosters a real local memory. Nothing in them depends on
the hosted stack existing.

> **Note on sequencing.** `devpilot-website` currently carries another session's
> `content-engine` branch. Waves 4 and 6 land there and must not begin until that
> work is rebased onto the new main.


---

## 8. Revision against existing OpenConjecture prior art

v0.1 designed a hosted memory as if from scratch. Two bodies of existing work
make most of it wrong.

### 8.1 Synaptic Wiki already is this system

`OpenConjecture/synaptic-wiki`, vendored and live in `arthaus/portfolios`, is a
graph memory with extraction, evolution and distribution already solved:

- **embedded `falkordblite`** — in-process, RDB-file-backed, **no standing
  server**
- **Gemini for compose/extract**, with a deterministic no-key mode that *never
  fails*
- **distribution as a versioned asset**: `latest.tar.gz` + `latest.json`
  manifest + `history/<version>-<ts>.tar.gz` in object storage, pushed under
  `if-generation-match` optimistic locking so a concurrent learner loses cleanly
  with a 412
- **`synw asset learn`** = pull → ingest → **evolve** → site → push, run on a
  daily CI schedule, never in the request path
- a browsable Living Wiki site published alongside

**Implication: the hosted MCP query endpoint in §4 is probably the wrong
primitive.** Synaptic Wiki's proven distribution is *pull a versioned asset and
query it in-process*. That is faster (no per-query network hop), works offline,
and has no availability coupling — §4.4's fallback exists only because §4 chose a
network dependency it did not need.

It also relocates the paid boundary somewhere better: **the hosted tier runs the
learner and serves the asset.** The open core queries whatever asset it has. No
feature is withheld; what you buy is a corpus and the compute that distils it.

### 8.2 The record is the spec, not a distillation

The creative-session harness concluded: *"the spec IS a first-class Wiki
DesignRunRecord (better than the after-the-fact Gemini distill)."*

§1.1's Tier 1 / Tier 2 split was over-thought. **Tier 2 — locally-derived
lessons compiled from transcripts — should be dropped.** The wave plan is the
decomposition decision and the execution results are the verdict on it; that
record is exact, free, and needs no model call. `src/lib/conductor-memory.ts`
implements this and never reads a transcript.

This also disposes of the E2EE tension in §1 outright rather than negotiating
with it: a record built from plan structure and execution metadata never wanted
the transcript.

### 8.3 The known failure mode — and DevPilot already has it

That work names its own failure: *"Synaptic Wiki is learned but never applied
back into the brief."*

**DevPilot has the identical bug, and worse — it has it twice:**

1. `PromptConstructor` has accepted a `MemPalaceService` for releases and nothing
   ever passed one. Fixed in Wave 3 (`src/lib/conductor.ts`).
2. **`addDrawer` writes DRAWERS; `assemblePromptContext` L2 reads CLOSETS.**
   Nothing converts one into the other. Verified live: writing a run record then
   recalling it returns `closets: 0`. The write path and the read path do not
   meet.

(2) is exactly Synaptic Wiki's **`evolve`** step — the consolidation pass between
ingest and publish. MemPalace has ingest and has recall; it has no evolve. **Until
that exists, memory is write-only no matter how much is captured.**

### 8.4 Patterns worth taking from marketing-os

From Spec 12/18, all built and in production:

| Pattern | Why it applies |
|---|---|
| Attach a read-only graph MCP per tenant (Picasso/FalkorDB, keyed on a join point) | Exactly this shape; join point is repo + file path |
| Per-connection TTL cache (~5 min) and `listToolsWithErrors` isolation | One broken memory adapter must degrade, not kill planning |
| Deployment keys ≠ connector tokens, independently revocable | §4.1 conflated them onto one bridge token |
| Secrets in Vault only, never on tenant infra | Applies to whatever key pulls the asset |
| RLS + safe views, with a **negative test required** | Stronger than §4.3's assertion |
| Result envelope: coverage, freshness, caveats | A planner should know memory is thin, not silently trust it |

### 8.5 Revised plan

Supersedes §7:

| Wave | Status |
|---|---|
| 1 — linked sessions | ✅ built |
| 2 — run record from plan + outcomes | ✅ built (no transcripts) |
| 3 — recall wired into the planner | ✅ built, but blocked by 3a |
| **3a — `evolve`: drawers → closets** | ❌ **NEW, BLOCKING.** Nothing else matters until recall can see what capture wrote |
| 4 — evaluate synaptic-wiki vs MemPalace | ❌ NEW. Two graph memories in one org is one too many |
| 5 — asset distribution (pull versioned asset) | ❌ replaces the hosted MCP endpoint as the default |
| 6 — hosted learner + asset serving | ❌ the actual paid boundary |

**Wave 4 deserves an explicit decision.** MemPalace and Synaptic Wiki are two
independent graph-memory implementations inside one organisation. Consolidating
on Synaptic Wiki would inherit a working evolve step, a proven distribution
model, and a deterministic no-key path — and would delete Wave 3a rather than
build it.
