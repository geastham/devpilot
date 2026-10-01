# DevPilot Local Setup Guide

This guide covers setting up DevPilot for local development and usage.

## Prerequisites

- **Node.js 20+** - Required runtime
- **pnpm 8+** - Package manager (`npm install -g pnpm`)
- **Git 2.25+** - Version control

Optional:
- **@composio/ao-cli** - Agent orchestrator for automated task dispatch

## Installation

### From npm

```bash
npm install -g @devpilot.sh/cli
```

### From Source

```bash
# Clone the repository
git clone https://github.com/devpilot-sh/devpilot-core.git
cd devpilot-core

# Install dependencies
pnpm install

# Build all packages
pnpm run build

# Link CLI globally (optional)
cd packages/cli
pnpm link --global
```

## Quick Start

### 1. Initialize a Project

```bash
cd your-project
devpilot init
```

This creates a `.devpilot/` directory with:
- `config.yaml` - Configuration file
- `data.db` - SQLite database for local state

### 2. Start the Server

```bash
devpilot serve
```

This starts the DevPilot UI server on port 3847 (default).

Options:
- `--port <number>` - Custom port
- `--no-open` - Don't open browser automatically

### 3. Access the UI

Open http://localhost:3847 to access the DevPilot dashboard with:
- **Horizon Board** - Kanban view of work items (SHAPING, READY, LANDED)
- **Fleet Panel** - Active AI agent sessions
- **Activity Feed** - Real-time event log
- **Conductor Score** - System health metrics

## Configuration

### Project Configuration

Edit `.devpilot/config.yaml`:

```yaml
# Project settings
project:
  name: my-project
  repo: github.com/org/repo

# UI settings
ui:
  port: 3847
  theme: dark

# Integrations
integrations:
  linear:
    apiKey: lin_api_xxxxx
    teamId: TEAM-xxxxx

# Orchestrator settings
orchestrator:
  mode: ao-cli  # 'ao-cli', 'http', or 'disabled'
  project: my-ao-project
```

### Environment Variables

```bash
# SQLite database path (default: .devpilot/data.db)
DEVPILOT_SQLITE_PATH=.devpilot/data.db

# Linear API key (alternative to config file)
LINEAR_API_KEY=lin_api_xxxxx
LINEAR_TEAM_ID=TEAM-xxxxx

# Orchestrator mode
ORCHESTRATOR_MODE=ao-cli
AO_PROJECT_NAME=myproject

# Server settings
PORT=3847
NODE_ENV=development
```

## CLI Commands

### Core Commands

```bash
# Initialize DevPilot in a project
devpilot init

# Start the UI server
devpilot serve [--port 3847] [--no-open]

# View/set configuration
devpilot config [key] [value]
devpilot config --list

# Interactive setup wizard
devpilot setup
```

### Linear Integration

```bash
# Configure Linear
devpilot config linear --api-key <key> --team-id <id>

# Test connection
devpilot config linear --test
```

### Bridge Commands (Cloud Connection)

```bash
# Connect to cloud bridge
devpilot bridge connect --url <bridge-url> --api-key <key>

# Check connection status
devpilot bridge status

# Disconnect
devpilot bridge disconnect
```

## Database Schema

DevPilot uses SQLite with Drizzle ORM. Key tables:

| Table | Purpose |
|-------|---------|
| `horizon_items` | Work items in the kanban board |
| `plans` | Approved implementation plans |
| `workstreams` | Plan workstreams |
| `tasks` | Individual tasks within workstreams |
| `ruflo_sessions` | Active fleet sessions |
| `completed_tasks` | Historical completed tasks |
| `touched_files` | Files associated with items |
| `in_flight_files` | Files currently being modified |
| `conductor_scores` | System health metrics |
| `activity_events` | Event log |

## Project Structure

```
.devpilot/
├── config.yaml           # Project configuration
├── data.db               # SQLite database
└── agent-orchestrator.yaml  # ao CLI configuration (if using)
```

## Troubleshooting

### Database Issues

Reset the database:
```bash
rm .devpilot/data.db
devpilot serve  # Recreates the database
```

### Port Conflicts

Use a different port:
```bash
devpilot serve --port 4000
```

### Check System Requirements

```bash
devpilot setup --check
```

## Next Steps

- [AO-INTEGRATION.md](./AO-INTEGRATION.md) - Set up agent orchestrator
- [LINEAR-BRIDGE.md](./LINEAR-BRIDGE.md) - Configure Linear integration
- [API-REFERENCE.md](./API-REFERENCE.md) - API endpoint documentation
