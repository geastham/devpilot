import { describe, it, expect, afterAll } from 'vitest';
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findJoinLink, parseJoinLink } from '@devpilot.sh/bridge-protocol';
import { createTools } from '../src/index';
import type { Clipboard } from '../src/delivery';

/**
 * Starting a session from inside an agent, and two agents using one.
 *
 * The claim under test is the one the package header makes: a link has to
 * reach a person, and it gets there WITHOUT passing through either model's
 * conversation. So the assertions that matter are about where the key is not.
 */

const workspace = mkdtempSync(join(tmpdir(), 'devpilot-mcp-share-'));
afterAll(() => rmSync(workspace, { recursive: true, force: true }));

/** A bridge with real session state: several participants, a mode, a transcript. */
function makeBridge() {
  const requests: Array<{ url: string; method: string; headers: string; body: string }> = [];
  const messages: Array<Record<string, unknown>> = [];
  const participants: Array<Record<string, unknown>> = [];
  let mode = 'observe';
  let seq = 0;

  const session = () => ({
    id: 'sess_1',
    title: 'Checkout 500s',
    mode,
    keyVersion: 1,
    lastSeq: seq,
    createdAt: new Date().toISOString(),
    ...asked,
    expiresAt: '2026-10-06T12:00:00.000Z',
  });
  /** What the starter said the session was for, as a newer hosted plane echoes it. */
  let asked: Record<string, unknown> = {};

  const fetchImpl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? init.body : '';
    const headers = (init.headers ?? {}) as Record<string, string>;
    requests.push({ url, method, headers: JSON.stringify(headers), body });

    const json = (status: number, payload: unknown) =>
      new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });

    if (url.endsWith('/api/sessions/shared') && method === 'POST') {
      if (headers.Authorization !== 'Bearer dp_orch_test') return json(401, { error: { message: 'no' } });
      const { intent, repo } = JSON.parse(body);
      asked = { ...(intent ? { intent } : {}), ...(repo ? { repo } : {}) };
      return json(201, { session: session() });
    }
    if (url.endsWith('/mode') && method === 'POST') {
      mode = JSON.parse(body).mode;
      return json(200, { session: session() });
    }
    if (url.endsWith('/join')) {
      const n = participants.length + 1;
      const p = {
        id: `part_${n}`,
        sessionId: 'sess_1',
        kind: 'agent',
        displayName: JSON.parse(body).displayName,
        agentKind: 'claude-code',
        joinedAt: new Date().toISOString(),
      };
      participants.push(p);
      return json(200, {
        participantToken: `tok_${n}`,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        participant: p,
        session: session(),
      });
    }
    if (url.includes('/messages') && method === 'POST') {
      seq += 1;
      const parsed = JSON.parse(body);
      const row = {
        id: `m${seq}`,
        sessionId: 'sess_1',
        participantId: `part_${headers.Authorization.replace('Bearer tok_', '')}`,
        ciphertext: parsed.ciphertext,
        keyVersion: parsed.keyVersion,
        kind: parsed.kind,
        seq,
        createdAt: new Date().toISOString(),
      };
      messages.push(row);
      return json(201, { message: row });
    }
    if (url.includes('/messages')) {
      const since = Number(new URL(url).searchParams.get('since') ?? 0);
      return json(200, {
        messages: messages.filter((m) => (m.seq as number) > since),
        latestSeq: seq,
        hasMore: false,
      });
    }
    return json(200, { session: session(), participants });
  }) as typeof fetch;

  return { fetchImpl, requests, messages, setMode: (m: string) => (mode = m) };
}

/** One clipboard, shared — the way two tools on one desk would share it. */
function makeClipboard(available = true): Clipboard & { text: string | null } {
  const board = {
    text: null as string | null,
    write(value: string) {
      if (!available) return false;
      board.text = value;
      return true;
    },
    read() {
      return board.text;
    },
  };
  return board;
}

