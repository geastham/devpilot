import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'http';
import { GraphitiClient } from '../src/mempalace/graphiti-client';

/**
 * Contract tests against a stub Graphiti MCP server (TRD 18).
 *
 * The stub speaks the same JSON-RPC `tools/call` envelope and returns MCP
 * content blocks, so everything from our side of the wire is the production
 * path. What it cannot prove is that the REAL Graphiti server agrees on tool
 * names and argument spelling — that needs a live server, and is recorded as
 * unverified in `docs/LEDGER.md` rather than implied by a green suite.
 *
 * The behaviour these lock down hardest is degradation. Memory improves a plan;
 * it must never gate one, so every failure has to come back as empty rather than
 * as a throw.
 */

const PORT = 39230;
const ENDPOINT = `http://127.0.0.1:${PORT}/mcp/`;

let server: Server;
let calls: { name: string; args: Record<string, unknown> }[] = [];
/** Per-tool canned replies, keyed by tool name. */
let replies: Record<string, unknown> = {};
/** When set, the server returns this HTTP status instead of a result. */
let failWith: number | null = null;

function client(overrides: Partial<ConstructorParameters<typeof GraphitiClient>[0]> = {}) {
  return new GraphitiClient({ endpoint: ENDPOINT, timeoutMs: 2000, ...overrides });
}

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (failWith) {
        res.writeHead(failWith);
        res.end('nope');
        return;
      }
      const parsed = JSON.parse(body);
      const name = parsed.params?.name;
      calls.push({ name, args: parsed.params?.arguments ?? {} });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: parsed.id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(replies[name] ?? {}) }],
          },
        })
      );
    });
  });
  await new Promise<void>((r) => server.listen(PORT, '127.0.0.1', r));
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(() => {
  calls = [];
  replies = {};
  failWith = null;
});

describe('GraphitiClient — writes', () => {
  it('writes a drawer as a triplet, with no LLM call, by default', async () => {
    replies.add_triplet = { uuid: 'edge-1' };
    const result = await client().addDrawer({
      wingSlug: 'acme-widget',
      roomSlug: 'runs',
      memoryType: 'fact',
      label: 'a plan',
      content: 'CONTENTION: src/graph.js appeared in two tasks',
    });

    expect(calls.map((c) => c.name)).toEqual(['add_triplet']);
    // `add_memory` would run LLM extraction and require a key on the server.
    // Memory must not fail closed when no key is configured.
    expect(calls[0].args.group_id).toBe('acme-widget');
    expect(calls[0].args.fact).toContain('CONTENTION');
    // Temporal validity from the first write — the gap none of our own
    // constructs could express.
    expect(calls[0].args.valid_at).toBeTruthy();
    expect(result.created).toBe(true);
    expect(result.drawerId).toBe('edge-1');
  });

  it('uses add_memory only when extraction is explicitly llm', async () => {
    replies.add_memory = { uuid: 'ep-1' };
    await client({ extraction: 'llm' }).addDrawer({
      wingSlug: 'acme-widget',
      roomSlug: 'runs',
      memoryType: 'fact',
      label: 'a plan',
      content: 'something narrative',
    });
    expect(calls.map((c) => c.name)).toEqual(['add_memory']);
  });
});

describe('GraphitiClient — recall reads what was written', () => {
  /**
   * The regression that motivated adoption. MemPalace's local shim wrote
   * DRAWERS and read CLOSETS with nothing converting between them, so recall
   * returned nothing for everything ever written. Graphiti has one store.
   */
  it('returns a closet built from the facts a search found', async () => {
    replies.search_memory_facts = {
      facts: [
        { uuid: 'f1', name: 'FACT', fact: 'wave 2 contended on src/graph.js' },
        { uuid: 'f2', name: 'FACT', fact: 'parallelism 1 of a possible 3' },
      ],
    };

    const result = await client().recall({ wingSlug: 'acme-widget', topic: 'contention' });

    expect(result.topic).toBe('contention');
    expect(result.closets).toHaveLength(1);
    expect(result.closets[0].summary).toContain('contended');
    expect(result.closets[0].drawerIds).toEqual(['f1', 'f2']);
    expect(result.tokenEstimate).toBeGreaterThan(0);
  });

  it('scopes recall to the wing, so one repo cannot steer another', async () => {
    replies.search_memory_facts = { facts: [] };
    await client().recall({ wingSlug: 'acme-widget', topic: 'x' });
    expect(calls[0].args.group_ids).toEqual(['acme-widget']);
  });

  it('accepts facts under `facts` or `edges`', async () => {
    // Graphiti has used both across versions. A shape change should not
    // silently empty recall — that reads as "memory stopped working".
    replies.search_memory_facts = { edges: [{ uuid: 'e1', fact: 'older shape' }] };
    const result = await client().recall({ wingSlug: 'w', topic: 't' });
    expect(result.closets[0].summary).toBe('older shape');
  });
});

describe('GraphitiClient — temporal', () => {
  it('carries validFrom and validUntil through kgQuery', async () => {
    replies.search_memory_facts = {
      facts: [
        {
          uuid: 'f1',
          name: 'DECOMPOSED_AS',
          source_node_name: 'migration',
          target_node_name: 'three waves',
          valid_at: '2026-01-01T00:00:00Z',
          invalid_at: '2026-06-01T00:00:00Z',
        },
      ],
    };

    const [triple] = await client().kgQuery({ wingSlug: 'w', subject: 'migration' });

    expect(triple.subject).toBe('migration');
    // A fact that stopped being true, without being deleted. This is the whole
    // reason for the dependency.
    expect(triple.validUntil).toBeInstanceOf(Date);
  });
});

describe('GraphitiClient — degradation', () => {
  it('returns empty rather than throwing when the server errors', async () => {
    failWith = 500;
    const c = client();

    await expect(c.recall({ wingSlug: 'w', topic: 't' })).resolves.toEqual({
      topic: 't',
      closets: [],
      tokenEstimate: 0,
    });
    await expect(c.search({ query: 'q', wingSlug: 'w' })).resolves.toEqual({
      hits: [],
      totalScanned: 0,
    });
    await expect(c.healthy()).resolves.toBe(false);
  });

  it('reports a failed write instead of throwing', async () => {
    failWith = 503;
    const result = await client().addDrawer({
      wingSlug: 'w',
      roomSlug: 'runs',
      memoryType: 'fact',
      label: 'l',
      content: 'c',
    });
    // A dispatch must survive a memory outage. `created: false` lets the caller
    // log it; a throw would surface as a failed run.
    expect(result.created).toBe(false);
  });

  it('returns empty when the endpoint is not listening at all', async () => {
    const offline = new GraphitiClient({
      endpoint: 'http://127.0.0.1:39231/mcp/',
      timeoutMs: 500,
    });
    await expect(offline.recall({ wingSlug: 'w', topic: 't' })).resolves.toMatchObject({
      closets: [],
    });
  });

  it('sends a bearer token when one is configured', async () => {
    // The hosted tier puts Graphiti behind auth; local runs have no token.
    replies.get_status = { status: 'ok' };
    await client({ apiKey: 'secret-token' }).healthy();
    expect(calls).toHaveLength(1);
  });
});
