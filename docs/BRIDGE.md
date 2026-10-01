# Keeping the bridge running

`devpilot bridge connect` is the process that connects a machine to the hosted
plane. It registers the machine, reports the Claude Code sessions running on
it, and runs work dispatched to it. While it runs, the cockpit sees this
machine. When it stops, the cockpit stops hearing about it, and nothing on the
machine says so.

`connect` runs in the foreground. This page is about the two ways to run it
without a terminal, and how to see what is running.

## Three ways to run it

| | Closing the terminal | Restarting the machine | The bridge exits |
|---|---|---|---|
| `devpilot bridge connect` | stops it | stops it | it stays stopped |
| `devpilot bridge start` | keeps running | stops it | it stays stopped |
| `devpilot bridge install` | keeps running | starts again at login | it is restarted |

All three run the same thing. `start` and `install` launch
`devpilot bridge connect` with the options you give them; there is no second
implementation of the bridge.

Run one at a time. Two bridges on one machine each report every session.
`start` refuses while the login service is installed, `install` refuses while
a bridge started with `start` is running, and each names the command to run
instead.

A `connect` left running in a terminal is not refused on, because it cannot be
told apart from a bridge run under another `HOME` for a test. It is reported:
`start` and `install` print a warning naming its process id, and `status`
lists it as "Other bridge". Stop it where it was started (Ctrl+C) before
relying on either.

## `start` and `stop`

```bash
devpilot bridge start --token dp_orch_… --repos acme/widget --plan
devpilot bridge stop
```

`start` takes the same options as `connect`. It starts the bridge detached
from the terminal, then waits until the bridge has logged `✓ Registered` and
is still running a moment later. If the bridge exits instead (a revoked token,
an option `connect` rejects), or has not registered within 30 seconds, `start`
stops it, prints the first error lines from its log, and exits 1. A `start`
that exits 0 means a registered bridge is running.

`stop` sends SIGTERM, which is the bridge's ordinary shutdown, and waits up to
10 seconds before sending SIGKILL. Before signalling, it checks that the
recorded process is still a bridge: a process id can outlive its process and
be handed to another, so the process's command line has to contain
`bridge connect`. If it does not, `stop` clears the stale record and signals
nothing.

## `install` and `uninstall`

```bash
devpilot bridge install --repos acme/widget --plan
devpilot bridge uninstall
```

`install` writes a login service that runs the bridge, loads it, and waits for
the bridge to register, as `start` does. If the bridge cannot register, the
service is unloaded and removed again rather than left to be restarted and
fail every 30 seconds.

| Platform | What is written | How it is loaded |
|---|---|---|
| macOS | a LaunchAgent, `~/Library/LaunchAgents/sh.devpilot.bridge.plist` | `launchctl bootstrap gui/<uid>`, falling back to `launchctl load -w` |
| Linux | a systemd user unit, `~/.config/systemd/user/devpilot-bridge.service` | `systemctl --user daemon-reload`, then `enable --now` |
| Windows, others | nothing; `install` says so and exits 1 | use `devpilot bridge start` |

The service file holds the absolute path to `node`, the absolute path to the
CLI, the `connect` options you gave, the log path, and a `PATH`.

- **`PATH`.** A service is not started from your shell and does not get its
  `PATH`. The bridge runs `git` and `claude`, so the file is given the
  directory `node` is in, the directory `claude` is in (if it was on your
  `PATH` when you ran `install`), your `PATH` as it was then, and the standard
  system directories.
- **Environment.** For the same reason, `DEVPILOT_*` variables set in your
  shell do not reach the service. Give those settings to `install` as flags.
- **Restarts.** The service restarts the bridge whenever it exits, at most
  once every 30 seconds.
- **Linux without a login session.** A systemd user unit runs while you are
  logged in. On a machine that should run the bridge with nobody logged in,
  also run `loginctl enable-linger $USER`.

To change the options, `uninstall` and `install` again. `install` does not
overwrite a service that is already there.

## `status`

```
$ devpilot bridge status
🌉 DevPilot bridge

  Credentials    saved for https://devpilot.sh
                 ~/.devpilot/bridge.json
  Bridge         running in the background — pid 11912, up 3h 12m (since 2026-10-01T15:19:10.174Z)
                 started with: --repos acme/widget --plan
  Login service  not installed
  Log            ~/.devpilot/bridge/bridge.log

    │ ✓ Registered
    │    orchestrator: orch_…
    │    repos: acme/widget
    │ ✓ Listening (realtime)
    │    Agents run on THIS machine. Ctrl+C to disconnect.
    `devpilot bridge logs -f` follows it
```

