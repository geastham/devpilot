# Running ledger

**What is true right now.** Updated at the end of every working session.

Read this before `ROADMAP.md` — the roadmap says what we intend, this says what
is actually built, actually verified, and actually broken. Where they disagree,
this wins.

> **Convention.** *Verified* means someone ran it and watched it work. *Built*
> means it compiles and its tests pass. Those are different words on purpose,
> and this document has been wrong every time they got conflated.

---

## MVP status

**The loop works end to end. Every stage has now been watched running live.**

The product claim is: capture → plan → dispatch a fleet → see results.

| Stage | State |
|---|---|
| Capture → horizon | ✅ Working |
| **Plan** (generate → score → refine → review) | ✅ **Verified 2026-08-16** — live model call, 3 waves / 25 tasks, parallelization 0.88, interrupt raised for review. Took four fixes to get there (see 2026-08-16 entry) |
| Dispatch → real Claude Code sessions | ✅ Verified — two sessions, real cost/token telemetry |
| Callbacks → DB → score → UI | ✅ Verified |
| Wave advance (interrupt → resume → next wave) | ✅ Verified live, two-wave plan |

Planning throughput is the product's core claim, and it has now been watched
working. The remaining unproven edge is **approve → dispatch from
`ConductorReviewPanel`**: the panel renders and the graph accepts the decision,
but no one has clicked Approve and watched 25 tasks fan out to real sessions.
That is the next thing to verify, and it spends real tokens on a real repo.

Three smaller gaps on the demo path:

- ~~**Human review is unreachable from the UI.**~~ **Fixed.** `Review Plan` was
  worse than mis-wired — it set `isConfidencePanelOpen` and *nothing rendered
  it*, so the button was dead. `ConductorReviewPanel` now drives the real
  `interrupt()`: approve / refine-with-constraints / reject.
- ~~**Completed sessions vanish** from Fleet Status.~~ **Fixed** — terminal
  sessions linger for a window (`DEVPILOT_TERMINAL_SESSION_WINDOW_MIN`, 60m) then
  clear. Runway excludes them.
- **Nothing is merged**, and SSO providers are not enabled in the dashboard.

**Not MVP-blocking**, despite recent effort: memory (V1.2/V1.6), code graph
(V1.4), arena (V2), benchmarks (V1.3). Those are the moat and the differentiators
— a conductor can conduct without any of them.

## Open workstreams

| # | Workstream | State | Blocked by |
|---|---|---|---|
| **V1.1** | Conductor Score definition | 🟡 Wave 1 done — TRD 16 | **Confirm the weighting** (§3); then waves 2–5 |
| **V1.2** | Close the memory loop | 🟢 **Built via Graphiti** — TRD 18 | Live-server verification |
| **V1.4** | Code-structure graph for planner context | 🔴 Not started — **pick made: `codebase-memory-mcp`** | Nothing; ready to build |
| V1.5 | Token-reduction stack (output compression + anti-grep hooks) | 🔴 New — not started | Locate the tools; one was unverifiable |
| V1.6 | `falkordblite` TS store adapter | 🟡 **Built, NOT validated** — TRD 19 | A machine with an arch-matching `redis-server` |
| **V1.3** | Benchmarks into CI | 🔴 Not started | Needs an API key in CI |
| V1.4b | Plan-time join: code graph into the planner | 🔴 New — TRD 20 §5.1 | V1.4 |
| V2 | Open the arena | ⚪ Blocked | All of V1 |
| V2b | Write-time structural enrichment of run records | 🔴 New — TRD 20 §5.2 | **Do before records accumulate — cannot be retrofitted** |
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
- **The review interrupt END TO END.** The panel is wired and its no-key error
  path is verified in a browser, but approve/refine/reject have never driven a
  real plan — that needs the API key (see MVP status).
- **Narrow viewports.** Top bar labels and the flow rail caption drop below
  `lg`/`xl` and have never been seen. Chrome's `resize_window` reports success
  while `window.innerWidth` never moves.
