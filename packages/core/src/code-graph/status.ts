import { columnsOf, graphDbPath, withGraph } from './db';

export interface GraphStatus {
  /**
   * True when there is an index at `dbPath` that this build can read: the file
   * exists, opens, and has the `files`, `nodes` and `edges` tables.
   *
   * False covers every other case, and `reason` says which. It is deliberately
   * not split into "absent" and "unreadable": to every caller they mean the
   * same thing — carry on without the graph.
   */
  initialized: boolean;
  dbPath: string;
  files: number;
  nodes: number;
  edges: number;
  /**
   * When the index was last written, epoch milliseconds: the newest
   * `files.indexed_at`. Null when there is no index or no file in it.
   *
   * This is the index's age, not a claim that it matches the working tree.
   * A file edited since is stale in the index until the indexer syncs it, and
   * nothing here can see that.
   */
  indexedAt: number | null;
  /** The indexer's own schema version (newest `schema_versions.version`), when it records one. */
  schemaVersion: number | null;
  /** Why `initialized` is false. Absent when it is true. */
  reason?: string;
}

/**
 * Whether `dir` has a code graph index, and how big and how old it is.
 *
 * Never throws. Every failure — no file, not a database, a different schema —
 * comes back as `initialized: false` with zero counts and a reason.
 */
export function readGraphStatus(dir: string): GraphStatus {
  const read = withGraph(dir, { files: ['indexed_at'], nodes: [], edges: [] }, (db) => {
    const count = (table: 'files' | 'nodes' | 'edges') =>
      (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;

    const newest = (db.prepare('SELECT max(indexed_at) AS at FROM files').get() as { at: number | null }).at;

    // Optional: the three tables above are the index, this one only labels it.
    // An index without it is still an index.
    const schemaVersion = columnsOf(db, 'schema_versions').includes('version')
      ? (db.prepare('SELECT max(version) AS v FROM schema_versions').get() as { v: number | null }).v
      : null;

    return {
      files: count('files'),
      nodes: count('nodes'),
      edges: count('edges'),
      indexedAt: typeof newest === 'number' ? newest : null,
      schemaVersion: typeof schemaVersion === 'number' ? schemaVersion : null,
    };
  });

  if (!read.ok) {
    return {
      initialized: false,
      dbPath: graphDbPath(dir),
      files: 0,
      nodes: 0,
      edges: 0,
      indexedAt: null,
      schemaVersion: null,
      reason: read.reason,
    };
  }

  return { initialized: true, dbPath: read.dbPath, ...read.value };
}
