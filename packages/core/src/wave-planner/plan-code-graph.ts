/**
 * What a plan learns from a code graph, and what it does not.
 *
 * A plan is a list of tasks, each naming the files it will change. Given the
 * files that DEPEND ON those files, two things become possible that were not
 * (TRD 27 §5.1, §5.3): the wave assigner can keep apart two tasks where one
 * changes a file the other's file uses, and a reviewer can be shown each
 * task's blast radius before approving it.
 *
 * Where the dependents come from: the session runner, asked through the
 * orchestrator service. The cockpit knows a repository by name; only the
 * runner knows where it is checked out, and so only the runner can read the
 * index that lives in that checkout.
 *
 * THE GRAPH IS AN AID. Every way of not having it — no orchestrator, a mode
 * with no runner, a runner that predates it or did not answer in time, a
 * repository with no index — produces the same plan as before the graph
 * existed, and `PlanCodeGraph.reason` saying which of those it was. That
 * sentence is the whole difference between a plan made without the graph and
 * one that silently was: the first can be corrected.
 *
 * Nothing in this file reads a database or an index. `readPlanCodeGraph` makes
 * one request; everything else is pure.
 */

import { getOrchestratorServiceOrNull } from '../orchestrator/service';
import type { GraphDependentsOutcome, GraphDependentsRequest } from '../orchestrator/types';
import type { ParsedTask, WaveAdjustment } from './types';
import {
  MAX_DEPENDENT_CLAIMS_PER_TASK,
  selectDependentClaims,
  type DependentClaim,
} from './wave-assigner';

/**
 * How many dependent files are listed per task. The count is always the whole
 * count; this bounds what is stored on the plan and carried in a run's
 * checkpoint, and what a reviewer is asked to read.
 */
export const BLAST_RADIUS_LISTED = 25;

/** What depends on the files one task changes. */
export interface TaskBlastRadius {
  taskCode: string;
  /**
   * How many distinct files depend on something this task changes, not
   * counting the task's own files. A lower bound when the plan's
   * `truncated` is true.
   */
  dependentCount: number;
  /** Up to `BLAST_RADIUS_LISTED` of them, in path order. */
  dependents: string[];
  /**
   * The claims the wave assigner sequences on: at most
   * `MAX_DEPENDENT_CLAIMS_PER_TASK`, chosen by `selectDependentClaims`. Stored
   * so that the assignment made when the plan is persisted is the one the
   * reviewer was shown, whatever the index says by then.
   */
  claims: DependentClaim[];
  /**
   * The task's own files whose dependents were too many to sequence on. The
   * task changes something widely used and nothing was moved because of it —
   * which a reviewer may well want to know.
   */
  leftOut: { file: string; dependents: number }[];
}

/** Whether a plan was made with a code graph, and what the graph said. */
export interface PlanCodeGraph {
  /** True when dependents were read and passed to the wave assigner. */
  used: boolean;
  /** Present exactly when `used` is false: why not, in words for a person. */
  reason?: string;
  /** When the index was last written (ISO-8601). Its age, not a promise that it matches the code. */
  indexedAt?: string | null;
  /** True when the runner cut at least one list short; counts are then lower bounds. */
  truncated?: boolean;
  /** One entry per task, in plan order. Present exactly when `used` is true. */
  tasks?: TaskBlastRadius[];
}

/** The one method this module needs of the orchestrator service. */
export interface GraphDependentsSource {
  graphDependents(request: GraphDependentsRequest): Promise<GraphDependentsOutcome>;
}

/**
 * Ask for the dependents of every file the plan's tasks name — in ONE request,
 * for the whole plan — and work out each task's blast radius.
 *
 * Depth 1: the files that directly use a file the task changes. Further out,
 * the answer for anything shared approaches "the repository", and a claim that
 * wide separates nothing.
 *
 * Never rejects. `source` defaults to the process's orchestrator service;
 * tests pass their own.
 */
