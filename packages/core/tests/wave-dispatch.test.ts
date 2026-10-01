import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { rufloSessions, waveTasks } from '../src/db/schema';
import { ExecutionBridge } from '../src/wave-planner/execution/execution-bridge';
import { freeDispatchSlots } from '../src/wave-planner/execution/wave-state';
import {
  eventsOfType,
  executionConfig,
  newController,
  openTestDatabase,
  planRow,
  recordingTransport,
  seedPlan,
  startService,
  statuses,
  taskByCode,
  waveRows,
  type RecordingTransport,
  type TestDatabase,
} from './helpers/wave-harness';

/**
 * Dispatch, against a real SQLite file with only the transport stubbed.
 *
 * The properties here are all about what reaches an agent: that a task is sent
 * to exactly one however many callers ask, that the caps hold, that the order
 * honours the plan, and that the times written down are the times things
 * happened.
 */

let database: TestDatabase;
let transport: RecordingTransport;

beforeEach(() => {
  database = openTestDatabase();
  transport = recordingTransport();
  startService(transport);
});

afterEach(() => {
  vi.useRealTimers();
  database.close();
});

describe('dispatch is idempotent at the data level', () => {
  it('sends each task to one agent when two callers dispatch the same wave at once', async () => {
    const config = executionConfig();
    const planId = await seedPlan(database.db, [['1.1', '1.2', '1.3', '1.4']]);

    // Two controllers, as there were two components: the conductor graph's and
    // the execution bridge's. Each reads its own snapshot of the wave.
    const [first, second] = await Promise.all([
      newController(config).dispatchWave(planId, 0),
      newController(config).dispatchWave(planId, 0),
    ]);

    // One transport call per task — not one per caller per task.
    expect(transport.taskCodes().sort()).toEqual(['1.1', '1.2', '1.3', '1.4']);
    expect(first.dispatched + second.dispatched).toBe(4);
    expect(first.errors).toEqual([]);
    expect(second.errors).toEqual([]);

    // And one session row per task, each task linked to its own.
    const sessions = await database.db.select().from(rufloSessions);
    expect(sessions).toHaveLength(4);
    const tasks = await database.db.select().from(waveTasks).where(eq(waveTasks.wavePlanId, planId));
    expect(new Set(tasks.map((t) => t.assignedSessionId)).size).toBe(4);
    expect(tasks.every((t) => t.status === 'dispatched')).toBe(true);
  });

  it('dispatches nothing the second time a wave is dispatched', async () => {
    const config = executionConfig();
    const planId = await seedPlan(database.db, [['1.1', '1.2']]);
    const controller = newController(config);

    await controller.dispatchWave(planId, 0);
    const again = await controller.dispatchWave(planId, 0);

    expect(again).toEqual({ dispatched: 0, queued: 0, errors: [] });
    expect(transport.created).toHaveLength(2);
  });

  it('dispatches nothing for a plan that is not executing', async () => {
    const config = executionConfig();
    const planId = await seedPlan(database.db, [['1.1']]);
    const controller = newController(config);

    await controller.failPlan(planId, 'stopped by a test');
    const result = await controller.dispatchWave(planId, 0);

    expect(result.dispatched).toBe(0);
    expect(transport.created).toHaveLength(0);
    // …and the dispatch did not put the plan back to `executing`.
    expect((await planRow(database.db, planId)).status).toBe('failed');
  });
});

describe('the concurrency caps are caps', () => {
  it('holds the per-plan cap across concurrent callers and across calls', async () => {
    const config = executionConfig({ maxConcurrentSubagents: 2 });
    const planId = await seedPlan(database.db, [['1.1', '1.2', '1.3', '1.4', '1.5']]);

    await Promise.all([
      newController(config).dispatchWave(planId, 0),
      newController(config).dispatchWave(planId, 0),
    ]);

    // Two callers, cap of two: two agents, not four.
    expect(transport.created).toHaveLength(2);

    // A third call — the "two seconds later" one — finds the cap full. It used
    // to be a batch size, so this call started two more.
    const third = await newController(config).dispatchWave(planId, 0);
    expect(third).toEqual({ dispatched: 0, queued: 3, errors: [] });
    expect(transport.created).toHaveLength(2);

    const counts = Object.values(await statuses(database.db, planId)).reduce<Record<string, number>>(
      (acc, s) => ({ ...acc, [s]: (acc[s] ?? 0) + 1 }),
      {}
    );
    expect(counts).toEqual({ dispatched: 2, pending: 3 });
  });

  it('counts dispatched tasks, and counts them across plans', async () => {
    const config = executionConfig({ maxConcurrentSubagents: 4, maxTotalActiveTasks: 3 });
    const first = await seedPlan(database.db, [['1.1', '1.2']]);
    const second = await seedPlan(database.db, [['2.1', '2.2', '2.3']]);
    const controller = newController(config);

    await controller.dispatchWave(first, 0);
    // Nothing is `running` — no bridge is listening — and the cap still sees
    // the two `dispatched` tasks. It used to count `running` alone.
    expect(await freeDispatchSlots(second, config)).toBe(1);

    const result = await controller.dispatchWave(second, 0);
    expect(result).toEqual({ dispatched: 1, queued: 2, errors: [] });
    expect(transport.created).toHaveLength(3);
  });

  it('does not let a dead plan hold slots', async () => {
    const config = executionConfig({ maxTotalActiveTasks: 2 });
    const dead = await seedPlan(database.db, [['1.1', '1.2']]);
    const live = await seedPlan(database.db, [['2.1', '2.2']]);
    const controller = newController(config);

    await controller.dispatchWave(dead, 0);
    await controller.failPlan(dead, 'abandoned');

    // The failed plan's tasks are still `dispatched` — nothing settles them —
    // but they no longer count.
    expect(await statuses(database.db, dead)).toEqual({ '1.1': 'dispatched', '1.2': 'dispatched' });
    expect((await controller.dispatchWave(live, 0)).dispatched).toBe(2);
  });
});

