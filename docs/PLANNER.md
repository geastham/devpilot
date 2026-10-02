# The planner's record

The cockpit keeps a record of every plan it makes: what it asked the planning
model, what came back, what a reviewer decided, and how the plan then ran.

It exists so the planner can be judged by its results. Before it, the only
thing kept of a planning call was the plan that won.

**The record stays on your machine.** It is in the cockpit's own database
(`.devpilot/data.db`). The prompts, the plans, what a reviewer wrote, what
agents said — none of it is sent anywhere.

**One thing derived from it is sent**, if this machine is connected to the
hosted plane: when a run ends, a row of *figures* about its plan — counts,
durations, cost. No text and no path. See [What goes to the hosted
plane](#what-goes-to-the-hosted-plane).

---

## What is recorded

**Every call to the planning model** (`planner_traces`), whether it produced a
valid plan, one that was rejected, or no answer:

- the prompt exactly as sent — which includes the ticket's specification, a
  three-level file tree of the working directory, files changed in the last
  week, and any memory that was recalled
- the template and its version; the model asked for and the model that answered
- the response, its stop reason, tokens in and out, and how long it took
- whether it parsed and passed validation, and if not, why
- its score, and for a refinement whether it scored above the plan it was given

**Every review decision** (`planner_reviews`): approved, sent back (with the
constraints as written), or abandoned.

**How the plan ran** was already recorded, task by task — status, attempts,
errors, the files each task changed, when it merged, what its session cost.
The record joins the two.

**Not recorded:** the model's reasoning. The API returns it empty unless a
summary is requested, and the planner does not request one.

## Turning it off

```
DEVPILOT_PLANNER_TRACE=0
```

Nothing is written while it is set. Recording never fails a planning run: if
the record cannot be written, planning carries on and one warning is printed.

## Reading it back

```
devpilot planner stats                 # the last 90 days, at a glance
devpilot planner stats --days 30 --json
devpilot planner export --out episodes.jsonl
devpilot planner export --out shape.jsonl --no-text
```

Both read the local cockpit (`devpilot serve` must be running).

`stats` prints, for the plans in the window:

| Figure | What it counts |
|---|---|
| Calls | valid, rejected, failed; how many were cut off at the token ceiling |
| Refinements | how many were made, and how many scored above the plan they were given |
| Reviews | approved, sent back, abandoned |
| First-attempt rate | of tasks that were dispatched and have ended, the share that completed without a retry |
| Files named → changed | of the files a plan said its tasks would touch, the share that were changed |
| Files changed → named | of the files tasks changed, the share the plan had named |
| Same-wave collisions | pairs of tasks in one wave that changed the same file |

**These say how plans ran. None of them says whether the code was right.** A
plan whose tasks all finished cleanly and built the wrong thing scores
perfectly here.

`export` writes one JSON object per line (`devpilot.planner-episode/1`): the
calls, the reviews, the plan with each task's ending, and the outcome figures.
The file is created readable only by you.

- With text (the default) it holds specifications, the file tree, plans,
  review notes and agents' summaries. Treat it as you would the code.
- `--no-text` removes every prompt, plan, description, constraint, error and
  path, and keeps shape and figures. Paths are replaced by placeholders, not
  hashes: a hash of a path is the path to anyone who can guess it.

## What goes to the hosted plane

When a run that came through the bridge ends, the bridge asks the cockpit for
the plan's figures and passes them on. You can see exactly what would be sent:

```
curl 'http://127.0.0.1:3847/api/planner/figures?itemId=<item id>'
```

They are: how many planner calls the plan took (valid, rejected, failed, cut
off) and their tokens; refinements and how many scored higher; how many times
a reviewer approved it, sent it back or abandoned it; the plan's task and wave
counts; how it ended; tasks completed, failed, retried, unmergeable, and how
many finished first time; how many files the plan named, how many its tasks
changed, and how many were both; same-wave collisions; wall clock, cost and
tokens; and three identifiers — the model that wrote the plan, and the prompt
template's name and version.

They are not, and cannot be: the prompt, the planner's answer, the
specification, a task's description, a file path, a reviewer's words, an error
message or an agent's summary. `PlannerFigures` in
`packages/core/src/wave-planner/planner-corpus.ts` is built field by field from
counts and has no field for any of those; the hosted route refuses a body with
any key it does not know, and its table has no column for text.

To send nothing:

```
DEVPILOT_PLANNER_FIGURES=0
```

set where the bridge runs. This is separate from `DEVPILOT_PLANNER_TRACE`:
that one stops the local record being written at all.

## The route

`GET /api/planner/episodes?days=90&text=full|none` on the local cockpit returns
`{ since, summary, truncated, episodes }`. At most the 500 most recent plans
are included; `truncated` says when there were more.

## Settings that affect planning

| Variable | Default | |
|---|---|---|
| `WAVE_PLANNER_MODEL` | `claude-opus-5` | the planning model |
| `WAVE_PLANNER_MAX_TOKENS` | `16000` | output ceiling; it covers the model's thinking as well as the plan |
| `WAVE_PLANNER_MIN_PARALLELIZATION` | `0.3` | a plan of four or more tasks scoring below this is sent back for refinement |
| `DEVPILOT_PLANNER_TRACE` | on | `0` records nothing locally |
| `DEVPILOT_PLANNER_FIGURES` | on | `0` sends no plan figures to the hosted plane (read by the bridge) |
| `DEVPILOT_PLANNER_DUMP_DIR` | unset | also write each raw response to a file here |

The design behind this, and what is planned next, is
`spec/trd/28-THE-PLANNER-AND-ITS-RECORD.md`.
