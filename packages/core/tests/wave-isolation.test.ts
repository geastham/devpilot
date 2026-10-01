import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { waveTasks } from '../src/db/schema';
import { ExecutionBridge, type WaveDriver } from '../src/wave-planner/execution/execution-bridge';
import { runIdFor } from '../src/wave-planner/execution/dispatch-coordinator';
import { waveSignalFor } from '../src/wave-planner/execution/wave-state';
import {
  completionReport,
  eventsOfType,
  executionConfig,
  isolatedReport,
  isolatingTransport,
  markSession,
  newController,
  openTestDatabase,
  planRow,
  seedPlan,
  standInConductor,
  startService,
  statuses,
  taskByCode,
  waveRows,
  type IsolatingTransport,
  type TestDatabase,
} from './helpers/wave-harness';

/**
 * A branch per task and a merge per wave, from the dispatcher's side — against
 * a real SQLite file, the real orchestrator service, adapter, bridge,
 * controller and coordinator, with the transport standing in for a runner that
 * has the `isolation` capability and a stand-in for the conductor graph.
 *
 * What is pinned here is the order of things: that every task of an isolated
 * plan is sent as one, that a wave is merged once it is over and before
 * anything of the next wave is started, and what a conflict, a failed merge
 * and a restart each do. The runner's half — the worktrees and the git — is
 * `packages/cli/tests/e2e/session-runner-isolation.test.ts`.
 */

let database: TestDatabase;
let transport: IsolatingTransport;

beforeEach(() => {
  database = openTestDatabase();
  transport = isolatingTransport();
});

afterEach(() => {
  database.close();
});

const MINUTE = 60_000;
const longAgo = () => new Date(Date.now() - 10 * MINUTE);

const sessionOf = async (planId: string, taskCode: string) =>
  (await taskByCode(database.db, planId, taskCode)).assignedSessionId!;

