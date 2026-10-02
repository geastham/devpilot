import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import {
  horizonItems,
  plannerReviews,
  plannerTraces,
  plans,
  wavePlanMetrics,
  waveTasks,
} from '../src/db/schema';
import { getSQLiteConnection } from '../src/db/adapters/sqlite';
import { collectFinalMetrics } from '../src/wave-planner/execution/auto-advance';
import { WavePlanGenerator } from '../src/wave-planner/generator';
import {
  MIN_TASKS_FOR_PARALLELIZATION_GATE,
  PlanRefinementService,
  parallelizationGateApplies,
  resolveMinParallelizationScore,
} from '../src/wave-planner/plan-refinement-service';
import { planSha, recordPlanReview, resetPlannerTraceWarning } from '../src/wave-planner/trace';
import { openTestDatabase, seedPlan, type TestDatabase } from './helpers/wave-harness';

/**
 * The planner's record of itself, against a real SQLite file and the real
 * prompt constructor, parser, validator and scorer. Only the model is stubbed:
 * `create` is the one function that would have spent money.
 *
 * Every "how many calls" below is a count of requests to the model.
 */

const create = vi.hoisted(() => vi.fn());
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create };
  },
}));

type Row = { code: string; deps?: string[]; files?: string[] };

/** A planner response in the format the parser reads: one table per wave. */
function planMarkdown(waves: Row[][]): string {
  return waves
    .map(
      (wave, i) =>
        `## Wave ${i + 1}: Step ${i + 1}\n\n` +
        '| Task ID | Description | Files | Dependencies | Parallel? | Model | Complexity |\n' +
        '|---------|-------------|-------|--------------|-----------|-------|------------|\n' +
        wave
          .map(
            (t) =>
              `| ${t.code} | Do ${t.code} | ${(t.files ?? [`src/${t.code}.ts`]).join(', ')} | ${(t.deps ?? []).join(', ') || '-'} | Yes | sonnet | M |`
          )
          .join('\n')
    )
    .join('\n\n');
}

