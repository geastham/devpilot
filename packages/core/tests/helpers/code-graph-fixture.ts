import Database from 'better-sqlite3';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * A small code graph index, built the way the indexer builds one.
 *
 * The tests for `src/code-graph` must not depend on the `codegraph` binary or
 * on anybody's real index, so they write their own: the same tables and
 * columns as codegraph 1.6.1's `schema.sql` (the parts DevPilot reads, and the
 * parts it must never read), in a temporary directory laid out as a working
 * directory with `.codegraph/codegraph.db` inside it.
 *
 * Like the real one it is left in WAL mode, because that is what a reader
 * opening it read-only has to cope with.
 */

/** The DDL, column for column, as the indexer writes it. */
export const CODEGRAPH_SCHEMA = `
CREATE TABLE schema_versions (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL,
  description TEXT
);
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  qualified_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  language TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  start_column INTEGER NOT NULL,
  end_column INTEGER NOT NULL,
  docstring TEXT,
  signature TEXT,
  visibility TEXT,
  is_exported INTEGER DEFAULT 0,
  is_async INTEGER DEFAULT 0,
  is_static INTEGER DEFAULT 0,
  is_abstract INTEGER DEFAULT 0,
  decorators TEXT,
  type_parameters TEXT,
  return_type TEXT,
  updated_at INTEGER NOT NULL
);
CREATE TABLE edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  kind TEXT NOT NULL,
  metadata TEXT,
  line INTEGER,
  col INTEGER,
  provenance TEXT DEFAULT NULL
);
CREATE TABLE files (
  path TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  language TEXT NOT NULL,
  size INTEGER NOT NULL,
  modified_at INTEGER NOT NULL,
  indexed_at INTEGER NOT NULL,
  node_count INTEGER DEFAULT 0,
  errors TEXT,
  generated INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_nodes_file_path ON nodes(file_path);
CREATE INDEX idx_edges_target_kind ON edges(target, kind);
`;

export interface FixtureNode {
  id: string;
  file: string;
  kind?: string;
  name?: string;
  qualifiedName?: string;
  startLine?: number;
  endLine?: number;
  isExported?: boolean;
  docstring?: string | null;
  signature?: string | null;
  visibility?: string | null;
  decorators?: string | null;
  typeParameters?: string | null;
  returnType?: string | null;
}

export interface FixtureEdge {
  source: string;
  target: string;
  kind: string;
  line?: number | null;
  metadata?: string | null;
  provenance?: string | null;
}

export interface GraphFixture {
  /** The working directory: pass this to the readers. */
  dir: string;
  dbPath: string;
  /** A writable connection, for a test that wants to change the index under a reader. */
  db: Database.Database;
  addFile(path: string, overrides?: { contentHash?: string; language?: string; indexedAt?: number; errors?: string | null }): void;
  addNode(node: FixtureNode): void;
  addEdge(edge: FixtureEdge): void;
  /**
   * Shorthand for the common case: `uses('b.ts', 'a.ts')` records that a
   * symbol in b.ts calls one in a.ts, creating the files and a symbol in each
   * as needed. `kind` is the edge kind.
   */
  uses(from: string, to: string, kind?: string): void;
  cleanup(): void;
}

/** A directory with no index in it — what a fresh worktree looks like. */
export function emptyWorkingDir(): { dir: string; cleanup(): void } {
  const dir = mkdtempSync(join(tmpdir(), 'devpilot-code-graph-none-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export function createGraphFixture(schema: string = CODEGRAPH_SCHEMA): GraphFixture {
  const dir = mkdtempSync(join(tmpdir(), 'devpilot-code-graph-'));
  mkdirSync(join(dir, '.codegraph'));
  const dbPath = join(dir, '.codegraph', 'codegraph.db');

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(schema);

  const hasVersions = (db.prepare("SELECT name FROM sqlite_master WHERE name = 'schema_versions'").all()).length > 0;
  if (hasVersions) {
    db.prepare('INSERT INTO schema_versions (version, applied_at, description) VALUES (?, ?, ?)').run(
      11,
      1790873303793,
      'Initial schema includes all migrations'
    );
  }

  const files = new Set<string>();
  const nodes = new Set<string>();
  /** Files that already have their file → symbol `contains` edge. */
  const contained = new Set<string>();

  const fixture: GraphFixture = {
    dir,
    dbPath,
    db,

    addFile(path, overrides = {}) {
      if (files.has(path)) return;
      files.add(path);
      db.prepare(
        `INSERT INTO files (path, content_hash, language, size, modified_at, indexed_at, node_count, errors)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        path,
        overrides.contentHash ?? `hash-of-${path}`,
        overrides.language ?? 'typescript',
        100,
        1790873300000,
        overrides.indexedAt ?? 1790873304000,
        1,
        overrides.errors ?? null
      );
    },

    addNode(node) {
      fixture.addFile(node.file);
      if (nodes.has(node.id)) return;
      nodes.add(node.id);
      db.prepare(
        `INSERT INTO nodes (id, kind, name, qualified_name, file_path, language, start_line, end_line,
           start_column, end_column, docstring, signature, visibility, is_exported, decorators,
           type_parameters, return_type, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        node.id,
        node.kind ?? 'function',
        node.name ?? node.id,
        node.qualifiedName ?? node.name ?? node.id,
        node.file,
        'typescript',
        node.startLine ?? 1,
        node.endLine ?? 10,
        0,
        1,
        node.docstring ?? null,
        node.signature ?? null,
        node.visibility ?? null,
        node.isExported ? 1 : 0,
        node.decorators ?? null,
        node.typeParameters ?? null,
        node.returnType ?? null,
        1790873304000
      );
    },

    addEdge(edge) {
      db.prepare(
        'INSERT INTO edges (source, target, kind, metadata, line, col, provenance) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(
        edge.source,
        edge.target,
        edge.kind,
        edge.metadata ?? null,
        edge.line ?? null,
        0,
        edge.provenance ?? null
      );
    },

    uses(from, to, kind = 'calls') {
      // One symbol per file, plus the file node the indexer always writes and
      // the `contains` edge from it — which is the edge that must never count.
      for (const file of [from, to]) {
        fixture.addNode({ id: `file:${file}`, file, kind: 'file', name: file });
        fixture.addNode({ id: `fn:${file}`, file, name: `fn_${file}` });
        if (!contained.has(file)) {
          contained.add(file);
          fixture.addEdge({ source: `file:${file}`, target: `fn:${file}`, kind: 'contains' });
        }
      }
      fixture.addEdge({ source: `fn:${from}`, target: `fn:${to}`, kind, line: 3 });
    },

    cleanup() {
      try {
        db.close();
      } catch {
        // already closed by the test
      }
      rmSync(dir, { recursive: true, force: true });
    },
  };

  return fixture;
}