/** Poll until something is true. The merge under test is deliberately held open. */
async function until(condition: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

/** A plan under the stand-in conductor, wave 1 dispatched. */
async function running(shape: Parameters<typeof seedPlan>[1] = [['1.1', '1.2'], ['2.1']]) {
  const config = executionConfig();
  const planId = await seedPlan(database.db, shape);
  const service = startService(transport);
  const conductor = standInConductor(planId, shape.length, newController(config), config);
  const bridge = new ExecutionBridge(service, { execution: config, driver: conductor.driver });
  bridge.start();
  await conductor.start();
  await bridge.drain();
  const runId = (await planRow(database.db, planId)).runId!;

  /** The runner's completion callback for a task, as the route forwards it. */
  const finish = async (taskCode: string, files: string[] = [`src/${taskCode}.ts`]) =>
    service.ingestCompletionReport(
      isolatedReport(await sessionOf(planId, taskCode), { runId, taskCode, created: files })
    );

  return { config, planId, service, conductor, bridge, runId, finish };
}

describe('a run is named, and decided, once', () => {
  it('names the run after the ticket and the plan, and sends every task as one of it', async () => {
    const { planId, runId, bridge, finish } = await running();

    expect(runId).toBe(`AVA-12-${planId.slice(-6)}`);

    const plan = await planRow(database.db, planId);
    expect(plan.isolated).toBe(true);
    expect(plan.isolationNote).toBeNull();

    // Wave 1, both tasks: each asks for its own branch in the same run, and
    // the title is the task's label.
    expect(transport.created.map((c) => c.isolation)).toEqual([
      { runId, taskCode: '1.1', title: 'Task 1.1' },
      { runId, taskCode: '1.2', title: 'Task 1.2' },
    ]);

    await finish('1.1');
    await finish('1.2');
    await bridge.drain();

    // Wave 2 is sent under the same run id — read from the plan, not made again.
    expect(transport.created[2].isolation).toEqual({ runId, taskCode: '2.1', title: 'Task 2.1' });
    expect((await planRow(database.db, planId)).runId).toBe(runId);
    bridge.stop();
  });

  it('gives two dispatchers arriving together one decision', async () => {
    const config = executionConfig();
    const planId = await seedPlan(database.db, [['1.1', '1.2', '1.3', '1.4']]);
    startService(transport);

    await Promise.all([
      newController(config).dispatchWave(planId, 0),
      newController(config).dispatchWave(planId, 0),
    ]);

    const runIds = new Set(transport.created.map((c) => c.isolation?.runId));
    expect(transport.created).toHaveLength(4);
    expect([...runIds]).toEqual([(await planRow(database.db, planId)).runId]);
  });

  it('builds a name git will accept from whatever the ticket is called', () => {
    expect(runIdFor('AVA-12', 'clz8k3x9qd')).toBe('AVA-12-k3x9qd');
    // No ticket: the item was not created from one.
    expect(runIdFor(null, 'clz8k3x9qd')).toBe('run-k3x9qd');
    expect(runIdFor('', 'clz8k3x9qd')).toBe('run-k3x9qd');
    // Characters a ref cannot hold, and the sequences git refuses.
    expect(runIdFor('team/AVA 12: fix~it', 'clz8k3x9qd')).toBe('team-AVA-12-fix-it-k3x9qd');
    expect(runIdFor('..hidden..', 'clz8k3x9qd')).toBe('hidden-k3x9qd');
    expect(runIdFor('///', 'clz8k3x9qd')).toBe('run-k3x9qd');
  });
});

describe('a runner that cannot isolate', () => {
  it('runs the plan as before, says so on the plan, and merges nothing', async () => {
    transport.capabilityList = []; // answered /v1/health, listed nothing
    const { planId, conductor, bridge, service } = await running();

    const plan = await planRow(database.db, planId);
    expect(plan.isolated).toBe(false);
    expect(plan.isolationNote).toMatch(/does not report the 'isolation' capability/);
    expect(plan.runId).toBe(`AVA-12-${planId.slice(-6)}`);

    // No task asked for a branch — not even as an empty field.
    expect(transport.created.every((c) => !('isolation' in c))).toBe(true);

    for (const code of ['1.1', '1.2']) {
      service.ingestCompletionReport(completionReport(await sessionOf(planId, code), { success: true }));
    }
    await bridge.drain();
    service.ingestCompletionReport(completionReport(await sessionOf(planId, '2.1'), { success: true }));
    await bridge.drain();

    expect(conductor.run.status).toBe('complete');
    expect(transport.created.every((c) => !('isolation' in c))).toBe(true);
    expect(transport.integrations).toEqual([]);

    const done = await planRow(database.db, planId);
    expect(done.status).toBe('completed');
    expect(done.runBranch).toBeNull();
    expect(done.runHeadSha).toBeNull();
    bridge.stop();
  });

  it('says a runner that did not answer did not answer', async () => {
    transport.capabilityList = null;
    const { planId, bridge } = await running([['1.1']]);

    const plan = await planRow(database.db, planId);
    expect(plan.isolated).toBe(false);
    expect(plan.isolationNote).toMatch(/did not answer \/v1\/health/);
    expect('isolation' in transport.created[0]).toBe(false);
    bridge.stop();
  });

  it('does not change its mind when the runner is upgraded mid-plan', async () => {
    transport.capabilityList = [];
    const { planId, bridge, service } = await running();

    transport.capabilityList = ['isolation'];
    for (const code of ['1.1', '1.2']) {
      service.ingestCompletionReport(completionReport(await sessionOf(planId, code), { success: true }));
    }
    await bridge.drain();

    // Wave 2 goes out the way wave 1 did. Half a plan on branches is worse
    // than none of it.
    expect(transport.startedFor('2.1')).toBe(1);
    expect('isolation' in transport.created[2]).toBe(false);
    expect(transport.integrations).toEqual([]);
    expect((await planRow(database.db, planId)).isolated).toBe(false);
    bridge.stop();
  });
});

describe('a plan that was already running when isolation arrived', () => {
  it('finishes un-isolated, with the reason, even on a runner that could isolate', async () => {
    // As an upgrade finds it: wave 1 ran in the shared checkout under the
    // previous version, and nothing was ever decided about the plan.
    const config = executionConfig();
    const planId = await seedPlan(database.db, [['1.1'], ['2.1']]);
    await database.db
      .update(waveTasks)
      .set({ status: 'completed', startedAt: longAgo(), completedAt: longAgo() })
      .where(eq(waveTasks.taskCode, '1.1'));
    expect((await planRow(database.db, planId)).isolated).toBeNull();

    startService(transport); // …which reports the capability
    await newController(config).driveWave(planId, 1);

    // Wave 2's worktree would have been cut from the last commit, without
    // wave 1's uncommitted work. It runs where wave 1 did instead.
    expect(transport.startedFor('2.1')).toBe(1);
    expect('isolation' in transport.created[0]).toBe(false);

    const plan = await planRow(database.db, planId);
    expect(plan.isolated).toBe(false);
    expect(plan.isolationNote).toMatch(/had already started, in the shared checkout/);
    expect(transport.integrations).toEqual([]);
  });
});

describe('what a task reports is written on the task', () => {
  it('records the branch, the base, the head and the files, and reads back the union', async () => {
    const { planId, runId, service, bridge } = await running();

    service.ingestCompletionReport(
      isolatedReport(await sessionOf(planId, '1.1'), {
        runId,
        taskCode: '1.1',
        created: ['src/new.ts'],
        modified: ['src/index.ts'],
        deleted: ['src/old.ts'],
      })
    );
    await bridge.drain();

    const task = await taskByCode(database.db, planId, '1.1');
    expect(task.status).toBe('completed');
    expect(task.branch).toBe(`devpilot/${runId}/task-1.1`);
    expect(task.baseSha).toBe('base_sha');
    expect(task.commitSha).toBe('commit_1.1');
    expect(task.filesChanged).toEqual(['src/index.ts', 'src/new.ts', 'src/old.ts']);
    // The wave is not over, so nothing has been merged.
    expect(task.mergedAt).toBeNull();
    expect(transport.integrations).toEqual([]);
    bridge.stop();
  });

  it('keeps "changed nothing" apart from "not recorded"', async () => {
    const { planId, runId, service, bridge } = await running();

    // 1.1 ran and changed no files. 1.2 has not reported.
    service.ingestCompletionReport(
      isolatedReport(await sessionOf(planId, '1.1'), { runId, taskCode: '1.1' })
    );
    await bridge.drain();

    expect((await taskByCode(database.db, planId, '1.1')).filesChanged).toEqual([]);
    expect((await taskByCode(database.db, planId, '1.2')).filesChanged).toBeNull();
    bridge.stop();
  });

  it('records where a failed attempt left its work', async () => {
    // Under a driver that does nothing, so the task can be read while it is
    // still waiting for its retry.
    const config = executionConfig();
    const planId = await seedPlan(database.db, [['1.1']]);
    const service = startService(transport);
    const idle: WaveDriver = {
      owns: async () => true,
      notify: async () => ({ resumed: false, reason: 'idle test driver' }),
    };
    const bridge = new ExecutionBridge(service, { execution: config, driver: idle });
    bridge.start();
    await newController(config).driveWave(planId, 0);
    await bridge.drain();
    const runId = (await planRow(database.db, planId)).runId!;

    service.ingestCompletionReport(
      isolatedReport(
        await sessionOf(planId, '1.1'),
        { runId, taskCode: '1.1', created: ['src/half.ts'] },
        { success: false, error: 'tests failed' }
      )
    );
    await bridge.drain();

    // The runner committed what the agent left; the row says where.
    const failed = await taskByCode(database.db, planId, '1.1');
    expect(failed.status).toBe('retrying');
    expect(failed.branch).toBe(`devpilot/${runId}/task-1.1`);
    expect(failed.commitSha).toBe('commit_1.1');
    expect(failed.filesChanged).toEqual(['src/half.ts']);
    bridge.stop();
  });

  it('forgets a failed attempt’s branch when the retry starts', async () => {
    const { planId, runId, service, bridge } = await running([['1.1']]);
    const firstSession = await sessionOf(planId, '1.1');

    // The driver re-dispatches as soon as the failure lands, so look at the
    // row in between by holding the runner's answer to the retry.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    transport.respond = async () => {
      await held;
      return { accepted: true, externalSessionId: 'ext_retry' };
    };

    service.ingestCompletionReport(
      isolatedReport(
        firstSession,
        { runId, taskCode: '1.1', created: ['src/half.ts'] },
        { success: false, error: 'tests failed' }
      )
    );
    await until(() => transport.startedFor('1.1') === 2, 'the retry to be sent');

    // Claimed for the retry: the first attempt's branch has been renamed by
    // the runner by now, so the row no longer names it.
    const claimed = await taskByCode(database.db, planId, '1.1');
    expect(claimed.status).toBe('dispatched');
    expect(claimed.branch).toBeNull();
    expect(claimed.commitSha).toBeNull();
    expect(claimed.filesChanged).toBeNull();

    release();
    await bridge.drain();
    bridge.stop();
  });

  it('leaves all four empty when a completion is applied from the session row', async () => {
    const { planId, runId, bridge } = await running([['1.1'], ['2.1']]);

    // The callback wrote the session row and the process died before the task
    // heard. The row carries no branch, base, head or file list.
    await markSession(database.db, await sessionOf(planId, '1.1'), {
      status: 'COMPLETE',
      telemetry: { lastText: 'did it' },
      updatedAt: longAgo(),
    });

    // Hold the merge so the row can be read as the reconciler left it.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    transport.merge = async (request) => {
      await held;
      return transport.mergeAll(request);
    };

    const pass = bridge.reconcile();
    await until(() => transport.integrations.length === 1, 'the merge to be asked for');

    const reconciled = await taskByCode(database.db, planId, '1.1');
    expect(reconciled.status).toBe('completed');
    expect(reconciled.branch).toBeNull();
    expect(reconciled.baseSha).toBeNull();
    expect(reconciled.commitSha).toBeNull();
    expect(reconciled.filesChanged).toBeNull();

    release();
    await pass;
    await bridge.drain();

    // The wave is still merged — the runner is asked by task code — and its
    // answer supplies the branch and the head. The base and the files stay
    // unrecorded: nothing that survived says what they were.
    const merged = await taskByCode(database.db, planId, '1.1');
    expect(merged.branch).toBe(`devpilot/${runId}/task-1.1`);
    expect(merged.commitSha).toBe('commit_1.1');
    expect(merged.baseSha).toBeNull();
    expect(merged.filesChanged).toBeNull();
    expect(merged.mergedAt).not.toBeNull();
    expect(transport.startedFor('2.1')).toBe(1);
    bridge.stop();
  });
});

