import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { horizonItems, plans, wavePlans, wavePlanMetrics, waveTasks } from '../src/db/schema';
import { initOrchestratorService } from '../src/orchestrator/service';
import type { SessionTransport } from '../src/orchestrator/claude-session-adapter';
import type { GraphDependentsOutcome, GraphDependentsRequest } from '../src/orchestrator/types';
import { WavePlanGenerator } from '../src/wave-planner/generator';
import { PlanRefinementService } from '../src/wave-planner/plan-refinement-service';
import { assignWaves } from '../src/wave-planner/wave-assigner';
import {
  BLAST_RADIUS_LISTED,
  blastRadiusOf,
  codeGraphOf,
  dependentClaimsOf,
  describeCodeGraph,
  readPlanCodeGraph,
  withCodeGraph,
  type PlanCodeGraph,
} from '../src/wave-planner/plan-code-graph';
import type { ParsedTask, ParsedWavePlan, PlanScore } from '../src/wave-planner/types';
import { openTestDatabase, type TestDatabase } from './helpers/wave-harness';

/**
 * Getting dependents to the planner: from a session runner's answer to a
 * plan's waves, and to what a reviewer is told about it.
 *
 * The runner's routes do not exist in this package — they are the CLI's — so
 * the "runner" here is a transport that answers as the routes are specified
 * to. Everything between that answer and the rows in the database is real: the
 * orchestrator service and its claude-session adapter, the wave assigner, the
 * generator's persistence, a SQLite file.
 *
 * What is being held: the graph changes a plan only when it has something to
 * say, and a plan made without it says so, with the reason — never silently.
 */

function task(taskCode: string, filePaths: string[], dependencies: string[] = []): ParsedTask {
  return {
    taskCode,
    description: `Task ${taskCode}`,
    filePaths,
    dependencies,
    canRunInParallel: true,
    recommendedModel: 'sonnet',
    complexity: 'M',
  };
}

/** A source that answers from a fixed map, and records what it was asked. */
function sourceOf(answer: GraphDependentsOutcome | (() => Promise<GraphDependentsOutcome>)) {
  const asked: GraphDependentsRequest[] = [];
  return {
    asked,
    async graphDependents(request: GraphDependentsRequest) {
      asked.push(request);
      return typeof answer === 'function' ? answer() : answer;
    },
  };
}

const AVAILABLE = (byFile: Record<string, string[]>, extra: Partial<{ truncated: boolean; indexedAt: string | null }> = {}) =>
  ({ available: true, byFile, truncated: false, indexedAt: '2026-10-01T16:08:24.573Z', ...extra }) as const;

const TASKS = [
  task('1.1', ['src/policy.ts']),
  task('1.2', ['src/fetch.ts']),
  task('1.3', ['docs/readme.md']),
];

