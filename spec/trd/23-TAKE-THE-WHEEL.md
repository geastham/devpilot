# TRD 23 — Take the Wheel
## Resuming a Held Session Under DevPilot · The Planning Handoff
### v1.1 · August 2026 · Status: BUILT

> **Change log — v1.1 (22 Aug 2026)**
> - All five waves built, merged and deployed. CLI 0.5.12+.
> - **§3.4 REVERSED on the live case, and it was the wrong call.** v1.0 refused
>   every action on a live session and deferred forking. But the rule was never
>   "leave live sessions alone" — it was "do not put a second process on one
>   transcript", and **planning touches no transcript at all**. So a live
>   session can now be PLANNED and still cannot be CONTINUED. Live is the state
>   a busy fleet is mostly in, and refusing the safe mode along with the unsafe
>   one withheld the feature exactly when it is most useful.
> - **Forking is dropped rather than deferred.** `--fork-session` was verified
>   to work (new id, context retained) but mints a second cockpit row for what a
>   person thinks of as one piece of work. Planning a live session gets the same
>   outcome — waves you approve — without that reconciliation problem.
> - §7.1 fixed: the applier required `--session-api-url`, so a bridge started
>   with `--plan --cockpit-url` could take the wheel in NEITHER mode. Planning
>   never touches the runner; gating both on it was simply wrong.
> - §3.5 built: `resume` carries a mode, and planning goes through the conductor.
> - **Not proven:** see §11.

> **Depends on:** `21-FLEET-INTROSPECTION.md` (the scanner, `origin='adopted'`,
> DECISION A), `22-PROJECTS-AND-OBSERVATION.md` (observation, `projects`), and
> the streaming pipeline shipped 2026-08-22 (`session_stream_events`,
> `session_telemetry`, the Live Watch strip).
>
> This TRD does **not** overturn TRD 21 §3.4. It resolves it.

---

## 1. The question the cockpit cannot answer

The cockpit now shows every Claude Code session on your machines, live, with a
title, a body, a repo, a file list and a link. A person looks at it and asks:

> *What do I do from here?*

Today the honest answer is **Open** — a link to `claude.ai/code`, which leaves
the product. That is not a failure of the UI. It is a capability fact:

**DevPilot cannot drive a session it did not spawn.** There is no handle on a
running `claude` process. No IPC, no attach, no API. TRD 21 §3.4 is right that
offering a control the product cannot honour is worse than offering none.

But that reasoning assumed the options were *steer* or *nothing*, and there is
a third.

### 1.1 The unlock

```
-r, --resume [value]     Resume a conversation by session ID
--fork-session           When resuming, create a new session ID
```

DevPilot already runs a session-runner that spawns `claude` and reports back
(TRD 01). **If it spawns with `--resume <uuid>`, the resulting session is
DevPilot-spawned** — and every mechanism already built for dispatched work
applies to it immediately: status callbacks, stream events, telemetry, the plan
cockpit, approve/replan/abort.

The wheel is not taken from a running agent. It is picked up from a stopped one.

---

## 2. Goals

1. **Take the wheel.** A held session resumes under DevPilot from the cockpit,
   and from that moment DevPilot owns it.
2. **Say something.** Taking the wheel may carry an instruction — the
   send-message capability, which turns out to be the same mechanism (§3.2).
3. **Hand to the planner.** A resumed session routes through the conductor, so
   what you get is a *plan to approve*, not a chat box. This is the point.
4. **The UUID never leaves the machine.** §3.3.

### Non-Goals

- **Driving a live session.** Still impossible, still not attempted. A live
  session offers **Open**; a held one offers **Take the wheel** (§4.1).
- **Rebuilding Claude Code in the browser.** The cockpit is where you see the
  fleet and decide what to pick up. It is not a chat client, and competing with
  one would be a large build against a product that already does it well.
- **Automatic resumption.** Nothing resumes without a person asking. An agent
  that restarts itself on a repo is precisely what nobody wants.

---

## 3. Design

### 3.1 The shape

