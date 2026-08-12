# Running ledger

**What is true right now.** Updated at the end of every working session.

Read this before `ROADMAP.md` — the roadmap says what we intend, this says what
is actually built, actually verified, and actually broken. Where they disagree,
this wins.

> **Convention.** *Verified* means someone ran it and watched it work. *Built*
> means it compiles and its tests pass. Those are different words on purpose,
> and this document has been wrong every time they got conflated.

---

## Open workstreams

| # | Workstream | State | Blocked by |
|---|---|---|---|
| **V1.1** | Conductor Score definition | 🟡 Wave 1 done — TRD 16 | **Confirm the weighting** (§3); then waves 2–5 |
| **V1.2** | Close the memory loop | 🟢 **Built via Graphiti** — TRD 18 | Live-server verification |
| **V1.4** | Code-structure graph for planner context | 🔴 Not started | Pick: Graphify vs codebase-memory-mcp (`MEMORY-LANDSCAPE.md` §3.4) |
| **V1.3** | Benchmarks into CI | 🔴 Not started | Needs an API key in CI |
| V2 | Open the arena | ⚪ Blocked | All of V1 |
| V3 | Pattern extraction → planner + content | ⚪ Blocked | V1.2, V2 consent model |

See `docs/VISION.md` §5 for why this order.

---

## Verified end to end

Someone ran these and watched them work.

| What | When | Evidence |
|---|---|---|
| `devpilot session-runner` → real Claude Code | 2026-08-10 | Two sessions: $0.64/731k tok, $1.39/2.1M tok; files written; `COMPLETE` in DB |
| Conductor graph driving a two-wave plan | 2026-08-11 | Dispatch → `interrupt()` → resumed by completion callback → auto-advance → finish. `completedWaves: [0,1]`, both sessions real |
| Shared-session secret handling | 2026-08-11 | Tests assert the join link never reaches argv, prompt, or logs; config is `0600` and removed on exit |
| SSO code path | 2026-08-12 | `pnpm verify` green; **providers not yet enabled in the hosted dashboard** |

## Built but NOT verified

Compiles, tests pass, nobody has watched it work.

- **The planning half of the conductor** — `generate` / `refine` / `score` through
  the graph against the real API. No `ANTHROPIC_API_KEY` in this environment;
  every test substitutes the planner. The live run *adopted* an approved plan.
- **Restart resumption.** Checkpoints persist to `<db>.checkpoints.db`; no run
  has been interrupted by an actual process restart and resumed.
- **The review interrupt through the UI.** The route accepts decisions; REFINING's
  buttons still point at the old flow.
- **Narrow viewports.** Top bar labels and the flow rail caption drop below
  `lg`/`xl` and have never been seen. Chrome's `resize_window` reports success
  while `window.innerWidth` never moves.
- **SSO against live providers.** Nothing has signed in with GitHub or Google.

## Known broken

- ~~**Memory is write-only.**~~ **Fixed by adopting Graphiti** (TRD 18) — one
  store, so `search` reads what `add` wrote. Round trip verified against a stub;
  the `evolve` step was deleted rather than built. **Still unverified against a
  real Graphiti server** — a tool-name mismatch would show up as empty recall.
- ~~**The Conductor Score has no single definition.**~~ **Fixed** — `SCORE_MODEL`
  in `@devpilot.sh/core/score` is now the only place maxima are declared, with a
  sum-to-1000 invariant test. **The weighting still needs your sign-off**
  (TRD 16 §3); changing it is a one-line edit per dimension.
- **Stored score totals are stale.** They accumulated under the old flat 5×200
  model, so a persisted 822 does not equal the same dimensions read through the
  new model (716). `/api/score` now recomputes and returns `storedTotal`
  alongside so the drift is visible. Proper migration is TRD 16 wave 4.
- **`parallelizationQuality` is always 0** — declared in the model, not yet
  populated from wave metrics. TRD 16 wave 3.
