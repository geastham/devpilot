import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asc, eq } from 'drizzle-orm';
import { initDatabase, resetDatabase } from '../../src/db';
import { closeSQLiteConnection } from '../../src/db/adapters/sqlite';
import {
  activityEvents,
  horizonItems,
  plans,
  rufloSessions,
  wavePlans,
  waves,
  waveTasks,
} from '../../src/db/schema';
import { initOrchestratorService, type OrchestratorService } from '../../src/orchestrator/service';
import type {
  CreateSessionParams,
  CreateSessionResult,
  SessionTransport,
} from '../../src/orchestrator/claude-session-adapter';
import type {
  CompletionReport,
  IntegrateOutcome,
  IntegrateRequest,
} from '../../src/orchestrator/types';
import { WaveDispatchCoordinator } from '../../src/wave-planner/execution/dispatch-coordinator';
import { WaveExecutionController } from '../../src/wave-planner/execution/controller';
import type { WaveDriver } from '../../src/wave-planner/execution/execution-bridge';
import type { WaveExecutionConfig } from '../../src/wave-planner/execution/types';
import type { SettledWave } from '../../src/wave-planner/execution/wave-state';

/**
 * Shared scaffolding for the wave execution tests.
 *
 * Same shape as `unit/dispatch-coordinator-prompt.test.ts`: a real SQLite file,
 * the real coordinator, controller, bridge and claude-session adapter, with
 * only the transport — the HTTP call that would start an agent — replaced. So
 * "how many agents were started for this task" is a count of transport calls,
 * which is the one number these tests exist to pin.
 */

const GLOBAL_KEY = '__devpilotOrchestratorService';

export type Db = ReturnType<typeof initDatabase>;

export interface TestDatabase {
  db: Db;
  close(): void;
}