describe('a wave is merged before the next one starts', () => {
  it('asks for one merge per wave, with that wave’s completed tasks in task-code order', async () => {
    const { planId, runId, conductor, bridge, finish } = await running([
      ['1.10', '1.2', '1.1'],
      ['2.1'],
    ]);

    // Completions arrive out of order, and two of them together.
    await finish('1.2');
    await bridge.drain();
    expect(transport.integrations).toEqual([]); // the wave is not over

    await finish('1.10');
    await finish('1.1');
    await bridge.drain();

    // One merge for the wave. `1.2` before `1.10`: task order, not string order.
    expect(transport.integrations).toEqual([
      { repo: 'acme/storefront', runId, taskCodes: ['1.1', '1.2', '1.10'] },
    ]);
    expect(transport.startedFor('2.1')).toBe(1);

    const plan = await planRow(database.db, planId);
    expect(plan.runBranch).toBe(`devpilot/${runId}/run`);
    expect(plan.runHeadSha).toBe('head_3');

    await finish('2.1');
    await bridge.drain();

    expect(transport.integrations.map((i) => i.taskCodes)).toEqual([['1.1', '1.2', '1.10'], ['2.1']]);
    expect(conductor.run.status).toBe('complete');

    const done = await planRow(database.db, planId);
    expect(done.status).toBe('completed');
    expect(done.runHeadSha).toBe('head_4');

    const rows = await database.db.select().from(waveTasks).where(eq(waveTasks.wavePlanId, planId));
    expect(rows.every((task) => task.mergedAt !== null)).toBe(true);
    bridge.stop();
  });

  it('does not start the next wave until the merge has returned', async () => {
    const { finish, bridge, planId } = await running();

    const order: string[] = [];
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    transport.merge = async (request) => {
      order.push('merge asked');
      await held;
      order.push('merge answered');
      return transport.mergeAll(request);
    };
    const accept = transport.respond;
    transport.respond = (params) => {
      order.push(`start ${String(params.metadata?.taskCode)}`);
      return accept(params);
    };

    await finish('1.1');
    await finish('1.2');
    await until(() => transport.integrations.length === 1, 'the merge to be asked for');

    // The merge is in flight and has been for a while. Every task of wave 1 is
    // `completed` — and wave 2 has not been touched.
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(transport.startedFor('2.1')).toBe(0);
    expect((await taskByCode(database.db, planId, '2.1')).status).toBe('pending');
    expect((await planRow(database.db, planId)).currentWaveIndex).toBe(0);
    // Asking the rows directly says so too: this wave is not "over".
    expect(await waveSignalFor(planId, 0, executionConfig())).toEqual({
      kind: 'merge',
      taskCodes: ['1.1', '1.2'],
    });

    release();
    await bridge.drain();

    expect(order).toEqual(['merge asked', 'merge answered', 'start 2.1']);
    bridge.stop();
  });

  it('merges nothing for a wave in which nothing completed', async () => {
    const { planId, conductor, service, bridge } = await running([['1.1'], ['2.1']]);

    for (const error of ['tests failed', 'tests failed again']) {
      service.ingestCompletionReport(
        completionReport(await sessionOf(planId, '1.1'), { success: false, error })
      );
      await bridge.drain();
    }

    // The wave is over, and failed, exactly as it was before isolation: there
    // is no completed work, so the runner is never asked.
    expect(conductor.run.status).toBe('failed');
    expect(transport.integrations).toEqual([]);
    const plan = await planRow(database.db, planId);
    expect(plan.failureReason).toBe('Task 1.1 failed after 1 retry: tests failed again');
    expect(plan.runBranch).toBeNull();
    bridge.stop();
  });

  it('merges before a plan no driver owns is advanced', async () => {
    // The legacy path: dispatched by hand, the bridge advances it.
    const config = executionConfig({ autoAdvance: true });
    const planId = await seedPlan(database.db, [['1.1'], ['2.1']]);
    const service = startService(transport);
    const bridge = new ExecutionBridge(service, { execution: config });
    bridge.start();
    await newController(config).dispatchWave(planId, 0);
    await bridge.drain();
    const runId = (await planRow(database.db, planId)).runId!;

    const order: string[] = [];
    transport.merge = (request) => {
      order.push('merge');
      return transport.mergeAll(request);
    };
    const accept = transport.respond;
    transport.respond = (params) => {
      order.push(`start ${String(params.metadata?.taskCode)}`);
      return accept(params);
    };

    service.ingestCompletionReport(
      isolatedReport(await sessionOf(planId, '1.1'), { runId, taskCode: '1.1', created: ['a.ts'] })
    );
    await bridge.drain();

    expect(order).toEqual(['merge', 'start 2.1']);
    expect(transport.created[1].isolation).toEqual({ runId, taskCode: '2.1', title: 'Task 2.1' });
    bridge.stop();
  });
});