function agent(
  bridge: ReturnType<typeof makeBridge>,
  clipboard: Clipboard,
  hostname: string,
  env: NodeJS.ProcessEnv = { DEVPILOT_BRIDGE_TOKEN: 'dp_orch_test', DEVPILOT_BRIDGE_URL: 'https://devpilot.test' },
) {
  return createTools({
    env,
    clipboard,
    hostname,
    handoffDir: join(workspace, 'handoffs', hostname),
    credentialsPath: join(workspace, 'no-such-credentials.json'),
    fetchImpl: bridge.fetchImpl,
    waitIntervalMs: 250,
    repo: () => 'acme/storefront',
  });
}

const said = (result: { content: { text: string }[] }) => result.content[0].text;

describe('starting a session from inside an agent', () => {
  it('creates the session, posts the context encrypted, and hands the link to the person', async () => {
    const bridge = makeBridge();
    const clipboard = makeClipboard();
    const alice = agent(bridge, clipboard, 'alice-mbp.local');

    const result = said(
      await alice.share({ title: 'Checkout 500s', context: 'The retry wrapper swallows the 500.' }),
    );

    expect(result).toContain('Started "Checkout 500s"');
    expect(result).toContain('on the clipboard');
    // The context is in the session — and only as ciphertext.
    expect(bridge.messages).toHaveLength(1);
    expect(JSON.stringify(bridge.requests)).not.toContain('retry wrapper');

    // The person has something they can send as it is.
    expect(clipboard.text).toContain('Join my DevPilot shared session: "Checkout 500s"');
    expect(clipboard.text).toContain('claude mcp add --scope user devpilot-local');
    expect(findJoinLink(clipboard.text ?? '')).toMatch(/^https:\/\/devpilot\.test\/s\/sess_1#k=/);
  });

  /**
   * THE TEST THIS TOOL EXISTS TO PASS. A tool result is context the model
   * re-sends to its provider on every later turn. A key that has been there is
   * no longer only on the machines holding the link.
   */
  it('never puts the link or the key into a tool result', async () => {
    const bridge = makeBridge();
    const clipboard = makeClipboard();
    const alice = agent(bridge, clipboard, 'alice-mbp.local');

    const result = said(await alice.share({ title: 'Checkout 500s', context: 'context' }));
    const { key } = parseJoinLink(findJoinLink(clipboard.text ?? '')!);

    expect(result).not.toContain(key);
    expect(result).not.toContain('#k=');
    // And, as ever, it is in nothing sent to the bridge.
    for (const r of bridge.requests) {
      expect(r.url + r.headers + r.body).not.toContain(key);
    }
  });

  it('saves the handoff where only its owner can read it', async () => {
    const bridge = makeBridge();
    const alice = agent(bridge, makeClipboard(), 'alice-mbp.local');
    const result = said(await alice.share({ title: 'Checkout 500s', context: 'context' }));

    const path = /saved at (\S+?)\)/.exec(result)?.[1];
    expect(path).toBeTruthy();
    expect(statSync(path!).mode & 0o777).toBe(0o600);
    expect(readFileSync(path!, 'utf8')).toContain('#k=');
  });

  it('falls back to the file when there is no clipboard, and says so', async () => {
    const bridge = makeBridge();
    const alice = agent(bridge, makeClipboard(false), 'ci-runner');
    const result = said(await alice.share({ title: 'Checkout 500s', context: 'context' }));

    expect(result).toContain('No clipboard is available here');
    expect(result).toContain('readable only by this user');
    expect(result).not.toContain('#k=');
  });

  it('shows the link only when asked to, and says what that costs', async () => {
    const bridge = makeBridge();
    const alice = agent(bridge, makeClipboard(), 'alice-mbp.local');
    const result = said(
      await alice.share({ title: 'Checkout 500s', context: 'context', deliver: 'inline' }),
    );

    expect(result).toContain('#k=');
    expect(result).toContain("now part of this conversation's transcript");
  });

  it('says what to do when the machine has no token, rather than failing obscurely', async () => {
    const bridge = makeBridge();
    const alice = agent(bridge, makeClipboard(), 'alice-mbp.local', {});
    const result = said(await alice.share({ title: 'Checkout 500s', context: 'context' }));

    expect(result).toContain('no DevPilot machine token');
    expect(result).toContain('Joining a session someone else started needs no token');
    expect(bridge.requests).toHaveLength(0);
  });

  /** DECISION A: nothing here makes autonomy the default. */
  it('starts in observe unless the person asked for more', async () => {
    const bridge = makeBridge();
    const clipboard = makeClipboard();
    const alice = agent(bridge, clipboard, 'alice-mbp.local');
    const result = said(await alice.share({ title: 'Checkout 500s', context: 'context' }));

    expect(bridge.requests.some((r) => r.url.endsWith('/mode'))).toBe(false);
    expect(result).toContain('Mode is observe');
    expect(clipboard.text).toContain('observe mode: post only when I ask you to');
  });

  it('bounds auto mode when it is asked for, and tells the other side the bounds', async () => {
    const bridge = makeBridge();
    const clipboard = makeClipboard();
    const alice = agent(bridge, clipboard, 'alice-mbp.local');
    await alice.share({ title: 'Checkout 500s', context: 'context', mode: 'auto' });

    const modeRequest = bridge.requests.find((r) => r.url.endsWith('/mode'))!;
    // Never unbounded: the defaults are sent, not omitted.
    expect(JSON.parse(modeRequest.body)).toEqual({ mode: 'auto', autoBudget: 20, autoTtlMinutes: 30 });
    expect(clipboard.text).toContain('up to 20 agent messages or 30 minutes');
  });
});

