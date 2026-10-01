import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { initDatabase, resetDatabase } from '../../src/db';
import { closeSQLiteConnection } from '../../src/db/adapters/sqlite';
import {
  horizonItems,
  plans,
  rufloSessions,
  wavePlans,
  waves,
  waveTasks,
} from '../../src/db/schema';
import { initOrchestratorService } from '../../src/orchestrator/service';
import type {
  CreateSessionParams,
  SessionTransport,
} from '../../src/orchestrator/claude-session-adapter';
import { WaveDispatchCoordinator } from '../../src/wave-planner/execution/dispatch-coordinator';

/**
 * What a worker is actually sent, end to end: a real SQLite database, the real
 * coordinator and the real claude-session adapter, with only the transport —
 * the HTTP call to the session runner — replaced by one that records the
 * prompt it was asked to start a session with.
 *
 * `buildSessionPrompt` is tested on its own. This is here because the three
 * things that were wrong lived at the call site, not in the builder: the
 * coordinator chose the reporting mode, supplied the predecessors' files, and
 * knew the item the task belonged to without passing it on.
 */

const GLOBAL_KEY = '__devpilotOrchestratorService';

let dir: string;
let db: ReturnType<typeof initDatabase>;
const sessionsCreated: CreateSessionParams[] = [];

const recordingTransport: SessionTransport = {
  async createSession(params) {
    sessionsCreated.push(params);
    return { accepted: true, externalSessionId: `ext_${sessionsCreated.length}` };
  },
  async sendMessage() {
    return { success: true };
  },
  async stopSession() {
    return { success: true, message: 'stopped' };
  },
};

const config = {
  maxConcurrentSubagents: 4,
  maxTotalActiveTasks: 8,
  subagentDispatchDelayMs: 0,
  waveAdvanceDelayMs: 0,
  retryLimit: 1,
  failurePolicy: 'halt' as const,
  autoAdvance: false,
  callbackUrl: 'http://localhost:3000/api/orchestrator',
};

const WAVE_PLAN_ID = 'wp_1';

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'devpilot-dispatch-prompt-'));
  db = initDatabase({ type: 'sqlite', sqlitePath: join(dir, 'data.db') });
  initOrchestratorService({ mode: 'claude-session' }, recordingTransport);

  const [item] = await db
    .insert(horizonItems)
    .values({
      title: 'Fix checkout',
      description: 'Payments time out when the gateway is slow. Retry three times.',
      repo: 'acme/storefront',
      linearTicketId: 'AVA-12',
    })
    .returning();

  // Foreign keys are enforced, so the plan and wave rows are real ones.
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

  await db.insert(wavePlans).values({
    id: WAVE_PLAN_ID,
    planId: plan.id,
    horizonItemId: item.id,
    totalWaves: 2,
    totalTasks: 3,
    maxParallelism: 2,
    criticalPath: ['1.1', '2.1'],
    criticalPathLength: 2,
    parallelizationScore: 0.33,
    status: 'executing',
  });

  // 1.1 ran under a runner that reported telemetry: it was scoped to one file
  // and actually wrote to two others.
  const [observed] = await db
    .insert(rufloSessions)
    .values({
      repo: 'acme/storefront',
      linearTicketId: 'AVA-12',
      ticketTitle: 'Fix checkout — 1.1',
      status: 'COMPLETE',
      telemetry: { filesTouched: ['src/checkout/client.ts', 'src/checkout/errors.ts'] },
    })
    .returning();

  // 1.2 ran under one that did not.
  const [unobserved] = await db
    .insert(rufloSessions)
    .values({
      repo: 'acme/storefront',
      linearTicketId: 'AVA-12',
      ticketTitle: 'Fix checkout — 1.2',
      status: 'COMPLETE',
    })
    .returning();

  const [firstWave, secondWave] = await db
    .insert(waves)
    .values([
      { wavePlanId: WAVE_PLAN_ID, waveIndex: 0, label: 'Wave 1', maxParallelTasks: 2 },
      { wavePlanId: WAVE_PLAN_ID, waveIndex: 1, label: 'Wave 2', maxParallelTasks: 1 },
    ])
    .returning();

  await db.insert(waveTasks).values([
    {
      waveId: firstWave.id,
      wavePlanId: WAVE_PLAN_ID,
      waveIndex: 0,
      taskCode: '1.1',
      label: 'Extract the client',
      description: 'Extract the checkout client',
      filePaths: ['src/checkout/page.tsx'],
      status: 'completed',
      assignedSessionId: observed.id,
      completionSummary: 'Moved the client out of the page component.',
    },
    {
      waveId: firstWave.id,
      wavePlanId: WAVE_PLAN_ID,
      waveIndex: 0,
      taskCode: '1.2',
      label: 'Add the config flag',
      description: 'Add the retry config flag',
      filePaths: ['src/config.ts'],
      status: 'completed',
      assignedSessionId: unobserved.id,
      completionSummary: 'Added CHECKOUT_RETRIES.',
    },
    {
      waveId: secondWave.id,
      wavePlanId: WAVE_PLAN_ID,
      waveIndex: 1,
      taskCode: '2.1',
      label: 'Add the retry',
      description: 'Add a retry to the checkout client',
      filePaths: ['src/checkout/retry.ts'],
      dependencies: ['1.1', '1.2'],
      status: 'pending',
    },
  ]);
});

