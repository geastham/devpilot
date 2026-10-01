import { describe, it, expect } from 'vitest';
import { validateDAG } from '../../src/wave-planner/dag-validator';
import type { ParsedTask, ParsedEdge } from '../../src/wave-planner/types';

function task(
  taskCode: string,
  dependencies: string[] = [],
  filePaths: string[] = []
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

function validate(tasks: ParsedTask[]) {
  return validateDAG(tasks, edgesOf(tasks));
}

describe('validateDAG — a well-formed plan', () => {
  it('accepts a diamond with no errors and no warnings', () => {
    const result = validate([
      task('1.1', [], ['src/a.ts']),
      task('2.1', ['1.1'], ['src/b.ts']),
      task('2.2', ['1.1'], ['src/c.ts']),
      task('3.1', ['2.1', '2.2'], ['src/d.ts']),
    ]);

    expect(result).toEqual({
      valid: true,
      errors: [],
      warnings: [],
      correctedPlan: undefined,
    });
  });
});

describe('validateDAG — errors', () => {
  it('rejects an empty plan and stops there', () => {
    const result = validateDAG([], []);

    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.code)).toEqual(['EMPTY_PLAN']);
    expect(result.warnings).toEqual([]);
  });

  it('reports a cycle and names the tasks in it', () => {
    // 1.1 is a legitimate root, so the cycle is the only thing wrong.
    const result = validate([
      task('1.1'),
      task('2.1', ['2.2']),
      task('2.2', ['2.1']),
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.code)).toEqual(['CYCLE_DETECTED']);
    expect(result.errors[0].taskCodes).toEqual(['2.1', '2.2']);
  });

  it('reports a cycle through a task that also depends on a root', () => {
    const result = validate([
      task('1.1'),
      task('2.1', ['1.1', '3.1']),
      task('3.1', ['2.1']),
    ]);

    expect(result.errors.map((e) => e.code)).toEqual(['CYCLE_DETECTED']);
    expect(result.errors[0].taskCodes).toEqual(['2.1', '3.1']);
  });

  it('reports a duplicated task code once, however often it repeats', () => {
    const result = validate([task('1.1'), task('1.1'), task('1.1'), task('1.2')]);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('DUPLICATE_TASK_CODE');
    expect(result.errors[0].taskCodes).toEqual(['1.1']);
  });

  it('reports a plan in which every task has a dependency as having no root', () => {
    // Root detection reads each task's own dependency list, so a task whose
    // only dependency does not exist is still not a root.
    const result = validate([task('2.1', ['1.1']), task('2.2', ['2.1'])]);

    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.code)).toEqual(['NO_ROOT_TASK']);
  });

  it('reports both the cycle and the missing root when the whole plan is a cycle', () => {
    const result = validate([task('1.1', ['1.2']), task('1.2', ['1.1'])]);

    expect(result.errors.map((e) => e.code)).toEqual(['CYCLE_DETECTED', 'NO_ROOT_TASK']);
  });
});

describe('validateDAG — warnings', () => {
  it('reports a dependency on a task that does not exist as a warning, not an error', () => {
    const result = validate([task('1.1'), task('2.1', ['1.1', '9.9'])]);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      {
        code: 'DANGLING_DEPENDENCY',
        message: 'Task 2.1 references non-existent dependencies',
        taskCodes: ['2.1'],
        detail: 'Missing dependencies: 9.9',
      },
    ]);
  });

  it('reports a dangling edge even when no task lists the dependency', () => {
    const result = validateDAG(
      [task('1.1'), task('1.2')],
      [{ from: '9.9', to: '1.2', type: 'hard' }]
    );

    expect(result.valid).toBe(true);
    expect(result.warnings.map((w) => [w.code, w.taskCodes])).toEqual([
      ['DANGLING_DEPENDENCY', ['1.2']],
    ]);
  });

  it('warns when two tasks with the same wave prefix name the same file', () => {
    const result = validate([
      task('1.1', [], ['src/a.ts']),
      task('1.2', [], ['src/a.ts', 'src/b.ts']),
      task('2.1', ['1.1'], ['src/a.ts']),
    ]);

    // 2.1 shares the file too, but its code puts it in a different wave.
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([
      {
        code: 'FILE_OVERLAP_SAME_WAVE',
        message: 'Multiple tasks in wave 1 modify the same file',
        taskCodes: ['1.1', '1.2'],
        detail: 'File "src/a.ts" is modified by tasks: 1.1, 1.2',
      },
    ]);
  });
});

describe('validateDAG — config', () => {
  // Both options are accepted and neither is implemented: auto-correction is a
  // TODO in the validator, and `strictFileOwnership` ("fail on any file
  // overlap", per WavePlannerConfig) is never read. This pins what happens
  // today so that implementing either is a visible change.
  it('ignores enableAutoCorrection and strictFileOwnership', () => {
    const tasks = [task('1.1', [], ['src/a.ts']), task('1.2', [], ['src/a.ts'])];

    const result = validateDAG(tasks, [], {
      enableAutoCorrection: true,
      strictFileOwnership: true,
    });

    expect(result).toEqual(validateDAG(tasks, []));
    expect(result.valid).toBe(true);
    expect(result.correctedPlan).toBeUndefined();
  });
});
