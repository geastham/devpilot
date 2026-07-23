/**
 * Server-side orchestrator bootstrap for the Next app (TRD-01 §6.1).
 *
 * A lazy, process-wide singleton so any API route can dispatch through the same
 * OrchestratorService the CLI Fastify server uses. Guarded via globalThis (same
 * pattern as src/lib/db/index.ts) so Next.js hot reload / route isolation can't
 * double-init.
 */

import {
  initOrchestratorService,
  initStatusPoller,
  createDbStatusPollerCallbacks,
  type OrchestratorService,
  type OrchestratorAdapterConfig,
  type OrchestratorMode,
} from '@devpilot.sh/core/orchestrator';
import { initExecutionBridge, type WaveExecutionConfig } from '@devpilot.sh/core/wave-planner';

const globalForOrchestrator = globalThis as unknown as {
  devpilotOrchestrator?: OrchestratorService;
};

/** Public base of this DevPilot instance, with /api/orchestrator appended. */
function getCallbackUrl(): string {
  const base =
    process.env.DEVPILOT_CALLBACK_URL ??
    process.env.APP_URL ??
    'http://localhost:3000';
  return `${base.replace(/\/$/, '')}/api/orchestrator`;
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Adapter config assembled from env (exported for tests). */
export function buildOrchestratorConfigFromEnv(): OrchestratorAdapterConfig {
  const mode = (process.env.DEVPILOT_ORCHESTRATOR_MODE ?? 'disabled') as OrchestratorMode;
  return {
    mode,
    // http mode
    url: process.env.DEVPILOT_ORCHESTRATOR_URL,
    apiKey: process.env.DEVPILOT_ORCHESTRATOR_API_KEY,
    callbackUrl: getCallbackUrl(),
    // ao-cli mode
    aoProjectName: process.env.DEVPILOT_AO_PROJECT,
    aoPath: process.env.DEVPILOT_AO_PATH,
    // claude-session mode
    sessionApiUrl: process.env.DEVPILOT_SESSION_API_URL,
    sessionApiKey: process.env.DEVPILOT_SESSION_API_KEY,
    sessionEnvironmentId: process.env.DEVPILOT_SESSION_ENVIRONMENT_ID,
    callbackToken: process.env.DEVPILOT_CALLBACK_TOKEN,
  };
}

/** Shared execution config (limits + callbackUrl) built from env. */
export function getWaveExecutionConfig(): WaveExecutionConfig {
  const failurePolicy =
    process.env.DEVPILOT_WAVE_FAILURE_POLICY === 'continue' ? 'continue' : 'halt';
  return {
    maxConcurrentSubagents: intFromEnv('DEVPILOT_WAVE_MAX_CONCURRENT', 4),
    maxTotalActiveTasks: intFromEnv('DEVPILOT_WAVE_MAX_TOTAL', 8),
    subagentDispatchDelayMs: 500,
    waveAdvanceDelayMs: 2000,
    retryLimit: intFromEnv('DEVPILOT_WAVE_RETRY_LIMIT', 1),
    failurePolicy,
    // auto-advance defaults on; only 'false' disables it.
    autoAdvance: process.env.DEVPILOT_WAVE_AUTO_ADVANCE !== 'false',
    callbackUrl: getCallbackUrl(),
  };
}

/**
 * Lazy, process-wide orchestrator bootstrap. Safe to call from any route.
 * Mode `disabled` still initializes the service (DisabledAdapter) so routes can
 * uniformly gate on `service.isEnabled`.
 *
 * On first call it wires the status poller (session-level rows) and the
 * ExecutionBridge (wave-task correlation from job:* events) into the service.
 */
export function getServerOrchestrator(): OrchestratorService {
  if (globalForOrchestrator.devpilotOrchestrator) {
    return globalForOrchestrator.devpilotOrchestrator;
  }

  const service = initOrchestratorService(buildOrchestratorConfigFromEnv());
  initStatusPoller(service, {
    pollIntervalMs: 5000,
    ...createDbStatusPollerCallbacks(),
  });
  // Correlate orchestrator job:* events to wave tasks and advance the loop.
  initExecutionBridge(service, { execution: getWaveExecutionConfig() }).start();

  globalForOrchestrator.devpilotOrchestrator = service;
  return service;
}