export async function readPlanCodeGraph(
  repo: string,
  tasks: readonly ParsedTask[],
  source: GraphDependentsSource | null = getOrchestratorServiceOrNull()
): Promise<PlanCodeGraph> {
  const files = [...new Set(tasks.flatMap((task) => task.filePaths))];
  if (files.length === 0) {
    return { used: false, reason: 'no task in the plan names a file, so there was nothing to look up' };
  }

  if (!source) {
    return {
      used: false,
      reason: 'no orchestrator is running in this process, so there is no session runner to read a code graph from',
    };
  }

  let outcome: GraphDependentsOutcome;
  try {
    outcome = await source.graphDependents({ repo, files, depth: 1 });
  } catch (error) {
    // The service does not reject. A stand-in for it might.
    return {
      used: false,
      reason: `the code graph could not be read (${error instanceof Error ? error.message : String(error)})`,
    };
  }

  if (!outcome.available) {
    return { used: false, reason: outcome.reason };
  }

  return {
    used: true,
    indexedAt: outcome.indexedAt,
    truncated: outcome.truncated,
    tasks: tasks.map((task) => blastRadiusOf(task, outcome.byFile)),
  };
}

/**
 * One task's blast radius from a file → dependents map.
 *
 * A dependent that is one of the task's own files is not counted: a task that
 * changes both `policy.ts` and the `fetch.ts` that imports it has that
 * dependency in hand.
 */
export function blastRadiusOf(
  task: Pick<ParsedTask, 'taskCode' | 'filePaths'>,
  dependentsByFile: Readonly<Record<string, readonly string[]>>,
  maxClaims: number = MAX_DEPENDENT_CLAIMS_PER_TASK
): TaskBlastRadius {
  const own = new Set(task.filePaths);
  const all = new Set<string>();
  const claims: DependentClaim[] = [];

  for (const dependsOn of own) {
    for (const file of dependentsByFile[dependsOn] ?? []) {
      if (own.has(file)) continue;
      all.add(file);
      claims.push({ file, dependsOn });
    }
  }

  const selected = selectDependentClaims(task.filePaths, claims, maxClaims);

  return {
    taskCode: task.taskCode,
    dependentCount: all.size,
    dependents: [...all].sort().slice(0, BLAST_RADIUS_LISTED),
    claims: selected.claims,
    leftOut: selected.leftOut,
  };
}

/**
 * The `dependentClaims` option for `assignWaves`, or undefined when the graph
 * was not used or claimed nothing — in which case the option must be left off
 * altogether, so the assignment is exactly the one made without a graph.
 */
export function dependentClaimsOf(
  codeGraph: PlanCodeGraph | null | undefined
): Record<string, DependentClaim[]> | undefined {
  if (!codeGraph?.used || !codeGraph.tasks) return undefined;

  const out: Record<string, DependentClaim[]> = {};
  let any = false;
  for (const task of codeGraph.tasks) {
    if (task.claims.length === 0) continue;
    // Concatenated, not replaced: two rows sharing a task code is an invalid
    // plan the assigner still has to place, and it filters each row's claims
    // to that row's own files.
    out[task.taskCode] = [...(out[task.taskCode] ?? []), ...task.claims];
    any = true;
  }
  return any ? out : undefined;
}

// ---------------------------------------------------------------------------
// Carrying it with a plan
// ---------------------------------------------------------------------------

/**
 * Attach what the graph said to a plan object, and read it back.
 *
 * The conductor's graph holds a plan between the node that generates it and
 * the node that persists it, with a human review — hours, possibly — and a
 * checkpoint in between. Its plan type is structural, so a host's extra fields
 * pass through it untouched, and this is one: the review shows it, and the
 * persist step assigns waves from the same claims the reviewer saw.
 *
 * `codeGraphOf` checks the shape rather than trusting it, because what it
 * reads has been through JSON and may have been written by another version.
 */
export function withCodeGraph<T extends object>(plan: T, codeGraph: PlanCodeGraph): T & { codeGraph: PlanCodeGraph } {
  return { ...plan, codeGraph };
}

export function codeGraphOf(plan: unknown): PlanCodeGraph | null {
  const value = (plan as { codeGraph?: unknown } | null | undefined)?.codeGraph;
  return isPlanCodeGraph(value) ? value : null;
}

export function isPlanCodeGraph(value: unknown): value is PlanCodeGraph {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PlanCodeGraph>;
  if (typeof candidate.used !== 'boolean') return false;
  if (!candidate.used) return typeof candidate.reason === 'string';
  return (
    Array.isArray(candidate.tasks) &&
    candidate.tasks.every(
      (task) =>
        task !== null &&
        typeof task === 'object' &&
        typeof task.taskCode === 'string' &&
        typeof task.dependentCount === 'number' &&
        Array.isArray(task.dependents) &&
        Array.isArray(task.claims) &&
        task.claims.every((c) => c && typeof c.file === 'string' && typeof c.dependsOn === 'string') &&
        Array.isArray(task.leftOut)
    )
  );
}