const answer = (text: string, over: Record<string, unknown> = {}) => ({
  content: [
    // Thinking arrives as its own block and is not part of the plan.
    { type: 'thinking', thinking: '' },
    { type: 'text', text },
  ],
  model: 'claude-opus-5-20260101',
  stop_reason: 'end_turn',
  usage: { input_tokens: 1200, output_tokens: 900, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  ...over,
});

const ONE_TASK = planMarkdown([[{ code: '1.1' }]]);
const CHAIN_OF_FOUR = planMarkdown([
  [{ code: '1.1' }],
  [{ code: '2.1', deps: ['1.1'] }],
  [{ code: '3.1', deps: ['2.1'] }],
  [{ code: '4.1', deps: ['3.1'] }],
]);
const FOUR_SIDE_BY_SIDE = planMarkdown([[{ code: '1.1' }, { code: '1.2' }, { code: '1.3' }, { code: '1.4' }]]);

let database: TestDatabase;
let workingDir: string;

beforeEach(() => {
  database = openTestDatabase();
  workingDir = mkdtempSync(join(tmpdir(), 'devpilot-planner-trace-'));
  writeFileSync(join(workingDir, 'README.md'), '# fixture\n');
  create.mockReset();
  resetPlannerTraceWarning();
  delete process.env.DEVPILOT_PLANNER_TRACE;
  delete process.env.WAVE_PLANNER_MIN_PARALLELIZATION;
});

afterEach(() => {
  database.close();
  rmSync(workingDir, { recursive: true, force: true });
});

const service = (over: Record<string, unknown> = {}) =>
  new PlanRefinementService({ apiKey: 'test', model: 'claude-opus-5', maxTokens: 8192 }, over);
const traces = () => database.db.select().from(plannerTraces).orderBy(plannerTraces.step);
const plan = (svc: PlanRefinementService, over: Record<string, unknown> = {}) =>
  svc.generateInitialPlan('Add a retry to the fetcher.', 'Retry the fetcher', 'item_1', 'acme/storefront', {
    workingDir,
    ...over,
  });

describe('a planner call is recorded', () => {
  it('keeps what was asked, what was answered and what was made of it', async () => {
    create.mockResolvedValueOnce(answer(FOUR_SIDE_BY_SIDE));

    await plan(service(), { customConstraints: ['do not touch src/db'] });

    const [row] = await traces();
    expect(row).toMatchObject({
      step: 0,
      kind: 'initial',
      itemId: 'item_1',
      repo: 'acme/storefront',
      template: 'default',
      templateVersion: '1.0.0',
      modelRequested: 'claude-opus-5',
      // The alias resolved to a dated id; the record keeps both.
      model: 'claude-opus-5-20260101',
      response: FOUR_SIDE_BY_SIDE,
      responseSha: planSha(FOUR_SIDE_BY_SIDE),
      stopReason: 'end_turn',
      tokensInput: 1200,
      tokensOutput: 900,
      outcome: 'valid',
      taskCount: 4,
      score: 0.75,
      wavePlanId: null,
      chosen: false,
      constraints: ['do not touch src/db'],
    });
    // The prompt as it was sent — the specification is in it.
    expect(row.prompt).toContain('Add a retry to the fetcher.');
    expect(row.prompt).toBe(create.mock.calls[0][0].messages[0].content);
    expect(row.promptSha).toBe(planSha(row.prompt));
    expect(row.scoreDetail).toMatchObject({ parallelizationScore: 0.75, maxParallelism: 4 });
    expect(row.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('keeps an answer that was rejected, and why', async () => {
    const cyclic = planMarkdown([[{ code: '1.1', deps: ['1.2'] }, { code: '1.2', deps: ['1.1'] }]]);
    create.mockResolvedValueOnce(answer(cyclic));

    await expect(plan(service())).rejects.toThrow(/validation errors/);

    const [row] = await traces();
    expect(row.outcome).toBe('invalid');
    expect(row.response).toBe(cyclic);
    expect(row.errors!.join(' ')).toMatch(/Circular dependency/);
    expect(row.score).toBeNull();
  });

  it('keeps a call that got no answer', async () => {
    create.mockRejectedValueOnce(Object.assign(new Error('invalid x-api-key'), { status: 401 }));

    await expect(plan(service())).rejects.toThrow(/invalid x-api-key/);

    const [row] = await traces();
    expect(row).toMatchObject({ outcome: 'error', response: null, model: null, tokensOutput: null });
    expect(row.errors![0]).toMatch(/invalid x-api-key/);
    expect(row.prompt).toContain('Add a retry to the fetcher.');
  });

  it('gives a refinement the run of the plan it refines, and says whether it scored higher', async () => {
    create.mockResolvedValueOnce(answer(CHAIN_OF_FOUR)).mockResolvedValueOnce(answer(FOUR_SIDE_BY_SIDE));
    const svc = service();

    const first = await plan(svc);
    await svc.refineplan('spec', 'Retry the fetcher', 'item_1', 'acme/storefront', { workingDir }, first.plan, 0);

    const [initial, refined] = await traces();
    expect(refined.runId).toBe(initial.runId);
    expect(refined).toMatchObject({
      step: 1,
      kind: 'refine',
      template: 'refinement',
      basedOnSha: planSha(CHAIN_OF_FOUR),
      previousScore: 0,
      score: 0.75,
      improved: true,
    });
  });

  it('says so when a refinement did not score higher', async () => {
    create.mockResolvedValueOnce(answer(FOUR_SIDE_BY_SIDE)).mockResolvedValueOnce(answer(CHAIN_OF_FOUR));
    const svc = service();

    const first = await plan(svc);
    await svc.refineplan('spec', 't', 'item_1', 'acme/storefront', { workingDir }, first.plan, 0.75);

    expect((await traces())[1]).toMatchObject({ outcome: 'valid', improved: false, previousScore: 0.75, score: 0 });
  });

  it('starts a new run for a new plan', async () => {
    create.mockResolvedValue(answer(FOUR_SIDE_BY_SIDE));
    const svc = service();
    await plan(svc);
    await plan(svc);

    const [a, b] = await traces();
    expect(a.runId).not.toBe(b.runId);
    expect([a.step, b.step]).toEqual([0, 0]);
  });
});

describe('a response cut off at the token ceiling', () => {
  it('is asked for once, not four times', async () => {
    create.mockResolvedValue(
      answer('## Wave 1: Start\n\n| Task ID | Description', {
        stop_reason: 'max_tokens',
        usage: { input_tokens: 1200, output_tokens: 8192 },
      })
    );

    await expect(plan(service())).rejects.toThrow(/8192-token ceiling/);

    // The same prompt against the same ceiling is cut off in the same place.
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('is recorded as what it was, with what it cost', async () => {
    create.mockResolvedValue(
      answer('## Wave 1: Start', { stop_reason: 'max_tokens', usage: { input_tokens: 1200, output_tokens: 8192 } })
    );

    await expect(plan(service())).rejects.toThrow();

    expect((await traces())[0]).toMatchObject({
      outcome: 'error',
      stopReason: 'max_tokens',
      tokensOutput: 8192,
      response: '## Wave 1: Start',
    });
  });

  it('is not reported as a failed API call', async () => {
    create.mockResolvedValue(answer('x', { stop_reason: 'max_tokens' }));
    await expect(plan(service())).rejects.not.toThrow(/Claude API call failed/);
  });
});

/**
 * `1 - criticalPath / tasks` is 0 for one task and for any short chain. Those
 * were sent back to be cut smaller, and a refinement that splits scores higher.
 */
describe('the parallelization gate', () => {
  const generate = (svc: PlanRefinementService) =>
    svc.generateAndRefine('spec', 'title', 'item_1', 'acme/storefront', { workingDir });

  it('does not send back a plan of one task', async () => {
    create.mockResolvedValue(answer(ONE_TASK));

    const result = await generate(service());

    expect(create).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.score.parallelizationScore).toBe(0);
    expect(result.plan.waves[0].tasks).toHaveLength(1);
  });

  it('does not send back three tasks in sequence', async () => {
    create.mockResolvedValue(
      answer(planMarkdown([[{ code: '1.1' }], [{ code: '2.1', deps: ['1.1'] }], [{ code: '3.1', deps: ['2.1'] }]]))
    );
    await generate(service());
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('still sends back a plan with enough tasks to be measured', async () => {
    create.mockResolvedValueOnce(answer(CHAIN_OF_FOUR)).mockResolvedValueOnce(answer(FOUR_SIDE_BY_SIDE));

    const result = await generate(service());

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.score.parallelizationScore).toBe(0.75);
  });

  it('tells the model the threshold it is actually held to', async () => {
    create.mockResolvedValueOnce(answer(CHAIN_OF_FOUR)).mockResolvedValueOnce(answer(FOUR_SIDE_BY_SIDE));

    await generate(service({ minParallelizationScore: 0.3 }));

    const refinementPrompt = create.mock.calls[1][0].messages[0].content as string;
    expect(refinementPrompt).toContain('(Target: 30%)');
    expect(refinementPrompt).not.toContain('80%');
  });

  it('is one size and one threshold wherever it is read', () => {
    expect(MIN_TASKS_FOR_PARALLELIZATION_GATE).toBe(4);
    expect([1, 3, 4].map(parallelizationGateApplies)).toEqual([false, false, true]);
    expect(resolveMinParallelizationScore(undefined, {})).toBe(0.3);
    expect(resolveMinParallelizationScore(undefined, { WAVE_PLANNER_MIN_PARALLELIZATION: '0.5' })).toBe(0.5);
    expect(resolveMinParallelizationScore(0.6, { WAVE_PLANNER_MIN_PARALLELIZATION: '0.5' })).toBe(0.6);
    // Not a ratio: ignored rather than making every plan fail the gate.
    expect(resolveMinParallelizationScore(undefined, { WAVE_PLANNER_MIN_PARALLELIZATION: '70' })).toBe(0.3);
    expect(resolveMinParallelizationScore(undefined, { WAVE_PLANNER_MIN_PARALLELIZATION: 'high' })).toBe(0.3);
  });
});

describe('a persisted plan claims the calls and reviews that led to it', () => {
  async function item() {
    const [row] = await database.db.insert(horizonItems).values({ title: 'Retry the fetcher', repo: 'acme/storefront' }).returning();
    const [parent] = await database.db
      .insert(plans)
      .values({
        horizonItemId: row.id,
        estimatedCostUsd: 0,
        baselineCostUsd: 0,
        acceptanceCriteria: [],
        confidenceSignals: {},
        fleetContextSnapshot: {},
      })
      .returning();
    return { itemId: row.id, planId: parent.id };
  }

  it('links every call since the last plan and marks the one that was chosen', async () => {
    const { itemId, planId } = await item();
    create.mockResolvedValueOnce(answer(CHAIN_OF_FOUR)).mockResolvedValueOnce(answer(FOUR_SIDE_BY_SIDE));
    await recordPlanReview({ itemId, rawMarkdown: FOUR_SIDE_BY_SIDE, action: 'approve', score: 0.75 });

    const generator = new WavePlanGenerator({
      aiClient: { apiKey: 'test', model: 'claude-opus-5', maxTokens: 8192 },
      refinement: { minParallelizationScore: 0.3, maxRefinementIterations: 2 },
    });
    const result = await generator.generate(itemId, planId, 'spec', 'Retry the fetcher', 'acme/storefront', { workingDir });

    const rows = await traces();
    expect(rows.map((r) => [r.kind, r.wavePlanId, r.chosen])).toEqual([
      ['initial', result.wavePlanId, false],
      ['refine', result.wavePlanId, true],
    ]);
    const [review] = await database.db.select().from(plannerReviews);
    expect(review).toMatchObject({ wavePlanId: result.wavePlanId, action: 'approve', planSha: planSha(FOUR_SIDE_BY_SIDE) });
  });

  it('does not take a call that already belongs to an earlier plan', async () => {
    const { itemId, planId } = await item();
    create.mockResolvedValue(answer(FOUR_SIDE_BY_SIDE));
    const generator = new WavePlanGenerator({ aiClient: { apiKey: 'test', model: 'claude-opus-5', maxTokens: 8192 } });

    const first = await generator.generate(itemId, planId, 'spec', 't', 'acme/storefront', { workingDir });
    const second = await generator.generate(itemId, planId, 'spec', 't', 'acme/storefront', { workingDir });

    const rows = await database.db.select().from(plannerTraces).orderBy(plannerTraces.createdAt, plannerTraces.id);
    expect(new Set(rows.map((r) => r.wavePlanId))).toEqual(new Set([first.wavePlanId, second.wavePlanId]));
    expect(rows.filter((r) => r.wavePlanId === first.wavePlanId)).toHaveLength(1);
  });
});

describe('a re-plan is told what happened', () => {
  it('carries the completed work as it was reported, and why a task failed', async () => {
    const wavePlanId = await seedPlan(database.db, [['1.1', '1.2'], ['2.1']]);
    await database.db
      .update(waveTasks)
      .set({
        status: 'completed',
        completionSummary: 'Added retryWithBackoff and wired it into fetchOrders.',
        // The plan had said src/1.1.ts. The task changed something else.
        filesChanged: ['src/fetch/retry.ts'],
      })
      .where(eq(waveTasks.taskCode, '1.1'));
    await database.db
      .update(waveTasks)
      .set({ status: 'failed', errorMessage: 'merge conflict with the run branch in: src/fetch/index.ts' })
      .where(eq(waveTasks.taskCode, '1.2'));
    create.mockResolvedValue(answer(FOUR_SIDE_BY_SIDE));

    const generator = new WavePlanGenerator({ aiClient: { apiKey: 'test', model: 'claude-opus-5', maxTokens: 8192 } });
    await generator.reoptimize(wavePlanId, 'spec', 'Fix checkout', 'acme/storefront', { workingDir });

    const prompt = create.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain('### Completed Work');
    expect(prompt).toContain('Added retryWithBackoff and wired it into fetchOrders.');
    expect(prompt).toContain('Files modified: src/fetch/retry.ts');
    expect(prompt).toContain('### Remaining Work');
    expect(prompt).toContain('merge conflict with the run branch in: src/fetch/index.ts');
    // The call is recorded as what it was.
    expect((await traces())[0].kind).toBe('reoptimize');
  });
});

describe('recording never gets in the way', () => {
  it('records nothing when it is switched off', async () => {
    process.env.DEVPILOT_PLANNER_TRACE = '0';
    create.mockResolvedValue(answer(FOUR_SIDE_BY_SIDE));

    const result = await plan(service());

    expect(result.plan.waves).toHaveLength(1);
    expect(await traces()).toEqual([]);
  });

  it('does not fail a plan when the record cannot be written', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    getSQLiteConnection()!.exec('DROP TABLE planner_traces');
    create.mockResolvedValue(answer(FOUR_SIDE_BY_SIDE));

    const result = await plan(service());
    await plan(service());

    expect(result.score.parallelizationScore).toBe(0.75);
    // Said once, not per call.
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe("a finished run's figures", () => {
  it('are written onto the metrics row the plan was created with', async () => {
    const wavePlanId = await seedPlan(database.db, [['1.1', '1.2']]);
    // What `persistWavePlan` writes for every plan it creates.
    await database.db.insert(wavePlanMetrics).values({ wavePlanId, fileConflictsAvoided: 2 });
    await database.db.update(waveTasks).set({ status: 'completed', startedAt: new Date(Date.now() - 60_000), completedAt: new Date() });

    await collectFinalMetrics(wavePlanId);

    const [row] = await database.db.select().from(wavePlanMetrics);
    expect(row).toMatchObject({ tasksCompleted: 2, tasksFailed: 0, fileConflictsAvoided: 2 });
    expect(row.avgTaskDurationMs).toBeGreaterThan(0);
  });
});