- **Completed sessions vanish from the cockpit.** `/api/fleet/state` returns only
  `ACTIVE` and `NEEDS_SPEC`, so a finished session disappears rather than showing
  as done — and the `allComplete` ✓ branch in `FleetSummaryPills` is dead code.
- **`drizzle-kit push` is unsafe against `.devpilot/data.db`.** It partially
  rewrote tables, dropped `wave_plans`/`wave_tasks`, and left a dangling
  `__old_push_plans` reference that blocked all writes. Back up first; prefer
  applying generated DDL for the specific tables you need.
- **`three-panel` and `timeline` layouts** are in the switcher and fall back.
- **The drift CI job on devpilot-website cannot pass** — no Actions secrets, so it
  dies at `Link project`. The script is fine and passes locally.

---

## Decisions waiting on a human

| Decision | Why it is blocking | Where |
|---|---|---|
| **Score weighting** — spec's 250/250/200/200/100 or the implemented flat 5×200 | You cannot rank people on an ambiguous number. Blocks the whole arena | TRD 16 §3 |
| **Retire MemPalace's local shim?** | Graphiti now backs the same port. Keeping both means maintaining two, and the shim is the one that was broken | TRD 18 §2 |
| **Cross-org learning consent** | TRD 15 §4.3 currently forbids it; pattern extraction requires it | TRD 15 §4.3 |
| **Account linking / domain restriction** for SSO | Defaulted rather than decided | `devpilot-website/docs/SSO.md` |
| **Does the OSS cockpit tolerate a Python runtime?** | Gates the V1.4 pick — `codebase-memory-mcp` ships a native binary, Graphify and Graphiti need Python | `MEMORY-LANDSCAPE.md` §0.4 |

---

## In flight

| PR | Repo | State |
|---|---|---|
| [#19](https://github.com/geastham/devpilot/pull/19) | devpilot | Open — session runner, conductor agent, memory capture, vision |
| [#15](https://github.com/geastham/devpilot-website/pull/15) | devpilot-website | Open — SSO |

**Parallel work:** another agent is working the SEO/content side of
`devpilot-website`. Positioning language it should use is in
`docs/POSITIONING.md`; the vision it derives from is `docs/VISION.md`.

---

## Session log

Newest first. One line each — the detail belongs in the docs this points at.

- **2026-08-12** — Graphify evaluated (`MEMORY-LANDSCAPE.md` §3.4): it is the
  structural half, not a Graphiti competitor. 105k stars in 4 months but still
  0.9.x with daily releases and one maintainer — adopt behind the port, pinned,
  nothing load-bearing until 1.0. Awesome-GraphMemory adopted as the watchlist.
- **2026-08-12** — **Graphiti adopted as the memory substrate** (TRD 18):
  Apache 2.0, MCP 1.0, temporal facts, embedded FalkorDB Lite. Implements
  `MemPalaceClient` directly; deterministic triplet writes need no LLM key;
  every failure degrades to empty. Write→recall round trip closes.
- **2026-08-12** — Memory landscape evaluated (`MEMORY-LANDSCAPE.md`): four
  constructs org-wide, the Template Knowledge Engine is the better precedent than
  Synaptic Wiki, code-structure memory is now a commodity worth buying. V1.2
  re-scoped, V1.4 added.
- **2026-08-12** — Vision turn documented (`VISION.md`, `POSITIONING.md`); SSO
  for GitHub + Google; both branches pushed as PRs; this ledger created.
  **V1.1 wave 1 shipped**: `SCORE_MODEL` as single source of truth, six
  dimensions, invariant test, four hard-coded copies of the maxima retired.
- **2026-08-11** — Conductor agent built and verified live end to end. Found and
  fixed the duplicated orchestrator singleton — wave dispatch could never have
  worked through the Next app. TRD 15 revised against Synaptic Wiki prior art.
- **2026-08-10** — `devpilot session-runner` built; two real Claude Code sessions
  dispatched end to end. Corrected three stale roadmap claims; Tier 1 was already
  complete.
- **2026-08-09** — Cockpit comprehension pass. Score breakdown surfaced the
  weighting divergence that became V1.1.
