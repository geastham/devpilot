import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { rufloSessions, waveTasks } from '../../src/db/schema';
import type {
  GraphAffectedTestsOutcome,
  GraphAffectedTestsRequest,
} from '../../src/orchestrator/types';
import { WaveDispatchCoordinator } from '../../src/wave-planner/execution/dispatch-coordinator';
import {
  executionConfig,
  openTestDatabase,
  recordingTransport,
  seedPlan,
  startService,
  type RecordingTransport,
  type TestDatabase,
} from '../helpers/wave-harness';

/**
 * Test selection at dispatch, end to end on this side of the wire: a real
 * SQLite database, the real coordinator, service and claude-session adapter,
 * and a transport standing in for the session runner — which is where the code
 * graph is read, and whose routes are not in this package.
 *
 * `buildSessionPrompt` is tested on its own. This is here for what the call
 * site decides: what it asks the runner, that it asks before anything is
 * written, and — above all — that a runner with nothing to say leaves the
 * dispatch exactly as it was.
 */

let database: TestDatabase;

beforeEach(() => {
  database = openTestDatabase();
});

afterEach(() => {
  database.close();
});

type GraphTransport = RecordingTransport & {
  asked: GraphAffectedTestsRequest[];
  /** Session rows that existed at the moment the runner was asked. */
  sessionRowsWhenAsked: number[];
};

function transportAnswering(
  answer: (request: GraphAffectedTestsRequest) => GraphAffectedTestsOutcome | Promise<GraphAffectedTestsOutcome>
): GraphTransport {
  const transport = Object.assign(recordingTransport(), {
    asked: [] as GraphAffectedTestsRequest[],
    sessionRowsWhenAsked: [] as number[],
    async graphAffectedTests(request: GraphAffectedTestsRequest) {
      transport.asked.push(request);
      transport.sessionRowsWhenAsked.push((await database.db.select().from(rufloSessions)).length);
      return answer(request);
    },
  });
  return transport;
}

async function dispatchFirstWave(transport: RecordingTransport, shape: string[][] = [['1.1', '1.2']]) {
  startService(transport);
  const wavePlanId = await seedPlan(database.db, shape);
  const tasks = await database.db.select().from(waveTasks).where(eq(waveTasks.wavePlanId, wavePlanId));
  const result = await new WaveDispatchCoordinator(executionConfig()).dispatchWave(
    wavePlanId,
    0,
    tasks.filter((t) => t.waveIndex === 0)
  );
  return { result, wavePlanId };
}

const promptFor = (transport: RecordingTransport, taskCode: string) =>
  transport.created.find((c) => c.metadata?.taskCode === taskCode)!.prompt;

describe('WaveDispatchCoordinator — the tests a task’s files reach', () => {
  it('asks the runner about each task’s own files, and puts the answer in that task’s prompt', async () => {
    const transport = transportAnswering((request) => ({
      available: true,
      tests: request.files.includes('src/1.1.ts') ? ['src/1.1.test.ts', 'tests/e2e/flow.spec.ts'] : [],
      truncated: false,
    }));

    const { result } = await dispatchFirstWave(transport);

    expect(result).toEqual({ dispatched: 2, queued: 0, errors: [] });
    expect(transport.asked).toEqual([
      { repo: 'acme/storefront', files: ['src/1.1.ts'] },
      { repo: 'acme/storefront', files: ['src/1.2.ts'] },
    ]);

    expect(promptFor(transport, '1.1')).toContain(
      '# Tests Reached From Your Files\n\n' +
        'These test files are reached from the files in your scope'
    );
    expect(promptFor(transport, '1.1')).toContain('- `src/1.1.test.ts`\n- `tests/e2e/flow.spec.ts`');
    // 1.2's files reach no test: an empty answer is no section.
    expect(promptFor(transport, '1.2')).not.toContain('Tests Reached');
  });

  it('asks before the session row is written, so a slow answer leaves nothing on the board', async () => {
    const transport = transportAnswering(() => ({ available: true, tests: ['src/a.test.ts'], truncated: false }));

    await dispatchFirstWave(transport, [['1.1']]);

    expect(transport.sessionRowsWhenAsked).toEqual([0]);
  });

  it('carries the runner’s "cut short" through to the wording', async () => {
    const transport = transportAnswering(() => ({ available: true, tests: ['src/a.test.ts'], truncated: true }));

    await dispatchFirstWave(transport, [['1.1']]);

    expect(promptFor(transport, '1.1')).toContain('- `src/a.test.ts`\n\n…and more not listed.');
  });

  it.each([
    ['the repository has no index', (): GraphAffectedTestsOutcome => ({ available: false, reason: 'there is no code graph index' })],
    ['the runner found none', (): GraphAffectedTestsOutcome => ({ available: true, tests: [], truncated: false })],
    [
      'the runner fails',
      (): GraphAffectedTestsOutcome => {
        throw new Error('socket hang up');
      },
    ],
  ] as const)('dispatches the same prompt as a runner with no code graph when %s', async (_case, answer) => {
    // The prompt a transport that cannot read a graph at all is sent — which is
    // every dispatch before this existed.
    const plain = recordingTransport();
    await dispatchFirstWave(plain, [['1.1']]);
    const before = promptFor(plain, '1.1');
    database.close();

    database = openTestDatabase();
    const transport = transportAnswering(answer);
    const { result } = await dispatchFirstWave(transport, [['1.1']]);

    expect(result).toEqual({ dispatched: 1, queued: 0, errors: [] });
    // Identical but for the session id, which is new for every dispatch.
    const sessionId = transport.created[0].sessionId;
    expect(promptFor(transport, '1.1')).toBe(before.replace(plain.created[0].sessionId, sessionId));
    expect(promptFor(transport, '1.1')).not.toContain('Tests Reached');
  });

  it('does not ask at all for a task that names no files', async () => {
    const transport = transportAnswering(() => ({ available: true, tests: ['src/a.test.ts'], truncated: false }));
    startService(transport);
    const wavePlanId = await seedPlan(database.db, [['1.1']]);
    await database.db.update(waveTasks).set({ filePaths: [] }).where(eq(waveTasks.wavePlanId, wavePlanId));
    const tasks = await database.db.select().from(waveTasks).where(eq(waveTasks.wavePlanId, wavePlanId));

    await new WaveDispatchCoordinator(executionConfig()).dispatchWave(wavePlanId, 0, tasks);

    expect(transport.asked).toEqual([]);
    expect(transport.created).toHaveLength(1);
    expect(promptFor(transport, '1.1')).not.toContain('Tests Reached');
  });
});