/** A fresh database file. One per test: the concurrency caps are global. */
export function openTestDatabase(): TestDatabase {
  const dir = mkdtempSync(join(tmpdir(), 'devpilot-wave-execution-'));
  const db = initDatabase({ type: 'sqlite', sqlitePath: join(dir, 'data.db') });
  return {
    db,
    close() {
      delete (globalThis as unknown as Record<string, unknown>)[GLOBAL_KEY];
      closeSQLiteConnection();
      resetDatabase();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function executionConfig(overrides: Partial<WaveExecutionConfig> = {}): WaveExecutionConfig {
  return {
    maxConcurrentSubagents: 4,
    maxTotalActiveTasks: 8,
    subagentDispatchDelayMs: 0,
    waveAdvanceDelayMs: 0,
    retryLimit: 1,
    failurePolicy: 'halt',
    autoAdvance: true,
    callbackUrl: 'http://localhost:3000/api/orchestrator',
    ...overrides,
  };
}

export interface RecordingTransport extends SessionTransport {
  /** Every session the runner was asked to start, in order. */
  created: CreateSessionParams[];
  /** Task codes of those sessions, in order — one entry per agent started. */
  taskCodes(): string[];
  /** How many agents were started for one task. */
  startedFor(taskCode: string): number;
  /** Replace how the "runner" answers a create. Default: accept. */
  respond: (params: CreateSessionParams) => CreateSessionResult | Promise<CreateSessionResult>;
}

/**
 * A transport that records what it was asked to start.
 *
 * It yields to the event loop before answering, as a real HTTP call does. That
 * matters: the double-dispatch these tests guard against only happens when two
 * dispatch loops interleave, and they only interleave across a real await.
 */
export function recordingTransport(): RecordingTransport {
  const created: CreateSessionParams[] = [];
  const transport: RecordingTransport = {
    created,
    taskCodes: () => created.map((c) => String(c.metadata?.taskCode)),
    startedFor: (taskCode) => created.filter((c) => c.metadata?.taskCode === taskCode).length,
    respond: () => ({ accepted: true, externalSessionId: `ext_${created.length}` }),
    async createSession(params) {
      created.push(params);
      await new Promise((resolve) => setTimeout(resolve, 2));
      return transport.respond(params);
    },
    async sendMessage() {
      return { success: true };
    },
    async stopSession() {
      return { success: true, message: 'stopped' };
    },
  };
  return transport;
}

export interface IsolatingTransport extends RecordingTransport {
  /** What `/v1/health` lists. Null is a runner that did not answer. */
  capabilityList: string[] | null;
  /** Every merge the runner was asked for, in order. */
  integrations: IntegrateRequest[];
  /** Task codes whose branch is in the run branch, as the runner would know it. */
  mergedCodes: Set<string>;
  /** Replace how the "runner" answers a merge. Default: merge everything asked. */
  merge: (request: IntegrateRequest) => IntegrateOutcome | Promise<IntegrateOutcome>;
  /** The default answer, for a `merge` that wants to fall back to it. */
  mergeAll(request: IntegrateRequest, conflicts?: Record<string, string[]>): IntegrateOutcome;
}

/**
 * A recording transport that also answers as a runner with the `isolation`
 * capability does: it reports the capability and merges what it is asked to.
 *
 * Like the real runner it is idempotent — a task merged once comes back
 * `alreadyMerged` — and its head moves only when something new goes in, so a
 * test can tell a merge that happened from one that was merely asked for.
 */
export function isolatingTransport(): IsolatingTransport {
  const base = recordingTransport();
  let head = 0;

  const transport: IsolatingTransport = Object.assign(base, {
    capabilityList: ['isolation'] as string[] | null,
    integrations: [] as IntegrateRequest[],
    mergedCodes: new Set<string>(),
    merge: (request: IntegrateRequest) => transport.mergeAll(request),
    mergeAll(request: IntegrateRequest, conflicts: Record<string, string[]> = {}): IntegrateOutcome {
      const merged = [];
      const conflicted = [];
      for (const taskCode of request.taskCodes) {
        const branch = `devpilot/${request.runId}/task-${taskCode}`;
        if (conflicts[taskCode]) {
          conflicted.push({ taskCode, branch, files: conflicts[taskCode] });
          continue;
        }
        const alreadyMerged = transport.mergedCodes.has(taskCode);
        if (!alreadyMerged) {
          transport.mergedCodes.add(taskCode);
          head++;
        }
        merged.push({ taskCode, branch, commitSha: `commit_${taskCode}`, alreadyMerged });
      }
      return {
        ok: true,
        result: {
          runBranch: `devpilot/${request.runId}/run`,
          headSha: `head_${head}`,
          merged,
          conflicts: conflicted,
          missing: [],
        },
      };
    },
    async capabilities() {
      return transport.capabilityList;
    },
    async integrate(request: IntegrateRequest) {
      transport.integrations.push(request);
      await new Promise((resolve) => setTimeout(resolve, 2));
      return transport.merge(request);
    },
  });
  return transport;
}

/** A new orchestrator service — and with it, empty in-memory session mappings. */
export function startService(transport: SessionTransport): OrchestratorService {
  return initOrchestratorService({ mode: 'claude-session' }, transport);
}

export function newController(config: WaveExecutionConfig): WaveExecutionController {
  return new WaveExecutionController(config, new WaveDispatchCoordinator(config));
}

export interface SeededTask {
  code: string;
  critical?: boolean;
  /** Task codes this one depends on; they become its predecessor context. */
  dependsOn?: string[];
}

/**
 * Insert an executing wave plan. `shape` is one array of tasks per wave; a bare
 * string is a task code.
 */
export async function seedPlan(
  db: Db,
  shape: (string | SeededTask)[][],
  options: { status?: 'approved' | 'executing' | 'draft'; linearTicketId?: string | null } = {}
): Promise<string> {
  const [item] = await db
    .insert(horizonItems)
    .values({
      title: 'Fix checkout',
      repo: 'acme/storefront',
      linearTicketId: options.linearTicketId === undefined ? 'AVA-12' : options.linearTicketId,
    })
    .returning();

  const [plan] = await db
    .insert(plans)
    .values({
      horizonItemId: item.id,
      estimatedCostUsd: 0,
      baselineCostUsd: 0,
      acceptanceCriteria: [],
      confidenceSignals: {},
      fleetContextSnapshot: {},
    })
    .returning();

  const totalTasks = shape.reduce((n, wave) => n + wave.length, 0);
  const [wavePlan] = await db
    .insert(wavePlans)
    .values({
      planId: plan.id,
      horizonItemId: item.id,
      totalWaves: shape.length,
      totalTasks,
      maxParallelism: Math.max(...shape.map((wave) => wave.length)),
      criticalPath: [],
      criticalPathLength: shape.length,
      parallelizationScore: 0.5,
      status: options.status ?? 'executing',
      startedAt: new Date(),
    })
    .returning();

  for (let waveIndex = 0; waveIndex < shape.length; waveIndex++) {
    const [wave] = await db
      .insert(waves)
      .values({
        wavePlanId: wavePlan.id,
        waveIndex,
        label: `Wave ${waveIndex + 1}`,
        maxParallelTasks: shape[waveIndex].length,
      })
      .returning();

    for (const entry of shape[waveIndex]) {
      const task = typeof entry === 'string' ? { code: entry } : entry;
      await db.insert(waveTasks).values({
        waveId: wave.id,
        wavePlanId: wavePlan.id,
        waveIndex,
        taskCode: task.code,
        label: `Task ${task.code}`,
        description: `Do ${task.code}`,
        filePaths: [`src/${task.code}.ts`],
        dependencies: task.dependsOn ?? [],
        isOnCriticalPath: task.critical ?? false,
      });
    }
  }

  return wavePlan.id;
}

export async function taskByCode(db: Db, wavePlanId: string, taskCode: string) {
  const rows = await db.select().from(waveTasks).where(eq(waveTasks.wavePlanId, wavePlanId));
  const task = rows.find((t) => t.taskCode === taskCode);
  if (!task) throw new Error(`no task ${taskCode} in plan ${wavePlanId}`);
  return task;
}

/** `{ '1.1': 'running', … }` for a plan. */
export async function statuses(db: Db, wavePlanId: string): Promise<Record<string, string>> {
  const rows = await db.select().from(waveTasks).where(eq(waveTasks.wavePlanId, wavePlanId));
  return Object.fromEntries(rows.map((t) => [t.taskCode, t.status]));
}

export async function planRow(db: Db, wavePlanId: string) {
  const [plan] = await db.select().from(wavePlans).where(eq(wavePlans.id, wavePlanId));
  return plan;
}

export async function waveRows(db: Db, wavePlanId: string) {
  return db
    .select()
    .from(waves)
    .where(eq(waves.wavePlanId, wavePlanId))
    .orderBy(asc(waves.waveIndex));
}

export async function eventsOfType(db: Db, type: (typeof activityEvents.$inferSelect)['type']) {
  return db.select().from(activityEvents).where(eq(activityEvents.type, type));
}

export function completionReport(
  sessionId: string,
  outcome: { success: true; summary?: string } | { success: false; error: string }
): CompletionReport {
  return {
    sessionId,
    success: outcome.success,
    filesModified: [],
    filesCreated: [],
    filesDeleted: [],
    summary: outcome.success ? (outcome.summary ?? 'done') : outcome.error,
    tokensUsed: 1000,
    costUsd: 0.1,
    durationMinutes: 1,
    ...(outcome.success
      ? {}
      : { error: { code: 'AGENT_ERROR', message: outcome.error, recoverable: false } }),
  };
}

/**
 * A completion report as the runner sends it for a task that ran on its own
 * branch: where the work is, and exactly which files changed.
 */
export function isolatedReport(
  sessionId: string,
  work: { runId: string; taskCode: string; created?: string[]; modified?: string[]; deleted?: string[] },
  outcome: { success: true; summary?: string } | { success: false; error: string } = { success: true }
): CompletionReport {
  return {
    ...completionReport(sessionId, outcome),
    branch: `devpilot/${work.runId}/task-${work.taskCode}`,
    baseSha: 'base_sha',
    commitSha: `commit_${work.taskCode}`,
    filesCreated: work.created ?? [],
    filesModified: work.modified ?? [],
    filesDeleted: work.deleted ?? [],
  };
}

/**
 * What the callback route does to the session row before it forwards a report
 * to the orchestrator service. The reconciler reads this row, so tests that
 * exercise it have to write it.
 */
export async function markSession(
  db: Db,
  sessionId: string,
  values: Partial<typeof rufloSessions.$inferInsert>
): Promise<void> {
  await db.update(rufloSessions).set(values).where(eq(rufloSessions.id, sessionId));
}

export interface StandInRun {
  /** The wave the run is suspended on, as a graph's pending interrupt would say. */
  waitingOn: number | null;
  status: 'executing' | 'complete' | 'failed';
  /** Every wave index passed to `driveWave`, in order, backfills included. */
  driven: number[];
  /** Every notification received, whether or not it resumed anything. */
  notified: number[];
  failures: SettledWave | null;
}

/**
 * A stand-in for the conductor graph and the Next app's resume bridge.
 *
 * Core cannot import the graph (it carries langchain, which core deliberately
 * does not), so the integration tests drive a plan with this instead. It does
 * what `src/lib/conductor-resume.ts` and the graph's edges do between them, and
 * nothing cleverer:
 *
 *  - one thing at a time per run;
 *  - act only when suspended on the wave the notification is about;
 *  - ask the controller's wave gate (`signalForDriver`) what the wave says,
 *    which for an isolated plan merges the wave first — the same call, in the
 *    same order, as the resume bridge makes;
 *  - `over/complete` → drive the next wave, or complete the plan after the last;
 *  - `over/failed`   → end the run failed (`waveRetryLimit: 0`, policy `halt`);
 *  - `backfill`      → drive the same wave again.
 *
 * Every dispatch it makes goes through `controller.driveWave`, the same method
 * the real `dispatchWave` port calls. What it does NOT cover is the graph
 * itself — that is `packages/conductor-agent/tests/graph.test.ts`.
 *
 * `resumeFrom` builds one "after a restart": suspended on a wave, as a graph
 * reloaded from its checkpoint would be.
 */
export function standInConductor(
  wavePlanId: string,
  totalWaves: number,
  controller: WaveExecutionController,
  // Unused since the stand-in asks the controller (which has its own copy) for
  // the wave's signal; kept so the call sites read as the real wiring does.
  _config: WaveExecutionConfig,
  resumeFrom?: number
) {
  const run: StandInRun = {
    waitingOn: resumeFrom ?? null,
    status: 'executing',
    driven: [],
    notified: [],
    failures: null,
  };

  let tail: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(work: () => Promise<T>): Promise<T> => {
    const result = tail.then(work);
    tail = result.catch(() => undefined);
    return result;
  };

  async function drive(waveIndex: number): Promise<void> {
    run.driven.push(waveIndex);
    const result = await controller.driveWave(wavePlanId, waveIndex);
    if (result.settled) {
      await act(waveIndex, result.settled);
      return;
    }
    run.waitingOn = waveIndex;
  }

  async function act(waveIndex: number, outcome: SettledWave): Promise<void> {
    if (outcome.state === 'failed') {
      run.status = 'failed';
      run.waitingOn = null;
      run.failures = outcome;
      const last = outcome.failures[outcome.failures.length - 1];
      await controller.failPlan(wavePlanId, `wave ${waveIndex} ${last.taskCode}: ${last.error}`);
      return;
    }
    if (waveIndex + 1 < totalWaves) {
      await drive(waveIndex + 1);
      return;
    }
    run.status = 'complete';
    run.waitingOn = null;
    await controller.completePlan(wavePlanId);
  }

  const driver: WaveDriver = {
    owns: async (id) => id === wavePlanId,
    notify: (id, waveIndex) =>
      exclusive(async () => {
        run.notified.push(waveIndex);
        if (run.waitingOn !== waveIndex) {
          return { resumed: false, reason: 'run is not waiting on this wave' };
        }
        const signal = await controller.signalForDriver(id, waveIndex);
        if (signal.kind === 'wait') return { resumed: false, reason: signal.reason };
        if (signal.kind === 'merge') return { resumed: false, reason: 'waiting to be merged' };
        if (signal.kind === 'backfill') await drive(waveIndex);
        else await act(waveIndex, signal.outcome);
        return { resumed: true };
      }),
  };

  return { run, driver, start: () => exclusive(() => drive(0)) };
}
