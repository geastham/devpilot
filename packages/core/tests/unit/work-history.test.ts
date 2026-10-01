import { describe, it, expect } from 'vitest';
import {
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
  SUMMARY_MAX_CHARS,
  workHistoryForPaths,
  type WorkHistoryRow,
} from '../../src/wave-planner/work-history';

/**
 * Work history, on plain rows: which past tasks count as history for a file,
 * in what order, and what is said about each.
 *
 * The decisions worth pinning are the ones a careless join gets wrong — a task
 * that was GIVEN a file is not a task that CHANGED it; a plan that never ran
 * is not history; a running session's cost is an estimate and is not reported
 * as a cost.
 */

const T0 = Date.UTC(2026, 8, 1, 12, 0, 0);
const minutes = (n: number) => T0 + n * 60_000;

function row(overrides: Partial<WorkHistoryRow> = {}): WorkHistoryRow {
  return {
    taskCode: '1.1',
    label: 'Add the retry',
    status: 'completed',
    filePaths: ['src/checkout/client.ts'],
    filesChanged: null,
    startedAt: minutes(0),
    lastAttemptAt: minutes(0),
    completedAt: minutes(5),
    retryCount: 0,
    errorMessage: null,
    completionSummary: 'Added a retry with backoff.',
    wavePlanId: 'wp_1',
    itemTitle: 'Fix checkout',
    ticketId: 'AVA-12',
    session: { terminal: true, reportedCostCents: 37, telemetryCostUsd: 0.3712 },
    ...overrides,
  };
}

const history = (rows: WorkHistoryRow[], paths: string[], limit?: number) =>
  workHistoryForPaths(rows, paths, { limit });

describe('workHistoryForPaths — which tasks are history for a file', () => {
  it('says everything it knows about a task that changed the file', () => {
    const result = history(
      [row({ filesChanged: ['src/checkout/client.ts', 'src/checkout/errors.ts'] })],
      ['src/checkout/client.ts']
    );

    expect(result).toEqual({
      byPath: {
        'src/checkout/client.ts': [
          {
            taskCode: '1.1',
            task: 'Add the retry',
            item: 'Fix checkout',
            ticketId: 'AVA-12',
            wavePlanId: 'wp_1',
            status: 'completed',
            at: new Date(minutes(5)).toISOString(),
            matchedOn: 'changed',
            retried: false,
            attempts: 1,
            error: null,
            conflicted: false,
            summary: 'Added a retry with backoff.',
            summaryTruncated: false,
            costUsd: 0.3712,
          },
        ],
      },
      totals: { 'src/checkout/client.ts': 1 },
    });
  });

  it('goes by what a task changed, not what it was given, when that is recorded', () => {
    // Given client.ts; changed only errors.ts.
    const rows = [row({ filePaths: ['src/checkout/client.ts'], filesChanged: ['src/checkout/errors.ts'] })];

    const result = history(rows, ['src/checkout/client.ts', 'src/checkout/errors.ts']);

    expect(result.byPath['src/checkout/client.ts']).toEqual([]);
    expect(result.byPath['src/checkout/errors.ts']).toHaveLength(1);
    expect(result.byPath['src/checkout/errors.ts'][0].matchedOn).toBe('changed');
  });

  it('falls back to the planned files when nothing recorded the changes — and says that is what it did', () => {
    const result = history([row({ filesChanged: null })], ['src/checkout/client.ts']);

    expect(result.byPath['src/checkout/client.ts'][0].matchedOn).toBe('planned');
  });

  it('does not treat "changed nothing" as "not recorded"', () => {
    // An empty list is a finding: the task ran and changed no file.
    const result = history([row({ filesChanged: [] })], ['src/checkout/client.ts']);

    expect(result.byPath['src/checkout/client.ts']).toEqual([]);
  });

  it('leaves out a task that was never dispatched, whatever its files', () => {
    const rows = [
      row({ taskCode: '2.1', status: 'pending', startedAt: null, lastAttemptAt: null, completedAt: null }),
      // Skipped when the run ended early: it has an end time and never began.
      row({ taskCode: '2.2', status: 'skipped', startedAt: null, lastAttemptAt: null, completedAt: minutes(9) }),
    ];

    expect(history(rows, ['src/checkout/client.ts'])).toEqual({
      byPath: { 'src/checkout/client.ts': [] },
      totals: { 'src/checkout/client.ts': 0 },
    });
  });

  it('includes one that is still running, dated from its latest attempt', () => {
    const rows = [
      row({ status: 'running', completedAt: null, startedAt: minutes(0), lastAttemptAt: minutes(20), completionSummary: null }),
    ];

    const [entry] = history(rows, ['src/checkout/client.ts']).byPath['src/checkout/client.ts'];

    expect(entry.status).toBe('running');
    expect(entry.at).toBe(new Date(minutes(20)).toISOString());
    expect(entry.summary).toBeNull();
  });

  it('matches a path written with a leading ./ or backslashes', () => {
    const rows = [row({ filesChanged: ['./src/checkout/client.ts'] })];

    const result = history(rows, ['src/checkout/client.ts', 'src\\checkout\\client.ts']);

    expect(result.byPath['src/checkout/client.ts']).toHaveLength(1);
    // Under the string that was asked with.
    expect(result.byPath['src\\checkout\\client.ts']).toHaveLength(1);
  });

  it('does not match a path that merely contains the one asked about', () => {
    const rows = [row({ filesChanged: ['src/checkout/client.ts.bak', 'lib/src/checkout/client.ts'] })];

    expect(history(rows, ['src/checkout/client.ts']).byPath['src/checkout/client.ts']).toEqual([]);
  });
});

