import { describe, it, expect } from 'vitest';
import { scorePlan } from '../../src/wave-planner/plan-scorer';
import { assignWaves } from '../../src/wave-planner/wave-assigner';
import { computeCriticalPath } from '../../src/wave-planner/critical-path';
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

/** Score a plan the way the refinement service does: assign, measure, score. */
function score(tasks: ParsedTask[]) {
  const edges = edgesOf(tasks);
  return scorePlan(
    assignWaves(tasks, edges),
    computeCriticalPath(tasks, edges).length,
    edges,
    tasks
  );
}

/** An assignment with a given number of bumps, for testing the scorer alone. */
function assignmentWith(bumps: number, capacitySplits = 0): WaveAssignmentResult {
  return {
    waves: [],
    totalWaves: 1,
    maxParallelism: 1,
    adjustments: [
      ...Array.from({ length: bumps }, (_, i) => ({
        type: 'FILE_CONFLICT_BUMP' as const,
        taskCode: `1.${i + 2}`,
        fromWave: 0,
        toWave: 1,
        reason: 'File conflict detected with files: src/a.ts',
      })),
      ...Array.from({ length: capacitySplits }, (_, i) => ({
        type: 'CAPACITY_SPLIT' as const,
        taskCode: `1.${i + 2}`,
        fromWave: 0,
        toWave: 1,
        reason: 'Wave split due to capacity constraint (max 1 tasks per wave)',
      })),
    ],
  };
}

describe('scorePlan — parallelizationScore = 1 - criticalPathLength / totalTasks', () => {
  it('scores a four-task diamond at 0.25', () => {
    // Longest chain is 1.1 → 2.x → 3.1: three of four tasks. 1 - 3/4.
    const result = score([
      task('1.1', ['src/a.ts']),
      task('2.1', ['src/b.ts'], ['1.1']),
      task('2.2', ['src/c.ts'], ['1.1']),
      task('3.1', ['src/d.ts'], ['2.1', '2.2']),
    ]);

    expect(result.parallelizationScore).toBe(0.25);
    expect(result.confidenceSignals.parallelization).toBe('LOW');
  });

  it('scores four independent tasks at 0.75', () => {
    // Longest chain is a single task. 1 - 1/4.
    const result = score([
      task('1.1', ['src/a.ts']),
      task('1.2', ['src/b.ts']),
      task('1.3', ['src/c.ts']),
      task('1.4', ['src/d.ts']),
    ]);

    expect(result.parallelizationScore).toBe(0.75);
    expect(result.confidenceSignals.parallelization).toBe('HIGH');
  });

  it('scores a straight chain at zero', () => {
    const result = score([
      task('1.1', ['src/a.ts']),
      task('2.1', ['src/b.ts'], ['1.1']),
      task('3.1', ['src/c.ts'], ['2.1']),
    ]);

    expect(result.parallelizationScore).toBe(0);
  });

  it('scores zero, not one, when the critical path length is zero', () => {
    // A zero-length critical path means it could not be computed (a cycle),
    // which must not read as perfect parallelism.
    const tasks = [task('1.1', []), task('1.2', [])];

    expect(scorePlan(assignmentWith(0), 0, [], tasks).parallelizationScore).toBe(0);
  });

  it('reads the critical path length it is given, not the wave count', () => {
    // Three tasks on one file are forced into three waves, but nothing depends
    // on anything, so the critical path is still one task.
    const result = score([
      task('1.1', ['src/a.ts']),
      task('1.2', ['src/a.ts']),
      task('1.3', ['src/a.ts']),
    ]);

    expect(result.parallelizationScore).toBeCloseTo(2 / 3);
    expect(result.waveEfficiency).toBe(1);
    expect(result.maxParallelism).toBe(1);
  });
});

describe('scorePlan — fileConflictScore = 1 - bumps / file references', () => {
  const sixFileRefs = [
    task('1.1', ['src/a.ts', 'src/b.ts']),
    task('1.2', ['src/c.ts', 'src/d.ts']),
    task('1.3', ['src/e.ts', 'src/f.ts']),
  ];

  it('is 1 when nothing was bumped', () => {
    const result = scorePlan(assignmentWith(0), 1, [], sixFileRefs);

    expect(result.fileConflictScore).toBe(1);
    expect(result.confidenceSignals.conflictRisk).toBe('LOW');
  });

  it('drops by one file reference per bumped task', () => {
    expect(scorePlan(assignmentWith(1), 1, [], sixFileRefs).fileConflictScore).toBeCloseTo(5 / 6);
    expect(scorePlan(assignmentWith(3), 1, [], sixFileRefs).fileConflictScore).toBe(0.5);
  });

  it('maps the score onto conflict risk', () => {
    expect(
      scorePlan(assignmentWith(1), 1, [], sixFileRefs).confidenceSignals.conflictRisk
    ).toBe('MEDIUM');
    expect(
      scorePlan(assignmentWith(3), 1, [], sixFileRefs).confidenceSignals.conflictRisk
    ).toBe('HIGH');
  });

  it('does not count capacity splits as conflicts', () => {
    expect(scorePlan(assignmentWith(0, 4), 1, [], sixFileRefs).fileConflictScore).toBe(1);
  });

  it('never goes below zero', () => {
    const oneFileRef = [task('1.1', ['src/a.ts']), task('1.2', [])];

    expect(scorePlan(assignmentWith(5), 1, [], oneFileRef).fileConflictScore).toBe(0);
  });

  it('is 1 when no task names a file', () => {
    const noFiles = [task('1.1', []), task('1.2', [])];

    expect(scorePlan(assignmentWith(2), 1, [], noFiles).fileConflictScore).toBe(1);
  });

  it('counts the bumps the assigner records for a real conflict', () => {
    // 1.2 is bumped off src/a.ts: one bump over three file references.
    const result = score([
      task('1.1', ['src/a.ts']),
      task('1.2', ['src/a.ts']),
      task('2.1', ['src/b.ts'], ['1.1']),
    ]);

    expect(result.fileConflictScore).toBeCloseTo(2 / 3);
    expect(result.confidenceSignals.conflictRisk).toBe('MEDIUM');
  });
});

describe('scorePlan — the remaining metrics', () => {
  it('reports wave efficiency, peak parallelism and dependency density for a diamond', () => {
    const result = score([
      task('1.1', ['src/a.ts']),
      task('2.1', ['src/b.ts'], ['1.1']),
      task('2.2', ['src/c.ts'], ['1.1']),
      task('3.1', ['src/d.ts'], ['2.1', '2.2']),
    ]);

    expect(result.waveEfficiency).toBeCloseTo(4 / 3); // four tasks, three waves
    expect(result.maxParallelism).toBe(2);
    expect(result.dependencyDensity).toBeCloseTo(4 / 6); // four edges of a possible six
  });

  it('returns the neutral score for an empty plan', () => {
    const empty: WaveAssignmentResult = {
      waves: [],
      totalWaves: 0,
      maxParallelism: 0,
      adjustments: [],
    };

    expect(scorePlan(empty, 0, [], [])).toEqual({
      parallelizationScore: 0,
      maxParallelism: 0,
      waveEfficiency: 0,
      dependencyDensity: 0,
      fileConflictScore: 1,
      confidenceSignals: { parallelization: 'LOW', conflictRisk: 'LOW' },
    });
  });
});
