# The status line

`devpilot statusline` puts one line at the bottom of Claude Code:

```
Opus 5.5 · ctx 41% · cache warm · ~$2.18 · 5h 37% (resets 3h30m) · 7d 12%
```

| Segment | What it is |
|---|---|
| model | The session's model |
| `ctx 41%` | How full the context window is |
| `cache warm` / `cache cold` / `· 3 misses` | The prompt cache, as Claude Code diagnoses it |
| `~$2.18` | The session's cost at API list prices. An estimate; nobody on a subscription is billed it |
| `5h 37% (resets 3h30m)` | How much of your 5-hour subscription window is used, and when it resets |
| `7d 12%` | The same for the 7-day window |

A segment is printed only when Claude Code supplied the data for it. The two
window segments exist for Pro and Max subscribers; an API-key user has none,
and sees none — not `0%`.

## Installing it

```
devpilot statusline install            # for your user (~/.claude/settings.json)
devpilot statusline install --project  # this project only (.claude/settings.local.json)
devpilot statusline uninstall
```

**It does not replace a status line you already have.** Claude Code has one
status line slot and no way to add a second line beside an existing one. So
`install` records the command it finds and sets DevPilot's to run it first:
your line appears exactly as before, with DevPilot's under it. `uninstall`
restores your setting exactly as it was. A settings file that is not valid JSON
is left untouched, with a message saying so.

It takes effect in new Claude Code sessions.

## What it records

The same input it prints from, it writes down — under `~/.devpilot/statusline`
on your machine:

- `sessions/<session-id>.json`: the session's latest state — model, cost,
  peak context percentage, cache misses by cause, the tokens re-cached because
  of misses, and where the two windows stood.
- `window-<date>.jsonl`: each change in what the windows read, with what the
  reporting session had cost by then. Day files older than nine days are
  deleted.

Percentages, counts, timestamps, and cause names from Claude Code's own list
(`ttl_expired_5m`, `tools_changed`, …). Nothing you type and nothing an agent
writes passes through it; the fields it does not read are not kept.

A connected bridge sends these with each session's reading, and the hosted
Efficiency page shows them. Without a bridge they stay on the machine.

## Why the window share is an estimate

The percentage Claude Code reports is your **account's**: every session on
every device moves the same number. Two agents running side by side each see
it go from 20% to 30%, and subtracting "last minus first" per session would
count those ten points twice.

So DevPilot shares the movement out. For each reset window it takes how far the
window moved while this machine was taking readings, and divides that among
the sessions it metered in proportion to what each cost at API rates in that
window. Summed over sessions, the shares equal the movement exactly.

What it cannot see:

- Usage this machine did not meter — another device, the web app, a session
  with no status line — moves the window too, and that movement lands on the
  sessions that were metered.
- Usage before the first reading in a window is not counted at all.
- A subscription does not charge the window in exact proportion to list price;
  cost is a proxy for it.

Agents DevPilot dispatches have no status line. The session runner logs the
same window readings from their output stream, so their share lands on them
and not on whatever else was open.

## Cache-miss cost

Claude Code reports how many input tokens had to be written to the cache again
because of misses. DevPilot prices those at the session model's cache-write
rate, less what reading them would have cost. That is a measurement of what
happened, at API list rates — not an inference from gaps in a transcript.
These statistics cover the session's main conversation only, and need Claude
Code 2.1.251 or later (causes: 2.1.260).

## Speed

The status line runs on every assistant message. `devpilot statusline` takes a
path that loads none of the rest of the CLI: about 30 ms, against about 270 ms
for a full start.

## Environment

| Variable | Effect |
|---|---|
| `NO_COLOR` | No ANSI colour in the line |
| `DEVPILOT_STATUSLINE_DIR` | Where records are kept, instead of `~/.devpilot/statusline` |
