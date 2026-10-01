import type {
  ParsedTask,
  ParsedEdge,
  WaveAssignmentResult,
  AssignedWave,
  WaveAdjustment,
  DAGNode,
} from './types';
import { buildDAGGraph, topologicalSort, generateWaveLabel } from './utils';

/**
 * One extra claim a task makes on a wave: a file that depends on something the
 * task changes.
 *
 * `file` is NOT one of the task's own files — the task does not edit it. It is
 * a file that imports, calls or otherwise uses `dependsOn`, which is one of the
 * task's own. Where they come from is not this module's business; in practice
 * a code graph index (`plan-code-graph.ts`).
 */
export interface DependentClaim {
  /** A file that depends on one of the task's own files. */
  file: string;
  /** The task's own file it depends on. */
  dependsOn: string;
}

/**
 * How many dependent claims one task may make: 25.
 *
 * WHY A CAP AT ALL. A claim is a prediction, from an index that is sometimes
 * wrong, and the wider a file's list of dependents the less any one entry in
 * it means. Measured on this repository's own index (codegraph 1.6.1, October
 * 2026 — one repository, not a study): the file with the most dependents, 55,
 * had 53 of them through a name collision (53 test files' `describe`, resolved
 * to a local function of that name). Without a cap, a task editing that file
 * would be sequenced against every task that touches one of those tests. And
 * a file that really is imported by half the repository would do the same
 * honestly: every task that edits one of its importers — in a plan of any
 * size, most of them — moved out of its wave, on the strength of a
 * relationship that holds between that file and nearly everything. The plan
 * is then sequenced by which file is popular, not by what collides.
 *
 * WHY 25. In the same index, 239 files have at least one dependent and 231 of
 * them (97%) have 25 or fewer. The eight above it are database schema files,
 * shared type and utility modules, and two files whose count is a name
 * collision (the one above, and a type called `Command`). So 25 keeps every
 * ordinary file's dependents whole and leaves out the files whose answer is "a
 * large part of the repository". It is a constant chosen from one measurement,
 * and `maxDependentClaimsPerTask` exists so it can be moved when there is a
 * second.
 *
 * HOW IT IS APPLIED is `selectDependentClaims`: a file's dependents are claimed
 * all together or not at all, narrowest file first.
 */
export const MAX_DEPENDENT_CLAIMS_PER_TASK = 25;

/**
 * Configuration for wave assignment.
 */
export interface WaveAssignerConfig {
  maxTasksPerWave?: number;
  /**
   * Optional. Per task code, the files that depend on what the task changes.
   *
   * With these, the conflict pass also keeps apart two tasks where one changes
   * a file that the other's file depends on — see `resolveFileConflicts` for
   * the rule and its direction. Absent, or empty, the assignment is exactly
   * what it was before this option existed: the plan is produced from the
   * tasks' own files alone, which is the behaviour whenever there is no code
   * graph to ask.
   */
  dependentClaims?: Record<string, DependentClaim[]>;
  /** Overrides `MAX_DEPENDENT_CLAIMS_PER_TASK`. */
  maxDependentClaimsPerTask?: number;
}

/** What `selectDependentClaims` kept, and which of the task's files it left out. */
export interface SelectedDependentClaims {
  /** The claims the conflict pass will use. At most the cap. */
  claims: DependentClaim[];
  /**
   * The task's own files whose dependents were not claimed because they did
   * not fit, with how many each had. A reviewer should see these: the task
   * changes something widely used, and nothing was sequenced on account of it.
   */
  leftOut: { file: string; dependents: number }[];
}

/**
 * Apply the cap to one task's dependent claims.
 *
 * The task's own files are taken narrowest first — fewest dependents first —
 * and each file's dependents are claimed whole or not at all. The first file
 * that does not fit under the cap is left out, and so is every wider one.
 *
 * Whole or not at all, because the alternative is a prefix: the first 25 of a
 * hub's 200 dependents in path order. Whether two tasks were then kept apart
 * would depend on where a filename falls in the alphabet, which is not a
 * reason. A file narrow enough to fit is a specific coupling and is believed
 * in full; a file too wide to fit is shared ground and sequences nothing.
 *
 * Narrowest first, so that a task which edits one widely-used file and one
 * narrowly-used file still claims the narrow one's dependents — the coupling
 * most likely to be real — instead of losing both to the hub.
 *
 * Two kinds of claim are dropped before counting: one whose `file` is among
 * the task's own files (a task does not conflict with itself), and one whose
 * `dependsOn` is not (it is not a claim on this task's behalf).
 *
 * Deterministic, and idempotent: selecting from an already-selected list
 * returns it unchanged, so a caller may store the selection and pass it back.
 */
