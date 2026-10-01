import { describe, it, expect } from 'vitest';
import {
  assignWaves,
  selectDependentClaims,
  MAX_DEPENDENT_CLAIMS_PER_TASK,
  type DependentClaim,
  type WaveAssignerConfig,
} from '../../src/wave-planner/wave-assigner';
import { scorePlan } from '../../src/wave-planner/plan-scorer';
import type {
  ParsedTask,
  ParsedEdge,
  WaveAdjustment,
  WaveAssignmentResult,
} from '../../src/wave-planner/types';

/**
 * Conflict prediction from a code graph (TRD 27 §5.1): the wave assigner told,
 * per task, which files depend on what the task changes.
 *
 * Four things are pinned here. The RULE and its direction — an edited file on
 * both ends of a dependency is a conflict; two tasks that only share a
 * dependent, or a dependency, are not. The CAP — a widely-used file sequences
 * nothing. That it CASCADES like any other bump. And the ROW it leaves, which
 * is what a reviewer is shown.
 *
 * And one thing above the others: with no claims the assignment is what it
 * was. Every plan made on a machine with no index goes through that path.
 */

function task(taskCode: string, filePaths: string[], dependencies: string[] = []): ParsedTask {
  return {
    taskCode,
    description: `Task ${taskCode}`,
    filePaths,
    dependencies,
    canRunInParallel: true,
    recommendedModel: 'sonnet',
    complexity: 'M',
  };
}

function edgesOf(tasks: ParsedTask[]): ParsedEdge[] {
  return tasks.flatMap((t) =>
    t.dependencies.map((from) => ({ from, to: t.taskCode, type: 'hard' as const }))
  );
}

/** `{ 'src/policy.ts': ['src/fetch.ts'] }` — file → the files that depend on it. */
type Dependents = Record<string, string[]>;

/** Per-task claims from a file → dependents map, the way the planner builds them. */
function claimsFor(tasks: ParsedTask[], dependents: Dependents): Record<string, DependentClaim[]> {
  const out: Record<string, DependentClaim[]> = {};
  for (const t of tasks) {
    out[t.taskCode] = t.filePaths.flatMap((dependsOn) =>
      (dependents[dependsOn] ?? []).map((file) => ({ file, dependsOn }))
    );
  }
  return out;
}

function assign(tasks: ParsedTask[], dependents: Dependents, config: WaveAssignerConfig = {}) {
  return assignWaves(tasks, edgesOf(tasks), {
    ...config,
    dependentClaims: claimsFor(tasks, dependents),
  });
}

function layout(result: WaveAssignmentResult): string[][] {
  return result.waves.map((w) => w.tasks.map((t) => t.taskCode));
}