describe('joining without pasting the link into a prompt', () => {
  it('takes the link from a copied handoff message', async () => {
    const bridge = makeBridge();
    const clipboard = makeClipboard();
    await agent(bridge, clipboard, 'alice-mbp.local').share({ title: 'Checkout 500s', context: 'context' });

    const bob = agent(bridge, clipboard, 'bob-linux', {});
    const result = said(await bob.join({}));

    expect(result).toContain('Joined "Checkout 500s"');
    expect(result).not.toContain('#k=');
  });

  /**
   * The session runner wires this server into a dispatched agent and passes
   * the link in the server's environment, telling the agent to call join with
   * no `url`. `url` was required and nothing read the variable, so that path
   * could never join.
   */
  it('takes the link from the environment a runner supplied', async () => {
    const bridge = makeBridge();
    const clipboard = makeClipboard();
    await agent(bridge, clipboard, 'alice-mbp.local').share({ title: 'Checkout 500s', context: 'context' });
    const link = findJoinLink(clipboard.text ?? '')!;

    const worker = agent(bridge, makeClipboard(), 'worker', { DEVPILOT_SESSION_LINK: link });
    expect(said(await worker.join({}))).toContain('Joined "Checkout 500s"');
  });

  it('accepts a link written without a scheme, the way it gets typed in chat', async () => {
    const bridge = makeBridge();
    const clipboard = makeClipboard();
    await agent(bridge, clipboard, 'alice-mbp.local').share({ title: 'Checkout 500s', context: 'context' });
    const bare = findJoinLink(clipboard.text ?? '')!.replace('https://', '');

    const bob = agent(bridge, makeClipboard(), 'bob-linux', {});
    expect(said(await bob.join({ url: bare }))).toContain('Joined "Checkout 500s"');
    expect(bridge.requests.at(-1)?.url.startsWith('https://devpilot.test/')).toBe(true);
  });

  it('says there is no link rather than guessing, when the clipboard holds something else', async () => {
    const bridge = makeBridge();
    const clipboard = makeClipboard();
    clipboard.write('just some notes about lunch');

    const bob = agent(bridge, clipboard, 'bob-linux', {});
    expect(said(await bob.join({}))).toContain('No join link to use');
    expect(bridge.requests).toHaveLength(0);
  });

  it('tells two agents apart in the transcript', async () => {
    const bridge = makeBridge();
    const clipboard = makeClipboard();
    const alice = agent(bridge, clipboard, 'alice-mbp.local');
    await alice.share({ title: 'Checkout 500s', context: 'context' });
    const bob = agent(bridge, clipboard, 'bob-linux', {});
    await bob.join({});

    const roster = said(await bob.who());
    expect(roster).toContain('Claude Code (alice-mbp)');
    expect(roster).toContain('Claude Code (bob-linux)');
  });
});

