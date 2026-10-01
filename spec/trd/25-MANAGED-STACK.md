# TRD 25 — The Managed Stack
## What Pro is, and what has to be true before it can be sold
### v0.1 · October 2026 · Status: DESIGN — §3 and §4.1 SHIPPED

---

## 1. The decision this implements

Taken 1 October 2026:

> **Measurement stays free. Pro is the managed agent stack — harness, planner,
> memory, token-reduction techniques — kept current by the service, plus
> before-and-after evidence on the customer's own fleet.**

The reasoning: measurement drives adoption and is the substrate for the
Conductor Score and any leaderboard, so it cannot be the thing behind a
paywall. Nobody pays for a dial. They pay for what moves it.

Two rules follow, and both are constraints on this design:

1. **No reading is ever gated.** Tokens, agent time, per-change cost,
   re-entries, the score.
2. **A technique is a Pro claim only once it has a measured delta.** At the
   time of writing nothing had one: the benchmark suite had never produced a
   committed result, and the two token tools the CLI installed carried their
   vendors' numbers, which independent tests did not reproduce (see
   `docs/HARNESS.md`).

## 2. What "the stack" is

Four layers, each configurable, each versioned:

| Layer | What it controls | State today |
|---|---|---|
| **Harness** | How an agent is launched: tools, MCP servers, skills, compaction window, cache-prefix stability, budget cap | `harness.ts`: five techniques, two profiles, default unchanged. **Shipped.** |
| **Planner** | How a ticket becomes a plan: prompt, scoring gate, model routing, per-task estimates | Real, with correctness fixes in this release; no measured speed-up |
| **Memory** | What an agent is told that it could not work out from the repo | Planner gets 180 characters of up to four past runs; workers get nothing |
| **Prompts** | What each worker is told: goal, scope, how to finish | Rewritten in this release (dead callback protocol removed) |

A **stack version** is one identifier that pins all four. Today only the
harness layer carries a stamp (`lean@1`). §4 extends it.

## 3. Shipped: the measurement that makes the rest possible

- Every session is metered on the machine: four token counts, counted once per
  response; write calls; files changed; active time; the model.
- A session DevPilot launched carries its **harness stamp**.
- The hosted Efficiency page groups readings by harness and model, shows the
  number of sessions behind each row, and draws no conclusion.

Without the stamp, before and after are one undifferentiated pile. With it, a
change to the harness produces two rows that can be put side by side.

## 4. The validation gate

A technique moves from candidate to default only by passing both.

### 4.1 Benchmark (necessary)

Paired runs on the benchmark suite: same tasks, same repo commit, fresh
worktree, same model and effort, pinned Claude Code version. One technique per
arm. At least three runs per task per arm, interleaved. Primary metric: cost
per **successful** task, from the four token counts at a fixed price table.
Report the median of per-task deltas with an interval; inspect outliers.

A smoke run is not evidence. Three independent published benchmarks of
third-party token tools got the wrong sign or magnitude from single 10-task
runs.

**Blocker:** the benchmark suite currently drives its own planner, not the one
that ships (`packages/benchmarks/src/runner/devpilot-executor.ts`). It has to
call `@devpilot.sh/core/wave-planner` before it can validate anything about
the planner layer. For the harness layer it is usable once it passes
`--harness` to the runner.

### 4.2 Fleet (sufficient, with consent)

A customer's own before-and-after: the same readings, grouped by stack
version, over comparable work. This is the evidence Pro sells. It is weaker
than a benchmark because the work differs between periods, and it must be
presented that way — with session counts, without a headline multiplier unless
the benchmark supports one.

### 4.3 What each layer has to show

| Layer | Should fall | Must not rise |
|---|---|---|
| Harness | tokens per change; first-turn context | turns; re-reads; task failures |
| Planner | wall-clock against the duration-weighted critical path | merge conflicts per wave; failed tasks |
| Memory | tool calls before the first write; re-entries; turns | cache-read tokens per turn without a fall in turns |
| Prompts | turns per task | re-entries; failed tasks |

## 5. Distribution — the part that reverses a boundary

Today the hosted plane sends two kinds of thing down to a machine: work to
claim, and commands to apply to a run (approve, re-plan, abort, resume). It
does not change how agents behave.

