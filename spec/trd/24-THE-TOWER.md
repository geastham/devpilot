# TRD 24 — The Tower
## Agent-to-agent messaging as one channel, from two engineers to a whole fleet
### v0.1 · October 2026 · Status: PART SHIPPED (§3–§5) · PART DESIGN (§6–§8)

---

## 1. The claim

An air-traffic tower exists so that aircraft which must coordinate do not do it
by shouting at each other, or through whichever controller happens to be
nearest. There is one channel, it is ordered, everyone who needs to hear a
thing hears it, and the tower itself does not fly the planes.

DevPilot has two places where agents need to coordinate and, today, two
unrelated mechanisms for it:

| | Between people's agents | Inside a fleet |
|---|---|---|
| Mechanism | A shared session (TRD 06): an ordered, end-to-end encrypted transcript | A summary pasted into the next task's prompt |
| Direction | Two-way | One-way, predecessor to successor only |
| Timing | Any time | Once, at dispatch |
| Sibling tasks | — | No channel at all |
| Mid-flight | Yes | `sendMessage` returns 501 |

This TRD makes the first mechanism good enough to use without thinking about
it (§3–§5, shipped), and then specifies how the second becomes the first
(§6–§8, not built).

## 2. What was wrong with shared sessions

TRD 06 shipped the relay, the crypto, the CLI, the MCP server and the web
room, and its wire shapes agree end to end. What it did not ship was a
workflow. As implemented:

1. Starting a session meant a trip to the dashboard, or
   `devpilot session new "…" --url … --token … --org <orgId>` — where the org
   id is shown nowhere in the product and the server ignores it in favour of
   the token's own org.
2. The output was a bare link. The recipient was assumed to know that an MCP
   server existed, how to add it, and what to ask their agent to do.
3. No agent could start a session. The MCP server had join, read, post, who.
4. A receiving agent saw a message only when its human asked it to read.
   `relay` mode was a label with no behaviour behind it.
5. `mode`, `close` and `rotate` accepted only a browser cookie and no UI called
   them, so `auto` was reachable only by hand-crafting a request.
6. The one place DevPilot wired an agent into a session itself — the session
   runner's `sessionLink` — could not work: the preamble told the agent to
   call `devpilot_session_join` with no `url`, `url` was required, and nothing
   read the `DEVPILOT_SESSION_LINK` the runner set.
7. The portal's session list linked to `/s/<id>` with no key, which lands on
   "This link has no key".
8. The web room froze silently when its one-hour token lapsed, and showed a
   participant count that only updated after someone posted.

## 3. Shipped: starting a session from inside one

`devpilot_session_share(title, context, mode?)`:

1. Resolves a machine token — flag, environment, then
   `~/.devpilot/bridge.json`, which `bridge connect` now writes (0600).
2. Generates a key locally, creates the session (the org comes from the token;
   `orgId` is no longer required for a machine), sets the mode if it is not
   `observe`, and joins.
3. Posts `context` as the first message. The context goes **into the session**,
   encrypted, not into the handoff — what the other agent needs to know is
   exactly what should not sit in a chat tool in the clear.
4. Builds the handoff with `buildSessionHandoff` (one builder, in
   `bridge-protocol`, used by the MCP server, the CLI and the portal) and
   delivers it to the **clipboard** and an owner-only file.

### 3.1 DECISION C — the link does not enter the conversation

A tool result is context. The model re-sends it to its provider on every later
turn and it is written to the transcript on disk. A join link carries the
session key, so a link in a tool result means the key is held by a party the
"end-to-end encrypted" claim says nothing about.

So `share` returns where the handoff went, never the link. `deliver: "inline"`
exists for the case where a person asks to see it, and says what that cost.
`join` with no `url` takes the link from `DEVPILOT_SESSION_LINK` (which fixes
§2.6) or from the clipboard, so the receiving side need not paste it into a
prompt either.

This is not airtight and is not claimed to be: the handoff tells the recipient
to paste the message into Claude Code, because that is what works everywhere.
The clipboard path is there for anyone who wants it.

## 4. Shipped: waiting without spending turns

`devpilot_session_wait(since?, timeoutSeconds?)` blocks on the channel until a
participant other than the caller posts, or the timeout (default 30s, max 50s)
passes.

An agent waiting for a reply had two options: call `read` in a loop, spending a
model turn and the whole context that rides with it on every empty poll, or
stop and wait for a human. Waiting on the channel costs HTTP requests and no
tokens.

### 4.1 How this squares with DECISION A (TRD 06 §3.3)

DECISION A is that agents do not converse autonomously by default, and it is
expressed in the shape of the integration: nothing pushes to an agent or wakes
it. `wait` keeps that:

- it is a call the agent chooses to make, like `read`;
- it **refuses in `observe`**, the default, where a human is relaying;
- it returns within 50 seconds whether or not anything arrived;
- it re-reads the session's mode before blocking, so an `auto` budget that ran
  out while the agent was working is noticed before the wait, not after;
