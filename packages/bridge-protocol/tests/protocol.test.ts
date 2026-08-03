import { describe, it, expect } from 'vitest';
import {
  TaskDispatchMessageSchema,
  parseTaskDispatchMessage,
  safeParseTaskDispatchMessage,
  RegisterRequestSchema,
  RegisterResponseSchema,
  SessionStatusUpdateSchema,
  SessionCompleteSchema,
  SESSION_STATUSES,
  isTerminal,
  formatApiError,
  buildCompletionComment,
  buildProgressComment,
  buildBridgeCompletionComment,
} from '../src/index';

const validMessage = {
  messageId: 'msg_1',
  sessionId: 'sess_1',
  queueId: 'q_1',
  orgId: 'org_1',
  workspaceId: 'ws_1',
  linearIssueId: 'iss_1',
  linearIdentifier: 'ENG-394',
  title: 'Implement feature X',
  teamId: 'team_1',
  repo: 'acme/api',
  targetOrchestratorId: 'orch_1',
  dispatchedAt: '2026-08-01T18:00:00.000Z',
};

describe('TaskDispatchMessage', () => {
  it('round-trips a valid message', () => {
    expect(parseTaskDispatchMessage(validMessage)).toEqual(validMessage);
  });

  /**
   * REGRESSION GUARD for the original defect: both historical definitions of
   * this type omitted sessionId, so a client that received a dispatch had no
   * key to report progress against. If this test ever passes with sessionId
   * absent, the pipeline is silently broken again.
   */
  it('REJECTS a message without sessionId', () => {
    const { sessionId, ...without } = validMessage;
    const r = safeParseTaskDispatchMessage(without);
    expect(r.success).toBe(false);
    expect(r.success === false && r.error.issues.some((i) => i.path[0] === 'sessionId')).toBe(true);
  });

  it('REJECTS a message without targetOrchestratorId — routing is never left to the client', () => {
    const { targetOrchestratorId, ...without } = validMessage;
    expect(safeParseTaskDispatchMessage(without).success).toBe(false);
  });

  it('REJECTS a message without queueId — nothing could be claimed or settled', () => {
    const { queueId, ...without } = validMessage;
    expect(safeParseTaskDispatchMessage(without).success).toBe(false);
  });

  it.each(['messageId', 'orgId', 'workspaceId', 'linearIssueId', 'linearIdentifier', 'title', 'teamId', 'repo'])(
    'requires %s',
    (field) => {
      const copy: Record<string, unknown> = { ...validMessage };
      delete copy[field];
      expect(safeParseTaskDispatchMessage(copy).success).toBe(false);
    },
  );

  it('rejects a non-ISO dispatchedAt', () => {
    expect(safeParseTaskDispatchMessage({ ...validMessage, dispatchedAt: 'yesterday' }).success).toBe(
      false,
    );
  });

  it('rejects empty strings where an id is required', () => {
    expect(safeParseTaskDispatchMessage({ ...validMessage, sessionId: '' }).success).toBe(false);
  });

  it('accepts the optional fields', () => {
    const r = TaskDispatchMessageSchema.safeParse({
      ...validMessage,
      description: 'do the thing',
      priority: 2,
      labels: ['bug', 'p1'],
    });
    expect(r.success).toBe(true);
  });

  it('rejects an out-of-range priority', () => {
    expect(safeParseTaskDispatchMessage({ ...validMessage, priority: 9 }).success).toBe(false);
  });
});

describe('RegisterRequest', () => {
  /**
   * REGRESSION GUARD: the shipped client sent { repos, maxConcurrentJobs } while
   * the bridge required `name`, so register returned 400 every single time and
   * the pipeline never once connected end to end.
   */
  it('REJECTS the historical client payload that omitted name', () => {
    const r = RegisterRequestSchema.safeParse({ repos: ['acme/api'], maxConcurrentJobs: 4 });
    expect(r.success).toBe(false);
    expect(r.success === false && r.error.issues.some((i) => i.path[0] === 'name')).toBe(true);
  });

  it('accepts a conforming payload and defaults maxConcurrentJobs', () => {
    const r = RegisterRequestSchema.parse({ name: 'laptop', repos: ['acme/api'] });
    expect(r).toEqual({ name: 'laptop', repos: ['acme/api'], maxConcurrentJobs: 4 });
  });

  it('allows an empty repo list (an orchestrator may register before routing)', () => {
    expect(RegisterRequestSchema.safeParse({ name: 'laptop', repos: [] }).success).toBe(true);
  });

  it('response allows realtime: null so a client can fall back to polling', () => {
    const r = RegisterResponseSchema.safeParse({
      orchestratorId: 'orch_1',
      orgId: 'org_1',
      realtime: null,
    });
    expect(r.success).toBe(true);
  });
});

