/**
 * TRD 05 §9.8 — the client-side delivery guarantee.
 *
 * The claim under test: correctness comes from the SWEEP, not from Realtime.
 * These run with no Realtime at all, which is the point — if the loop only
 * worked when a socket was up, the guarantee would be a fiction.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DispatchLoop } from '../src/dispatch-loop';
import type { TaskDispatchMessage } from '@devpilot.sh/bridge-protocol';

function msg(queueId: string, sessionId = `sess_${queueId}`): TaskDispatchMessage {
  return {
    messageId: `m_${queueId}`,
    queueId,
    sessionId,
    orgId: 'org_1',
    workspaceId: 'ws_1',
    linearIssueId: 'iss_1',
    linearIdentifier: 'ENG-1',
    title: 'Test',
    teamId: 'team_1',
    repo: 'acme/api',
    targetOrchestratorId: 'orch_1',
    dispatchedAt: '2026-08-02T00:00:00.000Z',
  };
}

function fakeClient(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    poll: vi.fn(async () => [] as TaskDispatchMessage[]),
    claim: vi.fn(async (id: string) => msg(id)),
    release: vi.fn(async () => {}),
    ...overrides,
  } as never;
}

const loopOf = (client: unknown, handler: (m: TaskDispatchMessage) => Promise<void>, extra = {}) =>
  new DispatchLoop({
    client: client as never,
    orchestratorId: 'orch_1',
    handler,
    realtime: null, // deliberately: prove the sweep alone is sufficient
    sweepIntervalMs: 60_000,
    ...extra,
  });

beforeEach(() => vi.clearAllMocks());

describe('sweep is the delivery mechanism', () => {
  it('picks up work on start with no realtime connection', async () => {
    const handled: string[] = [];
    const client = fakeClient({ poll: vi.fn(async () => [msg('q1'), msg('q2')]) });
    const loop = loopOf(client, async (m) => void handled.push(m.queueId));

    await loop.start();
    await loop.stop();

    expect(handled).toEqual(['q1', 'q2']);
  });

  it('a losing claim is a normal outcome, not an error', async () => {
    const handled: string[] = [];
    const client = fakeClient({
      poll: vi.fn(async () => [msg('q1'), msg('q2')]),
      // q1 was taken by another machine between poll and claim.
      claim: vi.fn(async (id: string) => (id === 'q1' ? null : msg(id))),
    });
    const onError = vi.fn();
    const loop = loopOf(client, async (m) => void handled.push(m.queueId), { onError });

    await loop.start();
    await loop.stop();

    expect(handled).toEqual(['q2']);
    expect(onError).not.toHaveBeenCalled();
  });

  it('respects maxConcurrent', async () => {
    const client = fakeClient({
      poll: vi.fn(async () => [msg('q1'), msg('q2'), msg('q3'), msg('q4')]),
    });
    let peak = 0;
    let active = 0;
    const loop = loopOf(
      client,
      async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active -= 1;
      },
      { maxConcurrent: 2 },
    );

    await loop.start();
    await loop.stop();
    expect(peak).toBeLessThanOrEqual(2);
  });
});

describe('failures release the claim', () => {
  it('a throwing handler releases the row rather than stranding it', async () => {
    const client = fakeClient({ poll: vi.fn(async () => [msg('q1')]) });
    const onError = vi.fn();
    const loop = loopOf(client, async () => {
      throw new Error('agent exploded');
    }, { onError });

    await loop.start();
    await loop.stop();

    // Stranding it would mean up to 30 minutes of invisible work waiting on
    // the server-side stale sweep.
    expect((client as never as { release: ReturnType<typeof vi.fn> }).release)
      .toHaveBeenCalledWith('q1', 'agent exploded');
    expect(onError).toHaveBeenCalled();
  });

  it('a failing release does not take the loop down', async () => {
    const client = fakeClient({
      poll: vi.fn(async () => [msg('q1')]),
      release: vi.fn(async () => {
        throw new Error('bridge unreachable');
      }),
    });
    const loop = loopOf(client, async () => {
      throw new Error('agent exploded');
    }, { onError: vi.fn() });

    await expect(loop.start()).resolves.not.toThrow();
    await loop.stop();
  });

  it('a failing poll is reported but does not stop the loop', async () => {
    const client = fakeClient({
      poll: vi.fn(async () => {
        throw new Error('network down');
      }),
    });
    const onError = vi.fn();
    const loop = loopOf(client, async () => {}, { onError });

    await expect(loop.start()).resolves.not.toThrow();
    expect(onError).toHaveBeenCalled();
    await loop.stop();
  });
});

describe('lifecycle', () => {
  it('does nothing after stop', async () => {
    const client = fakeClient({ poll: vi.fn(async () => [msg('q1')]) });
    const handled: string[] = [];
    const loop = loopOf(client, async (m) => void handled.push(m.queueId));

    await loop.start();
    await loop.stop();
    const countAfterStop = handled.length;

    await loop.sweep(); // must be inert
    expect(handled.length).toBe(countAfterStop);
  });

  it('reports activeJobs for the heartbeat', async () => {
    const client = fakeClient({ poll: vi.fn(async () => [msg('q1')]) });
    let observed = -1;
    const loop = loopOf(client, async () => {
      observed = loop.activeJobs;
    });

    await loop.start();
    await loop.stop();

    expect(observed).toBe(1);
    expect(loop.activeJobs).toBe(0); // settled afterwards
  });
});

describe('the removed Pub/Sub transport', () => {
  it('throws an actionable upgrade message rather than a GCP auth error', async () => {
    const { PubSubSubscriber } = await import('../src/pubsub');
    expect(() => new PubSubSubscriber()).toThrow(/removed in 0\.2\.0/i);
    expect(() => new PubSubSubscriber()).toThrow(/upgrade the devpilot cli/i);
  });
});
