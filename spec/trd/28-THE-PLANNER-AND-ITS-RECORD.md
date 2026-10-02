# TRD 28 — The Planner, and the Record It Needs
## A review of the wave planner as built, what was fixed, and the path to a planner that learns from its own outcomes
### v0.1 · October 2026 · Status: PART BUILT — §6 is in the tree; §7–§9 are design

---

## 1. The questions asked

1. Review the wave planner and its harness hard, and improve them.
2. Are we recording the planner's reasoning as telemetry, by default?
3. The goal behind both: accumulate a corpus about *planning*, with per-session
   and per-task outcomes as labels, to fine-tune a planning model of our own —
   or to sell an enterprise licence that tunes the planner to one
   organisation's codebase and style.

**The answers, in six lines:**

- **Nothing about planning was being recorded** except the text of the plan that
  won. Not the prompt, not the context, not the plans that were tried and
  dropped, not the model, not what a reviewer sent back. It is now (§6).
- **The planner's reasoning cannot be recorded as such.** The model thinks by
  default and the API returns that thinking empty unless a summary is asked
  for; a summary is all there is to keep (§3.2).
- **The outcome side was already there**, task by task, and is richer than it
  looked: attempts, errors, the files each task really changed, merges, cost.
  It had never been joined to the plan that caused it. It is now.
- **The planner has structural problems that a corpus would only measure.** The
  two largest: its quality gate rewards the number of tasks rather than a good
  plan, and it plans without being able to read the repository (§4).
- **Anthropic's terms restrict training a competing model with their service's
  output** (§9.1, quoted). That shapes what the corpus can be used for and has
  to be settled before the fine-tuning half of the goal, not after.
- **So the order is: record, measure, fix what the measurements show, then
  learn** — and the first three steps of "learn" need no model training at all
  (§9).

---

## 2. What was checked, and how

Done 2 October 2026 against `main` (`df75596`).

- **Read in full:** every file under `packages/core/src/wave-planner/` on the
  generation path (generator, AI client, prompt constructor, the three
  templates, parser, validator, critical path, wave assigner, scorer,
  refinement service, code-graph and work-history modules), the schema, the
  conductor graph (`packages/conductor-agent`), and the app's wiring
  (`src/lib/conductor*.ts`, the conductor and re-plan routes).
- **Mapped by search, then spot-checked:** every caller and configuration
  variable; what each table stores; what crosses to the hosted plane; the
  benchmark suite. Claims from that map that this document relies on were
  re-read in the code; where one was not, it says so.
- **Run:** the scorer, critical path and assigner on seven small plans (§4.1's
  table is that output); the new code's 48 tests; the cockpit against a
  throwaway database, read back through the new route and CLI command.
- **Not run:** the model. No planning call was made — every call costs money
  and none was needed to establish what is below. Nothing here is a
  measurement of plan quality on real work; §10 says what that leaves open.
- **Read from the source:** the API behaviour in §3.2 from Anthropic's API
  reference as bundled with Claude Code's API skill (not from a live call); the
  SDK's non-streaming limit from the installed SDK (0.112.3); the terms in
  §9.1 from anthropic.com on the day.

---

## 3. How the planner works today

### 3.1 The pipeline

```
ticket / horizon item
   │  buildSpecContentForItem: title + description (+ existing plan rows)
   ▼
PromptConstructor ── fleet context     active sessions and in-flight files, from SQLite
   │               ── codebase context   a depth-3 file tree + filenames changed in the last week
   │               ── memory             MemPalace recall, when a memory service is attached
   ▼
one user message ──► planning model ──► markdown: a table per wave, a mermaid graph, statistics
   ▼
parser (regex over tables) ──► validateDAG ──► scorePlan
   │                                               │ parallelization = 1 − criticalPath / tasks
   │        ┌──────────── below threshold ─────────┘
   │        ▼
   │   refinement prompt ("break work smaller") ──► model ──► kept only if the score rose
   ▼
human review (conductor graph interrupt): approve · refine with constraints · abort
   ▼
persist: critical path, code-graph read, assignWaves (file conflicts, dependent claims, capacity)
   ▼
dispatch wave by wave ──► one agent session per task ──► completion report onto wave_tasks
```