describe('readPlanCodeGraph', () => {
  it('asks once, for every file the plan names, at depth 1', async () => {
    const source = sourceOf(AVAILABLE({ 'src/policy.ts': ['src/fetch.ts', 'src/policy.test.ts'] }));

    await readPlanCodeGraph('acme/storefront', [...TASKS, task('2.1', ['src/policy.ts', 'src/new.ts'])], source);

    expect(source.asked).toEqual([
      {
        repo: 'acme/storefront',
        // Each file once, however many tasks name it.
        files: ['src/policy.ts', 'src/fetch.ts', 'docs/readme.md', 'src/new.ts'],
        depth: 1,
      },
    ]);
  });

  it('gives each task its blast radius and the claims the assigner will use', async () => {
    const source = sourceOf(AVAILABLE({ 'src/policy.ts': ['src/policy.test.ts', 'src/fetch.ts'], 'src/fetch.ts': [] }));

    expect(await readPlanCodeGraph('acme/storefront', TASKS, source)).toEqual({
      used: true,
      indexedAt: '2026-10-01T16:08:24.573Z',
      truncated: false,
      tasks: [
        {
          taskCode: '1.1',
          dependentCount: 2,
          dependents: ['src/fetch.ts', 'src/policy.test.ts'],
          claims: [
            { file: 'src/fetch.ts', dependsOn: 'src/policy.ts' },
            { file: 'src/policy.test.ts', dependsOn: 'src/policy.ts' },
          ],
          leftOut: [],
        },
        { taskCode: '1.2', dependentCount: 0, dependents: [], claims: [], leftOut: [] },
        // A file the runner did not mention at all: nothing depends on it.
        { taskCode: '1.3', dependentCount: 0, dependents: [], claims: [], leftOut: [] },
      ],
    });
  });

  it.each([
    ['the repository has no index', { available: false, reason: 'there is no code graph index at /work/storefront/.codegraph/codegraph.db' }],
    ['the runner predates the graph', { available: false, reason: "the session runner does not report the 'code-graph' capability (it predates the code graph)" }],
    ['the orchestrator has no runner', { available: false, reason: "the orchestrator is in 'http' mode, which has no session runner to read a code graph from" }],
  ] as const)('is not used, and carries the reason word for word, when %s', async (_case, answer) => {
    expect(await readPlanCodeGraph('acme/storefront', TASKS, sourceOf(answer))).toEqual({
      used: false,
      reason: answer.reason,
    });
  });

  it('is not used when there is no orchestrator in the process at all', async () => {
    const codeGraph = await readPlanCodeGraph('acme/storefront', TASKS, null);

    expect(codeGraph.used).toBe(false);
    expect(codeGraph.reason).toMatch(/no orchestrator is running in this process/);
  });

  it('does not ask when no task names a file', async () => {
    const source = sourceOf(AVAILABLE({}));

    const codeGraph = await readPlanCodeGraph('acme/storefront', [task('1.1', []), task('1.2', [])], source);

    expect(codeGraph).toEqual({
      used: false,
      reason: 'no task in the plan names a file, so there was nothing to look up',
    });
    expect(source.asked).toEqual([]);
  });

  it('turns a source that throws into "not used"', async () => {
    const source = sourceOf(async () => {
      throw new Error('boom');
    });

    expect(await readPlanCodeGraph('acme/storefront', TASKS, source)).toEqual({
      used: false,
      reason: 'the code graph could not be read (boom)',
    });
  });
});

describe('blastRadiusOf', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => `src/user-${String(i).padStart(3, '0')}.ts`);

  it('does not count the task’s own files among their dependents', () => {
    const radius = blastRadiusOf(task('1.1', ['src/policy.ts', 'src/fetch.ts']), {
      'src/policy.ts': ['src/fetch.ts', 'src/page.tsx'],
      'src/fetch.ts': ['src/page.tsx'],
    });

    // page.tsx once, though it uses both files; fetch.ts not at all.
    expect(radius.dependentCount).toBe(1);
    expect(radius.dependents).toEqual(['src/page.tsx']);
  });

  it('counts every dependent, lists the first 25, and claims none of a file too wide to sequence on', () => {
    const radius = blastRadiusOf(task('1.1', ['src/types.ts', 'src/policy.ts']), {
      'src/types.ts': many(46),
      'src/policy.ts': ['src/fetch.ts'],
    });

    expect(radius.dependentCount).toBe(47);
    expect(radius.dependents).toHaveLength(BLAST_RADIUS_LISTED);
    expect(radius.dependents).toEqual([...radius.dependents].sort());
    expect(radius.claims).toEqual([{ file: 'src/fetch.ts', dependsOn: 'src/policy.ts' }]);
    expect(radius.leftOut).toEqual([{ file: 'src/types.ts', dependents: 46 }]);
  });
});

describe('dependentClaimsOf', () => {
  it('is the assigner option, keyed by task code', () => {
    const codeGraph: PlanCodeGraph = {
      used: true,
      tasks: [
        blastRadiusOf(TASKS[0], { 'src/policy.ts': ['src/fetch.ts'] }),
        blastRadiusOf(TASKS[1], {}),
      ],
    };

    expect(dependentClaimsOf(codeGraph)).toEqual({
      '1.1': [{ file: 'src/fetch.ts', dependsOn: 'src/policy.ts' }],
    });
  });

  it('is undefined — the option left off — whenever there is nothing to claim', () => {
    expect(dependentClaimsOf(undefined)).toBeUndefined();
    expect(dependentClaimsOf(null)).toBeUndefined();
    expect(dependentClaimsOf({ used: false, reason: 'no index' })).toBeUndefined();
    // Used, and every task's files have no dependents.
    expect(dependentClaimsOf({ used: true, tasks: TASKS.map((t) => blastRadiusOf(t, {})) })).toBeUndefined();
  });
});