```
  cockpit                    hosted plane                 machine
     │                            │                          │
     │  Take the wheel ─────────▶ │                          │
     │  (+ optional message)      │ session_commands row     │
     │                            │   command='resume'       │
     │                            │◀──── poll (already runs) │
     │                            │                          │
     │                            │        adoptionKey ──▶ local transcript
     │                            │                     claude --resume <uuid>
     │                            │                          │
     │                            │◀─ status/stream/telemetry │
     │  plan to approve  ◀────────│◀─ conductor plan          │
```

### 3.2 One command, not two — DECISION A

Take-the-wheel and send-message look like two features. They are one:

| What the user wants | What it is |
| --- | --- |
| "Pick this up and carry on" | resume with no prompt |
| "Pick this up and do X" | resume with prompt X |

So there is **one** new command, `resume`, whose payload carries an optional
`message`. Modelling them separately would produce two code paths that must
stay in sync forever, for a distinction the machine does not have — `claude
--resume` takes a prompt or does not.

### 3.3 The hosted plane cannot name a session — DECISION B

`adoptionKey` is `sha256(machineName + ':' + sessionUuid)`. It is **one-way by
construction** (TRD 21 §4.1), and the Claude session UUID has never crossed the
wire.

That is not an obstacle to work around. It is the property that makes this safe,
and the design keeps it:

- The hosted plane queues a command against a **DevPilot session id**.
- The **machine** resolves that to an `adoptionKey`, then to a local transcript
  path and UUID, from state only it holds.

So a compromised control plane cannot name a session on someone's laptop to
resume, because it does not know what any session is called. It can only point
at a row it already had, and the machine decides what that means locally.

This also preserves TRD 05's invariant unchanged: no inbound connection, the
machine polls, and the machine is still the only thing that starts work.

### 3.4 Resume in place, fork when live — DECISION C

`claude --resume <uuid>` continues the same session and appends to the same
transcript. `--fork-session` branches a new one.

| Session state | `continue` | `plan` |
| --- | --- | --- |
| **held** (transcript quiet) | `--resume` — same UUID, same `adoptionKey`, the existing row keeps updating | yes |
| **live** | **refused** — two processes on one transcript corrupts it | **yes** — it touches no transcript |

> **Corrected in v1.1.** v1.0 refused both on a live session and planned to add
> `--fork-session` later. That read the rule too broadly: the constraint is
> about the *transcript*, and planning never opens it. Forking was then dropped
> entirely — it works, but a new UUID means a new `adoptionKey` means a second
> cockpit row for one piece of work, and planning reaches the same outcome
> without that.

### 3.5 The handoff is to the planner, not to a prompt box

This is the product argument, and it is why the slice is worth building.

A resumed session could accept free-form chat. It should not, because that is
Claude Code with extra steps and a worse text box. What the cockpit has that
`claude.ai/code` does not is **fleet-level judgement and a planning agent**.

So a resumed session runs under `--plan`: the conductor reads the session's
state, proposes a wave plan, and stops at the review gate that already exists
(TRD 01, TRD 16). The user gets *a plan to approve*, rendered by the plan
cockpit that is already built and already mirrored.

`--plan` is currently opt-in per bridge. A `resume` command carries its own
intent, so it routes through the conductor **regardless of the bridge's default
mode** — a machine running in single-session mode still gets a planned resume,
because the person asked for one from a planning surface.

---

## 4. Surfaces

### 4.1 The session detail page

Three states, labelled by what is true rather than by what is convenient:

| State | Control | Result |
| --- | --- | --- |
| Live | **Open** | `claude.ai/code` — only that can drive a live session |
| Held | **Take the wheel** | Optional message, then resume under the planner |
| Driven | **Plan cockpit** | Already exists; approve / replan / abort |

The "Driven" state is not new UI. Once resumed, the session reports like any
dispatched run and the existing plan cockpit renders it.

### 4.2 Copy discipline

The button says **Take the wheel**, not *Resume* or *Continue*. It names the
transfer of responsibility, which is the thing the user is actually deciding:
after this, an agent runs on their machine under DevPilot's direction rather
than theirs.

---

## 5. Data model

### 5.1 `session_commands.command` gains `resume`