describe('a task whose branch will not merge', () => {
  it('fails the task with the files, retries it, and merges the wave again', async () => {
    const { planId, runId, conductor, bridge, finish } = await running();

    // 1.2 collides with 1.1 the first time the wave is merged, and not after.
    let collided = false;
    transport.merge = (request) => {
      if (collided) return transport.mergeAll(request);
      collided = true;
      return transport.mergeAll(request, { '1.2': ['src/shared.ts'] });
    };

    await finish('1.1');
    await finish('1.2');
    await bridge.drain();

    // The conflict is that task's failure, by the ordinary rule: one retry.
    const retried = await taskByCode(database.db, planId, '1.2');
    expect(retried.retryCount).toBe(1);
    expect(retried.errorMessage).toBe('merge conflict with the run branch in: src/shared.ts');
    expect(retried.status).toBe('running'); // re-dispatched by the driver
    expect(transport.startedFor('1.2')).toBe(2);
    expect(transport.created.at(-1)?.isolation).toEqual({ runId, taskCode: '1.2', title: 'Task 1.2' });

    // The task that did merge is in, and stays in. The wave is open again and
    // nothing of wave 2 has started.
    expect((await taskByCode(database.db, planId, '1.1')).mergedAt).not.toBeNull();
    expect(transport.startedFor('1.1')).toBe(1);
    expect(transport.startedFor('2.1')).toBe(0);
    const [reopened] = await waveRows(database.db, planId);
    expect(reopened.status).toBe('active');
    expect(reopened.completedAt).toBeNull();
    expect((await planRow(database.db, planId)).status).toBe('executing');
    expect((await eventsOfType(database.db, 'WAVE_TASK_FAILED')).map((e) => e.message)).toEqual([
      'Task 1.2 failed (attempt 1), will retry: merge conflict with the run branch in: src/shared.ts',
    ]);

    // The retry — cut by the runner from the merged head — completes.
    await finish('1.2', ['src/shared-two.ts']);
    await bridge.drain();

    // The wave was merged again: the whole wave is asked for, and the runner
    // answers that 1.1 is already there.
    expect(transport.integrations.map((i) => i.taskCodes)).toEqual([
      ['1.1', '1.2'],
      ['1.1', '1.2'],
    ]);
    expect((await taskByCode(database.db, planId, '1.2')).mergedAt).not.toBeNull();
    expect((await planRow(database.db, planId)).runHeadSha).toBe('head_2');
    expect(transport.startedFor('2.1')).toBe(1);
    const [closed] = await waveRows(database.db, planId);
    expect(closed.status).toBe('completed');

    await finish('2.1');
    await bridge.drain();
    expect(conductor.run.status).toBe('complete');
    bridge.stop();
  });

  it('fails the plan, with the files in the reason, when the retry conflicts too', async () => {
    const { planId, runId, conductor, bridge, finish } = await running();

    transport.merge = (request) =>
      transport.mergeAll(request, { '1.2': ['src/shared.ts', 'src/types.ts'] });

    await finish('1.1');
    await finish('1.2');
    await bridge.drain();
    expect(transport.startedFor('1.2')).toBe(2);

    await finish('1.2');
    await bridge.drain();

    const plan = await planRow(database.db, planId);
    expect(plan.status).toBe('failed');
    expect(plan.failureReason).toBe(
      'Task 1.2 failed after 1 retry: merge conflict with the run branch in: src/shared.ts, src/types.ts'
    );
    expect(await statuses(database.db, planId)).toEqual({
      '1.1': 'completed',
      '1.2': 'failed',
      '2.1': 'skipped',
    });

    // No third attempt, nothing of wave 2 — and the run was told.
    expect(transport.startedFor('1.2')).toBe(2);
    expect(transport.startedFor('2.1')).toBe(0);
    expect(conductor.run.status).toBe('failed');
    expect(conductor.run.failures).toEqual({
      state: 'failed',
      failures: [
        {
          taskCode: '1.2',
          error: 'merge conflict with the run branch in: src/shared.ts, src/types.ts',
        },
      ],
    });

    // What did merge is where the plan says it is.
    expect(plan.runBranch).toBe(`devpilot/${runId}/run`);
    expect(plan.runHeadSha).toBe('head_1');
    expect((await taskByCode(database.db, planId, '1.1')).mergedAt).not.toBeNull();
    const [wave] = await waveRows(database.db, planId);
    expect(wave.status).toBe('failed');
    bridge.stop();
  });

  it('treats a task the runner has no branch for as a failed task', async () => {
    const { planId, bridge, finish } = await running([['1.1'], ['2.1']]);

    let asked = 0;
    transport.merge = (request) => {
      asked++;
      if (asked > 1) return transport.mergeAll(request);
      const answer = transport.mergeAll({ ...request, taskCodes: [] });
      return answer.ok ? { ok: true, result: { ...answer.result, missing: ['1.1'] } } : answer;
    };

    await finish('1.1');
    await bridge.drain();

    const task = await taskByCode(database.db, planId, '1.1');
    expect(task.retryCount).toBe(1);
    expect(task.errorMessage).toBe('no branch was recorded for this task');
    expect(transport.startedFor('1.1')).toBe(2);
    expect(transport.startedFor('2.1')).toBe(0);
    bridge.stop();
  });
});