describe('session reporting', () => {
  it('accepts a valid status update', () => {
    expect(
      SessionStatusUpdateSchema.safeParse({ status: 'running', progressPercent: 50 }).success,
    ).toBe(true);
  });

  it.each([-1, 101])('rejects progressPercent %d', (p) => {
    expect(SessionStatusUpdateSchema.safeParse({ status: 'running', progressPercent: p }).success).toBe(
      false,
    );
  });

  it('rejects a status outside the shared vocabulary', () => {
    expect(
      SessionStatusUpdateSchema.safeParse({ status: 'kinda-done', progressPercent: 10 }).success,
    ).toBe(false);
  });

  it('rejects a non-URL prUrl', () => {
    expect(SessionCompleteSchema.safeParse({ success: true, prUrl: 'not-a-url' }).success).toBe(false);
  });

  it('accepts a minimal failure report', () => {
    expect(SessionCompleteSchema.safeParse({ success: false, errorMessage: 'boom' }).success).toBe(
      true,
    );
  });

  it('isTerminal matches the documented terminal set', () => {
    const terminal = SESSION_STATUSES.filter(isTerminal);
    expect(terminal).toEqual(['complete', 'error', 'cancelled']);
  });
});

describe('formatApiError', () => {
  it('extracts code and message from a bridge error envelope', () => {
    expect(
      formatApiError({ error: { code: 'unauthenticated', message: 'Invalid token' } }, 'fallback'),
    ).toBe('unauthenticated: Invalid token');
  });

  it('falls back when the body is not an error envelope', () => {
    // This is what the old client did unconditionally: report only
    // response.statusText, so users saw "Bad Request" with no cause.
    expect(formatApiError({ nope: true }, 'Registration failed: Bad Request')).toBe(
      'Registration failed: Bad Request',
    );
  });
});

describe('Linear formatting', () => {
  it('renders a success completion with a PR link', () => {
    const out = buildBridgeCompletionComment({
      success: true,
      identifier: 'ENG-394',
      prUrl: 'https://github.com/acme/api/pull/7',
      summary: 'Added the endpoint.',
    });
    expect(out).toContain(':rocket:');
    expect(out).toContain('Completed Successfully');
    expect(out).toContain('[View PR](https://github.com/acme/api/pull/7)');
    expect(out).toContain('Added the endpoint.');
  });

  it('renders a failure without a PR link', () => {
    const out = buildBridgeCompletionComment({
      success: false,
      identifier: 'ENG-394',
      errorMessage: 'tests failed',
    });
    expect(out).toContain(':warning:');
    expect(out).toContain('tests failed');
    expect(out).not.toContain('View PR');
  });

  it('never produces an empty comment even with nothing reported', () => {
    const out = buildBridgeCompletionComment({ success: false, identifier: 'ENG-1' });
    expect(out.trim().length).toBeGreaterThan(0);
    expect(out).toContain('no error detail');
  });

  /**
   * These pin the EXACT strings that packages/core/src/integrations/linear/sync.ts
   * produced before the formatters moved here. Core had no test coverage for
   * them, so without these the extraction would be unverified — a silent change
   * to every Linear comment DevPilot has ever posted.
   */
  it('buildProgressComment matches core byte for byte', () => {
    expect(
      buildProgressComment({
        progressPercent: 45,
        status: 'running',
        currentWorkstream: 'Writing tests',
        message: 'Implementing test cases',
        filesModified: ['src/api.ts', 'tests/api.test.ts'],
      }),
    ).toBe(
      [
        ':hourglass: **Progress Update: 45%**',
        '',
        'Working on: Writing tests',
        '',
        'Implementing test cases',
        '',
        '**Files modified:**',
        '- `src/api.ts`',
        '- `tests/api.test.ts`',
      ].join('\n'),
    );
  });

  it.each([
    ['running', ':hourglass:'],
    ['waiting', ':pause_button:'],
    ['complete', ':white_check_mark:'],
    ['error', ':x:'],
  ] as const)('progress status %s uses %s, as core did', (status, emoji) => {
    expect(buildProgressComment({ progressPercent: 1, status })).toContain(emoji);
  });

  it('buildCompletionComment matches core byte for byte', () => {
    expect(
      buildCompletionComment({
        success: true,
        prUrl: 'https://github.com/acme/api/pull/7',
        completionMessage: 'Shipped it.',
        filesModified: ['src/a.ts'],
      }),
    ).toBe(
      [
        ':rocket: **Session Completed Successfully**',
        '',
        '**Pull Request:** [View PR](https://github.com/acme/api/pull/7)',
        '',
        'Shipped it.',
        '',
        '**Files modified:**',
        '- `src/a.ts`',
      ].join('\n'),
    );
  });

  it('truncates long file lists with a count', () => {
    const files = Array.from({ length: 14 }, (_, i) => `src/f${i}.ts`);
    expect(buildCompletionComment({ success: true, filesModified: files })).toContain(
      '... and 4 more',
    );
    expect(
      buildProgressComment({ progressPercent: 10, status: 'running', filesModified: files }),
    ).toContain('... and 9 more');
  });
});
