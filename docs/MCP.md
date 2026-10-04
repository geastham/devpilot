# DevPilot as an MCP server

There are two, for two different callers.

| | `devpilot mcp` (local) | `https://devpilot.sh/api/mcp` (hosted) |
|---|---|---|
| For | A coding agent on this machine, e.g. Claude Code | An assistant that is not on a machine, e.g. Claude on the web |
| Runs | On this machine, in the session's directory | On the hosted plane, which has no code |
| Add it | `devpilot mcp install` | Settings → Connect on devpilot.sh |
| Can | Make a shared-session link, set up this repository, sync its graph, ask what a change reaches, read work history | Read the fleet, sessions, cost and shared graphs; ask a machine to share a graph |

## The local server

```
devpilot mcp install            # every project (claude mcp add --scope user)
devpilot mcp install -s project # this project's .mcp.json
```

It appears in Claude Code as `devpilot-local`. Its tools:

**Shared sessions** (from `@devpilot.sh/mcp-session`)

- `devpilot_session_share` — start a shared, end-to-end encrypted session and
  make the link that brings someone into it. The link goes to the clipboard and
  an owner-only file, never into the conversation: it carries the key.
  - `intent`: `look` (default — "I'm seeing something, come and see"; agents
    post only when asked), `pair` (work it through; agents ask before
    replying), `fix` (the agents sort it out between them, bounded). It sets
    the mode.
  - `lifetime`: `1h`, `24h` (default) or `7d`. When it ends, nothing can be
    read or posted and the stored messages are deleted.
  - The repository's `owner/name` is attached from the `origin` remote.
- `devpilot_session_join` — joins, and in the same answer says why the agent
  was brought in, what is expected of it in this mode, when the session ends,
  and what has been said so far. No second call to find out.
- `devpilot_session_link` — gives the person the link for the session already
  started or joined, on a line of its own. For "show me the link", and for
  anyone not at the machine whose clipboard has it (a phone, a remote session,
  SSH). It starts nothing. Showing the link puts the key in the conversation,
  and the answer says so.
- `devpilot_session_read`, `_wait`, `_post`, `_who`.

Someone who has never used DevPilot can join with no account:
`claude mcp add --scope user devpilot-local -- npx -y @devpilot.sh/mcp-session`,
then paste the link. The link's own page says the same.

**This repository**

- `devpilot_repo_status` — connected? indexed? shared? Changes nothing.
- `devpilot_repo_init` — build or refresh the code graph index, locally. With
  `share: true`, also send its structure (paths, symbol names, references —
  never file contents) to the hosted plane. The model is told to pass
  `share: true` only when the person asked; without it the result lists what
  sharing would send and nothing leaves the machine. Shares whatever branch the
  session is on.
- `devpilot_graph_sync` — re-index what changed on disk; if the repository is
  shared and on its default branch, send the difference.

**Code memory**

- `devpilot_code_impact({ paths })` — what depends on these files, within two
  steps, and which tests reach them. From the local index, so it reflects the
  working tree as of the last sync.
- `devpilot_history({ paths })` — what earlier DevPilot tasks did to these
  files: how each ended, whether it conflicted or was retried, what its agent
  said. Needs a local cockpit.

Whether giving an agent these saves tokens or time has not been measured.

`DEVPILOT_MCP_TOOLS=session,history,repo` limits which groups are offered;
every tool is a schema in the agent's context on every turn.

## The hosted server

See the website repository's `docs/MCP.md`. A request it leaves for a machine
is carried out by a bridge started with `--allow-remote-config`; see
[CODE-GRAPH.md](CODE-GRAPH.md).
