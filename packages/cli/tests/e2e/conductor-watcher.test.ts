import { describe, it, expect, beforeEach } from 'vitest';
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
const client = {
  reportSessionComplete: async (sessionId: string, report: Record<string, unknown>) => {
    completions.push({ sessionId, report });
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
