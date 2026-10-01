import { describe, it, expect } from 'vitest';
import { computeCriticalPath } from '../../src/wave-planner/critical-path';
import type { ParsedTask, ParsedEdge } from '../../src/wave-planner/types';

function task(
  taskCode: string,
  dependencies: string[] = [],
  complexity: ParsedTask['complexity'] = 'M'
): ParsedTask {
  return {
    taskCode,
    description: `Task ${taskCode}`,
    filePaths: [],
    dependencies,
    canRunInParallel: true,
    recommendedModel: 'sonnet',
    complexity,
  };
}

/** Edges exactly as the parser derives them: one hard edge per dependency. */
function edgesOf(tasks: ParsedTask[]): ParsedEdge[] {
  return tasks.flatMap((t) =>
    t.dependencies.map((from) => ({ from, to: t.taskCode, type: 'hard' as const }))
  );
}

function criticalPath(tasks: ParsedTask[]) {
  return computeCriticalPath(tasks, edgesOf(tasks));
}

describe('computeCriticalPath — the longest chain', () => {
  it('follows the longer arm of a lopsided diamond', () => {
    //        ┌─ 2.1 ── 3.1 ─┐
    //  1.1 ──┤              ├── 4.1
    //        └──── 2.2 ─────┘
    const result = criticalPath([
      task('1.1'),
      task('2.1', ['1.1']),
      task('2.2', ['1.1']),
      task('3.1', ['2.1']),
      task('4.1', ['3.1', '2.2']),
    ]);

    expect(result.path).toEqual(['1.1', '2.1', '3.1', '4.1']);
    expect(result.length).toBe(4);
  });

  it('gives the short arm the slack it has, and the long arm none', () => {
    const { annotations } = criticalPath([
      task('1.1'),
      task('2.1', ['1.1']),
      task('2.2', ['1.1']),
      task('3.1', ['2.1']),
      task('4.1', ['3.1', '2.2']),
    ]);

    expect(annotations.get('2.2')).toEqual({
      taskCode: '2.2',
      isOnCriticalPath: false,
      distanceFromRoot: 1,
      distanceToEnd: 1,
      slack: 1,
    });
    expect(annotations.get('2.1')).toEqual({
      taskCode: '2.1',
      isOnCriticalPath: true,
      distanceFromRoot: 1,
      distanceToEnd: 2,
      slack: 0,
    });
    expect(annotations.get('1.1')?.distanceToEnd).toBe(3);
    expect(annotations.get('4.1')?.distanceFromRoot).toBe(3);
  });

  it('picks one arm of a symmetric diamond and reports a length of three', () => {
    const result = criticalPath([
      task('1.1'),
      task('2.1', ['1.1']),
      task('2.2', ['1.1']),
      task('3.1', ['2.1', '2.2']),
    ]);

    // Both arms are equally long. Ties go to the dependency listed last, so
    // the path runs through 2.2 — and 2.1, with no slack either, is still
    // marked as off the critical path because only one path is returned.
    expect(result.path).toEqual(['1.1', '2.2', '3.1']);
    expect(result.length).toBe(3);
    expect(result.annotations.get('2.1')).toMatchObject({
      isOnCriticalPath: false,
      slack: 0,
    });
  });
});

describe('computeCriticalPath — every task weighs one', () => {
  it('counts tasks, not complexity: three small tasks outlast two extra-large ones', () => {
    const result = criticalPath([
      task('1.1', [], 'XL'),
      task('2.1', ['1.1'], 'XL'),
      task('1.2', [], 'S'),
      task('2.2', ['1.2'], 'S'),
      task('3.2', ['2.2'], 'S'),
    ]);

    expect(result.path).toEqual(['1.2', '2.2', '3.2']);
    expect(result.length).toBe(3);
  });

  it('reports a length equal to the number of tasks for a straight chain', () => {
    const result = criticalPath([task('1.1'), task('2.1', ['1.1']), task('3.1', ['2.1'])]);

    expect(result.path).toEqual(['1.1', '2.1', '3.1']);
    expect(result.length).toBe(3);
  });

  it('reports a length of one when nothing depends on anything', () => {
    const result = criticalPath([task('1.1'), task('1.2'), task('1.3')]);

    expect(result.path).toEqual(['1.1']);
    expect(result.length).toBe(1);
    expect([...result.annotations.values()].map((a) => a.slack)).toEqual([0, 0, 0]);
  });
});

describe('computeCriticalPath — edges of the input', () => {
  it('returns an empty path for an empty plan', () => {
    const result = computeCriticalPath([], []);

    expect(result.path).toEqual([]);
    expect(result.length).toBe(0);
    expect(result.annotations.size).toBe(0);
  });

  it('returns an empty path, with every task annotated, when there is a cycle', () => {
    const result = criticalPath([task('1.1', ['1.2']), task('1.2', ['1.1'])]);

    expect(result.path).toEqual([]);
    expect(result.length).toBe(0);
    expect([...result.annotations.keys()]).toEqual(['1.1', '1.2']);
    expect(result.annotations.get('1.1')?.isOnCriticalPath).toBe(false);
  });

  it('ignores an edge whose endpoint is not a task', () => {
    const result = computeCriticalPath(
      [task('1.1'), task('2.1', ['1.1'])],
      [
        { from: '1.1', to: '2.1', type: 'hard' },
        { from: '9.9', to: '2.1', type: 'hard' },
      ]
    );

    expect(result.path).toEqual(['1.1', '2.1']);
  });
});
