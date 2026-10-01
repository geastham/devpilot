import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { rufloSessions, wavePlanMetrics, wavePlans, waveTasks } from '../src/db/schema';
import {
  ExecutionBridge,
  type WaveDriver,
} from '../src/wave-planner/execution/execution-bridge';
import { waveSignalFor } from '../src/wave-planner/execution/wave-state';
import {
  completionReport,
  eventsOfType,
  executionConfig,
  markSession,
  newController,
  openTestDatabase,
  planRow,
  recordingTransport,
  seedPlan,
  standInConductor,
  startService,
  statuses,
  taskByCode,
  waveRows,
  type RecordingTransport,
  type TestDatabase,
} from './helpers/wave-harness';

/**
 * How a run advances, fails and recovers — against a real SQLite file, the real
 * orchestrator service, bridge, controller and coordinator, with the transport
 * stubbed and a stand-in for the conductor graph (see `standInConductor`).
 *
 * Every assertion about "how many times" is a count of agents started.
 */

let database: TestDatabase;
let transport: RecordingTransport;

beforeEach(() => {
  database = openTestDatabase();
  transport = recordingTransport();
});

afterEach(() => {
  database.close();
});

const MINUTE = 60_000;
const sessionOf = async (planId: string, taskCode: string) =>
  (await taskByCode(database.db, planId, taskCode)).assignedSessionId!;
/** A session row that went terminal a while ago — what a restart finds. */
const longAgo = () => new Date(Date.now() - 10 * MINUTE);

describe('one driver', () => {
  it('leaves advancement to the driver for a plan the driver owns', async () => {
    // autoAdvance is ON. It used to be what decided this; it no longer applies
    // to a plan a driver owns.
    const config = executionConfig({ autoAdvance: true });
    const planId = await seedPlan(database.db, [['1.1'], ['2.1']]);
    const service = startService(transport);

    // A driver that owns the plan and, when notified, does nothing at all.
    const notified: number[] = [];
    const idle: WaveDriver = {
      owns: async () => true,
      notify: async (_id, waveIndex) => {
        notified.push(waveIndex);
        return { resumed: false, reason: 'idle test driver' };
      },
    };
    const bridge = new ExecutionBridge(service, { execution: config, driver: idle });
    bridge.start();

    await newController(config).dispatchWave(planId, 0);
    await bridge.drain();
    service.ingestCompletionReport(completionReport(await sessionOf(planId, '1.1'), { success: true }));
    await bridge.drain();

    // The bridge recorded the task and the wave, and told the driver…
    expect(await statuses(database.db, planId)).toEqual({ '1.1': 'completed', '2.1': 'pending' });
    expect((await waveRows(database.db, planId))[0].status).toBe('completed');
    expect(notified).toEqual([0]);
    expect(await eventsOfType(database.db, 'WAVE_TASK_COMPLETE')).toHaveLength(1);

    // …and did not start wave 2 itself, move the pointer, or finish the plan.
    expect(transport.taskCodes()).toEqual(['1.1']);
    const plan = await planRow(database.db, planId);
    expect(plan.currentWaveIndex).toBe(0);
    expect(plan.status).toBe('executing');
    bridge.stop();
  });

  it('still advances a plan no driver owns, once, and completes it', async () => {
    const config = executionConfig({ autoAdvance: true });
    const planId = await seedPlan(database.db, [['1.1', '1.2'], ['2.1']]);
    const service = startService(transport);

    // A driver is registered but does not own this plan: the legacy path.
    const elsewhere: WaveDriver = {
      owns: async () => false,
      notify: async () => {
        throw new Error('notified about a plan it does not own');
      },
    };
    const bridge = new ExecutionBridge(service, { execution: config, driver: elsewhere });
    bridge.start();

    await newController(config).dispatchWave(planId, 0);
    await bridge.drain();

    // Both wave-1 tasks finish together: two handlers, one advance.
    service.ingestCompletionReport(completionReport(await sessionOf(planId, '1.1'), { success: true }));
    service.ingestCompletionReport(completionReport(await sessionOf(planId, '1.2'), { success: true }));
    await bridge.drain();

    expect(transport.startedFor('2.1')).toBe(1);
    expect((await planRow(database.db, planId)).currentWaveIndex).toBe(1);

    service.ingestCompletionReport(completionReport(await sessionOf(planId, '2.1'), { success: true }));
    await bridge.drain();

    const plan = await planRow(database.db, planId);
    expect(plan.status).toBe('completed');
    expect(plan.completedAt).not.toBeNull();

    // `collectFinalMetrics` had no caller; completing a plan now records them.
    const metrics = await database.db.select().from(wavePlanMetrics);
    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({ wavePlanId: planId, tasksCompleted: 3, tasksFailed: 0, wavesExecuted: 2 });
    bridge.stop();
  });

  it('does not advance a legacy plan when autoAdvance is off', async () => {
    const config = executionConfig({ autoAdvance: false });
    const planId = await seedPlan(database.db, [['1.1'], ['2.1']]);
    const service = startService(transport);
    const bridge = new ExecutionBridge(service, { execution: config });
    bridge.start();

    await newController(config).dispatchWave(planId, 0);
    await bridge.drain();
    service.ingestCompletionReport(completionReport(await sessionOf(planId, '1.1'), { success: true }));
    await bridge.drain();

    expect(transport.taskCodes()).toEqual(['1.1']);
    expect((await planRow(database.db, planId)).status).toBe('executing');
    bridge.stop();
  });

  it('drains a wave larger than the cap through the driver, each task once', async () => {
    const config = executionConfig({ maxConcurrentSubagents: 2 });
    const planId = await seedPlan(database.db, [['1.1', '1.2', '1.3', '1.4', '1.5'], ['2.1']]);
    const service = startService(transport);
    const conductor = standInConductor(planId, 2, newController(config), config);
    const bridge = new ExecutionBridge(service, { execution: config, driver: conductor.driver });
    bridge.start();

    await conductor.start();
    await bridge.drain();
    expect(transport.created).toHaveLength(2);

    // Finish whatever is running, two at a time, until the run ends. The two
    // completions land together, so two notifications race for one backfill.
    for (let round = 0; round < 10 && conductor.run.status === 'executing'; round++) {
      const running = Object.entries(await statuses(database.db, planId))
        .filter(([, status]) => status === 'running')
        .map(([code]) => code);
      for (const code of running) {
        service.ingestCompletionReport(completionReport(await sessionOf(planId, code), { success: true }));
      }
      await bridge.drain();
    }

    expect(conductor.run.status).toBe('complete');
    expect(transport.taskCodes().sort()).toEqual(['1.1', '1.2', '1.3', '1.4', '1.5', '2.1']);
    expect((await planRow(database.db, planId)).status).toBe('completed');
    // Every dispatch for the plan went through the driver.
    expect(conductor.run.driven.filter((w) => w === 1)).toEqual([1]);
    bridge.stop();
  });
});

