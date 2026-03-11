# DevPilot API Reference

The DevPilot CLI server exposes a RESTful API on port 3847 (default).

## Base URL

```
http://localhost:3847/api
```

## Authentication

Local development requires no authentication. For production deployments, configure API keys in the bridge service.

---

## Horizon Items

Manage work items in the kanban board.

### List Items

```http
GET /api/items
```

Query parameters:
- `zone` - Filter by zone: `SHAPING`, `READY`, `LANDED`
- `repo` - Filter by repository

Response:
```json
{
  "items": [
    {
      "id": "item_xxxxx",
      "title": "Implement feature X",
      "description": "Description here",
      "repo": "my-org/my-repo",
      "zone": "READY",
      "complexity": "M",
      "linearTicketId": "LIN-123",
      "createdAt": "2024-01-15T10:00:00Z",
      "updatedAt": "2024-01-15T12:00:00Z",
      "plan": { ... }
    }
  ]
}
```

### Create Item

```http
POST /api/items
Content-Type: application/json

{
  "title": "Implement feature X",
  "description": "Description here",
  "repo": "my-org/my-repo",
  "zone": "SHAPING",
  "complexity": "M",
  "linearTicketId": "LIN-123"
}
```

Response:
```json
{
  "item": { ... },
  "message": "Item created successfully"
}
```

### Get Item

```http
GET /api/items/{itemId}
```

Response includes the item with its plan, workstreams, and tasks.

### Update Item

```http
PUT /api/items/{itemId}
Content-Type: application/json

{
  "title": "Updated title",
  "zone": "READY"
}
```

### Delete Item

```http
DELETE /api/items/{itemId}
```

### Move Item Zone

```http
POST /api/items/{itemId}/move
Content-Type: application/json

{
  "zone": "READY"
}
```

---

## Plans

Manage implementation plans attached to horizon items.

### Create/Update Plan

```http
PUT /api/items/{itemId}/plan
Content-Type: application/json

{
  "goal": "Implement feature X with full test coverage",
  "acceptanceCriteria": [
    "All tests pass",
    "Code reviewed",
    "Documentation updated"
  ],
  "workstreams": [
    {
      "label": "Backend Implementation",
      "orderIndex": 0,
      "tasks": [
        { "label": "Create API endpoint", "orderIndex": 0 },
        { "label": "Add validation", "orderIndex": 1 }
      ]
    },
    {
      "label": "Testing",
      "orderIndex": 1,
      "tasks": [
        { "label": "Write unit tests", "orderIndex": 0 },
        { "label": "Add integration tests", "orderIndex": 1 }
      ]
    }
  ],
  "filesTouched": [
    { "path": "src/api/routes.ts", "reason": "Add new endpoint" },
    { "path": "tests/api.test.ts", "reason": "Add tests" }
  ]
}
```

### Get Plan

```http
GET /api/items/{itemId}/plan
```

---

## Fleet

Manage active AI agent sessions.

### Get Fleet State

```http
GET /api/fleet/state
```

Response:
```json
{
  "sessions": [
    {
      "id": "sess_xxxxx",
      "repo": "my-org/my-repo",
      "linearTicketId": "LIN-123",
      "ticketTitle": "Implement feature X",
      "currentWorkstream": "Backend Implementation",
      "status": "ACTIVE",
      "progressPercent": 45,
      "elapsedMinutes": 12,
      "estimatedRemainingMinutes": 15,
      "inFlightFiles": ["src/api.ts"],
      "completedTasks": [],
      "createdAt": "2024-01-15T10:00:00Z"
    }
  ],
  "inFlightFiles": [
    {
      "path": "src/api.ts",
      "activeSessionId": "sess_xxxxx",
      "linearTicketId": "LIN-123",
      "estimatedMinutesRemaining": 15
    }
  ]
}
```

### Dispatch Item to Fleet

```http
POST /api/fleet/dispatch/{itemId}
```

Dispatches a READY horizon item to the agent orchestrator.

Response:
```json
{
  "session": {
    "id": "sess_xxxxx",
    "status": "ACTIVE",
    ...
  },
  "message": "Successfully dispatched \"Implement feature X\" to fleet"
}
```

### Get Session Details

```http
GET /api/fleet/sessions/{sessionId}
```

---

## Orchestrator Callbacks

These endpoints receive status updates from the orchestrator.

### Status Update

```http
POST /api/orchestrator/status
Content-Type: application/json

{
  "sessionId": "sess_xxxxx",
  "status": "running",
  "progressPercent": 50,
  "currentStep": "Writing tests",
  "currentFile": "tests/api.test.ts",
  "filesModified": ["src/api.ts"],
  "tokensUsed": 15000,
  "message": "Implementing test cases"
}
```

