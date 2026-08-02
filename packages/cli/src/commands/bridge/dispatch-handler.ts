import type { BridgeClient, TaskDispatchMessage } from '@devpilot.sh/bridge-client';
import { orchestrator } from '@devpilot.sh/core';

/**
 * Derived structurally rather than imported by name: core's dts rollup does not
 * re-export the `OrchestratorEvent` interface or the `OrchestratorService`
 * class through its public surface, and this file should not depend on that
 * being fixed. Deriving from the function signatures tracks core automatically.
 */
type OrchestratorService = ReturnType<typeof orchestrator.getOrchestratorService>;
type OrchestratorEvent = Parameters<Parameters<OrchestratorService['onEvent']>[0]>[0];

export interface DispatchHandlerOptions {
  client: BridgeClient;
  orchestratorMode: 'ao-cli' | 'http' | 'claude-session';
  aoProjectName?: string;
  httpUrl?: string;
  apiKey?: string;
  callbackUrl?: string;
  onLog?: (line: string) => void;
}

function service(opts: DispatchHandlerOptions): OrchestratorService {
  // Lazily initialised: a connect session that never receives work should not
  // require a configured orchestrator just to sit idle.
  const existing = orchestrator.getOrchestratorServiceOrNull();
  if (existing) return existing;

  return orchestrator.initOrchestratorService({
    mode: opts.orchestratorMode,
    aoProjectName: opts.aoProjectName,
    httpUrl: opts.httpUrl,
    apiKey: opts.apiKey,
  } as Parameters<typeof orchestrator.initOrchestratorService>[0]);
}

/**
 * Bridge dispatch → local execution — TRD 05 §6.6.
 *
 * Failure protocol — note this differs from TRD 05 §6.6 as originally written.
 *
 * The TRD said the handler must never throw, because under Pub/Sub a throw meant
 * nack-and-redeliver and would loop. That reasoning does not carry over: here
 * DispatchLoop catches a throw and calls `release(queueId)`, which re-arms the
 * row with backoff and counts an attempt toward DISPATCH_MAX_ATTEMPTS. So the
 * contract is:
 *
 *   - report `error` status to the bridge (best-effort), THEN
 *   - throw, so the loop releases the claim rather than stranding it.
 *
 * Swallowing the error would leave the row claimed until the server-side stale
 * sweep — up to 30 minutes of invisible work. Throwing is the safe direction.
 *
 * This is the local half of the invariant: the agent runs HERE, on this
 * machine, against this checkout. The bridge sent a title and a repo name; it
 * never sees the code.
 */
export function createBridgeDispatchHandler(
  opts: DispatchHandlerOptions,
): (message: TaskDispatchMessage) => Promise<void> {
  const log = opts.onLog ?? (() => {});

  return async function handle(message: TaskDispatchMessage): Promise<void> {
    const { sessionId, linearIdentifier, title, repo } = message;
    log(`${linearIdentifier} → ${repo}: ${title}`);

    try {
      const svc = service(opts);

      const request = orchestrator.buildDispatchRequest({
        sessionId,
        repo,
        title,
        filePaths: [],
        linearTicketId: linearIdentifier,
        callbackUrl: opts.callbackUrl ?? '',
      });

      // Report 'dispatched' before awaiting the agent: a long-running job
      // should not look pending in the dashboard for its entire duration.
      await opts.client.reportSessionStatus(sessionId, {
        status: 'dispatched',
        progressPercent: 0,
        message: `Dispatched to local orchestrator (${opts.orchestratorMode})`,
      });

      const settled = new Promise<void>((resolve) => {
        const unsubscribe = svc.onEvent((event: OrchestratorEvent) => {
          if (event.sessionId !== sessionId) return;

          if (event.type === 'job:started' || event.type === 'job:progress') {
            const data = event.data as { progressPercent?: number; message?: string };
            void opts.client
              .reportSessionStatus(sessionId, {
                status: 'running',
                progressPercent: Math.max(0, Math.min(100, data.progressPercent ?? 0)),
                message: data.message,
              })
              .catch((e) => log(`status report failed: ${e instanceof Error ? e.message : e}`));
            return;
          }

          if (
            event.type === 'job:complete' ||
            event.type === 'job:error' ||
            event.type === 'job:cancelled'
          ) {
            const data = event.data as {
              success?: boolean;
              prUrl?: string;
              summary?: string;
              tokensUsed?: number;
              costUsd?: number;
              error?: string;
            };
            // A cancelled job is not a success, but it is terminal — the queue
            // row must settle either way or the work is dispatched forever.
            const success = event.type === 'job:complete' && data.success !== false;

            void opts.client
              .reportSessionComplete(sessionId, {
                success,
                ...(data.prUrl ? { prUrl: data.prUrl } : {}),
                ...(data.summary ? { summary: data.summary } : {}),
                ...(data.tokensUsed !== undefined ? { tokensUsed: data.tokensUsed } : {}),
                ...(data.costUsd !== undefined ? { costUsd: data.costUsd } : {}),
                ...(success ? {} : { errorMessage: data.error ?? 'Agent reported failure' }),
              })
              .catch((e) => log(`completion report failed: ${e instanceof Error ? e.message : e}`))
              .finally(() => {
                unsubscribe();
                resolve();
              });
          }
        });
      });

      await svc.dispatch(request);
      await settled;
      log(`${linearIdentifier} finished`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      log(`${linearIdentifier} failed: ${reason}`);

      // Best-effort. If the bridge is unreachable too, the throw below still
      // makes DispatchLoop release the claim, and the server-side stale sweep
      // is the final backstop.
      try {
        await opts.client.reportSessionStatus(sessionId, {
          status: 'error',
          progressPercent: 0,
          message: reason,
        });
      } catch {
        /* nothing further we can do from here */
      }

      throw new Error(reason); // DispatchLoop catches this and releases the row
    }
  };
}
