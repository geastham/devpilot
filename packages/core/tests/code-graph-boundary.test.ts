import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { exportStructure, graphDbPath, readGraphStatus } from '../src/code-graph';
import {
  CODEGRAPH_SCHEMA,
  createGraphFixture,
  emptyWorkingDir,
  type GraphFixture,
} from './helpers/code-graph-fixture';

/**
 * THE BOUNDARY TEST.
 *
 * `exportStructure` is the only thing in the product that turns a code graph
 * index into something that may be sent to the hosted plane, and the hosted
 * plane must never receive source. The index is full of it: the indexer stores
 * each symbol's literal signature and docstring, its decorators and return
 * type, and resolution details beside every edge.
 *
 * So every column that is NOT on the export's allowlist gets a distinct marker
 * string here — including one in a column the indexer does not have yet — and
 * the serialised export must contain none of them. If this fails, source is
 * crossing; there is no version of that which is a flaky test.
 */

let fixtures: { cleanup(): void }[] = [];

afterEach(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});

/** One marker per column that must not cross. The keys are where each is put. */
const MARKERS = {
  docstring: 'MARKER_DOCSTRING_7f3a: Retries the charge. Internal: uses the legacy gateway key.',
  signature: 'MARKER_SIGNATURE_91bc: async function charge(card: Card, apiKey = "sk_live_x"): Promise<void>',
  decorators: '["MARKER_DECORATORS_2d40: @RateLimited({ perMinute: 3 })"]',
  typeParameters: '["MARKER_TYPE_PARAMETERS_c8e1: T extends SecretShape"]',
  returnType: 'MARKER_RETURN_TYPE_55aa: Promise<InternalLedgerRow>',
  visibility: 'MARKER_VISIBILITY_0b17',
  edgeMetadata: '{"resolvedBy":"import","refName":"MARKER_EDGE_METADATA_e6f2","snippet":"charge(card, key)"}',
  edgeProvenance: 'MARKER_EDGE_PROVENANCE_4c9d',
  fileErrors: '["MARKER_FILE_ERRORS_a1d8: unexpected token near `const secret = `"]',
  // A column codegraph 1.6.1 does not have. A later version adding one like it
  // is exactly the case an allowlist exists for.
  futureNodeColumn: 'MARKER_FUTURE_NODE_COLUMN_3e77: function body() { return process.env.SECRET }',
  futureEdgeColumn: 'MARKER_FUTURE_EDGE_COLUMN_d2b6: charge(card, key)',
  futureFileColumn: 'MARKER_FUTURE_FILE_COLUMN_8f05: first 200 bytes of the file',
} as const;

/** The indexer's schema, plus one new column per table of the kind a later version might add. */
const SCHEMA_WITH_FUTURE_COLUMNS =
  CODEGRAPH_SCHEMA +
  `
ALTER TABLE nodes ADD COLUMN body TEXT;
ALTER TABLE edges ADD COLUMN call_site TEXT;
ALTER TABLE files ADD COLUMN preview TEXT;
`;

function markedFixture(): GraphFixture {
  const f = createGraphFixture(SCHEMA_WITH_FUTURE_COLUMNS);
  fixtures.push(f);

  f.addFile('src/billing/charge.ts', { contentHash: 'sha256:aaa', errors: MARKERS.fileErrors });
  f.addFile('src/billing/retry.ts', { contentHash: 'sha256:bbb' });

  f.addNode({
    id: 'function:charge',
    file: 'src/billing/charge.ts',
    kind: 'function',
    name: 'charge',
    qualifiedName: 'billing.charge',
    startLine: 12,
    endLine: 40,
    isExported: true,
    docstring: MARKERS.docstring,
    signature: MARKERS.signature,
    decorators: MARKERS.decorators,
    typeParameters: MARKERS.typeParameters,
    returnType: MARKERS.returnType,
    visibility: MARKERS.visibility,
  });
  f.addNode({
    id: 'function:retry',
    file: 'src/billing/retry.ts',
    kind: 'function',
    name: 'retry',
    qualifiedName: 'billing.retry',
    startLine: 3,
    endLine: 9,
  });

  f.addEdge({
    source: 'function:retry',
    target: 'function:charge',
    kind: 'calls',
    line: 7,
    metadata: MARKERS.edgeMetadata,
    provenance: MARKERS.edgeProvenance,
  });

  f.db.prepare('UPDATE nodes SET body = ?').run(MARKERS.futureNodeColumn);
  f.db.prepare('UPDATE edges SET call_site = ?').run(MARKERS.futureEdgeColumn);
  f.db.prepare('UPDATE files SET preview = ?').run(MARKERS.futureFileColumn);

  return f;
}

