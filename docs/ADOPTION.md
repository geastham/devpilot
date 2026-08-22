# Fleet Introspection & Adoption

> **Status: built, all five waves.** Spec is
> `spec/trd/21-FLEET-INTROSPECTION.md`.
>
> What has and has not been proven, stated precisely because this repo has a
> history of documentation asserting things the code did not do
> (`docs/ROADMAP.md` §0):
>
> - **Proven end to end against the live database over real HTTP.** The real
>   CLI adopted 6 live sessions, created 6 Linear issues (against a local
>   GraphQL stub), wrote 6 rows with `origin='adopted'` and **zero**
>   `dispatch_queue` rows, and a second run created nothing.
> - **Proven against real data.** The scanner reads this machine's actual
>   store: 670 sessions across 38 project directories in 634 ms, 12 repos
>   under 5 owners.
> - **Not yet proven against Linear itself.** Every Linear call in the tests
>   goes to a local stub that speaks the same GraphQL. The documents are the
>   ones the route really sends, but no issue has been created in a live
>   Linear workspace.

DevPilot dispatches work to agents. **Adoption is the other direction**: agent
sessions already running on your machine that DevPilot did not start get a place
on the Linear board.

---

## Why

Every session DevPilot knows about is a session DevPilot started. Meanwhile the
same machine has a dozen Claude Code sessions open that the product cannot see.
On the machine this was designed against:

```
$ ls ~/.claude/projects | wc -l
38
```

Thirty-eight project directories. Several active in the last minute. The board
showed none of them. That means three things are wrong at once:

- **Capacity is undercounted.** The wave planner computes free workers from
  sessions it started, so it thinks a busy machine is idle.
- **File conflicts are under-guarded.** `getAvoidFiles` only knows about files
  held by dispatched sessions.
- **Onboarding starts blank.** Everything you have already been doing with
  agents is invisible to the product on day one.

## How it works

Claude Code already writes a complete, structured record of every session:

```
~/.claude/projects/<cwd-slug>/<session-uuid>.jsonl
/private/tmp/claude-<uid>/<cwd-slug>/<session-uuid>/scratchpad
```

The scratchpad directory's *name is the session UUID*, so a live process joins
to its own transcript with no API and no daemon. Each transcript entry carries
`cwd`, `gitBranch`, and a timestamp; the head of the file carries the title the
client already computed and your first prompt.

So: **process → session → transcript → cwd → git remote → repo.** Introspection
is a filesystem walk, and it runs entirely on your machine.

```
scan ~/.claude/projects   →  resolve git remote  →  classify  →  summarize (local)
                                                                      ↓
                     Linear issue  ←  match or create  ←  POST /api/adoptions
```

## What crosses the network

Nothing from your transcripts. The wire contract carries a closed list:

| Sent | Not sent |
| --- | --- |
| A title and a ≤400-char summary | Any transcript content |
| `owner/name` and a branch name | Any file contents or diffs |
| Timestamps, a message count | Any prompt or model output |
| Changed file **paths** (≤50, opt-out) | — |

This is enforced structurally, not by convention: the request schema is a
`.strict()` zod object, so an unknown key is a parse failure on both sides, and
the hosted table has no column that could hold transcript text.

## Commands

```bash
# Read-only. Shows exactly what would happen, writes nothing.
devpilot sessions scan

# The same table, then a confirmation prompt.
devpilot sessions adopt

# Adopt once at bridge startup.
devpilot bridge connect --adopt
```

```
  Scanned 38 project directories · 12 sessions in the last 24h

  REPO                          SESSION                          LAST     → BOARD
  openconjecture/devpilot       Fleet introspection & adoption   2m  ●    → create
  openconjecture/devpilot       Release CLI 0.4.0                4h       → AVA-31 (branch)
  openconjecture/website        Cockpit landing copy             1h  ●    → create

  Skipped: 3 not routed (arthaus, neurograph), 2 DevPilot-owned, 4 older than 24h
           Run with --all-repos to include the others.

  This creates 2 Linear issues in Avant-Garde and attaches 1 existing.
  Continue? [y/N]
```

