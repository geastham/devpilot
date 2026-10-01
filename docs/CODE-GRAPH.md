# The code graph

An index of a repository — its files, the symbols in them, and which refers to
which — that the planner and, optionally, agents can ask "what depends on
this?" The design and the selection are in `spec/trd/27-THE-CODE-GRAPH.md`.

**What has and has not been measured.** Indexing is fast and deterministic
(this repository: 400 files, 7,219 symbols, 19,105 references in under a
second). Whether giving agents the graph saves tokens at equal task success
**has not been measured**, by us or — as far as an October 2026 survey found —
independently by anyone. So the agent-facing part is off unless you turn it on,
and nothing here states a saving.

## What it is built on

`codegraph` (github.com/colbymchenry/codegraph, MIT). DevPilot does not bundle
it — its platform package is about 295 MB — and does not install it for you.

```
npm install -g @colbymchenry/codegraph@1.6.1    # the version this was verified against
devpilot graph enable                           # in the repository's checkout
```

Its own installer asks about anonymous usage statistics; that answer is
yours. Every run DevPilot makes of it sets `DO_NOT_TRACK=1`.

The index is a SQLite file in `.codegraph/` in the checkout. `enable` adds
`.codegraph/` to the repository's `.git/info/exclude`.

## What you get, locally

| | Needs |
|---|---|
| **Conflict prediction.** The planner separates tasks whose files depend on each other, not only tasks that name the same file. | An index |
| **Tests for a task.** Each worker is told which tests are reached from the files in its scope. | An index |
| **Blast radius at review.** Per task: how many files depend on what it will change. | An index |
| **The graph as an agent tool.** One MCP tool, `codegraph_explore`. | An index, and the runner started with `--harness <profile>+code-graph` |
| **Work history.** What earlier tasks did to a file — see [below](#work-history). | Nothing: it is the cockpit's own record. For agents, `--harness <profile>+work-history` |

None of it leaves the machine.

### How it works with a branch per task

The index is per directory, and each task runs in its own worktree. Indexing a
repository inside a task's time budget is not acceptable, so the runner copies
the main checkout's index into the worktree and syncs the difference (0.4 s on
this repository), then keeps it current as the agent edits. When the agent
exits, the runner stops the indexer's background daemon before the worktree is
removed.

### The agent tool, and its stamp

`--harness lean+code-graph` gives a dispatched agent the tool and grants it —
a headless agent cannot be asked for permission, and an ungranted MCP tool is
simply refused. A run's readings carry `+code-graph` **only if the run had an
index**: a task in a repository with none is stamped `lean@1`, so the two are
never averaged together.

To find out whether it helps on your work, run the same plans both ways and
compare the two rows on the Efficiency page: tokens per written change, and
responses per prompt.

Two things seen while building this, on single tasks — observations, not
results: a query that named a symbol returned the right module, and the same
question in plain English returned a different one; and each call returned
about 5,000 tokens either way.

## Work history

A code graph can be rebuilt from the repository at any time. What cannot be is
what happened: that the last task to change `retry.ts` collided with another on
merge and was run again, or failed, or what its agent said it did. The cockpit
already records all of that per task. This is the read side.

```
GET /api/history?repo=<owner/name>&paths=src/retry.ts,src/fetch.ts&limit=5
```

For each path: the most recent wave tasks that changed it, with the ticket,
how the task ended and when, whether it was retried and why, whether its
branch conflicted, its agent's summary, and its cost at API rates. A task
counts for a file when the files it is recorded as having changed include it;
where nothing recorded what it changed, when its plan assigned it the file —
each entry says which (`matchedOn`).

It needs no index and no indexer.

**For agents.** `--harness <profile>+work-history` gives a dispatched agent one
tool, `devpilot_history({ paths })`, served by `@devpilot.sh/mcp-session`. Three
things about it:

- **It is local.** The tool asks the cockpit that dispatched the task, and the
  runner only wires it up when that cockpit is on a loopback address. Summaries
  and errors are text agents wrote about your code; they are never sent to the
  hosted plane.
- **What it returns is labelled as untrusted.** An earlier agent's summary is
  shown as a note about what happened, inside a delimited block the text cannot
  close, and described to the reading agent as not being instructions.
- **It is off by default and unmeasured.** Like `code-graph` it is in no
  profile. The bet is on fewer retries and conflicts; compare the two stamps.

## Sharing with the hosted plane (premium, opt-in)

```
devpilot graph share          # prints what would be sent; sends nothing
devpilot graph share --yes    # sends it, and a connected bridge keeps it current
devpilot graph unshare        # stops, and deletes the hosted copy
```

**What the hosted plane receives for a shared repository:** file paths,
languages and content hashes; the names of functions, classes and other
symbols, with their kind and line range; and which symbol refers to which.

**What it never receives:** signatures, parameter lists, return types,
comments, docstrings, or the contents of any file. The export is built from an
allowlist of columns, the hosted route rejects a request carrying any other
key, and a test puts a marker string in every source-bearing column of an
index and looks for it in what would be sent.

That is still more than the hosted plane otherwise receives — it learns the
names of your functions and how they call each other — which is why it is off
by default, per repository, and says what crosses before it does anything.

The hosted graph follows the repository's default branch. It is a premium
feature, free during early access: a workspace owner turns it on under
Manage → Code graph.

What it is for is what only the hosted plane can see — every machine at once:
a warning when agents on two machines are working on connected code, and the
blast radius of a task when reviewing a plan from a browser.

## Commands

| | |
|---|---|
| `devpilot graph enable [path]` | Build or refresh the index |
| `devpilot graph status [path]` | Indexer, index size and age, whether shared |
| `devpilot graph sync [path]` | Bring the index up to date |
| `devpilot graph disable [path]` | Delete the local index |
| `devpilot graph share [path] [--yes]` | Share its structure with the hosted plane |
| `devpilot graph push [path]` | Send the latest structure now |
| `devpilot graph unshare [path]` | Stop sharing; delete the hosted copy |

`DEVPILOT_CODEGRAPH_BIN` points DevPilot at a specific indexer binary.