describe('a paused plan', () => {
  it('dispatches nothing, and resumes into the wave its driver is waiting on', async () => {
    const config = executionConfig();
    const planId = await seedPlan(database.db, [['1.1'], ['2.1']]);
    const service = startService(transport);
    const controller = newController(config);
    const conductor = standInConductor(planId, 2, controller, config);
    const bridge = new ExecutionBridge(service, { execution: config, driver: conductor.driver });
    bridge.start();

    await conductor.start();
    await bridge.drain();

    // Paused while wave 1's only task is still running.
    await controller.pause(planId);
    service.ingestCompletionReport(completionReport(await sessionOf(planId, '1.1'), { success: true }));
    await bridge.drain();

    // The driver moved on to wave 2 and is waiting there; nothing was started.
    expect(conductor.run.waitingOn).toBe(1);
    expect(transport.taskCodes()).toEqual(['1.1']);
    expect(await statuses(database.db, planId)).toEqual({ '1.1': 'completed', '2.1': 'pending' });

    // The pointer followed it, so resume dispatches wave 2 — not the finished
    // wave 1, which is "already complete, nothing to do".
    expect((await planRow(database.db, planId)).currentWaveIndex).toBe(1);
    await controller.resume(planId);
    await bridge.drain();

    expect(transport.taskCodes()).toEqual(['1.1', '2.1']);

    service.ingestCompletionReport(completionReport(await sessionOf(planId, '2.1'), { success: true }));
    await bridge.drain();
    expect(conductor.run.status).toBe('complete');
    expect((await planRow(database.db, planId)).status).toBe('completed');
    bridge.stop();
  });
});

