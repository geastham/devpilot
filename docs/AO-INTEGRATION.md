# Agent Orchestrator (ao) Integration

DevPilot integrates with the `@composio/ao-cli` agent orchestrator to spawn and manage AI coding agents.

## Overview

The agent orchestrator integration enables:
- Automatic spawning of Claude Code agents via `ao spawn`
- Real-time status polling via `ao status`
- Session management and completion tracking
- Linear ticket synchronization

## Prerequisites

1. **Install ao CLI**
   ```bash
   npm install -g @composio/ao-cli
   ```

2. **Configure ao project**
   ```bash
   ao init my-project
   ```

3. **Set up authentication**
   - Configure your Anthropic API key for Claude Code
   - Set up any project-specific environment variables

## Configuration

### Via DevPilot Setup

```bash
devpilot setup
```

The setup wizard will:
1. Check if ao CLI is installed
2. Offer to install it if missing
3. Generate `agent-orchestrator.yaml` configuration
4. Configure agent rules and project settings

### Manual Configuration

Edit `.devpilot/config.yaml`:

```yaml
orchestrator:
  mode: ao-cli          # Use ao CLI adapter
  project: my-project   # ao project name
  pollingInterval: 5000 # Status poll interval (ms)
```

### Agent Orchestrator Config

The setup wizard generates `.devpilot/agent-orchestrator.yaml`:

```yaml
version: 1

projects:
  my-project:
    path: /path/to/project
    repo: github.com/org/repo

    # Agent configuration
    agentRules: |
      - Always run tests before completing
      - Create atomic, focused commits
      - Follow existing code patterns

    # Task defaults
    defaults:
      model: sonnet
      maxTokens: 200000
      timeout: 3600
```

## How It Works

### 1. Dispatch Flow

When you dispatch a horizon item to the fleet:

```
UI: Click "Dispatch" on READY item
    ↓
API: POST /api/fleet/dispatch/{itemId}
    ↓
OrchestratorService.dispatch()
    ↓
AoCliAdapter.spawn(project, ticketId)
    ↓
Shell: ao spawn my-project DP-123 "Task title"
    ↓
Claude Code session starts
```

### 2. Status Polling

The status poller runs automatically:

```
StatusPoller (every 5s)
    ↓
Shell: ao status <session-id>
    ↓
Parse output → StatusUpdate
    ↓
Update rufloSessions table
    ↓
Sync to Linear (if configured)
    ↓
Emit SSE event to UI
```

### 3. Completion Flow

When an agent completes:

```
ao session completes
    ↓
StatusPoller detects completion
    ↓
POST /api/orchestrator/complete
    ↓
Update session status
    ↓
Release in-flight files
    ↓
Update conductor score
    ↓
Sync to Linear
```

## Orchestrator Modes

Configure via `orchestrator.mode` in config:

| Mode | Description |
|------|-------------|
| `ao-cli` | Use local ao CLI (recommended) |
| `http` | Connect to remote orchestrator via HTTP |
| `disabled` | No orchestrator integration |

### ao-cli Mode

Uses `child_process.spawn` to execute ao commands locally:

```typescript
// packages/core/src/orchestrator/ao-cli-adapter.ts
await spawn('ao', ['spawn', project, ticketId, title]);
```

### http Mode

For remote orchestrator deployments:

```yaml
orchestrator:
  mode: http
  httpUrl: https://orchestrator.example.com
  httpApiKey: orch_xxxxx
```

## Adapter Interface

The orchestrator uses a strategy pattern with a common interface:

```typescript
interface IOrchestratorAdapter {
  healthCheck(): Promise<OrchestratorHealth>;
  dispatch(request: DispatchRequest): Promise<DispatchResponse>;
  getJobStatus(sessionId: string): Promise<JobStatus>;
  cancel(sessionId: string): Promise<CancelResponse>;
}
```

### DispatchRequest

```typescript
interface DispatchRequest {
  sessionId: string;
  repo: string;
  taskSpec: {
    prompt: string;
    filePaths: string[];
    model: 'sonnet' | 'opus' | 'haiku';
    acceptanceCriteria?: string[];
  };
  callbackUrl: string;
  linearTicketId?: string;
}
```

### StatusUpdate

```typescript
interface StatusUpdate {
  sessionId: string;
  status: 'running' | 'waiting' | 'complete' | 'error';
  progressPercent: number;
  currentStep?: string;
  currentFile?: string;
  filesModified: string[];
  tokensUsed?: number;
  message?: string;
}
```

## CLI Commands

### Check ao Status

```bash
# Via ao CLI
ao status

# Via DevPilot
devpilot fleet status
```

### Manual Spawn

```bash
# Spawn a session directly
ao spawn my-project DP-123 "Implement feature X"

# Send a message to session
ao send <session-id> "Also add tests"

# Stop a session
ao stop <session-id>
```

## Troubleshooting

### ao CLI Not Found

```bash
# Install globally
npm install -g @composio/ao-cli

# Verify installation
ao --version
```

### Session Not Starting

Check the ao project configuration:
```bash
ao projects list
ao project show my-project
```

### Status Polling Issues

Check the DevPilot server logs:
```bash
devpilot serve --debug
```

### Parse Errors

The ao CLI adapter parses session IDs from stdout. If format changes, update:
```
packages/core/src/orchestrator/ao-cli-adapter.ts
```

## Database Schema

Fleet sessions are tracked in `ruflo_sessions`:

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | DevPilot session ID |
| `externalSessionId` | TEXT | ao session ID |
| `orchestratorMode` | TEXT | 'ao-cli', 'http', 'manual' |
| `status` | TEXT | ACTIVE, NEEDS_SPEC, COMPLETE, ERROR |
| `progressPercent` | INTEGER | 0-100 |
| `currentWorkstream` | TEXT | Current task label |

## Architecture

```
┌─────────────────────────────────────────────────┐
│              OrchestratorService                │
│  ┌─────────────────────────────────────────────┐│
│  │  Strategy Pattern: mode → adapter           ││
│  └─────────────────────────────────────────────┘│
└───────────────────────┬─────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│ AoCliAdapter  │ │  HttpAdapter  │ │DisabledAdapter│
│               │ │               │ │               │
│ ao spawn      │ │ HTTP POST     │ │ Returns error │
│ ao status     │ │ to remote     │ │               │
│ ao stop       │ │ orchestrator  │ │               │
└───────────────┘ └───────────────┘ └───────────────┘
        │
        ▼
┌───────────────────────────────────────────────────┐
│                   StatusPoller                     │
│  ┌─────────────────────────────────────────────┐  │
│  │ Poll active sessions every 5s               │  │
│  │ Parse status → Update DB → Emit SSE → Linear│  │
│  └─────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────┘
```

## Next Steps

- [LINEAR-BRIDGE.md](./LINEAR-BRIDGE.md) - Sync sessions to Linear tickets
- [API-REFERENCE.md](./API-REFERENCE.md) - Fleet API endpoints
