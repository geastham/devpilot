import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A small code graph index on disk, in the indexer's own schema.
 *
 * Tests must not need the real indexer (a 295 MB binary) or a real
 * repository, so this writes the SQLite file by hand with the columns the
 * tool's `src/db/schema.sql` declares — including the ones that hold literal
 * source text, so a test can put a marker there and prove it never leaves.
 *
 * `better-sqlite3` is core's dependency, not this package's; it is resolved
 * from core, which is where the reader that opens this file gets it too.
 */
const requireFromCore = createRequire(require.resolve('@devpilot.sh/core'));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Database = requireFromCore('better-sqlite3') as new (path: string) => {
  exec(sql: string): void;
  prepare(sql: string): { run(...args: unknown[]): void };
  close(): void;
};

export interface FixtureNode {
  id: string;
  name: string;
  file: string;
  kind?: string;
  docstring?: string;
  signature?: string;
  exported?: boolean;
}

export interface FixtureEdge {
  from: string;
  to: string;
  kind?: string;
  metadata?: string;
}

export function writeGraphFixture(
  dir: string,
  graph: { files: Record<string, string>; nodes: FixtureNode[]; edges: FixtureEdge[] }
): string {
  mkdirSync(join(dir, '.codegraph'), { recursive: true });
  const path = join(dir, '.codegraph', 'codegraph.db');
  const db = new Database(path);
  db.exec(`
    CREATE TABLE schema_versions (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL, description TEXT);
    INSERT INTO schema_versions VALUES (2, 0, 'fixture');
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, qualified_name TEXT NOT NULL,
      file_path TEXT NOT NULL, language TEXT NOT NULL, start_line INTEGER NOT NULL, end_line INTEGER NOT NULL,
      start_column INTEGER NOT NULL, end_column INTEGER NOT NULL, docstring TEXT, signature TEXT, visibility TEXT,
      is_exported INTEGER DEFAULT 0, is_async INTEGER DEFAULT 0, is_static INTEGER DEFAULT 0, is_abstract INTEGER DEFAULT 0,
      decorators TEXT, type_parameters TEXT, return_type TEXT, updated_at INTEGER NOT NULL
    );
    CREATE TABLE edges (
      id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, target TEXT NOT NULL, kind TEXT NOT NULL,
      metadata TEXT, line INTEGER, col INTEGER, provenance TEXT DEFAULT NULL
    );
    CREATE TABLE files (
      path TEXT PRIMARY KEY, content_hash TEXT NOT NULL, language TEXT NOT NULL, size INTEGER NOT NULL,
      modified_at INTEGER NOT NULL, indexed_at INTEGER NOT NULL, node_count INTEGER DEFAULT 0, errors TEXT,
      generated INTEGER NOT NULL DEFAULT 0
    );
  `);
  const file = db.prepare('INSERT INTO files (path, content_hash, language, size, modified_at, indexed_at) VALUES (?, ?, ?, 10, 0, 1700000000000)');
  for (const [path_, hash] of Object.entries(graph.files)) file.run(path_, hash, 'typescript');

  const node = db.prepare(
    `INSERT INTO nodes (id, kind, name, qualified_name, file_path, language, start_line, end_line, start_column, end_column,
       docstring, signature, is_exported, decorators, return_type, updated_at)
     VALUES (?, ?, ?, ?, ?, 'typescript', 1, 9, 0, 0, ?, ?, ?, ?, ?, 0)`
  );
  for (const n of graph.nodes) {
    node.run(n.id, n.kind ?? 'function', n.name, `${n.file}::${n.name}`, n.file, n.docstring ?? null, n.signature ?? null, n.exported ? 1 : 0, null, null);
  }
  const edge = db.prepare('INSERT INTO edges (source, target, kind, metadata, line) VALUES (?, ?, ?, ?, 3)');
  for (const e of graph.edges) edge.run(e.from, e.to, e.kind ?? 'calls', e.metadata ?? null);
  db.close();
  return path;
}
