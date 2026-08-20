import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConductorWatcher } from '../../src/commands/bridge/conductor-watcher';

/**
 * The write-back: a finished conductor run must reach Linear.
 *
 * The hosted side already comments on the issue when
 * `POST /api/sessions/:id/complete` arrives. The planned path had no caller for
 * it, because the handler returns at the review gate and the run then continues
 * under the cockpit. So a planned ticket could run to completion with Linear
 * never told — the loop the user watches just stops.
 *
 * These pin the properties that make that not happen quietly: a terminal run is
 * reported once and only once, a still-running one is left alone, a cockpit
 * blip does not kill the watcher, and anything still tracked at shutdown is
 * surfaced rather than dropped.
 */

let completions: { sessionId: string; report: Record<string, unknown> }[] = [];
let statuses: { sessionId: string; report: Record<string, unknown> }[] = [];
const client = {
  reportSessionComplete: async (sessionId: string, report: Record<string, unknown>) => {
    completions.push({ sessionId, report });
  },
  reportSessionStatus: async (sessionId: string, report: Record<string, unknown>) => {
    statuses.push({ sessionId, report });
  },
} as never;

/** Cockpit stub: state per item id, plus optional failure injection. */
let states: Record<string, unknown> = {};
let failNext = 0;

const fetchImpl = (async (url: string | URL) => {
  if (failNext > 0) {
    failNext--;
    throw new Error('ECONNREFUSED');
  }
  const id = String(url).match(/\/api\/items\/([^/]+)\/conductor/)?.[1] ?? '';
  const state = states[id];
  if (!state) return { ok: false, status: 404, json: async () => ({}) } as never;
  return { ok: true, status: 200, json: async () => state } as never;
}) as unknown as typeof fetch;

function watcher(onLost?: (r: { linearIdentifier: string }) => void) {
  return new ConductorWatcher({
    client,
    cockpitUrl: 'http://cockpit.test',
    pollIntervalMs: 60_000, // sweeps are driven manually
    fetchImpl,
    onLost: onLost as never,
  });
}

const RUN = { sessionId: 'sesn_1', itemId: 'item_1', linearIdentifier: 'ENG-42' };

beforeEach(() => {
  completions = [];
  states = {};
  failNext = 0;
});

describe('conductor watcher → bridge completion', () => {
  it('reports a completed run so the hosted side can write back to Linear', async () => {
    states.item_1 = {
      status: 'complete',
      completedWaves: [0, 1, 2],
      review: { plan: { waves: [{ tasks: [1, 2] }, { tasks: [3] }] } },
    };

    const w = watcher();
    w.watch(RUN);
    await w.sweep();

    expect(completions).toHaveLength(1);
    expect(completions[0].sessionId).toBe('sesn_1');
    expect(completions[0].report.success).toBe(true);
    // The comment a human reads on the ticket.
    expect(completions[0].report.summary).toContain('3 waves');
    expect(completions[0].report.summary).toContain('3 tasks');
  });

  it('reports a failed run as a failure, carrying the reason', async () => {
    states.item_1 = { status: 'failed', errors: ['wave 0 1.6: CAPACITY'] };

    const w = watcher();
    w.watch(RUN);
    await w.sweep();

    expect(completions).toHaveLength(1);
    expect(completions[0].report.success).toBe(false);
    expect(completions[0].report.errorMessage).toContain('CAPACITY');
  });

  it('leaves a run that is still going', async () => {
    states.item_1 = { status: 'executing', awaiting: 'wave' };

    const w = watcher();
    w.watch(RUN);
    await w.sweep();

    expect(completions).toHaveLength(0);
    expect(w.tracked, 'it must keep watching').toBe(1);
  });

  it('reports a completion exactly once', async () => {
    // Linear comments are not idempotent: reporting twice posts twice.
    states.item_1 = { status: 'complete', completedWaves: [0] };

    const w = watcher();
    w.watch(RUN);
    await w.sweep();
    await w.sweep();
    await w.sweep();

    expect(completions).toHaveLength(1);
    expect(w.tracked).toBe(0);
  });

  it('ignores a duplicate watch of the same bridge session', async () => {
    states.item_1 = { status: 'executing' };

    const w = watcher();
    w.watch(RUN);
    w.watch(RUN);
    expect(w.tracked).toBe(1);
  });

  it('survives a cockpit blip and reports on the next sweep', async () => {
    states.item_1 = { status: 'complete', completedWaves: [0] };
    failNext = 1;

    const w = watcher();
    w.watch(RUN);
    await w.sweep(); // cockpit down — must not throw, must not drop the run
    expect(completions).toHaveLength(0);
    expect(w.tracked).toBe(1);

    await w.sweep();
    expect(completions).toHaveLength(1);
  });

  it('surfaces runs still in flight at shutdown instead of dropping them', async () => {
    // The watcher does not persist. A run lost to a restart is a ticket whose
    // completion is never reported, and that must be visible.
    states.item_1 = { status: 'executing' };
    const lost: string[] = [];

    const w = watcher((r) => lost.push(r.linearIdentifier));
    w.watch(RUN);
    w.stop();

    expect(lost).toEqual(['ENG-42']);
    expect(w.tracked).toBe(0);
  });
});


