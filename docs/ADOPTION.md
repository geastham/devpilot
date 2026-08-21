# Fleet Introspection & Adoption

> **Status: in progress.** Spec is `spec/trd/21-FLEET-INTROSPECTION.md`. This
> document describes the design as specified; sections are marked ⚠ until the
> corresponding wave lands. This repo has a history of documentation asserting
> things the code did not do (see `docs/ROADMAP.md` §0) — the markers exist so
> that cannot happen again.

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

## Commands ⚠ *(Wave 4)*

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

## Matching before creating ⚠ *(Wave 3)*

Adopting 38 sessions blindly would spam your board with duplicates of issues
that already exist. The order is:

1. **Already adopted** → no-op. Idempotence is a unique index on
   `(org_id, adoption_key)`, so re-running is free and survives deleting the
   local ledger.
2. **Branch match** → a branch like `AVA-31-fleet-scan` attaches to AVA-31.
3. **Exact title match** against the team's open issues. Exact only — a fuzzy
   match that attaches to the wrong ticket is silent, and an extra issue is not.
4. **Create** a new issue in the team configured for that repo.

## Discovery and first-run setup ⚠ *(Wave 5)*

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

## See also

- `spec/trd/21-FLEET-INTROSPECTION.md` — the full technical design
- `docs/LINEAR-BRIDGE.md` — the dispatch direction
- `docs/SESSION-RUNNER.md` — how DevPilot starts sessions of its own
