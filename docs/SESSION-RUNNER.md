# The session runner

`devpilot session-runner` is the local execution engine for `claude-session`
orchestrator mode. It is the thing that actually starts a coding agent.

```bash
devpilot session-runner --workspace ~/dev --token dp_local_dev
```

```
DevPilot ──dispatch──▶ session-runner ──spawns──▶ claude -p
   ▲                                                  │
   └──────────── status / complete callbacks ─────────┘
```

---

## Why it exists

`ClaudeSessionAdapter` and `HttpSessionTransport` were built. So were DevPilot's
`/api/orchestrator/status` and `/complete` routes. **Nothing implemented the
service in between**, so `claude-session` mode had no runner to point
`DEVPILOT_SESSION_API_URL` at and could never dispatch — while `ao-cli` was
deprecated, `http` spoke a contract nothing local implements, and `disabled` is
`disabled`.

That was the last gap in the loop. Everything upstream (capture → plan →
dispatch) and downstream (callbacks → DB → score → UI) already worked and was
gated; the agent on the far end was the only thing that had never run.

It implements `spec/trd/01-TIER1-EXECUTION-LOOP.md` §7.1 (dispatcher API) and
§7.2 (callbacks).

---

## Running it

```bash
# Terminal 1 — the runner
devpilot session-runner \
  --port 3900 \
  --token dp_local_dev \
  --workspace ~/dev \
  --repo neurograph/core=~/dev/neurograph-core     # optional explicit mapping

# Terminal 2 — the cockpit, pointed at it
DEVPILOT_ORCHESTRATOR_MODE=claude-session \
DEVPILOT_SESSION_API_URL=http://127.0.0.1:3900 \
DEVPILOT_SESSION_API_KEY=dp_local_dev \
DEVPILOT_CALLBACK_URL=http://127.0.0.1:3000 \
DEVPILOT_CALLBACK_TOKEN=cb_local_dev \
devpilot serve
```

Then dispatch a READY item from the cockpit.

