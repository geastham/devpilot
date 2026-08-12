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

### Repo resolution refuses to guess

A repo that resolves nowhere is rejected at create time with the path it tried.
The alternative — spawning the agent in whatever directory happened to be
there — produces a session that edits unrelated files and then reports success.

---

## The runner reports, not the agent

The composed prompt (§7.3) asks the *session* to `curl` its own callbacks. The
runner does not rely on that, and §7.2 explicitly permits the alternative:
"the session (or **runner on its behalf**) POSTs".

Reporting on its behalf is the honest option. A model may forget the final
callback, may send it twice, and — worst — will happily invent `tokensUsed` and
`costUsd`, because it has no way to know them. Every number in the report comes
from something observable:

| Field | Source |
|---|---|
| `success` | Process exit code **and** `is_error` in the envelope |
| `costUsd` / `tokensUsed` / `durationMinutes` | `claude --output-format json` |
| `filesModified` / `Created` / `Deleted` | `git status --porcelain -uall` diffed before and after |
| `commitSha` | `git rev-parse HEAD` |
| `summary` | The agent's own `result` text |

**Success needs both signals to agree.** `claude` exits `0` on an in-band error,
so exit code alone reports a refused or errored turn as a completed task — which
would silently advance a wave past work that never happened. There is a test for
exactly this case.

### Known limitation — file attribution on a dirty tree

Attribution diffs two `git status` snapshots. A file already dirty *in the same
way* before the session and edited further during it has an unchanged porcelain
code, so it is not attributed. Dispatch onto a clean tree and it is exact;
dispatch onto a dirty one and it under-reports rather than inventing.
Under-reporting is the right direction — DevPilot releases in-flight file locks
from this list.

---

## Verified end to end

Two real sessions, on a local Claude Code account, August 2026:

| Task | Result | Cost | Tokens | Wall |
|---|---|---|---|---|
| Implement batch node operations | 2 modified, 2 created | $0.64 | 731,585 | 2.56m |
| Add real-time sync to graph editor | 2 modified, 5 created | $1.39 | 2,112,126 | 9.08m |

Both landed as `COMPLETE` sessions with real cost and token counts, wrote
`completed_tasks` rows, fired `SESSION_PROGRESS` / `SESSION_COMPLETE` activity
events, and moved the Conductor Score 742 → 792. Dispatching a repo with no
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
- **Progress is a heartbeat, not a measurement.** `claude -p` reports nothing
  until it is done, so the runner sends a keep-alive that creeps toward 90% and
  stops. It never implies the work is nearly over. Real progress needs
  `stream-json` too.
- **Sessions are in memory.** Restarting the runner loses the registry, so
  in-flight sessions stop reporting and their wave tasks strand on `dispatched`.
- **No PR creation.** `prUrl` is never set. The agent commits nothing by default;
  the operator reviews the working tree.
- **Completed sessions vanish from the cockpit.** Not a runner bug —
  `/api/fleet/state` returns only `ACTIVE` and `NEEDS_SPEC`, so a session that
  finishes disappears from Fleet Status instead of showing as done. This also
  makes the `allComplete` ✓ branch in `FleetSummaryPills` and the `complete`
  sort key in `FleetStatusPanel` dead code.
