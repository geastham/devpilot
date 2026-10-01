# The Conductor Score

How the number is computed, what it leaves out, and when it means something.

This describes **model version 2**. (Version 1 was a pair of counters — points
added for a completion, taken away for a failure — and no dimension was
computed by its method. Scores from it are not comparable with these.) The definitions here are the ones in
`packages/core/src/score/model.ts` (weights and method text) and
`packages/core/src/score/compute.ts` (the arithmetic). The quoted method for
each dimension below is copied word for word from the code, which is also what
the score API returns; a test fails if this document and the code disagree.

**Status.** From CLI 0.6 the local cockpit computes its score this way, on
request, from the sessions, wave tasks and runway readings it recorded
(`src/lib/score.ts`); `GET /api/score` returns it with every dimension's
working, and the top-bar pill and `devpilot status` show it. Nothing is stored
and incremented. The hosted plane does not compute or rank a score. The test
for any surface is simple: a score produced by this method always says, per
dimension, whether it was measured. A bare total with no such breakdown did not
come from here.

**Where each dimension's evidence comes from.**

| Dimension | Read from |
|---|---|
| Runway health | A runway reading taken about once a minute while the cockpit runs |
| Fleet utilization | Each dispatched session's start and end; capacity from `DEVPILOT_FLEET_CAPACITY`, else the session runner's own concurrency limit |
| Plan accuracy | Each wave task's size (S/M/L/XL), start and end |
| Cost efficiency | The session runner's final reading for each dispatched session |
| Velocity trend | When each dispatched session completed |
| Parallelization quality | Each wave task's start, end and dependencies, and the files it changed (from git when the task ran on its own branch) |

Only work DevPilot dispatched is scored. Sessions you started yourself, which
the bridge merely observes, are not part of any dimension.

The default window is the last 7 days; `GET /api/score?hours=N` looks back N
hours instead.

---

## What the score is for

Running a fleet of coding agents is a different job from writing code. The
work is deciding what to build next, splitting it into pieces that can run at
once without colliding, and keeping enough of it planned that no agent sits
waiting for you. The Conductor Score is an attempt to put a number on how well
that job was done over a stretch of time.

It is a number out of 1000, made of six parts. The parts are not equally
weighted, on purpose: keeping the fleet supplied with work is treated as the
largest part of the job, and saving money as one of the smallest. That
weighting is an opinion. It is stated so that it can be argued with.

A score is only as good as its method, so the method is public, and so are its
weak points. Each section below says how the dimension can mislead. Those
sections are part of the definition, not caveats to it.

## The six dimensions

| Dimension | Points | What it asks |
|---|---|---|
| Runway health | 250 | How consistently you kept work queued ahead of the fleet |
| Fleet utilization | 200 | How much of your agent capacity was actually working |
| Plan accuracy | 200 | How close your plan estimates landed to what actually happened |
| Cost efficiency | 150 | Saving against running everything on the most expensive model |
| Velocity trend | 100 | Whether your throughput is rising or falling |
| Parallelization quality | 100 | How well your plans exploited work that was genuinely independent |
| **Total** | **1000** | |

Every dimension is computed the same way in outline:

1. Work out a ratio between 0 and 1 from recorded events.
2. Clamp it to that range. Nothing can score below zero or above its maximum.
3. Multiply by the dimension's points and round to a whole point.

If the events needed for step 1 were not recorded, the dimension is
**unmeasured**. It is not scored as zero and it is not given a default.

Three dimensions are measured over a **scoring window** — a start time and an
end time: runway health, fleet utilization and velocity trend. The other three
are computed from the tasks, spend and plans that fall in the same period.

---

## Runway health — 250 points

*How consistently you kept work queued ahead of the fleet*

> Time-weighted mean of min(1, runway hours ÷ 4) over the scoring window, where 4h is the amber threshold: runway held at or above 4h is full marks. Each runway sample holds until the next one, for at most 15 minutes; time before the first sample, and time when sampling had stopped, is left out rather than counted as empty or as full. Unmeasured with fewer than 2 samples or less than 60 minutes of sampled time. Runway itself is an estimate (queue length × a fixed duration per item), and this dimension inherits that.

**Formula.** At each moment, health is `min(1, runway hours ÷ 4)`. The ratio is
the time-weighted mean of health over the covered time:

```
ratio = ( Σ min(1, runwayᵢ ÷ 4) × holdᵢ ) ÷ covered time
```

Runway is read from samples, which the cockpit takes about once a minute while
it is running. Each sample is taken to hold until the next one, or until the
end of the window — but for no longer than 15 minutes. The covered time is the
time some sample is holding.

The limit is there because readings stop when the cockpit stops, not when the
queue changes. Without it, closing the cockpit on a full queue would credit a
full queue until the window ended: a night of perfect runway nobody observed.
Time past a reading's hold is left out — not counted as full, and not counted
as empty either.

