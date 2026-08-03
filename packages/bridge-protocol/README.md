# @devpilot.sh/bridge-protocol

The wire contract between a DevPilot CLI and a DevPilot bridge: message types,
request/response schemas, the session status vocabulary, and Linear comment
formatting.

MIT. Zero runtime dependencies beyond `zod`.

## Why this package exists

The contract was previously declared twice — once in the bridge, once in the
client — and the two drifted. The shapes disagreed, and neither carried
`sessionId`, so a client that received a dispatch had no key to report progress
against. One published definition makes that class of bug impossible.

It also keeps the protocol **open** while the hosted platform stays private:
anyone can implement a conforming bridge and point `DEVPILOT_BRIDGE_URL` at it.

## Usage

```ts
import {
  parseTaskDispatchMessage,
  RegisterRequestSchema,
  buildBridgeCompletionComment,
} from '@devpilot.sh/bridge-protocol';

// Validate an inbound dispatch from the queue, poll response, or realtime event
const message = parseTaskDispatchMessage(payload);

// Build a conforming register request — `name` is required
const body = RegisterRequestSchema.parse({ name: os.hostname(), repos, maxConcurrentJobs: 4 });
```

## Stability

`TaskDispatchMessage.sessionId` and `.targetOrchestratorId` are load-bearing and
will not be repurposed. New fields are added; existing ones are not redefined.
