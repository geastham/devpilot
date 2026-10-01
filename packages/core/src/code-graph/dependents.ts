/**
 * Two deterministic reads of the index: what depends on a file, and which
 * tests are reached from it.
 *
 * These are the uses of a code graph that do not rest on the claim nobody has
 * measured — that an agent with a graph spends fewer tokens for the same result
 * (TRD 27 §5, §6). They are plain queries over edges, with no model in them,
 * and each feeds something that already exists: the wave assigner's conflict
 * pass, and the prompt a worker is given.
 *
 * WHAT THE ANSWERS ARE WORTH. The index is built by tree-sitter with name
 * resolution, not by a compiler, and some of its edges are wrong. Measured on
 * this repository's own index (codegraph 1.6.1, October 2026): the file with
 * the most dependents, 55, was `packages/cli/.../conductor-handler.ts` — and 53
 * of those were test files whose `describe` (vitest's) had been resolved, by
 * name, to a local function called `describe` in that file. So a dependents
 * list is evidence, not proof, and can contain files that do not depend on the
 * file at all. What it MISSES was not measured here; an index built from
 * syntax cannot, at least, see a dependency that only exists at run time.
 * Callers are written accordingly — the planner caps how much one task's list
 * may influence, and a worker is told its list of tests is information.
 */

import { IN_CHUNK, chunked, placeholders, withGraph, type GraphConnection } from './db';

/**
 * The edge kinds that mean "the source uses the target".
 *
 * `contains` is the one that does not: it is structure — a file contains a
 * function, a class contains a method — and says nothing about use.
 * `navigates` (a component linking to a route) is left out as well: a link is
 * not something that breaks when the target's code changes.
 *
 * An allowlist, so an edge kind a later indexer version invents is not
 * silently treated as a dependency.
 */
export const DEPENDENCY_EDGE_KINDS = [
  'calls',
  'imports',
  'references',
  'instantiates',
  'extends',
  'implements',
] as const;

const REQUIRED = { nodes: ['id', 'file_path'], edges: ['source', 'target', 'kind'] } as const;

const DEFAULT_DEPTH = 1;
const MAX_DEPTH = 3;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 2000;

export interface DependentsResult {
  /** False when there is no readable index; `byFile` is then empty and `reason` says why. */
  available: boolean;
  reason?: string;
  /**
   * For each file asked about, under the string the caller passed: the files
   * that depend on it, sorted, never including the file itself. A file the
   * index does not know — one a task is about to create — has an empty list.
   */
  byFile: Record<string, string[]>;
  /** True when at least one list was cut at `limit`. The lists are then a sorted prefix, not the whole set. */
  truncated: boolean;
}

/**
 * Files that depend on each given file.
 *
 * A file B depends on a file A when some node defined in B has a dependency
 * edge (see `DEPENDENCY_EDGE_KINDS`) into a node defined in A. With `depth` 2
 * or 3 it is transitive: the files that depend on those, and on those. Depth is
 * capped at 3 because by then, in a repository of any size, the answer for a
 * shared file is "most of it", which tells a planner nothing.
 *
 * `limit` is per file (default 200). A list longer than that is sorted first
 * and then cut, so what is returned is a stable prefix and `truncated` is true.
 *
 * Never throws; see `openGraph`.
 */
