import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ResumeApplier, type ResumeTarget } from '../../src/commands/bridge/resume-applier';

/**
 * TRD 23 §7.2. Most of what matters here is what the applier REFUSES: a resume
 * that lands on a live session corrupts a transcript, and one that lands
 * nowhere leaves a cockpit button spinning forever.
 */

const workspace = mkdtempSync(join(tmpdir(), 'devpilot-resume-'));
afterAll(() => rmSync(workspace, { recursive: true, force: true }));

let acks: { ids: string[]; status: string; error?: string }[] = [];
let posts: { url: string; body: Record<string, unknown> }[] = [];

function client() {
  return {
    acknowledgeCommands: vi.fn(async (ids: string[], status: string, error?: string) => {
      acks.push({ ids, status, error });
      return true;
    }),
  } as never;
}

let seq = 0;
/** A transcript last written `ageMs` ago. */
function transcript(ageMs: number): string {
  const path = join(workspace, `t-${seq++}.jsonl`);
  writeFileSync(
    path,
    `${JSON.stringify({ type: 'user', cwd: '/tmp/x', message: { role: 'user', content: 'go' } })}\n`,
    'utf8',
  );
  const when = (Date.now() - ageMs) / 1000;
  utimesSync(path, when, when);
  return path;
}

function command(over: Record<string, unknown> = {}) {
  return {
    id: 'cmd_1',
    sessionId: 'sess_1',
    command: 'resume' as const,
    payload: { adoptionKey: 'a'.repeat(64) },
    ...over,
  };
}

function applier(
  target: ResumeTarget | undefined,
  fetchImpl: typeof fetch = vi.fn(async () => new Response('', { status: 201 })) as never,
) {
  return new ResumeApplier({
    client: client(),
    sessionApiUrl: 'http://127.0.0.1:3900',
    callbackUrl: 'https://devpilot.sh/api/orchestrator',
    resolveTarget: () => target,
    fetchImpl: ((url: string, init: RequestInit) => {
      posts.push({ url: String(url), body: JSON.parse(String(init.body ?? '{}')) });
      return (fetchImpl as unknown as (u: string, i: RequestInit) => Promise<Response>)(url, init);
    }) as never,
  });
}

function held(): ResumeTarget {
  return {
    transcriptPath: transcript(60 * 60_000),
    sessionUuid: '4487eba7-a0cd-4ce4-9cca-2e180e1b3701',
    repo: 'acme/widget',
    cwd: '/tmp/x',
  };
}

beforeEach(() => {
  acks = [];
  posts = [];
});

describe('ResumeApplier', () => {
  it('only handles resume', () => {
    expect(ResumeApplier.handles(command())).toBe(true);
    expect(ResumeApplier.handles(command({ command: 'approve' }))).toBe(false);
  });

  it('resumes a held session by its local uuid', async () => {
    await applier(held()).apply(command());

    expect(posts).toHaveLength(1);
    expect(posts[0].body.resumeSessionId).toBe('4487eba7-a0cd-4ce4-9cca-2e180e1b3701');
    expect(posts[0].body.sessionId).toBe('sess_1');
    expect(acks[0]).toMatchObject({ status: 'applied' });
  });

  it('passes the message through as the prompt', async () => {
    await applier(held()).apply(
      command({ payload: { adoptionKey: 'a'.repeat(64), message: 'Finish the migration.' } }),
    );
    expect(posts[0].body.prompt).toBe('Finish the migration.');
  });

  /**
   * Taking the wheel with nothing to say is a legitimate request. An empty
   * turn would produce an empty answer, and the point of picking a session up
   * is to find out where it got to.
   */
  it('asks the agent to take stock when there is nothing to say', async () => {
    await applier(held()).apply(command());
    expect(String(posts[0].body.prompt)).toContain('Summarise where this session got to');
  });

  /** T23-AC-04 — the correctness rule, not a courtesy. */
  it('refuses a session that is still live', async () => {
    const target = { ...held(), transcriptPath: transcript(5_000) };
    await applier(target).apply(command());

    expect(posts, 'nothing may be spawned against a live transcript').toHaveLength(0);
    expect(acks[0].status).toBe('failed');
    expect(acks[0].error).toContain('still running');
  });

  /** T23-AC-10 — the ledger is per-machine, and saying so beats spinning. */
  it('refuses when this machine does not know the session', async () => {
    await applier(undefined).apply(command());
    expect(posts).toHaveLength(0);
    expect(acks[0].status).toBe('failed');
    expect(acks[0].error).toContain('not tracking that session');
  });

  it('refuses a command carrying no session key', async () => {
    await applier(held()).apply(command({ payload: {} }));
    expect(posts).toHaveLength(0);
    expect(acks[0].status).toBe('failed');
  });

  it('refuses when the transcript has gone', async () => {
    const target = { ...held(), transcriptPath: join(workspace, 'deleted.jsonl') };
    await applier(target).apply(command());
    expect(acks[0].status).toBe('failed');
    expect(acks[0].error).toContain('no longer on this machine');
  });

  /** A retried acknowledgement must not start a second agent. */
  it('treats a 409 from the runner as success', async () => {
    const conflict = vi.fn(async () => new Response('', { status: 409 })) as never;
    await applier(held(), conflict).apply(command());
    expect(acks[0].status).toBe('applied');
  });

  it('reports a runner refusal rather than hiding it', async () => {
    const refuse = vi.fn(async () => new Response('no capacity', { status: 503 })) as never;
    await applier(held(), refuse).apply(command());
    expect(acks[0].status).toBe('failed');
    expect(acks[0].error).toContain('503');
  });

  /**
   * Left PENDING, unlike every refusal above: a runner that is not up yet is a
   * transient condition, and failing would throw away a decision a person made
   * because a daemon was starting.
   */
  it('leaves the command queued when the runner is unreachable', async () => {
    const down = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as never;
    await applier(held(), down).apply(command());
    expect(acks, 'a transient failure must not consume the decision').toHaveLength(0);
  });

  /** T23-AC-06 — the uuid is resolved here and never sent upward. */
  it('never sends the uuid anywhere but the local runner', async () => {
    await applier(held()).apply(command());
    expect(posts[0].url).toContain('127.0.0.1:3900');
    expect(JSON.stringify(acks)).not.toContain('4487eba7');
  });
});