describe('a task that fails its retry ends the run', () => {
  it('fails the plan with a reason, skips what had not started, and stops waiting', async () => {
    const config = executionConfig();
    const planId = await seedPlan(database.db, [['1.1', '1.2'], ['2.1']]);
    const service = startService(transport);
    const conductor = standInConductor(planId, 2, newController(config), config);
    const bridge = new ExecutionBridge(service, { execution: config, driver: conductor.driver });
    bridge.start();

    await conductor.start();
    await bridge.drain();
    expect(await statuses(database.db, planId)).toEqual({
      '1.1': 'running',
      '1.2': 'running',
      '2.1': 'pending',
    });

    // First failure: one retry, dispatched by the driver's backfill pass.
    service.ingestCompletionReport(
      completionReport(await sessionOf(planId, '1.1'), { success: false, error: 'tests failed' })
    );
    await bridge.drain();

    const retried = await taskByCode(database.db, planId, '1.1');
    expect(retried.status).toBe('running');
    expect(retried.retryCount).toBe(1);
    expect(transport.startedFor('1.1')).toBe(2);
    expect((await planRow(database.db, planId)).status).toBe('executing');

    // Second failure: no retry left.
    service.ingestCompletionReport(
      completionReport(await sessionOf(planId, '1.1'), { success: false, error: 'tests failed again' })
    );
    await bridge.drain();

    const plan = await planRow(database.db, planId);
    expect(plan.status).toBe('failed');
    expect(plan.failureReason).toBe('Task 1.1 failed after 1 retry: tests failed again');
    expect(plan.completedAt).not.toBeNull();

    // The sibling is still running — not killed — and everything not yet
    // started is skipped, in every wave.
    expect(await statuses(database.db, planId)).toEqual({
      '1.1': 'failed',
      '1.2': 'running',
      '2.1': 'skipped',
    });

    // The run reached a terminal state instead of waiting on the wave.
    expect(conductor.run.status).toBe('failed');
    expect(conductor.run.waitingOn).toBeNull();
    expect(conductor.run.failures).toEqual({
      state: 'failed',
      failures: [{ taskCode: '1.1', error: 'tests failed again' }],
    });

    // What the conductor route reports from, and so what the watcher reads.
    expect(await waveSignalFor(planId, 0, config)).toEqual({
      kind: 'over',
      outcome: { state: 'failed', failures: [{ taskCode: '1.1', error: 'tests failed again' }] },
    });

    // Loud: the failure is in the feed, with the task and the count of skips.
    const failedEvents = await eventsOfType(database.db, 'WAVE_PLAN_FAILED');
    expect(failedEvents).toHaveLength(1);
    expect(failedEvents[0].message).toBe(
      'Wave plan failed: Task 1.1 failed after 1 retry: tests failed again (1 task(s) not started were skipped)'
    );
    expect((await eventsOfType(database.db, 'WAVE_TASK_FAILED')).map((e) => e.message)).toEqual([
      'Task 1.1 failed (attempt 1), will retry: tests failed',
      'Task 1.1 failed: tests failed again',
    ]);

    // Nothing new was dispatched: 1.1 twice, 1.2 once.
    expect(transport.created).toHaveLength(3);

    // The sibling finishes later. It is recorded; nothing else moves.
    service.ingestCompletionReport(completionReport(await sessionOf(planId, '1.2'), { success: true }));
    await bridge.drain();

    expect(await statuses(database.db, planId)).toEqual({
      '1.1': 'failed',
      '1.2': 'completed',
      '2.1': 'skipped',
    });
    const [failedWave, skippedWave] = await waveRows(database.db, planId);
    expect(failedWave.status).toBe('failed');
    expect(failedWave.completedAt).not.toBeNull();
    expect(skippedWave.status).toBe('skipped');
    expect((await planRow(database.db, planId)).status).toBe('failed');
    expect(transport.created).toHaveLength(3);
    bridge.stop();
  });

  it('spends one retry when the same failure is reported twice', async () => {
    const config = executionConfig();
    const planId = await seedPlan(database.db, [['1.1']]);
    const service = startService(transport);
    const controller = newController(config);
    const bridge = new ExecutionBridge(service, { execution: executionConfig({ autoAdvance: false }) });
    bridge.start();

    await controller.dispatchWave(planId, 0);
    await bridge.drain();
    const sessionId = await sessionOf(planId, '1.1');

    expect(await controller.onTaskFailed(planId, '1.1', 'boom', { sessionId })).toBe('retrying');
    expect(await controller.onTaskFailed(planId, '1.1', 'boom', { sessionId })).toBe('ignored');

    const task = await taskByCode(database.db, planId, '1.1');
    expect(task.retryCount).toBe(1);
    expect((await planRow(database.db, planId)).status).toBe('executing');
    bridge.stop();
  });
});

