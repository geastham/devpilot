# Synthesis — external substrate research, verified

**August 2026.** An independent agent answered
`docs/research/MEMORY-SUBSTRATE-BRIEF.md`. This records what survived checking.

**Headline: the report is right about Problem A and wrong about Problem B.** Its
Problem B recommendation rests on a project that does not exist in the state
described.

---

## 1. Claim-by-claim verification

Every claim below was checked against the GitHub API, not against the report.

| Claim | Verdict | Evidence |
|---|---|---|
| `codebase-memory-mcp` is the pick for Problem A | ✅ **Confirmed** | 38,705 stars, MIT, C, **pushed today**, 158 grammars, arXiv 2603.27277 |
| **Kuzu is archived / unmaintained** | ✅ **Confirmed** | `archived: true`, last push 2025-10-10. Independently corroborated by Graphiti's own README ("Kuzu 0.11.2, upstream unmaintained") |
| `GrafeoDB` is a real embedded graph option | ✅ **Confirmed** | `GrafeoDB/grafeo` — 743 stars, Rust, pushed 2 days ago, embeddable, LPG + RDF |
| **`graphzep` is a viable TypeScript alternative to Graphiti** | ❌ **FALSE** | **22 stars. Created 2025-08-22, last pushed 2025-08-24 — two days of commits, then abandoned twelve months ago.** Contributors API returns empty |
| Track the `codebase-memory-mcp-pro` fork | ⚠️ **Misleading** | Real (216 stars) but **stale**: last push 2026-07-05 while upstream pushed today. It is behind, not ahead |
| Graphiti is a "vendor lead magnet for Zep's commercial Context Lake" | ❌ **Contradicts primary source** | Zep's own announcement says they *discontinued* their Community Edition to focus on Graphiti *because it powers their commercial service*, and explicitly reject "intentionally limiting features to drive users toward paid products" |
| Graphiti causes fatal asyncio event-loop collisions | ⚠️ **Plausible, and irrelevant to us** | Sourced to one practitioner blog. The stated fix — "isolate it inside a dedicated HTTP sidecar or subprocess" — **is the architecture we already built** |
| `headroom` stream compressor | ❓ **Could not verify** | Not located under that name. Do not propagate until found |

## 2. Why Problem B does not change

The report recommends replacing Graphiti with `graphzep`. Two independent
reasons that fails:

1. **`graphzep` is abandoned.** Twenty-two stars and two days of commits a year
   ago. Standardising on it while rejecting a 20k-star, corporate-backed project
   at MCP 1.0 inverts the maturity rubric the brief asked for.
2. **The asyncio objection does not apply to our topology.** We never embed
   Graphiti. `GraphitiClient` is ~350 lines of TypeScript speaking JSON-RPC to an
   out-of-process MCP server. The report's own prescribed mitigation is what we
   shipped, so its central objection reads as *validation* of the design rather
   than an argument against the dependency.

**Graphiti stands.** Its adapter sits behind `MemPalaceClient`; if a credible
TypeScript-native temporal graph appears, swapping it is a day.

## 3. What we take from the report

Four things it got genuinely right, two of which we did not have:

1. **Adopt `codebase-memory-mcp` for V1.4** — confirmed. Ignore the fork advice;
   track upstream, which is the one actually shipping.
2. **Kuzu is dead.** Any design touching it is non-viable. Worth knowing before
   we reached for an embedded store.
3. **`GrafeoDB` is the embedded-graph candidate we asked for and did not find** —
   pure Rust with Node bindings, embeddable, no daemon. Not a Graphiti
   replacement (no temporal model), but the strongest answer yet to *"can the
   local path avoid Python entirely?"* → **watchlist**.
4. **Token reduction is a stack, not one tool.** The report's best insight, and
   the answer to disconfirming question #4: a code graph compresses *search*, but
   tool-output compression and PreToolUse hooks that stop redundant grepping
   attack a different layer. Our own telemetry supports it — those 603k/318k
   token runs were not all repo discovery.

## 4. Decisions

| Decision | Outcome |
|---|---|
| Problem A substrate | **`codebase-memory-mcp`**, upstream, pinned. V1.4 |
| Problem B substrate | **Graphiti, unchanged.** TRD 18 stands |
| Kuzu | **Excluded permanently** |
| `graphzep` | **Rejected** — abandoned |
| `GrafeoDB` | **Watchlist.** Adopt-trigger: we decide the local path must be Python-free *and* it ships a stable Node binding |
| Token-reduction stack | **New line of work** — investigate output compression + anti-grep hooks alongside the graph |

## 5. On the report itself

Useful, and it found two things we had missed. It also asserted a maturity
profile for `graphzep` — "comprehensive test suite", "moderate commit cadence",
"1–2 main authors" — for a repository with 22 stars that has not been touched in
a year. The brief asked for bus factor and release trend precisely to prevent
this, and asked that an honest "could not determine" beat a confident guess.

**Operating rule going forward: no external recommendation is adopted before its
maturity claims are checked against the API.** Two commands would have caught it.

The delivered report was also **truncated** — §"Emerging Projects and Strategic
Watchlist", the four disconfirming answers, and "Unresolved Engineering
Questions" all have headings with no content. Those were the sections most likely
to change our mind. Worth re-running for them specifically.
