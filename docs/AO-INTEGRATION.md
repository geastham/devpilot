# Agent Orchestrator (`ao`) Integration

**Status: the `ao-cli` orchestrator mode is deprecated and non-functional.**
Use `--mode http` pointed at the ao daemon.

## What changed

`ao` inverted its architecture. It is now a Go **daemon on `127.0.0.1:3001`**
exposing a REST API, with the CLI as a thin client of it. Shelling out and
parsing stdout — what our `ao-cli` adapter did — is no longer the integration
surface.

Verified against `@composio/ao-cli` on 2026-08-03:

| Our adapter called | Real `ao` responds |
|---|---|
| `ao list` | `error: unknown command 'list'` |
| `ao status <sessionId>` | `error: too many arguments for 'status'. Expected 0 arguments but got 1.` |
| `ao spawn <project> <ticket> "<prompt>"` | takes `[project] [issue-id]`; **accepts no prompt** |
| `--model <m>` | does not exist — the flag is `--agent <name>` |
| `--repo <r>` | does not exist |

Only `ao --version` still works.

The deepest difference is conceptual: our adapter **hands `ao` a prompt**. Real
`ao` spawns from an *issue identifier* and resolves context itself; free-form
instructions are sent afterwards with `ao send <session> "..."`.

### Distribution also changed

npm is no longer the real channel. Their own
`docs/ao-start-bootstrapper-and-npm-deprecation.md` states npm is *"the legacy
on-ramp… We are deprecating npm as an app-distribution path"*, and `ao start`
now fetches and opens the desktop app rather than starting a daemon.

Versions are badly skewed as a result:

| Source | Version |
|---|---|
| npm `@composio/ao-cli` | 0.2.2 (2026-03-29) |
| that binary reports | 0.1.0 |
| actual latest release | `v0.11.2-nightly.202608031559` (2026-08-03) |

**Do not rely on the npm build.** Install the desktop app.

## Current integration path

```bash
devpilot bridge connect \
  --url https://<your-bridge> \
  --token dp_orch_… \
  --repos owner/repo \
  --mode http \
  --http-url http://127.0.0.1:3001
```

## Known gap

Our `http` adapter speaks **our** contract:

```
POST /dispatch            GET /jobs/:id/status            GET /jobs/:id/result
```

The ao daemon speaks **its own**:

```
POST /api/v1/sessions     GET /api/v1/sessions            POST /api/v1/sessions/:id/send
```

These are not the same shape, so `--mode http --http-url http://127.0.0.1:3001`
**will not work unmodified**. Closing it needs a dedicated `ao-daemon` adapter
translating between the two, which requires a running daemon to verify against —
it has not been built, and would be dishonest to claim as working.

Two caveats to settle before building it:

1. The ao docs describe loopback-only as *"a load-bearing architectural rule —
   no network exposure, ever."* Their local API is currently a private CLI↔app
   channel; we should confirm they intend it as a stable third-party surface
   before depending on it.
2. `ao spawn` takes an issue identifier, not a prompt. If DevPilot dispatches a
   Linear issue and `ao` is configured against the same Linear workspace, the
   identifiers line up naturally — that is the seam worth designing around,
   rather than trying to force a prompt through.

## What still works

`--mode http` against **any** orchestrator implementing our contract, and
`--mode claude-session`. The http path is verified end to end by
`packages/cli/tests/harness/run-local-dispatch.mjs`.