describe('the rule — an edited file on both ends of a dependency', () => {
  // fetch.ts imports policy.ts. One task changes each.
  const dependents: Dependents = { 'src/policy.ts': ['src/fetch.ts'] };

  it('keeps apart a task that changes a file and a task that changes a file depending on it', () => {
    const tasks = [task('1.1', ['src/policy.ts']), task('1.2', ['src/fetch.ts'])];

    // Without the graph they share a wave: the paths have nothing in common.
    expect(layout(assignWaves(tasks, edgesOf(tasks)))).toEqual([['1.1', '1.2']]);

    const result = assign(tasks, dependents);

    expect(layout(result)).toEqual([['1.1'], ['1.2']]);
    expect(result.adjustments).toEqual([
      {
        type: 'DEPENDENCY_CONFLICT_BUMP',
        taskCode: '1.2',
        fromWave: 0,
        toWave: 1,
        reason: 'Dependency conflict: src/fetch.ts depends on src/policy.ts, which task 1.1 changes',
      },
    ]);
  });

  it('is the same conflict whichever of the two is placed first — the second one moves', () => {
    // Same files, other order: the task that changes the DEPENDED-ON file is
    // now the one placed second, so it is the one that waits.
    const tasks = [task('1.1', ['src/fetch.ts']), task('1.2', ['src/policy.ts'])];

    const result = assign(tasks, dependents);

    expect(layout(result)).toEqual([['1.1'], ['1.2']]);
    expect(result.adjustments).toEqual([
      {
        type: 'DEPENDENCY_CONFLICT_BUMP',
        taskCode: '1.2',
        fromWave: 0,
        toWave: 1,
        reason: 'Dependency conflict: src/fetch.ts, which task 1.1 changes, depends on src/policy.ts',
      },
    ]);
  });

  it('does not keep apart two tasks whose files are both used by a third file neither changes', () => {
    // page.tsx imports both a.ts and b.ts. Nobody edits page.tsx. The two
    // tasks' claims overlap — and an overlap of claims is not a conflict.
    const tasks = [task('1.1', ['src/a.ts']), task('1.2', ['src/b.ts'])];

    const result = assign(tasks, { 'src/a.ts': ['src/page.tsx'], 'src/b.ts': ['src/page.tsx'] });

    expect(layout(result)).toEqual([['1.1', '1.2']]);
    expect(result.adjustments).toEqual([]);
  });

  it('does not keep apart two tasks whose files both depend on a third file neither changes', () => {
    // a.ts and b.ts both import util.ts, which no task touches. The index
    // knows that — util.ts has two dependents — but a claim is "what depends on
    // a file this task CHANGES", so the fact never reaches either task.
    const tasks = [task('1.1', ['src/a.ts']), task('1.2', ['src/b.ts'])];

    const result = assign(tasks, { 'src/util.ts': ['src/a.ts', 'src/b.ts'] });

    expect(layout(result)).toEqual([['1.1', '1.2']]);
    expect(result.adjustments).toEqual([]);
  });

  it('does keep both apart from the task that changes that third file', () => {
    const tasks = [
      task('1.1', ['src/util.ts']),
      task('1.2', ['src/a.ts']),
      task('1.3', ['src/b.ts']),
    ];

    const result = assign(tasks, { 'src/util.ts': ['src/a.ts', 'src/b.ts'] });

    // One wave for the shared file, then everything built on it together: the
    // two dependents do not conflict with each other.
    expect(layout(result)).toEqual([['1.1'], ['1.2', '1.3']]);
    expect(result.adjustments.map((a) => [a.type, a.taskCode])).toEqual([
      ['DEPENDENCY_CONFLICT_BUMP', '1.2'],
      ['DEPENDENCY_CONFLICT_BUMP', '1.3'],
    ]);
  });

  it('never makes a task conflict with itself', () => {
    // One task changes both ends of the dependency.
    const tasks = [task('1.1', ['src/policy.ts', 'src/fetch.ts']), task('1.2', ['src/other.ts'])];

    const result = assign(tasks, dependents);

    expect(layout(result)).toEqual([['1.1', '1.2']]);
    expect(result.adjustments).toEqual([]);
  });

  it('leaves alone two tasks the plan already orders', () => {
    const tasks = [task('1.1', ['src/policy.ts']), task('2.1', ['src/fetch.ts'], ['1.1'])];

    const result = assign(tasks, dependents);

    expect(layout(result)).toEqual([['1.1'], ['2.1']]);
    expect(result.adjustments).toEqual([]);
  });

  it('names every pair of files when there are several, once each', () => {
    const tasks = [
      task('1.1', ['src/policy.ts', 'src/limits.ts']),
      task('1.2', ['src/fetch.ts', 'src/queue.ts']),
    ];

    const result = assign(tasks, {
      'src/policy.ts': ['src/fetch.ts'],
      'src/limits.ts': ['src/queue.ts', 'src/fetch.ts'],
    });

    expect(result.adjustments).toHaveLength(1);
    // fetch.ts is claimed twice by 1.1 (it uses both files); the wave remembers
    // one reason per dependent file, the first by the selection's order.
    expect(result.adjustments[0].reason).toBe(
      'Dependency conflict: src/fetch.ts depends on src/policy.ts, which task 1.1 changes; ' +
        'src/queue.ts depends on src/limits.ts, which task 1.1 changes'
    );
  });
});

