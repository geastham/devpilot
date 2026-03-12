import type { RefinementPromptTemplate } from './types';
import type { PromptContext } from '../types';

/**
 * Refinement prompt template for improving low-quality wave plans.
 * Used when initial plans have poor parallelization scores or other quality issues.
 * Focuses on increasing parallelism and reducing critical path length.
 */
export const refinementTemplate: RefinementPromptTemplate = {
  name: 'refinement',
  version: '1.0.0',

  render(context: PromptContext): string {
    // For standalone rendering, use a basic optimization prompt
    return `# Optimize Wave Execution Plan

Analyze this specification and generate a highly parallelized wave execution plan.

## Specification
\`\`\`
${context.specContent}
\`\`\`

## Optimization Goals

1. **Maximize parallelization**: Break work into the smallest independent units
2. **Minimize critical path**: Reduce the longest chain of dependent tasks
3. **Reduce dependencies**: Only add dependencies when truly required
4. **Balance waves**: Distribute work evenly across waves

Generate an optimized wave plan following the standard format.`;
  },

  renderRefinement(context: PromptContext, currentPlan: string, currentScore: number): string {
    return `# Improve Wave Execution Plan

You are refining an existing wave execution plan to increase parallelization and reduce execution time.

## Original Specification
\`\`\`
${context.specContent}
\`\`\`

## Current Plan
\`\`\`markdown
${currentPlan}
\`\`\`

## Current Quality Metrics

**Overall Score**: ${(currentScore * 100).toFixed(1)}% (Target: 80%+)

The current plan has optimization opportunities. Your goal is to improve parallelization while maintaining correctness.

## Refinement Strategies

### 1. Break Large Tasks into Smaller Subtasks

**Bad** (sequential bottleneck):
\`\`\`
Wave 1:
- 1.1: Implement entire user module [XL] (src/user/*.ts)
  Dependencies: -

Wave 2:
- 2.1: Implement entire auth module [XL] (src/auth/*.ts)
  Dependencies: 1.1
\`\`\`

**Good** (parallel subtasks):
\`\`\`
Wave 1:
- 1.1: Create user types [S] (src/user/types.ts)
  Dependencies: -
- 1.2: Create auth types [S] (src/auth/types.ts)
  Dependencies: -

Wave 2:
- 2.1: Implement user service [M] (src/user/service.ts)
  Dependencies: 1.1
- 2.2: Implement auth service [M] (src/auth/service.ts)
  Dependencies: 1.2
- 2.3: Implement user repository [M] (src/user/repository.ts)
  Dependencies: 1.1
\`\`\`

### 2. Reduce Unnecessary Dependencies

**Bad** (false dependency):
\`\`\`
Wave 1:
- 1.1: Create user types [S]
  Dependencies: -

Wave 2:
- 2.1: Create auth types [S]
  Dependencies: 1.1  ← Unnecessary!
\`\`\`

**Good** (independent):
\`\`\`
Wave 1:
- 1.1: Create user types [S]
  Dependencies: -
- 1.2: Create auth types [S]
  Dependencies: -  ← Can run in parallel
\`\`\`

### 3. Identify Tasks That Can Start Earlier

**Bad** (late start):
\`\`\`
Wave 1:
- 1.1: Create shared types [S]

Wave 2:
- 2.1: Implement feature A [M]
  Dependencies: 1.1

Wave 3:
- 3.1: Write tests for feature A [M]
  Dependencies: 2.1
- 3.2: Write documentation [S]
  Dependencies: 2.1  ← Could have started earlier!
\`\`\`

**Good** (early documentation):
\`\`\`
Wave 1:
- 1.1: Create shared types [S]
- 1.2: Write documentation structure [S]
  Dependencies: -  ← Can start immediately

Wave 2:
- 2.1: Implement feature A [M]
  Dependencies: 1.1
- 2.2: Update documentation content [S]
  Dependencies: 1.2

Wave 3:
- 3.1: Write tests for feature A [M]
  Dependencies: 2.1
\`\`\`

### 4. Split Cross-Cutting Changes

**Bad** (monolithic task):
\`\`\`
Wave 1:
- 1.1: Update all API endpoints [XL]
  Files: api/users.ts, api/auth.ts, api/products.ts, api/orders.ts
  Dependencies: -
\`\`\`

**Good** (split by module):
\`\`\`
Wave 1:
- 1.1: Update user API endpoints [M] (api/users.ts)
  Dependencies: -
- 1.2: Update auth API endpoints [M] (api/auth.ts)
  Dependencies: -
- 1.3: Update product API endpoints [M] (api/products.ts)
  Dependencies: -
- 1.4: Update order API endpoints [M] (api/orders.ts)
  Dependencies: -
\`\`\`

### 5. Parallelize Independent Features

**Bad** (sequential features):
\`\`\`
Wave 1:
- 1.1: Implement feature A [L]

Wave 2:
- 2.1: Implement feature B [L]
  Dependencies: 1.1  ← Why?
\`\`\`

**Good** (parallel features):
\`\`\`
Wave 1:
- 1.1: Implement feature A [L]
  Dependencies: -
- 1.2: Implement feature B [L]
  Dependencies: -  ← Independent features run in parallel
\`\`\`

## Refinement Checklist

Before generating the improved plan, verify:

- [ ] All XL tasks are broken into M or smaller subtasks
- [ ] Dependencies exist only when task B needs outputs from task A
- [ ] No artificial sequencing (tasks waiting unnecessarily)
- [ ] Independent features run in parallel
- [ ] Each wave has multiple tasks when possible
- [ ] Critical path is as short as possible
- [ ] File conflicts are properly handled (no same-file tasks in one wave)

## Important Constraints

${renderRefinementConstraints(context)}

## Output Format

Generate the complete improved plan using the standard wave plan format:

- Wave tables with all columns (Task ID, Description, Files, Dependencies, Parallel?, Model, Complexity)
- Dependency graph (mermaid)
- Critical path identification
- Statistics section

Focus on maximizing parallelization while maintaining correctness and respecting all constraints.

Generate the improved plan now.`;
  },
};

