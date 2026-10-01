import { describe, it, expect } from 'vitest';
import { assignWaves } from '../../src/wave-planner/wave-assigner';
import { scorePlan } from '../../src/wave-planner/plan-scorer';
import type {
  ParsedTask,
  ParsedEdge,
  WaveAssignmentResult,
} from '../../src/wave-planner/types';

function task(
  taskCode: string,
  filePaths: string[],
  dependencies: string[] = []
): ParsedTask {
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

/** Edges exactly as the parser derives them: one hard edge per dependency. */
function edgesOf(tasks: ParsedTask[]): ParsedEdge[] {
  return tasks.flatMap((t) =>
    t.dependencies.map((from) => ({ from, to: t.taskCode, type: 'hard' as const }))
  );
}

function assign(tasks: ParsedTask[], maxTasksPerWave?: number) {
  return assignWaves(tasks, edgesOf(tasks), { maxTasksPerWave });
}

/** Task codes per wave, in order — the shape most assertions care about. */
function layout(result: WaveAssignmentResult): string[][] {
  return result.waves.map((w) => w.tasks.map((t) => t.taskCode));
}

function waveOf(result: WaveAssignmentResult, taskCode: string): number {
  const wave = result.waves.find((w) => w.tasks.some((t) => t.taskCode === taskCode));
  if (!wave) throw new Error(`task ${taskCode} is not in any wave`);
  return wave.waveIndex;
}

/**
 * The two properties every assignment must have, whatever the input: nothing
 * is lost, and no task runs alongside or ahead of something it depends on.
 */
function expectSound(tasks: ParsedTask[], result: WaveAssignmentResult) {
  const placed = result.waves.flatMap((w) => w.tasks.map((t) => t.taskCode));
  expect([...placed].sort()).toEqual(tasks.map((t) => t.taskCode).sort());

  for (const t of tasks) {
    for (const dep of t.dependencies) {
      expect(
        waveOf(result, t.taskCode),
        `${t.taskCode} must run after its dependency ${dep}`
      ).toBeGreaterThan(waveOf(result, dep));
    }
  }

  for (const wave of result.waves) {
    const claimed = new Map<string, string>();
    for (const t of wave.tasks) {
      for (const file of new Set(t.filePaths)) {
        expect(
          claimed.get(file),
          `${file} is claimed twice in wave ${wave.waveIndex}`
        ).toBeUndefined();
        claimed.set(file, t.taskCode);
      }
    }
  }
}

/**
 * Regression: a task bumped for a file conflict was deleted from the plan.
 *
 * `1.1` and `1.2` both list `src/a.ts`; `2.1` depends on `1.1`. The bumped
 * `1.2` was written into the slot for depth 1, and that slot was then
 * overwritten when depth 1 itself was processed. The result had two waves and
 * two tasks. `1.2` was still recorded as an adjustment — "moved to wave 1" —
 * and was in neither wave: never persisted, never dispatched, and nothing said
 * so.
 */
describe('assignWaves — a file-conflict bump must not delete the task', () => {
  const tasks = [
    task('1.1', ['src/a.ts']),
    task('1.2', ['src/a.ts']),
    task('2.1', ['src/b.ts'], ['1.1']),
  ];
  const result = assign(tasks);

  it('keeps all three tasks', () => {
    expect(result.waves.flatMap((w) => w.tasks)).toHaveLength(3);
  });

  it('puts the bumped task in the next wave, beside the unrelated dependent', () => {
    expect(layout(result)).toEqual([['1.1'], ['1.2', '2.1']]);
  });

  it('still records the bump', () => {
    expect(result.adjustments).toEqual([
      {
        type: 'FILE_CONFLICT_BUMP',
        taskCode: '1.2',
        fromWave: 0,
        toWave: 1,
        reason: 'File conflict detected with files: src/a.ts',
      },
    ]);
  });

  it('reports the metrics of the waves it actually returned', () => {
    expect(result.totalWaves).toBe(2);
    expect(result.maxParallelism).toBe(2);
  });
});

describe('assignWaves — a file conflict is an ordering constraint', () => {
  it('pushes the dependent of a bumped task after it', () => {
    // 2.1 has depth 1, which is exactly where its dependency 1.2 lands once
    // bumped. Left at its own depth it would run beside the work it needs.
    const tasks = [
      task('1.1', ['src/a.ts']),
      task('1.2', ['src/a.ts']),
      task('2.1', ['src/b.ts'], ['1.2']),
    ];
    const result = assign(tasks);

    expect(layout(result)).toEqual([['1.1'], ['1.2'], ['2.1']]);
    expectSound(tasks, result);
  });

  it('pushes transitive dependents too', () => {
    const tasks = [
      task('1.1', ['src/a.ts']),
      task('1.2', ['src/a.ts']),
      task('2.1', ['src/b.ts'], ['1.2']),
      task('3.1', ['src/c.ts'], ['2.1']),
    ];
    const result = assign(tasks);

    expect(layout(result)).toEqual([['1.1'], ['1.2'], ['2.1'], ['3.1']]);
    expectSound(tasks, result);
  });

  it('records a bump only for the task that had the conflict, not for dependents carried along', () => {
    // The scorer counts FILE_CONFLICT_BUMP rows as conflicts. 2.1 moved because
    // its dependency moved; it conflicts with nothing.
    const tasks = [
      task('1.1', ['src/a.ts']),
      task('1.2', ['src/a.ts']),
      task('2.1', ['src/b.ts'], ['1.2']),
    ];

    expect(assign(tasks).adjustments.map((a) => a.taskCode)).toEqual(['1.2']);
  });

  it('spreads three tasks claiming one file over three successive waves', () => {
    const tasks = [
      task('1.1', ['src/a.ts']),
      task('1.2', ['src/a.ts']),
      task('1.3', ['src/a.ts']),
    ];
    const result = assign(tasks);

    expect(layout(result)).toEqual([['1.1'], ['1.2'], ['1.3']]);
    expect(result.adjustments).toEqual([
      {
        type: 'FILE_CONFLICT_BUMP',
        taskCode: '1.2',
        fromWave: 0,
        toWave: 1,
        reason: 'File conflict detected with files: src/a.ts',
      },
      {
        type: 'FILE_CONFLICT_BUMP',
        taskCode: '1.3',
        fromWave: 0,
        toWave: 2,
        reason: 'File conflict detected with files: src/a.ts',
      },
    ]);
  });

  it('leaves a dependency chain over one file alone — it is already sequential', () => {
    const tasks = [
      task('1.1', ['src/a.ts']),
      task('2.1', ['src/a.ts'], ['1.1']),
      task('3.1', ['src/a.ts'], ['2.1']),
    ];
    const result = assign(tasks);

    expect(layout(result)).toEqual([['1.1'], ['2.1'], ['3.1']]);
    expect(result.adjustments).toEqual([]);
  });

  it('bumps the later task in input order, whatever the task codes say', () => {
    const tasks = [task('1.2', ['src/a.ts']), task('1.1', ['src/a.ts'])];

    expect(layout(assign(tasks))).toEqual([['1.2'], ['1.1']]);
  });

  it('checks a bumped task against the wave it lands in', () => {
    // 1.2 is bumped out of wave 0 into wave 1, where 2.1 wants the same file.
    // The shallower task is placed first, so 2.1 is the one that moves on.
    const tasks = [
      task('1.1', ['src/a.ts']),
      task('1.2', ['src/a.ts']),
      task('2.1', ['src/a.ts'], ['1.1']),
    ];
    const result = assign(tasks);

    expect(layout(result)).toEqual([['1.1'], ['1.2'], ['2.1']]);
    expectSound(tasks, result);
  });

  it('does not treat a file a task lists twice as a conflict with itself', () => {
    const result = assign([task('1.1', ['src/a.ts', 'src/a.ts'])]);

    expect(layout(result)).toEqual([['1.1']]);
    expect(result.adjustments).toEqual([]);
  });
});

describe('assignWaves — plans with no conflicts', () => {
  it('keeps two independent tasks with disjoint files in the same wave', () => {
    const result = assign([task('1.1', ['src/a.ts']), task('1.2', ['src/b.ts'])]);

    expect(layout(result)).toEqual([['1.1', '1.2']]);
    expect(result.adjustments).toEqual([]);
    expect(result.maxParallelism).toBe(2);
  });

  it('keeps tasks that name no files in the same wave', () => {
    expect(layout(assign([task('1.1', []), task('1.2', [])]))).toEqual([['1.1', '1.2']]);
  });

  it('assigns a diamond exactly as it did before conflicts cascaded', () => {
    // Expected value captured from the implementation as it stood before the
    // conflict fix: depth-based waves, input order within a wave.
    const tasks = [
      task('1.1', ['src/a.ts']),
      task('2.1', ['src/b.ts'], ['1.1']),
      task('2.2', ['src/c.ts'], ['1.1']),
      task('3.1', ['src/d.ts'], ['2.1', '2.2']),
    ];
    const result = assign(tasks);

    expect(
      result.waves.map((w) => ({
        waveIndex: w.waveIndex,
        label: w.label,
        tasks: w.tasks.map((t) => t.taskCode),
      }))
    ).toEqual([
      { waveIndex: 0, label: 'Wave 1: Task', tasks: ['1.1'] },
      { waveIndex: 1, label: 'Wave 2: Task', tasks: ['2.1', '2.2'] },
      { waveIndex: 2, label: 'Wave 3: Task', tasks: ['3.1'] },
    ]);
    expect(result.totalWaves).toBe(3);
    expect(result.maxParallelism).toBe(2);
    expect(result.adjustments).toEqual([]);
  });

  it('returns the same task objects it was given', () => {
    const tasks = [task('1.1', ['src/a.ts']), task('2.1', ['src/b.ts'], ['1.1'])];
    const result = assign(tasks);

    expect(result.waves[0].tasks[0]).toBe(tasks[0]);
    expect(result.waves[1].tasks[0]).toBe(tasks[1]);
  });
});

describe('assignWaves — a larger mixed plan', () => {
  // Three roots fighting over one file, a fan-out, a second contested file
  // deeper in, a task with no files, and one with no relation to anything.
  const tasks = [
    task('1.1', ['src/schema.ts']),
    task('1.2', ['src/schema.ts', 'src/types.ts']),
    task('1.3', ['src/schema.ts']),
    task('1.4', ['docs/readme.md']),
    task('2.1', ['src/api.ts'], ['1.1']),
    task('2.2', ['src/api.ts'], ['1.2']),
    task('2.3', ['src/ui.tsx'], ['1.1', '1.3']),
    task('2.4', [], ['1.4']),
    task('3.1', ['src/api.ts', 'src/ui.tsx'], ['2.1', '2.3']),
    task('3.2', ['tests/api.test.ts'], ['2.2']),
    task('4.1', ['src/index.ts'], ['3.1', '3.2']),
  ];

  it('places every task exactly once, after its dependencies, with no shared file in a wave', () => {
    const result = assign(tasks);

    expect(result.waves.flatMap((w) => w.tasks)).toHaveLength(tasks.length);
    expectSound(tasks, result);
  });

  it('numbers waves contiguously from zero and leaves none empty', () => {
    const result = assign(tasks);

    expect(result.waves.map((w) => w.waveIndex)).toEqual(result.waves.map((_, i) => i));
    expect(result.waves.every((w) => w.tasks.length > 0)).toBe(true);
    expect(result.totalWaves).toBe(result.waves.length);
  });

  it('stays sound when a capacity limit splits the waves further', () => {
    const result = assign(tasks, 2);

    expect(result.waves.every((w) => w.tasks.length <= 2)).toBe(true);
    expectSound(tasks, result);
  });

  it('is deterministic — the same input twice gives an identical result', () => {
    expect(assign(tasks)).toEqual(assign(tasks));
    expect(assign(tasks, 2)).toEqual(assign(tasks, 2));
  });

  it('does not mutate its input', () => {
    const before = JSON.stringify(tasks);
    assign(tasks, 2);

    expect(JSON.stringify(tasks)).toBe(before);
  });
});

describe('assignWaves — edges of the input', () => {
  it('returns an empty assignment for an empty plan', () => {
    expect(assignWaves([], [])).toEqual({
      waves: [],
      totalWaves: 0,
      maxParallelism: 0,
      adjustments: [],
    });
  });

  it('throws on a dependency cycle, naming the tasks in it', () => {
    const tasks = [task('1.1', [], ['1.2']), task('1.2', [], ['1.1'])];

    expect(() => assign(tasks)).toThrow(/cycle detected.*1\.1.*1\.2/);
  });

  it('keeps both rows when a task code is duplicated', () => {
    // validateDAG rejects this plan, but assignWaves is also called on plans
    // nobody validated first, and a duplicate must not trip the count check.
    const tasks = [
      task('1.1', ['src/a.ts']),
      task('1.1', ['src/b.ts']),
      task('2.1', ['src/c.ts'], ['1.1']),
    ];

    expect(layout(assign(tasks))).toEqual([['1.1', '1.1'], ['2.1']]);
  });
});

describe('assignWaves → scorePlan', () => {
  it('the scorer still sees the bumps', () => {
    const tasks = [
      task('1.1', ['src/a.ts']),
      task('1.2', ['src/a.ts']),
      task('1.3', ['src/a.ts']),
      task('2.1', ['src/b.ts'], ['1.2']),
    ];
    const assignment = assign(tasks);
    const score = scorePlan(assignment, 2, edgesOf(tasks), tasks);

    // Two bumped tasks (1.2, 1.3) over four file references.
    expect(score.fileConflictScore).toBe(0.5);
    expect(score.confidenceSignals.conflictRisk).toBe('HIGH');
  });
});