describe('the cap — a widely-used file sequences nothing', () => {
  const many = (n: number, prefix = 'src/user') => Array.from({ length: n }, (_, i) => `${prefix}-${String(i).padStart(3, '0')}.ts`);

  it('is 25 claims per task', () => {
    expect(MAX_DEPENDENT_CLAIMS_PER_TASK).toBe(25);
  });

  it('claims a file with exactly 25 dependents, and none of a file with 26', () => {
    const at = (n: number) => {
      const users = many(n);
      // The second task edits the LAST dependent in path order — the one a
      // "first 25" prefix would have dropped at 26.
      const tasks = [task('1.1', ['src/hub.ts']), task('1.2', [users[n - 1]])];
      return assign(tasks, { 'src/hub.ts': users });
    };

    expect(layout(at(25))).toEqual([['1.1'], ['1.2']]);

    // One more dependent and the file is too wide to sequence on at all.
    expect(layout(at(26))).toEqual([['1.1', '1.2']]);
    expect(at(26).adjustments).toEqual([]);
  });

  it('does not keep a prefix of a wide file — the FIRST dependent in path order is not claimed either', () => {
    const users = many(26);
    const tasks = [task('1.1', ['src/hub.ts']), task('1.2', [users[0]])];

    expect(layout(assign(tasks, { 'src/hub.ts': users }))).toEqual([['1.1', '1.2']]);
  });

  it('keeps a narrow file\'s dependents when the same task also changes a wide one', () => {
    const tasks = [
      task('1.1', ['src/hub.ts', 'src/policy.ts']),
      task('1.2', ['src/fetch.ts']),
      task('1.3', ['src/user-000.ts']),
    ];

    const result = assign(tasks, { 'src/hub.ts': many(200), 'src/policy.ts': ['src/fetch.ts'] });

    // 1.2 is sequenced on the specific coupling. 1.3 edits one of the hub's
    // two hundred dependents and is not.
    expect(layout(result)).toEqual([['1.1', '1.3'], ['1.2']]);
  });

  it('means a file used by the whole plan does not push the rest of the plan out of its wave', () => {
    // Ten tasks, each editing a file that imports the same hub; an eleventh
    // edits the hub. Uncapped, the hub's task would have the wave to itself
    // and the other ten would all wait a wave for it.
    const users = many(30);
    const tasks = [task('0', ['src/hub.ts']), ...users.slice(0, 10).map((file, i) => task(`1.${i}`, [file]))];

    const result = assign(tasks, { 'src/hub.ts': users });

    expect(result.totalWaves).toBe(1);
    expect(result.adjustments).toEqual([]);
  });

  it('can be moved, and the assigner applies it however many claims it is handed', () => {
    const users = many(40);
    const tasks = [task('1.1', ['src/hub.ts']), task('1.2', [users[39]])];

    expect(layout(assign(tasks, { 'src/hub.ts': users }, { maxDependentClaimsPerTask: 40 }))).toEqual([
      ['1.1'],
      ['1.2'],
    ]);
    expect(layout(assign(tasks, { 'src/hub.ts': users }, { maxDependentClaimsPerTask: 39 }))).toEqual([
      ['1.1', '1.2'],
    ]);
  });

  describe('selectDependentClaims', () => {
    const claims = (dependsOn: string, files: string[]): DependentClaim[] =>
      files.map((file) => ({ file, dependsOn }));

    it('takes files narrowest first, each whole, until one does not fit', () => {
      const selected = selectDependentClaims(
        ['src/wide.ts', 'src/narrow.ts', 'src/middle.ts'],
        [
          ...claims('src/wide.ts', many(6, 'src/w')),
          ...claims('src/narrow.ts', ['src/n2.ts', 'src/n1.ts']),
          ...claims('src/middle.ts', many(3, 'src/m')),
        ],
        5
      );

      // narrow (2) + middle (3) = 5 fits; wide (6) does not.
      expect(selected.claims).toEqual([
        { file: 'src/n1.ts', dependsOn: 'src/narrow.ts' },
        { file: 'src/n2.ts', dependsOn: 'src/narrow.ts' },
        { file: 'src/m-000.ts', dependsOn: 'src/middle.ts' },
        { file: 'src/m-001.ts', dependsOn: 'src/middle.ts' },
        { file: 'src/m-002.ts', dependsOn: 'src/middle.ts' },
      ]);
      expect(selected.leftOut).toEqual([{ file: 'src/wide.ts', dependents: 6 }]);
    });

    it('leaves out everything wider than the first file that does not fit', () => {
      const selected = selectDependentClaims(
        ['a.ts', 'b.ts', 'c.ts'],
        [...claims('a.ts', many(3, 'a')), ...claims('b.ts', many(3, 'b')), ...claims('c.ts', many(4, 'c'))],
        5
      );

      // a (3) fits. b (3) would make 6. c is wider still and is not tried in
      // its place, though nothing else would be: the order is by width.
      expect(selected.claims.map((c) => c.dependsOn)).toEqual(['a.ts', 'a.ts', 'a.ts']);
      expect(selected.leftOut).toEqual([
        { file: 'b.ts', dependents: 3 },
        { file: 'c.ts', dependents: 4 },
      ]);
    });

    it('drops a claim on one of the task\'s own files, and one made on behalf of a file that is not its own', () => {
      const selected = selectDependentClaims(
        ['src/policy.ts', 'src/fetch.ts'],
        [
          { file: 'src/fetch.ts', dependsOn: 'src/policy.ts' }, // own file
          { file: 'src/page.tsx', dependsOn: 'src/fetch.ts' },
          { file: 'src/x.ts', dependsOn: 'src/someone-elses.ts' }, // not this task's
          { file: 'src/page.tsx', dependsOn: 'src/fetch.ts' }, // repeated
        ]
      );

      expect(selected).toEqual({
        claims: [{ file: 'src/page.tsx', dependsOn: 'src/fetch.ts' }],
        leftOut: [],
      });
    });

    it('is idempotent, so a stored selection can be handed back', () => {
      const own = ['src/wide.ts', 'src/narrow.ts'];
      const once = selectDependentClaims(
        own,
        [...claims('src/wide.ts', many(30, 'src/w')), ...claims('src/narrow.ts', many(4, 'src/n'))]
      );

      expect(selectDependentClaims(own, once.claims)).toEqual({ claims: once.claims, leftOut: [] });
    });

    it('does not depend on the order the claims arrive in', () => {
      const all = [...claims('b.ts', ['z.ts', 'y.ts']), ...claims('a.ts', ['x.ts', 'w.ts'])];

      expect(selectDependentClaims(['a.ts', 'b.ts'], all)).toEqual(
        selectDependentClaims(['a.ts', 'b.ts'], [...all].reverse())
      );
    });
  });
});