describe('workHistoryForPaths — order and limit', () => {
  const rows = Array.from({ length: 8 }, (_, i) =>
    row({ taskCode: `${i + 1}.1`, wavePlanId: `wp_${i}`, completedAt: minutes(i * 10) })
  );

  it('is newest first, five by default, with the total alongside', () => {
    const result = history([...rows].reverse().concat(), ['src/checkout/client.ts']);

    expect(DEFAULT_HISTORY_LIMIT).toBe(5);
    expect(result.byPath['src/checkout/client.ts'].map((e) => e.taskCode)).toEqual([
      '8.1',
      '7.1',
      '6.1',
      '5.1',
      '4.1',
    ]);
    expect(result.totals['src/checkout/client.ts']).toBe(8);
  });

  it('does not depend on the order the rows arrive in', () => {
    const shuffled = [rows[3], rows[7], rows[0], rows[5], rows[1], rows[6], rows[2], rows[4]];

    expect(history(shuffled, ['src/checkout/client.ts'])).toEqual(history(rows, ['src/checkout/client.ts']));
  });

  it('honours a limit, within bounds', () => {
    const path = 'src/checkout/client.ts';
    const lots = Array.from({ length: 30 }, (_, i) => row({ taskCode: `t${i}`, completedAt: minutes(i) }));

    expect(history(rows, [path], 2).byPath[path]).toHaveLength(2);
    expect(history(lots, [path], 500).byPath[path]).toHaveLength(MAX_HISTORY_LIMIT);
    expect(history(rows, [path], 0).byPath[path]).toHaveLength(1);
    expect(history(rows, [path], Number.NaN).byPath[path]).toHaveLength(DEFAULT_HISTORY_LIMIT);
  });

  it('answers every path asked about, including one nothing touched', () => {
    const result = history(rows, ['src/checkout/client.ts', 'src/never.ts']);

    expect(Object.keys(result.byPath)).toEqual(['src/checkout/client.ts', 'src/never.ts']);
    expect(result.byPath['src/never.ts']).toEqual([]);
    expect(result.totals['src/never.ts']).toBe(0);
  });
});