Useful flags:

| Flag | Effect |
| --- | --- |
| `--all-repos` | Include repos this machine does not route. Owners are named in the preview first. |
| `--repo <owner/name>` | Restrict to one repo. |
| `--since 24h` | How far back to look. Default 24h. |
| `--no-paths` | Do not send changed file paths. |
| `--yes` | Skip the confirmation. |
| `--json` | Machine-readable scan output. |

## Scope: why it does not scan everything

`~/.claude/projects` holds every project on the machine. On the reference
machine that meant four unrelated clients' repos in one directory.

**The default scan is restricted to repos this machine already routes** — the
`--repos` set you passed to `bridge connect`. Widening it is `--all-repos`, and
the preview names every owner it is about to include before you confirm. A flag
you flipped once should not push one client's repo names into another client's
Linear workspace.

Directories with no git remote are never adopted (there is nothing to attach to)
but are counted, because *"12 sessions in directories DevPilot cannot route"* is
worth telling you.

## Adopted is not dispatched

This is the rule that makes the feature safe rather than dangerous.

DevPilot did not start an adopted session, holds no handle on it, and will not
acquire one. So:

- **No queue row.** Nothing to claim; the stale sweep never touches it.
- **Commands are refused.** `approve` / `replan` / `abort` return 409. Offering
  a control the product cannot honour is worse than not offering it.
- **Completion never moves your ticket.** A transcript going quiet means someone
  closed a terminal. It does not mean the work is done, and moving an issue to
  Done on that evidence would be indistinguishable from a real completion.

An adopted session posts a comment saying how long it ran and what it touched,
states plainly that it was observed rather than dispatched, and leaves the issue
where it is.

## Matching before creating

Adopting 38 sessions blindly would spam your board with duplicates of issues
that already exist. The order is:

1. **Already adopted** → no-op. Idempotence is a unique index on
   `(org_id, adoption_key)`, so re-running is free and survives deleting the
   local ledger.
2. **Branch match** → a branch like `AVA-31-fleet-scan` attaches to AVA-31.
3. **Exact title match** against the team's open issues. Exact only — a fuzzy
   match that attaches to the wrong ticket is silent, and an extra issue is not.
4. **Create** a new issue in the team configured for that repo.

## Discovery and first-run setup

The same walk produces an inventory of repos and owners, pushed as *proposals*:

```
  ✓ Registered
    repos: (none)
    ⚠ No repos specified — nothing can route to this machine.

  Looked around this machine: 38 projects, 6 owners, 12 sessions in 24h

    openconjecture   4 repos   7 sessions   ● 2 live
    arthaus          2 repos   3 sessions
    memoryframe      1 repo    2 sessions

    Review and route them: https://devpilot.sh/fleet/discovered
```

Discovery is cheap — no model call, no board write, no Linear API call — so it
runs on connect. Adoption is a commitment, so it does not.

**A machine proposes; a member commits.** The boundary is explicit:

| Object | Machine token may create? |
| --- | --- |
| Discovered-repo proposal | Yes — an inert observation |
| Repo route | Yes, when a member accepts |
| Adopted session, Linear issue | Yes — previewed and idempotent |
| A team's default repo | **No.** Suggestion only; it is the switch that fires dispatch |
| An organization | **Never.** A laptop scan must not mint tenants |

When you connect Linear, each team gets a *suggested* repo matched against what
was discovered — team key against owner, team name against repo name. It stays a
suggestion with a one-click accept. `default_repo` is null until a human clicks.

## Summaries

Two tiers, and the lower one is not a degraded mode:

1. **Heuristic, always available.** The `custom-title` the client already
   computed, or your first prompt collapsed to one line.
2. **Model, when `ANTHROPIC_API_KEY` is set.** One call at the wiki tier
   (summarization, not decomposition) over the transcript head and changed paths.

A missing API key never blocks adoption. Gating "turn it on and everything is
there" behind a key you may not have would defeat the point.

## Not adopting DevPilot's own sessions

