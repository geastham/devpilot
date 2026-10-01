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

/**
 * The instrument reading an observed session sends up.
 *
 * Nearly every session on a real fleet is an observed one, so what this sends
 * is what the hosted efficiency readings are made of.
 */
describe('AdoptionWatcher telemetry', () => {
  const CWD = '/home/dev/acme/widget';
  let telemetry: Record<string, unknown>[] = [];
  let n = 0;

  function streamingClient() {
    return {
      reportSessionStatus: vi.fn(async () => {}),
      reportSessionComplete: vi.fn(async () => {}),
      streamEvents: vi.fn(async () => true),
      reportTelemetry: vi.fn(async (_id: string, body: Record<string, unknown>) => {
        telemetry.push(body);
        return true;
      }),
    } as never;
  }

  function reply(id: string, blocks: unknown[], at = 0): string {
    return (
      JSON.stringify({
        type: 'assistant',
        timestamp: new Date(1_700_000_000_000 + at * 1000).toISOString(),
        message: {
          id,
          usage: {
            input_tokens: 10,
            output_tokens: 200,
            cache_read_input_tokens: 5_000,
            cache_creation_input_tokens: 300,
          },
          content: blocks,
        },
      }) + '\n'
    );
  }

  const edit = (file: string) => ({ type: 'tool_use', name: 'Edit', input: { file_path: `${CWD}/${file}` } });

  function setup(content: string) {
    telemetry = [];
    const path = join(workspace, `tel-${n}.jsonl`);
    writeFileSync(path, content, 'utf8');
    const watcher = new AdoptionWatcher({
      client: streamingClient(),
      statePath: join(workspace, `tel-state-${n++}.json`),
    });
    watcher.track(entry({ transcriptPath: path, cwd: CWD }));
    return { watcher, path };
  }

  /** Append and move mtime forward, so the watcher sees growth without waiting. */
  function grow(path: string, content: string, aheadS: number) {
    writeFileSync(path, readFileSync(path, 'utf8') + content, 'utf8');
    const when = Date.now() / 1000 + aheadS;
    utimesSync(path, when, when);
  }

  it('reports tokens, counted once per response', async () => {
    const { watcher } = setup(reply('msg_1', [{ type: 'text', text: 'on it' }]) + reply('msg_1', [edit('a.ts')]));
    await watcher.sweep();
    watcher.stop();

    expect(telemetry).toHaveLength(1);
    expect(telemetry[0]).toMatchObject({
      tokensIn: 10,
      tokensOut: 200,
      tokensCacheRead: 5_000,
      tokensCacheWrite: 300,
      turns: 1,
      // Our arithmetic, never presented as a bill.
      costEstimated: true,
    });
  });

  it('reports every file the session changed, not just the last batch', async () => {
    const { watcher, path } = setup(reply('msg_1', [edit('a.ts')]));
    await watcher.sweep();
    grow(path, reply('msg_2', [edit('b.ts')], 5), 10);
    await watcher.sweep();
    watcher.stop();

    expect(telemetry.at(-1)?.filesTouched).toEqual(['a.ts', 'b.ts']);
  });

  it('keeps saying what the session is doing when a turn only spends tokens', async () => {
    const { watcher, path } = setup(reply('msg_1', [edit('src/a.ts')]));
    await watcher.sweep();
    // A response with no tool call: nothing to stream, tokens still spent.
    grow(path, reply('msg_2', [{ type: 'text', text: 'thinking' }], 5), 10);
    await watcher.sweep();
    watcher.stop();

    expect(telemetry).toHaveLength(2);
    expect(telemetry[1].tokensOut).toBe(400);
    // The hosted row is replaced whole; a blank here would erase the line.
    expect(telemetry[1].currentAction).toBe(telemetry[0].currentAction);
    expect(telemetry[1].currentAction).toBe('Edit · src/a.ts');
  });

  /**
   * The tailer advances its read position as it derives. A batch that failed to
   * land used to be gone for good, under a log line promising to catch up.
   */
  it('sends a batch again when it did not land, even if the file never grows', async () => {
    telemetry = [];
    const path = join(workspace, `tel-${n}.jsonl`);
    writeFileSync(path, reply('msg_1', [edit('a.ts')]), 'utf8');

    const batches: number[][] = [];
    let fail = true;
    const flaky = {
      reportSessionStatus: vi.fn(async () => {}),
      reportSessionComplete: vi.fn(async () => {}),
      streamEvents: vi.fn(async (_id: string, events: { seq: number }[]) => {
        batches.push(events.map((e) => e.seq));
        const ok = !fail;
        fail = false;
        return ok;
      }),
      reportTelemetry: vi.fn(async (_id: string, body: Record<string, unknown>) => {
        telemetry.push(body);
        return true;
      }),
    } as never;

    const watcher = new AdoptionWatcher({
      client: flaky,
      statePath: join(workspace, `tel-state-${n++}.json`),
    });
    watcher.track(entry({ transcriptPath: path, cwd: CWD }));

    await watcher.sweep();
    expect(telemetry, 'a reading must not be sent for events that did not land').toHaveLength(0);

    await watcher.sweep();
    watcher.stop();

    // Same ordinals both times: the hosted side treats the second as a no-op
    // for anything that did arrive.
    expect(batches).toEqual([[0], [0]]);
    expect(telemetry).toHaveLength(1);
    expect(telemetry[0].toolCalls).toBe(1);
  });

  /**
   * Found against a real bridge: the hosted side refused the reading (a column
   * it had not migrated yet), the events had already landed, and the session
   * then sat with stale dials until it next did something.
   */
  it('sends the reading again when only the reading failed, without re-sending events', async () => {
    telemetry = [];
    const path = join(workspace, `tel-${n}.jsonl`);
    writeFileSync(path, reply('msg_1', [edit('a.ts')]), 'utf8');

    const batches: number[][] = [];
    let refuse = true;
    const flaky = {
      reportSessionStatus: vi.fn(async () => {}),
      reportSessionComplete: vi.fn(async () => {}),
      streamEvents: vi.fn(async (_id: string, events: { seq: number }[]) => {
        batches.push(events.map((e) => e.seq));
        return true;
      }),
      reportTelemetry: vi.fn(async (_id: string, body: Record<string, unknown>) => {
        if (refuse) {
          refuse = false;
          return false;
        }
        telemetry.push(body);
        return true;
      }),
    } as never;

    const watcher = new AdoptionWatcher({
      client: flaky,
      statePath: join(workspace, `tel-state-${n++}.json`),
    });
    watcher.track(entry({ transcriptPath: path, cwd: CWD }));

    await watcher.sweep();
    await watcher.sweep();
    watcher.stop();

    // The events went once; only the reading was repeated.
    expect(batches).toEqual([[0]]);
    expect(telemetry).toHaveLength(1);
    expect(telemetry[0]).toMatchObject({ toolCalls: 1, tokensOut: 200 });
  });

  // `prompts` is a count of how many times a person prompted the session.
  it('carries no field that could hold content', async () => {
    const { watcher } = setup(reply('msg_1', [edit('a.ts')]));
    await watcher.sweep();
    watcher.stop();

    expect(Object.keys(telemetry[0]).sort()).toEqual([
      'costEstimated',
      'costUsd',
      'currentAction',
      'elapsedMs',
      'filesTouched',
      'idleMs',
      'prompts',
      'tokensCacheRead',
      'tokensCacheWrite',
      'tokensIn',
      'tokensOut',
      'toolCalls',
      'turns',
      'writeCalls',
    ]);
  });

  it('names the model, so sessions on different models are not compared as one', async () => {
    const withModel =
      JSON.stringify({
        type: 'assistant',
        timestamp: new Date(1_700_000_000_000).toISOString(),
        message: {
          id: 'msg_1',
          model: 'claude-opus-5[1m]',
          usage: { output_tokens: 200, cache_read_input_tokens: 5_000 },
          content: [edit('a.ts')],
        },
      }) + '\n';
    const { watcher } = setup(withModel);
    await watcher.sweep();
    watcher.stop();

    expect(telemetry[0].model).toBe('claude-opus-5');
  });
});
