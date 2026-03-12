# DevPilot Wave Planner — End-to-End Specification
## Parallelization-Aware Plan Optimization, Execution & Storage · v1.0
> March 2026 · Open Conjecture

---

## Table of Contents

1. [Purpose & Goals](#1-purpose--goals)
2. [System Overview](#2-system-overview)
3. [Core Concepts](#3-core-concepts)
4. [Data Model](#4-data-model)
5. [Plan Optimization Engine](#5-plan-optimization-engine)
6. [Wave Execution Controller](#6-wave-execution-controller)
7. [Storage & Persistence](#7-storage--persistence)
8. [Plan Update & Re-Optimization](#8-plan-update--re-optimization)
9. [Integration with Existing Systems](#9-integration-with-existing-systems)
10. [API Surface](#10-api-surface)
11. [UI Additions](#11-ui-additions)
12. [Prompt Engineering](#12-prompt-engineering)
13. [Metrics & Observability](#13-metrics--observability)
14. [Configuration](#14-configuration)
15. [Error Handling & Recovery](#15-error-handling--recovery)
16. [Acceptance Criteria](#16-acceptance-criteria)
17. [Implementation Plan](#17-implementation-plan)

---

## 1. Purpose & Goals

### Problem Statement

DevPilot currently generates plans as flat lists of workstreams containing tasks. The Planning Agent uses mock logic (`generateMockWorkstreams()`) to produce these structures, with no understanding of task dependency graphs, parallelization potential, or critical path scheduling. When a Conductor dispatches work to a fleet of coding agents, there is no system-level awareness of which tasks can safely run in parallel, which must wait for predecessors, or how to sequence "waves" of independent work to maximize fleet throughput.

The Claude Code Plan Mode — when prompted correctly — produces wave-decomposed, dependency-annotated plans with critical path analysis. This specification defines the system that:

1. Generates these optimized plans via structured prompts to Claude Code Plan Mode.
2. Parses, validates, and stores the wave/dependency graph.
3. Orchestrates wave-by-wave execution across the agent fleet.
4. Provides real-time plan state updates as waves complete.
5. Supports re-optimization when constraints change mid-execution.

### Goals

1. **Replace mock plan generation** with AI-driven, parallelization-aware plan generation via Claude Code Plan Mode.
2. **Introduce the Wave primitive** as a first-class scheduling unit: a group of independent tasks that can all execute concurrently.
3. **Model task dependencies explicitly** with a DAG (directed acyclic graph) so the system can compute critical paths, identify parallelization opportunities, and detect dependency violations.
4. **Automate wave dispatch**: when all tasks in wave N complete, automatically stage wave N+1 for dispatch without Conductor intervention.
5. **Store optimized plans** with full dependency metadata, wave assignments, and critical path annotations so they can be queried, diffed, re-optimized, and used for benchmark scoring.
6. **Surface wave-level progress** in the UI so the Conductor sees which wave is active, which tasks are running, and what the critical path bottleneck is.
7. **Feed plan quality metrics** into the Conductor Score and Benchmark Suite to close the optimization feedback loop.

### Non-Goals

- Full autonomous execution without Conductor approval of the initial plan (the Conductor always approves before wave 1 dispatches).
- Multi-repository wave coordination (each wave plan operates within a single repo context; cross-repo coordination is future work).
- Replacing the Workstream abstraction (waves augment workstreams; a workstream may span multiple waves).

---

## 2. System Overview

### Architecture Context

```
                    ┌──────────────────────────────────────┐
                    │          DevPilot Platform            │
                    │                                      │
                    │  ┌────────────────────────────────┐  │
                    │  │      Planning Agent            │  │
                    │  │                                │  │
                    │  │  ┌──────────────────────────┐  │  │
                    │  │  │  Wave Plan Optimizer     │  │  │
  Conductor ───────────│  │  (this spec)             │  │  │
  (approve/edit)   │  │  │                          │  │  │
                    │  │  │  • Prompt Constructor    │  │  │
                    │  │  │  • Response Parser       │  │  │
                    │  │  │  • DAG Validator         │  │  │
                    │  │  │  • Critical Path Solver  │  │  │
                    │  │  │  • Wave Assigner         │  │  │
                    │  │  └──────────────────────────┘  │  │
                    │  │              │                  │  │
                    │  │              ▼                  │  │
                    │  │  ┌──────────────────────────┐  │  │
                    │  │  │  Wave Execution          │  │  │
                    │  │  │  Controller              │  │  │
                    │  │  │                          │  │  │
                    │  │  │  • Wave State Machine    │  │  │
                    │  │  │  • Dispatch Coordinator  │  │  │
                    │  │  │  • Completion Listener   │  │  │
                    │  │  │  • Auto-Advance Logic    │  │  │
                    │  │  └──────────────────────────┘  │  │
                    │  │              │                  │  │
                    │  └──────────────│──────────────────┘  │
                    │                │                      │
                    │                ▼                      │
                    │  ┌──────────────────────────────┐    │
                    │  │  Orchestrator Service        │    │
                    │  │  (existing: HTTP/ao-cli)     │    │
                    │  └──────────────────────────────┘    │
                    │                │                      │
                    └────────────────│──────────────────────┘
                                     │
                                     ▼
                            Ruflo Agent Fleet
```

### Data Flow

```
1. Conductor promotes item to SHAPING
       │
2. Planning Agent assembles fleet context (existing)
       │
3. Wave Plan Optimizer constructs structured prompt
       │
4. Claude Code Plan Mode returns wave-decomposed plan
       │
5. Response Parser extracts waves, tasks, dependencies
       │
6. DAG Validator ensures no cycles, validates file ownership
       │
7. Critical Path Solver computes longest path, annotations
       │
8. Wave Assigner groups tasks into waves by topological sort
       │
9. Optimized WavePlan persisted to database
       │
10. Item moves to REFINING — Conductor reviews wave plan
       │
11. Conductor approves plan
       │
12. Wave Execution Controller activates
       │
13. Wave 1 tasks dispatched to fleet (parallel subagents)
       │
14. On wave completion → auto-advance to wave N+1
       │
15. Repeat until all waves complete
       │
16. Plan marked COMPLETE — metrics collected
```

---

## 3. Core Concepts

### 3.1 Wave

A **Wave** is a group of tasks with no inter-dependencies that can all execute concurrently. Waves execute sequentially — wave N+1 cannot begin until all tasks in wave N have completed (or been explicitly skipped/failed).

```
WAVE 1  ║ 1.1 ║
        ╠═════╬════════════════════════
WAVE 2  ║ 2.1 ║ 2.2 ║ 2.3 ║ 2.4 ║
        ╠═════╬═════╬═════╬═════╬════
WAVE 3  ║ 3.1 ║ 3.2 ║
        ╠═════╬═════╬════════════════
WAVE 4  ║ 4.1 ║ 4.2 ║ 4.3 ║
```

**Properties:**
- All tasks in a wave are independent of each other.
- A wave's tasks may depend on tasks from *any* prior wave (not just the immediately preceding wave).
- The maximum number of concurrent tasks in a wave is bounded by available fleet capacity.

### 3.2 Task Dependency Graph (DAG)

Each task declares its dependencies as a list of task IDs it depends on. The full set of tasks and dependencies forms a Directed Acyclic Graph (DAG).

**Invariants:**
- The graph must be acyclic (validated at parse time).
- Every referenced dependency must exist in the plan.
- A task with no dependencies is a "root" and belongs in the earliest possible wave.
- A task's wave number = 1 + max(wave numbers of all its dependencies).

### 3.3 Critical Path

The **critical path** is the longest chain of sequentially dependent tasks through the DAG. It determines the minimum number of waves (and therefore the theoretical minimum wall-clock time) to execute the full plan.

**Use cases:**
- Highlight critical path tasks in the UI so the Conductor knows which tasks are schedule-sensitive.
- Score plan quality: shorter critical paths (relative to total task count) indicate better parallelization.
- Identify optimization opportunities: tasks on the critical path are candidates for decomposition into smaller parallel subtasks.

### 3.4 File Ownership

Each task declares the files it will modify. Within a wave, no two tasks may touch the same file. Across waves, file ownership transfers when the owning task completes. This is enforced at plan validation time and at dispatch time.

### 3.5 Wave Plan vs. Plan

A **Plan** (existing concept) contains workstreams and tasks. A **WavePlan** is an optimized overlay on a Plan that adds:
- Wave assignments for every task.
- Explicit dependency edges between tasks.
- Critical path annotation.
- Parallelization statistics.

The WavePlan does not replace the Plan — it augments it. Workstreams remain the logical grouping (by domain/concern); waves are the scheduling grouping (by execution order).

---

## 4. Data Model

### 4.1 WavePlan

```typescript
interface WavePlan {
  id: string;
  planId: string;                    // FK to existing Plan
  horizonItemId: string;             // FK to HorizonItem
  waves: Wave[];
  criticalPath: string[];            // ordered list of task IDs on the critical path
  criticalPathLength: number;        // number of tasks on critical path
  totalWaves: number;
  totalTasks: number;
  maxParallelism: number;            // max tasks in any single wave
  parallelizationScore: number;      // 0–1, ratio of parallelizable tasks
  status: WavePlanStatus;
  currentWaveIndex: number;          // 0-based, which wave is active
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type WavePlanStatus =
  | 'draft'           // parsed but not yet approved
  | 'approved'        // conductor approved, ready to execute
  | 'executing'       // at least one wave has been dispatched
  | 'paused'          // conductor paused execution
  | 'completed'       // all waves finished successfully
  | 'failed'          // a wave failed and execution halted
  | 're-optimizing';  // plan is being re-optimized mid-execution
```

### 4.2 Wave

```typescript
interface Wave {
  id: string;
  wavePlanId: string;
  waveIndex: number;                 // 0-based execution order
  label: string;                     // e.g. "Wave 1: Project Bootstrap"
  tasks: WaveTask[];
  status: WaveStatus;
  maxParallelTasks: number;          // number of tasks in this wave
  startedAt: Date | null;
  completedAt: Date | null;
}

type WaveStatus =
  | 'pending'         // not yet dispatched
  | 'dispatching'     // being dispatched to fleet
  | 'active'          // at least one task running
  | 'completed'       // all tasks in wave completed
  | 'failed'          // at least one task failed, wave halted
  | 'skipped';        // wave skipped (re-optimization)
```

### 4.3 WaveTask

```typescript
interface WaveTask {
  id: string;                        // e.g. "1.1", "4.3"
  waveId: string;
  taskId: string;                    // FK to existing Task
  waveIndex: number;                 // which wave this task belongs to
  label: string;
  description: string;
  filePaths: string[];               // files this task will modify
  dependencies: string[];            // IDs of tasks this depends on
  isOnCriticalPath: boolean;
  canRunInParallel: boolean;         // true unless it has intra-wave sequencing
  status: WaveTaskStatus;
  assignedSessionId: string | null;  // Ruflo session executing this task
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  retryCount: number;
}

type WaveTaskStatus =
  | 'pending'
  | 'dispatched'
  | 'running'
  | 'completed'
  | 'failed'
  | 'retrying'
  | 'skipped';
```

### 4.4 DependencyEdge

```typescript
interface DependencyEdge {
  id: string;
  wavePlanId: string;
  fromTaskId: string;                // prerequisite task
  toTaskId: string;                  // dependent task
  edgeType: 'hard' | 'soft';        // hard = must complete, soft = preferred
}
```

### 4.5 WavePlanMetrics

```typescript
interface WavePlanMetrics {
  wavePlanId: string;
  totalWallClockMs: number;          // actual execution time
  theoreticalMinMs: number;          // critical path × avg task duration
  parallelizationEfficiency: number; // theoretical / actual (0–1)
  wavesExecuted: number;
  tasksCompleted: number;
  tasksFailed: number;
  tasksRetried: number;
  avgTaskDurationMs: number;
  maxWaveWaitMs: number;             // longest wait between waves
  fileConflictsAvoided: number;
  reOptimizationCount: number;
}
```

### 4.6 Database Schema Extensions

```typescript
// New table: wave_plans
export const wavePlans = sqliteTable('wave_plans', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  planId: text('plan_id').notNull().references(() => plans.id, { onDelete: 'cascade' }),
  horizonItemId: text('horizon_item_id').notNull().references(() => horizonItems.id),
  totalWaves: integer('total_waves').notNull(),
  totalTasks: integer('total_tasks').notNull(),
  maxParallelism: integer('max_parallelism').notNull(),
  criticalPath: text('critical_path', { mode: 'json' }).$type<string[]>().notNull(),
  criticalPathLength: integer('critical_path_length').notNull(),
  parallelizationScore: real('parallelization_score').notNull(),
  status: text('status', {
    enum: ['draft', 'approved', 'executing', 'paused', 'completed', 'failed', 're-optimizing']
  }).notNull().default('draft'),
  currentWaveIndex: integer('current_wave_index').notNull().default(0),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// New table: waves
export const waves = sqliteTable('waves', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  wavePlanId: text('wave_plan_id').notNull().references(() => wavePlans.id, { onDelete: 'cascade' }),
  waveIndex: integer('wave_index').notNull(),
  label: text('label').notNull(),
  maxParallelTasks: integer('max_parallel_tasks').notNull(),
  status: text('status', {
    enum: ['pending', 'dispatching', 'active', 'completed', 'failed', 'skipped']
  }).notNull().default('pending'),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
});

// New table: wave_tasks
export const waveTasks = sqliteTable('wave_tasks', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  waveId: text('wave_id').notNull().references(() => waves.id, { onDelete: 'cascade' }),
  taskId: text('task_id').references(() => tasks.id),
  wavePlanId: text('wave_plan_id').notNull().references(() => wavePlans.id, { onDelete: 'cascade' }),
  waveIndex: integer('wave_index').notNull(),
  taskCode: text('task_code').notNull(),    // e.g. "4.3"
  label: text('label').notNull(),
  description: text('description').notNull().default(''),
  filePaths: text('file_paths', { mode: 'json' }).$type<string[]>().notNull().default([]),
  dependencies: text('dependencies', { mode: 'json' }).$type<string[]>().notNull().default([]),
  isOnCriticalPath: integer('is_on_critical_path', { mode: 'boolean' }).notNull().default(false),
  canRunInParallel: integer('can_run_in_parallel', { mode: 'boolean' }).notNull().default(true),
  status: text('status', {
    enum: ['pending', 'dispatched', 'running', 'completed', 'failed', 'retrying', 'skipped']
  }).notNull().default('pending'),
  assignedSessionId: text('assigned_session_id'),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  errorMessage: text('error_message'),
  retryCount: integer('retry_count').notNull().default(0),
});

// New table: dependency_edges
export const dependencyEdges = sqliteTable('dependency_edges', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  wavePlanId: text('wave_plan_id').notNull().references(() => wavePlans.id, { onDelete: 'cascade' }),
  fromTaskCode: text('from_task_code').notNull(),
  toTaskCode: text('to_task_code').notNull(),
  edgeType: text('edge_type', { enum: ['hard', 'soft'] }).notNull().default('hard'),
});

// New table: wave_plan_metrics
export const wavePlanMetrics = sqliteTable('wave_plan_metrics', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  wavePlanId: text('wave_plan_id').notNull().references(() => wavePlans.id, { onDelete: 'cascade' }),
  totalWallClockMs: integer('total_wall_clock_ms'),
  theoreticalMinMs: integer('theoretical_min_ms'),
  parallelizationEfficiency: real('parallelization_efficiency'),
  wavesExecuted: integer('waves_executed').notNull().default(0),
  tasksCompleted: integer('tasks_completed').notNull().default(0),
  tasksFailed: integer('tasks_failed').notNull().default(0),
  tasksRetried: integer('tasks_retried').notNull().default(0),
  avgTaskDurationMs: integer('avg_task_duration_ms'),
  maxWaveWaitMs: integer('max_wave_wait_ms'),
  fileConflictsAvoided: integer('file_conflicts_avoided').notNull().default(0),
  reOptimizationCount: integer('re_optimization_count').notNull().default(0),
  recordedAt: integer('recorded_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});
```

---

## 5. Plan Optimization Engine

The Plan Optimization Engine is the core of the Wave Planner. It takes a raw plan (from Claude Code Plan Mode or re-optimization) and produces an optimized WavePlan with wave assignments, dependency edges, and critical path annotations.

### 5.1 Pipeline

```
Input: Raw plan text from Claude Code Plan Mode
    │
    ├── 5.2  Prompt Constructor
    │         Builds the structured prompt with fleet context,
    │         spec content, and wave-format instructions
    │
    ├── 5.3  Response Parser
    │         Extracts structured wave/task/dependency data
    │         from Claude's response
    │
    ├── 5.4  DAG Validator
    │         Ensures acyclicity, referential integrity,
    │         file ownership non-overlap within waves
    │
    ├── 5.5  Critical Path Solver
    │         Computes longest path through DAG,
    │         annotates critical path tasks
    │
    ├── 5.6  Wave Assigner
    │         Groups tasks into waves via topological sort,
    │         respects fleet capacity constraints
    │
    └── 5.7  Plan Scorer
              Computes parallelization score, efficiency
              estimates, and confidence signals
```

### 5.2 Prompt Constructor

The Prompt Constructor assembles a structured prompt for Claude Code Plan Mode that instructs it to produce wave-decomposed plans.

**Input context assembled:**
1. **Spec content**: the feature description / horizon item content.
2. **Fleet context**: available workers per repo, in-flight files, active sessions.
3. **Codebase context**: relevant file tree, existing module structure (from code-graph-mcp or file listing).
4. **Constraints**: avoided files, preferred models, max cost, conductor-specified constraints from replan.
5. **Historical context**: memory sessions showing past issues with similar work.

**Prompt template (core instruction block):**

```
You are a technical planning agent. Given the specification below,
produce an implementation plan structured as parallel execution waves.

## Output Format

For each task in the plan, provide:
- Task ID: hierarchical (e.g. "1.1", "4.3")
- Description: what the task implements
- Files: which files/modules it creates or modifies
- Dependencies: list of task IDs that must complete first (empty if none)
- Can Parallel: whether it can run alongside other tasks in the same wave
- Model recommendation: haiku (simple/mechanical), sonnet (moderate), opus (complex/architectural)
- Complexity: S, M, L, or XL

## Wave Structure Rules

1. Group tasks into numbered waves. All tasks in a wave MUST be independent
   of each other (no dependencies between tasks in the same wave).
2. A task belongs to wave N where N = 1 + max(wave of each dependency).
   Tasks with no dependencies go in wave 1.
3. No two tasks in the same wave may modify the same file.
4. Annotate which tasks are on the critical path (longest dependency chain).
5. Identify sequential chains where tasks within a wave must execute in order.

## Required Output Sections

1. **Wave Table**: For each wave, a table with columns:
   Task ID | Description | Files | Dependencies | Parallel? | Model | Complexity

2. **Dependency Graph**: ASCII representation of task dependencies.

3. **Critical Path**: The ordered list of tasks forming the longest chain.

4. **Statistics**:
   - Total tasks
   - Total waves
   - Max parallelism (widest wave)
   - Critical path length
   - Sequential chains (if any)

## Constraints

{constraints_block}

## Fleet Context

{fleet_context_block}

## Specification

{spec_content}
```

**Fleet context block template:**

```
Available workers:
{for each repo}
  - {repo}: {worker_count} workers available
{end}

In-flight files (DO NOT modify these):
{for each in_flight_file}
  - {file_path} (in use by {ticket_id}, ~{estimated_minutes}min remaining)
{end}

Active sessions:
{for each session}
  - {repo}: {ticket_id} — {progress}% complete, ~{remaining}min remaining
{end}
```

### 5.3 Response Parser

The Response Parser extracts structured data from Claude's markdown response. It must handle variability in formatting while enforcing the required structure.

**Parsing strategy:**

1. **Table extraction**: Parse markdown tables for wave definitions. Each table row maps to a `WaveTask`. The parser uses regex patterns to identify table headers and extract cell values.

2. **Dependency graph extraction**: Parse the ASCII dependency graph as supplementary validation — cross-reference against table-declared dependencies.

3. **Critical path extraction**: Extract the ordered task ID list from the critical path section.

4. **Statistics extraction**: Parse the statistics section for validation against computed values.

**Parser output:**

```typescript
interface ParsedWavePlan {
  waves: ParsedWave[];
  dependencyEdges: ParsedEdge[];
  criticalPath: string[];
  statistics: ParsedStatistics;
  rawMarkdown: string;
}

interface ParsedWave {
  waveIndex: number;
  label: string;
  tasks: ParsedTask[];
}

interface ParsedTask {
  taskCode: string;          // "1.1", "4.3"
  description: string;
  filePaths: string[];
  dependencies: string[];
  canRunInParallel: boolean;
  recommendedModel: 'haiku' | 'sonnet' | 'opus';
  complexity: 'S' | 'M' | 'L' | 'XL';
}

interface ParsedEdge {
  from: string;
  to: string;
}

interface ParsedStatistics {
  totalTasks: number;
  totalWaves: number;
  maxParallelism: number;
  criticalPathLength: number;
  sequentialChains: number;
}
```

**Error handling:**
- If the response doesn't contain parseable wave tables, fall back to flat task extraction and run the Wave Assigner to compute waves from dependencies.
- If dependencies reference non-existent tasks, emit a warning and remove the dangling edge.
- If statistics don't match computed values, use computed values and log the discrepancy.

### 5.4 DAG Validator

The DAG Validator ensures the parsed plan forms a valid directed acyclic graph.

**Validations:**

| Check | Action on Failure |
|-------|-------------------|
| Cycle detection (Kahn's algorithm) | Reject plan, report cycle |
| Referential integrity (all dependency IDs exist) | Remove dangling edges, warn |
| File ownership overlap within a wave | Move conflicting task to next wave |
| Root task existence (at least one task with no deps) | Reject plan |
| Connected graph (no orphan subgraphs unless intentional) | Warn |

**Algorithm for cycle detection:**

```
function detectCycles(tasks, edges):
    inDegree = map of taskCode → count of incoming edges
    queue = all tasks with inDegree == 0
    visited = 0

    while queue is not empty:
        task = queue.dequeue()
        visited++
        for each dependent of task:
            inDegree[dependent]--
            if inDegree[dependent] == 0:
                queue.enqueue(dependent)

    if visited != total tasks:
        return CYCLE_DETECTED (remaining tasks form cycle)
    return VALID
```

### 5.5 Critical Path Solver

Computes the longest path through the DAG. Uses a topological-sort-based dynamic programming approach.

**Algorithm:**

```
function computeCriticalPath(tasks, edges):
    topoOrder = topologicalSort(tasks, edges)
    dist = map of taskCode → 0
    prev = map of taskCode → null

    for task in topoOrder:
        for each dependency dep of task:
            if dist[dep] + 1 > dist[task]:
                dist[task] = dist[dep] + 1
                prev[task] = dep

    endTask = argmax(dist)
    path = []
    current = endTask
    while current != null:
        path.prepend(current)
        current = prev[current]

    return path
```

**Output:**
- Ordered list of task codes on the critical path.
- Each task annotated with `isOnCriticalPath: true`.
- Critical path length = number of tasks on the path.

### 5.6 Wave Assigner

Groups tasks into waves based on their dependency depths. A task's wave index is determined by the maximum depth of its dependencies plus one.

**Algorithm:**

```
function assignWaves(tasks, edges):
    depth = map of taskCode → 0

    for task in topologicalSort(tasks, edges):
        for each dependency dep of task:
            depth[task] = max(depth[task], depth[dep] + 1)

    waves = group tasks by depth[task]

    // Validate: no file overlap within a wave
    for each wave:
        fileOwners = map of filePath → taskCode
        for each task in wave:
            for each file in task.filePaths:
                if file in fileOwners:
                    // Bump this task to next wave
                    move task to wave[depth + 1]
                else:
                    fileOwners[file] = task.taskCode

    // Apply fleet capacity constraints
    for each wave:
        if wave.taskCount > fleetCapacity:
            split wave into sub-waves of size <= fleetCapacity

    return waves
```

### 5.7 Plan Scorer

Computes quality metrics for the optimized wave plan.

**Metrics:**

| Metric | Formula | Interpretation |
|--------|---------|----------------|
| Parallelization Score | `1 - (criticalPathLength / totalTasks)` | 0 = fully sequential, 1 = fully parallel |
| Max Parallelism | `max(wave.taskCount for each wave)` | Peak fleet utilization |
| Wave Efficiency | `totalTasks / totalWaves` | Average tasks per wave |
| Dependency Density | `edgeCount / (totalTasks * (totalTasks - 1) / 2)` | How interconnected the plan is |
| File Conflict Score | `conflictsAvoided / potentialConflicts` | How well the plan avoids file contention |

**Confidence signals update:**

The plan scorer updates the existing `ConfidenceSignals` on the parent `Plan`:

```typescript
confidenceSignals.parallelization =
  parallelizationScore > 0.7 ? 'HIGH' :
  parallelizationScore > 0.4 ? 'MEDIUM' : 'LOW';

confidenceSignals.conflictRisk =
  fileConflictScore > 0.9 ? 'LOW' :
  fileConflictScore > 0.6 ? 'MEDIUM' : 'HIGH';
```

---

## 6. Wave Execution Controller

The Wave Execution Controller manages the lifecycle of a WavePlan during execution. It coordinates dispatch, monitors completion, and auto-advances through waves.

### 6.1 State Machine

```
                    ┌─────────┐
                    │  draft  │
                    └────┬────┘
                         │ Conductor approves
                         ▼
                    ┌──────────┐
          ┌────────│ approved │
          │        └────┬─────┘
          │             │ dispatch wave 1
          │             ▼
          │        ┌───────────┐
          │   ┌───►│ executing │◄────────────┐
          │   │    └─────┬─────┘             │
          │   │          │                   │
          │   │    ┌─────┴─────┐             │
          │   │    │           │             │
          │   │    ▼           ▼             │
          │   │ ┌────────┐ ┌────────┐       │
          │   │ │ paused │ │ failed │       │
          │   │ └───┬────┘ └────────┘       │
          │   │     │ resume                 │
          │   │     └────────────────────────┘
          │   │
          │   │  re-optimize
          │   │    ┌───────────────┐
          │   └────│re-optimizing  │
          │        └───────────────┘
          │
          │  all waves complete
          ▼
     ┌───────────┐
     │ completed │
     └───────────┘
```

### 6.2 Wave Dispatch Coordinator

When a wave is ready to dispatch, the coordinator:

1. **Checks fleet capacity**: queries available workers per repo.
2. **Validates file availability**: ensures no task's files are in-flight from external sessions.
3. **Creates dispatch requests**: one per task in the wave, each containing:
   - Task description and context
   - File scope (files the task should modify)
   - Model assignment (haiku/sonnet/opus)
   - Dependency context (summaries of completed predecessor tasks)
4. **Dispatches tasks**: sends up to `maxConcurrentSubagents` (configurable, default 4) tasks simultaneously via the existing `OrchestratorService`.
5. **If wave has more tasks than capacity**: dispatches in batches. When a task completes, the next pending task in the wave dispatches immediately.

**Dispatch request construction:**

```typescript
interface WaveDispatchRequest {
  wavePlanId: string;
  waveIndex: number;
  taskCode: string;
  taskDescription: string;
  fileScope: string[];
  model: 'haiku' | 'sonnet' | 'opus';
  predecessorContext: PredecessorSummary[];
  constraints: string[];
}

interface PredecessorSummary {
  taskCode: string;
  description: string;
  filesModified: string[];
  completionSummary: string;
}
```

### 6.3 Completion Listener

Listens for task completion events from the OrchestratorService and updates wave state.

**On task completion:**

```
1. Update WaveTask status → 'completed'
2. Record completion timestamp and metrics
3. Check: are all tasks in this wave complete?
   ├── YES: mark wave as 'completed', trigger auto-advance
   └── NO: if capacity available, dispatch next pending task in wave
4. Update WavePlan progress metrics
5. Emit SSE event: { type: 'wave_task_complete', ... }
```

**On task failure:**

```
1. Check retry policy (default: 1 retry)
   ├── Retries remaining: mark task 'retrying', re-dispatch
   └── No retries: mark task 'failed'
2. Check wave failure policy:
   ├── 'halt_on_failure' (default): mark wave 'failed', pause plan
   └── 'continue_on_failure': skip failed task, continue wave
3. If wave failed and plan paused:
   - Emit SSE: { type: 'wave_failed', ... }
   - Conductor must decide: re-optimize, skip task, or abort
```

### 6.4 Auto-Advance Logic

When a wave completes, the controller automatically advances to the next wave.

```typescript
async function onWaveComplete(wavePlanId: string, completedWaveIndex: number) {
  const wavePlan = await getWavePlan(wavePlanId);
  const nextWaveIndex = completedWaveIndex + 1;

  if (nextWaveIndex >= wavePlan.totalWaves) {
    await markWavePlanComplete(wavePlanId);
    await collectFinalMetrics(wavePlanId);
    await emitEvent({ type: 'wave_plan_complete', wavePlanId });
    return;
  }

  await updateWavePlan(wavePlanId, {
    currentWaveIndex: nextWaveIndex,
  });

  await emitEvent({
    type: 'wave_advance',
    wavePlanId,
    fromWave: completedWaveIndex,
    toWave: nextWaveIndex,
  });

  await dispatchWave(wavePlanId, nextWaveIndex);
}
```

### 6.5 Concurrency Control

The Wave Execution Controller respects fleet capacity limits:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `maxConcurrentSubagents` | 4 | Max tasks dispatched simultaneously within a wave |
| `maxTotalActiveTasks` | 8 | Max tasks active across all wave plans |
| `subagentDispatchDelayMs` | 500 | Stagger between dispatches to avoid thundering herd |
| `waveAdvanceDelayMs` | 2000 | Cooldown between wave completion and next wave dispatch |

---

## 7. Storage & Persistence

### 7.1 Write Path

**On plan generation (WavePlan creation):**

```
1. Parse Claude response → ParsedWavePlan
2. Validate DAG
3. Compute critical path
4. Assign waves
5. Score plan
6. BEGIN TRANSACTION
   a. Insert WavePlan row
   b. Insert Wave rows (one per wave)
   c. Insert WaveTask rows (one per task)
   d. Insert DependencyEdge rows
   e. Update parent Plan with confidence signals
   f. Initialize WavePlanMetrics row
7. COMMIT
```

**On wave/task state changes:**

```
1. Update WaveTask status + timestamps
2. If wave complete: update Wave status + timestamps
3. If plan complete: update WavePlan status + timestamps
4. Update WavePlanMetrics incrementally
```

### 7.2 Read Path

**Wave plan for review:**

```sql
SELECT wp.*, w.*, wt.*
FROM wave_plans wp
JOIN waves w ON w.wave_plan_id = wp.id
JOIN wave_tasks wt ON wt.wave_id = w.id
WHERE wp.horizon_item_id = ?
ORDER BY w.wave_index, wt.task_code;
```

**Active wave status:**

```sql
SELECT w.*, wt.*
FROM waves w
JOIN wave_tasks wt ON wt.wave_id = w.id
WHERE w.wave_plan_id = ? AND w.status IN ('dispatching', 'active')
ORDER BY wt.task_code;
```

**Critical path progress:**

```sql
SELECT wt.task_code, wt.status, wt.is_on_critical_path
FROM wave_tasks wt
WHERE wt.wave_plan_id = ? AND wt.is_on_critical_path = true
ORDER BY wt.wave_index, wt.task_code;
```

### 7.3 Plan Versioning

When a plan is re-optimized, the previous WavePlan is soft-deleted (status set to `'replaced'`) and a new WavePlan is created with an incremented version. The relationship is tracked via:

```typescript
// Added to wavePlans table
previousWavePlanId: text('previous_wave_plan_id')
  .references(() => wavePlans.id),
version: integer('version').notNull().default(1),
```

This enables the Plan Diff View (existing UI) to show wave-level diffs between plan versions.

---

## 8. Plan Update & Re-Optimization

### 8.1 Triggers for Re-Optimization

| Trigger | Source | Behavior |
|---------|--------|----------|
| Conductor requests replan | UI "Re-plan" button | Pause execution, re-optimize remaining waves |
| File conflict detected | Completion listener | Re-optimize remaining waves avoiding conflicting files |
| Task failure exhausts retries | Completion listener | Pause, suggest re-optimization |
| Fleet capacity changes | Fleet state monitor | Re-optimize remaining waves with new capacity |
| Conductor edits task | Inline task edit | Re-validate DAG, re-compute critical path |

### 8.2 Mid-Execution Re-Optimization

When re-optimization is triggered during execution:

1. **Pause**: mark WavePlan status `'re-optimizing'`. Do not dispatch new tasks. Let in-progress tasks complete.
2. **Snapshot**: capture completed waves/tasks and their outputs.
3. **Rebuild context**: construct a new prompt that includes:
   - Original spec
   - Completed tasks and their outputs (predecessor context)
   - Remaining uncompleted tasks from the current plan
   - New constraints (the trigger reason)
   - Updated fleet context
4. **Generate new plan**: call Claude Code Plan Mode with the updated prompt.
5. **Merge**: the new plan covers only remaining work. Completed waves are preserved. New waves are numbered starting from `currentWaveIndex + 1`.
6. **Replace**: create a new WavePlan version linked to the previous one.
7. **Resume**: set status to `'executing'`, dispatch next wave.

**Re-optimization prompt addendum:**

```
## Completed Work (DO NOT re-plan these)

The following tasks have already been completed:
{for each completed task}
  - {taskCode}: {description} — COMPLETED
    Files modified: {filePaths}
    Summary: {completionSummary}
{end}

## Remaining Work (RE-PLAN from here)

The following tasks from the original plan have NOT been started:
{for each remaining task}
  - {taskCode}: {description}
    Original dependencies: {dependencies}
    Original files: {filePaths}
{end}

## New Constraints

{constraint_description}

Re-plan ONLY the remaining work. Produce new wave assignments
starting from Wave {currentWaveIndex + 1}. Preserve completed
task IDs as valid dependency targets.
```

### 8.3 Conductor-Initiated Edits

The Conductor can edit individual tasks within a wave plan:

| Edit | System Response |
|------|-----------------|
| Change task model | Update task, re-compute cost estimates |
| Change task complexity | Update task, re-compute cost estimates |
| Add task dependency | Re-validate DAG, potentially move task to later wave |
| Remove task dependency | Re-validate DAG, potentially move task to earlier wave |
| Add new task | Insert task, re-compute waves, re-compute critical path |
| Remove task | Remove task and outgoing edges, re-compute waves |
| Reorder tasks within wave | No-op (wave tasks are unordered by definition) |
| Split task | Replace task with N sub-tasks, re-compute waves |

After any edit, the system:
1. Re-validates the DAG.
2. Re-computes the critical path.
3. Re-assigns waves if topology changed.
4. Re-scores the plan.
5. Persists the updated WavePlan (in-place for minor edits, new version for structural changes).

---

## 9. Integration with Existing Systems

### 9.1 Plan Generation Route (`/api/items/[id]/plan/generate`)

**Current**: calls `generateMockWorkstreams()`, creates Plan with flat workstreams/tasks.

**New**: after creating the Plan, additionally:
1. Call the Wave Plan Optimizer with the spec content and fleet context.
2. Parse and validate the response.
3. Create the WavePlan, Waves, WaveTasks, and DependencyEdges.
4. Update the Plan's `confidenceSignals` with parallelization metrics.
5. Return the WavePlan alongside the Plan in the response.

**Fallback**: if Wave Plan Optimizer fails (parse error, invalid DAG), the existing flat plan is preserved. The WavePlan is created as a single wave containing all tasks (degraded mode).

### 9.2 Orchestrator Service (`packages/core/src/orchestrator`)

**Current**: dispatches a single job per horizon item.

**New**: the Wave Execution Controller sits between the Plan Review approval and the OrchestratorService. Instead of dispatching one job, it dispatches multiple jobs (one per task in the current wave) and manages the wave lifecycle.

**Interface additions to OrchestratorService:**

```typescript
interface IOrchestratorAdapter {
  // Existing
  dispatch(request: DispatchRequest): Promise<DispatchResponse>;
  getStatus(sessionId: string): Promise<JobStatus>;
  cancel(sessionId: string): Promise<void>;

  // New
  dispatchBatch(requests: DispatchRequest[]): Promise<DispatchResponse[]>;
  getStatusBatch(sessionIds: string[]): Promise<JobStatus[]>;
}
```

### 9.3 Status Poller (`packages/core/src/orchestrator/status-poller.ts`)

**Current**: polls individual sessions.

**New**: additionally tracks wave-level aggregation. When a polled session completes, check if its wave is complete and trigger auto-advance.

### 9.4 Fleet State (`/api/fleet/state`)

**Current**: returns sessions, runway, conductor score.

**New**: additionally includes active wave plans:

```typescript
interface FleetState {
  // Existing fields...

  // New
  activeWavePlans: WavePlanSummary[];
}

interface WavePlanSummary {
  wavePlanId: string;
  horizonItemId: string;
  itemTitle: string;
  status: WavePlanStatus;
  currentWaveIndex: number;
  totalWaves: number;
  progress: number;                  // 0-100, tasks completed / total tasks
  activeTaskCount: number;
  criticalPathProgress: number;      // 0-100, critical path tasks completed
}
```

### 9.5 SSE Events (`/api/events/stream`)

**New event types:**

```typescript
type FleetUpdate =
  // Existing types...

  // New wave-related events
  | { type: 'wave_plan_created'; wavePlanId: string; itemId: string; totalWaves: number }
  | { type: 'wave_dispatching'; wavePlanId: string; waveIndex: number; taskCount: number }
  | { type: 'wave_task_dispatched'; wavePlanId: string; taskCode: string; sessionId: string }
  | { type: 'wave_task_complete'; wavePlanId: string; taskCode: string; waveIndex: number }
  | { type: 'wave_task_failed'; wavePlanId: string; taskCode: string; error: string }
  | { type: 'wave_complete'; wavePlanId: string; waveIndex: number; nextWaveIndex: number | null }
  | { type: 'wave_advance'; wavePlanId: string; fromWave: number; toWave: number }
  | { type: 'wave_plan_complete'; wavePlanId: string; metrics: WavePlanMetrics }
  | { type: 'wave_plan_failed'; wavePlanId: string; failedWave: number; failedTask: string }
  | { type: 'wave_plan_reoptimizing'; wavePlanId: string; reason: string };
```

### 9.6 Conductor Score

**New scoring dimension** added to `ConductorScore`:

```typescript
interface ConductorScore {
  // Existing
  total: number;
  fleetUtilization: number;
  runwayHealth: number;
  planAccuracy: number;
  costEfficiency: number;
  velocityTrend: number;

  // New
  parallelizationQuality: number;    // 0–150, bonus dimension
}
```

**Parallelization Quality scoring:**

| Factor | Weight | Measurement |
|--------|--------|-------------|
| Avg parallelization score across plans | 50 | Higher = more parallel plans |
| Critical path efficiency | 50 | Shorter critical paths relative to total tasks |
| Wave utilization | 50 | How fully each wave uses available fleet capacity |

### 9.7 Benchmark Suite Integration

The existing `WavePlan` type in `spec/BENCHMARK-SUITE.md` aligns with this spec's `WavePlan`. The benchmark suite should use the Wave Planner's output directly:

```typescript
interface BenchmarkScenarioResult {
  // Existing fields...

  // New
  wavePlan: WavePlan;               // the optimized plan used for this run
  wavePlanMetrics: WavePlanMetrics;  // execution metrics
  parallelizationScore: number;      // from plan scorer
}
```

---

## 10. API Surface

### 10.1 New Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/items/[id]/wave-plan/generate` | Generate optimized wave plan for an item |
| GET | `/api/items/[id]/wave-plan` | Get the current wave plan for an item |
| GET | `/api/items/[id]/wave-plan/history` | Get all wave plan versions for an item |
| PATCH | `/api/items/[id]/wave-plan/status` | Update wave plan status (approve, pause, resume) |
| POST | `/api/items/[id]/wave-plan/reoptimize` | Trigger re-optimization with constraints |
| GET | `/api/items/[id]/wave-plan/critical-path` | Get critical path with progress |
| PATCH | `/api/wave-tasks/[taskId]` | Update a wave task (model, complexity, deps) |
| POST | `/api/wave-plans/[planId]/dispatch` | Dispatch the next wave |
| GET | `/api/wave-plans/[planId]/metrics` | Get execution metrics |
| GET | `/api/wave-plans/active` | List all active wave plans |

### 10.2 Route Specifications

#### POST `/api/items/[id]/wave-plan/generate`

**Request:**

```typescript
{
  specContent?: string;              // override spec content (for replan)
  constraints?: string[];            // additional constraints
  maxConcurrency?: number;           // override max parallel tasks per wave
}
```

**Response:**

```typescript
{
  wavePlan: WavePlan;
  waves: Wave[];
  tasks: WaveTask[];
  dependencyEdges: DependencyEdge[];
  criticalPath: string[];
  statistics: {
    totalTasks: number;
    totalWaves: number;
    maxParallelism: number;
    criticalPathLength: number;
    parallelizationScore: number;
  };
}
```

#### PATCH `/api/items/[id]/wave-plan/status`

**Request:**

```typescript
{
  action: 'approve' | 'pause' | 'resume' | 'abort';
}
```

**Behavior:**
- `approve`: transitions `draft` → `approved`, dispatches wave 1.
- `pause`: transitions `executing` → `paused`, stops dispatching new tasks.
- `resume`: transitions `paused` → `executing`, dispatches next pending wave.
- `abort`: transitions any active state → `failed`, cancels all running tasks.

#### POST `/api/items/[id]/wave-plan/reoptimize`

**Request:**

```typescript
{
  constraint: string;                // human-readable constraint
  avoidFiles?: string[];
  preserveCompletedWork: boolean;    // default true
}
```

**Response:** same as generate, but with only remaining waves.

---

## 11. UI Additions

### 11.1 Wave Progress Visualization

Added to the `PlanReviewCard` (existing component) when a WavePlan exists:

```
┌─────────────────────────────────────────────────────────────┐
│ ENG-394 · Multi-touch Attribution Modeling                  │
│ Wave Plan: 13 waves · 47 tasks · Critical Path: 15 tasks   │
│                                                             │
│ WAVE 1  ███████████ COMPLETE                                │
│ WAVE 2  ███████░░░░ 3/5 tasks                               │
│ WAVE 3  ░░░░░░░░░░ pending                                  │
│ WAVE 4  ░░░░░░░░░░ pending (8 tasks)                        │
│ ...                                                         │
│                                                             │
│ Critical Path: ████░░░░░░░░░░░ 4/15 tasks complete          │
│                                                             │
│                        [Pause ⏸] [Re-optimize ↺] [View DAG]│
└─────────────────────────────────────────────────────────────┘
```

### 11.2 Wave Table View

Expanded view showing all waves and their tasks:

```
┌──────────────────────────────────────────────────────────────────┐
│ WAVE 2: Foundation Layer (5 tasks, all parallel)                 │
├──────────────────────────────────────────────────────────────────┤
│ [Sonnet] 2.1  TypeScript interfaces        src/types.ts      ● ✓│
│ [Haiku]  2.2  Environment config           src/config.ts     ● ✓│
│ [Haiku]  2.3  Structured logger            src/utils/log.ts  ● ▶│
│ [Haiku]  2.4  Temp file management         src/utils/temp.ts ○  │
│ [Sonnet] 2.5  Easing function library      src/easing.ts     ○  │
├──────────────────────────────────────────────────────────────────┤
│ ● = on critical path   ✓ = complete   ▶ = running   ○ = pending │
└──────────────────────────────────────────────────────────────────┘
```

### 11.3 Dependency Graph Visualization

A DAG visualization (using a library like dagre or d3-dag) showing task nodes, dependency edges, and critical path highlighting. Accessible via the [View DAG] button.

**Node states:**
- Gray: pending
- Blue: running
- Green: complete
- Red: failed
- Gold border: on critical path

**Edge styles:**
- Solid: hard dependency
- Dashed: soft dependency
- Bold: critical path edge

### 11.4 Wave Status in Fleet Summary

The top bar Fleet Summary Pills are extended to show wave progress:

```
[ ng-pipelines ████░ W3/13 78% ]  [ ng-core ██░░░ W1/4 42% ]
```

### 11.5 Activity Feed Events

New event types rendered in the Activity Feed:

```
14:32  [ng-pipelines] Wave 3 complete — 4/4 tasks done, advancing to Wave 4
14:30  [ng-pipelines] Task 3.2 complete — easing unit tests passed
14:28  [ng-pipelines] Wave 3 dispatched — 4 parallel tasks
14:27  [ng-pipelines] Wave Plan optimized: 13 waves, 47 tasks, score 0.87
```

---

## 12. Prompt Engineering

### 12.1 Prompt Quality Dimensions

The quality of the wave plan depends heavily on prompt construction. Key dimensions:

| Dimension | Goal | Technique |
|-----------|------|-----------|
| Task granularity | Tasks should be small enough to parallelize but large enough to be coherent | Include file-level scope guidance in the prompt |
| Dependency precision | Dependencies should be minimal (only true data/control dependencies) | Instruct Claude to prefer independence, only add deps when outputs are consumed |
| File scope clarity | Each task should have non-overlapping file ownership | Provide the file tree and instruct non-overlap |
| Model routing accuracy | Correct model assignment reduces cost | Provide model capability descriptions and cost guidance |
| Wave compactness | Fewer waves = less sequential waiting | Instruct Claude to minimize wave count |

### 12.2 Iterative Refinement

If the initial plan has poor parallelization (score < 0.3), the system can make a second call to Claude:

```
The plan you generated has a parallelization score of {score},
which is below target (0.5). The critical path is {length} tasks
out of {total} total tasks.

Please restructure the plan to increase parallelism:
1. Break large tasks into smaller independent subtasks
2. Reduce unnecessary dependencies
3. Identify tasks that can start earlier with partial inputs
4. Consider splitting files that create dependency bottlenecks

Current plan:
{current_plan}
```

### 12.3 Few-Shot Examples

The prompt includes a condensed example of a well-structured wave plan (the example from the user's prompt) to guide Claude's output format. This is stored as a prompt template, not hardcoded.

---

## 13. Metrics & Observability

### 13.1 Plan Generation Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `wave_plan.generation_duration_ms` | histogram | Time to generate and optimize a wave plan |
| `wave_plan.parse_success_rate` | counter | Successful parses vs total attempts |
| `wave_plan.dag_validation_failures` | counter | Plans rejected for cycle or integrity issues |
| `wave_plan.parallelization_score` | histogram | Distribution of plan parallelization scores |
| `wave_plan.total_waves` | histogram | Distribution of wave counts per plan |
| `wave_plan.critical_path_length` | histogram | Distribution of critical path lengths |
| `wave_plan.iterative_refinement_rate` | counter | Plans that needed a second optimization pass |

### 13.2 Execution Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `wave.dispatch_duration_ms` | histogram | Time to dispatch all tasks in a wave |
| `wave.execution_duration_ms` | histogram | Time from first task dispatch to wave completion |
| `wave.idle_wait_ms` | histogram | Time between last task completion and wave completion (fleet idle time) |
| `wave_task.duration_ms` | histogram | Individual task execution time |
| `wave_task.retry_count` | counter | Task retries |
| `wave_task.failure_rate` | counter | Task failures |
| `wave_plan.total_duration_ms` | histogram | Total plan execution time |
| `wave_plan.auto_advance_count` | counter | Successful auto-advances between waves |
| `wave_plan.reoptimization_count` | counter | Mid-execution re-optimizations |

### 13.3 Dashboard Queries

**Plan quality over time:**

```sql
SELECT
  DATE(wp.created_at) as day,
  AVG(wp.parallelization_score) as avg_score,
  AVG(wp.critical_path_length) as avg_critical_path,
  AVG(wp.max_parallelism) as avg_max_parallel
FROM wave_plans wp
WHERE wp.status = 'completed'
GROUP BY DATE(wp.created_at)
ORDER BY day;
```

**Execution efficiency:**

```sql
SELECT
  wpm.wave_plan_id,
  wpm.total_wall_clock_ms,
  wpm.theoretical_min_ms,
  wpm.parallelization_efficiency,
  wpm.tasks_completed,
  wpm.tasks_failed
FROM wave_plan_metrics wpm
ORDER BY wpm.recorded_at DESC
LIMIT 20;
```

---

## 14. Configuration

### 14.1 Environment Variables

```bash
# Wave Planner
WAVE_PLANNER_ENABLED=true
WAVE_PLANNER_MAX_CONCURRENCY=4          # max parallel tasks per wave dispatch
WAVE_PLANNER_MAX_TOTAL_ACTIVE=8         # max active tasks across all plans
WAVE_PLANNER_DISPATCH_DELAY_MS=500      # stagger between dispatches
WAVE_PLANNER_ADVANCE_DELAY_MS=2000      # cooldown between waves
WAVE_PLANNER_RETRY_LIMIT=1              # max retries per failed task
WAVE_PLANNER_FAILURE_POLICY=halt        # halt | continue
WAVE_PLANNER_AUTO_ADVANCE=true          # auto-dispatch next wave on completion
WAVE_PLANNER_MIN_PARALLELIZATION=0.3    # trigger iterative refinement below this
WAVE_PLANNER_PROMPT_TEMPLATE=default    # prompt template name

# AI Provider (for plan generation)
ANTHROPIC_API_KEY=                       # existing
WAVE_PLANNER_MODEL=claude-sonnet-4-20250514       # model for plan generation
WAVE_PLANNER_MAX_TOKENS=8192            # max response tokens
```

### 14.2 Runtime Configuration

Stored in the database, editable by the Conductor:

```typescript
interface WavePlannerConfig {
  maxConcurrentSubagents: number;
  autoAdvance: boolean;
  failurePolicy: 'halt' | 'continue';
  retryLimit: number;
  minParallelizationScore: number;
  defaultModel: 'haiku' | 'sonnet' | 'opus';
  promptTemplate: string;
}
```

---

## 15. Error Handling & Recovery

### 15.1 Plan Generation Errors

| Error | Cause | Recovery |
|-------|-------|----------|
| Claude API timeout | Network / rate limit | Retry with exponential backoff (3 attempts) |
| Unparseable response | Claude output doesn't match expected format | Fall back to flat plan (single wave, all tasks) |
| DAG cycle detected | Claude generated circular dependencies | Remove the smallest set of edges to break cycles, warn Conductor |
| File overlap in wave | Two tasks in same wave touch same file | Move one task to next wave, re-score |
| Empty plan | Claude returned no tasks | Retry with simplified prompt, then fail to Conductor |

### 15.2 Execution Errors

| Error | Cause | Recovery |
|-------|-------|----------|
| Task dispatch failure | Orchestrator unavailable | Retry dispatch with backoff, pause wave after 3 failures |
| Task timeout | Agent stuck | Cancel task, mark failed, apply failure policy |
| Fleet capacity exhausted | All workers busy | Queue remaining tasks, dispatch as workers free up |
| Mid-wave file conflict | External session locked a file | Pause affected task, re-check after conflict clears |
| Database write failure | SQLite contention | Retry with write-ahead logging, serialize wave state updates |

### 15.3 Recovery Procedures

**Plan generation recovery:**

```
1. On first failure: retry with same prompt
2. On second failure: retry with simplified prompt (fewer constraints)
3. On third failure: generate flat plan (single wave) and warn Conductor
4. Log all failures with full prompt/response for debugging
```

**Execution recovery (wave failure):**

```
1. Pause WavePlan (status → 'paused')
2. Cancel any in-progress tasks in the failed wave
3. Notify Conductor via SSE event
4. Present options in UI:
   a. Retry failed task(s)
   b. Skip failed task(s) and advance
   c. Re-optimize remaining waves
   d. Abort entire plan
5. On Conductor action: resume execution
```

---

## 16. Acceptance Criteria

### 16.1 Plan Generation

| Criterion | Pass Condition |
|-----------|----------------|
| Wave plan generation | Given a spec, generates a WavePlan with >= 2 waves |
| DAG validity | All generated plans pass cycle detection |
| File ownership | No two tasks in the same wave modify the same file |
| Critical path | Critical path is correctly computed and annotated |
| Parallelization score | Average score > 0.4 across 10 diverse specs |
| Parse reliability | > 95% of Claude responses parse successfully |
| Fallback | When parsing fails, flat plan is created successfully |

### 16.2 Execution

| Criterion | Pass Condition |
|-----------|----------------|
| Wave dispatch | All tasks in a wave dispatch within 5s of wave activation |
| Auto-advance | On wave completion, next wave dispatches within `advanceDelayMs` |
| Task completion tracking | Task completion events update WaveTask status within 1s |
| Failure handling | Failed task triggers pause within 2s |
| Re-optimization | Re-optimized plan preserves completed work |
| Concurrent plans | System handles >= 3 active WavePlans simultaneously |

### 16.3 Storage

| Criterion | Pass Condition |
|-----------|----------------|
| Persistence | WavePlan survives server restart |
| Versioning | Re-optimized plans create new versions with backlink |
| Metrics | All execution metrics recorded accurately |
| Query performance | Wave plan read queries complete in < 50ms |

### 16.4 UI

| Criterion | Pass Condition |
|-----------|----------------|
| Wave progress | Current wave and task status visible without navigation |
| Critical path | Critical path tasks visually distinguishable |
| DAG view | Dependency graph renders correctly for plans with > 30 tasks |
| Real-time updates | SSE events update wave progress within 2s |

---

## 17. Implementation Plan

### Phase 1 — Data Model & Core Engine (Week 1)

**Goal:** Wave Plan data model in the database, plan optimization pipeline functional with mock/test inputs.

- [ ] Add `wavePlans`, `waves`, `waveTasks`, `dependencyEdges`, `wavePlanMetrics` tables to Drizzle schema
- [ ] Create migration
- [ ] Implement `ResponseParser` — extract waves, tasks, deps from markdown
- [ ] Implement `DAGValidator` — cycle detection, referential integrity, file overlap
- [ ] Implement `CriticalPathSolver` — longest path computation
- [ ] Implement `WaveAssigner` — topological sort, wave grouping, capacity splitting
- [ ] Implement `PlanScorer` — parallelization score, confidence signals
- [ ] Unit tests for all engine components

**Files:**
- `packages/core/src/db/schema/wave-planner.ts`
- `packages/core/src/wave-planner/parser.ts`
- `packages/core/src/wave-planner/dag-validator.ts`
- `packages/core/src/wave-planner/critical-path.ts`
- `packages/core/src/wave-planner/wave-assigner.ts`
- `packages/core/src/wave-planner/plan-scorer.ts`
- `packages/core/src/wave-planner/index.ts`
- `packages/core/src/wave-planner/types.ts`

### Phase 2 — Prompt Construction & AI Integration (Week 2)

**Goal:** End-to-end plan generation via Claude Code Plan Mode, producing validated WavePlans.

- [ ] Implement `PromptConstructor` — fleet context assembly, template rendering
- [ ] Create prompt templates (default, simplified, refinement)
- [ ] Implement Claude API integration for plan generation
- [ ] Implement iterative refinement (second pass for low-quality plans)
- [ ] Implement fallback logic (flat plan on parse failure)
- [ ] Wire into existing `/api/items/[id]/plan/generate` route
- [ ] Create `/api/items/[id]/wave-plan/generate` route
- [ ] Integration tests with real Claude API calls

**Files:**
- `packages/core/src/wave-planner/prompt-constructor.ts`
- `packages/core/src/wave-planner/prompt-templates/default.ts`
- `packages/core/src/wave-planner/prompt-templates/simplified.ts`
- `packages/core/src/wave-planner/prompt-templates/refinement.ts`
- `packages/core/src/wave-planner/ai-client.ts`
- `src/app/api/items/[id]/wave-plan/generate/route.ts`

### Phase 3 — Wave Execution Controller (Week 3)

**Goal:** Wave-by-wave execution with auto-advance, failure handling, and concurrency control.

- [ ] Implement `WaveExecutionController` state machine
- [ ] Implement `WaveDispatchCoordinator` — batch dispatch, capacity management
- [ ] Implement `CompletionListener` — task/wave completion handling
- [ ] Implement auto-advance logic
- [ ] Add `dispatchBatch` to `OrchestratorService`
- [ ] Wire completion events from `StatusPoller` into `CompletionListener`
- [ ] Implement failure handling and retry logic
- [ ] Add new SSE event types for wave lifecycle
- [ ] Create API routes: `/api/wave-plans/[planId]/dispatch`, status updates
- [ ] Integration tests for wave execution flow

**Files:**
- `packages/core/src/wave-planner/execution/controller.ts`
- `packages/core/src/wave-planner/execution/dispatch-coordinator.ts`
- `packages/core/src/wave-planner/execution/completion-listener.ts`
- `packages/core/src/wave-planner/execution/auto-advance.ts`
- `src/app/api/wave-plans/[planId]/dispatch/route.ts`
- `src/app/api/items/[id]/wave-plan/status/route.ts`

### Phase 4 — Re-Optimization & Editing (Week 4)

**Goal:** Conductor can re-optimize plans mid-execution and edit individual tasks/dependencies.

- [ ] Implement mid-execution re-optimization flow
- [ ] Implement plan version chaining (previous plan backlink)
- [ ] Implement Conductor edit handlers (model, complexity, deps, add/remove tasks)
- [ ] Re-validation and re-computation on edit
- [ ] Create `/api/items/[id]/wave-plan/reoptimize` route
- [ ] Create `/api/wave-tasks/[taskId]` PATCH route
- [ ] Wave plan diff computation (for UI diff view)
- [ ] Integration tests for re-optimization flows

**Files:**
- `packages/core/src/wave-planner/reoptimizer.ts`
- `packages/core/src/wave-planner/editor.ts`
- `packages/core/src/wave-planner/differ.ts`
- `src/app/api/items/[id]/wave-plan/reoptimize/route.ts`
- `src/app/api/wave-tasks/[taskId]/route.ts`

### Phase 5 — UI Integration (Week 5)

**Goal:** Wave progress, DAG visualization, and real-time updates in the DevPilot UI.

- [ ] `WaveProgressBar` component — per-wave progress in PlanReviewCard
- [ ] `WaveTableView` component — expanded wave/task table
- [ ] `CriticalPathIndicator` component — progress along critical path
- [ ] `DAGVisualization` component — interactive dependency graph
- [ ] Extend `PlanReviewCard` with wave plan overlay
- [ ] Extend `FleetSummaryPills` with wave progress
- [ ] Add wave events to `ActivityFeed`
- [ ] SSE subscription for wave lifecycle events in Zustand store
- [ ] Wave plan approve/pause/resume controls

**Files:**
- `src/components/wave-planner/WaveProgressBar.tsx`
- `src/components/wave-planner/WaveTableView.tsx`
- `src/components/wave-planner/CriticalPathIndicator.tsx`
- `src/components/wave-planner/DAGVisualization.tsx`
- `src/components/plan/PlanReviewCard.tsx` (extend)
- `src/components/fleet/FleetSummaryPills.tsx` (extend)
- `src/components/activity/ActivityFeed.tsx` (extend)
- `src/stores/horizonStore.ts` (extend)

### Phase 6 — Metrics, Scoring & Benchmark Integration (Week 6)

**Goal:** Full observability, Conductor Score integration, and benchmark suite compatibility.

- [ ] Implement `WavePlanMetrics` collection
- [ ] Add `parallelizationQuality` to Conductor Score computation
- [ ] Create `/api/wave-plans/[planId]/metrics` route
- [ ] Dashboard queries for plan quality trends
- [ ] Integrate WavePlan output with Benchmark Suite `ScenarioResult`
- [ ] Create scoring formulas for benchmark wave plan quality dimension
- [ ] End-to-end integration tests
- [ ] Performance benchmarks for plan generation and execution

**Files:**
- `packages/core/src/wave-planner/metrics-collector.ts`
- `src/app/api/wave-plans/[planId]/metrics/route.ts`
- `packages/core/src/score/wave-scoring.ts` (extend scoring)

---

## Appendix A: Example Wave Plan Output

The following is a representative example of the structured output expected from Claude Code Plan Mode when given a well-constructed prompt:

```
## Wave 1: Project Bootstrap (1 task)

| Task ID | Description                          | Files                          | Dependencies | Parallel? | Model  | Complexity |
|---------|--------------------------------------|--------------------------------|--------------|-----------|--------|------------|
| 1.1     | Initialize project with dependencies | package.json, tsconfig.json    | None         | Yes       | Haiku  | S          |

## Wave 2: Foundation Layer (5 tasks, all parallel)

| Task ID | Description                    | Files               | Dependencies | Parallel? | Model  | Complexity |
|---------|--------------------------------|---------------------|--------------|-----------|--------|------------|
| 2.1     | TypeScript interfaces          | src/types.ts        | 1.1          | Yes       | Sonnet | M          |
| 2.2     | Environment variable loading   | src/config.ts       | 1.1          | Yes       | Haiku  | S          |
| 2.3     | Structured JSON logger         | src/utils/logger.ts | 1.1          | Yes       | Haiku  | S          |
| 2.4     | Temp file management           | src/utils/temp.ts   | 1.1          | Yes       | Haiku  | S          |
| 2.5     | Easing function library        | src/easing.ts       | 1.1          | Yes       | Sonnet | M          |

## Critical Path

1.1 → 2.1 → 3.1 → 6.1 → 7.1 → 8.1 → 9.1 → 9.2 → 9.3

## Statistics

| Metric                | Value |
|-----------------------|-------|
| Total Tasks           | 47    |
| Total Waves           | 13    |
| Max Parallel (Wave 4) | 8     |
| Critical Path Length  | 9     |
| Sequential Chains     | 1     |
```

---

## Appendix B: Glossary

| Term | Definition |
|------|------------|
| **Wave** | A group of independent tasks that can execute concurrently |
| **Wave Plan** | An optimized execution plan organized into sequential waves |
| **DAG** | Directed Acyclic Graph — the dependency structure between tasks |
| **Critical Path** | The longest chain of dependent tasks, determining minimum execution time |
| **Parallelization Score** | 0–1 metric measuring how parallelizable a plan is |
| **Auto-Advance** | Automatic dispatch of the next wave when the current wave completes |
| **Re-Optimization** | Regenerating the wave plan mid-execution to account for new constraints |
| **File Ownership** | The assignment of files to specific tasks, enforcing non-overlap within waves |
| **Wave Dispatch** | The process of sending all tasks in a wave to the agent fleet for execution |
| **Predecessor Context** | Summaries of completed tasks provided to dependent tasks for continuity |

---

*DevPilot Wave Planner Specification · v1.0 · Open Conjecture · March 2026*