describe('two agents on one session', () => {
  async function pair(mode: 'observe' | 'relay' | 'auto') {
    const bridge = makeBridge();
    const clipboard = makeClipboard();
    const alice = agent(bridge, clipboard, 'alice-mbp.local');
    await alice.share({
      title: 'Checkout 500s',
      context: 'The retry wrapper swallows the 500. I ruled out the gateway.',
      mode,
    });
    const bob = agent(bridge, clipboard, 'bob-linux', {});
    await bob.join({});
    return { bridge, alice, bob };
  }

  it('carries context from one agent to the other without a human retyping it', async () => {
    const { bob } = await pair('observe');
    const transcript = said(await bob.read({}));
    expect(transcript).toContain('Claude Code (alice-mbp): The retry wrapper swallows the 500.');
    expect(transcript).toContain('Do not post unprompted');
  });

  it('lets an agent wait for the reply instead of polling for it', async () => {
    const { alice, bob } = await pair('auto');

    const waiting = alice.wait({ timeoutSeconds: 5 });
    await bob.post({ message: 'Confirmed: retries on 5xx discard the body. Fix is in fetchWithRetry.' });

    const reply = said(await waiting);
    expect(reply).toContain('Claude Code (bob-linux): Confirmed');
    expect(reply).toContain('You may reply to other participants on your own');
  });

  it('does not wake an agent with its own message', async () => {
    const { alice } = await pair('auto');
    await alice.post({ message: 'Anyone seen this before?' });

    const result = said(await alice.wait({ timeoutSeconds: 1 }));
    expect(result).toContain('Nothing new');
    expect(result).not.toContain('Anyone seen this before?');
  });

  /**
   * DECISION A. In observe a human is relaying, so an agent blocking on the
   * session would be waiting for something nobody intends to send it.
   */
  it('refuses to wait in observe mode', async () => {
    const { bob, bridge } = await pair('observe');
    const before = bridge.requests.length;

    const result = said(await bob.wait({ timeoutSeconds: 5 }));
    expect(result).toContain('observe mode');
    expect(result).toContain('a human is relaying');
    // One roster check to learn the mode — and no polling after it.
    expect(bridge.requests.length - before).toBe(1);
  });

  /**
   * The budget ran out while the agent was working. The session is observe
   * now, and the agent must find that out before it blocks, not after.
   */
  it('notices that auto has ended before waiting on it', async () => {
    const { alice, bridge } = await pair('auto');
    bridge.setMode('observe');

    expect(said(await alice.wait({ timeoutSeconds: 5 }))).toContain('observe mode');
  });

  it('returns after the timeout with nothing, and says that is normal', async () => {
    const { alice } = await pair('relay');
    const result = said(await alice.wait({ timeoutSeconds: 1 }));
    expect(result).toContain('Nothing new');
    expect(result).toContain('wait to be asked before replying');
  });
});

describe('the handoff file', () => {
  it('is overwritten with owner-only permissions even if it existed more openly', async () => {
    const dir = join(workspace, 'handoffs', 'reuse');
    const { writeHandoffFile } = await import('../src/delivery');
    const first = writeHandoffFile(dir, 'sess_1', 'one')!;
    chmodSync(first, 0o644);
    expect(statSync(first).mode & 0o777).toBe(0o644);

    const again = writeHandoffFile(dir, 'sess_1', 'two')!;
    expect(again).toBe(first);
    expect(statSync(again).mode & 0o777).toBe(0o600);
  });
});