describe('a merge that cannot be done', () => {
  it('fails the plan with the runner’s message, and retries no task for it', async () => {
    const { planId, conductor, bridge, finish } = await running();

    const message =
      'devpilot/AVA-12/run is checked out in /Users/op/dev/storefront. Switch that checkout to ' +
      "another branch so the wave's work can be merged into it.";
    transport.merge = () => ({ ok: false, code: 'RUN_BRANCH_CHECKED_OUT', message });

    await finish('1.1');
    await finish('1.2');
    await bridge.drain();

    const plan = await planRow(database.db, planId);
    expect(plan.status).toBe('failed');
    expect(plan.failureReason).toBe(`Wave 1 could not be merged into the run branch: ${message}`);

    // It was nobody's task that failed: both stay completed, neither is
    // retried, and what had not started is skipped.
    expect(await statuses(database.db, planId)).toEqual({
      '1.1': 'completed',
      '1.2': 'completed',
      '2.1': 'skipped',
    });
    expect(transport.startedFor('1.1')).toBe(1);
    expect(transport.startedFor('1.2')).toBe(1);
    expect((await taskByCode(database.db, planId, '1.1')).retryCount).toBe(0);
    expect(await eventsOfType(database.db, 'WAVE_TASK_FAILED')).toEqual([]);

    // The driver is told the run is over, with that reason.
    expect(conductor.run.status).toBe('failed');
    expect(conductor.run.failures).toEqual({
      state: 'failed',
      failures: [{ taskCode: '(plan)', error: plan.failureReason }],
    });
    bridge.stop();
  });

  it('does the same when the runner cannot be reached', async () => {
    const { planId, conductor, bridge, finish } = await running([['1.1'], ['2.1']]);

    transport.merge = () => ({
      ok: false,
      code: 'UNREACHABLE',
      message: 'the session runner could not be reached to merge the wave (fetch failed)',
    });

    await finish('1.1');
    await bridge.drain();

    expect((await planRow(database.db, planId)).failureReason).toBe(
      'Wave 1 could not be merged into the run branch: the session runner could not be reached ' +
        'to merge the wave (fetch failed)'
    );
    expect(conductor.run.status).toBe('failed');
    expect(transport.startedFor('1.1')).toBe(1);
    expect(transport.startedFor('2.1')).toBe(0);
    bridge.stop();
  });
});

