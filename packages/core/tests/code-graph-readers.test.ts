import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  affectedTests,
  dependentsOf,
  graphDbPath,
  isTestPath,
  readGraphStatus,
} from '../src/code-graph';
import {
  CODEGRAPH_SCHEMA,
  createGraphFixture,
  emptyWorkingDir,
  type GraphFixture,
} from './helpers/code-graph-fixture';

/**
 * The readers over a code graph index, against an index this test writes
 * itself — the indexer's own tables, no indexer.
 *
 * Two things are being pinned. What a dependent IS (an edge that means "uses",
 * into a node in the file, from a node in another file — never the `contains`
 * edge every file has to its own symbols). And what happens when there is no
 * index, or one this build cannot read: an answer with a reason, never a
 * throw, because every caller of these carries on without the graph.
 */

let fixtures: { cleanup(): void }[] = [];

function fixture(schema?: string): GraphFixture {
  const f = createGraphFixture(schema);
  fixtures.push(f);
  return f;
}

afterEach(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});

/**
 * A chain four files long, so each depth has something new to find:
 *
 *   policy.ts ◀─ fetch.ts ◀─ client.ts ◀─ page.tsx ◀─ app.tsx
 *                  ▲
 *                  └── fetch.test.ts
 */
function chain(): GraphFixture {
  const f = fixture();
  f.uses('src/fetch.ts', 'src/policy.ts', 'imports');
  f.uses('src/client.ts', 'src/fetch.ts');
  f.uses('src/page.tsx', 'src/client.ts');
  f.uses('src/app.tsx', 'src/page.tsx');
  f.uses('src/fetch.test.ts', 'src/fetch.ts');
  return f;
}

describe('graphDbPath', () => {
  it('is <dir>/.codegraph/codegraph.db', () => {
    expect(graphDbPath('/work/repo')).toBe(join('/work/repo', '.codegraph', 'codegraph.db'));
  });
});

