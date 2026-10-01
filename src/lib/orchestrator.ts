/**
 * Server-side orchestrator bootstrap for the Next app (TRD-01 §6.1).
 *
 * A lazy, process-wide singleton so any API route can dispatch through the same
 * OrchestratorService the CLI Fastify server uses. Guarded via globalThis (same
 * pattern as src/lib/db/index.ts) so Next.js hot reload / route isolation can't
 * double-init.
 */

import { AsyncResource } from 'node:async_hooks';
import {
  initOrchestratorService,
  initStatusPoller,
  createDbStatusPollerCallbacks,
  type OrchestratorService,
  type OrchestratorAdapterConfig,
  type OrchestratorMode,
} from '@devpilot.sh/core/orchestrator';
import {
  initExecutionBridge,
  type ExecutionBridge,
  type ReconcileOptions,
  type WaveDriver,
  type WaveExecutionConfig,
} from '@devpilot.sh/core/wave-planner';

const globalForOrchestrator = globalThis as unknown as {
  devpilotOrchestrator?: OrchestratorService;
  devpilotExecutionBridge?: ExecutionBridge;
};

/**
 * The async context this module was loaded in, kept so the orchestrator can be
 * initialised in it whoever first asks.
 *
 * The first caller of `getServerOrchestrator` is often the conductor graph's
 * own `dispatch` node (the `dispatchWave` port calls it on the way in). Node
 * carries the async context a timer is CREATED in to every run of that timer,
 * and inside a LangGraph node that context holds the node's runnable config —
 * its checkpoint namespace, its resume scratchpad. So a bridge started there
 * had its reconcile timer, and its start-up pass, living inside that one node
 * for the life of the process, and every `graph.invoke` they led to was taken
 * by LangGraph for a subgraph call nested in it. Such a resume reported
 * `resumed: true` and moved nothing: a wave whose dispatch queued every task
 * was never started, and a lost task's retry was never sent. It only showed
 * when the first request after a start was the one that dispatched — any other
 * route initialising the orchestrator first hid it.
 *
 * A route module is loaded before any graph it runs, so this is a context with
 * no run in it.
 */
const outsideAnyRun = new AsyncResource('devpilot-orchestrator');

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

/** A number of hours from env. Unset, unparseable or negative gives the fallback. */
function hoursFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
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
    // auto-advance defaults on; only 'false' disables it. LEGACY PATH ONLY: it
    // governs plans dispatched through /api/wave-plans/:id/dispatch that nothing
    // else is sequencing. A plan the conductor graph runs is advanced by the
    // graph whatever this says — see `conductorDriver` below.
    autoAdvance: process.env.DEVPILOT_WAVE_AUTO_ADVANCE !== 'false',
    callbackUrl: getCallbackUrl(),
  };
}

/**
 * The conductor graph, as the execution bridge's `WaveDriver`.
 *
 * This is the line that makes the graph the only driver of the plans it runs.
 * Both the graph and the bridge used to advance a wave plan: the completion
 * route resumed the graph, which dispatched the next wave, and the bridge —
 * hearing the same completion with `autoAdvance` on — dispatched it again two
 * seconds later. Registered here, the bridge asks `owns` for every task that
 * changes and, for a plan the graph is running, records the change and calls
 * `notify` instead of dispatching anything itself. Plans the graph is not
 * running keep the bridge's own advancement, unchanged.
 *
 * Imported lazily: `conductor-resume` reaches the graph, the graph's ports
 * import this module, and a static import here would make that a cycle
 * evaluated in whichever order the bundler happened to pick.
 */
const conductorDriver: WaveDriver = {
  async owns(wavePlanId) {
    const { conductorOwns } = await import('./conductor-resume');
    return conductorOwns(wavePlanId);
  },
  async notify(wavePlanId, waveIndex) {
    const { resumeConductorForTask } = await import('./conductor-resume');
    return resumeConductorForTask(wavePlanId, waveIndex);
  },
};

