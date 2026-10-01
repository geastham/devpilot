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

export { CODE_GRAPH_DIR, graphDbPath } from './db';
export { readGraphStatus, type GraphStatus } from './status';
export {
  DEPENDENCY_EDGE_KINDS,
  dependentsOf,
  affectedTests,
  isTestPath,
  type DependentsResult,
  type AffectedTestsResult,
} from './dependents';
export {
  exportStructure,
  type StructureFile,
  type StructureNode,
  type StructureEdge,
  type StructureExport,
} from './structure';
