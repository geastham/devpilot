import { describe, it, expect } from 'vitest';
import {
  PLANNER_EPISODE_SCHEMA,
  buildEpisodes,
  planOutcome,
  redactEpisode,
  summarizeCorpus,
  type EpisodeCall,
  type EpisodePlan,
  type EpisodeTask,
} from '../../src/wave-planner/planner-corpus';

/**
 * How a plan's outcome is worked out from its task rows, and how calls,
 * reviews and plans become episodes. Every figure here is one a planner will
 * be judged by, so each is pinned to what it counts and what it leaves out.
 */

const T0 = Date.parse('2026-10-01T10:00:00.000Z');
const MIN = 60_000;

const task = (taskCode: string, over: Partial<EpisodeTask> = {}): EpisodeTask => ({
  taskCode,
  waveIndex: 0,
  description: `Do ${taskCode}`,
  filePaths: [`src/${taskCode}.ts`],
  dependencies: [],
  complexity: 'M',
  recommendedModel: 'SONNET',
  status: 'completed',
  attempts: 1,
  error: null,
  summary: `Did ${taskCode}`,
  filesChanged: [`src/${taskCode}.ts`],
  startedAt: T0,
  completedAt: T0 + 10 * MIN,
  merged: true,
  costUsd: 1,
  tokens: 1000,
  ...over,
});

const plan = (tasks: EpisodeTask[], over: Partial<EpisodePlan> = {}): EpisodePlan => ({
  wavePlanId: 'wp_1',
  status: 'completed',
  failureReason: null,
  version: 1,
  totalWaves: 1,
  totalTasks: tasks.length,
  criticalPathLength: 1,
  parallelizationScore: 0.5,
  isolated: true,
  adjustments: {},
  codeGraphUsed: false,
  createdAt: T0 - MIN,
  startedAt: T0,
  completedAt: T0 + 20 * MIN,
  tasks,
  ...over,
});

const call = (over: Partial<EpisodeCall> = {}): EpisodeCall => ({
  step: 0,
  kind: 'initial',
  at: '2026-10-01T09:59:00.000Z',
  template: 'default',
  templateVersion: '1.0.0',
  modelRequested: 'claude-opus-5',
  model: 'claude-opus-5-20260101',
  prompt: 'the spec, and src/checkout/total.ts in the file tree',
  response: '## Wave 1 …',
  outcome: 'valid',
  errors: [],
  warnings: [],
  taskCount: 2,
  score: 0.5,
  previousScore: null,
  improved: null,
  chosen: true,
  stopReason: 'end_turn',
  tokensInput: 1200,
  tokensOutput: 900,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  durationMs: 20_000,
  constraints: [],
  ...over,
});