describe('a dispatched task becomes running', () => {
  it('marks the task running and writes WAVE_TASK_DISPATCHED when the job starts', async () => {
    const config = executionConfig();
    const planId = await seedPlan(database.db, [['1.1', '1.2']]);
    const service = startService(transport);
    const bridge = new ExecutionBridge(service, { execution: config });
    bridge.start();

    await newController(config).dispatchWave(planId, 0);
    await bridge.drain();

    // `job:started` fires inside dispatch. The task has to be linked to its
    // session before that, or the bridge finds no task to mark.
    expect(await statuses(database.db, planId)).toEqual({ '1.1': 'running', '1.2': 'running' });

    const events = await eventsOfType(database.db, 'WAVE_TASK_DISPATCHED');
    expect(events).toHaveLength(2);
    expect(events.map((e) => (e.metadata as { taskCode: string }).taskCode).sort()).toEqual([
      '1.1',
      '1.2',
    ]);

    // Running tasks hold their slots.
    expect(await freeDispatchSlots(planId, config)).toBe(2);
    bridge.stop();
  });
});

describe('dispatch order', () => {
  it('starts critical-path tasks first when the cap admits only some of a wave', async () => {
    const config = executionConfig({ maxConcurrentSubagents: 2 });
    const planId = await seedPlan(database.db, [
      ['1.1', { code: '1.2', critical: true }, '1.3', { code: '1.4', critical: true }],
    ]);

    await newController(config).dispatchWave(planId, 0);

    expect(transport.taskCodes()).toEqual(['1.2', '1.4']);
    expect(await statuses(database.db, planId)).toEqual({
      '1.1': 'pending',
      '1.2': 'dispatched',
      '1.3': 'pending',
      '1.4': 'dispatched',
    });
  });
});