export function selectDependentClaims(
  ownFiles: readonly string[],
  claims: readonly DependentClaim[],
  max: number = MAX_DEPENDENT_CLAIMS_PER_TASK
): SelectedDependentClaims {
  const own = new Set(ownFiles);
  const byOwnFile = new Map<string, Set<string>>();

  for (const claim of claims) {
    if (!own.has(claim.dependsOn) || own.has(claim.file)) continue;
    let dependents = byOwnFile.get(claim.dependsOn);
    if (!dependents) byOwnFile.set(claim.dependsOn, (dependents = new Set()));
    dependents.add(claim.file);
  }

  const groups = [...byOwnFile.entries()]
    .map(([file, dependents]) => ({ file, dependents: [...dependents].sort() }))
    .sort((a, b) => a.dependents.length - b.dependents.length || compareStrings(a.file, b.file));

  const selected: DependentClaim[] = [];
  const leftOut: { file: string; dependents: number }[] = [];
  let full = false;

  for (const group of groups) {
    // Groups are in ascending size, so once one does not fit none after it
    // can. `full` makes that explicit rather than relying on the arithmetic.
    if (full || selected.length + group.dependents.length > max) {
      full = true;
      leftOut.push({ file: group.file, dependents: group.dependents.length });
      continue;
    }
    for (const file of group.dependents) selected.push({ file, dependsOn: group.file });
  }

  return { claims: selected, leftOut };
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Assigns tasks to waves based on dependency depths, resolving file conflicts
 * and applying capacity constraints.
 *
 * Algorithm:
 * 1. Compute wave depths via topological sort
 * 2. Group tasks by depth, which fixes the order they are placed in
 * 3. Place each task in the earliest wave that is after all of its
 *    dependencies and has no file conflict — so a conflict delays the task and,
 *    through it, everything that depends on it. With `dependentClaims`, a
 *    conflict is also one task changing a file another task's file depends on
 * 4. Apply fleet capacity constraints
 *
 * Every input task appears in exactly one output wave. That is checked before
 * returning, and a mismatch throws rather than returning a shorter plan.
 *
 * @param tasks - Array of parsed tasks
 * @param edges - Array of dependency edges
 * @param config - Optional configuration
 * @returns WaveAssignmentResult with assigned waves and adjustments
 */
export function assignWaves(
  tasks: ParsedTask[],
  edges: ParsedEdge[],
  config?: WaveAssignerConfig
): WaveAssignmentResult {
  // Handle edge cases
  if (tasks.length === 0) {
    return {
      waves: [],
      totalWaves: 0,
      maxParallelism: 0,
      adjustments: [],
    };
  }

  // Build DAG and compute topological order
  const graph = buildDAGGraph(tasks, edges);
  const sortResult = topologicalSort(graph);

  if (!sortResult.valid) {
    throw new Error(
      `Cannot assign waves: cycle detected in dependency graph involving tasks: ${sortResult.cycleParticipants?.join(', ')}`
    );
  }

  // Step 1: Compute wave depths
  const depths = computeWaveDepths(graph, sortResult.order);

  // Step 2: Group tasks by depth into initial waves
  const tasksByDepth = groupTasksByDepth(tasks, depths);

  // Step 3: Place tasks, resolving file conflicts within waves
  const { wavesAfterConflicts, conflictAdjustments } = resolveFileConflicts(
    tasksByDepth,
    graph,
    config?.dependentClaims,
    config?.maxDependentClaimsPerTask
  );

  // Step 4: Apply capacity constraints
  const { finalWaves, capacityAdjustments } = applyCapacityConstraints(
    wavesAfterConflicts,
    config?.maxTasksPerWave
  );

  // Whatever the steps above did, the plan handed back must contain the work
  // that was handed in.
  assertEveryTaskAssigned(tasks, finalWaves);

  // Compute final metrics
  const totalWaves = finalWaves.length;
  const maxParallelism = Math.max(
    ...finalWaves.map(w => w.tasks.length),
    0
  );

  return {
    waves: finalWaves,
    totalWaves,
    maxParallelism,
    adjustments: [...conflictAdjustments, ...capacityAdjustments],
  };
}

/**
 * Compute wave depth for each task using topological order.
 * depth[task] = 1 + max(depth[dependency]) for all dependencies
 * Tasks with no dependencies get depth 0.
 */
function computeWaveDepths(
  graph: Map<string, DAGNode>,
  topologicalOrder: string[]
): Map<string, number> {
  const depths = new Map<string, number>();

  // Initialize all depths to 0
  for (const taskCode of topologicalOrder) {
    depths.set(taskCode, 0);
  }

  // Process in topological order
  for (const taskCode of topologicalOrder) {
    const node = graph.get(taskCode)!;
    let maxDepth = 0;

    // Find maximum depth of all dependencies
    for (const depTaskCode of node.dependencies) {
      const depDepth = depths.get(depTaskCode) || 0;
      maxDepth = Math.max(maxDepth, depDepth + 1);
    }

    depths.set(taskCode, maxDepth);
  }

  return depths;
}

/**
 * Group tasks by their computed depth.
 */
function groupTasksByDepth(
  tasks: ParsedTask[],
  depths: Map<string, number>
): Map<number, ParsedTask[]> {
  const grouped = new Map<number, ParsedTask[]>();

  for (const task of tasks) {
    const depth = depths.get(task.taskCode) || 0;
    const existing = grouped.get(depth) || [];
    existing.push(task);
    grouped.set(depth, existing);
  }

  return grouped;
}

/**
 * Place every task in a wave, resolving file conflicts as it goes.
 *
 * Tasks are placed one at a time, shallowest depth first and in input order
 * within a depth. Each goes into the earliest wave that is later than all of
 * its dependencies' waves and holds no task claiming one of the same files. So
 * of two tasks that want the same file, the one placed second is the one that
 * moves.
 *
 * A conflict is therefore an ordering constraint, not a relabelling. A task is
 * placed only after its dependencies have their final waves, so when a
 * dependency is bumped its dependents — and theirs — land after it without any
 * separate fix-up pass.
 *
 * This used to work depth by depth: a bumped task was written into the slot
 * for depth + 1, and that slot was then overwritten when depth + 1 was itself
 * processed. The task was gone from the plan — still listed as an adjustment,
 * in no wave, never dispatched. When the slot survived, the bumped task was
 * never checked against what it now sat beside, and its dependents stayed at
 * their original depth: the same wave as the work they were waiting on.
 *
 * ## Dependency conflicts (only when `dependentClaims` is given)
 *
 * Two tasks that name different files can still collide: A changes
 * `policy.ts`, B changes `fetch.ts`, and `fetch.ts` imports `policy.ts`. Run
 * together, B is writing against a `policy.ts` that A is in the middle of
 * changing, and neither can see the other's edit. Nothing in a list of file
 * paths shows that; a code graph does.
 *
 * THE RULE. Two tasks may not share a wave when one of them changes a file
 * that the other also changes (as before), or a file that DEPENDS ON a file
 * the other changes. In terms of what each task brings — its own files, and
 * its dependent claims (files that depend on its own files):
 *
 *     own(A) ∩ own(B)      — the same file            (FILE_CONFLICT_BUMP)
 *     own(A) ∩ claims(B)   — A edits what B's file is used by
 *     own(B) ∩ claims(A)   — B edits what A's file is used by
 *                                                     (DEPENDENCY_CONFLICT_BUMP)
 *
 * THE DIRECTION, and what is deliberately not a conflict. Each of the two new
 * cases has an edited file on BOTH ends of a dependency: one task is building
 * on something the other is changing. `claims(A) ∩ claims(B)` is not that. It
 * means some third file uses a file of A's and a file of B's, and neither task
 * edits it. Their changes meet there when the wave is merged, as any two
 * changes might, but neither task was working against the other's moving code.
 * Treating it as a conflict is what would make the rule serialise a plan: every
 * task touching anything a common file imports would exclude every other. Nor
 * is it a conflict when A and B each edit a file that imports a third file
 * neither of them changes; the claims never mention it, because a claim is a
 * file that depends on what the task changes, not a file the task's changes
 * depend on.
 *
 * WHICH ONE MOVES. The one placed second, as for a shared file. That keeps
 * them out of the same wave, which is the hazard. It does not put the
 * depended-on file first: if B is placed before A, B runs first and A, a wave
 * later, changes `policy.ts` with B's `fetch.ts` already in its checkout.
 * Ordering by direction would mean moving a task that has already been placed,
 * and with it everything placed after it; the planner can express that
 * ordering itself, as a dependency between the two tasks, and this pass
 * honours it.
 *
 * A task's claims are capped (`selectDependentClaims`), and a task never
 * conflicts with itself through them.
 */
function resolveFileConflicts(
  tasksByDepth: Map<number, ParsedTask[]>,
  graph: Map<string, DAGNode>,
  dependentClaims?: Record<string, DependentClaim[]>,
  maxDependentClaimsPerTask?: number
): {
  wavesAfterConflicts: Map<number, ParsedTask[]>;
  conflictAdjustments: WaveAdjustment[];
} {
  const adjustments: WaveAdjustment[] = [];
  const result = new Map<number, ParsedTask[]>();
  const claimedFilesByWave = new Map<number, Set<string>>();
  const waveByTaskCode = new Map<string, number>();

  // Everything below that mentions `dependencies` runs only when at least one
  // task was given a claim. With none, no lookup is made, no map is filled and
  // no branch is taken that did not exist before the option did — which is
  // what the "identical without the option" tests hold this to.
  const dependencies =
    dependentClaims && Object.values(dependentClaims).some((claims) => claims.length > 0)
      ? new DependencyClaims(dependentClaims, maxDependentClaimsPerTask)
      : null;

  // Get sorted depth levels
  const depths = Array.from(tasksByDepth.keys()).sort((a, b) => a - b);

  for (const depth of depths) {
    const tasksAtDepth = tasksByDepth.get(depth) || [];

    for (const task of tasksAtDepth) {
      // The earliest wave the dependencies allow. Every dependency sits at a
      // strictly smaller depth, so it has already been placed; with nothing
      // bumped upstream this is the task's own depth.
      let earliestWave = 0;
      for (const depTaskCode of graph.get(task.taskCode)!.dependencies) {
        earliestWave = Math.max(
          earliestWave,
          waveByTaskCode.get(depTaskCode)! + 1
        );
      }

      // Move later until no file this task claims is already claimed
      let wave = earliestWave;
      const conflictingFiles: string[] = [];
      const dependencyConflicts: string[] = [];
      const ownClaims = dependencies ? dependencies.claimsOf(task) : [];

      for (;;) {
        const claimedFiles = claimedFilesByWave.get(wave);
        const conflictsHere = claimedFiles
          ? task.filePaths.filter(file => claimedFiles.has(file))
          : [];

        const dependenciesHere = dependencies
          ? dependencies.conflictsIn(wave, task, ownClaims)
          : [];

        if (conflictsHere.length === 0 && dependenciesHere.length === 0) {
          break;
        }

        for (const file of conflictsHere) {
          if (!conflictingFiles.includes(file)) {
            conflictingFiles.push(file);
          }
        }
        for (const sentence of dependenciesHere) {
          if (!dependencyConflicts.includes(sentence)) {
            dependencyConflicts.push(sentence);
          }
        }
        wave++;
      }

      // Only a task displaced by its own conflict is recorded. A dependent
      // carried later by a bumped dependency conflicts with nothing, and the
      // plan scorer counts these rows as conflicts.
      //
      // One row per moved task, whatever it met on the way. A shared file is
      // the certain collision, so it names the row when both kinds were met,
      // and the dependency is then appended to the reason rather than lost.
      if (wave !== earliestWave) {
        if (conflictingFiles.length > 0) {
          adjustments.push({
            type: 'FILE_CONFLICT_BUMP',
            taskCode: task.taskCode,
            fromWave: earliestWave,
            toWave: wave,
            reason:
              `File conflict detected with files: ${conflictingFiles.join(', ')}` +
              (dependencyConflicts.length > 0
                ? `; dependency conflict: ${dependencyConflicts.join('; ')}`
                : ''),
          });
        } else {
          adjustments.push({
            type: 'DEPENDENCY_CONFLICT_BUMP',
            taskCode: task.taskCode,
            fromWave: earliestWave,
            toWave: wave,
            reason: `Dependency conflict: ${dependencyConflicts.join('; ')}`,
          });
        }
      }

      // Append rather than assign: the wave may already hold tasks
      const tasksInWave = result.get(wave) || [];
      tasksInWave.push(task);
      result.set(wave, tasksInWave);

      // Claim all files for this wave
      const claimedFiles = claimedFilesByWave.get(wave) || new Set<string>();
      for (const file of task.filePaths) {
        claimedFiles.add(file);
      }
      claimedFilesByWave.set(wave, claimedFiles);

      if (dependencies) {
        dependencies.place(wave, task, ownClaims);
      }

      // Keep the latest wave per code. Codes are unique in a valid plan; if
      // one is repeated, dependents must wait for every row carrying it.
      waveByTaskCode.set(
        task.taskCode,
        Math.max(waveByTaskCode.get(task.taskCode) ?? 0, wave)
      );
    }
  }

  return {
    wavesAfterConflicts: result,
    conflictAdjustments: adjustments,
  };
}

/**
 * The bookkeeping for dependency conflicts, kept apart from the placement loop
 * so that loop reads as it did and none of this exists when no claims were
 * given.
 *
 * Per wave it remembers two things about the tasks already placed there:
 * which task owns each file (so a later task's CLAIM on that file can be
 * answered with the owner's code), and which files those tasks claim as
 * dependents (so a later task's OWN file can be checked against them).
 */
class DependencyClaims {
  private readonly ownerByWave = new Map<number, Map<string, string>>();
  private readonly claimByWave = new Map<number, Map<string, { taskCode: string; dependsOn: string }>>();

  constructor(
    private readonly claims: Record<string, DependentClaim[]>,
    private readonly max: number = MAX_DEPENDENT_CLAIMS_PER_TASK
  ) {}

  /**
   * The claims this task brings, capped. Looked up by task code and then
   * filtered to the row's own files, so two rows sharing a code (an invalid
   * plan, which the assigner still has to survive) each get only the claims
   * that are theirs.
   */
  claimsOf(task: ParsedTask): DependentClaim[] {
    const given = this.claims[task.taskCode];
    if (!given || given.length === 0) return [];
    return selectDependentClaims(task.filePaths, given, this.max).claims;
  }

  /**
   * Why `task` may not join `wave`, one sentence per pair of files, or none.
   * Each sentence names the file that depends, the file it depends on, and the
   * task already in the wave — which is what a person reviewing the plan needs
   * to check the claim against the code.
   */
  conflictsIn(wave: number, task: ParsedTask, ownClaims: DependentClaim[]): string[] {
    const sentences: string[] = [];

    // One of this task's files uses a file that a task already in the wave
    // changes: that task claimed this file as a dependent.
    const claimed = this.claimByWave.get(wave);
    if (claimed) {
      for (const file of task.filePaths) {
        const claim = claimed.get(file);
        if (claim && claim.taskCode !== task.taskCode) {
          sentences.push(`${file} depends on ${claim.dependsOn}, which task ${claim.taskCode} changes`);
        }
      }
    }

    // And the other way round: a placed task changes a file that uses one of
    // this task's.
    const owners = this.ownerByWave.get(wave);
    if (owners) {
      for (const claim of ownClaims) {
        const owner = owners.get(claim.file);
        if (owner !== undefined && owner !== task.taskCode) {
          sentences.push(`${claim.file}, which task ${owner} changes, depends on ${claim.dependsOn}`);
        }
      }
    }

    return sentences;
  }

  /** Record a task's files and claims against the wave it was placed in. */
  place(wave: number, task: ParsedTask, ownClaims: DependentClaim[]): void {
    let owners = this.ownerByWave.get(wave);
    if (!owners) this.ownerByWave.set(wave, (owners = new Map()));
    for (const file of task.filePaths) {
      // First owner wins. Two tasks cannot own one file in a wave anyway —
      // that is the shared-file conflict above.
      if (!owners.has(file)) owners.set(file, task.taskCode);
    }

    let claimed = this.claimByWave.get(wave);
    if (!claimed) this.claimByWave.set(wave, (claimed = new Map()));
    for (const claim of ownClaims) {
      if (!claimed.has(claim.file)) {
        claimed.set(claim.file, { taskCode: task.taskCode, dependsOn: claim.dependsOn });
      }
    }
  }
}

/**
 * Apply capacity constraints by splitting waves that exceed maxTasksPerWave.
 */
function applyCapacityConstraints(
  tasksByDepth: Map<number, ParsedTask[]>,
  maxTasksPerWave?: number
): {
  finalWaves: AssignedWave[];
  capacityAdjustments: WaveAdjustment[];
} {
  const adjustments: WaveAdjustment[] = [];
  const waves: AssignedWave[] = [];

  // Get sorted depth levels
  const depths = Array.from(tasksByDepth.keys()).sort((a, b) => a - b);

  for (const depth of depths) {
    const tasksAtDepth = tasksByDepth.get(depth) || [];

    // If no capacity limit or tasks fit within limit, create single wave
    if (!maxTasksPerWave || tasksAtDepth.length <= maxTasksPerWave) {
      waves.push({
        waveIndex: waves.length,
        label: generateWaveLabel(depth, tasksAtDepth),
        tasks: tasksAtDepth,
      });
    } else {
      // Split into multiple sub-waves
      const subWaveCount = Math.ceil(tasksAtDepth.length / maxTasksPerWave);

      for (let subIndex = 0; subIndex < subWaveCount; subIndex++) {
        const startIdx = subIndex * maxTasksPerWave;
        const endIdx = Math.min(
          startIdx + maxTasksPerWave,
          tasksAtDepth.length
        );
        const subWaveTasks = tasksAtDepth.slice(startIdx, endIdx);

        waves.push({
          waveIndex: waves.length,
          label: generateWaveLabel(depth, subWaveTasks, subIndex),
          tasks: subWaveTasks,
        });

        // Record adjustments for tasks moved to sub-waves
        if (subIndex > 0) {
          for (const task of subWaveTasks) {
            adjustments.push({
              type: 'CAPACITY_SPLIT',
              taskCode: task.taskCode,
              fromWave: depth,
              toWave: waves.length - 1,
              reason: `Wave split due to capacity constraint (max ${maxTasksPerWave} tasks per wave)`,
            });
          }
        }
      }
    }
  }

  return {
    finalWaves: waves,
    capacityAdjustments: adjustments,
  };
}

/**
 * Throw unless the output waves hold exactly the tasks that were passed in.
 *
 * A plan that silently loses a task is the worst result this module can
 * produce: the plan still looks complete, is scored, approved and dispatched,
 * and the missing work is simply never done. Failing the whole assignment is
 * cheaper than that, so this is a hard error rather than a warning.
 */
function assertEveryTaskAssigned(
  tasks: ParsedTask[],
  waves: AssignedWave[]
): void {
  // Count by task code rather than comparing totals, so one task lost and
  // another repeated cannot cancel out.
  const outstanding = new Map<string, number>();
  for (const task of tasks) {
    outstanding.set(task.taskCode, (outstanding.get(task.taskCode) || 0) + 1);
  }

  let assignedCount = 0;
  for (const wave of waves) {
    for (const task of wave.tasks) {
      assignedCount++;
      outstanding.set(task.taskCode, (outstanding.get(task.taskCode) || 0) - 1);
    }
  }

  const missing: string[] = [];
  const unexpected: string[] = [];
  for (const [taskCode, count] of outstanding) {
    if (count > 0) missing.push(taskCode);
    if (count < 0) unexpected.push(taskCode);
  }

  if (missing.length === 0 && unexpected.length === 0) {
    return;
  }

  const details = [
    missing.length > 0 ? `missing from every wave: ${missing.join(', ')}` : null,
    unexpected.length > 0
      ? `assigned more often than supplied: ${unexpected.join(', ')}`
      : null,
  ]
    .filter(Boolean)
    .join('; ');

  throw new Error(
    `Wave assignment is inconsistent: ${tasks.length} tasks were supplied but ` +
      `${assignedCount} were assigned across ${waves.length} waves (${details}). ` +
      `Refusing to return a plan that drops or repeats work.`
  );
}
