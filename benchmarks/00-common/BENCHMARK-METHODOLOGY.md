# DevPilot Benchmark Methodology

## Purpose

These benchmark PRDs are designed to evaluate and optimize DevPilot's planning intelligence — specifically how it decomposes complex build tasks into waves, sequences dependencies, constructs Claude Code prompts, and orchestrates parallel agent execution.

Each benchmark project is scoped to complete end-to-end in **5–10 minutes** across multiple iterative waves. The goal is NOT to build production software — it's to generate structured signal about planning quality.

---

## What We're Measuring

### Primary Metrics

| Metric | Description | Signal |
|--------|-------------|--------|
| **Wave Decomposition Quality** | How well the planner identifies parallelizable vs. sequential work | Compare agent's wave plan against ground-truth dependency graph |
| **Dependency Sequencing Accuracy** | Whether the planner correctly sequences dependent tasks | Count of blocked/failed tasks due to missing prerequisites |
| **Prompt Specificity Score** | How precisely the planner translates PRD requirements into Claude Code prompts | Measure acceptance test pass rate on first attempt |
| **Rework Ratio** | How often later waves need to fix/refactor work from earlier waves | Track file edit frequency across waves |
| **Parallelism Efficiency** | How effectively the planner utilizes available concurrent agent slots | Measure idle time vs. active time across agent slots |
| **Total Completion Time** | Wall-clock time from plan generation to all acceptance criteria passing | Raw elapsed time |
| **Conductor Score Delta** | How the Conductor Score evolves across waves | Track score trajectory — should trend upward |

### Secondary Metrics

| Metric | Description |
|--------|-------------|
| **Plan Stability** | Does the planner revise its wave plan mid-execution? How often? |
| **Context Utilization** | Does the planner reference PRD sections accurately in prompts? |
| **Error Recovery** | When a wave produces broken output, how does the planner adapt? |
| **Token Efficiency** | Total tokens consumed across all agent prompts per benchmark run |

---

## Common PRD Structure

Every benchmark PRD follows this structure:

```
## 1. Project Overview
   - What we're building and why (from the agent's perspective)
   - Scope boundaries — what's IN and what's OUT

## 2. Architecture & Design
   - System architecture diagram (mermaid)
   - Component inventory with responsibilities
   - Data flow description
   - Technology constraints

## 3. Dependency Graph
   - Explicit component dependency map
   - Ground-truth optimal wave decomposition
   - Critical path identification

## 4. Detailed Component Specifications
   - Per-component: interface contracts, file paths, implementation notes
   - Input/output schemas where applicable
   - Error handling expectations

## 5. Input Fixtures
   - Static test data the agent starts with
   - File paths and formats

## 6. Acceptance Criteria
   - Programmatically verifiable pass/fail conditions
   - Test commands to run
   - Expected outputs

## 7. Evaluation Rubric
   - Scoring guide for Game Film analysis
   - What "optimal" looks like for this specific project
```

---

## Execution Protocol

### Per-Run Setup

1. Clean workspace — no artifacts from previous runs
2. Drop benchmark folder into project root
3. Agent reads `PRD.md` as sole input
4. Timer starts when agent begins plan generation
5. Timer stops when all acceptance criteria pass (or 10-minute hard ceiling)

### Iteration Strategy

For each benchmark project, run **minimum 3 iterations** varying:

- **Run A**: Baseline — no planning hints, agent uses default decomposition
- **Run B**: Guided — provide the ground-truth dependency graph as a planning hint
- **Run C**: Constrained — limit concurrent agent slots to 2 (force tighter sequencing)

### Game Film Capture

Each run produces a Game Film artifact containing:

- The generated wave plan (before execution)
- Per-wave: prompts sent, files created/modified, test results
- Timeline visualization (when each task started/completed)
- Diff between planned vs. actual execution order
- Annotated decision points where the planner made interesting choices

---

## Scoring

### Composite Benchmark Score (0–100)

| Component | Weight | Scoring |
|-----------|--------|---------|
| Acceptance tests passing | 30% | % of tests green on final state |
| Wave plan vs. ground truth | 25% | Levenshtein-style distance between planned and optimal wave ordering |
| First-attempt pass rate | 20% | % of components that pass acceptance on first wave attempt |
| Completion time | 15% | Linear scale: 5min = 100, 10min = 50, >10min = 0 |
| Rework ratio | 10% | Inverse of (total file edits / minimum required file creates) |

---

## File Conventions

- All source code output goes to `./src/`
- All test files go to `./tests/`
- Config files go to project root
- The agent should create a `package.json` or equivalent manifest as Wave 1 task
- No external API calls — everything runs locally with fixtures
