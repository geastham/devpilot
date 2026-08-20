import { describe, it, expect, beforeEach } from 'vitest';
import { CommandApplier } from '../../src/commands/bridge/command-applier';

/**
 * The return path.
 *
 * Every other flow in the bridge runs one way: work comes down, status goes up.
 * This carries the one thing a person has to decide — whether a plan is worth
 * spending money on — back to the conductor. Without it a hosted customer could
 * watch a run reach its review gate with no way to answer it, which made the
 * mirrored plan a picture rather than a cockpit.
 */

let pending: any[] = [];
let acks: { ids: string[]; status: string; error?: string }[] = [];
let posted: { url: string; body: any }[] = [];
let nextResponse: { ok: boolean; status: number; text?: string } = { ok: true, status: 200 };
let throwOnFetch: string | null = null;

const client = {
  pollSessionCommands: async () => pending,
  acknowledgeCommands: async (ids: string[], status: string, error?: string) => {
    acks.push({ ids, status, error });
    return true;
  },
} as never;

const fetchImpl = (async (url: string, init: RequestInit) => {
  if (throwOnFetch) throw new Error(throwOnFetch);
  posted.push({ url: String(url), body: JSON.parse(String(init.body)) });
  return {
    ok: nextResponse.ok,
    status: nextResponse.status,
    text: async () => nextResponse.text ?? '',
  };
}) as unknown as typeof fetch;

function applier(resolve: (s: string) => string | undefined = () => 'item_1') {
  return new CommandApplier({
    client,
    cockpitUrl: 'http://cockpit.test',
    resolveItemId: resolve,
    fetchImpl,
    requestTimeoutMs: 5_000,
  });
}

beforeEach(() => {
  pending = [];
  acks = [];
  posted = [];
  nextResponse = { ok: true, status: 200 };
  throwOnFetch = null;
});

describe('applying a hosted decision', () => {
  it('resumes the conductor with an approve', async () => {
    pending = [{ id: 'c1', sessionId: 's1', command: 'approve' }];
    await applier().sweep();

    expect(posted).toHaveLength(1);
    expect(posted[0].url).toBe('http://cockpit.test/api/items/item_1/conductor');
    expect(posted[0].body).toEqual({ decision: { action: 'approve' } });
    expect(acks).toEqual([{ ids: ['c1'], status: 'applied', error: undefined }]);
  });

  it('carries re-plan constraints through as a refine decision', async () => {
    pending = [
      {
        id: 'c2',
        sessionId: 's1',
        command: 'replan',
        payload: { constraints: ['do not touch src/db'] },
      },
    ];
    await applier().sweep();

    expect(posted[0].body).toEqual({
      decision: { action: 'refine', constraints: ['do not touch src/db'] },
    });
  });

  it('acknowledges only after the conductor accepts', async () => {
    // Acknowledging first would let a decision a human made vanish because the
    // conductor rejected it.
    nextResponse = { ok: false, status: 500, text: 'CONDUCTOR_FAILED' };
    pending = [{ id: 'c3', sessionId: 's1', command: 'approve' }];
    await applier().sweep();

    expect(acks).toHaveLength(1);
    expect(acks[0].status).toBe('failed');
    expect(acks[0].error).toContain('500');
  });

  it('leaves a command pending when the cockpit is unreachable', async () => {
    // A laptop asleep is not a rejection. Failing here would discard a decision
    // that was never actually considered.
    throwOnFetch = 'fetch failed';
    pending = [{ id: 'c4', sessionId: 's1', command: 'approve' }];
    await applier().sweep();

    expect(acks).toHaveLength(0);
  });

  it('fails a command for a run this bridge is not tracking', async () => {
    // Permanent from here: there is nothing to apply the decision to, and a
    // spinner that never resolves is worse than a reported failure.
    pending = [{ id: 'c5', sessionId: 'unknown', command: 'approve' }];
    await applier(() => undefined).sweep();

    expect(posted).toHaveLength(0);
    expect(acks[0].status).toBe('failed');
  });

  it('applies commands in the order they were queued', async () => {
    pending = [
      { id: 'c6', sessionId: 's1', command: 'replan', payload: { constraints: ['a'] } },
      { id: 'c7', sessionId: 's1', command: 'approve' },
    ];
    await applier().sweep();

    // Out of order, an approve would resume a run the re-plan was meant to
    // replace.
    expect(posted.map((p) => p.body.decision.action)).toEqual(['refine', 'approve']);
  });

  it('survives a hosted plane that cannot be polled', async () => {
    const broken = {
      pollSessionCommands: async () => {
        throw new Error('hosted down');
      },
      acknowledgeCommands: async () => true,
    } as never;

    await expect(
      new CommandApplier({
        client: broken,
        cockpitUrl: 'http://cockpit.test',
        resolveItemId: () => 'item_1',
        fetchImpl,
      }).sweep()
    ).resolves.toBeUndefined();
  });
});