describe('carrying it with a plan', () => {
  const codeGraph: PlanCodeGraph = { used: false, reason: 'no index' };

  it('survives the JSON a checkpoint puts it through', () => {
    const plan = withCodeGraph({ waves: [], rawMarkdown: '' }, codeGraph);

    expect(codeGraphOf(JSON.parse(JSON.stringify(plan)))).toEqual(codeGraph);
  });

  it('reads nothing from a plan that has none, or has something else there', () => {
    expect(codeGraphOf({ waves: [] })).toBeNull();
    expect(codeGraphOf(null)).toBeNull();
    expect(codeGraphOf({ codeGraph: 'yes' })).toBeNull();
    expect(codeGraphOf({ codeGraph: { used: true } })).toBeNull();
    expect(codeGraphOf({ codeGraph: { used: false } })).toBeNull();
    expect(codeGraphOf({ codeGraph: { used: true, tasks: [{ taskCode: '1.1' }] } })).toBeNull();
  });
});

describe('describeCodeGraph — what a reviewer is told', () => {
  const tasks = [task('1.1', ['src/policy.ts']), task('1.2', ['src/fetch.ts'])];
  const byFile = { 'src/policy.ts': ['src/fetch.ts', 'src/policy.test.ts'] };
  const codeGraph: PlanCodeGraph = {
    used: true,
    indexedAt: '2026-10-01T16:08:24.573Z',
    truncated: false,
    tasks: tasks.map((t) => blastRadiusOf(t, byFile)),
  };
  const adjustments = assignWaves(tasks, [], { dependentClaims: dependentClaimsOf(codeGraph) }).adjustments;

  it('says, per task, how many files depend on what it changes, and which', () => {
    expect(describeCodeGraph(codeGraph, adjustments).tasks).toEqual([
      {
        taskCode: '1.1',
        dependentCount: 2,
        dependents: ['src/fetch.ts', 'src/policy.test.ts'],
        more: 0,
        summary: '2 files depend on what this changes',
        notSequencedOn: [],
      },
      {
        taskCode: '1.2',
        dependentCount: 0,
        dependents: [],
        more: 0,
        summary: 'No indexed file depends on what this changes',
        notSequencedOn: [],
      },
    ]);
  });

  it('says in plain words why a task was moved', () => {
    expect(describeCodeGraph(codeGraph, adjustments).sequenced).toEqual([
      {
        taskCode: '1.2',
        wavesLater: 1,
        because:
          'Task 1.2 runs 1 wave later than its dependencies alone would put it: ' +
          'src/fetch.ts depends on src/policy.ts, which task 1.1 changes.',
      },
    ]);
  });

  it('lists only the moves the graph caused', () => {
    const review = describeCodeGraph(codeGraph, [
      { type: 'FILE_CONFLICT_BUMP', taskCode: '1.2', fromWave: 0, toWave: 1, reason: 'File conflict detected with files: a.ts' },
      { type: 'CAPACITY_SPLIT', taskCode: '1.3', fromWave: 0, toWave: 1, reason: 'Wave split' },
    ]);

    expect(review.sequenced).toEqual([]);
  });

  it('says a count is a lower bound when the runner cut its lists short', () => {
    const review = describeCodeGraph({ ...codeGraph, truncated: true }, []);

    expect(review.truncated).toBe(true);
    expect(review.tasks.map((t) => t.summary)).toEqual([
      'At least 2 files depend on what this changes',
      'No file was found that depends on what this changes (some lists were cut short)',
    ]);
  });

  it('says how many more there are than it lists, and names a file too wide to sequence on', () => {
    const wide = Array.from({ length: 46 }, (_, i) => `src/user-${String(i).padStart(3, '0')}.ts`);
    const review = describeCodeGraph(
      { used: true, tasks: [blastRadiusOf(task('1.1', ['src/types.ts']), { 'src/types.ts': wide })] },
      []
    );

    expect(review.tasks[0]).toMatchObject({
      dependentCount: 46,
      more: 21,
      summary: '46 files depend on what this changes',
      notSequencedOn: ['src/types.ts has 46 dependents — too many to keep other tasks apart on'],
    });
    expect(review.tasks[0].dependents).toHaveLength(25);
  });

  it('uses the singular for one', () => {
    const review = describeCodeGraph(
      { used: true, tasks: [blastRadiusOf(tasks[0], { 'src/policy.ts': ['src/fetch.ts'] })] },
      []
    );

    expect(review.tasks[0].summary).toBe('1 file depends on what this changes');
  });

  it('says the graph was not used, and why, and nothing else', () => {
    expect(describeCodeGraph({ used: false, reason: 'there is no code graph index at /work/x' }, adjustments)).toEqual({
      used: false,
      reason: 'there is no code graph index at /work/x',
      indexedAt: null,
      truncated: false,
      tasks: [],
      sequenced: [],
    });
  });

  it('tolerates a plan whose adjustments were never recorded', () => {
    expect(describeCodeGraph(codeGraph, null).sequenced).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Through the generator, to the database.
// ---------------------------------------------------------------------------

const BARE_TRANSPORT: SessionTransport = {
  createSession: async () => ({ accepted: true, externalSessionId: 'x' }),
  sendMessage: async () => ({ success: true }),
  stopSession: async () => ({ success: true, message: 'stopped' }),
};

const SCORE: PlanScore = {
  parallelizationScore: 0.67,
  maxParallelism: 3,
  waveEfficiency: 3,
  dependencyDensity: 0,
  fileConflictScore: 1,
  confidenceSignals: { parallelization: 'MEDIUM', conflictRisk: 'LOW' },
};

/** What the planner model "returned": three independent tasks in one wave. */
function plannedPlan(): ParsedWavePlan {
  return {
    waves: [{ waveIndex: 0, label: 'Wave 1', tasks: TASKS }],
    dependencyEdges: [],
    criticalPath: ['1.1'],
    statistics: { totalTasks: 3, totalWaves: 1, maxParallelism: 3, criticalPathLength: 1, sequentialChains: 0 },
    rawMarkdown: '# plan',
  };
}

describe('WavePlanGenerator — a plan made with, and without, a code graph', () => {
  let database: TestDatabase;
  let itemId: string;
  let planId: string;
  let asked: GraphDependentsRequest[];

  beforeEach(async () => {
    database = openTestDatabase();
    asked = [];

    const [item] = await database.db
      .insert(horizonItems)
      .values({ title: 'Retry payments', repo: 'acme/storefront', linearTicketId: 'AVA-12' })
      .returning();
    itemId = item.id;
    const [plan] = await database.db
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
    planId = plan.id;

    // The planner model is the one thing not run: this returns what it would.
    vi.spyOn(PlanRefinementService.prototype, 'generateAndRefine').mockResolvedValue({
      plan: plannedPlan(),
      score: SCORE,
      iterationsPerformed: 1,
      totalTokensUsed: 1234,
      success: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    database.close();
  });

  function runnerAnswering(answer: GraphDependentsOutcome) {
    initOrchestratorService(
      { mode: 'claude-session' },
      {
        ...BARE_TRANSPORT,
        async graphDependents(request) {
          asked.push(request);
          return answer;
        },
      }
    );
  }

  const generate = () =>
    new WavePlanGenerator({ aiClient: { apiKey: 'unused', model: 'unused', maxTokens: 1 } }).generate(
      itemId,
      planId,
      'spec',
      'Retry payments',
      'acme/storefront',
      { workingDir: '/nonexistent' }
    );

  const persisted = async (wavePlanId: string) => {
    const [row] = await database.db.select().from(wavePlans).where(eq(wavePlans.id, wavePlanId));
    const tasks = await database.db
      .select({ taskCode: waveTasks.taskCode, waveIndex: waveTasks.waveIndex })
      .from(waveTasks)
      .where(eq(waveTasks.wavePlanId, wavePlanId))
      .orderBy(asc(waveTasks.taskCode));
    return { row, tasks };
  };

  it('sequences the two tasks the graph says would collide, and records why', async () => {
    runnerAnswering(AVAILABLE({ 'src/policy.ts': ['src/fetch.ts'], 'src/fetch.ts': [], 'docs/readme.md': [] }));

    const result = await generate();

    // One request for the plan, not one per task.
    expect(asked).toEqual([
      { repo: 'acme/storefront', files: ['src/policy.ts', 'src/fetch.ts', 'docs/readme.md'], depth: 1 },
    ]);

    expect(result.codeGraph.used).toBe(true);
    expect(result.waveAssignment.waves.map((w) => w.tasks.map((t) => t.taskCode))).toEqual([
      ['1.1', '1.3'],
      ['1.2'],
    ]);
    const bump = {
      type: 'DEPENDENCY_CONFLICT_BUMP',
      taskCode: '1.2',
      fromWave: 0,
      toWave: 1,
      reason: 'Dependency conflict: src/fetch.ts depends on src/policy.ts, which task 1.1 changes',
    };
    expect(result.waveAssignment.adjustments).toEqual([bump]);

    const { row, tasks } = await persisted(result.wavePlanId!);
    expect(row.totalWaves).toBe(2);
    expect(tasks).toEqual([
      { taskCode: '1.1', waveIndex: 0 },
      { taskCode: '1.2', waveIndex: 1 },
      { taskCode: '1.3', waveIndex: 0 },
    ]);
    expect(row.adjustments).toEqual([bump]);
    expect(row.codeGraph).toEqual(result.codeGraph);
    expect(row.codeGraph?.tasks?.[0]).toMatchObject({ taskCode: '1.1', dependentCount: 1, dependents: ['src/fetch.ts'] });

    // A predicted conflict is not reported as a file conflict avoided.
    const [metrics] = await database.db
      .select()
      .from(wavePlanMetrics)
      .where(eq(wavePlanMetrics.wavePlanId, result.wavePlanId!));
    expect(metrics.fileConflictsAvoided).toBe(0);
  });

  it('makes the plan it always made when the repository has no index — and says the graph was not used', async () => {
    const reason = 'there is no code graph index at /work/storefront/.codegraph/codegraph.db';
    runnerAnswering({ available: false, reason });

    const result = await generate();

    expect(result.codeGraph).toEqual({ used: false, reason });
    // Byte for byte the assignment made with no graph anywhere.
    expect(JSON.stringify(result.waveAssignment)).toBe(JSON.stringify(assignWaves(TASKS, [])));

    const { row, tasks } = await persisted(result.wavePlanId!);
    expect(tasks.map((t) => t.waveIndex)).toEqual([0, 0, 0]);
    expect(row.codeGraph).toEqual({ used: false, reason });
    // Recorded, and empty: the assigner ran and moved nothing.
    expect(row.adjustments).toEqual([]);
  });

  it('makes the same plan with no orchestrator at all', async () => {
    // Nothing initialised: the generator is being run where there is no runner.
    const result = await generate();

    expect(result.codeGraph.used).toBe(false);
    expect(result.codeGraph.reason).toMatch(/no orchestrator is running in this process/);
    expect(JSON.stringify(result.waveAssignment)).toBe(JSON.stringify(assignWaves(TASKS, [])));
    expect(result.success).toBe(true);
  });

  it('makes the same plan when the orchestrator is in a mode with no runner, naming the mode', async () => {
    initOrchestratorService({ mode: 'disabled' });

    const result = await generate();

    expect(result.codeGraph).toEqual({
      used: false,
      reason: "the orchestrator is in 'disabled' mode, which has no session runner to read a code graph from",
    });
    expect(JSON.stringify(result.waveAssignment)).toBe(JSON.stringify(assignWaves(TASKS, [])));
  });

  it('does not let a graph with nothing to say change the plan', async () => {
    runnerAnswering(AVAILABLE({ 'src/policy.ts': [], 'src/fetch.ts': [], 'docs/readme.md': [] }));

    const result = await generate();

    // Used — the reviewer is shown that nothing depends on these files —
    // and the assignment is still the one made without it.
    expect(result.codeGraph.used).toBe(true);
    expect(JSON.stringify(result.waveAssignment)).toBe(JSON.stringify(assignWaves(TASKS, [])));
  });

  it('records, for a persist that was not told about a graph, that nobody asked', async () => {
    const generator = new WavePlanGenerator({ aiClient: { apiKey: 'unused', model: 'unused', maxTokens: 1 } });
    const assignment = assignWaves(TASKS, []);

    const wavePlanId = await generator.persistWavePlan(
      itemId,
      planId,
      plannedPlan(),
      { path: ['1.1'], length: 1, annotations: new Map() },
      assignment,
      SCORE
    );

    const { row } = await persisted(wavePlanId);
    expect(row.codeGraph).toBeNull();
    expect(row.adjustments).toEqual([]);
  });
});
