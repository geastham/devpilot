# DevPilot Roadmap — Where We Are & What's Next

> Functionality review · July 2026 · Synthesized from `spec/DESIGN.md`, `spec/WAVE-PLANNER.md`, `spec/BENCHMARK-SUITE.md`, `design/*`, and a full pass over the implementation.
>
> **Updated August 2026** — see §0. Parts of §2 below were written when the CLI
> still had its own Fastify server. That server no longer exists; the affected
> claim is corrected in place rather than deleted, because the reasoning around
> it is still worth reading.

---

## 0. August 2026 — what changed

**TRD 21 (fleet introspection & adoption) is built**, all five waves. The loop only ever ran
one way: every session DevPilot knew about was one DevPilot started, while the
same machine had dozens of Claude Code sessions the product could not see — 38
project directories on the reference machine, none of them on the board. TRD 21
walks `~/.claude/projects`, resolves each session to a repo, and backs it onto
Linear; the same walk produces a repo/owner inventory that drives first-run
setup. Adopted sessions are observational: no queue row, no commands, and
completion never moves a ticket. Verified end to end against the live database
over real HTTP: the shipped CLI adopted six live sessions and wrote zero
dispatch-queue rows. Not yet exercised against a live Linear workspace — every
Linear call in the suite goes to a local GraphQL stub. See `docs/ADOPTION.md`.

**TRD 06 (shared agent sessions) shipped**, all five waves. End-to-end encrypted
transcripts, join links, an MCP server so Claude Code can take part, and CLI
`session` commands. See `docs/SHARED-SESSIONS.md`.

**The cockpit now ships in the CLI.** `devpilot serve` runs the cockpit's own
Next server. Previously it started a second Fastify implementation of the API
and served no UI at all — the cockpit existed and ran only from a repo checkout,
so nobody installing from npm could reach it. See `docs/COCKPIT.md`.

**Three server surfaces became two.** The CLI's Fastify server
(`packages/cli/src/server`) is deleted. It reimplemented the same API over the
same tables and was missing the wave-plan routes entirely, so the planner could
never have worked through it.

**The wave planner UI was orphaned and is now mounted** at `/waves`.
`DAGVisualization`, `CriticalPathIndicator` and `WaveProgressBar` were all built,
exported, and reachable from nowhere. The critical path renders and animates.

**A motion language exists** (`src/styles/motion.css`), implementing the §2.2
signals that were specified and never built — runway urgency, idle pulses, live
agents. Rule: motion is diegetic, and everything is guarded by
`prefers-reduced-motion`.

**~~Still true from §2 below: dispatch is the broken link.~~ FALSE — corrected
August 2026.** This claim survived several rewrites of this document without
anyone rechecking the code. It was wrong on three counts:

