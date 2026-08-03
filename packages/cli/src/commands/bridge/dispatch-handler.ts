import type { BridgeClient, TaskDispatchMessage } from '@devpilot.sh/bridge-client';
import { orchestrator } from '@devpilot.sh/core';

/**
 * Derived structurally rather than imported by name: core's dts rollup does not
 * re-export this through its public surface, and this file should not depend on
 * that being fixed.
 */
type OrchestratorService = ReturnType<typeof orchestrator.getOrchestratorService>;
// initStatusPoller(service, config) — the service is arg 0, config is arg 1.
type PollerConfig = NonNullable<Parameters<typeof orchestrator.initStatusPoller>[1]>;
type JobStatus = Parameters<NonNullable<PollerConfig['onStatusUpdate']>>[1];
type CompletionReport = Parameters<NonNullable<PollerConfig['onComplete']>>[1];

export interface DispatchHandlerOptions {
  client: BridgeClient;
  orchestratorMode: 'ao-cli' | 'http' | 'claude-session';
  aoProjectName?: string;
  httpUrl?: string;
  apiKey?: string;
  callbackUrl?: string;
  /** Status poll cadence. Core defaults to 5s. */
  pollIntervalMs?: number;
  onLog?: (line: string) => void;
}

/** Resolvers for sessions currently in flight, keyed by sessionId. */
type Settler = (outcome: { ok: boolean; error?: string }) => void;
const inFlight = new Map<string, Settler>();

function service(opts: DispatchHandlerOptions): OrchestratorService {
  const existing = orchestrator.getOrchestratorServiceOrNull();
  if (existing) return existing;

  // NOTE: the config field is `url`, not `httpUrl`. This previously passed
  // `httpUrl` behind an `as` cast, which silenced the mismatch entirely — http
  // mode could never have reached an orchestrator. No cast now, so the compiler
  // checks it.
  return orchestrator.initOrchestratorService({
    mode: opts.orchestratorMode,
    url: opts.httpUrl,
    apiKey: opts.apiKey,
    callbackUrl: opts.callbackUrl,
    aoProjectName: opts.aoProjectName,
    pollIntervalMs: opts.pollIntervalMs,
  });
}

/**
 * Wire the status poller ONCE, with callbacks that report to the bridge.
 *
 * This corrects TRD 05 §6.6, which said to subscribe to `service.onEvent`. That
 * does not work: OrchestratorService.dispatch simply forwards to the adapter and
 * emits nothing itself. Status feedback comes from StatusPoller, which the HOST
 * must wire — the Next app does exactly this via orchestrator/host-wiring.ts,
 * and the CLI had no equivalent. Observed before this fix: the stub agent ran to
 * completion and the session stayed `pending` forever, because nobody was
 * polling.
 */
function ensurePoller(opts: DispatchHandlerOptions, svc: OrchestratorService): void {
  if (orchestrator.isStatusPollerInitialized()) return;
  const log = opts.onLog ?? (() => {});

  const poller = orchestrator.initStatusPoller(svc, {
    pollIntervalMs: opts.pollIntervalMs ?? 2000,
    maxRetries: 3,

    onStatusUpdate: async (sessionId: string, status: JobStatus) => {
      if (!inFlight.has(sessionId)) return;
      try {
        await opts.client.reportSessionStatus(sessionId, {
          status: status.status === 'queued' ? 'dispatched' : 'running',
          progressPercent: Math.max(0, Math.min(100, status.progressPercent ?? 0)),
          message: status.message ?? status.currentStep,
        });
      } catch (e) {
        log(`status report failed: ${e instanceof Error ? e.message : e}`);
      }
    },

    onComplete: async (sessionId: string, report: CompletionReport) => {
      const settle = inFlight.get(sessionId);
      try {
        await opts.client.reportSessionComplete(sessionId, {
          success: report.success,
          ...(report.prUrl ? { prUrl: report.prUrl } : {}),
          ...(report.summary ? { summary: report.summary } : {}),
          ...(report.tokensUsed !== undefined ? { tokensUsed: report.tokensUsed } : {}),
          ...(report.costUsd !== undefined ? { costUsd: report.costUsd } : {}),
          ...(report.success ? {} : { errorMessage: report.error?.message ?? 'Agent failed' }),
        });
        settle?.({ ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log(`completion report failed: ${msg}`);
        settle?.({ ok: false, error: msg });
      }
    },

    onError: async (sessionId: string, error: Error) => {
      const settle = inFlight.get(sessionId);
      try {
        await opts.client.reportSessionComplete(sessionId, {
          success: false,
          errorMessage: error.message,
        });
      } catch {
        /* the settle below still releases the claim */
      }
      settle?.({ ok: false, error: error.message });
    },
  });

  poller.start();
}

/**
 * Bridge dispatch → local execution — TRD 05 §6.6.
 *
 * Failure protocol, corrected from the TRD: it said the handler must never
 * throw, reasoning from Pub/Sub where a throw meant nack-and-redeliver. Here
 * DispatchLoop catches a throw and calls release(queueId), re-arming the row
 * with backoff. So the contract is: report to the bridge, THEN throw, so the
 * claim is released rather than stranded until the stale sweep.
 *
 * The agent runs HERE, on this machine, against this checkout. The bridge sent
 * a title and a repo name; it never sees the code.
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
      ensurePoller(opts, svc);

      const request = orchestrator.buildDispatchRequest({
        sessionId,
        repo,
        title,
        filePaths: [],
        linearTicketId: linearIdentifier,
        callbackUrl: opts.callbackUrl ?? '',
      });

      const settled = new Promise<{ ok: boolean; error?: string }>((resolve) => {
        inFlight.set(sessionId, resolve);
      });

      const response = await svc.dispatch(request);
      if (!response.accepted) {
        inFlight.delete(sessionId);
        throw new Error(response.error ?? 'Orchestrator rejected the dispatch');
      }

      await opts.client.reportSessionStatus(sessionId, {
        status: 'dispatched',
        progressPercent: 0,
        message: `Dispatched to local orchestrator (${opts.orchestratorMode})`,
      });

      // The poller reports progress and resolves `settled` on a terminal state.
      orchestrator
        .getStatusPoller()
        .trackSession(sessionId, response.orchestratorJobId ?? sessionId);

      const outcome = await settled;
      inFlight.delete(sessionId);

      if (!outcome.ok) throw new Error(outcome.error ?? 'Session failed');
      // The dispatch completed and was reported. Whether the AGENT succeeded is
      // recorded in the session, not here — an agent that ran and failed is a
      // finished dispatch, not one to retry.
      log(`${linearIdentifier} reported`);
    } catch (err) {
      inFlight.delete(sessionId);
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

      throw new Error(reason);
    }
  };
}