describe('when the run ends in failure', () => {
  it('merges what had completed in the wave it ended in, and changes nothing else', async () => {
    const { planId, runId, conductor, service, bridge, finish } = await running();

    // 1.1 completes; 1.2 then fails twice and ends the run.
    await finish('1.1');
    await bridge.drain();
    for (const error of ['tests failed', 'tests failed again']) {
      service.ingestCompletionReport(
        completionReport(await sessionOf(planId, '1.2'), { success: false, error })
      );
      await bridge.drain();
    }

    expect(conductor.run.status).toBe('failed');
    const plan = await planRow(database.db, planId);
    // The reason is the task's. The merge afterwards does not touch it.
    expect(plan.failureReason).toBe('Task 1.2 failed after 1 retry: tests failed again');

    // 1.1's work is in the run branch, so the branch holds what succeeded.
    expect(transport.integrations).toEqual([{ repo: 'acme/storefront', runId, taskCodes: ['1.1'] }]);
    expect(plan.runBranch).toBe(`devpilot/${runId}/run`);
    expect((await taskByCode(database.db, planId, '1.1')).mergedAt).not.toBeNull();
    bridge.stop();
  });

  it('leaves a conflict there alone: the run is over, and there is no retry to give', async () => {
    const { planId, service, bridge, finish } = await running();

    transport.merge = (request) => transport.mergeAll(request, { '1.1': ['src/a.ts'] });

    await finish('1.1');
    await bridge.drain();
    for (const error of ['boom', 'boom again']) {
      service.ingestCompletionReport(
        completionReport(await sessionOf(planId, '1.2'), { success: false, error })
      );
      await bridge.drain();
    }

    const task = await taskByCode(database.db, planId, '1.1');
    expect(task.status).toBe('completed');
    expect(task.mergedAt).toBeNull();
    expect(task.retryCount).toBe(0);
    expect(transport.startedFor('1.1')).toBe(1);
    expect((await planRow(database.db, planId)).failureReason).toBe(
      'Task 1.2 failed after 1 retry: boom again'
    );
    bridge.stop();
  });
});

