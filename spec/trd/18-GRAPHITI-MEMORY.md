# TRD 18 — Graphiti as the memory substrate
### v0.1 · August 2026 · Status: BUILT (unverified against a live server)

---

## 1. The pick

**[Graphiti](https://github.com/getzep/graphiti)** (`getzep/graphiti`), Apache 2.0.

| Criterion | |
|---|---|
| Maturity | ~20k stars; MCP server at **1.0** with hundreds of thousands of weekly users |
| Licence | **Apache 2.0**, unchanged in the Aug 2026 strategy announcement |
| Incentives | Zep discontinued its Community Edition to focus on Graphiti, which **powers their commercial service** — maintained because they depend on it, not as a lead magnet. They explicitly reject "intentionally limiting features to drive users toward paid products" |
| Temporal | Facts carry validity intervals and are **superseded rather than deleted** |
| Embedded | **FalkorDB Lite** — no standing server. The same store Synaptic Wiki already uses |
| Interface | MCP, which we already speak on both sides |

The last two are why it wins over Cognee (also Python, no temporal model as
central) and mem0 (**graph features behind Pro** — disqualifying for an
open-core product whose own boundary must not look like feature-withholding).
A TypeScript port exists (`graphzep`) and is nowhere near "mature and standard".

## 2. What adopting it deletes

**The `evolve` step (TRD 15 §8.3 / V1.2).** MemPalace's local shim wrote
*drawers* and read *closets*, with nothing converting between them — recall
returned nothing for everything ever written. Graphiti has one store: `search`
reads what `add` wrote. There is no split to reconcile, so there is no
consolidation stage to build.

**`kgInvalidate`.** The port declared temporal invalidation and no backend
implemented it. Graphiti expires an edge natively.

## 3. Shape of the integration

Graphiti speaks its own vocabulary, so it implements `MemPalaceClient`
**directly** rather than sitting behind `McpAdapterClient` — which expects a
MemPalace-shaped MCP server (`ensure_wing`, `add_drawer`, `traverse`) that does
not exist and would have to be written and maintained by us.

| MemPalace | Graphiti |
|---|---|
| wing | `group_id` (implicit namespace — nothing to provision) |
| `addDrawer` | `add_triplet` (default) or `add_memory` |
| `search` | `search_memory_facts` |
| `wakeUp` (L0/L1) | `search_nodes` |
| `recall` (L2) | `search_memory_facts` → one synthesised closet |
| `kgAdd` | `add_triplet` |
| `kgInvalidate` | `delete_entity_edge` |
| `listWings` / `listRooms` | unsupported → `[]`, honestly |

## 4. Two decisions worth defending

**Deterministic writes by default.** `add_memory` runs LLM extraction and needs
an API key on the server; `add_triplet` does not. DevPilot's run records are
already structured — the plan *is* the record — so the default path uses
triplets. Memory that fails closed without a key would fail exactly when someone
is evaluating the product. `DEVPILOT_MEMORY_EXTRACTION=llm` opts in.

**Every failure degrades to empty, never throws.** Memory improves a plan; it
must never gate one. A server that is down, slow, or on a version we do not
understand costs the conductor nothing but the absence of recall.

## 5. Configuration

```bash
DEVPILOT_MEMORY_ENDPOINT=http://127.0.0.1:8000/mcp/   # presence selects graphiti
DEVPILOT_MEMORY_API_KEY=…                             # hosted tier only
DEVPILOT_MEMORY_EXTRACTION=deterministic|llm          # default deterministic
DEVPILOT_MEMORY_MODE=local|graphiti|disabled          # explicit override
```

With no endpoint the mode stays `local`, so nothing changes for anyone who has
not started a server.

## 6. Verified / not verified

**Verified.** 10 contract tests against a stub speaking the same JSON-RPC
envelope, plus an end-to-end check that writing a run record and then calling
`assemblePromptContext` — the exact call the planner makes — returns it. That
round trip is the bug this adoption exists to delete, and it now passes.

**NOT verified.** Nothing has run against a real Graphiti server. Tool names and
argument spelling come from its published docs, not from observation, and a
mismatch would surface as recall silently returning empty — which the
degradation design makes quiet by construction. **First live run must assert a
non-empty round trip, not merely the absence of errors.**

Also unverified: FalkorDB Lite needs Python 3.12+, and its wheel requires
glibc 2.39 (CI must be ubuntu-24.04). Synaptic Wiki hit both; we have not.

## 7. Open

- Does Graphiti's licence permit hosted redistribution for the paid tier? Apache
  2.0 says yes; confirm no trademark constraint on the name.
- The Python runtime is a real install burden for an npm-distributed CLI. MCP
  keeps the boundary clean, but a conductor still has to start a server. Docker
  compose is the documented path.