describe('a cockpit restart', () => {
  it('completes the task and dispatches the next wave exactly once', async () => {
    const config = executionConfig();
    const planId = await seedPlan(database.db, [['1.1'], ['2.1']]);

    // --- Before the restart: dispatch wave 1. ------------------------------
    const before = startService(transport);
    const firstRun = standInConductor(planId, 2, newController(config), config);
    const firstBridge = new ExecutionBridge(before, { execution: config, driver: firstRun.driver });
    firstBridge.start();
    await firstRun.start();
    await firstBridge.drain();

    const sessionId = await sessionOf(planId, '1.1');
    expect(before.getActiveSessions().map((s) => s.sessionId)).toEqual([sessionId]);

    // --- The restart: everything in memory is gone. ------------------------
    firstBridge.stop();
    const after = startService(transport); // shuts the old service down
    expect(after.getActiveSessions()).toEqual([]);

    // The run comes back from its checkpoint, suspended on wave 1.
    const resumed = standInConductor(planId, 2, newController(config), config, 0);
    const bridge = new ExecutionBridge(after, { execution: config, driver: resumed.driver });
    bridge.start();

    // --- The agent, which never noticed, reports. --------------------------
    // The service has no mapping for this session. That used to make it
    // swallow the report, and the task stayed `running` forever.
    after.ingestCompletionReport(completionReport(sessionId, { success: true, summary: 'wrote it' }));
    await bridge.drain();

    const done = await taskByCode(database.db, planId, '1.1');
    expect(done.status).toBe('completed');
    expect(done.completionSummary).toBe('wrote it');

    expect(resumed.run.driven).toEqual([1]);
    expect(transport.startedFor('2.1')).toBe(1);
    expect((await taskByCode(database.db, planId, '2.1')).status).toBe('running');

    // A retried callback delivers the same report again. Nothing moves.
    after.ingestCompletionReport(completionReport(sessionId, { success: true, summary: 'wrote it' }));
    await bridge.drain();

    expect(transport.startedFor('2.1')).toBe(1);
    expect(await eventsOfType(database.db, 'WAVE_TASK_COMPLETE')).toHaveLength(1);
    bridge.stop();
  });
});