```ts
export const SESSION_COMMANDS = ['approve', 'replan', 'abort', 'resume'] as const;
```

Payload widens:

```ts
payload: jsonb('payload').$type<{
  constraints?: string[];       // replan
  message?: string;             // resume — what to say on pickup
}>()
```

The CHECK constraint in `20260821…` must be extended in a migration; an unknown
command is currently unrepresentable, which is the behaviour we want kept.

### 5.2 `dispatch_sessions` — no new column

A driven session is recorded in `metadata`:

```ts
{ driven: true, drivenAt: string, drivenBy: string /* user id */ }
```

Not a column, because nothing queries on it: the cockpit reads it to pick a
control, and that is a per-row render. Promote it if that changes.

**`origin` stays `adopted`.** It records how the row came to exist, which does
not change retroactively — and flipping it to `dispatched` would trip the CHECK
from TRD 22 §3.2, since a driven session need not have a Linear issue.

---

## 6. API

### 6.1 `POST /api/sessions/:id/commands` — the guard relaxes for `resume`

TRD 21 §3.4 made this route 409 for `origin='adopted'`, because there was no
handle to send a command to. `resume` is the command that **creates** the
handle, so it is the one exception, and it is narrow:

```ts
if (session.origin === 'adopted' && body.command !== 'resume') throw conflict(...)
```

Every other command against an adopted session still 409s, and for the same
reason as before.

### 6.2 Refusals that say what is true

| Condition | Response |
| --- | --- |
| Session live **and** mode is `continue` | 409 `session_live` — "still running, so continuing would put two agents on one transcript; open it in Claude Code, or plan the work instead" |
| Session live **and** mode is `plan` | allowed |
| No machine online for the repo | 409 `no_machine` — the bridge must be connected to act |
| Session already driven and running | 409 `already_driven` |

A refusal names the condition rather than saying the request was invalid,
because every one of these is a state the user can fix.

---

## 7. The bridge

### 7.1 Commands are polled regardless of `--plan`

Today `CommandApplier` is constructed only when `options.plan && conductorWatcher`
(`connect.ts`). A bridge in single-session mode polls no commands at all — so a
`resume` queued against it would sit pending forever.

The command poll moves out from behind `--plan`. `approve`/`replan`/`abort` still
require a conductor and are refused locally without one; `resume` does not.

### 7.2 `ResumeApplier`

1. Resolve `sessionId → adoptionKey` from the local ledger, then
   `adoptionKey → { transcriptPath, sessionUuid }`.
2. Re-probe the transcript: if it is live, **refuse and acknowledge as failed**
   with a reason, so the cockpit stops offering the wrong control.
3. Spawn through the session-runner with `--resume <uuid>`, `--plan` semantics,
   and the message as the prompt when one was given.
4. Acknowledge only **after** the runner accepts, matching the existing
   ordering rule (`command-applier.ts`): a decision a human made must not be
   dropped because a laptop was asleep.

Resolution can fail legitimately — the ledger is per-machine, and a session
observed by a laptop that has since gone offline cannot be resumed by another.
That is a `no_machine` refusal, not an error.

### 7.3 Idempotence

The existing partial unique index allows one pending command per session, so a
double-click cannot queue two resumes. A resume applied but not acknowledged is
retried, and a second `--resume` against a session already running under the
runner is refused locally by the runner's own concurrency check rather than
starting a second agent on the same repo.

---

## 8. Security

| # | Requirement | Enforcement |
| --- | --- | --- |
| S-01 | The hosted plane cannot name a local session. | §3.3 — the UUID never crosses; resolution is machine-side from `adoptionKey`. |
| S-02 | Nothing resumes without a person. | `requireOrgRole(['owner','admin','member'])`; no automatic path exists. |
| S-03 | A resume cannot start a second agent on one repo. | §7.3 and the runner's concurrency cap. |
| S-04 | A resumed agent's permissions are the machine's, not the caller's. | The runner's `--permission-mode` is bridge configuration and is not settable from the command payload. |
| S-05 | The message is attacker-influenced only by the person typing it. | It is org-member input, length-capped, and passed as the prompt — never interpolated into shell. `execFile`, no shell, as everywhere else. |