The session-runner spawns `claude -p`, and those write transcripts like anything
else. Adopting them would double-count work already on the board. Two exclusions,
because either alone has a hole: the runner records the `session_id` from
`claude`'s own JSON envelope, and the probe independently recognizes the
DevPilot-composed prompt marker for sessions that predate that ledger.

## What it looks like on this machine

The scan, run for real against 38 project directories:

```
  Scanned 38 project directories · 63 sessions in scope

  REPO                           SESSION                                      LAST   → BOARD
  Avant-Garde-AI/memoryframe     MemoryFrame: Immersive Scene                 now  ● → create
  Arthaus-Inc/artwork-ms         AMS: Social Profile                          17m  ● → create
  NeuroGraph-AI/core             Core: Working + Fatigue Reporting            36m  ● → POR-4 (branch)
  …

  Skipped: 85 not routed (Arthaus-Inc, Avant-Garde-AI, NeuroGraph-AI, OpenConjecture, dokkio),
           518 outside the window, 22 no git remote, 41 DevPilot-owned
           Run with --all-repos to include the others.
```

Every exclusion is reported. A scanner whose skips are invisible is
indistinguishable from one that is broken, and the conclusion a user reaches is
"this doesn't work" rather than "that session was outside the window".

## In the portal

- **Fleet → Discovered** — repositories grouped by GitHub owner, with session
  counts and how many are running right now. One click routes one; one click
  dismisses it, and a dismissal survives every future scan.
- **Sessions** — an adopted row carries an `Observed` badge and shows
  *not measurable* where a progress bar would be. It reads "Observed" rather
  than "Adopted" because the reader needs the consequence, not the mechanism.

## Taking the wheel

Seeing a session is one thing; doing something about it is another. A session
DevPilot did not start offers two actions, and they are different requests
rather than a setting on one:

| | What it does |
| --- | --- |
| **Plan it** | Hands the work to the conductor. Comes back with waves to approve *before anything runs*. |
| **Just continue** | Resumes the conversation on the machine that ran it, optionally with an instruction. |

```
Anything to say on pickup? Leave it blank to have the agent take stock first.
┌──────────────────────────────────────────────┐
│ Finish the migration and run the tests.      │
└──────────────────────────────────────────────┘
  [ Plan it ]  [ Just continue ]  Cancel
```

### Why DevPilot cannot simply drive a running session

There is no handle on a running `claude` process — no IPC, no attach. So a live
session offers **Open in Claude Code**, which is honest, rather than a control
that would not work.

What it *can* do is resume a **held** one. `claude --resume <id>` continues the
same conversation, and a session DevPilot resumes is one it spawned — so every
callback, stream event and plan gate already built applies to it. Verified: the
session id and transcript stay the same, so the cockpit row is continuous rather
than duplicated.

### Planning works on a live session; continuing does not

The rule is about the transcript, not about liveness. Two processes appending to
one transcript corrupts it — so **continuing** a live session is refused. But
**planning** never opens the transcript; it reads what the observer already
recorded and asks the conductor. So you can plan a session while it is still
running, which is often exactly when you want to.

### The session id never leaves your machine

The hosted plane holds only `adoptionKey` — `sha256(machine + ':' + sessionId)`,
one-way. A command points at a row; what that means locally is resolved on the
machine. A compromised control plane cannot ask your laptop to resume an
arbitrary conversation, because it does not know what any conversation is
called.

The machine also re-checks liveness against the file immediately before
spawning, rather than trusting a status that may be a minute old.

### What runs, and with whose permissions

The agent runs on your machine with the permissions the **bridge** was started
with. Nothing in the request can raise them — a field that could would let
someone in a cockpit escalate what an agent may do on another person's laptop.

## See also

- `spec/trd/21-FLEET-INTROSPECTION.md` — the full technical design
- `spec/trd/22-PROJECTS-AND-OBSERVATION.md` — projects, and why observation is free
- `spec/trd/23-TAKE-THE-WHEEL.md` — resuming a held session, and the planning handoff
- `docs/LINEAR-BRIDGE.md` — the dispatch direction
- `docs/SESSION-RUNNER.md` — how DevPilot starts sessions of its own
