/**
 * Opening someone else's database.
 *
 * The index at `<dir>/.codegraph/codegraph.db` is written by `codegraph`
 * (github.com/colbymchenry/codegraph, MIT), not by DevPilot. Everything in this
 * directory reads it and nothing writes it, and three things follow from its
 * not being ours:
 *
 *  - **It may not be there.** The indexer is an optional install, off by
 *    default (TRD 27 §7.2), and a fresh git worktree has no index until one is
 *    seeded. "No index" is the ordinary case, not an error, and every reader
 *    here answers it with a reason instead of throwing.
 *  - **It may not be the shape we expect.** The schema belongs to a tool nine
 *    months old with one author, pinned but replaceable. A table or column
 *    that has moved is answered the same way — `available: false`, and which
 *    table or column — so the caller carries on exactly as it would with no
 *    index. Nothing in the product may depend on the graph being present.
 *  - **It is opened read-only.** `readonly: true` cannot change a row, and
 *    `fileMustExist: true` cannot create an empty database where the caller
 *    mistyped a path — which a later read would then report as an index with
 *    nothing in it. One caveat that is SQLite's and not ours to remove: the
 *    indexer leaves the database in WAL mode, and a read-only connection to a
 *    WAL database still creates the `-shm` / `-wal` side files next to it if
 *    they are not already there. They land inside `.codegraph/`, which the
 *    tool's own `.gitignore` already ignores.
 */

import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** The directory the indexer keeps its index in, inside a working directory. */
export const CODE_GRAPH_DIR = '.codegraph';

/** The database file inside it. */
const CODE_GRAPH_DB_FILE = 'codegraph.db';

/** Where the index for a working directory lives, whether or not it exists. */
export function graphDbPath(dir: string): string {
  return join(dir, CODE_GRAPH_DIR, CODE_GRAPH_DB_FILE);
}

export type GraphConnection = Database.Database;

/** The columns a reader needs, by table. Checked before the first query. */
export type RequiredColumns = Record<string, readonly string[]>;

export type OpenedGraph =
  | { ok: true; db: GraphConnection; dbPath: string }
  | { ok: false; reason: string; dbPath: string };

/**
 * Open the index for `dir`, or say why not.
 *
 * `required` is checked up front rather than left to the queries to trip over,
 * because the two failures read very differently to the person who has to act:
 * "no such column: file_path" is a SQLite error about a query they never saw,
 * and "the index has no nodes.file_path column — it was written by a different
 * indexer version" is something they can do something about.
 *
 * The caller closes what it is given; see `withGraph`.
 */
export function openGraph(dir: string, required: RequiredColumns = {}): OpenedGraph {
  const dbPath = graphDbPath(dir);

  if (!existsSync(dbPath)) {
    return { ok: false, dbPath, reason: `there is no code graph index at ${dbPath}` };
  }

  let db: GraphConnection;
  try {
    // A second of patience for a lock, no more. The indexer's daemon writes to
    // this file as the user edits; in WAL mode readers do not wait for it, but
    // a checkpoint can hold the file briefly, and a planner that hangs on an
    // aid is worse than one that goes without it.
    db = new Database(dbPath, { readonly: true, fileMustExist: true, timeout: 1000 });
  } catch (error) {
    return { ok: false, dbPath, reason: `the code graph index at ${dbPath} could not be opened: ${messageOf(error)}` };
  }

  try {
    const missing = missingColumns(db, required);
    if (missing) {
      db.close();
      return {
        ok: false,
        dbPath,
        reason:
          `the code graph index at ${dbPath} ${missing} — it was written by an indexer version ` +
          `this build does not read`,
      };
    }
  } catch (error) {
    // Not a database at all, or one SQLite cannot read: the PRAGMA is the
    // first statement to touch the file's pages.
    closeQuietly(db);
    return { ok: false, dbPath, reason: `the code graph index at ${dbPath} could not be read: ${messageOf(error)}` };
  }

  return { ok: true, db, dbPath };
}

/**
 * Run `read` against the index for `dir` and close the connection whatever
 * happens. A read that throws is an answer too: the index changed shape in a
 * way the column check did not anticipate, or was replaced mid-read.
 */
export function withGraph<T>(
  dir: string,
  required: RequiredColumns,
  read: (db: GraphConnection, dbPath: string) => T
): { ok: true; value: T; dbPath: string } | { ok: false; reason: string; dbPath: string } {
  const opened = openGraph(dir, required);
  if (!opened.ok) return opened;

  try {
    return { ok: true, value: read(opened.db, opened.dbPath), dbPath: opened.dbPath };
  } catch (error) {
    return {
      ok: false,
      dbPath: opened.dbPath,
      reason: `the code graph index at ${opened.dbPath} could not be read: ${messageOf(error)}`,
    };
  } finally {
    closeQuietly(opened.db);
  }
}

/**
 * "has no `edges` table" / "has no nodes.file_path column", or null when
 * everything asked for is there. Names the first thing missing: one is enough
 * to say the index is not readable, and a list of nine reads as noise.
 */
function missingColumns(db: GraphConnection, required: RequiredColumns): string | null {
  for (const [table, columns] of Object.entries(required)) {
    const present = new Set(columnsOf(db, table));
    if (present.size === 0) return `has no \`${table}\` table`;
    for (const column of columns) {
      if (!present.has(column)) return `has no ${table}.${column} column`;
    }
  }
  return null;
}

/**
 * The columns of a table, or none when it does not exist.
 *
 * The table name is interpolated — PRAGMA takes no bound parameters — so it is
 * only ever one of the literals in this directory's `REQUIRED_*` constants,
 * never anything a caller passes in.
 */
export function columnsOf(db: GraphConnection, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
}

function closeQuietly(db: GraphConnection): void {
  try {
    db.close();
  } catch {
    // Closing a connection that failed to read has nothing useful to report.
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * SQLite's default cap on bound parameters was 999 for a long time and callers
 * pass file lists of any length, so every `IN (…)` here is fed in chunks well
 * under it.
 */
export const IN_CHUNK = 400;

export function chunked<T>(values: readonly T[], size: number = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

export function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}