describe('a cockpit restart between "the wave is over" and "the wave is merged"', () => {
  /** Everything in memory gone; the run back from its checkpoint, waiting on wave 1. */
  function restart(planId: string) {
    const config = executionConfig();
    const service = startService(transport);
    const conductor = standInConductor(planId, 2, newController(config), config, 0);
    const bridge = new ExecutionBridge(service, {
      execution: config,
      driver: conductor.driver,
      reconcile: { intervalMs: 60 * MINUTE },
    });
    return { service, conductor, bridge };
  }

  /** A driver that owns the plan and never acts — a process that died before it could. */
  const dead: WaveDriver = {
    owns: async () => true,
    notify: async () => ({ resumed: false, reason: 'the process died here' }),
  };

  /** Wave 1 dispatched by a process whose driver never gets to act on its end. */
  async function dispatchedThenDied() {
    const config = executionConfig();
    const planId = await seedPlan(database.db, [['1.1', '1.2'], ['2.1']]);
    const service = startService(transport);
    const bridge = new ExecutionBridge(service, { execution: config, driver: dead });
    bridge.start();
    await newController(config).driveWave(planId, 0);
    await bridge.drain();
    const runId = (await planRow(database.db, planId)).runId!;
    return { config, planId, service, bridge, runId };
  }

  it('does not skip the merge: the tasks finished, and the process died before merging', async () => {
    const { planId, runId, service, bridge: before } = await dispatchedThenDied();

    for (const code of ['1.1', '1.2']) {
      service.ingestCompletionReport(
        isolatedReport(await sessionOf(planId, code), { runId, taskCode: code, created: [`${code}.ts`] })
      );
    }
    await before.drain();
    before.stop();

    // Both recorded, nothing merged, nothing of wave 2 started.
    expect(await statuses(database.db, planId)).toMatchObject({ '1.1': 'completed', '1.2': 'completed' });
    expect(transport.integrations).toEqual([]);

    const { conductor, bridge } = restart(planId);
    bridge.start(); // reconciles once at start
    await bridge.drain();

    expect(transport.integrations.map((i) => i.taskCodes)).toEqual([['1.1', '1.2']]);
    expect(conductor.run.driven).toEqual([1]);
    expect(transport.startedFor('2.1')).toBe(1);
    expect((await planRow(database.db, planId)).runHeadSha).toBe('head_2');
    bridge.stop();
  });

  it('does not double it: the merge was recorded, and the process died before advancing', async () => {
    const { config, planId, runId, service, bridge: before } = await dispatchedThenDied();

    for (const code of ['1.1', '1.2']) {
      service.ingestCompletionReport(
        isolatedReport(await sessionOf(planId, code), { runId, taskCode: code, created: [`${code}.ts`] })
      );
    }
    await before.drain();

    // The gate ran — merged and recorded — and then the process was gone.
    expect(await newController(config).signalForDriver(planId, 0)).toEqual({
      kind: 'over',
      outcome: { state: 'complete' },
    });
    before.stop();
    expect(transport.integrations).toHaveLength(1);
    expect(transport.startedFor('2.1')).toBe(0);

    const { conductor, bridge } = restart(planId);
    bridge.start();
    await bridge.drain();

    // The runner is not asked again; the run simply carries on.
    expect(transport.integrations).toHaveLength(1);
    expect(conductor.run.driven).toEqual([1]);
    expect(transport.startedFor('2.1')).toBe(1);

    // And a second check-in changes nothing.
    await bridge.reconcile();
    await bridge.drain();
    expect(transport.integrations).toHaveLength(1);
    expect(transport.startedFor('2.1')).toBe(1);
    bridge.stop();
  });

  it('records a merge the runner did and this side never heard the answer to', async () => {
    const { planId, runId, service, bridge: before } = await dispatchedThenDied();

    for (const code of ['1.1', '1.2']) {
      service.ingestCompletionReport(
        isolatedReport(await sessionOf(planId, code), { runId, taskCode: code, created: [`${code}.ts`] })
      );
    }
    await before.drain();
    before.stop();

    // The runner merged the wave; the cockpit died before the answer landed.
    await transport.integrate!({ repo: 'acme/storefront', runId, taskCodes: ['1.1', '1.2'] });
    expect((await taskByCode(database.db, planId, '1.1')).mergedAt).toBeNull();

    const { bridge } = restart(planId);
    bridge.start();
    await bridge.drain();

    // Asked again, answered "already merged" — the run branch did not move —
    // and this time written down.
    expect(transport.integrations).toHaveLength(2);
    expect((await planRow(database.db, planId)).runHeadSha).toBe('head_2');
    expect((await taskByCode(database.db, planId, '1.1')).mergedAt).not.toBeNull();
    expect((await taskByCode(database.db, planId, '1.2')).mergedAt).not.toBeNull();
    expect(transport.startedFor('2.1')).toBe(1);
    bridge.stop();
  });

  it('merges a wave it finds finished when it re-enters dispatch', async () => {
    // A run cut off in the middle of dispatching comes back through
    // `driveWave`, with no task report to bring it to the gate.
    const { config, planId, runId, service, bridge } = await dispatchedThenDied();

    for (const code of ['1.1', '1.2']) {
      service.ingestCompletionReport(
        isolatedReport(await sessionOf(planId, code), { runId, taskCode: code, created: [`${code}.ts`] })
      );
    }
    await bridge.drain();
    expect(transport.integrations).toEqual([]);

    const driven = await newController(config).driveWave(planId, 0);

    expect(driven.settled).toEqual({ state: 'complete' });
    expect(transport.integrations.map((i) => i.taskCodes)).toEqual([['1.1', '1.2']]);
    bridge.stop();
  });

  it('dispatches the retry itself when that merge finds a conflict', async () => {
    // Nothing is in flight on a wave found finished, so no report would ever
    // bring the driver back to send the retry.
    const { config, planId, runId, service, bridge } = await dispatchedThenDied();

    for (const code of ['1.1', '1.2']) {
      service.ingestCompletionReport(
        isolatedReport(await sessionOf(planId, code), { runId, taskCode: code, created: [`${code}.ts`] })
      );
    }
    await bridge.drain();

    let collided = false;
    transport.merge = (request) => {
      if (collided) return transport.mergeAll(request);
      collided = true;
      return transport.mergeAll(request, { '1.2': ['src/shared.ts'] });
    };

    const driven = await newController(config).driveWave(planId, 0);
    await bridge.drain();

    // Not settled: a task is running again. And it was this call that sent it.
    expect(driven.settled).toBeUndefined();
    expect(driven.dispatched).toBe(1);
    expect(transport.startedFor('1.2')).toBe(2);
    expect((await taskByCode(database.db, planId, '1.2')).status).toBe('running');
    expect(transport.startedFor('2.1')).toBe(0);
    bridge.stop();
  });
});