| Flag | Default | Notes |
|---|---|---|
| `--port` / `--host` | `3900` / `127.0.0.1` | Loopback by default |
| `--token` | — | Bearer token the dispatcher must present. **Unset means unauthenticated** |
| `--workspace` | cwd | `owner/name` resolves to `<workspace>/<name>` |
| `--repo <owner/name>=<path>` | — | Explicit mapping, repeatable, wins over `--workspace` |
| `--claude-path` | `claude` | Point at a specific binary |
| `--permission-mode` | `acceptEdits` | Passed to `claude --permission-mode` |
| `--max-concurrent` | `3` | Beyond this the runner answers `429 CAPACITY` and DevPilot queues the task |
| `--timeout` | `30` (minutes) | Wall-clock cap per session |
| `--harness` | `baseline` | How agents are configured — `baseline`, `lean`, or either `+technique`. The operator's choice, never the dispatch's. See [HARNESS.md](HARNESS.md) |
| `--worktree-root` | `~/.devpilot/worktrees` | Where per-task worktrees are created. See [A tree and a branch per task](#a-tree-and-a-branch-per-task) |
| `--worktree-setup` | — | Shell command run in each new worktree before its agent starts, e.g. `"pnpm install --offline"`. The operator's, never the dispatch's |
| `DEVPILOT_CODEGRAPH_BIN` (env) | `codegraph` on PATH | The code graph indexer, if installed. Optional; see [CODE-GRAPH.md](CODE-GRAPH.md) |

### Repo resolution refuses to guess

A repo that resolves nowhere is rejected at create time with the path it tried.
The alternative — spawning the agent in whatever directory happened to be
there — produces a session that edits unrelated files and then reports success.

---

## A tree and a branch per task

A dispatch that is one task of a planned run asks for `isolation: { runId,
taskCode }`, and the runner gives that task its own `git worktree` on its own
branch:

```
devpilot/<run>/run            the run branch: everything merged so far
devpilot/<run>/task-<code>    one branch per task, cut from the run branch
```

**What happens.**

1. The first task of a run creates the run branch at the checkout's `HEAD`.
2. Each task gets a worktree under `--worktree-root`, on a new branch cut from
   the run branch as it is at that moment.
3. When the agent exits, the runner commits whatever is in that directory,
   reads the task's changes from git (base → head) and removes the directory.
   A failed task's partial work is committed too.
4. When a wave ends, the dispatcher calls `POST /v1/integrate` with the wave's
   task codes. Each task branch is merged into the run branch on its own. The
   next wave's tasks are cut from the result, so they start with their
   predecessors' work present.

**What a conflict looks like.** A branch that does not merge is backed out and
reported with the files it conflicted on; the others still go in. The useful
response is to run that task again: the second attempt is cut from a run branch
that now contains the work it collided with. The first attempt's branch is kept,
renamed `…-attempt-<sha>`.

**What it never does.**

- It never touches your checkout. No checkout, stash or reset: your branch,
  index and uncommitted work are as you left them. The other side of that is
  that a run starts from your `HEAD` **commit** — work you have not committed is
  not part of it.
- It never pushes and never opens a pull request. When a run is done its work is
  on `devpilot/<run>/run`, locally, for you to merge, push or throw away.
- It does not delete branches.

**What you need to know before relying on it.**

- **A worktree has the tracked files and nothing else.** No `node_modules`, no
  `.env`, no build output, no `.claude/settings.local.json`. An agent can read
  and edit; in most repos it cannot run the tests until dependencies are there.
  `--worktree-setup` is where to put that right. Without it the agent is told
  the checkout is bare and asked to say so, rather than work around it, when a
  command fails for that reason.
- **Commit hooks are not run** for the runner's commits or merges
  (`--no-verify`). They are bookkeeping on branches nobody has reviewed, and a
  hook that fails because the worktree has no linter installed would lose the
  task. Your hooks run when you bring the run branch into your own.
- **Do not have the run branch checked out when a wave finishes.** Moving it
  underneath an open checkout would make your tree look like it reverted the
  merge, so `/v1/integrate` answers `409 RUN_BRANCH_CHECKED_OUT` and says where.
- **Commits use your git identity**, and fall back to `DevPilot
  <devpilot@localhost>` only when the repository has none configured.
- A dispatch with no `isolation` runs in the checkout itself, as before. So
  does a resumed session, which has to run where its conversation lives.

`GET /v1/health` lists `isolation` and `code-graph` under `capabilities`. A runner from before
this ignores a field it does not know, which would mean a task quietly run in
the shared checkout — so a dispatcher should check before it asks.

`packages/cli/tests/e2e/session-runner-isolation.test.ts` drives all of this
through the real runner against real repositories: parallel tasks, a conflict,
the second attempt, the next wave's base, an agent that commits for itself or
wanders off its branch, a repository with no identity, and each refusal.

## The code graph

When the indexer is installed and a repository has been indexed
(`devpilot graph enable`), the runner does four things with it — and nothing at
all otherwise. See [CODE-GRAPH.md](CODE-GRAPH.md).

- **Keeps the index out of commits.** It adds `.codegraph/` to the repository's
  `.git/info/exclude` before an agent starts. This is required: the indexer's
  own `.gitignore` un-ignores itself, and the runner's `git add -A` at task end
  would otherwise commit it into every task branch.
- **Seeds each task's worktree** with the main checkout's index and syncs the
  difference, rather than indexing inside a task's time budget.
- **Stops the indexer's daemon** when the agent exits. Its MCP server leaves
  one running (it would exit after five idle minutes by itself); the runner
  signals it at once, and only if the pid in the tool's own file is in fact
  the indexer.
- **Answers the planner.** `POST /v1/graph/dependents` `{ repo, files, depth? }`
  → `{ available, byFile, truncated, indexedAt }`, and `POST
  /v1/graph/affected-tests` `{ repo, files }` → `{ available, tests,
  truncated }`. The cockpit plans the work but does not know where a repository
  is checked out; the runner does. A repository with no index answers
  `{ available: false, reason }` with a 200, and the plan is made without it.

Agents are given the graph only when the harness includes `code-graph`.

## The runner reports, not the agent

§7.2 lets either party report: "the session (or **runner on its behalf**)
POSTs". The runner reports, and for this adapter the prompt no longer asks the
session to as well. It used to, with a `curl` the permission mode denied;
nineteen of twenty worker sessions in one run database spent turns attempting
it, and sixteen of their twenty completion summaries were about the failed
callback rather than the work.

Reporting on its behalf is the honest option. A model may forget the final
callback, may send it twice, and — worst — will happily invent `tokensUsed` and
`costUsd`, because it has no way to know them. Every number in the report comes
from something observable:

| Field | Source |
|---|---|
| `success` | Process exit code **and** `is_error` in the envelope |
| `costUsd` / `tokensUsed` / `durationMinutes` | `claude --output-format json` |
| `filesModified` / `Created` / `Deleted` | Isolated task: `git diff` from the task's base to its head — exact. Otherwise `git status --porcelain -uall` diffed before and after |
| `commitSha` | Isolated task: the head of its branch. Otherwise `git rev-parse HEAD` |
| `branch` / `baseSha` | Isolated task only: its branch, and the commit it was cut from |
| `telemetry` | The agent's final reading — tool calls, files written, tokens by kind, model, harness, and the tokens priced at list and at the reference model |
| `summary` | The agent's own `result` text |

**Success needs both signals to agree.** `claude` exits `0` on an in-band error,
so exit code alone reports a refused or errored turn as a completed task — which
would silently advance a wave past work that never happened. There is a test for
exactly this case.

### Known limitation — file attribution on a dirty tree

This applies to a session that was **not** isolated. An isolated task's files
come from git and are exact.

Attribution diffs two `git status` snapshots. A file already dirty *in the same
way* before the session and edited further during it has an unchanged porcelain
code, so it is not attributed. Dispatch onto a clean tree and it is exact;
dispatch onto a dirty one and it under-reports rather than inventing.
Under-reporting is the right direction — DevPilot releases in-flight file locks
from this list.

---

## Verified end to end

**Isolation, October 2026.** Three real agents (Haiku, `--harness lean`) on a
scratch repository, dispatched with the composed worker prompt:

| Step | Result |
|---|---|
| Wave 1: tasks 1.1 and 1.2 at once | Each on its own branch from the same base; each reported exactly the one file it created; both final messages described the work |
| `POST /v1/integrate` for 1.1, 1.2 | Both merged, no conflicts; operator's checkout still on `main`, clean, no worktrees left |
| Wave 2: task 2.1 | Cut from the merged head; found both predecessor files present and said so; created the index that re-exports them |
| `POST /v1/integrate` for 2.1 | Merged; the run branch holds all three files |

The runner's list-price figure for the last session was $0.032279 against
Claude Code's own $0.0322792.

**The original runner.** Two real sessions, on a local Claude Code account, August 2026:

| Task | Result | Cost | Tokens | Wall |
|---|---|---|---|---|
| Implement batch node operations | 2 modified, 2 created | $0.64 | 731,585 | 2.56m |
| Add real-time sync to graph editor | 2 modified, 5 created | $1.39 | 2,112,126 | 9.08m |

Both landed as `COMPLETE` sessions with real cost and token counts, wrote
`completed_tasks` rows, fired `SESSION_PROGRESS` / `SESSION_COMPLETE` activity
events. (They also moved the Conductor Score 742 → 792, which says more about
that score than about the sessions: it was a counter that added points per
completion. It is now computed from recorded events — see
[CONDUCTOR-SCORE.md](CONDUCTOR-SCORE.md).) Dispatching a repo with no
checkout was rejected cleanly and DevPilot rolled the session row back, leaving
no orphan.

`packages/cli/tests/e2e/session-runner.test.ts` covers the contract in CI with a
stub `claude` — auth, payload validation, repo resolution, idempotency, the
exit-zero-but-failed case, and callback shape. The stub is what keeps it a real
test: everything between the HTTP surface and the completion callback is the
production path, and only the agent is swapped.

---

## Gaps

- **Steering is not supported.** `POST /v1/sessions/:id/messages` returns `501`.
  `claude -p` is one-shot: it reads a prompt on stdin and exits, so there is no
  channel into a run already in flight. Doing it properly needs streaming input
  mode (`--input-format stream-json`). It answers honestly rather than accepting
  the message and dropping it.
- **Sessions are in memory.** Restarting the runner loses the registry, so
  in-flight sessions stop reporting. Their wave tasks no longer strand: the
  cockpit's reconciler marks a task `lost` once its session has been silent for
  the stall window (30 minutes by default) and the ordinary retry applies — but
  that is a second agent started for the task, not the first one recovered. See
  [CONDUCTOR-AGENT.md](CONDUCTOR-AGENT.md#advancing-failing-and-recovering).
- **No PR creation.** `prUrl` is never set, and nothing is pushed. An isolated
  run leaves its work on `devpilot/<run>/run`; a single un-isolated dispatch
  leaves it uncommitted in the working tree.
- **Output tokens are not known until a run ends.** While an agent is in
  flight, Claude Code's stream reports each response's usage as the response
  begins: the input side is right and the output count is a placeholder of a
  few tokens (measured: 11 from the stream against 567 in the final result).
  So the in-flight cost reads low — by the share that output makes up, about
  an eighth on a long, cache-heavy session — and is marked as an estimate. The
  final result corrects it, per model, and the completion report carries that.
- **Nothing prunes old branches or worktrees.** A run's branches stay until you
  delete them, and a worktree whose commit failed is left in place on purpose —
  it is the only copy of that work.
- **Completed sessions vanish from the cockpit.** Not a runner bug —
  `/api/fleet/state` returns only `ACTIVE` and `NEEDS_SPEC`, so a session that
  finishes disappears from Fleet Status instead of showing as done. This also
  makes the `allComplete` ✓ branch in `FleetSummaryPills` and the `complete`
  sort key in `FleetStatusPanel` dead code.