Two entry paths share this. The **conductor graph** is the one every ticket
from the bridge takes: generate, refine and review are graph nodes and the run
is checkpointed. The **direct route** (`/api/items/:id/wave-plan/generate`)
calls `generateAndRefine` in one go.

### 3.2 The model call

`WavePlannerAIClient.generatePlan` sends `model`, `max_tokens` and a single
`user` message. No system prompt, no tools, no caching, no streaming, no
structured output.

- **Model:** `claude-opus-5` by default (`models.ts`), overridable by
  `WAVE_PLANNER_MODEL`.
- **Thinking:** no `thinking` parameter is sent. On this model that does not
  mean "off": per Anthropic's API reference, thinking is on by default
  (adaptive) on Opus 5, at high effort, and the thinking text is **omitted by
  default** — the block arrives empty unless the request sets
  `display: "summarized"`, and what that returns is a summary. The client keeps
  text blocks and drops the rest.
- **So, on "are we recording the reasoning":** there is no reasoning to record
  in what comes back today, and the most that could be asked for is the
  model's summary of it. A *decision record* — assumptions, why this split,
  what was left out — has to be asked for as part of the plan (§7.2). That is
  also more useful to a reviewer than a chain of thought.
- **The ceiling:** `max_tokens` covers thinking as well as the plan. It was
  8,192 for both.

---

## 4. Findings

Ranked by what they cost. "Fixed" means in this change; "§7" means designed
below and not built.

### 4.1 The quality gate rewards task count, not plans — partly fixed

The only automatic judgement of a plan is `1 − criticalPath / tasks`, and a
plan below the threshold is sent to a prompt whose advice is to split work
smaller. A refinement is kept if and only if that number rose.

Measured on the planner's own scorer, critical path and assigner:

| Plan | Tasks | Critical path | Waves it runs in | Score |
|---|---:|---:|---:|---:|
| One task | 1 | 1 | 1 | **0.00** |
| Two in sequence | 2 | 2 | 2 | **0.00** |
| Three in sequence | 3 | 3 | 3 | **0.00** |
| Two independent | 2 | 1 | 1 | 0.50 |
| The three-chain, plus two trivial side tasks | 5 | 3 | 3 | 0.40 |
| The three-chain, each step cut in two | 6 | 3 | 3 | 0.50 |
| Two "independent" tasks on one shared file | 2 | 1 | **2** | 0.50 |

What that shows:

- **A specification that is one change scores 0** and was sent back, to the
  iteration limit, to be cut up. Splitting always raises the score, so a
  refinement that splits is always kept. *Fixed:* plans of fewer than four
  tasks are not held to the gate.
- **The number can be raised without making anything faster.** Rows 5 and 6
  run in the same three waves as the chain they started from.
- **It cannot see the serialisation it claims to measure.** Row 7 scores 0.5
  and runs in two waves, because the critical path counts dependencies and the
  assigner separates on files.
- **Two thresholds.** The direct route read `WAVE_PLANNER_MIN_PARALLELIZATION`
  and defaulted to 0.3. The conductor graph took its own default, 0.7, and read
  no setting. So every bridged ticket was held to "the critical path is at most
  30% of the tasks": ten tasks in four waves scores 0.6 and was refined twice —
  three calls to the most expensive model where one would do. *Fixed:* one
  resolver, 0.3, on both paths.
- **The refinement prompt named a third number** — "Target: 80%+" — whatever it
  was being held to. *Fixed:* it names the real one.

Each extra task is a whole agent session, with its own context to load. A gate
that manufactures tasks therefore plausibly *raises* the cost of a run while
reporting a better score. That is reasoning, not a measurement; `devpilot
planner stats` now reports how often refinement fires and how often it scores
higher, and the outcomes are there to compare (§6).

The gate's replacement is §7.3. Until then the gate should spend as little as
it can, which is why the looser threshold was kept.

### 4.2 The planner plans blind — §7.1

It is shown a file tree three levels deep and the names of files changed in the
last week. It cannot open a file, search, or ask the code graph anything. Every
file path in a plan is a guess from names — and the plan's one safety property,
that two tasks which touch the same file do not run together, is computed from
those guesses.

