# Linear Bridge Integration

DevPilot provides bidirectional synchronization with Linear for issue tracking.

## Overview

The Linear integration enables:
- **Outbound Sync**: DevPilot sessions → Linear issues
- **Inbound Sync**: Linear webhooks → DevPilot dispatch (via hosted bridge)
- **Status Updates**: Progress synced in real-time
- **Auto-Dispatch**: Assign to bot user → automatic agent spawn

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              LINEAR                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │  Issues ←→ Comments ←→ State Changes ←→ Assignments                 ││
│  └─────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ Webhooks
                               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    GCP CLOUD RUN - LINEAR BRIDGE                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  Webhook Receiver → Signature Verify → Bot Check → Pub/Sub Dispatch│  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐            │
│  │   CloudSQL      │ │    Pub/Sub      │ │   BigQuery      │            │
│  │  (PostgreSQL)   │ │ (Task Dispatch) │ │  (Analytics)    │            │
│  └─────────────────┘ └────────┬────────┘ └─────────────────┘            │
└───────────────────────────────┼──────────────────────────────────────────┘
                                │ Pull Subscription
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         LOCAL DEVPILOT CLI                                │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  Bridge Client ← Pub/Sub ← Task → Orchestrator → ao spawn          │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

## Local Setup (Direct API)

### 1. Get Linear API Credentials

1. Go to https://linear.app/settings/api
2. Create a new API key with:
   - Read access to issues
   - Write access to issues and comments
   - Read access to teams

### 2. Configure via CLI

```bash
# Interactive setup
devpilot setup

# Or manual configuration
devpilot config linear --api-key lin_api_xxxxx --team-id TEAM-xxxxx

# Test connection
devpilot config linear --test
```

### 3. Configuration File

Edit `.devpilot/config.yaml`:

```yaml
integrations:
  linear:
    apiKey: lin_api_xxxxx
    teamId: TEAM-xxxxx
    teamName: My Team
    teamKey: TEAM
    defaultProjectId: proj_xxxxx  # Optional
```

## Outbound Sync (DevPilot → Linear)

### Session Creation

When dispatching a horizon item, DevPilot creates/updates a Linear issue:

```typescript
// packages/core/src/integrations/linear/sync.ts
await syncSessionToLinear({
  sessionId: 'sess_123',
  ticketTitle: 'Implement feature X',
  repo: 'my-org/my-repo',
  workstream: 'Backend',
  estimatedMinutes: 60,
});
```

This:
1. Creates a new Linear issue (or finds existing by title)
2. Adds a comment with session details
3. Returns the Linear issue ID for tracking

### Progress Updates

During agent execution:

```typescript
await syncProgressToLinear({
  linearTicketId: 'LIN-123',
  progressPercent: 45,
  currentWorkstream: 'Writing tests',
  filesModified: ['src/api.ts', 'tests/api.test.ts'],
  status: 'running',
  message: 'Implementing test cases',
});
```

This adds a progress comment to the Linear issue.

### Completion Sync

When a session completes:

```typescript
await syncCompletionToLinear({
  linearTicketId: 'LIN-123',
  success: true,
  prUrl: 'https://github.com/org/repo/pull/456',
  filesModified: ['src/api.ts', 'tests/api.test.ts'],
  completionMessage: 'Implemented feature with full test coverage',
});
```

This:
1. Adds a completion comment with PR link
2. Moves the issue to "Done" state (if configured)
3. Optionally closes the issue

## Inbound Sync (Linear → DevPilot)

### Local Webhook Handler

For development/testing, configure Linear webhooks to point to a public URL (e.g., via ngrok):

```bash
# Expose local server
ngrok http 3847

# Configure webhook in Linear:
# URL: https://xxxxx.ngrok.io/api/integrations/linear/webhook
```

### Webhook Events Handled

| Event | Action |
|-------|--------|
| `Issue.create` | Create horizon item |
| `Issue.update` | Update item details |
| `Issue.assign` | Check for bot user → dispatch |
| `Comment.create` | Forward to agent session |

### Auto-Dispatch via Bot User

1. Create a Linear "bot" user for DevPilot
2. Configure bot user ID in bridge settings
3. Assign issues to bot user → automatic dispatch

```yaml
# Bridge configuration
linear:
  botUserId: user_xxxxx  # DevPilot bot user
  autoDispatch: true
  autoDispatchLabels:
    - devpilot
    - ai-task
```

