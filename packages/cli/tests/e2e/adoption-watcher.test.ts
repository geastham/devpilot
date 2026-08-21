import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, utimesSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AdoptionWatcher } from '../../src/commands/bridge/adoption-watcher';
import { parseDuration, relativeAge } from '../../src/commands/sessions/scan-pipeline';

/**
 * TRD 21 §6.6. The watcher is the only part of adoption that keeps speaking
 * after the initial write, so it is the part most able to say something untrue
 * about work DevPilot did not do.
 */

const workspace = mkdtempSync(join(tmpdir(), 'devpilot-watch-'));
afterAll(() => rmSync(workspace, { recursive: true, force: true }));

let statusCalls: { sessionId: string; body: Record<string, unknown> }[] = [];
let completeCalls: { sessionId: string; body: Record<string, unknown> }[] = [];

function client(overrides: Partial<Record<'status' | 'complete', () => Promise<void>>> = {}) {
  return {
    reportSessionStatus: vi.fn(async (sessionId: string, body: Record<string, unknown>) => {
      statusCalls.push({ sessionId, body });
      await overrides.status?.();
    }),
    reportSessionComplete: vi.fn(async (sessionId: string, body: Record<string, unknown>) => {
      completeCalls.push({ sessionId, body });
      await overrides.complete?.();
    }),
  } as never;
}

let seq = 0;
function transcript(ageMs: number): string {
  const path = join(workspace, `t-${seq++}.jsonl`);
  writeFileSync(path, '{"type":"user"}\n', 'utf8');
  const when = (Date.now() - ageMs) / 1000;
  utimesSync(path, when, when);
  return path;
}

function entry(over: Partial<Parameters<AdoptionWatcher['track']>[0]> = {}) {
  const path = over.transcriptPath ?? transcript(0);
  return {
    adoptionKey: 'a'.repeat(64),
    sessionId: 'sess_1',
    identifier: 'ADP-1',
    transcriptPath: path,
    repo: 'acme/widget',
    startedAt: new Date(Date.now() - 90 * 60_000).toISOString(),
    lastMtimeMs: 0,
    lastReportedAt: new Date().toISOString(),
    settled: false,
    ...over,
  };
}

beforeEach(() => {
  statusCalls = [];
  completeCalls = [];
});

