# @devpilot.sh/bridge-client

## 0.2.0 — BREAKING

The GCP Pub/Sub transport is removed.

**Why this breaks compatibility deliberately:** 0.1.x could not work. Its
`register()` sent `{repos, maxConcurrentJobs}` while the bridge required `name`,
so registration returned 400 on every call and the pipeline never connected end
to end. There is no functioning installed base to protect.

### Removed
- `PubSubSubscriber` — now a shim that throws with upgrade instructions. It will
  be deleted in 0.3.0.
- `@google-cloud/pubsub` dependency. **A machine no longer needs GCP
  credentials.** Requiring every user's laptop to authenticate into DevPilot's
  GCP project is why the old design was never finished.

### Added
- `RealtimeSubscriber` — Supabase Realtime, filtered and RLS-scoped per machine.
- `DispatchLoop` — claim/settle with a sweep. **This is where at-least-once
  delivery comes from.** Realtime only reduces latency; disable it entirely and
  the loop remains correct.
- `BridgeClient.poll/claim/release`.

### Changed
- `register()` now takes a required `name` and is validated locally against
  `@devpilot.sh/bridge-protocol` before the request is sent.
- Errors surface the server's message instead of bare `response.statusText`.
- `getOrchestatorId()` → `getOrchestratorId()` (typo fixed).
- `apiKey` config field → `token`.

### Migration
```diff
- const client = new BridgeClient({ bridgeUrl, apiKey });
- await client.register({ repos, maxConcurrentJobs: 4 });
- new PubSubSubscriber({ projectId, subscriptionName, onMessage }).start();
+ const client = new BridgeClient({ bridgeUrl, token });
+ const { orchestratorId, realtime } = await client.register({
+   name: os.hostname(), repos, maxConcurrentJobs: 4,
+ });
+ await new DispatchLoop({ client, orchestratorId, realtime, handler }).start();
```
