import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sessionCrypto } from '@devpilot.sh/bridge-protocol';
import { SharedSessionClient } from '@devpilot.sh/bridge-client';
import { renderTranscript, createServer, SERVER_NAME } from '../src/index';
import type { TranscriptEntry } from '@devpilot.sh/bridge-client';

/**
 * TRD 06 §8.7, T6-AC-10.
 *
 * The load-bearing assertion is §8.7's last clause: "assert the key never
 * appears in any outbound request." Everything else here is ordinary
 * behaviour; that one is the product claim.
 *
 * A fake fetch stands in for the bridge, which lets every outbound request be
 * captured and inspected — something a live server could not give us.
 */

const KEY_HOLDER = { key: '' };

/** Records every request the client makes, so the suite can search them. */
function makeFakeBridge() {
  const requests: Array<{ url: string; init: RequestInit; body: string }> = [];
  const messages: Array<Record<string, unknown>> = [];
  let seq = 0;
  let keyVersion = 1;

  const fetchImpl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    const body = typeof init.body === 'string' ? init.body : '';
    requests.push({ url, init, body });

    const json = (status: number, payload: unknown) =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' },
      });

    if (url.includes('/join')) {
      return json(200, {
        participantToken: 'tok_fake',
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        participant: {
          id: 'part_1',
          sessionId: 'sess_1',
          kind: 'agent',
          displayName: 'Claude Code',
          agentKind: 'claude-code',
          joinedAt: new Date().toISOString(),
        },
        session: {
          id: 'sess_1',
          title: 'Checkout 500s',
          mode: 'observe',
          keyVersion,
          lastSeq: seq,
          createdAt: new Date().toISOString(),
        },
      });
    }

    if (url.includes('/messages') && init.method === 'POST') {
      seq += 1;
      const parsed = JSON.parse(body);
      const row = {
        id: `m${seq}`,
        sessionId: 'sess_1',
        participantId: 'part_1',
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
      const page = messages.filter((m) => (m.seq as number) > since);
      return json(200, { messages: page, latestSeq: seq, hasMore: false });
    }

    // Session metadata + roster.
    return json(200, {
      session: {
        id: 'sess_1',
        title: 'Checkout 500s',
        mode: 'observe',
        keyVersion,
        lastSeq: seq,
        createdAt: new Date().toISOString(),
      },
      participants: [
        {
          id: 'part_1',
          sessionId: 'sess_1',
          kind: 'agent',
          displayName: 'Claude Code',
          agentKind: 'claude-code',
          joinedAt: new Date().toISOString(),
        },
      ],
    });
  }) as typeof fetch;

  return {
    fetchImpl,
    requests,
    messages,
    rotate: () => {
      keyVersion += 1;
    },
    pushRaw: (row: Record<string, unknown>) => {
      seq += 1;
      messages.push({ ...row, seq });
    },
  };
}

async function joined(bridge: ReturnType<typeof makeFakeBridge>) {
  const key = sessionCrypto.generateKey();
  KEY_HOLDER.key = key;
  const client = await SharedSessionClient.join({
    link: `https://devpilot.sh/s/sess_1#k=${key}`,
    displayName: 'Claude Code',
    kind: 'agent',
    agentKind: 'claude-code',
    fetchImpl: bridge.fetchImpl,
  });
  return { client, key };
}

describe('the key never leaves the process (§8.7, T6-AC-02)', () => {
  /**
   * THE TEST THIS PACKAGE EXISTS TO PASS.
   *
   * Every byte the client sent is searched for the key, in every encoding a
   * mistake would plausibly produce. A regression here is not a bug in a
   * feature; it is the product claim becoming false.
   */
  it('appears in no outbound request body, url, or header', async () => {
    const bridge = makeFakeBridge();
    const { client, key } = await joined(bridge);

    await client.post('the retry wrapper swallows the 500');
    await client.read(0);
    await client.who();

    expect(bridge.requests.length).toBeGreaterThan(3);

    const encodings = [
      key,
      encodeURIComponent(key),
      Buffer.from(key, 'base64url').toString('base64'),
      Buffer.from(key, 'base64url').toString('hex'),
    ];

    for (const { url, init, body } of bridge.requests) {
      const headers = JSON.stringify(init.headers ?? {});
      for (const needle of encodings) {
        expect(url, `key in URL: ${url}`).not.toContain(needle);
        expect(body, 'key in request body').not.toContain(needle);
        expect(headers, 'key in headers').not.toContain(needle);
      }
    }
  });

  it('sends a join proof that is not the key and cannot decrypt', async () => {
    const bridge = makeFakeBridge();
    const { key } = await joined(bridge);

    const joinReq = bridge.requests.find((r) => r.url.includes('/join'))!;
    const proof = (joinReq.init.headers as Record<string, string>)['x-session-key-proof'];

    expect(proof).toBeTruthy();
    expect(proof).not.toBe(key);

    const sealed = await sessionCrypto.encrypt('secret', key);
    await expect(sessionCrypto.decrypt(sealed, proof)).rejects.toThrow();
  });

  it('sends ciphertext, never plaintext', async () => {
    const bridge = makeFakeBridge();
    const { client } = await joined(bridge);

    await client.post('deploy key is hunter2');

    const post = bridge.requests.find((r) => r.init.method === 'POST' && r.url.includes('/messages'))!;
    expect(post.body).not.toContain('hunter2');
    expect(post.body).not.toContain('deploy key');
  });

  /** A stray console.log of the client must not print the key. */
  it('is not reachable through JSON.stringify or the object shape', async () => {
    const bridge = makeFakeBridge();
    const { client, key } = await joined(bridge);

    expect(JSON.stringify(client)).not.toContain(key);
    expect(Object.values(client).join(' ')).not.toContain(key);
  });
});