Two further facts make it worse than it sounds:

- **The tree may be of the wrong repository.** `workingDir` is
  `DEVPILOT_WORKING_DIR ?? process.cwd()` on the conductor path and
  `WORKING_DIR || process.cwd()` on the routes — the cockpit's own directory,
  under two different variable names. The repository a ticket is for is known
  by name; only the session runner knows where it is checked out (which is why
  the code-graph read goes through the runner). A cockpit serving two
  repositories shows the planner the same tree for both.
- **The code graph and the work history never reach the model.** The graph is
  read *after* the plan is written, to re-sequence it. The work history
  (TRD 27 §4) is given to agents, not to the planner.

Nothing checks that a file named in a plan exists.

This is now measurable: an episode's `files.precision` and `files.recall`
compare what each task was planned to touch with what it changed, and
`sameWaveCollisions` counts pairs in one wave that changed the same file
anyway.

### 4.3 A plan says too little for the agent that runs it — §7.2

A task is one table cell — "1–2 sentences" — plus file names. There is no
acceptance criterion, no command that would show the task is done, no statement
of what one task produces that another consumes, no assumptions, nothing ruled
out of scope. The worker prompt has an "Acceptance Criteria" section; the
dispatch coordinator never passes it anything.

The format is markdown tables read by regular expressions. Two incidents are
written into the parser's comments (an escaped pipe shifting file paths into
the wrong column; a row cut off at the token ceiling becoming a task with no
description). Both were patched; the class of bug is the format.

### 4.4 Nothing about a planning decision was kept — fixed

See §5. The planner's own specification (`spec/WAVE-PLANNER.md`) says to "log
all failures with full prompt/response". Nothing did.

### 4.5 Execution does not come back — partly fixed

- **A re-plan was not told what had happened.** `reoptimize` built the lists of
  completed and remaining tasks and passed the prompt their *counts*, as two
  sentences; the completion summary it built was the task's label with
  "Completed task:" in front, though the agent's real summary and the files it
  really changed were on the row. *Fixed.* (The re-plan route is still only
  reachable by hand: the one component that calls it posts no body and is not
  mounted. An automatic re-plan on a failed wave is §7.4.)
- **A retried task is not told why it is being retried.** The retry is
  dispatched with the same prompt; the previous attempt's error — a merge
  conflict naming the files, say — is on the row and not in it. §7.4.
- **A finished run's figures were never written.** `collectFinalMetrics`
  inserted with "do nothing on conflict" against a row every generated plan
  already had. `wave_plan_metrics` said zero tasks completed about every run.
  *Fixed* (an upsert); found by the mapping pass and confirmed in the code.
- **Estimates are never checked.** "S: 5–15 minutes", "haiku for simple tasks"
  are the prompt's assertions. Durations, attempts and cost per task are
  recorded and never compared with them. §7.4.

### 4.6 The call leaves quality and money on the table — partly fixed

- **Truncation.** The 8,192 ceiling was shared with thinking. *Fixed:* 16,000,
  one resolver, still under the size at which the SDK refuses a non-streaming
  request (above 21,333 tokens).
- **A truncated answer was retried four times.** The error had no status code,
  so it took the full backoff ladder — the same prompt, the same ceiling, the
  same cut — and was then reported as "Claude API call failed". *Fixed:* its
  own error type, not retried, and recorded with what it cost.
- **No caching.** A refinement resends the specification and the whole context.
  With a system prompt and a cache breakpoint those tokens are read at a
  fraction of the price. The client reported cache tokens as a hard-coded zero;
  *fixed* to report what the API says, so the saving will be visible when it
  exists. §7.5.
- **Context is rebuilt for every call**, so an initial plan and its refinement
  can be made against different fleet states.

### 4.7 The prompt steers toward bad decomposition — §7

"Break work into the smallest independent units possible." "Prefer creating new
files over modifying existing files when possible (less conflict)." "Consider
test files as separate tasks." Each trades the coherence of a change for
parallelism: a new file to dodge a conflict is a design decision made by a
scheduler, and a task whose tests are another task's job ships untested.

