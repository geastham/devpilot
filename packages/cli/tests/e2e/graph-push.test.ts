import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GraphSyncBatch } from '@devpilot.sh/bridge-client';
import { BATCH_LIMITS, batchesFor, diffAgainstManifest, pushGraph } from '../../src/utils/graph-push';
import { writeGraphFixture } from './helpers/graph-fixture';

/**
 * Sending a code graph's structure to the hosted plane.
 *
 * The hosted plane's promise is that it never receives source. An index holds
 * source — signatures and docstrings are literal text — so the test that
 * matters most here is the one that puts a marker in each such column and
 * looks for it in everything that would be sent.
 */

const identity = { repo: 'acme/widget', branch: 'main', commitSha: 'a'.repeat(40), indexerVersion: '1.6.1' };

function repo(overrides: Partial<Parameters<typeof writeGraphFixture>[1]> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'dp-graph-push-'));
  writeGraphFixture(dir, {
    files: { 'src/policy.ts': 'h-policy', 'src/fetch.ts': 'h-fetch', 'src/util.ts': 'h-util' },
    nodes: [
      { id: 'n-policy', name: 'nextDelay', file: 'src/policy.ts', exported: true },
      { id: 'n-fetch', name: 'fetchWithRetry', file: 'src/fetch.ts', exported: true },
      { id: 'n-util', name: 'sleep', file: 'src/util.ts' },
    ],
    edges: [
      { from: 'n-fetch', to: 'n-policy' },
      { from: 'n-fetch', to: 'n-util' },
    ],
    ...overrides,
  });
  return dir;
}

function fakeClient(manifest: Record<string, string> = {}, opts: { failAt?: number; disabled?: boolean } = {}) {
  const sent: GraphSyncBatch[] = [];
  return {
    sent,
    client: {
      graphManifest: async () =>
        opts.disabled
          ? ({ status: 'disabled', message: 'FEATURE_NOT_ENABLED' } as const)
          : ({ status: 'ok', graph: null, files: manifest } as const),
      graphSync: async (batch: GraphSyncBatch) => {
        if (opts.failAt === sent.length) return { ok: false as const, status: 500, message: 'boom' };
        sent.push(batch);
        return { ok: true as const, counts: { files: 3, nodes: 3, edges: 2 } };
      },
    },
  };
}

describe('what would leave the machine', () => {
  it('contains no source text, wherever in the index it was put', async () => {
    const dir = repo({
      nodes: [
        {
          id: 'n-policy',
          name: 'nextDelay',
          file: 'src/policy.ts',
          docstring: 'MARKER_DOCSTRING the retry policy doubles each time',
          signature: 'MARKER_SIGNATURE (attempt: number, secret = "hunter2"): number',
        },
        { id: 'n-fetch', name: 'fetchWithRetry', file: 'src/fetch.ts' },
        { id: 'n-util', name: 'sleep', file: 'src/util.ts' },
      ],
      edges: [{ from: 'n-fetch', to: 'n-policy', metadata: '{"snippet":"MARKER_METADATA nextDelay(3)"}' }],
    });
    const { sent, client } = fakeClient();

    const outcome = await pushGraph(client, dir, identity);

    expect(outcome.status).toBe('pushed');
    const wire = JSON.stringify(sent);
    expect(wire).not.toContain('MARKER_');
    expect(wire).not.toContain('hunter2');
    // What is there is names and structure.
    expect(wire).toContain('nextDelay');
    expect(Object.keys(sent[0].nodes[0]).sort()).toEqual([
      'endLine', 'filePath', 'id', 'isExported', 'kind', 'name', 'qualifiedName', 'startLine',
    ]);
    expect(Object.keys(sent[0].edges[0]).sort()).toEqual(['filePath', 'kind', 'line', 'source', 'target']);
  });
});