S-04 deserves emphasis: a payload that could raise permission mode would let a
cockpit user escalate what an agent may do on someone else's laptop. The mode
stays where it is — with the operator who started the bridge.

---

## 9. Acceptance criteria

| # | Criterion |
| --- | --- |
| T23-AC-01 | A held adopted session resumes from the cockpit and reports status as a DevPilot-owned run. |
| T23-AC-02 | The resumed run appends to the SAME transcript, so the cockpit row is continuous rather than duplicated. |
| T23-AC-03 | A `resume` carrying a message reaches the agent as its prompt. |
| T23-AC-04 | A live session refuses `continue` with `session_live`, and ACCEPTS `plan`. |
| T23-AC-05 | Every non-`resume` command against an adopted session still 409s. |
| T23-AC-06 | The Claude session UUID appears in no request body and no hosted column. |
| T23-AC-07 | A bridge without `--plan` still polls and applies `resume`. |
| T23-AC-08 | A resumed session reaches the plan review gate and renders in the existing plan cockpit. |
| T23-AC-09 | A double-click queues one command, not two. |
| T23-AC-10 | A resume for a machine that is offline refuses with `no_machine` rather than hanging. |

---

## 10. Waves

1. **Protocol + schema** — `resume` in `SESSION_COMMANDS`, payload widening, CHECK migration.
2. **Runner** — `--resume` / prompt passthrough in `claude-runner.ts` and the session-runner API.
3. **Bridge** — command poll out from behind `--plan`; `ResumeApplier`; liveness refusal.
4. **Hosted** — the narrowed guard, the three refusals, `metadata.driven`.
5. **Cockpit** — the three-state control, the message field, and the handoff into the plan cockpit.

---

## 11. What is proven, and what is not

**Proven against the real CLI**, not assumed — the load-bearing assumption of
the whole design:

```
run1 session_id: 4487eba7-…  → ALPHA
run2 session_id: 4487eba7-…  → ALPHA     (same id, context retained)
user turns in ONE transcript: 2
```

`--fork-session` was checked the same way (new id, context retained) before
being dropped for the reason in §3.4.

**Proven by test.** 19 applier tests covering every refusal path, 12 on the
hosted guard. The narrow exception is asserted directly: admitting `resume` must
not admit `approve`/`replan`/`abort`.

**PROVEN END TO END, 22 Aug 2026.** A bridge on 0.5.13 with a session runner,
a held session observed from a real repo, the button clicked in the production
cockpit:

```
bridge: took the wheel on openconjecture/trd23-verify with an instruction
        — it now reports as a DevPilot run

transcript (ONE file, four turns):
  user      Reply with exactly: STAGE-ONE. Do not use any tools.
  assistant STAGE-ONE
  user      What word did you reply with earlier? Reply with only that word.
  assistant STAGE-ONE
```

The agent picked up the same conversation, remembered its own earlier answer,
and appended to the same transcript — so the cockpit row stayed continuous.

That run also found the one thing unit tests could not: `callbackUrl` pointed
at `/api/orchestrator`, which does not exist, so every callback 404'd. Fixed by
sending none — an adopted session is reported by the observation sweep, which is
already watching that transcript.

**NOT proven — carried forward:**
- **The planning brief has never been read by the conductor.** `buildSessionBrief`
  is asserted for shape and ordering, not for whether the planner produces a
  good decomposition from it.
- **`metadata.driven` is written by nothing yet.** The cockpit reads it to pick
  the "already driven" state, and no code path sets it — so a resumed session
  will not show that state until it does.

## Decisions other TRDs must respect

- **Take-the-wheel and send-message are one command.** Do not split them.
- **The Claude session UUID stays on the machine.** Any future feature needing
  to address a local session addresses it by `adoptionKey`.
- **A live session is never CONTINUED in place.** Planning it is fine and
  expected; only spawning a second process on its transcript is forbidden.
- **The handoff is to the planner.** If a future surface adds free-form chat to
  a driven session, it is competing with Claude Code and should say why.