describe('timings', () => {
  const T0 = new Date('2026-10-01T10:00:00Z');
  const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

  it('sets a wave’s start once, and leaves it alone on every later dispatch pass', async () => {
    // Only the clock is faked; the transport's real timers still run.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);

    const config = executionConfig({ maxConcurrentSubagents: 1 });
    const planId = await seedPlan(database.db, [['1.1', '1.2']]);
    const service = startService(transport);
    const bridge = new ExecutionBridge(service, { execution: config });
    bridge.start();

    const controller = newController(config);
    await controller.dispatchWave(planId, 0);
    await bridge.drain();

    const [started] = await waveRows(database.db, planId);
    expect(started.startedAt).toEqual(T0);
    expect(started.status).toBe('active');

    // 90 seconds later the first task finishes and the bridge backfills.
    vi.setSystemTime(at(90));
    const first = await taskByCode(database.db, planId, '1.1');
    service.ingestCompletionReport({
      sessionId: first.assignedSessionId!,
      success: true,
      filesModified: [],
      filesCreated: [],
      filesDeleted: [],
      summary: 'done',
      tokensUsed: 0,
      costUsd: 0,
      durationMinutes: 1,
    });
    await bridge.drain();

    const [afterBackfill] = await waveRows(database.db, planId);
    expect(afterBackfill.startedAt).toEqual(T0);
    expect(afterBackfill.status).toBe('active');

    const done = await taskByCode(database.db, planId, '1.1');
    expect(done.startedAt).toEqual(T0);
    expect(done.completedAt).toEqual(at(90));

    const second = await taskByCode(database.db, planId, '1.2');
    expect(second.status).toBe('running');
    expect(second.startedAt).toEqual(at(90));
    bridge.stop();
  });

  it('keeps a task’s first start through a retry and records the retry’s own', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);

    const config = executionConfig();
    const planId = await seedPlan(database.db, [['1.1']]);
    const controller = newController(config);

    await controller.dispatchWave(planId, 0);
    const firstAttempt = await taskByCode(database.db, planId, '1.1');
    expect(firstAttempt.startedAt).toEqual(T0);
    expect(firstAttempt.lastAttemptAt).toEqual(T0);

    vi.setSystemTime(at(300));
    expect(
      await controller.onTaskFailed(planId, '1.1', 'boom', {
        sessionId: firstAttempt.assignedSessionId!,
      })
    ).toBe('retrying');

    vi.setSystemTime(at(305));
    await controller.dispatchWave(planId, 0);

    const retried = await taskByCode(database.db, planId, '1.1');
    expect(retried.status).toBe('dispatched');
    expect(retried.retryCount).toBe(1);
    expect(retried.startedAt).toEqual(T0); // not moved
    expect(retried.lastAttemptAt).toEqual(at(305)); // moved
    expect(retried.assignedSessionId).not.toBe(firstAttempt.assignedSessionId);
    expect(transport.startedFor('1.1')).toBe(2);
  });

  it('records when a wave ended, once, as the last task settles', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);

    const config = executionConfig();
    const planId = await seedPlan(database.db, [['1.1', '1.2']]);
    const service = startService(transport);
    // No driver: the legacy path, which settles waves through the bridge.
    const bridge = new ExecutionBridge(service, {
      execution: executionConfig({ autoAdvance: false }),
    });
    bridge.start();
    await newController(config).dispatchWave(planId, 0);
    await bridge.drain();

    const report = (sessionId: string) => ({
      sessionId,
      success: true,
      filesModified: [],
      filesCreated: [],
      filesDeleted: [],
      summary: 'done',
      tokensUsed: 0,
      costUsd: 0,
      durationMinutes: 1,
    });

    vi.setSystemTime(at(60));
    service.ingestCompletionReport(report((await taskByCode(database.db, planId, '1.1')).assignedSessionId!));
    await bridge.drain();
    expect((await waveRows(database.db, planId))[0].completedAt).toBeNull();

    vi.setSystemTime(at(120));
    service.ingestCompletionReport(report((await taskByCode(database.db, planId, '1.2')).assignedSessionId!));
    await bridge.drain();

    const [wave] = await waveRows(database.db, planId);
    expect(wave.status).toBe('completed');
    expect(wave.completedAt).toEqual(at(120));
    bridge.stop();
  });
});

describe('a dispatch that does not happen', () => {
  it('hands a task back, untouched, when the runner is full', async () => {
    const config = executionConfig();
    const planId = await seedPlan(database.db, [['1.1', '1.2', '1.3']]);

    // The runner takes one session and then answers 429.
    transport.respond = () =>
      transport.created.length === 1
        ? { accepted: true, externalSessionId: 'ext_1' }
        : { accepted: false, error: 'CAPACITY' };

    const result = await newController(config).dispatchWave(planId, 0);

    expect(result).toEqual({ dispatched: 1, queued: 2, errors: [] });
    // It stopped asking after the first refusal rather than trying 1.3 too.
    expect(transport.taskCodes()).toEqual(['1.1', '1.2']);

    const refused = await taskByCode(database.db, planId, '1.2');
    expect(refused.status).toBe('pending');
    expect(refused.assignedSessionId).toBeNull();
    expect(refused.startedAt).toBeNull(); // an attempt that never started did not start
    expect(refused.lastAttemptAt).toBeNull();

    // The session row created for the refused dispatch was rolled back.
    expect(await database.db.select().from(rufloSessions)).toHaveLength(1);
    expect((await planRow(database.db, planId)).status).toBe('executing');
  });

  it('fails the plan, with the reason, when the runner refuses a task outright', async () => {
    const config = executionConfig();
    const planId = await seedPlan(database.db, [['1.1'], ['2.1']]);
    transport.respond = () => ({ accepted: false, error: 'Session create failed: 400 no such repo' });

    const controller = newController(config);
    const result = await controller.driveWave(planId, 0);

    // The driver is told the wave is over rather than left to wait for a
    // report that no agent will ever send.
    expect(result.settled).toEqual({
      state: 'failed',
      failures: [{ taskCode: '1.1', error: 'Session create failed: 400 no such repo' }],
    });

    const plan = await planRow(database.db, planId);
    expect(plan.status).toBe('failed');
    expect(plan.failureReason).toBe('Task 1.1 failed: Session create failed: 400 no such repo');
    expect(await statuses(database.db, planId)).toEqual({ '1.1': 'failed', '2.1': 'skipped' });
    expect(await database.db.select().from(rufloSessions)).toHaveLength(0);
  });
});
