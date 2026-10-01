/**
 * What of a code graph may leave the machine: its structure, and nothing else.
 *
 * The hosted plane's central promise is that it never receives source. A code
 * graph tests that promise directly, because the index holds source: the
 * indexer writes each symbol's literal signature and docstring into `nodes`,
 * and resolution details into `edges.metadata` (TRD 27 §8.1).
 *
 * So this is built from an ALLOWLIST of columns, in two places on purpose:
 *
 *  1. The SELECTs below name every column they read. There is no `SELECT *`.
 *  2. Each row is then copied field by field into a new object. The row itself
 *     is never returned, spread or serialised.
 *
 * Either alone would do today. Together they mean a column added by a later
 * indexer version cannot start crossing by accident — it is not selected — and
 * neither can a column someone later adds to a SELECT here without also adding
 * it to the type and the copy, which is a change a reviewer sees.
 *
 * A denylist would fail the other way: it is correct on the day it is written
 * and wrong on the day the indexer adds `nodes.body`.
 *
 * WHAT DOES CROSS, stated plainly because it is more than crossed before:
 * file paths, languages and content hashes; and for each symbol its kind, its
 * NAME and qualified name, the lines it spans and whether it is exported; and
 * which symbol uses which. Names are identifiers from the user's code. That is
 * less than source and more than nothing, which is why the sync that calls
 * this is opt-in per repository.
 *
 * `tests/code-graph-boundary.test.ts` holds the line: a fixture with a marker
 * string in every column that is not on the list, and an assertion that the
 * serialised export contains none of them.
 */

import { IN_CHUNK, chunked, columnsOf, placeholders, withGraph, type GraphConnection } from './db';

export interface StructureFile {
  path: string;
  /** The indexer's hash of the file's content. What makes a sync incremental; not reversible to content. */
  contentHash: string;
  language: string;
}

export interface StructureNode {
  id: string;
  kind: string;
  name: string;
  qualifiedName: string;
  filePath: string;
  startLine: number;
  endLine: number;
  isExported: boolean;
}

export interface StructureEdge {
  source: string;
  target: string;
  kind: string;
  line: number | null;
  /**
   * The file of the SOURCE node. An edge belongs to the file it is written in,
   * which is what lets a sync replace one changed file's edges without
   * touching another's.
   */
  filePath: string;
}

export interface StructureExport {
  /**
   * False when there is no readable index; the three lists are then empty and
   * `reason` says why. An uploader MUST check this: an empty export from a
   * missing index is not an empty repository, and treating it as one would
   * delete the hosted copy.
   */
  available: boolean;
  reason?: string;
  files: StructureFile[];
  nodes: StructureNode[];
  edges: StructureEdge[];
  indexerSchemaVersion: number | null;
}

/** The whole allowlist. Anything not named here is never read by this module. */
const FILE_COLUMNS = ['path', 'content_hash', 'language'] as const;
const NODE_COLUMNS = [
  'id',
  'kind',
  'name',
  'qualified_name',
  'file_path',
  'start_line',
  'end_line',
  'is_exported',
] as const;
const EDGE_COLUMNS = ['source', 'target', 'kind', 'line'] as const;

const REQUIRED = { files: FILE_COLUMNS, nodes: NODE_COLUMNS, edges: EDGE_COLUMNS };

/**
 * Export the structure of the index for `dir`.
 *
 * `onlyPaths` restricts it to those files: their file rows, the nodes defined
 * in them, and the edges whose source is in them. That is the unit a sync
 * replaces when a file's content hash changes.
 *
 * An edge whose target (or source) is not a node in the index is dropped. The
 * indexer's own foreign keys should make that impossible, but an edge pointing
 * at nothing is an external reference at best — a name from a dependency — and
 * there is no node to say what it is.
 *
 * Never throws; see `openGraph`.
 */
