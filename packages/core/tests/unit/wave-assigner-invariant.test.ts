import { describe, it, expect, vi } from 'vitest';
import type { ParsedTask } from '../../src/wave-planner/types';

/**
 * `assignWaves` ends with a check that every task it was given is in a wave.
 * With the assigner working, nothing reachable through its arguments can trip
 * that check — which is the point of it, and also why it would otherwise go
 * untested until the day it is needed.
 *
 * So this file breaks the assigner from the inside. `generateWaveLabel` is
 * handed the very array that becomes a wave's task list; the mock below can be
 * told to drop or repeat a task while labelling, standing in for a future
 * regression in any step of the assignment. It lives in its own file because
 * `vi.mock` applies to every test in the file it appears in.
 */
const sabotage = vi.hoisted(() => ({ mode: 'none' as 'none' | 'drop' | 'repeat' }));

vi.mock('../../src/wave-planner/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/wave-planner/utils')>();
  return {
    ...actual,
    generateWaveLabel: (index: number, tasks: ParsedTask[], subIndex?: number) => {
      const label = actual.generateWaveLabel(index, tasks, subIndex);
      if (sabotage.mode === 'drop' && index === 0) tasks.pop();
      if (sabotage.mode === 'repeat' && index === 0) tasks.push(tasks[0]);
      return label;
    },
  };
});

import { assignWaves } from '../../src/wave-planner/wave-assigner';

function task(taskCode: string, dependencies: string[] = []): ParsedTask {
  return {
    taskCode,
    description: `Task ${taskCode}`,
    filePaths: [],
    dependencies,
    canRunInParallel: true,
    recommendedModel: 'sonnet',
    complexity: 'M',
  };
}

const tasks = () => [task('1.1'), task('1.2'), task('2.1', ['1.1'])];
const edges = [{ from: '1.1', to: '2.1', type: 'hard' as const }];

describe('assignWaves — the every-task-is-assigned check', () => {
  it('passes untouched input through', () => {
    sabotage.mode = 'none';

    expect(assignWaves(tasks(), edges).waves.flatMap((w) => w.tasks)).toHaveLength(3);
  });

  it('throws, naming the task, when one goes missing', () => {
    sabotage.mode = 'drop';

    expect(() => assignWaves(tasks(), edges)).toThrow(
      'Wave assignment is inconsistent: 3 tasks were supplied but 2 were assigned ' +
        'across 2 waves (missing from every wave: 1.2). ' +
        'Refusing to return a plan that drops or repeats work.'
    );
  });

  it('throws when a task is assigned twice', () => {
    sabotage.mode = 'repeat';

    expect(() => assignWaves(tasks(), edges)).toThrow(
      /3 tasks were supplied but 4 were assigned.*assigned more often than supplied: 1\.1/
    );
  });
});
