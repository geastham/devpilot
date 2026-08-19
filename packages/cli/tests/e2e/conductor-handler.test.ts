import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createConductorDispatchHandler } from '../../src/commands/bridge/conductor-handler';

/**
 * The join: a claimed Linear dispatch becomes a conductor run.
 *
 * A stub cockpit stands in for the Next app so the contract between the CLI and
 * the cockpit API is pinned without a database, a model call, or a real fleet.
 * What is asserted is the part that was missing and the parts that are easy to
 * get subtly wrong: which endpoints are called and in what order, that a
 * redelivered ticket does not start a second paid planning run, that the handler
 * returns at the review gate rather than holding its queue claim, and that a
 * failure both reports to the bridge and rethrows so the claim is released.
 */

interface Call { method: string; path: string; body?: unknown }

let server: http.Server;
let baseUrl: string;
let calls: Call[] = [];

/** Behaviour switches the individual tests set. */
let existing: unknown[] = [];
/** What GET /conductor reports for an already-known item. */
let existingRunState: unknown = {};
let conductorResponse: { status: number; body: unknown } = {
  status: 200,
  body: { status: 'planning', awaiting: 'review', review: { score: { parallelizationScore: 0.88 } } },
};

/** What the handler reported to the bridge. */
let reported: { status: string; message?: string }[] = [];
const client = {
  reportSessionStatus: async (_id: string, s: { status: string; message?: string }) => {
    reported.push(s);
  },
} as never;

const message = {
  sessionId: 'sesn_1',
  orgId: 'org_1',
  workspaceId: 'ws_1',
  linearIssueId: 'iss_1',
  linearIdentifier: 'ENG-42',
  title: 'Add CSV export',
  description: 'Users want CSV.',
  teamId: 'team_1',
  repo: 'acme/api',
  targetOrchestratorId: 'orch_1',
  dispatchedAt: new Date().toISOString(),
} as never;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString();
      const path = req.url ?? '';
      calls.push({
        method: req.method ?? '',
        path,
        body: raw ? JSON.parse(raw) : undefined,
      });

      res.setHeader('content-type', 'application/json');

      if (req.method === 'GET' && path.startsWith('/api/items?')) {
        res.writeHead(200).end(JSON.stringify(existing));
        return;
      }
      if (req.method === 'POST' && path === '/api/items') {
        res.writeHead(201).end(JSON.stringify({ id: 'item_new', title: 'Add CSV export' }));
        return;
      }
      if (req.method === 'GET' && /^\/api\/items\/[^/]+\/conductor$/.test(path)) {
        res.writeHead(200).end(JSON.stringify(existingRunState));
        return;
      }
      if (req.method === 'POST' && /^\/api\/items\/[^/]+\/conductor$/.test(path)) {
        res.writeHead(conductorResponse.status).end(JSON.stringify(conductorResponse.body));
        return;
      }
      res.writeHead(404).end(JSON.stringify({ error: 'not found' }));
    });
  });

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(() => {
  calls = [];
  reported = [];
  existing = [];
  existingRunState = {};
  conductorResponse = {
    status: 200,
    body: { status: 'planning', awaiting: 'review', review: { score: { parallelizationScore: 0.88 } } },
  };
});

function handler() {
  return createConductorDispatchHandler({ client, cockpitUrl: baseUrl, requestTimeoutMs: 10_000 });
}

describe('bridge dispatch → conductor', () => {
  it('creates a horizon item in REFINING and starts a conductor run', async () => {
    await handler()(message);

    const post = calls.find((c) => c.method === 'POST' && c.path === '/api/items');
    expect(post, 'the ticket must reach the board').toBeTruthy();
    expect(post!.body).toMatchObject({
      title: 'Add CSV export',
      repo: 'acme/api',
      linearTicketId: 'ENG-42',
      // DIRECTIONAL is the API default and would park it as an idea rather than
      // queue it for planning.
      zone: 'REFINING',
    });

    expect(
      calls.some((c) => c.method === 'POST' && c.path === '/api/items/item_new/conductor'),
      'the conductor run must actually be started'
    ).toBe(true);
  });

  it('reports the review gate back to the bridge in terms a human can act on', async () => {
    await handler()(message);

    const last = reported[reported.length - 1];
    expect(last.status).toBe('running');
    expect(last.message).toContain('awaiting review');
    // The score is the reason a conductor would bother opening the cockpit.
    expect(last.message).toContain('88%');
  });

  it('returns at the review gate instead of holding the claim', async () => {
    // A handler that awaited human approval would keep its queue claim for
    // hours; the stale sweep would then reclaim and re-run the ticket.
    await expect(handler()(message)).resolves.toBeUndefined();
  });

  it('reuses an existing item for a redelivered ticket', async () => {
    existing = [{ id: 'item_existing', linearTicketId: 'ENG-42' }];

    await handler()(message);

    expect(
      calls.some((c) => c.method === 'POST' && c.path === '/api/items'),
      'a redelivered ticket must not create a second board item'
    ).toBe(false);
    expect(
      calls.some((c) => c.path === '/api/items/item_existing/conductor'),
      'it should resume the existing item, not a new one'
    ).toBe(true);
  });

  it('does not start a second planning run for a ticket already at its review gate', async () => {
    // Found live: reusing the item still POSTed /conductor, which re-planned
    // from scratch — 236s and a full model call for a ticket already waiting on
    // a human. Item-level dedupe alone does not prevent the spend.
    existing = [{ id: 'item_existing', linearTicketId: 'ENG-42' }];
    existingRunState = {
      status: 'planning',
      awaiting: 'review',
      review: { score: { parallelizationScore: 0.72 } },
    };

    await handler()(message);

    expect(
      calls.some((c) => c.method === 'POST' && c.path.endsWith('/conductor')),
      'a live run must not be restarted'
    ).toBe(false);

    const last = reported[reported.length - 1];
    expect(last.status).toBe('running');
    expect(last.message).toContain('awaiting review');
  });

  it('does start a run when the existing item has no live run', async () => {
    existing = [{ id: 'item_existing', linearTicketId: 'ENG-42' }];
    existingRunState = {}; // never planned

    await handler()(message);

    expect(
      calls.some((c) => c.method === 'POST' && c.path === '/api/items/item_existing/conductor'),
      'an item with no run still needs one'
    ).toBe(true);
  });

  it('looks the ticket up by linearTicketId, not by scanning', async () => {
    await handler()(message);
    const get = calls.find((c) => c.method === 'GET');
    expect(get?.path).toContain('linearTicketId=ENG-42');
  });

  it('reports and rethrows when the conductor run fails, so the claim releases', async () => {
    conductorResponse = {
      status: 500,
      body: { error: 'CONDUCTOR_FAILED', detail: 'Failed to generate plan' },
    };

    await expect(handler()(message)).rejects.toThrow();

    const last = reported[reported.length - 1];
    expect(last.status).toBe('error');
    // The cockpit's detail must survive: without it a configuration problem
    // reads as an unexplained bridge failure.
    expect(last.message).toContain('CONDUCTOR_FAILED');
  });

  it('treats a failed run state as a failure even on a 200', async () => {
    conductorResponse = {
      status: 200,
      body: { status: 'failed', errors: ['no API key configured'] },
    };

    await expect(handler()(message)).rejects.toThrow(/no API key configured/);
    expect(reported[reported.length - 1].status).toBe('error');
  });
});