### Completion Report

```http
POST /api/orchestrator/complete
Content-Type: application/json

{
  "sessionId": "sess_xxxxx",
  "success": true,
  "prUrl": "https://github.com/org/repo/pull/123",
  "filesModified": ["src/api.ts", "tests/api.test.ts"],
  "tokensUsed": 45000,
  "costUsd": 0.15,
  "durationMinutes": 25,
  "summary": "Implemented feature with full test coverage"
}
```

---

## Conductor Score

System health metrics.

### Get Score

```http
GET /api/score
```

Response:
```json
{
  "score": {
    "id": "score_xxxxx",
    "total": 850,
    "velocityTrend": 125,
    "costEfficiency": 110,
    "qualityGate": 95,
    "lastUpdated": "2024-01-15T12:00:00Z"
  },
  "history": [
    {
      "timestamp": "2024-01-15T11:00:00Z",
      "total": 840,
      "delta": 10,
      "reason": "dispatch"
    }
  ]
}
```

### Update Score

```http
POST /api/score
Content-Type: application/json

{
  "delta": 10,
  "reason": "manual_adjustment"
}
```

---

## Activity Events

Event log for all system activity.

### List Events

```http
GET /api/events
```

Query parameters:
- `limit` - Number of events (default: 50)
- `type` - Filter by event type
- `repo` - Filter by repository

Response:
```json
{
  "events": [
    {
      "id": "evt_xxxxx",
      "type": "ITEM_DISPATCHED",
      "message": "Dispatched \"Implement feature X\" to fleet",
      "repo": "my-org/my-repo",
      "ticketId": "LIN-123",
      "metadata": {
        "sessionId": "sess_xxxxx",
        "estimatedMinutes": 30
      },
      "timestamp": "2024-01-15T10:00:00Z"
    }
  ]
}
```

### Event Types

| Type | Description |
|------|-------------|
| `ITEM_CREATED` | New horizon item created |
| `ITEM_MOVED` | Item moved between zones |
| `ITEM_DISPATCHED` | Item dispatched to fleet |
| `SESSION_STARTED` | Agent session started |
| `SESSION_PROGRESS` | Session progress update |
| `SESSION_COMPLETE` | Session completed |
| `FILE_LOCKED` | File locked by session |
| `FILE_UNLOCKED` | File released |
| `SCORE_UPDATE` | Conductor score changed |
| `LINEAR_SYNC` | Linear sync event |

---

## Server-Sent Events (SSE)

Real-time updates via SSE stream.

### Connect to Stream

```http
GET /api/events/stream
Accept: text/event-stream
```

Events:
```
event: session_update
data: {"sessionId":"sess_xxx","status":"ACTIVE","progressPercent":50}

event: score_update
data: {"total":860,"delta":10}

event: activity
data: {"type":"SESSION_PROGRESS","message":"..."}
```

---

## Linear Integration

### Check Configuration

```http
GET /api/integrations/linear/connect
```

Response:
```json
{
  "configured": true,
  "team": {
    "id": "team_xxxxx",
    "name": "My Team",
    "key": "TEAM"
  }
}
```

### Configure Linear

```http
POST /api/integrations/linear/connect
Content-Type: application/json

{
  "apiKey": "lin_api_xxxxx",
  "teamId": "team_xxxxx"
}
```

### Linear Webhook

```http
POST /api/integrations/linear/webhook
Content-Type: application/json
Linear-Signature: sha256=xxxxx

{
  "type": "Issue",
  "action": "update",
  "data": { ... }
}
```

---

## Health Check

```http
GET /api/health
```

Response:
```json
{
  "status": "ok",
  "version": "0.1.0",
  "uptime": 3600,
  "database": "connected",
  "orchestrator": {
    "mode": "ao-cli",
    "status": "ready"
  }
}
```

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Error message here",
  "code": "ERROR_CODE",
  "details": { ... }
}
```

HTTP Status Codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `404` - Not Found
- `500` - Internal Server Error

---

## TypeScript Types

Import types from `@devpilot.sh/core`:

```typescript
import type {
  HorizonItem,
  NewHorizonItem,
  Plan,
  NewPlan,
  RufloSession,
  ConductorScore,
  ActivityEvent,
  Zone,
  Complexity,
  SessionStatus,
} from '@devpilot.sh/core/db';

import type {
  DispatchRequest,
  DispatchResponse,
  StatusUpdate,
  CompletionReport,
} from '@devpilot.sh/core/orchestrator';
```