export function exportStructure(dir: string, opts: { onlyPaths?: string[] } = {}): StructureExport {
  const read = withGraph(dir, REQUIRED, (db) => {
    const paths = opts.onlyPaths ? [...new Set(opts.onlyPaths)] : null;

    return {
      files: readFiles(db, paths),
      nodes: readNodes(db, paths),
      edges: readEdges(db, paths),
      indexerSchemaVersion: readSchemaVersion(db),
    };
  });

  if (!read.ok) {
    return {
      available: false,
      reason: read.reason,
      files: [],
      nodes: [],
      edges: [],
      indexerSchemaVersion: null,
    };
  }
  return { available: true, ...read.value };
}

/**
 * Run a query once for everything, or once per chunk of `paths`.
 *
 * `select` has no WHERE of its own and `filterColumn` is a literal from this
 * file; the only caller-supplied values are the paths, and they are bound.
 */
function rowsFor(db: GraphConnection, select: string, filterColumn: string, paths: string[] | null): unknown[] {
  if (paths === null) return db.prepare(select).all();

  const rows: unknown[] = [];
  for (const chunk of chunked(paths, IN_CHUNK)) {
    rows.push(
      ...db.prepare(`${select} WHERE ${filterColumn} IN (${placeholders(chunk.length)})`).all(...chunk)
    );
  }
  return rows;
}

function readFiles(db: GraphConnection, paths: string[] | null): StructureFile[] {
  const rows = rowsFor(db, 'SELECT path, content_hash, language FROM files', 'path', paths) as {
    path: string;
    content_hash: string;
    language: string;
  }[];

  return rows
    .map((row) => ({ path: row.path, contentHash: row.content_hash, language: row.language }))
    .sort((a, b) => compare(a.path, b.path));
}

function readNodes(db: GraphConnection, paths: string[] | null): StructureNode[] {
  const rows = rowsFor(
    db,
    'SELECT id, kind, name, qualified_name, file_path, start_line, end_line, is_exported FROM nodes',
    'file_path',
    paths
  ) as {
    id: string;
    kind: string;
    name: string;
    qualified_name: string;
    file_path: string;
    start_line: number;
    end_line: number;
    is_exported: number | null;
  }[];

  return rows
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      name: row.name,
      qualifiedName: row.qualified_name,
      filePath: row.file_path,
      startLine: row.start_line,
      endLine: row.end_line,
      isExported: row.is_exported === 1,
    }))
    .sort((a, b) => compare(a.filePath, b.filePath) || a.startLine - b.startLine || compare(a.id, b.id));
}

function readEdges(db: GraphConnection, paths: string[] | null): StructureEdge[] {
  // Both joins are inner: an edge is exported only when both of its ends are
  // nodes in the index. `s.file_path` is the one column read from the joined
  // rows, and it is a path — already on the list above.
  const rows = rowsFor(
    db,
    `SELECT e.source AS source, e.target AS target, e.kind AS kind, e.line AS line, s.file_path AS file_path
       FROM edges e
       JOIN nodes s ON s.id = e.source
       JOIN nodes t ON t.id = e.target`,
    's.file_path',
    paths
  ) as { source: string; target: string; kind: string; line: number | null; file_path: string }[];

  return rows
    .map((row) => ({
      source: row.source,
      target: row.target,
      kind: row.kind,
      line: typeof row.line === 'number' ? row.line : null,
      filePath: row.file_path,
    }))
    .sort(
      (a, b) =>
        compare(a.filePath, b.filePath) ||
        compare(a.source, b.source) ||
        compare(a.target, b.target) ||
        compare(a.kind, b.kind) ||
        (a.line ?? -1) - (b.line ?? -1)
    );
}

function readSchemaVersion(db: GraphConnection): number | null {
  if (!columnsOf(db, 'schema_versions').includes('version')) return null;
  const row = db.prepare('SELECT max(version) AS v FROM schema_versions').get() as { v: number | null };
  return typeof row.v === 'number' ? row.v : null;
}

/** Code-unit order, not locale order: the same export on every machine. */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