- **SSO against live providers.** Nothing has signed in with GitHub or Google.
- **The `falkordblite` embedded engine.** Adapter built, typechecked, wired, and
  its gate/degradation paths tested — but **the engine has never started here**.
  This machine's only `redis-server` is x86_64 while the FalkorDB module is
  arm64, so `dlopen` refuses it. Write→recall through the real engine is
  **unproven**; installing an arm64 redis-server would modify the dev machine and
  was not done unprompted.

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
| ~~**Does the OSS cockpit tolerate a Python runtime?**~~ | **Resolved** — V1.4's pick is a native binary, and TRD 19 makes the memory store an embedded TS binding. Python is now opt-in for Graphiti only | TRD 19 §2 |
| **Retention policy for hosted memory assets** | Blobs grow; nothing decides what ages out | TRD 19 §4 |

---

## In flight

| PR | Repo | State |
|---|---|---|
| [#19](https://github.com/geastham/devpilot/pull/19) | devpilot | Open — session runner, conductor agent, memory capture, vision |
| [#15](https://github.com/geastham/devpilot-website/pull/15) | devpilot-website | Open — SSO |

**Research returned and verified** — `docs/research/SUBSTRATE-SYNTHESIS.md`.
Problem A confirmed (`codebase-memory-mcp`); Problem B recommendation
(`graphzep`) **failed verification — 22 stars, abandoned Aug 2025**, so Graphiti
stands. Kuzu confirmed archived. GrafeoDB added to the watchlist.

**Parallel work:** another agent is working the SEO/content side of
`devpilot-website`. Positioning language it should use is in
`docs/POSITIONING.md`; the vision it derives from is `docs/VISION.md`.

---

## Session log

Newest first. One line each — the detail belongs in the docs this points at.

- **2026-08-16** — Demo-path fixes: built `ConductorReviewPanel` (the Review Plan
  button was dead — a flag nothing rendered), and terminal sessions now show in
  Fleet Status. Surfacing them exposed two more: completed sessions rendered
  "IDLE IMMINENT" at 100%, and the score pill disagreed with its own breakdown
  (822 vs 716). Both fixed.
- **2026-08-12** — V1.6 built: `falkordblite` TS adapter, preflight diagnostics,
  platform gate. **Found that `falkordblite` does not ship `redis-server`** —
  TRD 19's "zero install" premise was false and is corrected. Engine unvalidated
  on this machine (arch mismatch). Also fixed a tsup bug: bundling the CJS
  package broke its internal `require`.
- **2026-08-19** — **The join is built and verified live: a Linear ticket now
  becomes a wave plan.** The gap was not missing plumbing — it was that
  `createBridgeDispatchHandler` turns a ticket into **one** Claude Code session,
  so the paid path routed around the entire product thesis: never planned, never
  decomposed, never parallelised.
  Added `createConductorDispatchHandler` (`--plan`, `DEVPILOT_BRIDGE_PLAN`,
  `--cockpit-url`). It talks HTTP to the local cockpit rather than importing the
  conductor, because the langchain dependency is deliberately kept out of core;
  the CLI cannot import the graph, and duplicating it or dragging langchain into
  every install would both be worse. Claimed message → `POST /api/items`
  (zone REFINING — the API default DIRECTIONAL would park it as an idea) →
  `POST /api/items/{id}/conductor` → report the review gate to the bridge.
  **It deliberately does not wait for approval.** The review interrupt is the
  point of the conductor, and a handler that awaited a human would hold its queue
  claim for hours; a held claim is invisible work that the stale sweep reclaims
  and re-runs.
  Two supporting changes: `GET /api/items` gained a `linearTicketId` filter (the
  bridge needs "is this ticket already on the board?"), and status is reported as
  `running` with a descriptive message rather than a new `awaiting_review` value —
  `SESSION_STATUSES` is mirrored by a CHECK constraint whose own comment requires
  a matching migration for any addition.
  **Verified live against a running cockpit**, not a stub: ticket → item →
  conductor run → parked at review with a real plan (**4 waves, 28 tasks**),
  status back to the bridge, and the plan surviving a cockpit restart via the
  checkpoint.
  The live run then found what the stub could not: redelivery reused the item but
  still POSTed `/conductor`, **re-planning from scratch — 236s and a full model
  call for a ticket already waiting on a human.** Item-level dedupe does not
  prevent the spend. The handler now checks the run state first and returns if
  one is live: **471ms instead of 236,000ms**, measured. Two regression tests pin
  it (live run must not restart; an item with no run still gets one).
  Suites: core 36/36, CLI 29 passed + 1 skipped (the live test is opt-in via
  `DEVPILOT_LIVE_COCKPIT_URL`).
  **Still single-session by default.** `--plan` is opt-in because planning costs
  a model call and stops at a human gate — a different contract from "run this
  ticket now". Flip the default once you want planning to be the paid path's
  normal behaviour.

- **2026-08-19** — **Hosted Linear bridge verified end to end, as shipped code.**
  Correcting the 2026-08-17 entry's framing: that assessment was of the **OSS
  local** implementation in `devpilot/`, which is vestigial. The **hosted**
  bridge in `devpilot-website/` is a different, far more mature implementation
  and already had the security properties the local one lacked — mandatory
  signature (a missing header and a missing stored secret are each a 401), raw-
  body verification, a 60s replay guard, 401-not-404 so workspace existence is
  not probeable, repo→orchestrator routing, and session+event+queue committed in
  one transaction.
  **What was missing was proof.** `tests/integration/round-trip.test.ts` walks
  the pipeline but re-implements the route's logic in SQL and asserts on the
  re-implementation — it compares an HMAC it computed against an HMAC it
  computed the same way, and its unsigned-webhook case asserts on a local
  variable beside the comment "route returns 401". It never imports the route.
  Same for `queue.test.ts` and the dispatch routes. The schema, crypto and
  concurrency semantics were covered; the shipped modules were not.
  Added `tests/integration/linear-webhook-route.test.ts`, which **imports and
  invokes the actual handlers** against the live database: 12 tests covering
  unsigned / forged / tampered-after-signing / unknown-org / stale-timestamp /
  non-bot-assignee rejections, the dispatch commit (session + event + queue row,
  with the queue row asserted because a session without one is a dispatch that
  silently never happens), Linear redelivery as a duplicate, then the machine
  side: unauthenticated poll refused, poll returns the dispatch, claim stamps
  the row, a second claim 409s, and a later poll no longer offers it. Seeds are
  committed (the route uses its own connection) and removed in `afterAll`, which
  asserts the database is clean — verified separately as well.
  Full website suite: **329 tests / 18 files green**, typecheck clean.
  **Verdict: the paid path works.** Linear issue assigned to the bot → hosted
  webhook → durable queue → the user's machine claims it. The remaining gap is
  not the bridge but the join: the claimed `TaskDispatchMessage` is not yet fed
  into the local conductor's planning loop.

- **2026-08-17** — **Approve → dispatch verified live; found a deadlock that would
  have hit every realistic plan.** Wave 1 of the live plan fanned out to real
  Claude Code sessions in an isolated scratch repo. Four defects fixed:
  1. **`wave_plans.plan_id` was given the horizon item's id.** `persistPlan`
     passed `input.itemId` for *both* `horizonItemId` and `planId`; the FK
     points at `plans(id)`, a different id. Approve died with a bare
     "FOREIGN KEY constraint failed" naming neither column nor value. Now
     resolves the real plans row and fails with a diagnosis if absent.
  2. **Waves larger than `maxConcurrentSubagents` deadlocked permanently.**
     `dispatchWave` dispatches up to the cap and leaves the rest `pending`;
     nothing backfilled when a slot freed, and `checkWaveCompletion` requires
     *every* task to be terminal. So the wave never completed and the run hung
     with the fleet idle. Hidden because the only previously-executed plan had
     fewer tasks per wave than the cap — the first real plan had waves of 8/9/9
     against a default cap of 4. Fixed with `onCapacityFreed`, wired to
     `controller.dispatchWave`. **Verified live:** a completion is immediately
     followed by an unprompted dispatch, and the drain continues *past a failed
     task* — the failure path settles too, which it previously did not do at all.
  3. **`handleTaskFailed` never checked wave completion.** A wave whose last
     outstanding task failed was never recognised as finished.
  4. The dispatch route could not re-dispatch an already-`active` wave, so a
     stalled wave had no recovery short of editing the database. It now accepts
     an explicit `waveIndex`.
  Also observed, **not yet fixed**: the conductor's dispatch port drives the
  controller directly and never moves `wave_plans.status` off `draft`, so every
  status-gated route (pause/resume/metrics) is inoperative on conductor-driven
  runs.
- **2026-08-17** — **Linear bridge assessed; it does not work, and it was
  unauthenticated.** The webhook route read `linear-signature` and discarded it
  behind a `TODO`. `handleLinearWebhook` verifies only when handed secret +
  signature + raw body, and the route passed none — so the guard was
  structurally unreachable and the endpoint accepted forged payloads that mutate
  state. It also never passed `botUserId`, the sole trigger for the
  `bot_assigned` branch, so the dispatch the bridge exists to produce could
  never fire — and the route discarded `result.dispatch` regardless. `connect`
  verifies credentials against Linear and then persists **nothing**
  (`initLinearClient` sets a module-level variable; no table exists). Route now
  **fails closed** (503 with no secret, 401 on missing/invalid signature),
  verifies against the raw body, and passes `botUserId`. Verified: a forged
  payload that previously would have been processed is now refused.

- **2026-08-16** — **Planning agent verified end to end on a live model call.**
  Fixed four defects, three of them latent behind the first:
  1. `claude-sonnet-4-20250514` had been retired — every planning run 404'd. The
     ID was hardcoded at **six** call sites; now one constant
     (`wave-planner/models.ts`, `resolvePlannerModel()`), default
     `claude-opus-5`, `WAVE_PLANNER_MODEL` still overrides.
  2. `generateWithRetry` retried that 404 four times through the full backoff
     ladder. Permanent statuses (400/401/403/404/405/422) now fail fast; the
     wrapper preserves `.status` so the loop can tell them from a 529.
  3. `refineplan` **threw** on an invalid refinement — discarding an already-valid
     plan and failing the whole conductor run. Its own comment had always said
     "return original"; the code now does, and records
     `lastRefinementError` so a discarded pass is not silent.
  4. **Markdown table parser split on escaped pipes.** The model emitted correct
     GFM (`` `'png'\|'svg'` ``); `line.split('|')` treated the escape as a column
     break and shifted every later cell left. Damage landed in `filePaths` —
     which is what conflict detection uses to decide what may share a wave, so
     colliding tasks would not be seen to collide and would be **dispatched in
     parallel onto the same file**. Regression test pins the exact captured row.
  Verified run: HTTP 200, `awaiting: review`, 3 waves / 25 tasks,
  parallelization **0.88**, 3 refinement iterations, 0 corrupted file paths.
  Added `DEVPILOT_PLANNER_DUMP_DIR` (opt-in, 0600, never throws) — the raw
  response capture is what made defect 4 findable at all.
  **Not yet proven:** approve → dispatch through `ConductorReviewPanel` has not
  been exercised since the model fix; it dispatches real sessions, so it needs a
  deliberate call rather than a drive-by test.

- **2026-08-12** — External substrate research returned and **verified against
  the GitHub API**: `codebase-memory-mcp` confirmed for V1.4, Kuzu confirmed
  archived, GrafeoDB found. Its Problem B recommendation (`graphzep`) was false —
  22 stars, abandoned a year ago — so Graphiti stands unchanged.
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
