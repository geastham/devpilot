/**
 * Model IDs for the planning agents.
 *
 * These live in one place because they had been hardcoded at six call sites
 * (`conductor.ts`, `conductor-graph.ts`, `generator.ts`, the reoptimize route,
 * the wiki command, and a doc comment). When `claude-sonnet-4-20250514` was
 * retired, every planning run failed with
 *
 *     404 not_found_error: model: claude-sonnet-4-20250514
 *
 * and the fix had to be applied six times. A retired model ID is a *when*, not
 * an *if* — so the ID belongs in one constant that every caller reads.
 *
 * Resolution order at every call site: an explicit `options.model`, then the
 * environment variable, then the constant. The env override is what lets a
 * conductor drop the planner to a cheaper tier for a cost-sensitive run
 * without a rebuild.
 */

/**
 * The wave planner's default.
 *
 * Opus rather than a cheaper tier is a deliberate product call, not a reflex:
 * DESIGN.md §1 argues the bottleneck is *planning throughput and quality*, not
 * agent capacity. A plan is one call of at most `maxTokens` output that then
 * governs an entire fleet of dispatched sessions — the cheapest place in the
 * system to spend model quality, and the most expensive place to skimp. A bad
 * decomposition wastes far more in dispatched-agent tokens than the planning
 * call itself ever costs.
 */
export const DEFAULT_PLANNER_MODEL = 'claude-opus-5';

/**
 * Wiki/asset generation. Summarisation over already-retrieved content is not
 * the same problem as decomposition, so it does not need the same tier.
 */
export const DEFAULT_WIKI_MODEL = 'claude-sonnet-5';

/**
 * Resolve the planner model: explicit argument → env override → default.
 */
export function resolvePlannerModel(explicit?: string): string {
  return explicit || process.env.WAVE_PLANNER_MODEL || DEFAULT_PLANNER_MODEL;
}

/**
 * Resolve the wiki model: explicit argument → env override → default.
 */
export function resolveWikiModel(explicit?: string): string {
  return explicit || process.env.WIKI_MODEL || DEFAULT_WIKI_MODEL;
}
