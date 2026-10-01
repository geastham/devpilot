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
| Which wave runs next, when to refine, when to stop | The graph |
| Starting agents — a wave's first dispatch, backfilling it as slots free, re-dispatching a task owed a retry | The graph, through its one `dispatch` node |
| Human review as a first-class pause | The graph (`interrupt()`) |
| Recording what a task did: started, completed, failed, lost | `ExecutionBridge` / `CompletionListener` / `WaveExecutionController` |
| Retrying a failed task once, and failing the plan when the retry fails | `WaveExecutionController.onTaskFailed` / `failPlan` |
| Merging a wave's task branches before anyone is told the wave is over | `WaveExecutionController.signalForDriver` |
| Loading a wave's tasks, claiming them, dispatching | `WaveExecutionController` / `WaveDispatchCoordinator` |
| Session rows, orchestrator calls, rollback | `dispatch-coordinator.ts` |
| Scoring, critical path, wave assignment | `PlanRefinementService` / `plan-scorer`, unchanged |

This was a deliberate call. The dispatch path had just been verified end to end
with two real Claude Code sessions (`docs/SESSION-RUNNER.md`); rewriting it
underneath a framework would have discarded that for no gain. The graph needed
the control flow, not the effects.

`WaveExecutionController` therefore survives as an effects library. Of its
orchestration methods, `handleWaveComplete` is now reachable only for plans the
graph is NOT running — see the next section.

---

## Advancing, failing and recovering

### One driver per plan

Two components used to advance a wave plan. The completion callback resumed the
graph, which dispatched wave N+1; the `ExecutionBridge`, hearing the same
completion with `autoAdvance` on, called `handleWaveComplete`, waited two
seconds and dispatched it again. Neither looked at what the other had done.

The bridge now takes a `WaveDriver` (`execution-bridge.ts`). For every task that
changes it asks `owns(wavePlanId)`:

- **Owned** — the conductor graph is running this plan (answered from the
  run's checkpoint, so it survives a restart). The bridge records the task,
  emits the event and calls `notify`. It dispatches nothing.
- **Not owned** — the legacy path: a plan dispatched through
  `/api/wave-plans/:id/dispatch` with nothing sequencing it. The bridge
  backfills and calls `handleWaveComplete` as before, and
  `DEVPILOT_WAVE_AUTO_ADVANCE` governs that path alone.

`notify` is `resumeConductorForTask` (`src/lib/conductor-resume.ts`). It checks
that the run is waiting on that wave, asks core what the wave says
(`WaveExecutionController.signalForDriver` — the reading `waveSignalFor` gives,
with the wave's merge done first when one is due; see
[below](#a-branch-per-task-a-merge-per-wave)) and resumes the graph with the
answer:

| Signal | Means | The graph |
|---|---|---|
| `over` / `complete` | every task completed | advances, or finishes |
| `over` / `failed` | the plan was failed, or the wave ended with a task not completed | applies the failure policy |
| `backfill` | still running, and a dispatch pass could start something | re-enters `dispatch` for the same wave (`in-flight`) |
| `wait` | nothing to do yet | is left suspended |

All graph invokes for one run are serialised (`withConductorRun`).

### Dispatch is idempotent

A task moves `pending|retrying → dispatched` through one conditional `UPDATE`
(`claimTask`), and only the caller whose update changed the row starts an
agent. The same statement enforces the caps, which are now caps:
`DEVPILOT_WAVE_MAX_CONCURRENT` (in-flight tasks per plan) and
`DEVPILOT_WAVE_MAX_TOTAL` (across live plans), both counting `dispatched` +
`running`. When the cap admits only part of a wave, critical-path tasks go
first.

### A task that fails its retry ends the run

A failed task is retried once (`DEVPILOT_WAVE_RETRY_LIMIT`). When the retry
fails, under the default `halt` policy:

- the plan goes to `failed`, with `wave_plans.failure_reason` naming the task
  and its error;
- tasks not yet started become `skipped`, in every wave;
- tasks already running are left to finish — their completions are still
  recorded — and nothing new is dispatched;
- the graph is resumed at once with the failure and reaches `fail`.

`GET /api/items/:id/conductor` then reports `status: "failed"`, and
`outcome.failures` names the task. That is what the bridge watcher treats as
terminal, so Linear is told. It also reports a plan whose row is `failed` as
failed even if the graph has not got there.

The graph's own wave retry is set to zero (`waveRetryLimit: 0`): by the time a
wave is reported failed every task in it is terminal, and re-dispatching it
found nothing to send — which is how a run used to hang forever.

### The reconciler

A task learns that its session ended from one in-memory event. Lose that
delivery — a restart, a dead runner — and the task used to sit `dispatched`
forever. The bridge now reconciles when it starts and every
`DEVPILOT_RECONCILE_INTERVAL_SECONDS` (60). For each in-flight task of a live
plan:

- session row `COMPLETE` or `ERROR` (for more than 30s — a fresh one is left to
  the callback that is about to deliver it) → that outcome is applied, as the
  callback would have. The summary and error text travel only in the callback,
  so a reconciled task gets the agent's last message as its summary and a
  generic error;
- session row missing, or silent for longer than
  `DEVPILOT_RECONCILE_STALL_MINUTES` (30) → the task fails as
  `lost: no report since <time>`, so the ordinary retry applies.

It then hands the current wave of every executing plan to its driver, which is
also what starts a wave whose dispatch queued every task — and what re-enters a
run that a restart cut off in the middle of its `dispatch` node. Such a run has
no pending interrupt (it never reached the node that waits), so nothing used to
move it again; `resumeConductorForTask` now sees "no interrupt, and a next node
from `dispatch` onwards" and invokes the graph from its last checkpoint, once
per run per process. Dispatch is idempotent, so the tasks already with an agent
are not sent again.

The bridge — its timer and its first pass — is started outside the async
context of whoever first asks for the orchestrator (`src/lib/orchestrator.ts`).
That first caller is often the graph's own `dispatch` node, and a timer created
inside a LangGraph node carries the node's context into every tick: each
`graph.invoke` it led to was taken for a nested subgraph call, reported
`resumed: true`, and moved nothing.

A task of a **paused** plan is never declared lost. Finished sessions are still
applied; silence is judged once the plan is resumed. Losing a task spends its
retry and can fail the plan, and a paused plan is not to be changed underneath
whoever paused it.

The stall window is generous because a false "lost" starts a second agent on
the same files. Only `claude-session` rows are judged by silence (the runner
heartbeats every 90s); the poll-based modes write the row only on change.
Silence is counted from the later of the session's last report and the cockpit's
start, so downtime is not held against the agent.

`DEVPILOT_RECONCILE=false` turns it off. **The first pass after upgrading acts
on what older builds left behind**: a task still `dispatched` whose session
finished long ago is completed. If that ends a wave of a run still suspended in
the checkpoint store, the run resumes and dispatches its next wave — but only
for a plan that was active within the resume window; see the next section.

### A plan left executing too long is held, not woken

The start-up pass can start agents: it resumes runs, backfills waves and
re-enters cut-off runs. That is right after a restart and wrong for a plan that
was left `executing` weeks ago — a database that has been in use holds several,
and the first start after an upgrade would wake them all.

So the start-up pass first pauses every `executing` plan whose last activity is
older than `DEVPILOT_RESUME_MAX_AGE_HOURS` (default 6; `0` turns the guard
off), and settles nothing for the plans it paused
(`ExecutionBridge.holdStalePlans`). That one place covers every way an agent
could be started without a person: they are all reached from that pass, and a
paused plan is refused by the dispatch claim whoever asks.

- **Last activity** is the latest of the plan row's `updatedAt`, its tasks'
  `startedAt` / `lastAttemptAt` / `completedAt`, and `updatedAt` on the sessions
  those tasks are assigned to. It is read before the pass applies anything.
- The plan becomes `paused`, with `failure_reason` reading `not resumed after a
  restart: no activity since <time>. Resume it from the cockpit to continue.`
  Nothing else about it changes. The conductor route reports the reason as
  `outcome.pausedReason`, and the activity feed has a row.
- Sessions of a held plan that had already finished are still applied to their
  tasks. That is bookkeeping; the driver is not told, so nothing is dispatched,
  merged or advanced.
- Resuming the plan (`POST /api/wave-plans/:id/resume`) clears the reason and
  dispatches what is owed; the next check-in re-enters the run if it was cut
  off.

A plan that goes quiet while the cockpit is running is not held: that is the
stall rule above, and pausing would stop the retry that is its remedy.

### A branch per task, a merge per wave

The session runner can give each task its own git worktree and branch, and
merge a wave's branches into a run branch (`docs/SESSION-RUNNER.md`). This is
the dispatcher's half.

**Decided once, at the plan's first dispatch**
(`WaveDispatchCoordinator.ensureRun`). The plan gets a run id —
`<ticket>-<last six of the wave plan id>`, e.g. `AVA-12-k3x9qd` — and
`isolated`, from whether the runner's `/v1/health` lists the `isolation`
capability. Neither is recomputed. When the answer is no (an older runner, a
runner that did not answer, `http` or `ao-cli` mode) the plan runs in the
shared checkout exactly as before and `isolation_note` says why; a plan is
never half isolated, and never un-isolated silently. A plan that was already
mid-run when the cockpit was upgraded is decided un-isolated without asking:
its earlier waves left their work uncommitted in the shared checkout, and a
worktree cut from the last commit would not contain it. An isolated plan's tasks
are dispatched with `isolation: { runId, taskCode, title }`, and the transport
refuses to send that to a runner that no longer reports the capability.

**What a task reports is written on the task.** The completion callback's
`branch`, `baseSha`, `commitSha` and file lists become `wave_tasks.branch`,
`base_sha`, `commit_sha` and `files_changed`, in the statement that completes
the task. A completion applied by the reconciler has none of them (the session
row does not carry them); the merge fills in the branch and the head.

**A wave is merged before it is over.** `waveSignalFor` does not say `over` for
an isolated plan while a completed task is unmerged — it says `merge` — so
there is no way to read "over" about work the next wave would not find.
`signalForDriver` is the only thing that acts on `merge`, and the only caller
of the runner's `/v1/integrate`: it asks for the wave's completed tasks in
task-code order, records what merged (`wave_tasks.merged_at`, and the run
branch and its head on the plan), and reads the wave again. Every driver asks
it — `driveWave`, `resumeConductorForTask`, and the bridge for a plan nothing
else drives — so the next wave cannot be dispatched until the merge has
returned.

| The runner answers | What happens |
|---|---|
| merged | recorded; the wave is over and the run carries on |
| a task's branch conflicted | that task fails with `merge conflict with the run branch in: <files>`, by the same retry-once rule as any failure. Its retry is cut from the merged head; when it completes the wave is merged again. A task that conflicts on its retry fails the plan |
| it has no branch for a task | that task fails with `no branch was recorded for this task`, same rule |
| the merge could not be done (run branch checked out, runner unreachable, git refused) | the plan fails with `Wave N could not be merged into the run branch: <the runner's message>`. No task is failed or retried for it |

A wave in which nothing completed has nothing to merge; the runner is not
asked and the wave is over (failed) as it always was. When a run ends in
failure, what had completed in that wave is merged so the run branch holds it —
but a sibling still running at that moment finishes later on its own branch
and is **not** merged for a graph-run plan (nothing asks again).

Merging is safe to repeat and safe across a restart: the runner's merge is
idempotent, a wave is due one only while it has a completed task with no
`merged_at`, and every write is pinned to the attempt it read.

**Where the work is.** `GET /api/items/:id/conductor` returns
`outcome.isolation`: for an isolated run the run branch, its head, `pushed:
false` (nothing here pushes; it is not a reading of any remote), each task's
branch, commit and whether it is merged, and a one-sentence `summary`; for a
run that was not isolated, `{ isolated: false, reason }`. On a **failed** run
that sentence is also appended to the text the bridge watcher relays to Linear
and the hosted plane. On a **successful** run it is not relayed yet: the
watcher builds that summary from counts and a file list, with no field for a
sentence. It needs to append `outcome.isolation.summary`.

**What the next task is told.** For an isolated predecessor the prompt lists
the files git says it changed, and — when every predecessor is merged — says
their work is in the checkout. A task that was not isolated keeps the earlier
labels: its reported file list comes from a checkout other agents were writing
to.

---

## The seam

`src/lib/conductor.ts` implements `ConductorPorts` against real DevPilot code:

| Port | Delegates to |
|---|---|
| `generatePlan` | `PlanRefinementService.generateInitialPlan` |
| `refinePlan` | `PlanRefinementService.refineplan` |
| `scorePlan` | `PlanRefinementService.scorePlan` (composes critical path + wave assignment) |
| `persistPlan` | Host-supplied, so the caller controls the transaction |
| `dispatchWave` | `WaveExecutionController.driveWave` — dispatch, move the plan's wave pointer, report `settled` if the wave is already over |
| `endRun` | `WaveExecutionController.completePlan` / `failPlan` |
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
`interrupt()`s after dispatch and checkpoints; the execution bridge resumes it
as tasks report (above). Holding an open promise across that window is how you
lose a run to a restart — which is the exact failure the old controller had.

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

- **The graph**: 21 tests in `packages/conductor-agent/tests/graph.test.ts` —
  threshold gate, refinement budget, discarding a worse refinement, all three
  review decisions, multi-wave sequencing, retry-then-halt, `continue` policy,
  interrupt-driven waiting, adopting an existing plan, token accounting, a
  failed wave reaching a terminal state, never waiting on a wave already over,
  `in-flight` backfill, `endRun`.
- **Advancing, failing and recovering**: `packages/core/tests/wave-dispatch.test.ts`
  and `wave-recovery.test.ts`, against a real SQLite file with the transport
  stubbed — one agent per task under concurrent dispatch, the caps, timings,
  fail-twice, the restart case, the reconciler, the stale-plan guard. They
  drive plans with a stand-in for the graph (`tests/helpers/wave-harness.ts`),
  because core cannot import it; **no test in CI runs the graph and core
  together.**
- **A branch per task, a merge per wave**: `packages/core/tests/wave-isolation.test.ts`
  (same harness, the transport standing in for a runner with the capability) —
  isolation sent for every task, one merge per wave before the next wave
  starts, a conflict retried and re-merged, a second conflict and a failed
  merge each failing the plan, a runner without the capability, and a restart
  either side of the merge. `tests/unit/session-transport-isolation.test.ts`
  covers the HTTP transport against a local server.
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
- **Restart-resumption has not been watched with a real agent.** It was run
  once (October 2026) by script — the real route handlers, graph, `SqliteSaver`
  and core, three separate processes, a fake session runner — and the run
  resumed from its checkpoint in each. That script is not in the repo and not
  in CI, and no cockpit serving real agents has been killed mid-wave.
- **Nothing in "Advancing, failing and recovering" has run against a live
  agent.** Every test substitutes the transport.
- **Isolation through the cockpit has not run with a live agent.** It was run
  once (October 2026) by script — the real route handlers, graph, core, HTTP
  transport and session runner, a real scratch repository, and a stub `claude`:
  a two-wave plan to completion, a conflict retried from the merged head, a
  second conflict and a checked-out run branch each failing the plan, a run
  cut off mid-dispatch re-entered after a restart, and the same run held when
  it was three weeks old. That script is not in the repo and not in CI. (The
  runner's own isolation was run with real agents; see
  `docs/SESSION-RUNNER.md`.)
- **A run cut off before its first checkpoint** — the process dies between the
  conductor route starting a run and the graph writing anything — has no
  checkpoint to re-enter, and a plan cut off while still `approved` is not
  looked at by the start-up pass (it checks in on `executing` plans).
- **A run cut off in a planning node** (`generate`, `refine`, `persist`) is not
  re-entered: those are paid model calls, or write a new plan each time.

---

## Remaining work

1. Point the REFINING zone's *Review Plan* / *Re-plan* buttons at
   `POST /api/items/[id]/conductor` with a `decision`.
2. Run the planning half live once a key is available.
3. Kill the server mid-wave, with real agents running, and confirm the run
   resumes from its checkpoint.
4. Only then delete what is left of the old driver: `approve` and
   `onTaskComplete` (no callers), and `handleWaveComplete` with the bridge's
   legacy branch — which still serve plans dispatched through
   `/api/wave-plans/:id/dispatch`. `onTaskFailed` stays; it is the retry rule,
   not a driver. `autoAdvanceWave`, the third and never-called advancement
   path, is already gone.
