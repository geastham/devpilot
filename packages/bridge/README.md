# @devpilot/bridge

DevPilot Linear Bridge - GCP Cloud Run webhook relay service.

## Overview

This service receives Linear webhooks and routes task dispatch messages to local DevPilot orchestrators via Google Cloud Pub/Sub.

## Features

- Linear webhook signature verification
- Bot user assignment detection
- Task dispatch via Pub/Sub
- Orchestrator registration and management
- Session tracking and status updates

## Deployment

### Prerequisites

- GCP Project with Cloud Run, Pub/Sub, and CloudSQL enabled
- Linear workspace with webhook configured

### Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 8080) |
| `DATABASE_URL` | CloudSQL PostgreSQL connection string |
| `GCP_PROJECT_ID` | GCP project ID |
| `PUBSUB_TOPIC_DISPATCH` | Task dispatch topic name |

### Deploy to Cloud Run

```bash
gcloud builds submit --config cloudbuild.yaml
```

## Local Development

```bash
pnpm install
pnpm dev
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/webhooks/linear` | POST | Linear webhook receiver |
| `/api/orchestrators/register` | POST | Register orchestrator |
| `/api/orchestrators/:id/heartbeat` | POST | Orchestrator heartbeat |
| `/api/sessions/:id/status` | POST | Update session status |
| `/api/sessions/:id/complete` | POST | Mark session complete |