## Cloud Bridge Setup

For production deployments with multiple orchestrators:

### 1. Deploy Bridge Service

The bridge package (`@devpilot.sh/bridge`) deploys to GCP Cloud Run:

```bash
cd packages/bridge
gcloud run deploy devpilot-bridge \
  --source . \
  --region us-central1 \
  --allow-unauthenticated
```

### 2. Configure Linear Webhook

Point your Linear workspace webhook to the bridge:
```
URL: https://devpilot-bridge-xxx.run.app/api/webhooks/linear
```

### 3. Connect Local Orchestrator

```bash
devpilot bridge connect \
  --url https://devpilot-bridge-xxx.run.app \
  --api-key dp_orch_xxxxx
```

### 4. Verify Connection

```bash
devpilot bridge status
```

## Bridge Client Package

The `@devpilot.sh/bridge-client` package handles cloud connectivity:

```typescript
import { createBridgeClient, type BridgeClientConfig } from '@devpilot.sh/bridge-client';

const client = createBridgeClient({
  bridgeUrl: 'https://devpilot-bridge-xxx.run.app',
  apiKey: 'dp_orch_xxxxx',
  orchestratorId: 'orch_local_1',
});

// Start listening for dispatched tasks
await client.startListening({
  onTask: async (task) => {
    // Spawn agent for task
    await orchestrator.dispatch(task);
  },
  onError: (error) => {
    console.error('Bridge error:', error);
  },
});

// Send heartbeat
await client.sendHeartbeat();

// Report session status
await client.reportStatus(sessionId, statusUpdate);
```

## Webhook Signature Verification

Linear webhooks include a signature header for verification:

```typescript
// packages/bridge/src/api/webhooks/verify.ts
import { createHmac, timingSafeEqual } from 'crypto';

export function verifyLinearWebhookSignature(
  payload: string,
  signature: string,  // "sha256=..."
  secret: string
): boolean {
  const expected = createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  const actual = signature.replace('sha256=', '');

  return timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(actual)
  );
}
```

## API Reference

### Linear Client Methods

```typescript
import { linear } from '@devpilot.sh/core';

// Initialize client
const client = linear.initLinearClient({
  apiKey: 'lin_api_xxxxx',
  teamId: 'TEAM-xxxxx',
});

// Get team info
const team = await client.getTeam();

// Create issue
const issue = await client.createIssue({
  title: 'New feature',
  description: 'Implement X',
  priority: 2,
});

// Update issue
await client.updateIssue(issueId, { state: 'in-progress' });

// Add comment
await client.addComment(issueId, 'Progress update: 50% complete');

// Get issue
const issue = await client.getIssue(issueId);

// Search issues
const issues = await client.searchIssues({ query: 'bug' });
```

### Sync Functions

```typescript
import { linear } from '@devpilot.sh/core';

// Check if configured
const configured = linear.isLinearConfigured();

// Get client
const client = linear.getLinearClient();

// Sync session to Linear
await linear.syncSessionToLinear({ ... });

// Sync progress
await linear.syncProgressToLinear({ ... });

// Sync completion
await linear.syncCompletionToLinear({ ... });

// Handle webhook
const result = await linear.handleLinearWebhook(payload, options);
```

## Environment Variables

```bash
# Required for Linear integration
LINEAR_API_KEY=lin_api_xxxxx
LINEAR_TEAM_ID=TEAM-xxxxx

# Optional
LINEAR_DEFAULT_PROJECT_ID=proj_xxxxx
LINEAR_BOT_USER_ID=user_xxxxx

# For bridge connection
DEVPILOT_BRIDGE_URL=https://devpilot-bridge-xxx.run.app
DEVPILOT_BRIDGE_API_KEY=dp_orch_xxxxx
```

## Troubleshooting

### Connection Failed

```bash
# Test connection
devpilot config linear --test

# Check API key permissions
# Ensure key has: read/write issues, read teams
```

### Webhook Not Received

1. Verify webhook URL is accessible
2. Check Linear webhook settings for errors
3. View webhook delivery logs in Linear

### Sync Issues

Check the activity log in DevPilot UI for sync errors.

## Next Steps

- [API-REFERENCE.md](./API-REFERENCE.md) - Full API documentation
- [AO-INTEGRATION.md](./AO-INTEGRATION.md) - Agent orchestrator setup