export function dependentsOf(
  dir: string,
  files: string[],
  opts: { depth?: number; limit?: number } = {}
): DependentsResult {
  const depth = clampInt(opts.depth, DEFAULT_DEPTH, 1, MAX_DEPTH);
  const limit = clampInt(opts.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);

  const read = withGraph(dir, REQUIRED, (db) => {
    const direct = directDependentsReader(db);
    const byFile: Record<string, string[]> = {};
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

export interface AffectedTestsResult {
  available: boolean;
  reason?: string;
  /** Distinct. Nearest first — see `affectedTests` — then by path. */
  tests: string[];
  truncated: boolean;
}

/**
 * Test files reached from the given files: everything that depends on them, up
 * to three steps away, that looks like a test (`isTestPath`).
 *
 * Three steps rather than one because a test rarely imports the file that
 * changed; it imports the module that uses it. A test file that is itself in
 * `files` is listed only if another of them reaches it — on its own it is the
 * thing being changed, not something reached from it.
 *
 * NEAREST FIRST: the tests one step from any of the files, then two, then
 * three, and by path within a distance. The order matters because the list is
 * cut — here at `limit`, and again by a caller that shows a worker ten — and
 * the far end of the walk is where the index's wrong edges collect. Measured
 * on this repository's index: `dispatch-coordinator.ts` reaches 5 test files
 * within two steps — the four suites that exercise it and their shared
 * harness — and 49 more at the third, every one of them a file that "depends
 * on" `conductor-handler.ts`, the name collision described at the top of this
 * file. In path order the first ten are all from the 49.
 *
 * "Reached" is all this says. It does not say the test passes, that it covers
 * the change, or that it can be run where the caller is.
 */
export function affectedTests(
  dir: string,
  files: string[],
  opts: { limit?: number } = {}
): AffectedTestsResult {
  const limit = clampInt(opts.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);

  const read = withGraph(dir, REQUIRED, (db) => {
    const direct = directDependentsReader(db);
    /** Each test, and the fewest steps from any of the files to it. */
    const nearest = new Map<string, number>();

    for (const file of files) {
      for (const [dependent, steps] of reach(direct, normalizePath(file), MAX_DEPTH)) {
        if (!isTestPath(dependent)) continue;
        const known = nearest.get(dependent);
        if (known === undefined || steps < known) nearest.set(dependent, steps);
      }
    }

    const ordered = [...nearest.entries()]
      .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([test]) => test);
    return { tests: ordered.slice(0, limit), truncated: ordered.length > limit };
  });

  if (!read.ok) return { available: false, reason: read.reason, tests: [], truncated: false };
  return { available: true, ...read.value };
}

/**
 * Whether a path is a test file, by the conventions that are common enough to
 * rely on: `*.test.*`, `*.spec.*`, anything under a `tests/` or `__tests__/`
 * directory, Go's `*_test.go`, and pytest's `test_*.py`.
 *
 * By path alone, so it is wrong in both directions at the edges: a helper
 * under `tests/` is called a test, and a suite kept in a directory named
 * anything else is not. That is acceptable for a list a worker is shown as
 * information, and would not be for anything that decides what to run.
 */
export function isTestPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  const base = normalized.slice(normalized.lastIndexOf('/') + 1);

  if (base.includes('.test.') || base.includes('.spec.')) return true;
  if (base.endsWith('_test.go')) return true;
  if (/^test_.*\.py$/.test(base)) return true;

  const directories = `/${normalized.slice(0, normalized.length - base.length)}`;
  return directories.includes('/tests/') || directories.includes('/__tests__/');
}

// ---------------------------------------------------------------------------

/** One step: the files that directly depend on any of the given files. */
type DirectDependents = (files: string[]) => Map<string, Set<string>>;

/**
 * Build the one-step query. One statement per chunk size, prepared lazily and
 * kept for the life of the connection: a three-step walk from a shared file
 * runs it many times.
 *
 * The join starts from the target's file (`idx_nodes_file_path`), finds edges
 * into its nodes (`idx_edges_target_kind`) and resolves each source to its
 * file by primary key. An edge whose source and target are in the same file is
 * a file using itself and is dropped in the query.
 */
function directDependentsReader(db: GraphConnection): DirectDependents {
  type Row = { target: string; source: string };
  const queries = new Map<number, (files: string[]) => Row[]>();
  const kinds = DEPENDENCY_EDGE_KINDS.map((k) => `'${k}'`).join(', ');

  const queryFor = (count: number) => {
    let query = queries.get(count);
    if (!query) {
      const statement = db.prepare<string[], Row>(
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
    const out = new Map<string, Set<string>>();
    for (const chunk of chunked(files, IN_CHUNK)) {
      const rows = queryFor(chunk.length)(chunk);
      for (const row of rows) {
        let sources = out.get(row.target);
        if (!sources) out.set(row.target, (sources = new Set()));
        sources.add(row.source);
      }
    }
    return out;
  };
}

/**
 * Everything that depends on `file` within `depth` steps, each with the number
 * of steps it is away, without `file` itself — which a cycle (A uses B, B uses
 * A) would otherwise bring back at the second step.
 *
 * Breadth-first over files, one query per level, each file expanded once — so
 * the step recorded for a file is the fewest that reach it. It always
 * terminates: a level only holds files not seen before, and there are finitely
 * many.
 */
function reach(direct: DirectDependents, file: string, depth: number): Map<string, number> {
  const steps = new Map<string, number>([[file, 0]]);
  let frontier = [file];

  for (let step = 1; step <= depth && frontier.length > 0; step++) {
    const next: string[] = [];
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

/**
 * The index stores repo-relative paths with forward slashes and no leading
 * `./`. A plan's file list is written by a model and is usually, not always,
 * in that form.
 */
function normalizePath(path: string): string {
  return path.trim().replace(/\\/g, '/').replace(/^(\.\/)+/, '');
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}
