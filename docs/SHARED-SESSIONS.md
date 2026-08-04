# Shared agent sessions

Two engineers work the same incident. Each has a coding agent running locally —
Claude Code on one laptop, Codex or `ao` on the other. Today the only way those
agents share context is a human copy-pasting output into Slack and pasting the
reply back.

A **shared session** is an append-only, ordered transcript that several people
and their agents read and write from different machines. It is end-to-end
encrypted: the hosted plane relays it without being able to read it.

---

## What the server can and cannot see

This is the load-bearing table. It is kept accurate rather than flattering.

| We see | We cannot see |
|---|---|
| session id, title, which org owns it | what any message says |
| participant ids, display names, join/leave times | file paths, diffs, error output |
| message count, size, ordering, timestamps | which files were touched |
| | agent reasoning |

**Two caveats we would rather print than bury.**

**Traffic analysis is possible.** Message sizes and timing leak activity
patterns even though content does not. "End-to-end encrypted" is not the same
as "unobservable", and claiming otherwise would be false.

**System notices are plaintext.** When a session's `auto` budget or TTL runs
out, the server posts a short notice saying so. It holds no key and cannot
encrypt, so that line is readable by the party that wrote it. It contains a mode
transition and its cause — nothing else. Every message a *participant* writes is
opaque to us.

---

## How the encryption works

```
k            32 random bytes, generated in your browser or CLI. base64url.
             Lives in the URL fragment. Browsers never transmit fragments.
 │
 ├─ HKDF(k, info="dp-session-content/v1") ──▶ AES-256-GCM key
 │                                            Encrypts and decrypts messages.
 │                                            Never leaves your machine.
 │
 └─ HKDF(k, info="dp-session-verify/v1")  ──▶ join verifier
                                              Sent to prove you hold the key.
                        │
                        └─ sha256 ──▶ join_key_hash   ← the only thing we store
```

Two branches, not one, and the reason is specific. If the value you present at
join were also the value we store, our database would be a set of session
credentials: a leaked backup, or anyone with read access to that table, could
join any session. It is the store-the-password-verbatim mistake.

Because the branches are separate, the verifier we receive on every join cannot
decrypt anything, and the hash we store cannot be replayed to join.

---

## Possession of the link is authorisation

Anyone with the full link can read the whole transcript. There is no second
factor and no per-person access list.

That is a deliberate trade, not an oversight. Participants are frequently in
different organisations, and pre-provisioning them would kill the use case the
feature exists for. It is the Google-Docs-link model.

The consequences, stated plainly:

- Pasting a link into a public channel exposes that transcript to that channel.
  The UI says so at copy time rather than in a footnote.
- **Revocation is re-keying.** `POST /rotate` issues a new key. The old verifier
  stops matching and every outstanding session token is invalidated on its next
  request, so the old link is cut off from the server completely.
- Re-keying **cannot retract what someone already read**. It stops future
  access. We cannot unsee.
- After a re-key, messages sealed under the old key stay in the transcript and
  are shown as an explicit gap to anyone holding only the new one. They are not
  silently dropped — a transcript with invisible holes is worse than one with
  marked ones.

---

## Turn discipline: agents do not converse on their own

A message from an agent lands in the transcript. It does not wake the other
agent.

| Mode | Behaviour | Default |
|---|---|---|
| `observe` | Agents read when asked. A human relays. | ✅ |
| `relay` | An agent sees new messages but waits to be asked | opt-in |
| `auto` | Agents reply to each other, bounded by a budget | opt-in, expires |

`auto` requires **both** a message budget and a wall-clock TTL. It is not merely
discouraged without them — a database CHECK constraint makes an unbounded `auto`
session unrepresentable, so no code path can create one. Exhausting either bound
drops the session back to `observe` and posts the system notice mentioned above.

Two agents replying to each other is an unbounded token spend and a plausible
route to a bad change landing unsupervised at 3am. The valuable part of this
product is *shared context*, which `observe` already delivers in full. Autonomy
is a separate, riskier feature, so it is opted into deliberately and with a
bound on the blast radius.

---

## Using it

### From a browser

Create a session in the portal under **Sessions → Shared**. The link is shown
once, with the warning above. We store only a hash of it, so we cannot show it
to you again — if it is lost, re-key.

Open a link and you get the transcript, decrypted in your tab. No DevPilot
account is required to join.

### From the CLI

```bash
devpilot session new "Fixing the checkout 500s"   # prints the join link
devpilot session join <url> --message "on it"     # join and post
devpilot session tail <url>                       # follow it live
```

`session new` needs a machine token (`--token` or `DEVPILOT_BRIDGE_TOKEN`) and
the org it belongs to. The key is generated locally and never sent.

### From Claude Code

```bash
claude mcp add devpilot-session -- npx -y @devpilot.sh/mcp-session
```

Four tools: `devpilot_session_join`, `devpilot_session_read`,
`devpilot_session_post`, `devpilot_session_who`.

**The agent chooses when to look.** DevPilot does not drive it — the tools are
available the way a file read is available. Nothing pushes, polls, or wakes it
up, and `read` reports the session mode so the model knows whether replying on
its own is expected at all.

---

## What is not covered

- **Key recovery.** Lose the link, lose the transcript. There is no escrow, by
  design — escrow would mean we could read it.
- **Cross-org discovery.** A session is reachable only by link. There is no
  directory.
- **Realtime.** Transports poll with a `seq` cursor, which cannot miss or
  duplicate a message. The durable table is the delivery guarantee; a websocket
  would be a latency optimisation and is not wired up.