describe('what is sent', () => {
  it('sends everything the first time, in one final batch', async () => {
    const { sent, client } = fakeClient();
    const outcome = await pushGraph(client, repo(), identity);

    expect(outcome).toMatchObject({ status: 'pushed', changed: 3, removed: 0, batches: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ repo: 'acme/widget', branch: 'main', final: true, indexer: 'codegraph' });
    expect(sent[0].upsertFiles.map((f) => f.path).sort()).toEqual(['src/fetch.ts', 'src/policy.ts', 'src/util.ts']);
    // An edge travels with the file it is written in.
    expect(sent[0].edges.every((e) => e.filePath === 'src/fetch.ts')).toBe(true);
  });

  it('sends only the files whose content changed, and removes ones that are gone', async () => {
    const { sent, client } = fakeClient({
      'src/policy.ts': 'h-policy',
      'src/fetch.ts': 'an-older-hash',
      'src/deleted.ts': 'h-deleted',
    });
    const outcome = await pushGraph(client, repo(), identity);

    expect(outcome).toMatchObject({ status: 'pushed', changed: 2, removed: 1 });
    expect(sent[0].upsertFiles.map((f) => f.path).sort()).toEqual(['src/fetch.ts', 'src/util.ts']);
    expect(sent[0].removePaths).toEqual(['src/deleted.ts']);
    expect(sent[0].nodes.map((n) => n.name).sort()).toEqual(['fetchWithRetry', 'sleep']);
  });

  it('still sends a final batch when nothing changed, so the graph’s age is honest', async () => {
    const { sent, client } = fakeClient({ 'src/policy.ts': 'h-policy', 'src/fetch.ts': 'h-fetch', 'src/util.ts': 'h-util' });
    const outcome = await pushGraph(client, repo(), identity);
    expect(outcome).toMatchObject({ status: 'pushed', changed: 0, removed: 0, batches: 1 });
    expect(sent[0]).toMatchObject({ final: true, upsertFiles: [], nodes: [], edges: [], commitSha: identity.commitSha });
  });

  /**
   * The most dangerous mistake available here: an export from a MISSING index
   * is three empty lists, which looks exactly like "every file was deleted".
   */
  it('sends nothing at all when there is no index, rather than "delete everything"', async () => {
    const { sent, client } = fakeClient({ 'src/policy.ts': 'h-policy' });
    const outcome = await pushGraph(client, mkdtempSync(join(tmpdir(), 'dp-no-index-')), identity);
    expect(outcome.status).toBe('no-index');
    expect(sent).toEqual([]);
  });

  it('says so when the workspace has not turned the feature on', async () => {
    const { sent, client } = fakeClient({}, { disabled: true });
    expect((await pushGraph(client, repo(), identity)).status).toBe('disabled');
    expect(sent).toEqual([]);
  });
});

describe('cutting it into requests', () => {
  const structure = (files: number, nodesPerFile: number) => ({
    available: true,
    indexerSchemaVersion: 2,
    files: Array.from({ length: files }, (_, i) => ({ path: `f${i}.ts`, contentHash: `h${i}`, language: 'typescript' })),
    nodes: Array.from({ length: files * nodesPerFile }, (_, i) => ({
      id: `n${i}`, kind: 'function', name: `fn${i}`, qualifiedName: `fn${i}`, filePath: `f${Math.floor(i / nodesPerFile)}.ts`, startLine: 1, endLine: 2, isExported: false,
    })),
    edges: [],
  });

  it('never splits a file across two requests', () => {
    // 10 files of 900 symbols: four fit a request, the fifth starts the next.
    const local = structure(10, 900);
    const { batches, skipped } = batchesFor(local as never, { changed: local.files.map((f) => f.path), removed: [] }, identity, 'sync-1');

    expect(skipped).toEqual([]);
    expect(batches.map((b) => b.upsertFiles.length)).toEqual([4, 4, 2]);
    for (const batch of batches) {
      expect(batch.nodes.length).toBeLessThanOrEqual(BATCH_LIMITS.nodes);
      const files = new Set(batch.upsertFiles.map((f) => f.path));
      expect(batch.nodes.every((n) => files.has(n.filePath))).toBe(true);
    }
    // Only the last one closes the sync, and they share an id.
    expect(batches.map((b) => b.final)).toEqual([false, false, true]);
    expect(new Set(batches.map((b) => b.syncId))).toEqual(new Set(['sync-1']));
  });

  it('leaves out a file too large to send whole, and says which', () => {
    const local = structure(2, 10);
    local.nodes.push(
      ...Array.from({ length: BATCH_LIMITS.nodes + 1 }, (_, i) => ({
        id: `big${i}`, kind: 'constant', name: `K${i}`, qualifiedName: `K${i}`, filePath: 'generated.ts', startLine: 1, endLine: 1, isExported: false,
      }))
    );
    local.files.push({ path: 'generated.ts', contentHash: 'hg', language: 'typescript' });

    const { batches, skipped } = batchesFor(local as never, { changed: ['f0.ts', 'f1.ts', 'generated.ts'], removed: [] }, identity);
    expect(skipped).toEqual([{ path: 'generated.ts', nodes: BATCH_LIMITS.nodes + 1, edges: 0 }]);
    expect(batches.flatMap((b) => b.upsertFiles.map((f) => f.path))).toEqual(['f0.ts', 'f1.ts']);
  });

  it('puts removals in the first request', () => {
    const local = structure(1, 1);
    const { batches } = batchesFor(local as never, { changed: ['f0.ts'], removed: ['old-name.ts'] }, identity);
    expect(batches[0].removePaths).toEqual(['old-name.ts']);
  });

  it('diffs by content hash', () => {
    expect(
      diffAgainstManifest(
        { files: [{ path: 'a.ts', contentHash: '1', language: 'ts' }, { path: 'b.ts', contentHash: '2', language: 'ts' }] },
        { 'a.ts': '1', 'b.ts': 'old', 'c.ts': '3' }
      )
    ).toEqual({ changed: ['b.ts'], removed: ['c.ts'] });
  });
});

describe('when a request does not land', () => {
  it('stops, so a later batch cannot land ahead of an earlier one', async () => {
    const dir = repo();
    const { sent, client } = fakeClient({}, { failAt: 0 });
    const outcome = await pushGraph(client, dir, identity);
    expect(outcome).toMatchObject({ status: 'failed', message: 'boom', sent: 0 });
    expect(sent).toEqual([]);
  });
});