describe('how a plan ran', () => {
  it('counts a clean run', () => {
    const outcome = planOutcome(plan([task('1.1'), task('1.2')]));
    expect(outcome).toMatchObject({
      ended: 'completed',
      tasks: { total: 2, dispatched: 2, completed: 2, failed: 0, skipped: 0, retried: 0, conflicted: 0 },
      firstAttemptPassRate: 1,
      sameWaveCollisions: 0,
      wallClockMs: 10 * MIN,
      costUsd: 2,
      tokens: 2000,
    });
    expect(outcome.files).toMatchObject({ tasksMeasured: 2, precision: 1, recall: 1 });
  });

  it('does not count a task that passed on its second attempt as passing first time', () => {
    const outcome = planOutcome(plan([task('1.1'), task('1.2', { attempts: 2 })]));
    expect(outcome.firstAttemptPassRate).toBe(0.5);
    expect(outcome.tasks.retried).toBe(1);
    expect(outcome.tasks.completed).toBe(2);
  });

  it('counts a failed task against the first-attempt rate, and a merge conflict as one', () => {
    const outcome = planOutcome(
      plan(
        [
          task('1.1'),
          task('1.2', {
            status: 'failed',
            attempts: 2,
            error: 'merge conflict with the run branch in: src/a.ts',
            filesChanged: ['src/a.ts'],
          }),
          // Never dispatched: the run ended before it.
          task('2.1', { waveIndex: 1, status: 'skipped', startedAt: null, completedAt: null, filesChanged: null, costUsd: null, tokens: null }),
        ],
        { status: 'failed' }
      )
    );
    expect(outcome.ended).toBe('failed');
    expect(outcome.tasks).toMatchObject({ dispatched: 2, completed: 1, failed: 1, skipped: 1, conflicted: 1 });
    // Of the two that were dispatched and ended, one passed first time.
    expect(outcome.firstAttemptPassRate).toBe(0.5);
  });

  /** The prediction every conflict check rests on. */
  it('measures how well the plan predicted the files each task touched', () => {
    const outcome = planOutcome(
      plan([
        // Named one file, changed it and one more: the plan missed a file.
        task('1.1', { filePaths: ['src/a.ts'], filesChanged: ['src/a.ts', 'src/b.ts'] }),
        // Named two, changed one: the plan named a file that was not touched.
        task('1.2', { filePaths: ['src/c.ts', 'src/d.ts'], filesChanged: ['./src/c.ts'] }),
      ])
    );
    expect(outcome.files).toEqual({
      tasksMeasured: 2,
      planned: 3,
      changed: 3,
      both: 2,
      precision: 2 / 3,
      recall: 2 / 3,
    });
  });

  it('leaves a task out of the file figures when nothing recorded what it changed', () => {
    const outcome = planOutcome(plan([task('1.1'), task('1.2', { filesChanged: null })]));
    expect(outcome.files!.tasksMeasured).toBe(1);
    // And says nothing at all when no task recorded its changes.
    expect(planOutcome(plan([task('1.1', { filesChanged: null })])).files).toBeNull();
  });

  it('counts a task that changed nothing as measured, not as unrecorded', () => {
    const outcome = planOutcome(plan([task('1.1', { filesChanged: [] })]));
    expect(outcome.files).toMatchObject({ tasksMeasured: 1, planned: 1, changed: 0, precision: 0, recall: null });
  });

  it('finds two tasks in one wave that changed the same file, from what was changed', () => {
    const outcome = planOutcome(
      plan([
        // The plan named different files. The tasks did not keep to it.
        task('1.1', { filePaths: ['src/a.ts'], filesChanged: ['src/a.ts', 'src/shared.ts'] }),
        task('1.2', { filePaths: ['src/b.ts'], filesChanged: ['src/b.ts', 'src/shared.ts'] }),
        // Same file again, a wave later: not a collision.
        task('2.1', { waveIndex: 1, filesChanged: ['src/shared.ts'] }),
      ])
    );
    expect(outcome.sameWaveCollisions).toBe(1);
  });

  it('says a plan that never dispatched was not run, and one in flight is running', () => {
    const idle = task('1.1', { status: 'pending', startedAt: null, completedAt: null, filesChanged: null, costUsd: null, tokens: null });
    expect(planOutcome(plan([idle], { status: 'approved' }))).toMatchObject({
      ended: 'not-run',
      firstAttemptPassRate: null,
      wallClockMs: null,
      costUsd: null,
    });
    const running = task('1.1', { status: 'running', completedAt: null, filesChanged: null, costUsd: null, tokens: null });
    expect(planOutcome(plan([running], { status: 'executing' })).ended).toBe('running');
  });
});

describe('episodes', () => {
  const wp = { ...plan([task('1.1')]), itemId: 'item_1', repo: 'acme/storefront' };

  it('joins a plan to the calls and reviews that led to it, in order', () => {
    const [episode] = buildEpisodes({
      plans: [wp],
      calls: [
        { ...call({ step: 1, kind: 'refine', at: '2026-10-01T09:59:30.000Z' }), itemId: 'item_1', repo: 'acme/storefront', wavePlanId: 'wp_1' },
        { ...call({ chosen: false }), itemId: 'item_1', repo: 'acme/storefront', wavePlanId: 'wp_1' },
      ],
      reviews: [{ at: '2026-10-01T09:59:45.000Z', action: 'approve', constraints: [], reason: null, score: 0.5, itemId: 'item_1', wavePlanId: 'wp_1' }],
    });
    expect(episode.schema).toBe(PLANNER_EPISODE_SCHEMA);
    expect(episode.calls.map((c) => c.kind)).toEqual(['initial', 'refine']);
    expect(episode.reviews).toHaveLength(1);
    expect(episode.plan!.wavePlanId).toBe('wp_1');
    expect(episode.outcome!.ended).toBe('completed');
    // The join keys are not repeated inside the rows.
    expect(episode.calls[0]).not.toHaveProperty('wavePlanId');
    expect(episode.plan).not.toHaveProperty('itemId');
  });

  it('keeps a plan made before calls were recorded: its outcome is real', () => {
    const [episode] = buildEpisodes({ plans: [wp], calls: [], reviews: [] });
    expect(episode.calls).toEqual([]);
    expect(episode.outcome!.tasks.completed).toBe(1);
  });

  it('keeps a run that never produced a plan, as one episode with no outcome', () => {
    const episodes = buildEpisodes({
      plans: [],
      calls: [{ ...call({ outcome: 'error', response: null, chosen: false }), itemId: 'item_9', repo: 'acme/storefront', wavePlanId: null }],
      reviews: [{ at: '2026-10-01T10:05:00.000Z', action: 'abort', constraints: [], reason: 'wrong repo', score: null, itemId: 'item_9', wavePlanId: null }],
    });
    expect(episodes).toHaveLength(1);
    expect(episodes[0]).toMatchObject({ itemId: 'item_9', plan: null, outcome: null });
    expect(episodes[0].reviews[0].action).toBe('abort');
  });

  it('is newest first', () => {
    const older = { ...plan([task('1.1')], { wavePlanId: 'wp_old', createdAt: T0 - 60 * MIN }), itemId: 'item_0', repo: 'acme/storefront' };
    const episodes = buildEpisodes({ plans: [older, wp], calls: [], reviews: [] });
    expect(episodes.map((e) => e.plan!.wavePlanId)).toEqual(['wp_1', 'wp_old']);
  });
});