/**
 * Mid-flight narration.
 *
 * The watcher used to return early for any non-terminal state, so a run that
 * takes minutes to hours said nothing between "claimed" and "finished". Linear
 * marks an agent that stops emitting activities as unresponsive: AVA-10 showed
 * one thought, thirty minutes of silence, then "Stopped responding" — while the
 * planner was working correctly the entire time.
 */
describe('progress while the run is still going', () => {
  beforeEach(() => {
    completions = [];
    statuses = [];
    states = {};
    failNext = 0;
  });

  it('reports the review gate as something a human can act on', async () => {
    states.i1 = {
      status: 'planning',
      awaiting: 'review',
      score: { parallelizationScore: 0.8888 },
      review: { plan: { waves: [{ tasks: [1, 2] }, { tasks: [3] }] } },
    };

    const w = watcher();
    w.watch({ sessionId: 's1', itemId: 'i1', linearIdentifier: 'AVA-10' });
    await w.sweep();

    expect(statuses).toHaveLength(1);
    const msg = String(statuses[0].report.message);
    // The numbers a reviewer needs, and the fact that they are the blocker.
    expect(msg).toContain('2 waves');
    expect(msg).toContain('3 tasks');
    expect(msg).toContain('89% parallel');
    // The hosted side turns "awaiting review" into a Linear `elicitation`,
    // which is what moves the session to awaitingInput instead of leaving it
    // looking hung. If this substring goes, the session state silently
    // degrades to a plain thought.
    expect(msg).toMatch(/awaiting review/i);
    // Somewhere to go, not just something to read: the watcher's messages are
    // the ones that fire repeatedly, so they carry the link too.
    expect(msg).toContain('http://cockpit.test/?item=i1');
    expect(completions).toHaveLength(0);
  });

  it('does not repeat itself while nothing changes', async () => {
    states.i1 = { status: 'executing', currentWaveIndex: 0, lastDispatch: { dispatched: 3, queued: 0 } };

    const w = watcher();
    w.watch({ sessionId: 's1', itemId: 'i1', linearIdentifier: 'AVA-10' });
    await w.sweep();
    await w.sweep();
    await w.sweep();

    // Three sweeps, one message: Linear activities are not idempotent, and a
    // 30s poll would otherwise post the same line every 30 seconds forever.
    expect(statuses).toHaveLength(1);
    expect(String(statuses[0].report.message)).toContain('wave 1');
    expect(String(statuses[0].report.message)).toContain('http://cockpit.test/waves?item=i1');
  });

  it('speaks again once the run actually moves', async () => {
    states.i1 = { status: 'executing', currentWaveIndex: 0, lastDispatch: { dispatched: 3, queued: 0 } };
    const w = watcher();
    w.watch({ sessionId: 's1', itemId: 'i1', linearIdentifier: 'AVA-10' });
    await w.sweep();

    states.i1 = {
      status: 'executing',
      currentWaveIndex: 1,
      completedWaves: [0],
      lastDispatch: { dispatched: 2, queued: 0 },
    };
    await w.sweep();

    expect(statuses).toHaveLength(2);
    expect(String(statuses[1].report.message)).toContain('wave 2');
  });

  it('keeps watching when a progress report fails', async () => {
    states.i1 = { status: 'executing', currentWaveIndex: 0 };
    const boom = {
      reportSessionComplete: async () => {},
      reportSessionStatus: async () => {
        throw new Error('hosted plane down');
      },
    } as never;

    const w = new ConductorWatcher({
      client: boom,
      cockpitUrl: 'http://cockpit.test',
      pollIntervalMs: 60_000,
      fetchImpl,
    });
    w.watch({ sessionId: 's1', itemId: 'i1', linearIdentifier: 'AVA-10' });
    await w.sweep();

    // A failed narration must never cost us the run: completion is the thing
    // that actually matters, and it is still owed.
    expect(w.tracked).toBe(1);
  });
});