- `dispatchToOrchestrator()` is **not** a no-op. It has been fully implemented
  since `e2f9839` (2026-07-19, *"TRD-01 W2-T1: real dispatch + retry
  re-dispatch (close the loop)"*) — it creates the session row, composes the
  prompt, calls `OrchestratorService.dispatch`, and rolls the row back if
  dispatch is refused.
- The Next app **does** initialize the orchestrator, via
  `src/lib/orchestrator.ts:getServerOrchestrator()`, which also wires the status
  poller and the `ExecutionBridge`. Four routes call it.
- The `pause` / `resume` routes **exist** — §3 Tier 1 item 5 below says they 404.

**The real gap was one layer further out, and is now closed.** `claude-session`
mode had no runner behind `DEVPILOT_SESSION_API_URL`: the adapter, the transport
and the callback routes were all built, with nothing implementing the service in
between. `devpilot session-runner` now does, and **two real Claude Code sessions
have been dispatched end to end through it** — capture → plan → dispatch → agent
edits files → callbacks → DB → score → UI. See `docs/SESSION-RUNNER.md`.

~~Still true: plan generation for the plan-review flow is
`generateMockWorkstreams()` keyword templates.~~ **Also false.** Deleted in
`9e1106e` (2026-07-20, *"TRD-01 W2-T6: Next plan-generate route uses real wave
planner"*). The route calls `generatePlanForItem` + `projectWavePlanToPlan` and
returns `503 PLAN_AI_UNAVAILABLE` without an API key. TRD-01's own acceptance
check — "grep: `generateMockWorkstreams` absent from repo" — passes; the name
survives only in spec prose describing the state it replaced.

**Tier 1 is therefore complete.** Every item in §3 below is done. The lesson is
the one this document keeps re-teaching: these claims were re-asserted through
several rewrites without anyone re-reading the code, and each one made the
product look further from working than it was.

**A dispatch bug that predates all of this was found and fixed.** Core's
orchestrator singleton lived in a module-level `let`, and `tsup` builds five
entries with `splitting: false` — so `dist/orchestrator/*` and
`dist/wave-planner/*` each carried their own copy. A service initialised through
one was invisible to `WaveDispatchCoordinator` in the other, and every wave task
was **silently queued**: dispatch reported success, changed no status, started no
agent. **Wave dispatch could never have worked through the Next app.** It hid
because `/api/fleet/dispatch` bypasses the coordinator. Now on `globalThis`, with
regression tests. This is the *real* "dispatch is broken" — not the cause §2
claimed for a year.

**The conductor is a LangGraph agent, verified live.** `packages/conductor-agent`
(`@devpilot.sh/conductor-agent`, MIT) expresses plan → score → refine → human
review → dispatch → advance as one resumable graph, with human review as a real
`interrupt()` rather than a database flow bolted on beside the planner. The graph
owns control flow; effects stay with the existing tested code. A two-wave plan has run end to end through the graph against **real Claude Code
sessions**: dispatch → suspend on `interrupt()` → resumed by the orchestrator
completion callback → auto-advance → finish. The planning half still has not run
live (no API key here). See `docs/CONDUCTOR-AGENT.md` for exactly what is and is
not verified.

---

## 1. Where the roadmap left off

### spec/DESIGN.md — Implementation Phases (v0.4)

| Phase | Status | Notes |
|---|---|---|
| 1 — Core Work Horizon | ✅ Done | 4-zone surface, cards, QuickCapture, TopBar, promote/dispatch flows, Zustand stores — all real and DB-backed |
| 2 — Plan Review Surface | ✅ Mostly done | PlanReviewCard, task editing, cost breakdown built. **Replan modal + DAG modal are TODOs** (`PlanReviewCard.tsx:45,78`, `RefiningCard.tsx:84`) |
| 3 — Fleet Awareness | ✅ Mostly done | Session cards, ActivityFeed, AssistPanel, SSE all built. SSE is a 2s DB-poll behind a stream, not true push |
| 4 — Alternative Layouts & Score | 🟡 Partial | Mission Control shipped (PR #7). **Not built: ThreePanelMinimum, RunwayTimeline, VelocityDashboard, FloatingHUD, layout switcher, score leaderboard** |
| 5 — Conversational Mode | ❌ Not started | ThinkAloudPlanner (C1), FocusedInput sprint mode (C2), chat persistence — no commits |

### spec/WAVE-PLANNER.md — Implementation Plan (v1.0)

| Phase | Status | Notes |
|---|---|---|
| 1 — Data Model & Core Engine | ✅ Done | Schema, parser, DAG validator, critical path, wave assigner, plan scorer all real |
| 2 — Prompt Construction & AI | ✅ Done | Real Anthropic SDK calls with retry, refinement loop, flat-plan fallback |
| 3 — Wave Execution Controller | ✅ Done *(row corrected Aug 2026)* | `dispatchToOrchestrator()` is real (`e2f9839`), `ExecutionBridge` correlates `job:*` events to wave tasks, controller retry re-dispatch implemented. The "`console.log` placeholder" claim was stale |
| 4 — Re-Optimization & Editing | ✅ Mostly done *(row corrected Aug 2026)* | Reoptimize route is real AI. Pause/resume routes **do** exist under `/api/wave-plans/[planId]/` |
| 5 — UI Integration | 🟡 Partial | Wave progress + Planning Horizon View (design/08) shipped. DAG visualization not built |
| 6 — Metrics & Benchmark Integration | 🟡 Partial | Metrics route exists; `parallelizationQuality` not yet in Conductor Score |

### spec/BENCHMARK-SUITE.md

✅ Essentially complete — real subprocess harness (baseline + DevPilot executors), scoring, history/compare/trend CLI. Needs a live `claude` CLI + API key to run; not yet in CI.

### Post-spec additions (no spec docs)

Recent PRs added: Wiki system (#4), Caveman plugin in setup (#5), MemPalace memory layer (#6), session-native orchestrator adapter scaffold + Mission Control (#7), RTK integration (#2). ~~The claude-session adapter is a self-described scaffold with placeholder endpoints.~~ **No longer true** — the placeholders were replaced by the TRD-01 §7 contract, and `devpilot session-runner` implements the other side.

---

## 2. The headline finding

> **⚠ This section is HISTORICAL. The loop is closed as of August 2026** — see
> §0. Two real Claude Code sessions have run through it end to end. The
> numbered claims below are preserved because the reasoning is still worth
> reading, but **all three are now false**.

**The full loop — capture → plan → dispatch → agents execute → progress flows back — is broken at "dispatch."** Everything upstream (UI, DB, AI wave planning) and downstream (orchestrator callback ingestion, Linear sync, score updates) is real, but the middle never fires:

1. `dispatchToOrchestrator()` in `packages/core/src/wave-planner/execution/dispatch-coordinator.ts` is a no-op placeholder — wave dispatch only mutates DB status.
2. The Next app never calls `initOrchestratorClient`, so `POST /api/fleet/dispatch/[itemId]` always takes the unconfigured branch — it creates a session row at 0% that nothing advances. ~~Only the CLI's `devpilot serve` Fastify server wires an orchestrator end-to-end.~~ **(Aug 2026: that server has been deleted — `serve` now runs the Next app, so the orchestrator wiring it had is gone with it. This makes the gap WORSE, not better: there is now no path that wires an orchestrator end-to-end, and Tier 1 has to supply one. The env plumbing survives — `serve` forwards `DEVPILOT_ORCHESTRATOR_*` into the Next server — so the config surface is in place and only the call site is missing.)**
3. ~~Plan generation for the plan-review flow is still `generateMockWorkstreams()` keyword templates~~ — **false since `9e1106e` (2026-07-20)**; the route uses the real wave planner.

---

## 2.5 The vision turn (August 2026) — read this before §3

`docs/VISION.md` reframes the product: **programming has moved from building to
conducting**, the Conductor Score becomes a competitive arena, and patterns
extracted from the best conductors feed both the memory graph and the content
engine.

That changes the priority order below. §3's tiers were written to close the
execution loop, which is now done. **The vision's V1 is a different list**, and
its first item is not in §3 at all:

1. Resolve the Conductor Score weighting — the implementation (flat 5×200) and
   `spec/DESIGN.md` §8.1 (250/250/200/200/100) disagree, and *you cannot rank
   people on an ambiguous number*. Blocks the arena entirely.
2. Close the memory loop (TRD 15 §8.3) — memory is currently write-only.
3. Benchmarks into CI — `packages/benchmarks` is the arena's neutral substrate,
   is essentially complete, and needs no users, which is how the arena
   bootstraps past cold start.

Tier 2 item 8 below (`parallelizationQuality` + leaderboard) is promoted into
V1/V2 by this. Tiers 3 and 4 are unchanged and still accurate.

---

## 3. Proposed next work, prioritized

### Tier 1 — Close the loop (make dispatch real)

1. ~~**Implement `dispatchToOrchestrator()`**~~ — **DONE** (`e2f9839`, 2026-07-19). Real dispatch plus retry re-dispatch.
2. ~~**Initialize the orchestrator in the Next app**~~ — **DONE**. `src/lib/orchestrator.ts:getServerOrchestrator()`, which also wires the status poller and `ExecutionBridge`. The "two half-servers" alternative is moot: the CLI's Fastify server was deleted (§0).
3. ~~**Finish the claude-session adapter**~~ — **DONE**. The contract is TRD-01 §7; the adapter and `HttpSessionTransport` implement it, and `devpilot session-runner` implements the other side, so Claude Code sessions *are* the native execution engine. `ao-cli` is deprecated and throws (see `docs/AO-INTEGRATION.md`). Verified with two real sessions — `docs/SESSION-RUNNER.md`.
4. ~~**Unify plan generation on the real AI pipeline**~~ — **DONE** (`9e1106e`). The Next route derives plans from the wave planner; the CLI's canned plan went with the Fastify server (§0).
5. ~~**Add the missing `pause`/`resume` routes**~~ — **DONE**. Both exist under `/api/wave-plans/[planId]/` and appear in the build output. This entry was stale.

### Tier 2 — Finish specced roadmap items

6. **DAG visualization modal** (WAVE-PLANNER §11.3, dagre/d3-dag) + **replan constraint modal** — both existing TODOs in PlanReviewCard/RefiningCard.
7. **Remaining Phase-4 layouts**: RunwayTimeline (Recharts), VelocityDashboard, ThreePanelMinimum, FloatingHUD, layout switcher.
8. **Conductor Score completion**: add `parallelizationQuality` from wave metrics; leaderboard opt-in.
9. **Phase 5 Conversational Mode**: ThinkAloudPlanner split chat + live horizon. Natural fit now that wave planning is a real API.

### Tier 3 — Hardening & truth-telling

10. ~~**Bridge middle hop**~~ — **DONE**, re-architected. Linear webhook → durable
    `dispatch_queue` (one transaction) → local orchestrator → status/complete
    reported back → Linear sync. GCP Pub/Sub was removed entirely: it required
    every user's laptop to authenticate into our GCP project, which is why the
    original never shipped. See `spec/trd/05-HOSTED-BRIDGE.md`.
11. **Persist Linear config** (currently an in-memory singleton lost on restart) and **enable webhook signature verification** in the Next route — the verify code already exists in core with tests.
12. **Real `devpilot status`** — it currently prints hardcoded fake stats (3 sessions, score 742, rank #23).
13. **Measured runway math** — replace hardcoded 45 min/task and 8-max-sessions constants with rolling velocity from completed-task history.
14. **Repo hygiene**: delete or repurpose `apps/web` (dead-end placeholder) and empty `packages/ui`; remove the hardcoded `'ng-pipelines'` demo repo + canned response in QuickCaptureInput.

### Tier 4 — New functionality beyond the specs

15. **GitHub PR loop**: agents open PRs per workstream; DevPilot tracks PR/CI status on session cards and gates wave auto-advance on green CI.
16. **Cost guardrails**: per-dispatch budget caps and live spend tracking (token tracker already exists in benchmarks — promote it to runtime).
17. **Session transcript viewer / replay** — the orchestrator callbacks already capture completed tasks; surface the full log.
18. **Benchmarks in CI** + a plan-quality trend panel in the UI (closes the WAVE-PLANNER §6 feedback loop).
19. **Truly agentic Assist Panel** — today it's client-side heuristics; give it the Claude API + fleet/wiki/MemPalace context so suggestions are generated, not rule-matched.
20. **Cross-repo wave coordination** — explicitly deferred as future work in WAVE-PLANNER non-goals; becomes reachable once Tier 1 lands.