describe('workHistoryForPaths — retries, failures and conflicts', () => {
  const path = 'src/checkout/client.ts';
  const one = (overrides: Partial<WorkHistoryRow>) => history([row(overrides)], [path]).byPath[path][0];

  it('says a task was retried, and keeps why its first attempt failed', () => {
    const entry = one({
      retryCount: 1,
      errorMessage: 'merge conflict with the run branch in: src/checkout/client.ts',
    });

    expect(entry).toMatchObject({
      status: 'completed',
      retried: true,
      attempts: 2,
      conflicted: true,
      error: 'merge conflict with the run branch in: src/checkout/client.ts',
    });
  });

  it('reports a failure that was not a conflict as a failure', () => {
    const entry = one({ status: 'failed', retryCount: 1, errorMessage: 'lost: no report since 2026-09-01T12:30:00Z' });

    expect(entry).toMatchObject({ status: 'failed', retried: true, conflicted: false });
    expect(entry.error).toMatch(/^lost: no report since/);
  });

  it('has no error for a task that never failed', () => {
    expect(one({ errorMessage: null })).toMatchObject({ error: null, conflicted: false, retried: false, attempts: 1 });
    expect(one({ errorMessage: '   ' }).error).toBeNull();
  });

  it('caps a long error', () => {
    const entry = one({ status: 'failed', errorMessage: `boom ${'x'.repeat(2000)}` });

    expect(entry.error!.length).toBeLessThanOrEqual(300);
    expect(entry.error!.endsWith('…')).toBe(true);
  });
});

describe('workHistoryForPaths — the summary', () => {
  const path = 'src/checkout/client.ts';
  const one = (completionSummary: string | null) =>
    history([row({ completionSummary })], [path]).byPath[path][0];

  it('is cut at 400 characters, and says it was', () => {
    const long = `Changed the client. ${'More detail. '.repeat(100)}`;
    const entry = one(long);

    expect(SUMMARY_MAX_CHARS).toBe(400);
    expect(entry.summary!.length).toBeLessThanOrEqual(400);
    expect(entry.summary!.endsWith('…')).toBe(true);
    expect(entry.summary!.startsWith('Changed the client. More detail.')).toBe(true);
    expect(entry.summaryTruncated).toBe(true);
  });

  it('is left whole at exactly 400', () => {
    const exact = 'x'.repeat(400);
    const entry = one(exact);

    expect(entry.summary).toBe(exact);
    expect(entry.summaryTruncated).toBe(false);
  });

  it('is null when there is none', () => {
    expect(one(null).summary).toBeNull();
    expect(one('  \n ').summary).toBeNull();
  });
});

describe('workHistoryForPaths — cost, only when it is a final figure', () => {
  const path = 'src/checkout/client.ts';
  const costOf = (session: WorkHistoryRow['session']) => history([row({ session })], [path]).byPath[path][0].costUsd;

  it('is the runner’s final reading when it agrees with the report to the cent', () => {
    // $0.032279: the column alone would say three cents.
    expect(costOf({ terminal: true, reportedCostCents: 3, telemetryCostUsd: 0.032279 })).toBe(0.032279);
  });

  it('is the reported cents when the reading on the row is not the final one', () => {
    // A runner that sent no final reading leaves its last in-flight estimate,
    // which reads low; the completion report said $0.37.
    expect(costOf({ terminal: true, reportedCostCents: 37, telemetryCostUsd: 0.21 })).toBe(0.37);
    expect(costOf({ terminal: true, reportedCostCents: 37, telemetryCostUsd: null })).toBe(0.37);
  });

  it('is null for a session that is still running, though it has a reading', () => {
    expect(costOf({ terminal: false, reportedCostCents: null, telemetryCostUsd: 0.21 })).toBeNull();
  });

  it('is null for a session that ended without a completion report', () => {
    expect(costOf({ terminal: true, reportedCostCents: null, telemetryCostUsd: 0.21 })).toBeNull();
  });

  it('is null for a task with no session', () => {
    expect(costOf(null)).toBeNull();
  });

  it('reports a cost of zero as zero, not as unknown', () => {
    expect(costOf({ terminal: true, reportedCostCents: 0, telemetryCostUsd: null })).toBe(0);
  });
});
