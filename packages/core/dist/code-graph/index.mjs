// src/code-graph/db.ts
import Database from "better-sqlite3";
import { existsSync } from "fs";
import { join } from "path";
var CODE_GRAPH_DIR = ".codegraph";
var CODE_GRAPH_DB_FILE = "codegraph.db";
function graphDbPath(dir) {
  return join(dir, CODE_GRAPH_DIR, CODE_GRAPH_DB_FILE);
}
function openGraph(dir, required = {}) {
  const dbPath = graphDbPath(dir);
  if (!existsSync(dbPath)) {
    return { ok: false, dbPath, reason: `there is no code graph index at ${dbPath}` };
  }
  let db;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true, timeout: 1e3 });
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
        reason: `the code graph index at ${dbPath} ${missing} \u2014 it was written by an indexer version this build does not read`
      };
    }
  } catch (error) {
    closeQuietly(db);
    return { ok: false, dbPath, reason: `the code graph index at ${dbPath} could not be read: ${messageOf(error)}` };
  }
  return { ok: true, db, dbPath };
}
function withGraph(dir, required, read) {
  const opened = openGraph(dir, required);
  if (!opened.ok) return opened;
  try {
    return { ok: true, value: read(opened.db, opened.dbPath), dbPath: opened.dbPath };
  } catch (error) {
    return {
      ok: false,
      dbPath: opened.dbPath,
      reason: `the code graph index at ${opened.dbPath} could not be read: ${messageOf(error)}`
    };
  } finally {
    closeQuietly(opened.db);
  }
}
function missingColumns(db, required) {
  for (const [table, columns] of Object.entries(required)) {
    const present = new Set(columnsOf(db, table));
    if (present.size === 0) return `has no \`${table}\` table`;
    for (const column of columns) {
      if (!present.has(column)) return `has no ${table}.${column} column`;
    }
  }
  return null;
}
function columnsOf(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}
function closeQuietly(db) {
  try {
    db.close();
  } catch {
  }
}
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
var IN_CHUNK = 400;
function chunked(values, size = IN_CHUNK) {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}
function placeholders(count) {
  return Array.from({ length: count }, () => "?").join(", ");
}