describe('the reconciler', () => {
  /** Dispatch a two-wave plan under a driver, and return the pieces. */
  async function running(shape: string[][] = [['1.1'], ['2.1']]) {
    const config = executionConfig();
    const planId = await seedPlan(database.db, shape);
    const service = startService(transport);
    const conductor = standInConductor(planId, shape.length, newController(config), config);
    const bridge = new ExecutionBridge(service, { execution: config, driver: conductor.driver });
    bridge.start();
    await conductor.start();
    await bridge.drain();
    return { config, planId, service, conductor, bridge };
  }

  it('applies a completion the task never heard about, from the session row', async () => {
    const { planId, conductor, bridge } = await running();

    // The callback route wrote the session row; the process died before the
    // wave task was told. This is the state found in a real database.
    await markSession(database.db, await sessionOf(planId, '1.1'), {
      status: 'COMPLETE',
      telemetry: { lastText: 'Added the retry and a test for it.' },
      updatedAt: longAgo(),
    });

    const report = await bridge.reconcile();

    expect(report).toMatchObject({ examined: 1, completed: 1, failed: 0, lost: 0, errors: [] });
    const task = await taskByCode(database.db, planId, '1.1');
    expect(task.status).toBe('completed');
    expect(task.completionSummary).toBe('Added the retry and a test for it.');

    // The run was resumed, and the next wave dispatched once.
    expect(conductor.run.driven).toEqual([0, 1]);
    expect(transport.startedFor('2.1')).toBe(1);

    // A second pass finds nothing to do.
    await bridge.drain();
    const again = await bridge.reconcile();
    expect(again).toMatchObject({ completed: 0, failed: 0, lost: 0 });
    expect(transport.startedFor('2.1')).toBe(1);
    bridge.stop();
  });

  /**
   * Found by computing the Conductor Score over a real database: six tasks
   * whose sessions had finished in August were recorded as complete on the day
   * the cockpit was next started, so each read as forty-one days of work and
   * the fleet as having done 5,900 agent-hours.
   */
  it('records the task as finished when its session finished, not when it was noticed', async () => {
    const { planId, bridge } = await running();
    const ended = new Date(Date.now() - 41 * 24 * 60 * MINUTE);
    await markSession(database.db, await sessionOf(planId, '1.1'), { status: 'COMPLETE', updatedAt: ended });

    await bridge.reconcile();

    const task = await taskByCode(database.db, planId, '1.1');
    expect(task.status).toBe('completed');
    // Stored to the second.
    expect(Math.abs(task.completedAt!.getTime() - ended.getTime())).toBeLessThan(1_000);
    bridge.stop();
  });

  it('does the same for a session that ended in error', async () => {
    const { planId, bridge } = await running();
    const ended = new Date(Date.now() - 3 * 24 * 60 * MINUTE);
    const first = await sessionOf(planId, '1.1');
    await markSession(database.db, first, { status: 'ERROR', updatedAt: ended });
    await bridge.reconcile();
    await bridge.drain();

    // The first failure is a retry; fail the retry too so the task is terminal.
    const second = await sessionOf(planId, '1.1');
    expect(second).not.toBe(first);
    await markSession(database.db, second, { status: 'ERROR', updatedAt: ended });
    await bridge.reconcile();

    const task = await taskByCode(database.db, planId, '1.1');
    expect(task.status).toBe('failed');
    expect(Math.abs(task.completedAt!.getTime() - ended.getTime())).toBeLessThan(1_000);
    bridge.stop();
  });

  it('runs once when the bridge starts', async () => {
    const config = executionConfig();
    const planId = await seedPlan(database.db, [['1.1'], ['2.1']]);
    const service = startService(transport);
    await newController(config).dispatchWave(planId, 0);
    await markSession(database.db, await sessionOf(planId, '1.1'), {
      status: 'COMPLETE',
      updatedAt: longAgo(),
    });

    // A fresh process: the run is suspended on wave 1, the task is stranded.
    const conductor = standInConductor(planId, 2, newController(config), config, 0);
    const bridge = new ExecutionBridge(service, {
      execution: config,
      driver: conductor.driver,
      reconcile: { intervalMs: 60 * MINUTE },
    });
    bridge.start();
    await bridge.drain();

    expect((await taskByCode(database.db, planId, '1.1')).status).toBe('completed');
    expect(transport.startedFor('2.1')).toBe(1);
    bridge.stop();
  });

  it('is safe alongside the live callback: one completion, one dispatch', async () => {
    const { planId, service, bridge } = await running();
    const sessionId = await sessionOf(planId, '1.1');
    await markSession(database.db, sessionId, { status: 'COMPLETE', updatedAt: longAgo() });

    // The callback (a retry, say) and a reconciler pass arrive in the same instant.
    service.ingestCompletionReport(completionReport(sessionId, { success: true }));
    const pass = bridge.reconcile();
    const overlapping = bridge.reconcile();
    await Promise.all([pass, overlapping]);
    await bridge.drain();

    expect(await eventsOfType(database.db, 'WAVE_TASK_COMPLETE')).toHaveLength(1);
    expect(transport.startedFor('2.1')).toBe(1);
    bridge.stop();
  });

  it('marks a silent session lost, retries once, and fails the plan the second time', async () => {
    const { planId, conductor, bridge } = await running();
    const later = (minutes: number) => new Date(Date.now() + minutes * MINUTE);

    // Within the stall window nothing happens, however the pass is timed.
    expect(await bridge.reconcile(later(29))).toMatchObject({ lost: 0 });
    expect((await taskByCode(database.db, planId, '1.1')).status).toBe('running');

    // Past it, the task is lost — and the ordinary retry rule applies.
    const firstSession = await sessionOf(planId, '1.1');
    const first = await bridge.reconcile(later(31));
    expect(first).toMatchObject({ lost: 1 });

    const retried = await taskByCode(database.db, planId, '1.1');
    expect(retried.retryCount).toBe(1);
    expect(retried.errorMessage).toMatch(/^lost: no report since \d{4}-\d{2}-\d{2}T/);
    expect(retried.status).toBe('running'); // re-dispatched by the driver
    expect(retried.assignedSessionId).not.toBe(firstSession);
    expect(transport.startedFor('1.1')).toBe(2);

    // The second attempt goes silent too.
    await bridge.drain();
    const second = await bridge.reconcile(later(62));
    expect(second).toMatchObject({ lost: 1 });

    const plan = await planRow(database.db, planId);
    expect(plan.status).toBe('failed');
    expect(plan.failureReason).toMatch(/^Task 1\.1 failed after 1 retry: lost: no report since /);
    expect(await statuses(database.db, planId)).toEqual({ '1.1': 'failed', '2.1': 'skipped' });
    expect(conductor.run.status).toBe('failed');
    expect(transport.startedFor('1.1')).toBe(2);
    bridge.stop();
  });

  it('does not count time the cockpit was down against the agent', async () => {
    const { planId, bridge } = await running();

    // The session last reported two hours ago — because the cockpit was not
    // there to hear it. This bridge has only just started listening.
    await markSession(database.db, await sessionOf(planId, '1.1'), {
      updatedAt: new Date(Date.now() - 120 * MINUTE),
    });

    expect(await bridge.reconcile()).toMatchObject({ examined: 1, lost: 0 });
    expect((await taskByCode(database.db, planId, '1.1')).status).toBe('running');
    bridge.stop();
  });

  it('leaves alone sessions whose silence means nothing', async () => {
    const { planId, bridge } = await running([['1.1', '1.2'], ['2.1']]);
    const longAfter = new Date(Date.now() + 600 * MINUTE);

    // Waiting on a person, and a poll-based mode that only writes on change.
    await markSession(database.db, await sessionOf(planId, '1.1'), { status: 'NEEDS_SPEC' });
    await markSession(database.db, await sessionOf(planId, '1.2'), { orchestratorMode: 'http' });

    expect(await bridge.reconcile(longAfter)).toMatchObject({ examined: 2, lost: 0, failed: 0 });
    expect(await statuses(database.db, planId)).toMatchObject({ '1.1': 'running', '1.2': 'running' });
    bridge.stop();
  });

  it('leaves a session that has only just ended to its callback', async () => {
    const { planId, service, bridge } = await running();
    const sessionId = await sessionOf(planId, '1.1');

    // The callback route has written the session row and is still on its way
    // to forwarding the report — the only thing that carries the summary.
    await markSession(database.db, sessionId, {
      status: 'COMPLETE',
      telemetry: { lastText: 'not the summary' },
      updatedAt: new Date(),
    });
    expect(await bridge.reconcile()).toMatchObject({ examined: 1, completed: 0 });
    expect((await taskByCode(database.db, planId, '1.1')).status).toBe('running');

    service.ingestCompletionReport(completionReport(sessionId, { success: true, summary: 'the summary' }));
    await bridge.drain();
    expect((await taskByCode(database.db, planId, '1.1')).completionSummary).toBe('the summary');
    bridge.stop();
  });

  it('applies a session that ended in error as a failure', async () => {
    const { planId, bridge } = await running();
    await markSession(database.db, await sessionOf(planId, '1.1'), {
      status: 'ERROR',
      updatedAt: longAgo(),
    });

    expect(await bridge.reconcile()).toMatchObject({ failed: 1 });

    const task = await taskByCode(database.db, planId, '1.1');
    expect(task.retryCount).toBe(1);
    expect(task.errorMessage).toMatch(/^session ended in ERROR/);
    expect(transport.startedFor('1.1')).toBe(2);
    bridge.stop();
  });

  it('does not touch the tasks of a plan that has already ended', async () => {
    const { config, planId, bridge } = await running();
    await newController(config).failPlan(planId, 'stopped by a test');
    await markSession(database.db, await sessionOf(planId, '1.1'), {
      status: 'COMPLETE',
      updatedAt: longAgo(),
    });

    expect(await bridge.reconcile()).toMatchObject({ examined: 0 });
    expect((await taskByCode(database.db, planId, '1.1')).status).toBe('running');
    bridge.stop();
  });

  it('starts a wave whose dispatch queued everything', async () => {
    const config = executionConfig();
    const planId = await seedPlan(database.db, [['1.1']]);
    const service = startService(transport);
    const conductor = standInConductor(planId, 1, newController(config), config);
    const bridge = new ExecutionBridge(service, { execution: config, driver: conductor.driver });
    bridge.start();

    // The runner is full: nothing is dispatched, so nothing will ever report.
    transport.respond = () => ({ accepted: false, error: 'CAPACITY' });
    await conductor.start();
    await bridge.drain();
    expect(await statuses(database.db, planId)).toEqual({ '1.1': 'pending' });

    // It frees up. Only the reconciler's check-in can notice.
    transport.respond = () => ({ accepted: true, externalSessionId: 'ext_ok' });
    await bridge.reconcile();
    await bridge.drain();

    expect(await statuses(database.db, planId)).toEqual({ '1.1': 'running' });
    bridge.stop();
  });
});