describe('readGraphStatus', () => {
  it('reports the size and age of an index', () => {
    const f = chain();
    f.addFile('src/late.ts', { indexedAt: 1790873309999 });

    expect(readGraphStatus(f.dir)).toEqual({
      initialized: true,
      dbPath: f.dbPath,
      files: 7,
      // Two per file `uses` touched: the file node and one function.
      nodes: 12,
      // Five `uses`, and a `contains` edge for each of the six files.
      edges: 11,
      // The newest file's time, not the oldest and not "now".
      indexedAt: 1790873309999,
      schemaVersion: 11,
    });
  });

  it('says there is no index, without throwing, for a directory that has none', () => {
    const none = emptyWorkingDir();
    fixtures.push(none);

    const status = readGraphStatus(none.dir);

    expect(status).toMatchObject({
      initialized: false,
      dbPath: graphDbPath(none.dir),
      files: 0,
      nodes: 0,
      edges: 0,
      indexedAt: null,
      schemaVersion: null,
    });
    expect(status.reason).toMatch(/there is no code graph index at /);
    // `fileMustExist`: asking did not create one.
    expect(existsSync(graphDbPath(none.dir))).toBe(false);
  });

  it('says so for a directory that does not exist at all', () => {
    expect(readGraphStatus('/nonexistent/devpilot/no-such-dir').initialized).toBe(false);
  });

  it('is not initialized for a file that is not a database', () => {
    const none = emptyWorkingDir();
    fixtures.push(none);
    mkdirSync(join(none.dir, '.codegraph'));
    writeFileSync(graphDbPath(none.dir), 'this is not sqlite');

    const status = readGraphStatus(none.dir);

    expect(status.initialized).toBe(false);
    expect(status.reason).toMatch(/could not be (read|opened)/);
  });

  it('is not initialized for a database that is not a code graph', () => {
    const f = fixture('CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT);');

    const status = readGraphStatus(f.dir);

    expect(status.initialized).toBe(false);
    expect(status.reason).toMatch(/has no `files` table/);
  });

  it('still reads an index that records no schema version', () => {
    const f = fixture(CODEGRAPH_SCHEMA.replace(/CREATE TABLE schema_versions \([^;]+;/, ''));
    f.uses('b.ts', 'a.ts');

    expect(readGraphStatus(f.dir)).toMatchObject({ initialized: true, files: 2, schemaVersion: null });
  });
});

describe('dependentsOf', () => {
  it('finds the files that directly use a file, at depth 1 by default', () => {
    const f = chain();

    expect(dependentsOf(f.dir, ['src/policy.ts'])).toEqual({
      available: true,
      byFile: { 'src/policy.ts': ['src/fetch.ts'] },
      truncated: false,
    });
    expect(dependentsOf(f.dir, ['src/fetch.ts']).byFile['src/fetch.ts']).toEqual([
      'src/client.ts',
      'src/fetch.test.ts',
    ]);
  });

  it('goes one step further with each depth, up to three', () => {
    const f = chain();
    const at = (depth: number) => dependentsOf(f.dir, ['src/policy.ts'], { depth }).byFile['src/policy.ts'];

    expect(at(1)).toEqual(['src/fetch.ts']);
    expect(at(2)).toEqual(['src/client.ts', 'src/fetch.test.ts', 'src/fetch.ts']);
    expect(at(3)).toEqual(['src/client.ts', 'src/fetch.test.ts', 'src/fetch.ts', 'src/page.tsx']);
    // Four steps away. Depth is capped at 3, whatever is asked for.
    expect(at(9)).not.toContain('src/app.tsx');
    expect(at(9)).toEqual(at(3));
    // And anything that is not a usable depth is the default, not an error.
    expect(at(0)).toEqual(at(1));
    expect(at(Number.NaN)).toEqual(at(1));
  });

  it('counts every edge kind that means "uses", and not `contains`', () => {
    const f = fixture();
    for (const kind of ['calls', 'imports', 'references', 'instantiates', 'extends', 'implements']) {
      f.uses(`src/by-${kind}.ts`, 'src/target.ts', kind);
    }
    // A link to a route is not a dependency on its code.
    f.uses('src/by-navigates.ts', 'src/target.ts', 'navigates');
    // `contains` from a node in ANOTHER file: nothing the real indexer writes,
    // and the only way to show the kind is excluded rather than merely
    // same-file. (Every file's own `contains` edge is there too, via `uses`.)
    f.addNode({ id: 'file:src/outer.ts', file: 'src/outer.ts', kind: 'file' });
    f.addEdge({ source: 'file:src/outer.ts', target: 'fn:src/target.ts', kind: 'contains' });

    expect(dependentsOf(f.dir, ['src/target.ts']).byFile['src/target.ts']).toEqual([
      'src/by-calls.ts',
      'src/by-extends.ts',
      'src/by-implements.ts',
      'src/by-imports.ts',
      'src/by-instantiates.ts',
      'src/by-references.ts',
    ]);
  });

  it('never lists a file as depending on itself — not directly, and not round a cycle', () => {
    const f = fixture();
    f.uses('a.ts', 'b.ts');
    f.uses('b.ts', 'a.ts');
    // A file's own functions calling each other.
    f.addNode({ id: 'fn2:a.ts', file: 'a.ts' });
    f.addEdge({ source: 'fn2:a.ts', target: 'fn:a.ts', kind: 'calls' });

    expect(dependentsOf(f.dir, ['a.ts'], { depth: 1 }).byFile['a.ts']).toEqual(['b.ts']);
    // At depth 2 the walk comes back to a.ts through b.ts.
    expect(dependentsOf(f.dir, ['a.ts'], { depth: 3 }).byFile['a.ts']).toEqual(['b.ts']);
  });

  it('answers each file on its own, under the string it was asked with', () => {
    const f = chain();

    const result = dependentsOf(f.dir, ['./src/policy.ts', 'src/client.ts', 'src/not-indexed.ts']);

    expect(result.byFile).toEqual({
      // Looked up without the leading `./`, returned under what was passed.
      './src/policy.ts': ['src/fetch.ts'],
      'src/client.ts': ['src/page.tsx'],
      // A file the index has never seen — one a task is about to create.
      'src/not-indexed.ts': [],
    });
  });

  it('cuts a long list at the limit, sorted first, and says it did', () => {
    const f = fixture();
    // Inserted out of order, so a prefix of insertion order would be wrong.
    for (const name of ['m', 'c', 'x', 'a', 'k']) f.uses(`src/${name}.ts`, 'src/hub.ts');
    f.uses('src/only.ts', 'src/leaf.ts');

    const cut = dependentsOf(f.dir, ['src/hub.ts', 'src/leaf.ts'], { limit: 3 });
    expect(cut.byFile['src/hub.ts']).toEqual(['src/a.ts', 'src/c.ts', 'src/k.ts']);
    // The limit is per file: the short list beside it is whole.
    expect(cut.byFile['src/leaf.ts']).toEqual(['src/only.ts']);
    expect(cut.truncated).toBe(true);

    const exact = dependentsOf(f.dir, ['src/hub.ts'], { limit: 5 });
    expect(exact.byFile['src/hub.ts']).toHaveLength(5);
    expect(exact.truncated).toBe(false);
  });

  it('is unavailable, with a reason and no lists, when there is no index', () => {
    const none = emptyWorkingDir();
    fixtures.push(none);

    const result = dependentsOf(none.dir, ['src/a.ts']);

    expect(result).toMatchObject({ available: false, byFile: {}, truncated: false });
    expect(result.reason).toMatch(/there is no code graph index at /);
  });

  it('is unavailable, naming what is missing, for an index with a different schema', () => {
    // A later indexer version that renamed the column the whole query rests on.
    const renamed = fixture(CODEGRAPH_SCHEMA.replace(/file_path/g, 'path_in_repo'));
    const result = dependentsOf(renamed.dir, ['src/a.ts']);
    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/has no nodes\.file_path column — it was written by an indexer version/);

    // And one with no edges table at all.
    const noEdges = fixture(CODEGRAPH_SCHEMA.replace(/CREATE TABLE edges \([^;]+;/, '').replace(/CREATE INDEX idx_edges[^;]+;/, ''));
    expect(dependentsOf(noEdges.dir, ['src/a.ts'])).toMatchObject({
      available: false,
      reason: expect.stringMatching(/has no `edges` table/),
    });
  });

  it('does not write to the index it reads', () => {
    const f = chain();
    const before = f.db.prepare('SELECT count(*) AS n FROM edges').get();
    const version = f.db.pragma('data_version', { simple: true });

    dependentsOf(f.dir, ['src/policy.ts'], { depth: 3 });
    affectedTests(f.dir, ['src/policy.ts']);
    readGraphStatus(f.dir);

    expect(f.db.prepare('SELECT count(*) AS n FROM edges').get()).toEqual(before);
    // `data_version` moves when another connection commits a change.
    expect(f.db.pragma('data_version', { simple: true })).toBe(version);
  });
});

describe('affectedTests', () => {
  it('finds the tests reached within three steps, and only the tests', () => {
    const f = chain();
    f.uses('tests/e2e/page.spec.ts', 'src/page.tsx');

    expect(affectedTests(f.dir, ['src/policy.ts'])).toEqual({
      available: true,
      // fetch.test.ts is two steps away; page.spec.ts would be four.
      tests: ['src/fetch.test.ts'],
      truncated: false,
    });
    expect(affectedTests(f.dir, ['src/fetch.ts']).tests).toEqual([
      'src/fetch.test.ts',
      'tests/e2e/page.spec.ts',
    ]);
  });

  it('puts the nearest tests first, whatever their paths, so a cut keeps the ones that matter', () => {
    const f = fixture();
    // zzz.test.ts imports the file directly. The aaa tests are three steps
    // away, through a hub — where, in a real index, the wrong edges collect.
    f.uses('src/zzz.test.ts', 'src/policy.ts');
    f.uses('src/fetch.ts', 'src/policy.ts');
    f.uses('src/hub.ts', 'src/fetch.ts');
    for (const name of ['aaa1', 'aaa2', 'aaa3']) f.uses(`src/${name}.test.ts`, 'src/hub.ts');
    f.uses('src/mid.test.ts', 'src/fetch.ts');

    expect(affectedTests(f.dir, ['src/policy.ts']).tests).toEqual([
      'src/zzz.test.ts', // one step
      'src/mid.test.ts', // two
      'src/aaa1.test.ts', // three, then by path
      'src/aaa2.test.ts',
      'src/aaa3.test.ts',
    ]);
    expect(affectedTests(f.dir, ['src/policy.ts'], { limit: 2 })).toEqual({
      available: true,
      tests: ['src/zzz.test.ts', 'src/mid.test.ts'],
      truncated: true,
    });
  });

  it('measures a test from the nearest of the files asked about', () => {
    const f = fixture();
    f.uses('src/fetch.ts', 'src/policy.ts');
    f.uses('src/fetch.test.ts', 'src/fetch.ts');
    f.uses('src/policy.test.ts', 'src/policy.ts');

    // fetch.test.ts is two steps from policy.ts and one from fetch.ts: one.
    expect(affectedTests(f.dir, ['src/policy.ts', 'src/fetch.ts']).tests).toEqual([
      'src/fetch.test.ts',
      'src/policy.test.ts',
    ]);
    expect(affectedTests(f.dir, ['src/policy.ts']).tests).toEqual(['src/policy.test.ts', 'src/fetch.test.ts']);
  });

  it('merges the tests of several files into one list with no repeats', () => {
    const f = fixture();
    f.uses('src/a.test.ts', 'src/a.ts');
    f.uses('src/shared.test.ts', 'src/a.ts');
    f.uses('src/shared.test.ts', 'src/b.ts');

    expect(affectedTests(f.dir, ['src/b.ts', 'src/a.ts']).tests).toEqual([
      'src/a.test.ts',
      'src/shared.test.ts',
    ]);
  });

  it('does not list a test just because it was one of the files asked about', () => {
    const f = fixture();
    f.uses('src/a.test.ts', 'src/a.ts');

    // Nothing depends on the test file: it is what is being changed.
    expect(affectedTests(f.dir, ['src/a.test.ts']).tests).toEqual([]);
    // Asked about together with what it tests, the test is reached from that.
    expect(affectedTests(f.dir, ['src/a.test.ts', 'src/a.ts']).tests).toEqual(['src/a.test.ts']);
  });

  it('cuts at the limit and says so', () => {
    const f = fixture();
    for (const name of ['c', 'a', 'b']) f.uses(`src/${name}.test.ts`, 'src/hub.ts');

    expect(affectedTests(f.dir, ['src/hub.ts'], { limit: 2 })).toEqual({
      available: true,
      tests: ['src/a.test.ts', 'src/b.test.ts'],
      truncated: true,
    });
  });

  it('is unavailable when there is no index', () => {
    const none = emptyWorkingDir();
    fixtures.push(none);

    expect(affectedTests(none.dir, ['src/a.ts'])).toMatchObject({
      available: false,
      tests: [],
      truncated: false,
      reason: expect.stringMatching(/there is no code graph index/),
    });
  });
});

describe('isTestPath', () => {
  it.each([
    'src/a.test.ts',
    'src/a.spec.tsx',
    'packages/core/tests/unit/plan-scorer.ts',
    'tests/e2e/flow.ts',
    'src/__tests__/a.ts',
    '__tests__/a.js',
    'pkg/server/handler_test.go',
    'app/test_models.py',
    'test_models.py',
    'src\\win\\a.test.ts',
  ])('%s is a test', (path) => {
    expect(isTestPath(path)).toBe(true);
  });

  it.each([
    'src/a.ts',
    'src/testing.ts',
    'src/contest/a.ts',
    'src/latests/a.ts',
    'src/test_helpers.ts',
    'pkg/server/handler.go',
    'app/models_test.py',
    'docs/tests.md',
  ])('%s is not', (path) => {
    expect(isTestPath(path)).toBe(false);
  });
});
