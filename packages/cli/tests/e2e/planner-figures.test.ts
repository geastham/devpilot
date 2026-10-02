import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConductorWatcher, plannerFiguresEnabled } from '../../src/commands/bridge/conductor-watcher';

/**
 * A finished run's plan figures go to the hosted plane, once, before the
 * completion report — and nothing about sending them can cost the run that
 * report.
 */

const FIGURES = { v: 1, calls: 3, tasks: 4, tasksFirstAttempt: 3, tasksSettled: 4, model: 'claude-opus-5-20260101' };
const RUN = { sessionId: 'sesn_1', itemId: 'item 1/with?odd&chars', linearIdentifier: 'ENG-42' };
const DONE = { status: 'complete', completedWaves: [0], review: { plan: { waves: [{ tasks: [1] }] } } };

let order: string[];
let sent: { sessionId: string; figures: unknown }[];
let asked: string[];
let figuresAnswer: () => unknown;
let sendResult: () => Promise<boolean>;

const client = {
  reportSessionComplete: async () => {
    order.push('complete');
  },
  reportSessionStatus: async () => {},
  hostedUrl: () => 'https://devpilot.test',
  mirrorSessionPlan: async () => true,
  mirrorPlannerFigures: async (sessionId: string, figures: unknown) => {
    order.push('figures');
    sent.push({ sessionId, figures });
    return sendResult();
  },
} as never;

const fetchImpl = (async (url: string | URL) => {
  const href = String(url);
  asked.push(href);
  if (href.includes('/api/planner/figures')) return figuresAnswer() as never;
  return { ok: true, status: 200, json: async () => DONE } as never;
}) as unknown as typeof fetch;

const watcher = (over: Record<string, unknown> = {}) =>
  new ConductorWatcher({ client, cockpitUrl: 'http://cockpit.test', pollIntervalMs: 60_000, fetchImpl, ...over } as never);

beforeEach(() => {
  order = [];
  sent = [];
  asked = [];
  figuresAnswer = () => ({ ok: true, status: 200, json: async () => ({ itemId: RUN.itemId, figures: FIGURES }) });
  sendResult = async () => true;
  delete process.env.DEVPILOT_PLANNER_FIGURES;
});
afterEach(() => {
  delete process.env.DEVPILOT_PLANNER_FIGURES;
});

async function finish(w = watcher()) {
  w.watch(RUN);
  await w.sweep();
}

describe('plan figures at the end of a run', () => {
  it('are sent, as the cockpit gave them, before the completion report', async () => {
    await finish();

    expect(sent).toEqual([{ sessionId: 'sesn_1', figures: FIGURES }]);
    expect(order).toEqual(['figures', 'complete']);
  });

  it('are asked for by item, with the id escaped', async () => {
    await finish();
    expect(asked).toContain(`http://cockpit.test/api/planner/figures?itemId=${encodeURIComponent(RUN.itemId)}`);
  });

  it('are not sent when the cockpit has none for the item', async () => {
    figuresAnswer = () => ({ ok: true, status: 200, json: async () => ({ itemId: RUN.itemId, figures: null }) });
    await finish();
    expect(sent).toEqual([]);
    expect(order).toEqual(['complete']);
  });

  it('are skipped on a cockpit that predates the route', async () => {
    figuresAnswer = () => ({ ok: false, status: 404, json: async () => ({}) });
    await finish();
    expect(sent).toEqual([]);
    expect(order).toEqual(['complete']);
  });

  it('are not sent when switched off, and the cockpit is not asked', async () => {
    process.env.DEVPILOT_PLANNER_FIGURES = '0';
    await finish();
    expect(sent).toEqual([]);
    expect(asked.some((url) => url.includes('/api/planner/figures'))).toBe(false);
    expect(order).toEqual(['complete']);
  });
});

describe('sending figures never costs the completion report', () => {
  it('when the cockpit cannot be read', async () => {
    figuresAnswer = () => {
      throw new Error('ECONNRESET');
    };
    await finish();
    expect(order).toEqual(['complete']);
  });

  it('when the hosted plane refuses them', async () => {
    sendResult = async () => false;
    await finish();
    expect(order).toEqual(['figures', 'complete']);
  });

  it('when the send throws', async () => {
    sendResult = async () => {
      throw new Error('boom');
    };
    await finish();
    expect(order).toEqual(['figures', 'complete']);
  });

  it('when the client is an older one with no such method', async () => {
    const old = { ...(client as Record<string, unknown>) };
    delete old.mirrorPlannerFigures;
    await finish(watcher({ client: old }));
    expect(order).toEqual(['complete']);
  });
});

describe('the switch', () => {
  it('is on unless told otherwise', () => {
    expect(plannerFiguresEnabled({})).toBe(true);
    expect(plannerFiguresEnabled({ DEVPILOT_PLANNER_FIGURES: '1' })).toBe(true);
    for (const off of ['0', 'false', 'off', 'no', ' OFF ']) {
      expect(plannerFiguresEnabled({ DEVPILOT_PLANNER_FIGURES: off })).toBe(false);
    }
  });
});
