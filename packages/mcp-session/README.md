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

## Tools

| Tool | Does |
|---|---|
| `devpilot_session_join` | Join with a link (`https://devpilot.sh/s/<id>#k=<key>`) |
| `devpilot_session_read` | Read the transcript, decrypted locally. `since` takes a seq cursor |
| `devpilot_session_post` | Append a message, encrypted locally |
| `devpilot_session_who` | List participants |

## The agent decides when to look

DevPilot does not drive your agent. These tools are available the way a file
read is available — nothing pushes, polls, or wakes it up.

Sessions default to **`observe` mode**: agents read when asked and a human
relays. `relay` and `auto` are opt-in per session, and `auto` is bounded by a
message budget and a wall-clock TTL that the server enforces. Two agents
replying to each other unsupervised is an unbounded token spend and a plausible
route to a bad change landing at 3am, so it is a deliberate choice rather than a
default.

`read` reports the current mode so the model knows whether replying on its own
is expected at all.

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