describe('exportStructure — what may leave the machine', () => {
  it('the fixture really does hold every marker (or the next test proves nothing)', () => {
    const f = markedFixture();
    const everything = JSON.stringify({
      nodes: f.db.prepare('SELECT * FROM nodes').all(),
      edges: f.db.prepare('SELECT * FROM edges').all(),
      files: f.db.prepare('SELECT * FROM files').all(),
    });

    for (const [where, marker] of Object.entries(MARKERS)) {
      // The id inside each marker, which survives JSON escaping of the rest.
      const id = marker.match(/MARKER_[A-Z_]+_[0-9a-f]{4}/)![0];
      expect(everything, `${where} is not in the fixture`).toContain(id);
    }
  });

  it('contains none of the source text, from any column, present or future', () => {
    const f = markedFixture();

    const serialised = JSON.stringify(exportStructure(f.dir));

    for (const [where, marker] of Object.entries(MARKERS)) {
      const id = marker.match(/MARKER_[A-Z_]+_[0-9a-f]{4}/)![0];
      expect(serialised, `${where} crossed the boundary`).not.toContain(id);
    }
    // Belt and braces: no marker of any kind, including one added to the
    // fixture later without being added to the loop's source.
    expect(serialised).not.toMatch(/MARKER_/);
  });

  it('is exactly the allowlisted fields, and nothing else, on every row', () => {
    const f = markedFixture();
    const exported = exportStructure(f.dir);

    expect(exported).toEqual({
      available: true,
      indexerSchemaVersion: 11,
      files: [
        { path: 'src/billing/charge.ts', contentHash: 'sha256:aaa', language: 'typescript' },
        { path: 'src/billing/retry.ts', contentHash: 'sha256:bbb', language: 'typescript' },
      ],
      nodes: [
        {
          id: 'function:charge',
          kind: 'function',
          name: 'charge',
          qualifiedName: 'billing.charge',
          filePath: 'src/billing/charge.ts',
          startLine: 12,
          endLine: 40,
          isExported: true,
        },
        {
          id: 'function:retry',
          kind: 'function',
          name: 'retry',
          qualifiedName: 'billing.retry',
          filePath: 'src/billing/retry.ts',
          startLine: 3,
          endLine: 9,
          isExported: false,
        },
      ],
      edges: [
        {
          source: 'function:retry',
          target: 'function:charge',
          kind: 'calls',
          line: 7,
          // The file of the SOURCE node.
          filePath: 'src/billing/retry.ts',
        },
      ],
    });

    // `toEqual` ignores undefined-valued keys; the key SETS must match too.
    expect(Object.keys(exported.files[0]).sort()).toEqual(['contentHash', 'language', 'path']);
    expect(Object.keys(exported.nodes[0]).sort()).toEqual([
      'endLine',
      'filePath',
      'id',
      'isExported',
      'kind',
      'name',
      'qualifiedName',
      'startLine',
    ]);
    expect(Object.keys(exported.edges[0]).sort()).toEqual(['filePath', 'kind', 'line', 'source', 'target']);
  });

  it('drops an edge whose target is not a node in the index', () => {
    const f = markedFixture();
    // A call into a dependency: the indexer has a name for it and no node.
    f.addEdge({ source: 'function:retry', target: 'external:setTimeout', kind: 'calls', line: 5 });
    // And one whose source is gone, which the indexer's foreign keys forbid
    // and a hand-edited or half-synced index could still hold.
    f.addEdge({ source: 'function:deleted', target: 'function:charge', kind: 'calls', line: 1 });

    const edges = exportStructure(f.dir).edges;

    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 'function:retry', target: 'function:charge' });
  });

  it('restricts to the given paths: their files, their nodes, and the edges written in them', () => {
    const f = markedFixture();

    const caller = exportStructure(f.dir, { onlyPaths: ['src/billing/retry.ts'] });
    expect(caller.files.map((x) => x.path)).toEqual(['src/billing/retry.ts']);
    expect(caller.nodes.map((n) => n.id)).toEqual(['function:retry']);
    // The edge is written in retry.ts, so it belongs to that file — even
    // though its target is in a file that was not asked for.
    expect(caller.edges.map((e) => `${e.source}->${e.target}`)).toEqual(['function:retry->function:charge']);

    const callee = exportStructure(f.dir, { onlyPaths: ['src/billing/charge.ts'] });
    expect(callee.nodes.map((n) => n.id)).toEqual(['function:charge']);
    expect(callee.edges).toEqual([]);

    expect(exportStructure(f.dir, { onlyPaths: [] })).toMatchObject({
      available: true,
      files: [],
      nodes: [],
      edges: [],
    });
    expect(JSON.stringify(caller) + JSON.stringify(callee)).not.toMatch(/MARKER_/);
  });

  it('says there is nothing to export — not an empty graph — when there is no index', () => {
    const none = emptyWorkingDir();
    fixtures.push(none);

    const exported = exportStructure(none.dir);

    expect(exported).toMatchObject({
      available: false,
      files: [],
      nodes: [],
      edges: [],
      indexerSchemaVersion: null,
    });
    expect(exported.reason).toMatch(/there is no code graph index/);
  });

  it('refuses an index missing an allowlisted column rather than exporting part of it', () => {
    const f = createGraphFixture(CODEGRAPH_SCHEMA.replace('  qualified_name TEXT NOT NULL,\n', ''));
    fixtures.push(f);

    const exported = exportStructure(f.dir);

    expect(exported.available).toBe(false);
    expect(exported.reason).toMatch(/has no nodes\.qualified_name column/);
  });
});

