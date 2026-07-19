# DevPilot Roadmap — Where We Are & What's Next

> Functionality review · July 2026 · Synthesized from `spec/DESIGN.md`, `spec/WAVE-PLANNER.md`, `spec/BENCHMARK-SUITE.md`, `design/*`, and a full pass over the implementation.

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
| 3 — Wave Execution Controller | 🔴 **Half-built — the critical gap** | State machine exists, but `dispatchToOrchestrator()` is a `console.log` placeholder (`dispatch-coordinator.ts:236`); CompletionListener exported but never wired; controller retry is a TODO |
| 4 — Re-Optimization & Editing | 🟡 Partial | Reoptimize route is real AI. **Pause/resume routes don't exist** but `PlanReviewCard.tsx:52,61` calls them → 404 |
| 5 — UI Integration | 🟡 Partial | Wave progress + Planning Horizon View (design/08) shipped. DAG visualization not built |
| 6 — Metrics & Benchmark Integration | 🟡 Partial | Metrics route exists; `parallelizationQuality` not yet in Conductor Score |

### spec/BENCHMARK-SUITE.md

✅ Essentially complete — real subprocess harness (baseline + DevPilot executors), scoring, history/compare/trend CLI. Needs a live `claude` CLI + API key to run; not yet in CI.

### Post-spec additions (no spec docs)

Recent PRs added: Wiki system (#4), Caveman plugin in setup (#5), MemPalace memory layer (#6), session-native orchestrator adapter scaffold + Mission Control (#7), RTK integration (#2). The claude-session adapter is a self-described scaffold with placeholder endpoints.

---

## 2. The headline finding

**The full loop — capture → plan → dispatch → agents execute → progress flows back — is broken at "dispatch."** Everything upstream (UI, DB, AI wave planning) and downstream (orchestrator callback ingestion, Linear sync, score updates) is real, but the middle never fires:

1. `dispatchToOrchestrator()` in `packages/core/src/wave-planner/execution/dispatch-coordinator.ts` is a no-op placeholder — wave dispatch only mutates DB status.
2. The Next app never calls `initOrchestratorClient`, so `POST /api/fleet/dispatch/[itemId]` always takes the unconfigured branch — it creates a session row at 0% that nothing advances. Only the CLI's `devpilot serve` Fastify server wires an orchestrator end-to-end.
3. Plan generation for the plan-review flow is still `generateMockWorkstreams()` keyword templates (`src/app/api/items/[id]/plan/generate/route.ts:192`) even though the *wave* planner right next to it is real AI.

---

## 3. Proposed next work, prioritized

### Tier 1 — Close the loop (make dispatch real)

1. **Implement `dispatchToOrchestrator()`** — bridge WaveDispatchCoordinator to `OrchestratorService.dispatch`, wire `CompletionListener` into the orchestrator status/complete callbacks, implement controller retry re-dispatch.
2. **Initialize the orchestrator in the Next app** (or formally consolidate serving on the CLI Fastify server and have the Next app proxy to it — pick one; today they're two half-servers).
3. **Finish the claude-session adapter** — define the real session dispatch contract, replace the placeholder endpoints. This makes Claude Code sessions the native execution engine instead of requiring `ao-cli`.
4. **Unify plan generation on the real AI pipeline** — delete `generateMockWorkstreams()` (Next app) and the canned plan in `packages/cli/src/server/api/items.ts`; derive workstream plans from the wave planner.
5. **Add the missing `pause`/`resume` routes** under `/api/wave-plans/[planId]/` — the UI already calls them and currently 404s.

### Tier 2 — Finish specced roadmap items

6. **DAG visualization modal** (WAVE-PLANNER §11.3, dagre/d3-dag) + **replan constraint modal** — both existing TODOs in PlanReviewCard/RefiningCard.
7. **Remaining Phase-4 layouts**: RunwayTimeline (Recharts), VelocityDashboard, ThreePanelMinimum, FloatingHUD, layout switcher.
8. **Conductor Score completion**: add `parallelizationQuality` from wave metrics; leaderboard opt-in.
9. **Phase 5 Conversational Mode**: ThinkAloudPlanner split chat + live horizon. Natural fit now that wave planning is a real API.

### Tier 3 — Hardening & truth-telling

10. **Bridge middle hop**: Linear webhook → Pub/Sub publish → local orchestrator dispatch (`bridge/api/webhooks/linear.ts` TODO, `cli bridge connect.ts:66` TODO); session-complete → Linear sync in bridge.
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