describe('an episode with the text taken out', () => {
  const [episode] = buildEpisodes({
    plans: [
      {
        ...plan([
          task('1.1', { filePaths: ['src/checkout/total.ts'], filesChanged: ['src/checkout/total.ts', 'src/checkout/tax.ts'] }),
          task('1.2', { status: 'failed', error: 'merge conflict with the run branch in: src/checkout/total.ts' }),
          task('1.3', { status: 'failed', error: 'TypeError: SECRET_NAME is not defined' }),
        ], { failureReason: 'task 1.3 failed: TypeError: SECRET_NAME is not defined' }),
        itemId: 'item_1',
        repo: 'acme/storefront',
      },
    ],
    calls: [{ ...call({ constraints: ['do not touch src/db'], errors: ['Task 2.1 references src/db'] }), itemId: 'item_1', repo: 'acme/storefront', wavePlanId: 'wp_1' }],
    reviews: [{ at: '2026-10-01T09:59:45.000Z', action: 'refine', constraints: ['split the tax change out'], reason: null, score: 0.5, itemId: 'item_1', wavePlanId: 'wp_1' }],
  });
  const redacted = redactEpisode(episode);
  const text = JSON.stringify(redacted);

  it('holds no prompt, plan, description, summary, constraint, error or path', () => {
    for (const secret of ['checkout', 'total.ts', 'tax', 'src/', 'the spec', 'Wave 1', 'do not touch', 'split the', 'SECRET_NAME', 'Do 1.1', 'Did 1.1', 'acme']) {
      expect(text, `leaked: ${secret}`).not.toContain(secret);
    }
    expect(redacted.calls[0].prompt).toBeNull();
    expect(redacted.calls[0].response).toBeNull();
    expect(redacted.repo).toBeNull();
  });

  it('keeps every count and figure', () => {
    expect(redacted.calls[0]).toMatchObject({ tokensInput: 1200, score: 0.5, outcome: 'valid', template: 'default' });
    expect(redacted.calls[0].constraints).toHaveLength(1);
    expect(redacted.reviews[0]).toMatchObject({ action: 'refine' });
    expect(redacted.reviews[0].constraints).toHaveLength(1);
    expect(redacted.plan!.tasks[0].filePaths).toHaveLength(1);
    expect(redacted.plan!.tasks[0].filesChanged).toHaveLength(2);
    // That a task ended in a merge conflict is a figure, not a text.
    expect(redacted.plan!.tasks[1].error).toBe('merge conflict');
    expect(redacted.plan!.tasks[2].error).toBe('[removed]');
    expect(redacted.outcome).toEqual(episode.outcome);
  });

  it('does not change the episode it was given', () => {
    expect(episode.calls[0].prompt).toContain('the spec');
    expect(episode.plan!.tasks[0].filePaths).toEqual(['src/checkout/total.ts']);
  });
});

describe('a corpus at a glance', () => {
  it('pools figures over runs rather than averaging them', () => {
    const big = { ...plan(Array.from({ length: 9 }, (_, i) => task(`1.${i + 1}`)), { wavePlanId: 'wp_big' }), itemId: 'a', repo: 'r' };
    const small = { ...plan([task('1.1', { status: 'failed', attempts: 2 })], { wavePlanId: 'wp_small', status: 'failed' }), itemId: 'b', repo: 'r' };
    const episodes = buildEpisodes({
      plans: [big, small],
      calls: [
        { ...call(), itemId: 'a', repo: 'r', wavePlanId: 'wp_big' },
        { ...call({ kind: 'refine', improved: true, chosen: false }), itemId: 'a', repo: 'r', wavePlanId: 'wp_big' },
        { ...call({ kind: 'refine', improved: false, chosen: false }), itemId: 'a', repo: 'r', wavePlanId: 'wp_big' },
        { ...call({ outcome: 'error', stopReason: 'max_tokens', chosen: false }), itemId: 'b', repo: 'r', wavePlanId: 'wp_small' },
      ],
      reviews: [{ at: '2026-10-01T09:59:45.000Z', action: 'approve', constraints: [], reason: null, score: 0.5, itemId: 'a', wavePlanId: 'wp_big' }],
    });

    expect(summarizeCorpus(episodes)).toMatchObject({
      episodes: 2,
      withPlan: 2,
      ended: 2,
      calls: 4,
      callOutcomes: { valid: 3, error: 1 },
      refinements: 2,
      refinementsImproved: 1,
      truncated: 1,
      reviews: { approve: 1 },
      tokensInput: 4800,
      // Nine of ten tasks, not the mean of 100% and 0%.
      firstAttemptPassRate: 0.9,
    });
  });

  it('says nothing was measured rather than reporting zero', () => {
    expect(summarizeCorpus([])).toMatchObject({ episodes: 0, firstAttemptPassRate: null, filePrecision: null, fileRecall: null });
  });
});