/**
 * Renders constraints specific to refinement context.
 */
function renderRefinementConstraints(context: PromptContext): string {
  const { constraints, fleetContext } = context;

  const constraintsList: string[] = [];

  // File availability
  if (fleetContext.inFlightFiles.length > 0) {
    const inFlightPaths = fleetContext.inFlightFiles.map((f) => `\`${f.path}\``).join(', ');
    constraintsList.push(`Files currently locked: ${inFlightPaths}`);
  }

  if (constraints.avoidFiles.length > 0) {
    const avoidPaths = constraints.avoidFiles.map((f) => `\`${f}\``).join(', ');
    constraintsList.push(`Files to avoid: ${avoidPaths}`);
  }

  // Concurrency limits
  if (constraints.maxConcurrency) {
    constraintsList.push(`Maximum tasks per wave: ${constraints.maxConcurrency}`);
  }

  // Fleet capacity
  const totalWorkers = Object.values(fleetContext.availableWorkers).reduce((a, b) => a + b, 0);
  if (totalWorkers > 0) {
    constraintsList.push(`Available workers: ${totalWorkers} total`);
  }

  // Model preferences
  if (constraints.preferModel) {
    constraintsList.push(`Preferred model: ${constraints.preferModel}`);
  }

  // Cost constraints
  if (constraints.maxCost) {
    constraintsList.push(`Maximum cost: $${constraints.maxCost} (prefer smaller models)`);
  }

  // Custom constraints
  if (constraints.customConstraints.length > 0) {
    constraintsList.push(...constraints.customConstraints);
  }

  if (constraintsList.length === 0) {
    return '- No specific constraints\n';
  }

  return constraintsList.map((c) => `- ${c}`).join('\n') + '\n';
}
