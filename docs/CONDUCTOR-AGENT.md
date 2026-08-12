# The conductor agent

DevPilot's planning and execution loop as a LangGraph agent —
`packages/conductor-agent`, published as `@devpilot.sh/conductor-agent` (MIT).

The package README covers the agent itself. This document covers **how DevPilot
wires into it, what is verified, and what is not.**

---

## What it replaces, and what it does not

`WaveExecutionController` was a 449-line state machine whose decisions —
`approve`, `dispatchWave`, `onTaskComplete`, `handleWaveComplete`,
`onTaskFailed` — were spread across five methods and reached from callbacks. The
run's status lived in database columns; everything else (refinement counters,
retry counts, which wave was live) lived in local variables inside whichever
method happened to be executing.

That state could not be inspected mid-run, checkpointed, or resumed. A process
that died between dispatching a wave and observing its completion stranded the
plan with no record of what it had been doing.

**The graph replaces the orchestration. It does not replace the effects.**

| Concern | Owner |
|---|---|
| Which wave runs next, when to refine, when to retry, when to stop | The graph |
| Human review as a first-class pause | The graph (`interrupt()`) |
| Loading a wave's tasks, checking fleet capacity, dispatching | `WaveExecutionController` / `WaveDispatchCoordinator`, unchanged |
| Session rows, orchestrator calls, rollback | `dispatch-coordinator.ts`, unchanged |
| Scoring, critical path, wave assignment | `PlanRefinementService` / `plan-scorer`, unchanged |

This was a deliberate call. The dispatch path had just been verified end to end
with two real Claude Code sessions (`docs/SESSION-RUNNER.md`); rewriting it
underneath a framework would have discarded that for no gain. The graph needed
the control flow, not the effects.

`WaveExecutionController` therefore survives as an effects library. Its
orchestration methods are superseded.

---

## The seam

`src/lib/conductor.ts` implements `ConductorPorts` against real DevPilot code:

| Port | Delegates to |
|---|---|
| `generatePlan` | `PlanRefinementService.generateInitialPlan` |
| `refinePlan` | `PlanRefinementService.refineplan` |
| `scorePlan` | `PlanRefinementService.scorePlan` (composes critical path + wave assignment) |
| `persistPlan` | Host-supplied, so the caller controls the transaction |
| `dispatchWave` | `WaveExecutionController.dispatchWave` |
| `waitForWave` | **Absent by design** — see below |

Three methods on `PlanRefinementService` became public (`generateInitialPlan`,
`refineplan`, `scorePlan`). The graph drives generation and refinement as
separate nodes with its own scoring gate between them, which the all-in-one
`generateAndRefine` cannot express. That method still exists for callers who
just want a plan.

### Conductor constraints go through `customConstraints`

Not appended to the spec text. `PromptConstructorConfig.customConstraints` is
the field the prompt templates already render. Splicing human instructions into
the spec would put them where the model expects a requirements document, and
make them indistinguishable from the spec on the next refinement pass.

### Why `waitForWave` is absent

A wave is a fleet of coding agents running for minutes to hours. The graph
`interrupt()`s after dispatch and checkpoints; the orchestrator completion
callbacks resume it. Holding an open promise across that window is how you lose
a run to a restart — which is the exact failure the old controller had.

### The langchain dependency stops at the Next app

`@langchain/core` pulls in langsmith, js-tiktoken, mustache and p-queue. Putting
that in `@devpilot.sh/core` would ship it to every CLI install. The adapter lives
in `src/lib/`, so only the app carries it.

---

## Verified

### Live, end to end — August 2026

A two-wave plan run through the graph against real Claude Code sessions:

| | Wave 1 | Wave 2 |
|---|---|---|
| Task | Add `CONTRIBUTING.md` | Add `LICENSE` |
| Result | file created | file created |
| Cost / tokens | $0.37 · 603,676 | $0.26 · 318,834 |
| Wall | 0.85m | 0.69m |