These were **not** changed. A prompt change with no way to tell whether plans
got better is a guess; §7.6 is the way to tell.

### 4.8 Dead and misleading configuration — partly fixed

- `.env.example` pinned `WAVE_PLANNER_MODEL` to a model id the code's own
  comments record as retired (it returns 404), and listed seven
  `WAVE_PLANNER_*` variables that nothing reads. *Fixed.*
- Never set by any caller: `template` (so the "simplified" template is
  unreachable), `useSimplifiedOnRetry` (never read), `maxConcurrency`,
  `preferModel`, `maxCost`, `maxTasksPerWave`. The fleet's capacity in the
  prompt is the constant `MAX_WORKERS_PER_REPO = 4`. In-flight files are read
  for every repository and listed as files to avoid in this one.
- The fallback, when every call fails, turns the specification's bullet points
  into a one-wave "plan" with no files, persisted in the same shape as a real
  one.

### 4.9 There is no evaluation of plan quality — §7.6

No test makes the model call or compares a plan with a known-good one. The
benchmark suite has ground-truth plans and a 25% "wave plan quality" component
— and **does not use this planner**: it has its own inline prompt and parser
and spawns `claude` directly (with `--dangerously-skip-permissions`). The
number it produces says nothing about the planner that ships.

---

## 5. What is recorded

| | Before | Now |
|---|---|---|
| Prompt sent, with its context | no | `planner_traces.prompt` |
| Template name and version | no | yes |
| Model asked for, model that answered | no | yes |
| Raw response of the plan that won | `wave_plans.raw_markdown` | and on its trace, marked `chosen` |
| Responses that lost, were invalid, or failed | no | yes, with the reason |
| Tokens (in, out, cache), latency, stop reason | returned over HTTP, not stored | yes |
| Score, and for a refinement whether it rose | parallelization only, winner only | whole score, every call |
| Reviewer's decision and constraints | LangGraph checkpoint only | `planner_reviews` |
| Reasoning | no | no — see §3.2 |
| Task outcome: status, attempts, error, files changed, merge, cost | yes (`wave_tasks`, sessions) | joined to the plan's calls |
| A run's final figures | written as zeros, never updated | written |
| Harness profile per session | in the session's telemetry JSON | unchanged; not yet on the episode |
| Earlier attempts of a retried task | latest only | unchanged |
| Whether the code was right (tests, review, revert) | no | no — §10 |

---

## 6. Built in this change

All local, all additive, all behind tests.

- **`planner_traces`** — one row per call to the planning model, valid, invalid
  or failed. **`planner_reviews`** — one row per review decision. When a plan
  is persisted, every unclaimed row for the item takes its id and the call
  whose answer it is is marked. (`wave-planner/trace.ts`)
- **Episodes** — the join to outcomes, and the figures a run is judged by:
  first-attempt pass rate, planned-versus-changed file precision and recall,
  same-wave collisions, retries, merge conflicts, wall clock, cost. Pure and
  tested. (`wave-planner/planner-corpus.ts`)
- **`GET /api/planner/episodes`**, **`devpilot planner stats`** and
  **`devpilot planner export`** — read it back. `--no-text` removes every
  prompt, plan, description, constraint, error and path and keeps shape and
  figures.
- **Never in the way:** recording catches everything, warns once, and is off
  with `DEVPILOT_PLANNER_TRACE=0`.
- **The fixes marked above:** the small-plan exemption and one threshold on
  both paths; the truthful refinement target; the token ceiling; no retry and a
  proper record for a truncated answer; a re-plan that carries what happened;
  the metrics write; real cache token counts; `.env.example`.

**It stays on the machine.** A prompt holds the specification and the file
tree. Nothing in this change sends any of it anywhere, and the hosted plane's
public statement is unaffected. Whether any of it should ever leave is §8 and
is not decided here.

**Behaviour that changes for a user:** fewer planner calls per ticket on the
bridge path (the threshold), and no automatic splitting of small plans. A
reviewer can still send any plan back.

---

## 7. Planner v2 — design

