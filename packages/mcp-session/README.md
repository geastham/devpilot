# @devpilot.sh/mcp-session

An MCP server that lets a local coding agent take part in a **DevPilot shared
session** — an ordered, end-to-end encrypted transcript that several people and
their agents read and write from different machines.

The hosted plane relays ciphertext it cannot read. The encryption key lives in
the join link's URL fragment and never leaves the machines holding it.

## Install

```bash
claude mcp add devpilot-session -- npx -y @devpilot.sh/mcp-session
```

Or in `.mcp.json`:

```json
{
  "mcpServers": {
    "devpilot-session": {
      "command": "npx",
      "args": ["-y", "@devpilot.sh/mcp-session"]
    }
  }
}
```

## Sharing the session you are in

Say **"share this session with Sam"** and the agent calls
`devpilot_session_share`. It creates the session, posts what it knows as the
first encrypted message, and puts a ready-to-send note on your clipboard (with
a copy, readable only by you, under `~/.devpilot/handoffs/`). You send the note
to Sam; Sam pastes it into their own Claude Code.

Starting a session needs a DevPilot machine token. It is picked up from
`devpilot bridge connect`, or from `DEVPILOT_BRIDGE_TOKEN` in this server's
environment. **Joining a session needs nothing.**

The link is the session key, so the tool does not show it to the agent: a tool
result is context the model re-sends to its provider on every later turn. Ask
for it explicitly and it is returned, with a note of what that cost.

## Tools

| Tool | Does |
|---|---|
| `devpilot_session_share` | Start a session from this one; hand you the note to send |
| `devpilot_session_join` | Join with a link — or, with none, from the clipboard or `DEVPILOT_SESSION_LINK` |
| `devpilot_session_read` | Read the transcript, decrypted locally. `since` takes a seq cursor |
| `devpilot_session_wait` | Block until someone else posts, or a timeout passes |
| `devpilot_session_post` | Append a message, encrypted locally |
| `devpilot_session_who` | List participants |

## The agent decides when to look

DevPilot does not drive your agent. These tools are available the way a file
read is available — nothing pushes to it or wakes it up.

Sessions default to **`observe` mode**: agents read when asked and a human
relays. `relay` and `auto` are opt-in per session, and `auto` is bounded by a
message budget and a wall-clock TTL that the server enforces. Two agents
replying to each other unsupervised is an unbounded token spend and a plausible
route to a bad change landing at 3am, so it is a deliberate choice rather than a
default.

`read` reports the current mode so the model knows whether replying on its own
is expected at all.

`wait` does not change any of that. It is a read the agent chooses to make that
happens to block; it returns within 50 seconds whether or not anything arrived;
and in `observe` it refuses, because a human is relaying and there is nothing
to wait for. Where a session has been opted into `relay` or `auto`, it replaces
calling `read` in a loop — which spends a model turn, and all the context that
rides with it, on every empty poll.

## What the relay can and cannot see

| Sees | Cannot see |
|---|---|
| session id, title, participant names | message content |
| message count, size, ordering, timestamps | file paths, diffs, error output |
| which org owns the session | agent reasoning |

Two honest caveats rather than a clean claim:

- **Traffic analysis is possible.** Message sizes and timing leak activity
  patterns. Content does not leak.
- **`system` messages are plaintext.** When a session's `auto` budget or TTL
  runs out, the server posts a notice saying so. It holds no key and cannot
  encrypt, so those notices are readable by the server — which wrote them. They
  contain a mode transition and its cause, nothing else. Every message a
  *participant* writes is opaque.

## Possession of the link is authorisation

Anyone with the full link can read the whole transcript. There is no second
factor and no per-person access list — that is what lets a collaborator from
another organisation join with no setup.

So: send a link the way you would send a password. Pasting one into a public
channel exposes the transcript to that channel.

Revocation is **re-keying**. It ends access for the old link — the old proof
stops working and every outstanding session token is invalidated — but it
cannot retract what someone has already read.

## License

MIT
