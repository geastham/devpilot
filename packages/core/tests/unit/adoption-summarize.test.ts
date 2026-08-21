import { describe, it, expect, vi } from 'vitest';
import { summarizeSession, summarizeSessions } from '../../src/adoption';
import type { SessionObservation } from '../../src/adoption';

function observation(overrides: Partial<SessionObservation> = {}): SessionObservation {
  return {
    sessionUuid: 'deadbeef-0000-0000-0000-000000000001',
    transcriptPath: '/tmp/x.jsonl',
    cwd: '/tmp/repo',
    gitBranch: 'main',
    customTitle: 'Cockpit landing copy',
    firstHumanPrompt: 'rewrite the hero',
    startedAt: '2026-08-21T06:00:00.000Z',
    lastActivityAt: '2026-08-21T07:00:00.000Z',
    lastActivityMs: Date.parse('2026-08-21T07:00:00.000Z'),
    sizeBytes: 1024,
    messageCount: 12,
    messageCountIsApproximate: false,
    sidechainOnly: false,
    looksDevPilotOwned: false,
    headSample: '{"type":"user","message":{"role":"user","content":"rewrite the hero"}}',
    ...overrides,
  };
}

function stubClient(text: string) {
  return () => ({
    messages: {
      create: vi.fn(async () => ({ content: [{ type: 'text', text }] })),
    },
  }) as never;
}

describe('summarizeSession', () => {
  /** T21-AC-08 — the headline experience must not require configuration. */
  it('falls back to the heuristic with no API key', async () => {
    const result = await summarizeSession(observation(), [], { apiKey: undefined });
    expect(result).toEqual({ title: 'Cockpit landing copy', source: 'heuristic' });
  });

  it('uses the model response when one is available', async () => {
    const result = await summarizeSession(observation(), ['app/page.tsx'], {
      apiKey: 'sk-test',
      clientFactory: stubClient('TITLE: Rewrite the marketing hero\nSUMMARY: Reworks the hero copy.'),
    });
    expect(result).toEqual({
      title: 'Rewrite the marketing hero',
      summary: 'Reworks the hero copy.',
      source: 'model',
    });
  });

  it('degrades to the heuristic when the model call throws', async () => {
    const warn = vi.fn();
    const result = await summarizeSession(observation(), [], {
      apiKey: 'sk-test',
      onWarn: warn,
      clientFactory: () =>
        ({
          messages: {
            create: vi.fn(async () => {
              throw new Error('529 overloaded');
            }),
          },
        }) as never,
    });
    expect(result.source).toBe('heuristic');
    expect(warn).toHaveBeenCalledOnce();
  });

  it('degrades to the heuristic when the model ignores the format', async () => {
    const result = await summarizeSession(observation(), [], {
      apiKey: 'sk-test',
      clientFactory: stubClient('Sure! Here is a summary of the session.'),
    });
    expect(result.source).toBe('heuristic');
  });

  it('truncates an over-long model title to the wire limit', async () => {
    const result = await summarizeSession(observation(), [], {
      apiKey: 'sk-test',
      clientFactory: stubClient(`TITLE: ${'word '.repeat(80)}\nSUMMARY: x`),
    });
    expect(result.title.length).toBeLessThanOrEqual(120);
  });

  it('sends changed paths but never the transcript beyond the head sample', async () => {
    const create = vi.fn(async () => ({ content: [{ type: 'text', text: 'TITLE: a\nSUMMARY: b' }] }));
    await summarizeSession(observation({ headSample: 'HEAD_ONLY' }), ['src/a.ts'], {
      apiKey: 'sk-test',
      clientFactory: () => ({ messages: { create } }) as never,
    });
    const body = JSON.stringify(create.mock.calls[0][0]);
    expect(body).toContain('src/a.ts');
    expect(body).toContain('HEAD_ONLY');
  });

  it('instructs the model to ignore credentials it may encounter', async () => {
    const create = vi.fn(async () => ({ content: [{ type: 'text', text: 'TITLE: a\nSUMMARY: b' }] }));
    await summarizeSession(observation(), [], {
      apiKey: 'sk-test',
      clientFactory: () => ({ messages: { create } }) as never,
    });
    const system = (create.mock.calls[0][0] as { system: string }).system;
    expect(system).toContain('secrets');
    expect(system).toContain('Never quote the transcript');
  });
});

describe('summarizeSessions', () => {
  it('preserves input order under concurrency', async () => {
    const jobs = Array.from({ length: 9 }, (_, i) => ({
      observation: observation({ customTitle: `heuristic-${i}` }),
      touchedPaths: [],
    }));

    let n = 0;
    const results = await summarizeSessions(jobs, {
      apiKey: 'sk-test',
      concurrency: 4,
      clientFactory: () =>
        ({
          messages: {
            create: vi.fn(async () => {
              const mine = n++;
              // Reverse the completion order relative to dispatch.
              await new Promise((r) => setTimeout(r, (9 - mine) * 2));
              return { content: [{ type: 'text', text: `TITLE: model-${mine}\nSUMMARY: s` }] };
            }),
          },
        }) as never,
    });

    expect(results).toHaveLength(9);
    expect(results.every((r) => r.source === 'model')).toBe(true);
  });

  it('caps model calls and leaves the remainder on the heuristic', async () => {
    const create = vi.fn(async () => ({
      content: [{ type: 'text', text: 'TITLE: model\nSUMMARY: s' }],
    }));
    const jobs = Array.from({ length: 10 }, () => ({
      observation: observation(),
      touchedPaths: [],
    }));

    const results = await summarizeSessions(jobs, {
      apiKey: 'sk-test',
      maxSummaries: 3,
      concurrency: 1,
      clientFactory: () => ({ messages: { create } }) as never,
    });

    expect(create).toHaveBeenCalledTimes(3);
    expect(results.filter((r) => r.source === 'model')).toHaveLength(3);
    expect(results.filter((r) => r.source === 'heuristic')).toHaveLength(7);
  });

  it('handles an empty batch', async () => {
    expect(await summarizeSessions([], { apiKey: 'sk-test' })).toEqual([]);
  });
});
