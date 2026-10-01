import { describe, it, expect } from 'vitest';
import { waveTaskStatusValues } from '../../src/db/schema/enums';
import {
  DISPATCHABLE_WAVE_TASK_STATUSES,
  IN_FLIGHT_WAVE_TASK_STATUSES,
  TERMINAL_WAVE_TASK_STATUSES,
  compareTaskCodes,
  isTerminalWaveTaskStatus,
  isWaveOver,
  readWaveSignal,
} from '../../src/wave-planner/execution/wave-state';

/**
 * The one definition of "is this wave over, and what should its driver do".
 *
 * It exists because the answer used to be given by several lists that
 * disagreed: the Next app's resume bridge did not count `skipped` as terminal,
 * so a wave the controller had finished (one task failed, the rest skipped) was
 * a wave the conductor graph was never woken for.
 */

const task = (taskCode: string, status: string, errorMessage: string | null = null) => ({
  taskCode,
  status,
  errorMessage,
});

describe('wave task statuses', () => {
  it('classifies every status exactly once', () => {
    const classified = [
      ...TERMINAL_WAVE_TASK_STATUSES,
      ...IN_FLIGHT_WAVE_TASK_STATUSES,
      ...DISPATCHABLE_WAVE_TASK_STATUSES,
    ];
    expect([...classified].sort()).toEqual([...waveTaskStatusValues].sort());
  });

  it('counts skipped as terminal, and does not know a status called cancelled', () => {
    expect(isTerminalWaveTaskStatus('skipped')).toBe(true);
    expect(isTerminalWaveTaskStatus('completed')).toBe(true);
    expect(isTerminalWaveTaskStatus('failed')).toBe(true);
    expect(isTerminalWaveTaskStatus('retrying')).toBe(false);
    expect(isTerminalWaveTaskStatus('cancelled')).toBe(false);
  });
});

describe('isWaveOver', () => {
  it('is over only when every task is terminal', () => {
    expect(isWaveOver([task('1.1', 'completed'), task('1.2', 'failed'), task('1.3', 'skipped')])).toBe(true);
    expect(isWaveOver([task('1.1', 'completed'), task('1.2', 'running')])).toBe(false);
    expect(isWaveOver([task('1.1', 'completed'), task('1.2', 'retrying')])).toBe(false);
    expect(isWaveOver([task('1.1', 'completed'), task('1.2', 'pending')])).toBe(false);
  });

  it('treats a wave with no tasks as over, not as a wait nothing can end', () => {
    expect(isWaveOver([])).toBe(true);
  });
});

describe('readWaveSignal', () => {
  const executing = { status: 'executing' };

  it('is complete when every task completed', () => {
    expect(readWaveSignal(executing, [task('1.1', 'completed'), task('1.2', 'completed')], 4)).toEqual({
      kind: 'over',
      outcome: { state: 'complete' },
    });
  });

  it('is failed, naming each task that did not complete, when the wave ended otherwise', () => {
    // `continue` policy: the plan carries on, the wave still failed.
    expect(
      readWaveSignal(executing, [task('1.1', 'completed'), task('1.2', 'failed', 'tests failed')], 4)
    ).toEqual({
      kind: 'over',
      outcome: { state: 'failed', failures: [{ taskCode: '1.2', error: 'tests failed' }] },
    });
  });

  it('is over the moment the plan is failed, even with a sibling still running', () => {
    // The exact rows a task failing its retry leaves behind: one failed, one
    // skipped, one sibling in flight. The old resume bridge read this as
    // "still running" and the run never ended.
    const signal = readWaveSignal(
      { status: 'failed', failureReason: 'Task 1.1 failed after 1 retry: boom' },
      [task('1.1', 'failed', 'boom'), task('1.2', 'running'), task('1.3', 'skipped')],
      4
    );
    expect(signal).toEqual({
      kind: 'over',
      outcome: { state: 'failed', failures: [{ taskCode: '1.1', error: 'boom' }] },
    });
  });

  it('gives the recorded reason when a failed plan has no failed task in this wave', () => {
    const signal = readWaveSignal(
      { status: 'failed', failureReason: 'aborted by the conductor' },
      [task('2.1', 'skipped')],
      4
    );
    expect(signal).toEqual({
      kind: 'over',
      outcome: { state: 'failed', failures: [{ taskCode: '(plan)', error: 'aborted by the conductor' }] },
    });
  });

  it('asks for a backfill when a task is dispatchable and a slot is free', () => {
    expect(
      readWaveSignal(executing, [task('1.1', 'running'), task('1.2', 'pending'), task('1.3', 'retrying')], 1)
    ).toEqual({ kind: 'backfill', dispatchable: 2, freeSlots: 1 });
  });

  it('waits when the cap is full', () => {
    const signal = readWaveSignal(executing, [task('1.1', 'running'), task('1.2', 'pending')], 0);
    expect(signal.kind).toBe('wait');
  });

  it('waits when everything left is in flight', () => {
    const signal = readWaveSignal(executing, [task('1.1', 'completed'), task('1.2', 'dispatched')], 4);
    expect(signal).toEqual({ kind: 'wait', reason: '1 task(s) still in flight' });
  });

  it('does not backfill a paused plan', () => {
    const signal = readWaveSignal({ status: 'paused' }, [task('1.1', 'running'), task('1.2', 'pending')], 4);
    expect(signal.kind).toBe('wait');
  });
});

