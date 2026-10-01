import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sendTranscriptReading, type ReadingTarget } from '../../src/commands/bridge/transcript-reading';
import { recordStatus } from '../../src/utils/statusline-store';

/**
 * What a session's reading carries once the status line has been recording.
 *
 * A transcript's file name is its Claude Code session id, which is the id the
 * status line is given, so the two are joined with no lookup — and a machine
 * where the status line is not installed sends exactly what it sent before.
 */

const workspace = mkdtempSync(join(tmpdir(), 'devpilot-reading-'));
afterAll(() => rmSync(workspace, { recursive: true, force: true }));

const SESSION = '7b1d2c3e-aaaa-4bbb-8ccc-000000000009';
const NOW = Date.UTC(2026, 9, 1, 15, 0, 0);
const RESET = Math.floor(NOW / 1000) + 7200;

function transcriptFor(sessionId: string): string {
  const path = join(workspace, `${sessionId}.jsonl`);
  writeFileSync(
    path,
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'add a retry' } }) +
      '\n' +
      JSON.stringify({
        type: 'assistant',
        timestamp: new Date(NOW).toISOString(),
        message: {
          id: 'msg_1',
          model: 'claude-opus-5-5',
          usage: { input_tokens: 10, output_tokens: 200, cache_read_input_tokens: 5_000 },
          content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/repo/src/a.ts' } }],
        },
      }) +
      '\n'
  );
  return path;
}

function client() {
  const sent: Record<string, unknown>[] = [];
  return {
    sent,
    api: {
      streamEvents: async () => true,
      reportTelemetry: async (_id: string, body: Record<string, unknown>) => {
        sent.push(body);
        return true;
      },
    } as never,
  };
}

describe('a reading, with and without the status line', () => {
  it('sends what it always sent, plus the prompt count, where nothing was recorded', async () => {
    const statuslineDir = mkdtempSync(join(tmpdir(), 'devpilot-sl-empty-'));
    const { sent, api } = client();
    const target: ReadingTarget = { sessionId: 'hosted_1', label: 't', transcriptPath: transcriptFor(SESSION), cwd: '/repo' };

    expect(await sendTranscriptReading(api, target, { now: NOW, mtimeMs: NOW, statuslineDir })).toBe('sent');

    expect(sent[0]).toMatchObject({ toolCalls: 1, writeCalls: 1, filesTouched: ['src/a.ts'], prompts: 1, tokensCacheRead: 5_000 });
    for (const key of ['windowUsed5h', 'windowDelta5h', 'cacheMisses', 'cacheMissCostUsd', 'contextPeakPct']) {
      expect(sent[0]).not.toHaveProperty(key);
    }
  });

  it('carries the windows, the attributed share, cache misses and their cost', async () => {
    const statuslineDir = mkdtempSync(join(tmpdir(), 'devpilot-sl-'));
    const base = {
      session_id: SESSION,
      model: { id: 'claude-opus-5-5' },
      context_window: { used_percentage: 62 },
    };
    recordStatus(
      { ...base, cost: { total_cost_usd: 1 }, rate_limits: { five_hour: { used_percentage: 20, resets_at: RESET }, seven_day: { used_percentage: 40, resets_at: RESET + 86400 } } },
      statuslineDir,
      NOW - 60_000
    );
    recordStatus(
      {
        ...base,
        cost: { total_cost_usd: 3 },
        rate_limits: { five_hour: { used_percentage: 26, resets_at: RESET }, seven_day: { used_percentage: 41, resets_at: RESET + 86400 } },
        prompt_cache: { warm: true, ttl: '1h', misses: 2, miss_recache_tokens: 500_000, miss_causes: { ttl_expired_5m: 2 } },
      },
      statuslineDir,
      NOW
    );

    const { sent, api } = client();
    const target: ReadingTarget = { sessionId: 'hosted_1', label: 't', transcriptPath: transcriptFor(SESSION), cwd: '/repo' };
    await sendTranscriptReading(api, target, { now: NOW, mtimeMs: NOW, statuslineDir });

    expect(sent[0]).toMatchObject({
      windowUsed5h: 26,
      windowUsed7d: 41,
      windowResets5h: new Date(RESET * 1000).toISOString(),
      // The only session metered in the window, so the whole movement is its.
      windowDelta5h: 6,
      windowDelta7d: 1,
      cacheMisses: 2,
      cacheMissCauses: { ttl_expired_5m: 2 },
      cacheRecacheTokens: 500_000,
      contextPeakPct: 62,
    });
    // 500k tokens re-written at Opus 5.5's one-hour write rate ($8) instead of
    // read ($0.20): $3.90.
    expect(sent[0].cacheMissCostUsd).toBeCloseTo(3.9, 4);
  });

  it('sends only numbers, names and timestamps from the status line', async () => {
    const statuslineDir = mkdtempSync(join(tmpdir(), 'devpilot-sl-'));
    recordStatus(
      {
        session_id: SESSION,
        transcript_path: '/Users/someone/secret-project/x.jsonl',
        cost: { total_cost_usd: 1 },
        rate_limits: { five_hour: { used_percentage: 5, resets_at: RESET } },
        // Fields this module does not read must not find their way out.
        ...({ cwd: '/Users/someone/secret-project', session_name: 'Rotate the signing key' } as object),
      },
      statuslineDir,
      NOW
    );
    const { sent, api } = client();
    await sendTranscriptReading(
      api,
      { sessionId: 'hosted_1', label: 't', transcriptPath: transcriptFor(SESSION), cwd: '/repo' },
      { now: NOW, mtimeMs: NOW, statuslineDir }
    );
    const body = JSON.stringify(sent[0]);
    expect(body).not.toContain('secret-project');
    expect(body).not.toContain('signing key');
  });
});