The part that had never run anywhere: **the graph dispatched wave 1, suspended
on `interrupt()`, was resumed by the orchestrator completion callback, advanced
to wave 2 on its own, and finished.** Final state `status: complete`,
`completedWaves: [0, 1]`; the wave plan is `completed`, both tasks `completed`
with their session ids, both sessions `COMPLETE` with real cost and tokens, and
the activity feed carries the conductor's own events through to
`WAVE_PLAN_COMPLETE`.

### In CI

- **The graph**: 14 tests in `packages/conductor-agent/tests/graph.test.ts` —
  threshold gate, refinement budget, discarding a worse refinement, all three
  review decisions, multi-wave sequencing, retry-then-halt, `continue` policy,
  interrupt-driven waiting, adopting an existing plan, token accounting.
- **The singleton fix**: 3 tests in
  `packages/core/tests/orchestrator-singleton.test.ts`.

### Two bugs the live run found

Both were invisible to every test and to typechecking, and both would have made
the conductor look broken in ways that pointed at the wrong place.

**1. The orchestrator singleton was duplicated across core's build entries.**
`tsup` builds five entries with `splitting: false`, so
`dist/orchestrator/index.*` and `dist/wave-planner/index.*` each inlined their
own copy of `service.ts`. With the instance in a module-level `let`, a service
initialised through `@devpilot.sh/core/orchestrator` was invisible to
`WaveDispatchCoordinator` in `@devpilot.sh/core/wave-planner`: every task threw
`ORCHESTRATOR_UNAVAILABLE` and was **silently queued**. Dispatch reported
success, changed no task status, and started no agent.

This is not a conductor bug — **wave dispatch could never have worked through
the Next app**, and `/api/wave-plans/[planId]/dispatch` had the same defect. It
survived because `/api/fleet/dispatch` calls `service.dispatch()` directly and
never crosses the bundle boundary; only the coordinator path does. The instance
now lives on `globalThis`, which is bundler-proof — `splitting: true` would fix
ESM and leave CJS duplicated, and this package ships both.

**2. Nothing initialised the orchestrator on the conductor's path.** Routes that
dispatch happened to call `getServerOrchestrator()` on the way in. The conductor
route did not, so the lazily-initialised singleton was never created. The
`dispatchWave` port now calls it first.

Both were only findable by running the thing. The second was also masked by the
first: fixing the init alone still produced `queued: 1`, which is what forced
the singleton hypothesis. `lastDispatch` is now in the graph's state and in the
route response, so a wave that dispatches zero tasks can never again look
identical to one that worked.

---

## NOT verified

- **The planning half has never run live.** There is no `ANTHROPIC_API_KEY` in
  this environment (the `claude` CLI authenticates over OAuth; the Anthropic SDK
  inside `PlanRefinementService` does not). `generate`, `refine` and `score` are
  covered only by stub-backed tests. The live run **adopted** an already-approved
  plan and entered the graph at `dispatch`.
- **The review interrupt has not been driven by a human through the UI.** The
  route accepts `{ decision }` and the graph handles all three outcomes in tests,
  but no cockpit control calls it yet — REFINING's *Review Plan* and *Re-plan*
  buttons are still wired to the old flow.
- **Restart-resumption is untested.** Checkpoints persist to
  `<db>.checkpoints.db`, but no run has been interrupted by an actual process
  restart and resumed.

---

## Remaining work

1. Point the REFINING zone's *Review Plan* / *Re-plan* buttons at
   `POST /api/items/[id]/conductor` with a `decision`.
2. Run the planning half live once a key is available.
3. Kill the server mid-wave and confirm the run resumes from its checkpoint.
4. Only then delete `WaveExecutionController`'s orchestration methods
   (`approve`, `onTaskComplete`, `handleWaveComplete`, `onTaskFailed`) and
   `ExecutionBridge`'s auto-advance. Its dispatch methods stay — the graph calls
   them. **Not before 1–3**, since the old path is still what the existing
   routes use.