/**
 * Surviving a restart.
 *
 * The watcher held runs in memory only, so restarting the bridge orphaned
 * anything in flight — the run continued in the cockpit and Linear was never
 * told how it ended. That is what happened to AVA-10: the bridge was restarted
 * to pick up a new CLI, and the ticket was left showing an error for a run that
 * had not failed.
 */
describe('restart survival', () => {
  let dir: string;
  let statePath: string;

  beforeEach(() => {
    completions = [];
    statuses = [];
    states = {};
    failNext = 0;
    dir = mkdtempSync(join(tmpdir(), 'dp-watch-'));
    statePath = join(dir, 'nested', 'conductor-watch.json');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function persistentWatcher() {
    return new ConductorWatcher({
      client,
      cockpitUrl: 'http://cockpit.test',
      pollIntervalMs: 60_000,
      statePath,
      fetchImpl,
    });
  }

  it('re-adopts an in-flight run in a fresh process', async () => {
    states.i1 = { status: 'executing', currentWaveIndex: 0 };

    const first = persistentWatcher();
    first.watch({ sessionId: 's1', itemId: 'i1', linearIdentifier: 'AVA-10' });
    expect(first.tracked).toBe(1);

    // A new process — no shared memory with the one above.
    const second = persistentWatcher();
    expect(second.restore()).toBe(1);
    expect(second.tracked).toBe(1);

    // And it still reports completion, which is the whole point.
    states.i1 = { status: 'complete', completedWaves: [0, 1] };
    await second.sweep();
    expect(completions).toHaveLength(1);
    expect(completions[0].sessionId).toBe('s1');
  });

  it('forgets a run once it is reported, so it is not re-adopted', async () => {
    states.i1 = { status: 'complete', completedWaves: [0] };

    const first = persistentWatcher();
    first.watch({ sessionId: 's1', itemId: 'i1', linearIdentifier: 'AVA-10' });
    await first.sweep();
    expect(completions).toHaveLength(1);

    expect(persistentWatcher().restore()).toBe(0);
  });

  it('drops a restored run whose item the cockpit no longer has', async () => {
    // No state registered for this item — the cockpit 404s, meaning the item
    // is gone (database reset, or cleaned up while this bridge was down).
    const w = persistentWatcher();
    w.watch({ sessionId: 's1', itemId: 'gone', linearIdentifier: 'AVA-99' });
    await w.sweep();

    expect(w.tracked).toBe(0);
    // Crucially it does NOT invent an outcome for the ticket.
    expect(completions).toHaveLength(0);
  });

  it('starts anyway when the state file is corrupt', () => {
    writeFileSync(join(dir, 'bad.json'), '{not json', 'utf8');
    const w = new ConductorWatcher({
      client,
      cockpitUrl: 'http://cockpit.test',
      pollIntervalMs: 60_000,
      statePath: join(dir, 'bad.json'),
      fetchImpl,
    });
    // Losing the watch list degrades write-back; refusing to boot loses
    // everything.
    expect(() => w.restore()).not.toThrow();
    expect(w.restore()).toBe(0);
  });

  it('writes nothing when no statePath is configured', () => {
    const w = watcher();
    w.watch({ sessionId: 's1', itemId: 'i1', linearIdentifier: 'AVA-10' });
    expect(existsSync(statePath)).toBe(false);
  });
});
