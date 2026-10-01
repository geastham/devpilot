# The fleet harness

How DevPilot configures the agents it launches — and how a change to that
configuration gets judged before anyone is switched to it.

---

## Why there is one

A dispatched agent used to run as a bare `claude -p`, inheriting whatever the
operator's machine happened to have: every MCP server they had ever added,
every skill, their hooks. Two machines in one fleet ran different agents, and
neither configuration was written down.

The "token optimisation" on offer was two third-party tools — RTK and Caveman —
installed into that same user-level configuration by `devpilot setup`, which
printed the projects' own headline savings ("60-90%", "~65-75%") as though
DevPilot had measured them. It had not. Independent paired benchmarks on
agentic Claude Code sessions found:

| Tool | Claimed | Measured | Source |
|---|---|---|---|
| RTK | up to 90% less shell output | cost per task **+7.6%** at low effort, **+0.1%** at high | [JetBrains, Jul 2026](https://blog.jetbrains.com/ai/2026/07/rtk-claude-code-token-savings/) |
| Caveman | 65% fewer tokens | **8.5%** fewer output tokens | [JetBrains, Jul 2026](https://blog.jetbrains.com/ai/2026/07/speak-to-ai-agents-like-cavemen-tosave-tokens/) |

Both were removed from the wizard. One of them never applied to a fleet at all:
Caveman is switched on per session with a slash command, which a headless agent
does not type.

## Where the tokens are

DevPilot now meters every session (see the hosted repo's `docs/EFFICIENCY.md`).
On the long sessions measured while building this:

- 97–99% of input-side tokens were context served from the prompt cache
  (twelve sessions);
- output was a fraction of a percent of all tokens;
- on one representative session priced at API list rates, about 70% of the
  cost was cache reads, 13% output, and the rest cache writes.

So what a session spends is **context size × number of turns**. A tool that
trims output, or one category of tool result, is working on the small end. The
levers are what is in the context every turn and how many turns read it — and
those are settings of the agent, not add-ons to it.

## What the harness is

`packages/cli/src/commands/session-runner/harness.ts`. A harness is a named set
of **techniques**; each technique adds arguments to the `claude` invocation,
names the part of the spend it is expected to reduce, and names the reading
that would show it has made things worse.

| Technique | What it changes | Expected to reduce | Watch for |
|---|---|---|---|
| `strict-mcp` | The agent gets no MCP servers except those the dispatch supplies | fixed overhead per turn | tool-not-found errors; a task that needed a project MCP server |
| `no-skills` | Skills are not loaded into a worker | fixed overhead per turn | a task that relied on a project skill |
| `stable-prefix` | Per-directory details stay out of the system prompt, so parallel worktrees share one cache entry | cache writes | no fall in first-turn cache writes; changed behaviour |
| `compact-200k` | History is summarised at 200k tokens instead of near the window limit | context size | files re-read after a compaction; more turns; lower success |
| `budget-cap` | A run stops once it has spent `DEVPILOT_HARNESS_MAX_BUDGET_USD` at API rates | tail cost | legitimate long tasks cut off |
| `code-graph` | The agent gets one extra tool that answers "where is this and what depends on it" from an index of the repository — see [CODE-GRAPH.md](CODE-GRAPH.md) | the reading an agent does to find its way around | **more** tokens per written change, not fewer; retrieved context left in the window; answers about the wrong module |

Profiles are named sets:

- **`baseline`** — nothing. Exactly what the runner did before the harness
  existed. **This is the default.**
- **`lean`** — `strict-mcp`, `no-skills`, `stable-prefix`: the three that only
  remove things a scoped worker does not use.

```bash
devpilot session-runner --harness lean
devpilot session-runner --harness baseline+compact-200k
DEVPILOT_HARNESS=lean+budget-cap DEVPILOT_HARNESS_MAX_BUDGET_USD=15 devpilot session-runner
```

An unknown name is an error, not a fallback. A typo that silently ran
`baseline` would produce an A/B whose two arms were the same thing.

**A run's stamp names only what took effect in that run.** A technique can be
asked for and have nothing to act on: `code-graph` in a repository with no
index, `budget-cap` with no figure set. Such a run is stamped without it —
`lean@1`, not `lean+code-graph@1` — because the stamp is what readings are
grouped by, and a row that mixed runs which had a graph with runs which did
not would be comparing a thing with itself.

**A technique that adds a tool also grants it.** A headless agent cannot be
asked for permission, and the runner's permission mode covers file edits only,
so an MCP tool that has not been granted is refused. The first live run of
`code-graph` was exactly that: the tool was configured, called three times,
refused three times, and the agent answered with grep — under a stamp saying
it had a code graph, while every test that looked only at the configuration
passed. The runner now grants the tools it configures itself, and only those.

The harness is the **operator's** choice, like the permission mode and for the
same reason: a dispatch must not be able to change what an agent on someone
else's machine loads.

## The rule: nothing is on by default until it has been measured

Every technique here is a hypothesis. That is why `baseline` is the default and
why `compact-200k`, the one with a real way to hurt, is not in `lean`.

Every session is **stamped** with the harness it ran under — `lean@1`,
`baseline+compact-200k@1` — and the stamp travels with its readings to the
cockpit. The number after `@` is `HARNESS_VERSION`, bumped whenever a
technique's arguments change, so readings taken under an older definition are
never mixed with newer ones under the same name.

The Efficiency page groups readings by harness and model. That grouping is a
place to look, not a verdict: two groups of sessions doing different work
differ for reasons that have nothing to do with the harness.

## How to actually validate a technique

1. **Hold the task constant.** Run the benchmark suite, or the same ticket
   twice. Same repo commit, fresh worktree, same model, same effort, same
   Claude Code version, same permission mode.
2. **Change one technique per arm.** `baseline` against `baseline+<technique>`.
3. **Repeat.** At least three runs per task per arm, interleaved in time. Token
   counts are heavy-tailed and one run proves nothing.
4. **Judge on cost per successful task**, from the four token counts, not on
   raw totals and never on a tool's own counter.
5. **Read the regression signal** in the table above before reading the saving.

## What has been measured so far

One thing, on one machine, and it is a property of configuration rather than of
behaviour: the fixed context an agent carries before it has done anything.

With a trivial prompt on a machine with 15 MCP servers configured:

| | Tools loaded | MCP servers | First-turn input-side tokens |
|---|---|---|---|
| `baseline` | 305 | 15 | 29,139 |
| `lean` | 29 | 0 | 23,936 |

5,203 fewer tokens in every turn's context, about 18%. That is re-read on each
turn, so over a 300-turn session it is roughly 1.5M cache-read tokens.

This is **not** a savings claim. It is one sample, it scales with how many MCP
servers a machine has, and it says nothing about whether a worker that lost
those servers still finishes its task. It is the size of the lever, measured.

### `code-graph`: two live runs, and what they are not

The same one-line question ("which function calls X?") was given to a Haiku
agent twice, in a worktree of this repository with a real index:

| | Tools it called | Turns | Cost at API rates |
|---|---|---|---|
| Graph tool configured but **not granted** | graph ×3 (all refused), then Bash, Read, Write | — | $0.102 |
| Graph tool granted | graph ×2, Write | 4 | $0.054 |

Both got the right answer. This is **not** a measurement of the technique: it
is one task, chosen because a graph can answer it, and the dearer run is dear
partly because it spent three calls being refused. The comparison that would
say something — the same plans under `lean` and `lean+code-graph`, across
repositories, scored by tokens per written change and by whether the task's
tests pass — has not been run.

## What is deliberately not in the harness

- **`--bare`.** The tidy way to stop inheriting user configuration, but it
  requires API-key authentication and so locks out anyone on a subscription.
- **`--max-turns`.** Does not exist in current Claude Code. Checked against the
  installed CLI, not assumed.
- **A proxy.** Anything that sits on `ANTHROPIC_BASE_URL` puts the prompt cache
  and deferred tool loading at risk, and means agent traffic passes through
  code that is not Anthropic's or the user's.
- **Command rewriting.** RTK's failure mode: a rewritten command whose output
  feeds a pipe returns the wrong answer. If output trimming is added here it
  will cap successful output and leave errors whole, and it will not change
  what was run.

## Why this matters more soon

Claude Code's [headless documentation](https://code.claude.com/docs/en/headless)
says of bare mode: it "is the recommended mode for scripted and SDK calls, and
will become the default for `-p` in a future release." Bare mode skips hooks,
skills, plugins, MCP servers, auto memory and `CLAUDE.md`.

Two consequences for a fleet:

- Anything installed into `~/.claude` would silently stop applying to agents
  DevPilot launches. A harness that passes its configuration explicitly is not
  affected — which is the argument for having one.
- **Bare mode does not use a subscription login.** It reads `ANTHROPIC_API_KEY`
  or an `apiKeyHelper` and nothing else. If it becomes the default for `-p`,
  an agent DevPilot dispatches on a subscription will need the runner to opt
  out of it explicitly. The runner does not pass `--bare` today and must keep
  not passing it; when the default changes, this is the first thing to check.
  Sessions a person starts themselves, which DevPilot only observes, are not
  affected.
