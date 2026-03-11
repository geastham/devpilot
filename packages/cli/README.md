# @devpilot/cli

Command-line interface for DevPilot - manage your AI coding agent fleet from the terminal.

## Installation

```bash
npm install -g @devpilot/cli
# or
pnpm add -g @devpilot/cli
```

## Quick Start

```bash
# Initialize DevPilot in your project
devpilot init

# Start the local server with UI
devpilot serve

# Check fleet status
devpilot status
```

## Commands

### `devpilot init`

Initialize DevPilot in the current directory. Creates a `.devpilot/` directory with:
- `config.yaml` - Configuration file
- `data.db` - SQLite database for local storage

### `devpilot serve`

Start the local DevPilot server with web UI.

Options:
- `-p, --port <port>` - Port to run the server on (default: 3847)
- `--db <path>` - Path to SQLite database (default: .devpilot/data.db)
- `--no-open` - Don't open browser automatically

### `devpilot status`

Display current fleet status including active sessions and runway.

### `devpilot config`

Manage DevPilot configuration.

```bash
# List all configuration
devpilot config --list

# Get a specific value
devpilot config ui.port

# Set a value
devpilot config ui.port 3000
```

### `devpilot config linear`

Configure Linear integration.

```bash
# Set Linear API key and team ID
devpilot config linear --api-key <key> --team-id <id>

# Test the connection
devpilot config linear --test
```

## Configuration

Configuration is stored in `.devpilot/config.yaml`:

```yaml
version: "1"
ui:
  port: 3847
  theme: system
integrations:
  linear:
    apiKey: lin_api_xxxxx
    teamId: TEAM-xxx
```

## Environment Variables

- `DEVPILOT_PORT` - Override default port
- `DEVPILOT_DB_PATH` - Override database path
- `LINEAR_API_KEY` - Linear API key (alternative to config)
- `LINEAR_TEAM_ID` - Linear team ID (alternative to config)
- `ORCHESTRATOR_URL` - URL of the agent orchestrator
- `ORCHESTRATOR_API_KEY` - API key for orchestrator

## Requirements

- Node.js 18.0.0 or higher

## License

MIT