describe('AdoptionWatcher', () => {
  it('reports running while the transcript is growing', async () => {
    const watcher = new AdoptionWatcher({
      client: client(),
      statePath: join(workspace, 'state-1.json'),
    });
    watcher.track(entry());
    await watcher.sweep();
    watcher.stop();

    expect(statusCalls).toHaveLength(1);
    expect(statusCalls[0].body.status).toBe('running');
  });

  /**
   * An adopted session has no plan, so there is no denominator for a
   * percentage. A made-up fraction would look measured on the board.
   */
  it('never invents a progress percentage', async () => {
    const watcher = new AdoptionWatcher({
      client: client(),
      statePath: join(workspace, 'state-2.json'),
    });
    watcher.track(entry());
    await watcher.sweep();
    watcher.stop();

    expect(statusCalls[0].body.progressPercent).toBe(0);
    expect(statusCalls[0].body.message).toContain('Still running');
  });

  it('settles once the transcript has been still long enough', async () => {
    const path = transcript(45 * 60_000);
    const watcher = new AdoptionWatcher({
      client: client(),
      statePath: join(workspace, 'state-3.json'),
      settleAfterMs: 30 * 60_000,
    });
    watcher.track(entry({ transcriptPath: path, lastMtimeMs: Date.now() }));
    await watcher.sweep();
    watcher.stop();

    expect(completeCalls).toHaveLength(1);
    expect(completeCalls[0].body.success).toBe(true);
  });

  it('says it observed rather than finished the work', async () => {
    const path = transcript(45 * 60_000);
    const watcher = new AdoptionWatcher({
      client: client(),
      statePath: join(workspace, 'state-4.json'),
      settleAfterMs: 30 * 60_000,
    });
    watcher.track(entry({ transcriptPath: path, lastMtimeMs: Date.now() }));
    await watcher.sweep();
    watcher.stop();

    const summary = String(completeCalls[0].body.summary);
    expect(summary).toContain('stopped writing');
    expect(summary).toContain('observed it rather than running it');
    // "Complete" would be a claim about the work. It is a claim about a file.
    expect(summary.toLowerCase()).not.toContain('completed the');
  });

  it('does not settle a session that is merely quiet for a moment', async () => {
    const path = transcript(5 * 60_000);
    const watcher = new AdoptionWatcher({
      client: client(),
      statePath: join(workspace, 'state-5.json'),
      settleAfterMs: 30 * 60_000,
    });
    watcher.track(entry({ transcriptPath: path, lastMtimeMs: Date.now() }));
    await watcher.sweep();
    watcher.stop();

    expect(completeCalls).toHaveLength(0);
    expect(statusCalls).toHaveLength(0);
  });

  it('settles only once', async () => {
    const path = transcript(45 * 60_000);
    const watcher = new AdoptionWatcher({
      client: client(),
      statePath: join(workspace, 'state-6.json'),
      settleAfterMs: 30 * 60_000,
    });
    watcher.track(entry({ transcriptPath: path, lastMtimeMs: Date.now() }));
    await watcher.sweep();
    await watcher.sweep();
    watcher.stop();

    expect(completeCalls).toHaveLength(1);
  });

  it('drops an entry whose transcript was deleted rather than polling forever', async () => {
    const path = transcript(0);
    const watcher = new AdoptionWatcher({
      client: client(),
      statePath: join(workspace, 'state-7.json'),
    });
    watcher.track(entry({ transcriptPath: path }));
    rmSync(path);

    await watcher.sweep();
    watcher.stop();

    expect(watcher.size()).toBe(0);
    expect(statusCalls).toHaveLength(0);
    expect(completeCalls).toHaveLength(0);
  });

  it('keeps an entry when reporting fails, so the next tick retries', async () => {
    const statePath = join(workspace, 'state-8.json');
    const watcher = new AdoptionWatcher({
      client: client({
        complete: async () => {
          throw new Error('503');
        },
      }),
      statePath,
      settleAfterMs: 30 * 60_000,
    });
    watcher.track(entry({ transcriptPath: transcript(45 * 60_000), lastMtimeMs: Date.now() }));

    await watcher.sweep();
    expect(watcher.size(), 'a failed report must not lose the session').toBe(1);

    await watcher.sweep();
    expect(completeCalls.length).toBeGreaterThanOrEqual(2);
    watcher.stop();
  });

  it('restores unsettled entries across a restart', () => {
    const statePath = join(workspace, 'state-9.json');
    const path = transcript(0);

    const first = new AdoptionWatcher({ client: client(), statePath });
    first.track(entry({ transcriptPath: path }));
    first.stop();

    const second = new AdoptionWatcher({ client: client(), statePath });
    expect(second.restore()).toBe(1);
    second.stop();
  });

  it('does not restore an entry whose transcript is gone', () => {
    const statePath = join(workspace, 'state-10.json');
    const path = transcript(0);

    const first = new AdoptionWatcher({ client: client(), statePath });
    first.track(entry({ transcriptPath: path }));
    first.stop();
    rmSync(path);

    const second = new AdoptionWatcher({ client: client(), statePath });
    expect(second.restore()).toBe(0);
    second.stop();
  });

  it('survives a corrupt ledger rather than blocking a connect', () => {
    const statePath = join(workspace, 'state-11.json');
    writeFileSync(statePath, '{ not json at all', 'utf8');
    const watcher = new AdoptionWatcher({ client: client(), statePath });
    expect(watcher.restore()).toBe(0);
    watcher.stop();
  });

  it('writes a ledger that can be read back', () => {
    const statePath = join(workspace, 'state-12.json');
    const watcher = new AdoptionWatcher({ client: client(), statePath });
    watcher.track(entry({ sessionId: 'sess_x' }));
    watcher.stop();

    expect(existsSync(statePath)).toBe(true);
    const parsed = JSON.parse(readFileSync(statePath, 'utf8'));
    expect(parsed.version).toBe(1);
    expect(Object.values(parsed.entries)[0]).toMatchObject({ sessionId: 'sess_x' });
  });
});

describe('parseDuration', () => {
  it.each([
    ['24h', 24 * 3_600_000],
    ['90m', 90 * 60_000],
    ['7d', 7 * 86_400_000],
    ['2w', 2 * 604_800_000],
    ['30s', 30_000],
    ['12', 12 * 3_600_000],
  ])('reads %s', (input, expected) => {
    expect(parseDuration(input, 999)).toBe(expected);
  });

  it('falls back rather than throwing on nonsense', () => {
    expect(parseDuration('a fortnight', 4_242)).toBe(4_242);
  });
});

describe('relativeAge', () => {
  const now = Date.parse('2026-08-21T12:00:00.000Z');
  it.each([
    ['2026-08-21T11:58:00.000Z', '2m'],
    ['2026-08-21T09:00:00.000Z', '3h'],
    ['2026-08-18T12:00:00.000Z', '3d'],
    ['2026-08-21T11:59:59.000Z', 'now'],
  ])('renders %s as %s', (iso, expected) => {
    expect(relativeAge(iso, now)).toBe(expected);
  });

  it('does not render a future timestamp as a negative age', () => {
    expect(relativeAge('2026-08-22T12:00:00.000Z', now)).toBe('—');
  });
});