describe('what the next task is told about the ones before it', () => {
  it('lists what git says a predecessor changed, and says it is in the checkout', async () => {
    const { bridge, finish } = await running([
      ['1.1', '1.2'],
      [{ code: '2.1', dependsOn: ['1.1', '1.2'] }],
    ]);

    await finish('1.1', ['src/lib.ts', 'src/lib.test.ts']);
    await finish('1.2', []); // ran, and changed nothing
    await bridge.drain();

    const prompt = transport.created.find((c) => c.metadata?.taskCode === '2.1')!.prompt;
    expect(prompt).toContain(
      'and their work has been merged into the branch your checkout was cut from'
    );
    expect(prompt).toContain(
      '- Files this task changed (from git: its branch against the commit it started from): ' +
        '`src/lib.ts`, `src/lib.test.ts`'
    );
    expect(prompt).toContain(
      '- Files this task changed (from git: its branch against the commit it started from): ' +
        '(none — it changed no files)'
    );
    bridge.stop();
  });

  it('claims neither for a plan that is not isolated', async () => {
    transport.capabilityList = [];
    const { planId, service, bridge } = await running([
      ['1.1'],
      [{ code: '2.1', dependsOn: ['1.1'] }],
    ]);

    // The runner still reports files for a shared checkout — from two
    // `git status` readings of a tree other agents write to.
    service.ingestCompletionReport({
      ...completionReport(await sessionOf(planId, '1.1'), { success: true }),
      filesCreated: ['src/lib.ts', 'src/somebody-elses.ts'],
    });
    await bridge.drain();

    // Recorded as reported…
    expect((await taskByCode(database.db, planId, '1.1')).filesChanged).toEqual([
      'src/lib.ts',
      'src/somebody-elses.ts',
    ]);

    // …and not passed on as "the files this task changed", nor as merged.
    const prompt = transport.created.find((c) => c.metadata?.taskCode === '2.1')!.prompt;
    expect(prompt).toContain('These upstream tasks completed before yours; build on their work:');
    expect(prompt).toContain('- Files this task was scoped to: `src/1.1.ts`');
    expect(prompt).not.toContain('Files this task changed');
    expect(prompt).not.toContain('merged');
    bridge.stop();
  });
});