In the order I would build it. Each step is measurable against the record §6
creates, which is the reason §6 came first.

### 7.1 Ground the planner in the repository

1. **Context from the right checkout.** Ask the session runner — the thing that
   knows where the repository is — for the tree, as the code-graph read already
   does. Retire both `WORKING_DIR` variables.
2. **Check every path a plan names** against that checkout: exists, or its
   parent does for a file to be created. A plan naming files that do not exist
   is a defect the reviewer sees and the refinement prompt is told about.
3. **Let the planner look.** Read-only tools served by the runner, with a
   budget: list a directory, read the head of a file, search, the code graph's
   neighbours of a file, the work history of a path. This turns one blind call
   into a short agent loop. It is the largest change here and the one most
   likely to move `files.recall`.

### 7.2 A plan contract worth executing

Structured output against a schema instead of tables. Per task: title, intent,
files with the operation on each, dependencies *with the reason for each*,
acceptance criteria, a command that verifies it, what it produces that others
consume, complexity, risk. Per plan: assumptions, open questions, out of scope,
and a short rationale for the decomposition.

- The parser and its class of bugs go away.
- The acceptance criteria and verify command go to the worker prompt, which
  already has the section for them.
- The rationale and assumptions are the "reasoning" worth recording: written
  for a reviewer, attributable, and comparable across plans.

### 7.3 A gate that checks plans

Replace the ratio with checks that are true or false: paths exist; the graph is
acyclic; every requirement in the specification is covered by some task (a
critic pass, cheap model); no task names more files than it can sensibly own.
Refine only on a named defect, and say which. Keep the parallelization figure
as a thing a reviewer is shown, not a thing a loop optimises.

### 7.4 Close the loops

- A retry is told why the last attempt failed.
- A failed wave or a merge conflict triggers a re-plan of what is left, with
  the completed work, the real changed files and the errors — which §6's fix
  makes possible.
- **Calibration:** from the outcomes, per repository — what S, M and L actually
  took, first-attempt pass rate by recommended model, how often a plan's file
  list was wrong. Fed to the prompt as facts about this codebase. This is the
  first place the planner learns, and it is a table, not a model.

### 7.5 The call

System prompt and a cache breakpoint after the stable context; streaming, so
the ceiling stops being a cliff; `effort` set deliberately rather than
defaulted; `display: "summarized"` only if a reviewer is to be shown progress.

### 7.6 An evaluation before any of the above ships

- **Replay:** re-run recorded prompts against a candidate template or model and
  compare validity, shape, and — where the original ran — its file predictions
  against what really changed. Costs model calls; needs a budget and a yes.
- **The benchmark suite calls the real planner.** Today it measures a different
  one.
- A prompt or protocol change lands with a replay result or not at all.

---

## 8. The corpus — design

### 8.1 The unit

One **episode** per plan (`devpilot.planner-episode/1`): the calls that led to
it, the reviews, the plan with each task's ending, and the outcome figures.
Runs that never produced a plan are episodes with no outcome.

### 8.2 What the labels are, and are not

The outcome figures say how a plan *ran*. They are the part of quality a
planner is directly responsible for, and they are honest. They do not say the
code was right. The labels worth adding, in order of value:

1. **The reviewer's decision** — recorded now. A plan sent back, with the
   constraint in the reviewer's words, is the strongest signal available before
   anything runs.
2. **Whether the work was kept:** the run branch merged, the PR merged, or
   reverted. Not recorded anywhere today.
3. **Tests:** the completion report has no test field.
4. **Hand edits to a plan** before approval — overwritten in place today.

### 8.3 Where it may live — four tiers, and who decides

| Tier | What | Where | Default |
|---|---|---|---|
| 0 | Full episodes | the user's own machine | **on** (built) |
| 1 | Shape and figures only — what `--no-text` leaves | hosted | a decision |
| 2 | Full episodes, for that workspace's planner only | hosted, per workspace | **opt-in**; the enterprise product |
| 3 | Contributed to a shared DevPilot corpus | hosted | **opt-in**, separate, revocable |

Three things that bear on this:

- **The hosted plane already holds a good part of an episode** for hosted
  workspaces: the plan's structure with task descriptions and file paths
  (`session_plans`), the reviewer's commands including re-plan constraints
  (`session_commands`), and how the run ended. It was collected to show a
  workspace its own fleet. Using it to train anything is a different purpose,
  and should be a different consent — not a quiet reinterpretation.
- **The public statement says what the cloud receives** ("Plans: task
  descriptions and the file paths they touch") and the telemetry route's own
  comment makes any addition "a change to the security page, the FAQ and
  llms.txt in the same pull request". A prompt — specification plus file tree —
  is a new kind of data. Tier 2 and 3 are that change, made openly.
- **"By default" is the wrong default for tiers 2 and 3.** An enterprise buyer
  will ask exactly this question, and "we collect your specifications to train
  our model unless you opt out" loses the sale that "your planner is tuned on
  your data, in your tenancy, and nowhere else" wins.

---

## 9. From a corpus to a planner that learns

### 9.1 The constraint to settle first

Anthropic's Commercial Terms of Service (effective 17 June 2025), §D.4:

> "Customer may not and must not attempt to (a) access the Services to build a
> competing product or service, including to train competing AI models or
> resell the Services except as expressly approved by Anthropic; (b) reverse
> engineer or duplicate the Services; or (c) support any third party's attempt
> at any of the conduct restricted in this sentence."

The Consumer Terms (effective 8 October 2025), §3, prohibit use "to develop any
products or services that compete with our Services, including to develop or
train any artificial intelligence or machine learning algorithms or models".
The planner calls the API under the commercial terms; the agent sessions
usually run under a user's Claude subscription.

Whether a fine-tuned *planning* model is a "competing AI model" is a legal
question and not one this document answers. What it does say:

- **Every plan in the corpus is Claude's output**, and so is every completion
  summary. A model trained to reproduce them is the case the clause describes.
- **What is ours regardless of which model wrote the plan:** the reviewer's
  decisions, the outcome figures, and the specification.
- **"Except as expressly approved"** is an invitation to ask. That is a
  conversation to have with Anthropic before building toward a fine-tune, and
  cheap compared with building first.

### 9.2 The ladder

Each rung works without the one above it, and the first three train no
generative model.

1. **Measure** (built). How often refinement helps; how well plans predict
   files; first-attempt pass rate. Decide §7's order from the numbers.
2. **Retrieve.** Put this repository's most similar past episodes — the plan,
   what the reviewer changed, how it ran — in front of the planner. Per-org
   adaptation with no training, local, and available as soon as a workspace
   has history. This is the enterprise offer's first version.
3. **Calibrate.** §7.4's tables.
4. **Rank.** Generate several plans; choose with a small model that predicts
   first-attempt pass and collisions from a plan's features. Trained on
   outcomes and reviews, not on plan text.
5. **Generate.** A fine-tuned planner. Needs §9.1 settled, and far more
   episodes than one machine produces — how many is an empirical question
   nobody here has measured.

**The enterprise licence** is rungs 2–4 scoped to one organisation, on its own
episodes, in its own tenancy. It does not need rung 5 and does not need
anyone's data but the customer's.

---

## 10. Open, and not verified

**Decisions that are Garrett's:**

- Whether shape-only planner figures (tier 1) go to the hosted plane, and what
  the public statement then says.
- Whether to open the Anthropic conversation in §9.1 now.
- A budget for replay evaluation (§7.6) — it is the gate for every prompt
  change.

**Not verified:**

- No planning call was made. The token ceiling fix follows from how the API
  counts thinking; that 8,192 was the cause of the truncations seen before is
  inferred, not shown. The record now keeps `stop_reason` and output tokens, so
  the next truncation will say.
- That fewer, larger tasks cost less than more, smaller ones (§4.1) is an
  argument. The record makes it testable.
- The retry prompt (§4.5) and the unset configuration (§4.8) were established
  by search and a read of the dispatch coordinator, not by running a retry.
- MemPalace's tables are not in the runtime schema bootstrap; whether memory
  recall works on a database the CLI created was not tested.
- A plan's episode names only the latest attempt's session; the cost of earlier
  attempts of a retried task is not in it.