/**
 * Reconciler settings from env. On by default; `DEVPILOT_RECONCILE=false`
 * turns it off.
 *
 * The off switch is there because the first pass after an upgrade acts on
 * whatever an older build left behind — a task still `dispatched` whose session
 * finished weeks ago is completed, its wave ends, and the graph resumes and
 * dispatches the next wave to real agents. That is the reconciler doing its
 * job, but someone with a database full of abandoned runs may want to look
 * before it does.
 */
function getReconcileOptions(): ReconcileOptions | false {
  if (process.env.DEVPILOT_RECONCILE === 'false') return false;
  return {
    // How long a plan may have been idle and still be picked up when the
    // cockpit starts. Older than this it is paused, with the reason on the
    // plan, and waits for a person — so that starting the cockpit after an
    // upgrade does not wake runs abandoned weeks ago and start agents for
    // them. Hours, fractions allowed; 6 by default; `0` turns the guard off.
    resumeMaxAgeMs: hoursFromEnv('DEVPILOT_RESUME_MAX_AGE_HOURS', 6) * 3_600_000,
    // Floored at 5s: a pass reads every in-flight task and may resume a run,
    // and `0` here would be a timer with no interval at all.
    intervalMs: Math.max(5, intFromEnv('DEVPILOT_RECONCILE_INTERVAL_SECONDS', 60)) * 1000,
    // Default 30 minutes; see DEFAULT_RECONCILE_STALL_MS in core for why it is
    // this generous and what must change with it.
    stallMs: intFromEnv('DEVPILOT_RECONCILE_STALL_MINUTES', 30) * 60_000,
  };
}

/**
 * Lazy, process-wide orchestrator bootstrap. Safe to call from any route.
 * Mode `disabled` still initializes the service (DisabledAdapter) so routes can
 * uniformly gate on `service.isEnabled`.
 *
 * On first call it wires the status poller (session-level rows) and the
 * ExecutionBridge (wave-task correlation from job:* events) into the service,
 * and starts the bridge's reconciler — which runs once immediately, so the
 * first route to touch the orchestrator after a restart is also what picks up
 * the tasks the restart stranded, and re-enters a run the restart cut off in
 * the middle of dispatching. That same first pass holds back any plan that has
 * been idle longer than `DEVPILOT_RESUME_MAX_AGE_HOURS`; see
 * `getReconcileOptions`.
 */
export function getServerOrchestrator(): OrchestratorService {
  if (globalForOrchestrator.devpilotOrchestrator) {
    return globalForOrchestrator.devpilotOrchestrator;
  }

  // Everything created here — the bridge's timer and its first pass above all
  // — must not inherit the caller's async context. See `outsideAnyRun`.
  return outsideAnyRun.runInAsyncScope(startServerOrchestrator);
}

function startServerOrchestrator(): OrchestratorService {
  const service = initOrchestratorService(buildOrchestratorConfigFromEnv());
  initStatusPoller(service, {
    pollIntervalMs: 5000,
    ...createDbStatusPollerCallbacks(),
  });
  // Correlate orchestrator job:* events to wave tasks. The bridge records; the
  // conductor graph advances the plans it runs, and the bridge advances the
  // rest (see `conductorDriver`).
  const bridge = initExecutionBridge(service, {
    execution: getWaveExecutionConfig(),
    driver: conductorDriver,
    reconcile: getReconcileOptions(),
  });

  // Published before `start()`: the reconciler's first pass can resume a run,
  // whose dispatch port calls back into this function.
  globalForOrchestrator.devpilotOrchestrator = service;
  globalForOrchestrator.devpilotExecutionBridge = bridge;
  bridge.start();

  return service;
}

/**
 * The process-wide execution bridge, initialising the orchestrator if nothing
 * has yet. Held on `globalThis` beside the service for the same reason: core's
 * own module-level handle is per bundle copy.
 */
export function getExecutionBridge(): ExecutionBridge {
  getServerOrchestrator();
  return globalForOrchestrator.devpilotExecutionBridge!;
}