// ---------------------------------------------------------------------------
// Saying it to a reviewer
// ---------------------------------------------------------------------------

/** One task's blast radius, as a reviewer reads it. */
export interface BlastRadiusLine {
  taskCode: string;
  dependentCount: number;
  /** The listed dependents; `more` is how many are not listed. */
  dependents: string[];
  more: number;
  /** "7 files depend on what this changes", or "at least 7 files…" when lists were cut short. */
  summary: string;
  /**
   * Set when the task changes a file too widely used to sequence on:
   * "src/types.ts has 46 dependents — too many to keep other tasks apart on".
   */
  notSequencedOn: string[];
}

/** One task the code graph moved, in plain words. */
export interface SequencedLine {
  taskCode: string;
  /** How many waves later than its dependencies alone would have put it. */
  wavesLater: number;
  /** A sentence: who moved, how far, and the two files that are the reason. */
  because: string;
}

/** What `GET /api/items/:id/conductor` reports about the code graph. */
export interface CodeGraphReview {
  used: boolean;
  /** Why not, when `used` is false. Null when it was. */
  reason: string | null;
  indexedAt: string | null;
  truncated: boolean;
  tasks: BlastRadiusLine[];
  sequenced: SequencedLine[];
}

/**
 * Turn the stored graph reading and the assigner's adjustments into what a
 * reviewer is shown.
 *
 * `adjustments` may be null — a plan from before they were recorded — and the
 * list of moved tasks is then empty, which the caller should not read as "the
 * graph moved nothing". It is why `sequenced` is only meaningful alongside
 * `used: true` on a plan that has its adjustments.
 */
export function describeCodeGraph(
  codeGraph: PlanCodeGraph,
  adjustments: readonly WaveAdjustment[] | null
): CodeGraphReview {
  if (!codeGraph.used) {
    return {
      used: false,
      reason: codeGraph.reason ?? 'no reason was recorded',
      indexedAt: null,
      truncated: false,
      tasks: [],
      sequenced: [],
    };
  }

  const truncated = codeGraph.truncated === true;

  return {
    used: true,
    reason: null,
    indexedAt: codeGraph.indexedAt ?? null,
    truncated,
    tasks: (codeGraph.tasks ?? []).map((task) => ({
      taskCode: task.taskCode,
      dependentCount: task.dependentCount,
      dependents: task.dependents,
      more: Math.max(0, task.dependentCount - task.dependents.length),
      summary: blastRadiusSummary(task.dependentCount, truncated),
      notSequencedOn: task.leftOut.map(
        (left) =>
          `${left.file} has ${left.dependents} dependent${left.dependents === 1 ? '' : 's'} — ` +
          `too many to keep other tasks apart on`
      ),
    })),
    sequenced: (adjustments ?? [])
      .filter((adjustment) => adjustment.type === 'DEPENDENCY_CONFLICT_BUMP')
      .map((adjustment) => {
        const wavesLater = adjustment.toWave - adjustment.fromWave;
        return {
          taskCode: adjustment.taskCode,
          wavesLater,
          because:
            `Task ${adjustment.taskCode} runs ${wavesLater} wave${wavesLater === 1 ? '' : 's'} later than its ` +
            `dependencies alone would put it: ${sentenceBody(adjustment.reason)}.`,
        };
      }),
  };
}

function blastRadiusSummary(count: number, lowerBound: boolean): string {
  if (count === 0) {
    return lowerBound
      ? 'No file was found that depends on what this changes (some lists were cut short)'
      : 'No indexed file depends on what this changes';
  }
  return `${lowerBound ? 'At least ' : ''}${count} file${count === 1 ? '' : 's'} depend${count === 1 ? 's' : ''} on what this changes`;
}

/** The assigner's reason without its label: "src/a.ts depends on src/b.ts, which task 1.1 changes". */
function sentenceBody(reason: string): string {
  return reason.replace(/^Dependency conflict:\s*/, '');
}