/**
 * The same boundary, against a real index — only when one is pointed at.
 *
 *   DEVPILOT_TEST_CODE_GRAPH_DIR=/path/to/a/repo-with-.codegraph pnpm --filter @devpilot.sh/core test
 *
 * Skipped otherwise, and nothing committed depends on it. It is here because a
 * fixture can only contain the source text somebody thought to put in it; a
 * real index contains whatever the indexer actually writes.
 */
const REAL = process.env.DEVPILOT_TEST_CODE_GRAPH_DIR;

describe.skipIf(!REAL)('exportStructure — against a real index (DEVPILOT_TEST_CODE_GRAPH_DIR)', () => {
  it('exports structure and none of the docstrings or signatures the index holds', () => {
    const status = readGraphStatus(REAL!);
    expect(status.initialized, status.reason).toBe(true);

    const exported = exportStructure(REAL!);
    expect(exported.available).toBe(true);
    expect(exported.files).toHaveLength(status.files);
    expect(exported.nodes).toHaveLength(status.nodes);
    // Never more edges than the index has; fewer only where an end is missing.
    expect(exported.edges.length).toBeLessThanOrEqual(status.edges);

    const serialised = JSON.stringify(exported);

    // Read the source text straight from the index and look for it in the
    // export. Only texts long enough that a match cannot be a coincidence — a
    // signature of `()` is also a substring of plenty of honest JSON.
    const raw = new Database(graphDbPath(REAL!), { readonly: true, fileMustExist: true });
    try {
      const texts = raw
        .prepare(
          `SELECT docstring AS text FROM nodes WHERE length(docstring) >= 40
           UNION SELECT signature FROM nodes WHERE length(signature) >= 40`
        )
        .all() as { text: string }[];
      expect(texts.length).toBeGreaterThan(0);

      const crossed = texts.filter(({ text }) => serialised.includes(JSON.stringify(text).slice(1, -1)));
      expect(crossed.map((c) => c.text.slice(0, 80))).toEqual([]);
    } finally {
      raw.close();
    }
  });
});