describe('why a session exists', () => {
  const created = (bridge: ReturnType<typeof makeBridge>) =>
    JSON.parse(bridge.requests.find((r) => r.url.endsWith('/api/sessions/shared') && r.method === 'POST')!.body);

  it('is a "come and look" in observe mode unless the person asked for more, and names the repository, never a path', async () => {
    const bridge = makeBridge();
    const alice = agent(bridge, makeClipboard(), 'alice-mbp.local');
    await alice.share({ title: 'Checkout 500s', context: 'x' });
    expect(created(bridge)).toMatchObject({ intent: 'look', repo: 'acme/storefront' });
    expect(created(bridge).lifetime).toBeUndefined();
    expect(bridge.requests.some((r) => r.url.endsWith('/mode'))).toBe(false);
    expect(JSON.stringify(created(bridge))).not.toContain(workspace);
  });

  it('"fix" lets the agents work it out, bounded, and lasts as long as asked', async () => {
    const bridge = makeBridge();
    const clipboard = makeClipboard();
    const alice = agent(bridge, clipboard, 'alice-mbp.local');
    const result = said(await alice.share({ title: 'Checkout 500s', context: 'x', intent: 'fix', lifetime: '1h' }));
    expect(created(bridge)).toMatchObject({ intent: 'fix', lifetime: '1h' });
    expect(JSON.parse(bridge.requests.find((r) => r.url.endsWith('/mode'))!.body)).toMatchObject({ mode: 'auto' });
    expect(result).toContain('Mode is auto');
    expect(result).toContain('It ends at');
    // The message the person sends says why, and when it ends.
    expect(clipboard.text).toContain('I want our agents to work this out between them');
    expect(clipboard.text).toContain('acme/storefront');
    expect(clipboard.text).toContain('deleted then');
  });

  it('tells a joining agent why it is there and what was said, in the one call', async () => {
    const bridge = makeBridge();
    const clipboard = makeClipboard();
    const alice = agent(bridge, clipboard, 'alice-mbp.local');
    await alice.share({ title: 'Checkout 500s', context: 'The retry wrapper swallows the 500. I ruled out the gateway.', intent: 'pair' });

    const bob = agent(bridge, clipboard, 'bob-linux', {});
    const joined = said(await bob.join({}));
    expect(joined).toContain('Why you were brought in: I want to work this through together');
    expect(joined).toContain('It is about the repository acme/storefront.');
    expect(joined).toContain('ask them before you reply');
    expect(joined).toContain('Claude Code (alice-mbp): The retry wrapper swallows the 500.');
    expect(joined).toContain('The session ends at 2026-10-06');
    // And it has read that message: waiting does not hand it back as new.
    expect(said(await bob.wait({ timeoutSeconds: 1 }))).not.toContain('retry wrapper');
  });

  it('still joins a session on a hosted plane that says nothing of intent', async () => {
    const bridge = makeBridge();
    const clipboard = makeClipboard();
    await agent(bridge, clipboard, 'alice-mbp.local').share({ title: 'Checkout 500s', context: 'hello' });
    // An older plane: no intent in what it returns.
    const older = { ...bridge, fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
      const res = await bridge.fetchImpl(input, init);
      const body = await res.json();
      if (body.session) { delete body.session.intent; delete body.session.repo; delete body.session.expiresAt; }
      return new Response(JSON.stringify(body), { status: res.status, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch };
    const joined = said(await agent(older as never, clipboard, 'bob-linux', {}).join({}));
    expect(joined).toContain('Joined "Checkout 500s"');
    expect(joined).not.toContain('Why you were brought in');
    expect(joined).toContain('hello');
  });

  it('starts the session on a hosted plane too old to know why, rather than failing', async () => {
    const bridge = makeBridge();
    // Strict about its body, as the older route is.
    const strict = { ...bridge, fetchImpl: (async (input: string | URL | Request, init: RequestInit = {}) => {
      if (String(input).endsWith('/api/sessions/shared') && init.method === 'POST' && /"intent"|"repo"|"lifetime"/.test(String(init.body))) {
        return new Response(JSON.stringify({ error: { message: 'Unrecognized key(s) in object' } }), { status: 400 });
      }
      return bridge.fetchImpl(input, init);
    }) as typeof fetch };
    const result = said(await agent(strict as never, makeClipboard(), 'alice-mbp.local').share({ title: 'Checkout 500s', context: 'x', intent: 'pair' }));
    expect(result).toContain('Started "Checkout 500s"');
  });
});