describe('a plan left executing is not woken by a restart once it is old', () => {
  const HOUR = 60 * MINUTE;

  /**
   * What an older process left behind: a two-wave plan, `executing`, with 1.1
   * sent to an agent and 1.2 still queued behind the cap — so that a resume
   * has something it would dispatch. Everything is then dated `age` ago: the
   * plan row, its tasks, and the session.
   */
  async function leftExecuting(age: number) {
    const planId = await seedPlan(database.db, [['1.1', '1.2'], ['2.1']]);
    startService(transport);
    await newController(executionConfig({ maxConcurrentSubagents: 1 })).dispatchWave(planId, 0);
    expect(await statuses(database.db, planId)).toEqual({
      '1.1': 'dispatched',
      '1.2': 'pending',
      '2.1': 'pending',
    });

    // A whole second: that is the precision the timestamp columns keep.
    const then = new Date(Math.floor((Date.now() - age) / 1000) * 1000);
    await database.db.update(wavePlans).set({ updatedAt: then, startedAt: then }).where(eq(wavePlans.id, planId));
    await database.db
      .update(waveTasks)
      .set({ startedAt: then, lastAttemptAt: then })
      .where(eq(waveTasks.taskCode, '1.1'));
    await database.db
      .update(rufloSessions)
      .set({ updatedAt: then })
      .where(eq(rufloSessions.id, await sessionOf(planId, '1.1')));
    return { planId, then };
  }

  /** A new process: nothing in memory, the run back from its checkpoint on wave 1. */
  function restart(planId: string, resumeMaxAgeMs?: number) {
    const config = executionConfig();
    const service = startService(transport);
    const conductor = standInConductor(planId, 2, newController(config), config, 0);
    const bridge = new ExecutionBridge(service, {
      execution: config,
      driver: conductor.driver,
      reconcile: { intervalMs: 60 * MINUTE, ...(resumeMaxAgeMs === undefined ? {} : { resumeMaxAgeMs }) },
    });
    return { config, service, conductor, bridge };
  }

  it('pauses a stale plan with the reason, and starts no agent for it', async () => {
    const { planId, then } = await leftExecuting(21 * 24 * HOUR);
    const startedBefore = transport.created.length;

    const { conductor, bridge } = restart(planId);
    bridge.start();
    await bridge.drain();

    const plan = await planRow(database.db, planId);
    expect(plan.status).toBe('paused');
    expect(plan.failureReason).toBe(
      `not resumed after a restart: no activity since ${then.toISOString()}. ` +
        'Resume it from the cockpit to continue.'
    );

    // Zero transport calls: the queued task was not sent, and nothing else was.
    expect(transport.created).toHaveLength(startedBefore);
    // The run was not resumed — its driver was never even asked.
    expect(conductor.run.notified).toEqual([]);
    expect(conductor.run.driven).toEqual([]);

    // The plan is otherwise as it was found, its age included.
    expect(await statuses(database.db, planId)).toEqual({
      '1.1': 'dispatched',
      '1.2': 'pending',
      '2.1': 'pending',
    });
    expect(plan.currentWaveIndex).toBe(0);
    expect(plan.updatedAt).toEqual(then);
    expect(plan.completedAt).toBeNull();

    // It is said out loud, too.
    const feed = await eventsOfType(database.db, 'RUNWAY_UPDATE');
    expect(feed.map((e) => e.message)).toEqual([`Wave plan paused — ${plan.failureReason}`]);
    bridge.stop();
  });

  it('stays held: later passes neither dispatch for it nor declare its agent lost', async () => {
    const { planId } = await leftExecuting(21 * 24 * HOUR);
    const startedBefore = transport.created.length;

    const { bridge } = restart(planId);
    bridge.start();
    await bridge.drain();

    // The stall window passes. For an executing plan this is where the silent
    // task would be lost, retried, and a second agent started.
    const report = await bridge.reconcile(new Date(Date.now() + 45 * MINUTE));
    await bridge.drain();

    expect(report).toMatchObject({ examined: 1, lost: 0, failed: 0, held: 0 });
    expect(transport.created).toHaveLength(startedBefore);
    expect((await taskByCode(database.db, planId, '1.1')).status).toBe('dispatched');
    expect((await planRow(database.db, planId)).status).toBe('paused');
    bridge.stop();
  });

  it('resumes a fresh plan as it always did', async () => {
    const { planId } = await leftExecuting(1 * HOUR);

    const { conductor, bridge } = restart(planId);
    bridge.start();
    await bridge.drain();

    // The check-in found a free slot and a queued task, and dispatched it.
    expect((await planRow(database.db, planId)).status).toBe('executing');
    expect((await planRow(database.db, planId)).failureReason).toBeNull();
    expect(conductor.run.driven).toEqual([0]);
    expect(transport.startedFor('1.2')).toBe(1);
    bridge.stop();
  });

  it('still records a session of a stale plan that had already finished', async () => {
    const { planId, then } = await leftExecuting(21 * 24 * HOUR);
    const startedBefore = transport.created.length;
    await markSession(database.db, await sessionOf(planId, '1.1'), {
      status: 'COMPLETE',
      telemetry: { lastText: 'Finished three weeks ago.' },
      updatedAt: then,
    });

    const { conductor, bridge } = restart(planId);
    bridge.start();
    const report = await bridge.reconcile(new Date(), { startup: true });
    await bridge.drain();

    // Bookkeeping: what happened is written down.
    expect(report).toMatchObject({ held: 1, examined: 1, completed: 1, settled: 0, errors: [] });
    const task = await taskByCode(database.db, planId, '1.1');
    expect(task.status).toBe('completed');
    expect(task.completionSummary).toBe('Finished three weeks ago.');

    // Not dispatch: the slot that completion freed is not used, the driver is
    // not told, and the plan is held with the age it had BEFORE the completion
    // was applied — applying it must not make the plan look busy.
    expect((await planRow(database.db, planId)).status).toBe('paused');
    expect((await planRow(database.db, planId)).failureReason).toContain(then.toISOString());
    expect(transport.created).toHaveLength(startedBefore);
    expect(conductor.run.notified).toEqual([]);
    expect(await statuses(database.db, planId)).toMatchObject({ '1.2': 'pending', '2.1': 'pending' });
    bridge.stop();
  });

  it('counts a session that reported recently as activity, whatever the plan row says', async () => {
    const { planId } = await leftExecuting(21 * 24 * HOUR);
    // A long task: the plan row has not moved for weeks of nominal time, but
    // its runner heartbeat an hour ago.
    await markSession(database.db, await sessionOf(planId, '1.1'), {
      updatedAt: new Date(Date.now() - 1 * HOUR),
    });

    const { bridge } = restart(planId);
    bridge.start();
    await bridge.drain();

    expect((await planRow(database.db, planId)).status).toBe('executing');
    expect(transport.startedFor('1.2')).toBe(1);
    bridge.stop();
  });

  it('is turned off by a window of zero', async () => {
    const { planId } = await leftExecuting(21 * 24 * HOUR);

    const { bridge } = restart(planId, 0);
    bridge.start();
    await bridge.drain();

    expect((await planRow(database.db, planId)).status).toBe('executing');
    expect(transport.startedFor('1.2')).toBe(1);
    bridge.stop();
  });

  it('applies only to the pass at start', async () => {
    const { planId } = await leftExecuting(21 * 24 * HOUR);

    // No start-up pass: this bridge was not asked to reconcile on start.
    const config = executionConfig();
    const service = startService(transport);
    const conductor = standInConductor(planId, 2, newController(config), config, 0);
    const bridge = new ExecutionBridge(service, { execution: config, driver: conductor.driver });
    bridge.start();

    expect(await bridge.reconcile()).toMatchObject({ held: 0 });
    await bridge.drain();
    expect((await planRow(database.db, planId)).status).toBe('executing');
    bridge.stop();
  });

  it('is undone by resuming the plan, which clears the reason and dispatches', async () => {
    const { planId } = await leftExecuting(21 * 24 * HOUR);

    const { config, bridge } = restart(planId);
    bridge.start();
    await bridge.drain();
    expect((await planRow(database.db, planId)).status).toBe('paused');

    // The person's action: the cockpit's resume.
    await newController(config).resume(planId);
    await bridge.drain();

    const plan = await planRow(database.db, planId);
    expect(plan.status).toBe('executing');
    expect(plan.failureReason).toBeNull();
    expect(transport.startedFor('1.2')).toBe(1);
    bridge.stop();
  });
});

describe('a paused plan’s silent task', () => {
  it('is not declared lost until the plan is resumed', async () => {
    const config = executionConfig();
    const planId = await seedPlan(database.db, [['1.1'], ['2.1']]);
    const service = startService(transport);
    const controller = newController(config);
    const conductor = standInConductor(planId, 2, controller, config);
    const bridge = new ExecutionBridge(service, { execution: config, driver: conductor.driver });
    bridge.start();
    await conductor.start();
    await bridge.drain();
    const later = (minutes: number) => new Date(Date.now() + minutes * MINUTE);

    await controller.pause(planId);
    expect(await bridge.reconcile(later(45))).toMatchObject({ examined: 1, lost: 0 });
    expect((await taskByCode(database.db, planId, '1.1')).status).toBe('running');
    expect(transport.startedFor('1.1')).toBe(1);

    // Resumed, the same silence is judged the ordinary way.
    await controller.resume(planId);
    expect(await bridge.reconcile(later(45))).toMatchObject({ lost: 1 });
    await bridge.drain();
    expect(transport.startedFor('1.1')).toBe(2);
    bridge.stop();
  });
});