/**
 * A plan whose tasks each run on their own branch has one more thing standing
 * between "every task finished" and "the wave is over": the merge. The next
 * wave's tasks are cut from the run branch, so a wave called over before its
 * work is merged starts the next one without what it depends on.
 */
describe('readWaveSignal — a plan that gives each task its own branch', () => {
  const isolated = { status: 'executing', isolated: true };
  const done = (taskCode: string, mergedAt: Date | null = null) => ({
    taskCode,
    status: 'completed',
    errorMessage: null,
    mergedAt,
  });
  const MERGED = new Date('2026-10-01T10:00:00Z');

  it('is not over while a completed task is unmerged: it is due a merge', () => {
    expect(readWaveSignal(isolated, [done('1.1'), done('1.2')], 4)).toEqual({
      kind: 'merge',
      taskCodes: ['1.1', '1.2'],
    });
  });

  it('asks for every completed task of the wave, in task order', () => {
    // One already in, two not. The runner is idempotent, and is asked for the
    // whole wave so that a second merge is the same request as the first.
    expect(readWaveSignal(isolated, [done('1.10'), done('1.2', MERGED), done('1.1')], 4)).toEqual({
      kind: 'merge',
      taskCodes: ['1.1', '1.2', '1.10'],
    });
  });

  it('is over once everything that completed is merged', () => {
    expect(readWaveSignal(isolated, [done('1.1', MERGED), done('1.2', MERGED)], 4)).toEqual({
      kind: 'over',
      outcome: { state: 'complete' },
    });
  });

  it('merges what completed before saying a wave with a failed task has ended', () => {
    // `continue` policy: the plan carries on to a wave that needs 1.1's work.
    const tasks = [done('1.1'), task('1.2', 'failed', 'tests failed')];
    expect(readWaveSignal(isolated, tasks, 4)).toEqual({ kind: 'merge', taskCodes: ['1.1'] });

    expect(readWaveSignal(isolated, [done('1.1', MERGED), task('1.2', 'failed', 'tests failed')], 4)).toEqual({
      kind: 'over',
      outcome: { state: 'failed', failures: [{ taskCode: '1.2', error: 'tests failed' }] },
    });
  });

  it('has nothing to merge when nothing completed, and is over as it always was', () => {
    expect(
      readWaveSignal(isolated, [task('1.1', 'failed', 'boom'), task('1.2', 'skipped')], 4)
    ).toEqual({
      kind: 'over',
      outcome: {
        state: 'failed',
        failures: [
          { taskCode: '1.1', error: 'boom' },
          { taskCode: '1.2', error: 'skipped' },
        ],
      },
    });
    // An empty wave too.
    expect(readWaveSignal(isolated, [], 4)).toEqual({ kind: 'over', outcome: { state: 'complete' } });
  });

  it('does not ask for a merge while the wave is still running', () => {
    expect(readWaveSignal(isolated, [done('1.1'), task('1.2', 'running')], 4)).toEqual({
      kind: 'wait',
      reason: '1 task(s) still in flight',
    });
    expect(readWaveSignal(isolated, [done('1.1'), task('1.2', 'retrying')], 2)).toEqual({
      kind: 'backfill',
      dispatchable: 1,
      freeSlots: 2,
    });
  });

  it('is over, failed, the moment the plan is — unmerged work does not hold a dead run open', () => {
    expect(
      readWaveSignal(
        { status: 'failed', failureReason: 'Task 1.2 failed after 1 retry: boom', isolated: true },
        [done('1.1'), task('1.2', 'failed', 'boom')],
        4
      )
    ).toEqual({
      kind: 'over',
      outcome: { state: 'failed', failures: [{ taskCode: '1.2', error: 'boom' }] },
    });
  });

  it('never asks for a merge when the plan is not isolated, or has not been asked', () => {
    const over = { kind: 'over', outcome: { state: 'complete' } };
    expect(readWaveSignal({ status: 'executing', isolated: false }, [done('1.1')], 4)).toEqual(over);
    expect(readWaveSignal({ status: 'executing', isolated: null }, [done('1.1')], 4)).toEqual(over);
    expect(readWaveSignal({ status: 'executing' }, [done('1.1')], 4)).toEqual(over);
  });
});

describe('compareTaskCodes', () => {
  it('orders task codes the way they are numbered, not the way they spell', () => {
    expect(['1.10', '2.1', '1.2', '1.1', '10.1'].sort(compareTaskCodes)).toEqual([
      '1.1',
      '1.2',
      '1.10',
      '2.1',
      '10.1',
    ]);
  });
});