A managed stack does. That is a new direction across the trust boundary, and
the design has to say so rather than slide into it:

- **A stack is a signed manifest.** The CLI verifies the signature against a
  key it ships with. An unsigned or mis-signed manifest is refused, not
  warned about.
- **Pinned by default.** A machine runs the stack version it was told to run.
  Auto-update is opt-in per organization, and even then stays one version
  behind for a configurable soak period.
- **Diffable before it applies.** `devpilot stack diff` shows exactly which
  arguments, prompts and settings change, in plain text.
- **Rollback is one command** and does not need the network.
- **A manifest configures; it does not execute.** It can set flags the harness
  already knows and select prompts the CLI already ships. It cannot name a
  binary to download or a script to run. New capability arrives in a CLI
  release, which a person installs.
- **The security copy changes in the same pull request.** "What the cloud does
  see" gains nothing, but "what the cloud can change" becomes a list that
  exists.

The open-core line: the mechanism (harness, manifest format, verifier,
`stack diff`) is MIT. The curated, versioned, validated manifests and the
evidence reports are the paid service.

## 6. Memory in the stack

From the investigation recorded in `docs/MEMORY-LANDSCAPE.md` and this
release's review:

- No independent evidence was found that any third-party memory product makes
  coding agents better or cheaper than plain files. The independent results
  say memory helps when it holds facts the agent **cannot derive from the
  repo** and the right item is retrieved; generic or auto-written notes cost
  about 20% more for no gain.
- Injected memory is re-read on every later turn. `M` tokens over `T` turns
  cost roughly `M × (1.25 + 0.1 × (T − 1))` input-token-equivalents. Correct
  memory breaks even at well under one avoided turn; wrong memory adds turns.

So:

1. **One provider interface** — `recall(request) → items within a token
   budget`, `remember(item)`, and capability flags including where the data
   goes (`none | self-hosted | third-party`).
2. **A local, deterministic default.** The planner gets the outcomes of past
   plans that touched the same paths, computed from rows already in the local
   database. Workers get nothing by default.
3. **Worker memory ships off, behind the A/B in §4.**
4. **Third parties plug in through one generic MCP adapter**, refused unless
   the repository has opted into data leaving the machine.
5. **Stored memory is untrusted input.** Task error strings and completion
   summaries already reach prompts verbatim; they are fenced and length-capped,
   and agent-written memory is quarantined until reviewed.

Packaging: the interface, the local default and the measurement are free. Pro
is the tuned configuration with its evidence, tested adapters as providers
churn, and opt-in sync of derived records across a team's machines.

## 7. Sequence

| # | Work | Unblocks |
|---|---|---|
| 1 | Readings, harness, stamp *(this release)* | everything |
| 2 | Wave planner correctness: isolation per task, one advancement driver *(this release)* | any claim about speed |
| 3 | Conductor Score from measured data *(this release)* | the arena |
| 4 | Benchmark suite calls the shipped planner and passes `--harness` | §4.1 |
| 5 | First baseline results committed; `lean` judged | the first honest number |
| 6 | Stack version stamps planner, prompts, memory | §4.2 across layers |
| 7 | Memory provider interface + local default + A/B | memory as a layer |
| 8 | Signed manifest, `stack diff`, pinning, rollback | distribution |
| 9 | Pro | — |

Steps 4 and 5 are small and are what stand between this release and the first
number that can be printed on the marketing page.

## 8. Risks

- **Bare mode.** Claude Code's documentation says `--bare` "will become the
  default for `-p`". Bare mode does not use a subscription login. A dispatched
  agent on a subscription will then need the runner to opt out explicitly. This
  is the single change most likely to break the product's premise and should be
  watched for in every Claude Code release.
- **A technique that helps on the benchmark and hurts on real work.** Hence
  §4.2, and hence pinning.
- **Price drift.** The API-rate estimate uses a dated table in the CLI. It is
  labelled an estimate everywhere, but a stale table makes every "per change"
  figure wrong by the same factor. Keeping it current is itself part of what
  the service does.
- **Goodhart.** Tokens per change falls if an agent makes many small edits.
  The score's other dimensions, and task success on the benchmark, are the
  counterweight; no single reading should become a target.