describe('cascading — a dependency conflict is an ordering constraint like any other', () => {
  it('carries the plan-dependents of a bumped task after it, without recording them', () => {
    const tasks = [
      task('1.1', ['src/policy.ts']),
      task('1.2', ['src/fetch.ts']),
      task('2.1', ['src/page.tsx'], ['1.2']),
      task('3.1', ['src/app.tsx'], ['2.1']),
    ];

    const result = assign(tasks, { 'src/policy.ts': ['src/fetch.ts'] });

    expect(layout(result)).toEqual([['1.1'], ['1.2'], ['2.1'], ['3.1']]);
    // 2.1 and 3.1 moved because 1.2 did. They conflict with nothing.
    expect(result.adjustments.map((a) => a.taskCode)).toEqual(['1.2']);
  });

  it('checks a bumped task against the wave it lands in', () => {
    // client.ts uses both policy.ts and fetch.ts; fetch.ts uses policy.ts. One
    // task each. 1.2 is bumped to wave 1 by 1.1. 1.3 cannot share wave 0 with
    // 1.1 either — and in wave 1 it meets 1.2, which was not there when the
    // plan was written.
    const tasks = [
      task('1.1', ['src/policy.ts']),
      task('1.2', ['src/fetch.ts']),
      task('1.3', ['src/client.ts']),
    ];

    const result = assign(tasks, {
      'src/policy.ts': ['src/client.ts', 'src/fetch.ts'],
      'src/fetch.ts': ['src/client.ts'],
    });

    // Three files in a chain of uses is three waves. That is the plan being
    // serialised because the work is serial, not the rule overreaching.
    expect(layout(result)).toEqual([['1.1'], ['1.2'], ['1.3']]);
    expect(result.adjustments).toEqual([
      {
        type: 'DEPENDENCY_CONFLICT_BUMP',
        taskCode: '1.2',
        fromWave: 0,
        toWave: 1,
        reason: 'Dependency conflict: src/fetch.ts depends on src/policy.ts, which task 1.1 changes',
      },
      {
        type: 'DEPENDENCY_CONFLICT_BUMP',
        taskCode: '1.3',
        fromWave: 0,
        toWave: 2,
        // Both waves it was turned away from, in the order it met them.
        reason:
          'Dependency conflict: src/client.ts depends on src/policy.ts, which task 1.1 changes; ' +
          'src/client.ts depends on src/fetch.ts, which task 1.2 changes',
      },
    ]);
  });

  it('does not sequence a task behind one it merely precedes', () => {
    // client.ts uses fetch.ts, and fetch.ts uses policy.ts — but client.ts does
    // not use policy.ts. 1.2 is bumped to wave 1; 1.3 has no quarrel with wave
    // 0, and running BEFORE the task whose file it uses is not running beside it.
    const tasks = [
      task('1.1', ['src/policy.ts']),
      task('1.2', ['src/fetch.ts']),
      task('1.3', ['src/client.ts']),
    ];

    const result = assign(tasks, {
      'src/policy.ts': ['src/fetch.ts'],
      'src/fetch.ts': ['src/client.ts'],
    });

    expect(layout(result)).toEqual([['1.1', '1.3'], ['1.2']]);
    expect(result.adjustments.map((a) => a.taskCode)).toEqual(['1.2']);
  });

  it('checks a task bumped for a shared file against dependency claims where it lands, and the other way', () => {
    const tasks = [
      task('1.1', ['src/a.ts']),
      task('1.2', ['src/policy.ts'], ['1.1']), // wave 1 by its dependency
      task('1.3', ['src/a.ts', 'src/fetch.ts']), // shares a.ts with 1.1; fetch.ts uses policy.ts
    ];

    const result = assign(tasks, { 'src/policy.ts': ['src/fetch.ts'] });

    // 1.3 is placed before 1.2 (shallower), so 1.2 is the one that meets it:
    // 1.3 went 0 → 1 for the shared file, and 1.2 then cannot join wave 1.
    expect(layout(result)).toEqual([['1.1'], ['1.3'], ['1.2']]);
    expect(result.adjustments).toEqual([
      {
        type: 'FILE_CONFLICT_BUMP',
        taskCode: '1.3',
        fromWave: 0,
        toWave: 1,
        reason: 'File conflict detected with files: src/a.ts',
      },
      {
        type: 'DEPENDENCY_CONFLICT_BUMP',
        taskCode: '1.2',
        fromWave: 1,
        toWave: 2,
        reason: 'Dependency conflict: src/fetch.ts, which task 1.3 changes, depends on src/policy.ts',
      },
    ]);
  });

  it('records one row when a task meets both kinds, named for the shared file, with the dependency kept', () => {
    const tasks = [
      task('1.1', ['src/a.ts']),
      task('1.2', ['src/policy.ts']),
      task('1.3', ['src/a.ts']), // → wave 1
      task('1.4', ['src/a.ts', 'src/fetch.ts']), // a.ts in waves 0 and 1; policy.ts's user
    ];

    const result = assign(tasks, { 'src/policy.ts': ['src/fetch.ts'] });

    expect(layout(result)).toEqual([['1.1', '1.2'], ['1.3'], ['1.4']]);
    expect(result.adjustments.filter((a) => a.taskCode === '1.4')).toEqual([
      {
        type: 'FILE_CONFLICT_BUMP',
        taskCode: '1.4',
        fromWave: 0,
        toWave: 2,
        reason:
          'File conflict detected with files: src/a.ts; dependency conflict: ' +
          'src/fetch.ts depends on src/policy.ts, which task 1.2 changes',
      },
    ]);
  });

  it('still splits for capacity afterwards, and the split waves hold no conflict either', () => {
    const tasks = [
      task('1.1', ['src/policy.ts']),
      task('1.2', ['src/fetch.ts']),
      task('1.3', ['src/c.ts']),
      task('1.4', ['src/d.ts']),
    ];

    const result = assign(tasks, { 'src/policy.ts': ['src/fetch.ts'] }, { maxTasksPerWave: 2 });

    expect(layout(result)).toEqual([['1.1', '1.3'], ['1.4'], ['1.2']]);
    expect(result.adjustments.map((a) => [a.type, a.taskCode])).toEqual([
      ['DEPENDENCY_CONFLICT_BUMP', '1.2'],
      ['CAPACITY_SPLIT', '1.4'],
    ]);
  });
});