Four hours is the point at which the cockpit starts warning that runway is
getting short. Scoring against the same line means the number and the warning
agree about what "enough" is. Runway above four hours earns nothing extra:
forty hours of queued work is not ten times healthier than four, and paying for
it would reward stockpiling plans that go stale.

**Unmeasured when** there are fewer than 2 runway samples in the window, or
when they cover less than 60 minutes between them. Two readings a minute apart
describe a minute; an hour is the least that can be called "how consistently".

**Known limits.**

- **Runway is itself an estimate.** Today it is the number of queued items
  multiplied by a fixed duration per item, plus the estimated time left on
  running sessions. It is not a measurement of how long the queued work will
  really take. This dimension inherits that: it measures how consistently the
  *estimate* stayed above four hours, and queueing many small items raises it.
- **It only sees the time runway was being sampled.** Time before the first
  sample, and time when sampling had stopped, is left out. A week in which the
  cockpit ran for one good hour is scored on that hour. The number of unobserved
  hours is reported beside the score so this can be seen.

## Fleet utilization — 200 points

*How much of your agent capacity was actually working*

> Time-weighted mean of min(1, active sessions ÷ capacity), taken from the first session start to the last session end inside the window, leaving out any stretch of more than 30 minutes with nothing running — so the time before the first dispatch, after the last finish, and overnight is not counted as idle, and a short gap between tasks is. A RATIO, never a count — otherwise the score would reward buying more agents rather than conducting them well. Unmeasured with no sessions or no declared capacity.

**Formula.** At each moment, busy is `min(1, active sessions ÷ capacity)`. The
ratio is the time-weighted mean of busy over the working span:

```
ratio = ( ∫ min(1, active(t) ÷ capacity) dt ) ÷ working span
```

The **working span** runs from the earliest session start to the latest session
end inside the window, less any stretch of more than 30 minutes in which
nothing was running. It is not the whole window. If you dispatched work between
nine and five, the hours before nine and after five are not idle capacity, and
neither is the night between two working days.

A gap of thirty minutes or less with nothing running **is** counted, in full.
The few minutes between one task finishing and the next being dispatched are
the idleness this dimension exists to mark down. Thirty minutes is a
judgement, like the four-hour runway line; it is stated so it can be argued
with.

It is a ratio and not a count. Doubling the number of agents and doubling the
work leaves it unchanged; adding agents that sit unused lowers it. Running more
sessions than the declared capacity earns nothing extra. Without this, the
score would rank the size of someone's fleet.

A session still running at the end of the window is counted up to the end of
the window.

**Unmeasured when** no session ran inside the window, or when fleet capacity is
not recorded as a whole number of at least 1.

**Known limits.**

- **The thirty-minute line is a cliff.** A gap of 30 minutes counts as idle in
  full and one of 31 is not counted at all, so waiting out the line costs
  nothing. The dimension marks down short gaps between tasks and cannot tell a
  long lunch from a fleet left waiting.
- A session that is open but waiting on a person counts as working, unless the
  record shows where the work stopped.
- A single short session on a one-agent fleet scores full marks. The dimension
  says how full the fleet was while it ran, not how much it ran.