- the server's message budget and TTL are unchanged and still enforced.

It also gives `relay` a meaning: an agent in `relay` may wait for messages and
must ask before replying.

## 5. Shipped: administration without a browser

`POST /mode` and `POST /close` accept the owning organization's machine token.
A token from another org gets a 404, indistinguishable from no such session.
`/rotate` remains browser-only. The three-layer guarantee that `auto` is never
unbounded — request schema, service, database CHECK — is untouched.

The portal list no longer links to a transcript it cannot open, and gains mode
and close controls. The web room re-joins on a lapsed token using the resume
header, refreshes its roster on a timer, and shows who is in the room and which
of them are agents.

---

## 6. Design: the fleet on the same channel

**Not built. Nothing below is claimed anywhere in the product.**

### 6.1 What a worker knows today

A dispatched task receives its one-sentence description, its file list, and the
final message of its direct predecessors. It does not know the ticket's goal,
the plan, its wave, or what its siblings are doing. It cannot ask anything.

### 6.2 The proposal

One shared session per run. The conductor creates it at approval, in `auto`
mode with a budget sized to the plan, and passes the link to every worker by
the route that already exists (`sessionLink` → MCP config → `join` with no
url — fixed in §3.1).

| Message | From | When | Replaces |
|---|---|---|---|
| `plan` | conductor | at approval | nothing — workers had no plan |
| `claim` | worker | on start: task id, files | the advisory "exclusive lock" sentence |
| `question` | worker | when blocked on a sibling's decision | nothing — no channel existed |
| `handoff` | worker | at completion: what changed, why, what the next task must know | `completion_summary` in a prompt |
| `integrated` | conductor | after a wave merges: the commit, any conflicts | nothing |

### 6.3 Why this is worth building, and why not yet

Worth it because the handoff today is lossy in a specific, measured way: in a
real run database, 16 of 20 completion summaries were about a failed callback
rather than about the work, and those summaries were what the next wave read.
A channel a worker can re-read, and ask a question on, removes the single
point at which context is squeezed into one paragraph.

Not yet because of three prerequisites, in order:

1. **Workers must be isolated first** (a worktree and branch per task, a merge
   step per wave). Coordinating agents that share a working tree is solving
   the wrong problem.
2. **It has to earn its tokens.** Every message a worker reads is re-read on
   each later turn. The same A/B as any harness technique applies: turns to
   first change, re-entries, cost per successful task, with and without.
3. **DECISION A needs a fleet-scoped restatement.** Inside one run, on one
   machine, started by one approval, agents replying to each other is the
   point rather than the hazard — but the budget must be sized by the plan and
   enforced by the same server-side mechanism, not waived.

### 6.4 What it must not become

- **Not a second control plane.** The conductor still advances waves from task
  state. A message is not an instruction to dispatch.
- **Not readable by the hosted plane.** Run sessions are end-to-end encrypted
  like any other. The cockpit shows that messages exist, their kind and their
  order — the things §3.2 of TRD 06 already lists.
- **Not a transport for source.** Diffs travel by git. A handoff names a
  branch and a commit.

## 7. Structured messages

A message is a bare UTF-8 string today. §6.2 needs a kind and a few fields. The
proposal is a JSON body **inside** the ciphertext with a `v` and a `type`, and
a plain-text fallback, so the server-visible `kind` enum (`chat`,
`agent_output`, `system`) does not grow and the relay learns nothing new.

## 8. Open questions

- **Addressing.** Is a `question` for everyone, or for the owner of a file?
  File ownership is in the plan, so the second is possible.
- **Retention.** Sessions never expire. A run session should, with its run.
- **Who pays the budget.** One budget per run, or per worker?
- **Rejoin identity.** Every join adds a participant row. A worker that
  restarts should resume its identity; the resume token only survives within
  one process.

## 9. Acceptance criteria

Shipped:

- **T24-AC-01** — An agent can start a session and a second agent can join,
  read the context and reply, with no dashboard step. *(E2E against a live
  bridge, both directions.)*
- **T24-AC-02** — The session key appears in no tool result unless
  `deliver: "inline"` was asked for. *(Unit test.)*
- **T24-AC-03** — `wait` refuses in `observe`, never returns the caller's own
  message, and returns on timeout. *(Unit tests.)*
- **T24-AC-04** — A machine token of the owning org can set `auto` with bounds
  and cannot set it without; another org's token gets 404. *(Route tests.)*
- **T24-AC-05** — The handoff text is identical from the CLI, the MCP server
  and the portal. *(Parity check.)*
- **T24-AC-06** — `join` with no url works from `DEVPILOT_SESSION_LINK`.
  *(Unit test.)*

Not shipped: everything in §6–§8.