afterAll(() => {
  delete (globalThis as unknown as Record<string, unknown>)[GLOBAL_KEY];
  closeSQLiteConnection();
  resetDatabase();
  rmSync(dir, { recursive: true, force: true });
});

describe('WaveDispatchCoordinator.getPredecessorContext', () => {
  it('reports the files a predecessor touched when the runner observed them', async () => {
    const context = await new WaveDispatchCoordinator(config).getPredecessorContext(
      WAVE_PLAN_ID,
      '2.1'
    );

    expect(context.find((p) => p.taskCode === '1.1')).toEqual({
      taskCode: '1.1',
      description: 'Extract the checkout client',
      filesModified: ['src/checkout/client.ts', 'src/checkout/errors.ts'],
      filesSource: 'touched',
      completionSummary: 'Moved the client out of the page component.',
    });
  });

  it('falls back to the planned files, and says that is what they are', async () => {
    const context = await new WaveDispatchCoordinator(config).getPredecessorContext(
      WAVE_PLAN_ID,
      '2.1'
    );

    expect(context.find((p) => p.taskCode === '1.2')).toEqual({
      taskCode: '1.2',
      description: 'Add the retry config flag',
      filesModified: ['src/config.ts'],
      filesSource: 'scoped',
      completionSummary: 'Added CHECKOUT_RETRIES.',
    });
  });
});

describe('WaveDispatchCoordinator.dispatchWave — the prompt a worker receives', () => {
  let prompt: string;

  beforeAll(async () => {
    const pending = await db.query.waveTasks.findMany({
      where: eq(waveTasks.taskCode, '2.1'),
    });
    const result = await new WaveDispatchCoordinator(config).dispatchWave(WAVE_PLAN_ID, 1, pending);

    expect(result).toEqual({ dispatched: 1, queued: 0, errors: [] });
    expect(sessionsCreated).toHaveLength(1);
    prompt = sessionsCreated[0].prompt;
  });

  it('does not tell a runner-reported session to call back', () => {
    expect(prompt).not.toContain('curl');
    expect(prompt).not.toContain('<callback-token>');
    expect(prompt).toContain('# When You Finish');
  });

  it('says what the item is for, with the ticket description as a labelled block', () => {
    expect(prompt).toContain('Your task is one part of a larger piece of work: **Fix checkout**.');
    expect(prompt).toContain(
      '<ticket-description>\nPayments time out when the gateway is slow. Retry three times.\n</ticket-description>'
    );
  });

  it('labels each predecessor’s files for what they are', () => {
    expect(prompt).toContain(
      '- Files this task touched (as last reported by its runner): ' +
        '`src/checkout/client.ts`, `src/checkout/errors.ts`'
    );
    expect(prompt).toContain('- Files this task was scoped to: `src/config.ts`');
    expect(prompt).not.toContain('Files modified');
  });

  it('describes the file scope without claiming a lock', () => {
    expect(prompt).toContain("These files are this task's scope.");
    expect(prompt).toContain('- `src/checkout/retry.ts`');
    expect(prompt).not.toMatch(/exclusive lock/i);
  });

  it('names the session row it created, which is how the scanner knows the session is ours', async () => {
    const [task] = await db.select().from(waveTasks).where(eq(waveTasks.taskCode, '2.1'));

    expect(task.status).toBe('dispatched');
    expect(prompt).toContain(`Your DevPilot session id is \`${task.assignedSessionId}\``);
    expect(sessionsCreated[0].sessionId).toBe(task.assignedSessionId);
  });
});