It takes no flags and makes no network request. It reports whether a token is
saved and for which bridge (never the token), whether a bridge is running and
how, whether the login service is installed and loaded, and the last lines of
the log.

The exit code is 0 when a bridge is running and 1 when not:

```bash
devpilot bridge status >/dev/null || devpilot bridge start
```

"Running" here means started by `start` or by the login service. A
`bridge connect` started some other way is listed on its own line ("Other
bridge", `unmanaged` in the JSON) and does not change the exit code.

`--json` prints the same information for scripts.

`status` reports on this machine only. Whether the hosted side is hearing from
it is shown in the cockpit; when it is not, the log lines here are where the
reason is.

## `logs`

```bash
devpilot bridge logs          # the last 50 lines
devpilot bridge logs -n 200
devpilot bridge logs -f       # keep printing as the bridge writes
```

## Where things live

| Path | What |
|---|---|
| `~/.devpilot/bridge.json` | The bridge URL and the machine token. Readable by you only. |
| `~/.devpilot/bridge/state.json` | The bridge `start` launched: process id, start time, URL, options. No token. |
| `~/.devpilot/bridge/service.json` | What the login service was installed with. No token. |
| `~/.devpilot/bridge/bridge.log` | Output of the background bridge, from `start` and from the service. |
| `~/.devpilot/bridge/bridge.log.1` | The previous log, kept when the current one passed 5 MB. |

`DEVPILOT_BRIDGE_STATE_DIR` moves the `bridge/` directory (the state, the
service record, and the log). It does not move `bridge.json` or the service
file.

The log is capped when a `bridge` command runs (`start`, `install`, `status`,
`logs`): past 5 MB it is copied to `bridge.log.1` and emptied. A service left
alone for months, with none of those commands run, is not capped.

## The token

The token is in `~/.devpilot/bridge.json` and nowhere else. It is not on the
command line of the background bridge, where `ps` would show it to every
process on the machine, and not in the plist, the unit file, the state file,
or the log.

When you pass `--token` (or `--url`) to `start` or `install`, they save the
pair to `bridge.json` first and start the bridge without it; the bridge reads
the file, as a bare `devpilot bridge connect` does. If that bridge then fails
to register, the file is put back as it was, so a token the bridge refused is
not the one that stays saved.

Two consequences:

- `--no-save` cannot be combined with `start` or `install`. A background
  bridge has nowhere else to read a token from. Use
  `devpilot bridge connect --no-save` in the foreground.
- `--session-api-key` is also treated as a secret. `start` passes it to the
  bridge in its environment and records it nowhere. `install` refuses it: a
  service has no environment to carry it in, so it would have to be written
  into the service file.

`devpilot bridge disconnect` removes the saved token. It does not stop a
running bridge, which read the token when it started: use `devpilot bridge
stop` or `devpilot bridge uninstall` as well.

## Upgrading the CLI

A running bridge is the version it was started from, and an upgrade replaces
the files underneath it. Stop it first, and start it again afterwards:

```bash
devpilot bridge status        # note the "started with" line
devpilot bridge stop          # or: devpilot bridge uninstall

npm install -g @devpilot.sh/cli@latest    # or: devpilot update

devpilot bridge start --repos acme/widget --plan      # or: devpilot bridge install …
```

The options are not remembered across a `stop` or an `uninstall`; `status`
shows them while the bridge is still running. The token is remembered, so it
does not need passing again.

For the login service, reinstalling is also what picks up a move: the service
file holds the absolute paths to `node` and to the CLI as they were when
`install` ran. Switching Node versions with a version manager, or installing
the CLI somewhere else, leaves the service pointing at the old ones until it
is installed again.

## What has and has not been exercised

`start`, `stop`, `status` and `logs` are covered by tests that spawn a real
detached process, find it through `ps`, signal it and wait for it, and were
run by hand on macOS against a local stand-in for the hosted plane.

`install` and `uninstall` are tested against a recorder in place of
`launchctl` and `systemctl`: the tests check the file that is written (the
plist is also parsed with `plutil`), the commands issued and their order, and
the rollback when loading or registering fails. They were not run against a
real launchd or systemd. The Windows path for `start` and `stop` has not been
run on Windows.
