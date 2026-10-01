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

/** The directory the indexer keeps its index in, inside a working directory. */
declare const CODE_GRAPH_DIR = ".codegraph";
/** Where the index for a working directory lives, whether or not it exists. */
declare function graphDbPath(dir: string): string;

interface GraphStatus {
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
declare function readGraphStatus(dir: string): GraphStatus;

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
declare const DEPENDENCY_EDGE_KINDS: readonly ["calls", "imports", "references", "instantiates", "extends", "implements"];
interface DependentsResult {
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
declare function dependentsOf(dir: string, files: string[], opts?: {
    depth?: number;
    limit?: number;
}): DependentsResult;
interface AffectedTestsResult {
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
declare function affectedTests(dir: string, files: string[], opts?: {
    limit?: number;
}): AffectedTestsResult;
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
declare function isTestPath(path: string): boolean;

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
interface StructureFile {
    path: string;
    /** The indexer's hash of the file's content. What makes a sync incremental; not reversible to content. */
    contentHash: string;
    language: string;
}
interface StructureNode {
    id: string;
    kind: string;
    name: string;
    qualifiedName: string;
    filePath: string;
    startLine: number;
    endLine: number;
    isExported: boolean;
}
interface StructureEdge {
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
interface StructureExport {
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
declare function exportStructure(dir: string, opts?: {
    onlyPaths?: string[];
}): StructureExport;

/**
 * Pure readers over a code graph index (TRD 27).
 *
 * The index is built and owned by an external indexer; see `db.ts` for what
 * that implies. Everything here is synchronous, deterministic, read-only and
 * model-free, and every function answers "there is no index" as a value rather
 * than an exception, because the product must behave exactly as it does today
 * when there is none.
 *
 * A separate build entry (`@devpilot.sh/core/code-graph`) as well as a
 * namespace on the barrel: the session runner needs these and nothing else of
 * core's, and the barrel drags the whole wave planner and the Anthropic SDK in
 * behind it. Safe under `splitting: false` — there is no module state here to
 * be duplicated across entries.
 */

type index_AffectedTestsResult = AffectedTestsResult;
declare const index_CODE_GRAPH_DIR: typeof CODE_GRAPH_DIR;
declare const index_DEPENDENCY_EDGE_KINDS: typeof DEPENDENCY_EDGE_KINDS;
type index_DependentsResult = DependentsResult;
type index_GraphStatus = GraphStatus;
type index_StructureEdge = StructureEdge;
type index_StructureExport = StructureExport;
type index_StructureFile = StructureFile;
type index_StructureNode = StructureNode;
declare const index_affectedTests: typeof affectedTests;
declare const index_dependentsOf: typeof dependentsOf;
declare const index_exportStructure: typeof exportStructure;
declare const index_graphDbPath: typeof graphDbPath;
declare const index_isTestPath: typeof isTestPath;
declare const index_readGraphStatus: typeof readGraphStatus;
declare namespace index {
  export { type index_AffectedTestsResult as AffectedTestsResult, index_CODE_GRAPH_DIR as CODE_GRAPH_DIR, index_DEPENDENCY_EDGE_KINDS as DEPENDENCY_EDGE_KINDS, type index_DependentsResult as DependentsResult, type index_GraphStatus as GraphStatus, type index_StructureEdge as StructureEdge, type index_StructureExport as StructureExport, type index_StructureFile as StructureFile, type index_StructureNode as StructureNode, index_affectedTests as affectedTests, index_dependentsOf as dependentsOf, index_exportStructure as exportStructure, index_graphDbPath as graphDbPath, index_isTestPath as isTestPath, index_readGraphStatus as readGraphStatus };
}

export { type AffectedTestsResult as A, CODE_GRAPH_DIR as C, DEPENDENCY_EDGE_KINDS as D, type GraphStatus as G, type StructureEdge as S, type DependentsResult as a, type StructureExport as b, type StructureFile as c, type StructureNode as d, affectedTests as e, dependentsOf as f, exportStructure as g, graphDbPath as h, index as i, isTestPath as j, readGraphStatus as r };
