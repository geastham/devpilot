import { describe, it, expect, afterAll, vi } from 'vitest';
import { mkdtempSync, writeFileSync, appendFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionObserver } from '../../src/commands/bridge/observer';

/**
 * Instruments for sessions that are only observed.
 *
 * Observation is the default and placement is opt-in, so on a real fleet nearly
 * every session is one of these. Until the observer sent readings they reached
 * the cockpit as a title and a status with every dial dark.
 */

const workspace = mkdtempSync(join(tmpdir(), 'devpilot-observer-'));
afterAll(() => rmSync(workspace, { recursive: true, force: true }));

const CWD = '/home/dev/acme/widget';
const key = (n: number) => String(n).padStart(64, 'a');
let n = 0;

function reply(id: string, file: string, at = 0): string {
  return (
    JSON.stringify({
      type: 'assistant',
      timestamp: new Date(1_700_000_000_000 + at * 1000).toISOString(),
      message: {
        id,
        usage: { input_tokens: 10, output_tokens: 200, cache_read_input_tokens: 5_000 },
        content: [{ type: 'tool_use', name: 'Edit', input: { file_path: `${CWD}/${file}` } }],
      },
    }) + '\n'
  );
}

function transcript(content: string): string {
  const path = join(workspace, `t-${n++}.jsonl`);
  writeFileSync(path, content, 'utf8');
  return path;
}

function setup(over: { isWatched?: (k: string) => boolean; statePath?: string } = {}) {
  const streamed: { sessionId: string; seqs: number[] }[] = [];
  const telemetry: { sessionId: string; body: Record<string, unknown> }[] = [];
  const client = {
    streamEvents: vi.fn(async (sessionId: string, events: { seq: number }[]) => {
      streamed.push({ sessionId, seqs: events.map((e) => e.seq) });
      return true;
    }),
    reportTelemetry: vi.fn(async (sessionId: string, body: Record<string, unknown>) => {
      telemetry.push({ sessionId, body });
      return true;
    }),
  } as never;

  const observer = new SessionObserver({
    client,
    machineName: 'test-machine',
    repos: [],
    isWatched: over.isWatched,
    readingsStatePath: over.statePath,
  });
  return { observer, streamed, telemetry };
}

const located = (entries: [string, string][]) =>
  new Map(entries.map(([k, path]) => [k, { transcriptPath: path, sessionUuid: 'u', cwd: CWD }]));

describe('observer instrument readings', () => {
  it('sends a reading for an observed session, addressed by its hosted id', async () => {
    const { observer, streamed, telemetry } = setup();
    const path = transcript(reply('msg_1', 'a.ts'));

    const sent = await observer.sendReadings(
      [{ key: key(1), label: 'acme/widget', live: true }],
      { [key(1)]: 'sess_1' },
      located([[key(1), path]]),
    );

    expect(sent).toBe(1);
    expect(streamed).toEqual([{ sessionId: 'sess_1', seqs: [0] }]);
    expect(telemetry[0].sessionId).toBe('sess_1');
    expect(telemetry[0].body).toMatchObject({
      toolCalls: 1,
      filesTouched: ['a.ts'],
      tokensOut: 200,
      tokensCacheRead: 5_000,
    });
  });

  it('sends only what was appended on the next sweep', async () => {
    const { observer, streamed } = setup();
    const path = transcript(reply('msg_1', 'a.ts'));
    const args = [
      [{ key: key(1), label: 'acme/widget', live: true }],
      { [key(1)]: 'sess_1' },
      located([[key(1), path]]),
    ] as const;

    await observer.sendReadings(...args);
    // Nothing changed: nothing is sent.
    expect(await observer.sendReadings(...args)).toBe(0);

    appendFileSync(path, reply('msg_2', 'b.ts', 5));
    const when = Date.now() / 1000 + 10;
    utimesSync(path, when, when);
    await observer.sendReadings(...args);

    expect(streamed.map((s) => s.seqs)).toEqual([[0], [1]]);
  });

  it('stays silent for a session the bridge was not given an id for', async () => {
    const { observer, telemetry } = setup();
    const path = transcript(reply('msg_1', 'a.ts'));

    // An older bridge, or a row this machine does not own: no id, no reading.
    await observer.sendReadings(
      [{ key: key(1), label: 'acme/widget', live: true }],
      {},
      located([[key(1), path]]),
    );
    expect(telemetry).toHaveLength(0);
  });

  it('leaves a session alone when the adoption watcher already follows it', async () => {
    const { observer, telemetry } = setup({ isWatched: (k) => k === key(1) });
    const path = transcript(reply('msg_1', 'a.ts'));

    await observer.sendReadings(
      [{ key: key(1), label: 'acme/widget', live: true }],
      { [key(1)]: 'sess_1' },
      located([[key(1), path]]),
    );
    expect(telemetry).toHaveLength(0);
  });

  /**
   * A first connect can find a hundred sessions. Reading them all in one pass
   * would be several hundred requests before the bridge did anything else.
   */
  it('catches a large fleet up over several sweeps, live sessions first', async () => {
    const { observer, telemetry } = setup();
    const candidates = Array.from({ length: 12 }, (_, i) => ({
      key: key(i),
      label: 'acme/widget',
      // The last two are the live ones; they must not wait behind ten ended.
      live: i >= 10,
    }));
    const ids = Object.fromEntries(candidates.map((c, i) => [c.key, `sess_${i}`]));
    const locations = located(candidates.map((c) => [c.key, transcript(reply('msg_1', 'a.ts'))]));

    await observer.sendReadings(candidates, ids, locations);
    expect(telemetry).toHaveLength(8);
    expect(telemetry.slice(0, 2).map((t) => t.sessionId).sort()).toEqual(['sess_10', 'sess_11']);

    await observer.sendReadings(candidates, ids, locations);
    expect(telemetry).toHaveLength(12);
  });

  it('resumes from where a previous process stopped, rather than re-sending everything', async () => {
    const statePath = join(workspace, 'readings.json');
    const path = transcript(reply('msg_1', 'a.ts'));
    const args = [
      [{ key: key(1), label: 'acme/widget', live: true }],
      { [key(1)]: 'sess_1' },
      located([[key(1), path]]),
    ] as const;

    const first = setup({ statePath });
    await first.observer.sendReadings(...args);

    const second = setup({ statePath });
    expect(await second.observer.sendReadings(...args)).toBe(0);
    expect(second.streamed).toHaveLength(0);
  });
});