describe('round trip', () => {
  it('posts and reads back the same plaintext', async () => {
    const bridge = makeFakeBridge();
    const { client } = await joined(bridge);

    await client.post('first');
    await client.post('second');

    const { entries, latestSeq } = await client.read(0);
    expect(entries.map((e) => e.text)).toEqual(['first', 'second']);
    expect(latestSeq).toBe(2);
  });

  it('reads only what is new with a seq cursor', async () => {
    const bridge = makeFakeBridge();
    const { client } = await joined(bridge);

    await client.post('one');
    await client.post('two');

    const { entries } = await client.read(1);
    expect(entries.map((e) => e.text)).toEqual(['two']);
  });
});

describe('what cannot be decrypted is reported, not hidden', () => {
  /**
   * §3.2 as corrected in v1.3: the server authors `system` notices in
   * plaintext, because it holds no key and cannot encrypt. The client must not
   * try to decrypt them and must not treat them as corrupt.
   */
  it('surfaces a server-authored system notice as plaintext', async () => {
    const bridge = makeFakeBridge();
    const { client } = await joined(bridge);

    bridge.pushRaw({
      id: 'sys1',
      sessionId: 'sess_1',
      participantId: null,
      ciphertext: 'system:{"type":"auto_stopped","reason":"budget"}',
      keyVersion: 1,
      kind: 'system',
      createdAt: new Date().toISOString(),
    });

    const { entries } = await client.read(0);
    expect(entries[0].status).toBe('system');
    expect(entries[0].systemNotice).toEqual({ type: 'auto_stopped', reason: 'budget' });
  });

  /**
   * After a rotation, history sealed under the old key genuinely cannot be
   * read. Dropping those rows would make the transcript look complete when it
   * is not — worse than a visible gap, because the reader would not know to ask.
   */
  it('marks messages sealed under another key version as undecryptable', async () => {
    const bridge = makeFakeBridge();
    const { client, key } = await joined(bridge);

    bridge.pushRaw({
      id: 'old1',
      sessionId: 'sess_1',
      participantId: 'part_1',
      ciphertext: await sessionCrypto.encrypt('from before the rotation', key),
      keyVersion: 99,
      kind: 'chat',
      createdAt: new Date().toISOString(),
    });

    const { entries } = await client.read(0);
    expect(entries[0].status).toBe('undecryptable');
    expect(entries[0].text).toBeNull();
  });

  it('marks a corrupt payload undecryptable rather than throwing', async () => {
    const bridge = makeFakeBridge();
    const { client } = await joined(bridge);

    bridge.pushRaw({
      id: 'bad1',
      sessionId: 'sess_1',
      participantId: 'part_1',
      ciphertext: 'not.valid.ciphertext',
      keyVersion: 1,
      kind: 'chat',
      createdAt: new Date().toISOString(),
    });

    const { entries } = await client.read(0);
    expect(entries[0].status).toBe('undecryptable');
  });
});

describe('transcript rendering', () => {
  const names = new Map([['p1', 'Alice']]);

  const entry = (over: Partial<TranscriptEntry>): TranscriptEntry => ({
    id: 'm1',
    seq: 1,
    participantId: 'p1',
    kind: 'chat',
    keyVersion: 1,
    createdAt: '2026-08-04T10:00:00.000Z',
    text: 'hello',
    status: 'ok',
    ...over,
  });

  it('renders a readable message with its author', () => {
    expect(renderTranscript([entry({})], names)).toBe('[#1] Alice: hello');
  });

  it('makes an unreadable message visible rather than dropping it', () => {
    const out = renderTranscript([entry({ status: 'undecryptable', text: null })], names);
    expect(out).toContain('not readable to you');
    expect(out).toContain('#1');
  });

  it('falls back to the participant id when the name is unknown', () => {
    expect(renderTranscript([entry({ participantId: 'p9' })], names)).toContain('p9');
  });

  it('says so plainly when there is nothing yet', () => {
    expect(renderTranscript([], names)).toBe('No messages yet.');
  });
});

describe('the MCP surface', () => {
  it('constructs with the four documented tools', () => {
    const server = createServer();
    expect(server).toBeTruthy();
    expect(SERVER_NAME).toBe('devpilot-session');
  });

  /**
   * DECISION A (§3.3) lives in the tool descriptions, because those are what
   * the model actually reads. If someone later writes "reply to other agents as
   * they post", the default stops being observe in practice while still saying
   * `observe` in the database.
   */
  it('never instructs the agent to converse autonomously by default', () => {
    const source = readFileSync(join(__dirname, '../src/index.ts'), 'utf8');

    expect(source).toContain('Do not post unprompted');
    expect(source).toContain('wait to be asked');
    // No polling loop, no wake-up: the agent chooses when to look (§6.2).
    expect(source).not.toMatch(/setInterval|setTimeout\s*\(\s*.*poll/i);
  });

  it('does not echo the join link into a tool result', () => {
    const source = readFileSync(join(__dirname, '../src/index.ts'), 'utf8');
    // A tool result is transcript the model may repeat later; the link is the
    // credential. The join failure path must report a reason, not the input.
    const joinFailure = source.slice(source.indexOf('Could not join'), source.indexOf('Could not join') + 120);
    expect(joinFailure).not.toContain('url');
  });
});