- On your own machine, capacity is whatever you declare, and declaring less
  raises the ratio. See [When a score can be ranked](#when-a-score-can-be-ranked).

## Plan accuracy — 200 points

*How close your plan estimates landed to what actually happened*

> For each task with both an estimated and an actual duration, error = |estimated − actual| ÷ the larger of the two; the result is 1 − the mean error. A task’s estimate is the median of what tasks the plan sized the same (S, M, L, XL) had taken before it started, so it measures how consistently the plan sized its work. Tasks that never ran, or had no estimate, are excluded rather than counted as perfect. Unmeasured with fewer than 3 qualifying tasks — one lucky task is not accuracy.

**Formula.** For each task that has both an estimated and an actual duration:

```
error = |estimated − actual| ÷ max(estimated, actual)
ratio = 1 − mean(error)
```

The error is symmetric. Estimating 10 minutes for a task that took 20 costs the
same as estimating 20 for one that took 10 (0.5 each). It is also bounded: no
single miss, however large, costs more than one task's worth.

**Where the estimate comes from.** A plan does not write down minutes. It sizes
each task — S, M, L or XL — and that sizing is its estimate: a claim that this
task is about as much work as the others of its size. To compare a size with a
duration, the size has to become minutes, and the conversion is not a table of
constants somebody chose. A task's estimate is the **median of what tasks of
the same size took on this machine, counting only those that had finished
before this one started**, and it needs at least 3 of them.

So no number in the estimate was invented, and it cannot be adjusted after the
fact: it is fixed by what had already finished when the task began. What the
dimension measures is the plan's consistency. Sizing a two-minute task and a
forty-minute task both as M is what costs points.

Tasks that never ran are left out. So are tasks that had no estimate. A task
with nothing to compare has no error to speak of, and counting it as a perfect
estimate would give full marks to a plan nobody executed. The number of tasks
left out is reported beside the score.

**Unmeasured when** fewer than 3 tasks have both numbers. One task landing
close to its estimate is luck, not accuracy. On a new installation that means
the dimension stays unmeasured until the fleet has finished a few tasks of a
size and then run a few more: there is nothing yet to have been accurate about.

**Known limits.**

- **Survivorship.** Tasks that fail or are abandoned are often the ones that
  were estimated worst, and they are the ones left out. A plan where half the
  tasks never finished can still score well on the half that did.
- Every task counts the same. A five-minute task weighs as much as a five-hour
  one.
- It measures consistency of sizing, not skill at predicting minutes. A plan
  that sizes everything M, on work that all takes about as long, scores well.
- The estimate drifts with the history behind it. A change of model or of
  harness changes what an S takes, and the first tasks afterwards are scored
  against the old pace.

## Cost efficiency — 150 points

*Saving against running everything on the most expensive model*

> 1 − (actual spend ÷ what the same tokens would have cost on the most expensive model), floored at zero. A fleet that runs everything on the most expensive model scores 0 here by construction. Weighted below throughput deliberately: being slow is more expensive than being wasteful. Unmeasured with no recorded spend.

**Formula.**

```
ratio = 1 − ( Σ actual cost ÷ Σ baseline cost ),  floored at 0
```

The baseline cost of a piece of work is what **the same tokens** would have
cost on the reference model — the most expensive model on the price list. The
sums are taken over all the work, so each dollar counts once: a large saving on
a cheap task does not offset paying full price on an expensive one.

Both sides are API list prices, from one table, applied to the tokens the
session runner counted. Nobody on a subscription is billed either figure; they
are a common unit for comparing token mixes, and the saving is a ratio of the
two.

"Most expensive" needs one more sentence, because no model is dearest at
everything. Prices are set per kind of token — fresh input, output, cached
read, cache write — and one model charges the most for output while another
charges the most for a cached read. A long agent session is almost entirely
cached reads. So the reference is **whichever model on the list would have
charged the most for those tokens**, worked out per session, and its name is
carried with the score.

**A fleet that runs everything on the reference model scores 0 here.** That is
what the dimension means, not a penalty: there is no saving against the most
expensive option when it is the option you chose. It is also why this is the
smallest of the four large dimensions. Sending hard work to the strongest model
is often the right decision, and being slow costs more than being wasteful.

**Unmeasured when** no spend was recorded, or the baseline comes to zero.

**Known limits.**

- **The baseline flatters cheap models that use more tokens.** The baseline is
  the tokens that were actually used, repriced. A cheaper model that needs
  three attempts and twice the tokens to finish a task inflates its own
  baseline, and so shows a larger saving than a model that got it right the
  first time. The fair comparison — what the reference model would have spent
  on the same task — was never run, and this dimension does not estimate it.
- It rewards spending less, not getting more. Work that failed cheaply scores
  well.
- Which model is the most expensive changes with price lists, and with the mix
  of tokens. Two scores are comparable on this dimension only if they were
  priced against the same list, so the reference used is carried alongside the
  score.
- It only covers work DevPilot dispatched. A session you started yourself and
  DevPilot merely observed is not part of this dimension.

## Velocity trend — 100 points

*Whether your throughput is rising or falling*

> Completions per hour over the last quarter of the scoring window, divided by completions per hour over the whole window; half that ratio, capped at 1. Steady throughput is half marks, doubling is full marks, stopping is zero. Unmeasured with fewer than 4 completions. A tiebreak, not a headline — it is the noisiest dimension.

**Formula.**

```
r     = (completions per hour, last quarter of the window)
        ÷ (completions per hour, whole window)
ratio = min(1, r ÷ 2)
```

Steady throughput (`r = 1`) is half marks. Doubling is full marks. Stopping is
zero. Holding steady is treated as the neutral point: it is neither a decline
to be marked down nor an improvement to be paid in full.

**Unmeasured when** fewer than 4 tasks completed in the window.

**Known limits.** This is the noisiest dimension, which is why it is worth only
100 points.

- It is a ratio of two small counts. With four completions, one task finishing
  a minute earlier or later can move the dimension by half its range.
- It counts completions, not their size. Ten small tasks finishing late
  outscore one large task finishing early.
- It responds to timing. Finished work held back and released late reads as
  acceleration, and so does a well-chosen window.

## Parallelization quality — 100 points

*How well your plans exploited work that was genuinely independent*

> Achieved concurrency (total task time ÷ wall-clock time) over the most the plan allowed (the smaller of fleet capacity and total task time ÷ the longest dependency chain by actual duration), multiplied by 1 − the share of concurrently running task pairs that touched a common file — two tasks touching one file were not independent, whatever the plan said. Plans are combined weighted by their total task time. Unmeasured without a plan of at least 2 timed tasks.

**Formula.** For each executed plan, with `W` the total task time, `T` the
wall-clock time from first start to last end, and `C` the longest chain of
dependent tasks measured by how long those tasks actually took:

```
achieved = W ÷ T
allowed  = min(capacity, W ÷ C)
p        = share of task pairs running at the same time that touched a common file
ratio    = min(1, achieved ÷ allowed) × (1 − p)
```

Several plans are combined as a mean weighted by each plan's `W`.

The comparison is against what the plan's dependencies *allowed*, not against a
fixed ideal. A plan that is one chain, each task waiting for the one before,
had nothing to parallelise; run one task at a time it scores full marks. The
same number of independent tasks run one at a time on a fleet of four scores a
quarter. The dimension marks down independence left unused, and does not mark
down work that was serial by nature.

Two tasks that ran at the same time and changed the same file were not
independent, whatever the plan said, and `p` is the penalty for that. Tasks
that share a file but ran one after the other are not penalised. That is the
right way to schedule them. The files compared are the ones each task actually
touched, not the ones the plan predicted.

**Unmeasured when** no plan has at least 2 tasks with recorded start and end
times. A single plan is also left out — skipped, not scored as zero — when its
dependencies form a loop, when fleet capacity is unknown, or when tasks that
ran together have no record of the files they touched.

**Known limits.**

- Wall-clock time includes waiting. A plan that paused overnight for someone to
  approve the next step reads as poorly parallelised.
- `allowed` is an upper bound. With few agents and tasks of awkward lengths,
  the best possible schedule can fall short of it, so a perfectly scheduled
  plan can score below full marks.
- The dependencies are the plan's own declaration. Declaring dependencies that
  do not exist makes any plan look correctly serial.
- `p` is coarse on small plans. If only one pair of tasks ran together and they
  shared a file, the plan scores zero.
- The penalty sees files, not conflicts. Two tasks appending to one changelog
  are penalised like two tasks rewriting one function.

---

## Partial scores

A dimension with no data is unmeasured. An unmeasured dimension contributes
nothing to the total **and nothing to what the total is out of**.

So a score with unmeasured dimensions is shown against the points that were
actually measurable, for example:

```
412 of 650 measured   (4 of 6 dimensions)
```

and not as `412 / 1000`, which would present two missing measurements as two
zeros. Each unmeasured dimension carries one sentence saying what was missing.
(The figures above illustrate the format. They are not anyone's score.)

A new installation with no history has six unmeasured dimensions and a score of
`0 of 0 measured`. That is the correct reading. There is no starting score.

## When a score can be ranked

A score is rankable only when **all six dimensions are measured under the same
model version**.

- An incomplete score is a sum over whichever dimensions happened to be
  measurable. Two incomplete scores are sums over different things and cannot
  be put in order.
- A change to the weights or the formulas is a new model version. Scores earned
  under an earlier version are not rescaled into the new one; they are left out
  of ranking.

Even a complete score from your own machine is a personal reading, not a
standing. Three of the limits above are reasons why: capacity is self-declared,
the window is chosen by whoever computes the score, and the workload is your
own. A larger fleet, a kinder window or an easier week all move the number.

Ranked scores are meant to come from the benchmark substrate
(`spec/trd/16-CONDUCTOR-SCORE.md` §3.1), where everyone runs the same tasks
through the same harness and the harness fixes the fleet size. That removes the
things a local score cannot control for. It also has a cost that should be
stated: a one-shot benchmark run has little runway to keep healthy and no
ongoing fleet to keep fed, so what a benchmark can rank is closer to a plan and
its configuration than to a person's week of conducting.

## What this does not measure

- **Whether the code is any good.** Nothing here looks at correctness, tests,
  review outcomes or whether a change was later reverted. A fleet that ships
  broken work quickly and cheaply can score well.
- **Whether the work was worth doing.** The score measures how the work was
  run, not whether it was the right work. A perfectly conducted fleet can spend
  a week building the wrong thing.
- **Outcomes after completion.** A task counts as complete when it is recorded
  as complete.
- **The person.** It describes a stretch of fleet activity under one
  configuration. It is not a measure of a developer and should not be used as
  one.

## Changing the definition

The weights and the method text live in `packages/core/src/score/model.ts`.
The arithmetic lives in `packages/core/src/score/compute.ts`, with a worked
example for every dimension in `packages/core/tests/score-compute.test.ts`.

A change to a weight or a formula changes what every score means. It requires
a new model version (`SCORE_MODEL_VERSION` in `model.ts`), and scores from the
old version stop being comparable with scores from the new one.