describe('the adjustment row', () => {
  const tasks = [task('1.1', ['src/policy.ts']), task('1.2', ['src/fetch.ts'])];
  const result = assign(tasks, { 'src/policy.ts': ['src/fetch.ts'] });

  it('is its own type, so a reader can tell a prediction from a shared file', () => {
    const [row] = result.adjustments;

    expect(row.type).toBe('DEPENDENCY_CONFLICT_BUMP');
    expect(row.type).not.toBe('FILE_CONFLICT_BUMP');
  });

  it('names both files and the other task in a sentence', () => {
    const [row] = result.adjustments;

    expect(row.reason).toContain('src/fetch.ts');
    expect(row.reason).toContain('src/policy.ts');
    expect(row.reason).toContain('task 1.1');
  });

  it('is counted by the plan scorer as a conflict the assigner repaired', () => {
    const edges = edgesOf(tasks);
    const without = scorePlan(assignWaves(tasks, edges), 1, edges, tasks);
    const withGraph = scorePlan(result, 1, edges, tasks);

    expect(without.fileConflictScore).toBe(1);
    // One moved task over two file references.
    expect(withGraph.fileConflictScore).toBe(0.5);
    expect(withGraph.confidenceSignals.conflictRisk).toBe('HIGH');
    // The score the refinement gate branches on does not move: it is the
    // critical path over the task count, and neither changed.
    expect(withGraph.parallelizationScore).toBe(without.parallelizationScore);
  });

  it('scores a dependency bump exactly as it scores a shared-file bump', () => {
    const bump = (type: WaveAdjustment['type']): WaveAssignmentResult => ({
      waves: [],
      totalWaves: 2,
      maxParallelism: 1,
      adjustments: [{ type, taskCode: '1.2', fromWave: 0, toWave: 1, reason: 'r' }],
    });
    const fileRefs = [task('1.1', ['a.ts', 'b.ts']), task('1.2', ['c.ts', 'd.ts'])];

    expect(scorePlan(bump('DEPENDENCY_CONFLICT_BUMP'), 1, [], fileRefs).fileConflictScore).toBe(
      scorePlan(bump('FILE_CONFLICT_BUMP'), 1, [], fileRefs).fileConflictScore
    );
    expect(scorePlan(bump('CAPACITY_SPLIT'), 1, [], fileRefs).fileConflictScore).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// With no claims, nothing changes.
// ---------------------------------------------------------------------------

/** A small deterministic generator, so a failure names a seed that reproduces it. */
function rng(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomPlan(seed: number): { tasks: ParsedTask[]; edges: ParsedEdge[]; files: string[]; maxTasksPerWave?: number } {
  const r = rng(seed);
  const files = Array.from({ length: 2 + Math.floor(r() * 10) }, (_, i) => `src/f${i}.ts`);
  const tasks: ParsedTask[] = [];
  const count = 1 + Math.floor(r() * 12);

  for (let i = 0; i < count; i++) {
    const dependencies: string[] = [];
    for (let j = 0; j < i; j++) if (r() < 0.18) dependencies.push(tasks[j].taskCode);
    const own: string[] = [];
    for (let f = Math.floor(r() * 4); f > 0; f--) own.push(files[Math.floor(r() * files.length)]);
    tasks.push(task(`t${i}`, own, dependencies));
  }

  return {
    tasks,
    edges: edgesOf(tasks),
    files,
    maxTasksPerWave: r() < 0.4 ? 1 + Math.floor(r() * 4) : undefined,
  };
}

/**
 * The conflict pass as it was before dependent claims existed, in miniature:
 * the same placement rule, kept here so the real one can be compared with it.
 * Layout and adjustments only — no labels, no capacity split.
 */
function referencePlacement(tasks: ParsedTask[]): { layout: string[][]; adjustments: WaveAdjustment[] } {
  const byCode = new Map(tasks.map((t) => [t.taskCode, t]));
  const depthOf = new Map<string, number>();
  const depth = (code: string): number => {
    if (!depthOf.has(code)) {
      const deps = byCode.get(code)!.dependencies;
      depthOf.set(code, deps.length === 0 ? 0 : 1 + Math.max(...deps.map(depth)));
    }
    return depthOf.get(code)!;
  };

  const ordered = [...tasks].sort((a, b) => depth(a.taskCode) - depth(b.taskCode));
  const waves: ParsedTask[][] = [];
  const waveOf = new Map<string, number>();
  const adjustments: WaveAdjustment[] = [];

  for (const t of ordered) {
    const earliest = Math.max(0, ...t.dependencies.map((d) => waveOf.get(d)! + 1));
    let wave = earliest;
    const conflicting: string[] = [];
    for (;;) {
      const taken = new Set((waves[wave] ?? []).flatMap((x) => x.filePaths));
      const here = t.filePaths.filter((f) => taken.has(f));
      if (here.length === 0) break;
      for (const f of here) if (!conflicting.includes(f)) conflicting.push(f);
      wave++;
    }
    if (wave !== earliest) {
      adjustments.push({
        type: 'FILE_CONFLICT_BUMP',
        taskCode: t.taskCode,
        fromWave: earliest,
        toWave: wave,
        reason: `File conflict detected with files: ${conflicting.join(', ')}`,
      });
    }
    (waves[wave] ??= []).push(t);
    waveOf.set(t.taskCode, wave);
  }

  return { layout: waves.filter(Boolean).map((w) => w.map((t) => t.taskCode)), adjustments };
}

describe('with no dependent claims, the assignment is what it was', () => {
  const SEEDS = Array.from({ length: 400 }, (_, i) => i + 1);

  it('is byte-identical whether the option is absent, undefined, empty, or empty for every task', () => {
    for (const seed of SEEDS) {
      const { tasks, edges, maxTasksPerWave } = randomPlan(seed);
      const absent = JSON.stringify(assignWaves(tasks, edges, { maxTasksPerWave }));

      const variants: WaveAssignerConfig[] = [
        { maxTasksPerWave, dependentClaims: undefined },
        { maxTasksPerWave, dependentClaims: {} },
        { maxTasksPerWave, dependentClaims: Object.fromEntries(tasks.map((t) => [t.taskCode, []])) },
        { maxTasksPerWave, maxDependentClaimsPerTask: 1 },
      ];
      for (const config of variants) {
        expect(JSON.stringify(assignWaves(tasks, edges, config)), `seed ${seed}`).toBe(absent);
      }
    }
  });

  it('matches the conflict pass as it was before the option existed', () => {
    let bumped = 0;

    for (const seed of SEEDS) {
      const { tasks, edges } = randomPlan(seed);
      const reference = referencePlacement(tasks);
      const actual = assignWaves(tasks, edges);

      expect(layout(actual), `seed ${seed}`).toEqual(reference.layout);
      expect(actual.adjustments, `seed ${seed}`).toEqual(reference.adjustments);
      if (reference.adjustments.length > 0) bumped++;
    }

    // The comparison is only worth something if conflicts actually occurred.
    expect(bumped).toBeGreaterThan(100);
  });

  it('never produces a dependency row without claims', () => {
    for (const seed of SEEDS) {
      const { tasks, edges, maxTasksPerWave } = randomPlan(seed);
      const types = assignWaves(tasks, edges, { maxTasksPerWave }).adjustments.map((a) => a.type);
      expect(types).not.toContain('DEPENDENCY_CONFLICT_BUMP');
    }
  });
});

describe('with claims, on random plans', () => {
  it('places every task once, after its dependencies, with no conflict of either kind in any wave', () => {
    let dependencyBumps = 0;

    for (let seed = 1; seed <= 400; seed++) {
      const { tasks, edges, files, maxTasksPerWave } = randomPlan(seed);

      // A random "uses" relation over the plan's files.
      const r = rng(seed * 7919);
      const dependents: Dependents = {};
      for (const file of files) {
        dependents[file] = files.filter((other) => other !== file && r() < 0.15);
      }
      const dependentClaims = claimsFor(tasks, dependents);
      const result = assignWaves(tasks, edges, { maxTasksPerWave, dependentClaims });

      const placed = result.waves.flatMap((w) => w.tasks.map((t) => t.taskCode));
      expect([...placed].sort(), `seed ${seed}`).toEqual(tasks.map((t) => t.taskCode).sort());

      const waveOf = new Map(result.waves.flatMap((w) => w.tasks.map((t) => [t.taskCode, w.waveIndex] as const)));
      for (const t of tasks) {
        for (const dep of t.dependencies) {
          expect(waveOf.get(t.taskCode)!, `seed ${seed}: ${t.taskCode} after ${dep}`).toBeGreaterThan(waveOf.get(dep)!);
        }
      }

      for (const wave of result.waves) {
        for (const a of wave.tasks) {
          const claimsOfA = selectDependentClaims(a.filePaths, dependentClaims[a.taskCode] ?? []).claims;
          for (const b of wave.tasks) {
            if (a === b) continue;
            const shared = a.filePaths.filter((f) => b.filePaths.includes(f));
            expect(shared, `seed ${seed}: ${a.taskCode} and ${b.taskCode} share a file in wave ${wave.waveIndex}`).toEqual([]);
            const depended = claimsOfA.filter((c) => b.filePaths.includes(c.file));
            expect(
              depended,
              `seed ${seed}: ${b.taskCode} changes a file that depends on ${a.taskCode}'s, in wave ${wave.waveIndex}`
            ).toEqual([]);
          }
        }
      }

      dependencyBumps += result.adjustments.filter((x) => x.type === 'DEPENDENCY_CONFLICT_BUMP').length;
    }

    expect(dependencyBumps).toBeGreaterThan(50);
  });

  it('is deterministic', () => {
    const { tasks, edges, files } = randomPlan(42);
    const dependents: Dependents = Object.fromEntries(files.map((f, i) => [f, [files[(i + 1) % files.length]]]));
    const config = { dependentClaims: claimsFor(tasks, dependents) };

    expect(assignWaves(tasks, edges, config)).toEqual(assignWaves(tasks, edges, config));
  });
});