// src/code-graph/status.ts
function readGraphStatus(dir) {
  const read = withGraph(dir, { files: ["indexed_at"], nodes: [], edges: [] }, (db) => {
    const count = (table) => db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;
    const newest = db.prepare("SELECT max(indexed_at) AS at FROM files").get().at;
    const schemaVersion = columnsOf(db, "schema_versions").includes("version") ? db.prepare("SELECT max(version) AS v FROM schema_versions").get().v : null;
    return {
      files: count("files"),
      nodes: count("nodes"),
      edges: count("edges"),
      indexedAt: typeof newest === "number" ? newest : null,
      schemaVersion: typeof schemaVersion === "number" ? schemaVersion : null
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
      reason: read.reason
    };
  }
  return { initialized: true, dbPath: read.dbPath, ...read.value };
}

// src/code-graph/dependents.ts
var DEPENDENCY_EDGE_KINDS = [
  "calls",
  "imports",
  "references",
  "instantiates",
  "extends",
  "implements"
];
var REQUIRED = { nodes: ["id", "file_path"], edges: ["source", "target", "kind"] };
var DEFAULT_DEPTH = 1;
var MAX_DEPTH = 3;
var DEFAULT_LIMIT = 200;
var MAX_LIMIT = 2e3;
function dependentsOf(dir, files, opts = {}) {
  const depth = clampInt(opts.depth, DEFAULT_DEPTH, 1, MAX_DEPTH);
  const limit = clampInt(opts.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const read = withGraph(dir, REQUIRED, (db) => {
    const direct = directDependentsReader(db);
    const byFile = {};
    let truncated = false;
    for (const file of files) {
      const all = [...reach(direct, normalizePath(file), depth).keys()].sort();
      if (all.length > limit) truncated = true;
      byFile[file] = all.slice(0, limit);
    }
    return { byFile, truncated };
  });
  if (!read.ok) return { available: false, reason: read.reason, byFile: {}, truncated: false };
  return { available: true, ...read.value };
}
function affectedTests(dir, files, opts = {}) {
  const limit = clampInt(opts.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const read = withGraph(dir, REQUIRED, (db) => {
    const direct = directDependentsReader(db);
    const nearest = /* @__PURE__ */ new Map();
    for (const file of files) {
      for (const [dependent, steps] of reach(direct, normalizePath(file), MAX_DEPTH)) {
        if (!isTestPath(dependent)) continue;
        const known = nearest.get(dependent);
        if (known === void 0 || steps < known) nearest.set(dependent, steps);
      }
    }
    const ordered = [...nearest.entries()].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([test]) => test);
    return { tests: ordered.slice(0, limit), truncated: ordered.length > limit };
  });
  if (!read.ok) return { available: false, reason: read.reason, tests: [], truncated: false };
  return { available: true, ...read.value };
}
function isTestPath(path) {
  const normalized = path.replace(/\\/g, "/");
  const base = normalized.slice(normalized.lastIndexOf("/") + 1);
  if (base.includes(".test.") || base.includes(".spec.")) return true;
  if (base.endsWith("_test.go")) return true;
  if (/^test_.*\.py$/.test(base)) return true;
  const directories = `/${normalized.slice(0, normalized.length - base.length)}`;
  return directories.includes("/tests/") || directories.includes("/__tests__/");
}
function directDependentsReader(db) {
  const queries = /* @__PURE__ */ new Map();
  const kinds = DEPENDENCY_EDGE_KINDS.map((k) => `'${k}'`).join(", ");
  const queryFor = (count) => {
    let query = queries.get(count);
    if (!query) {
      const statement = db.prepare(
        `SELECT DISTINCT t.file_path AS target, s.file_path AS source
           FROM nodes t
           JOIN edges e ON e.target = t.id
           JOIN nodes s ON s.id = e.source
          WHERE t.file_path IN (${placeholders(count)})
            AND e.kind IN (${kinds})
            AND s.file_path <> t.file_path`
      );
      query = (files) => statement.all(...files);
      queries.set(count, query);
    }
    return query;
  };
  return (files) => {
    const out = /* @__PURE__ */ new Map();
    for (const chunk of chunked(files, IN_CHUNK)) {
      const rows = queryFor(chunk.length)(chunk);
      for (const row of rows) {
        let sources = out.get(row.target);
        if (!sources) out.set(row.target, sources = /* @__PURE__ */ new Set());
        sources.add(row.source);
      }
    }
    return out;
  };
}
function reach(direct, file, depth) {
  const steps = /* @__PURE__ */ new Map([[file, 0]]);
  let frontier = [file];
  for (let step = 1; step <= depth && frontier.length > 0; step++) {
    const next = [];
    for (const sources of direct(frontier).values()) {
      for (const source of sources) {
        if (!steps.has(source)) {
          steps.set(source, step);
          next.push(source);
        }
      }
    }
    frontier = next;
  }
  steps.delete(file);
  return steps;
}
function normalizePath(path) {
  return path.trim().replace(/\\/g, "/").replace(/^(\.\/)+/, "");
}
function clampInt(value, fallback, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

// src/code-graph/structure.ts
var FILE_COLUMNS = ["path", "content_hash", "language"];
var NODE_COLUMNS = [
  "id",
  "kind",
  "name",
  "qualified_name",
  "file_path",
  "start_line",
  "end_line",
  "is_exported"
];
var EDGE_COLUMNS = ["source", "target", "kind", "line"];
var REQUIRED2 = { files: FILE_COLUMNS, nodes: NODE_COLUMNS, edges: EDGE_COLUMNS };
function exportStructure(dir, opts = {}) {
  const read = withGraph(dir, REQUIRED2, (db) => {
    const paths = opts.onlyPaths ? [...new Set(opts.onlyPaths)] : null;
    return {
      files: readFiles(db, paths),
      nodes: readNodes(db, paths),
      edges: readEdges(db, paths),
      indexerSchemaVersion: readSchemaVersion(db)
    };
  });
  if (!read.ok) {
    return {
      available: false,
      reason: read.reason,
      files: [],
      nodes: [],
      edges: [],
      indexerSchemaVersion: null
    };
  }
  return { available: true, ...read.value };
}
function rowsFor(db, select, filterColumn, paths) {
  if (paths === null) return db.prepare(select).all();
  const rows = [];
  for (const chunk of chunked(paths, IN_CHUNK)) {
    rows.push(
      ...db.prepare(`${select} WHERE ${filterColumn} IN (${placeholders(chunk.length)})`).all(...chunk)
    );
  }
  return rows;
}
function readFiles(db, paths) {
  const rows = rowsFor(db, "SELECT path, content_hash, language FROM files", "path", paths);
  return rows.map((row) => ({ path: row.path, contentHash: row.content_hash, language: row.language })).sort((a, b) => compare(a.path, b.path));
}
function readNodes(db, paths) {
  const rows = rowsFor(
    db,
    "SELECT id, kind, name, qualified_name, file_path, start_line, end_line, is_exported FROM nodes",
    "file_path",
    paths
  );
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    name: row.name,
    qualifiedName: row.qualified_name,
    filePath: row.file_path,
    startLine: row.start_line,
    endLine: row.end_line,
    isExported: row.is_exported === 1
  })).sort((a, b) => compare(a.filePath, b.filePath) || a.startLine - b.startLine || compare(a.id, b.id));
}
function readEdges(db, paths) {
  const rows = rowsFor(
    db,
    `SELECT e.source AS source, e.target AS target, e.kind AS kind, e.line AS line, s.file_path AS file_path
       FROM edges e
       JOIN nodes s ON s.id = e.source
       JOIN nodes t ON t.id = e.target`,
    "s.file_path",
    paths
  );
  return rows.map((row) => ({
    source: row.source,
    target: row.target,
    kind: row.kind,
    line: typeof row.line === "number" ? row.line : null,
    filePath: row.file_path
  })).sort(
    (a, b) => compare(a.filePath, b.filePath) || compare(a.source, b.source) || compare(a.target, b.target) || compare(a.kind, b.kind) || (a.line ?? -1) - (b.line ?? -1)
  );
}
function readSchemaVersion(db) {
  if (!columnsOf(db, "schema_versions").includes("version")) return null;
  const row = db.prepare("SELECT max(version) AS v FROM schema_versions").get();
  return typeof row.v === "number" ? row.v : null;
}
function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
export {
  CODE_GRAPH_DIR,
  DEPENDENCY_EDGE_KINDS,
  affectedTests,
  dependentsOf,
  exportStructure,
  graphDbPath,
  isTestPath,
  readGraphStatus
};
//# sourceMappingURL=index.mjs.map