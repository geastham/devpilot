import type { PromptTemplate } from './types';
import type { PromptContext } from '../types';

/**
 * Default wave planner prompt template.
 * Generates comprehensive wave-decomposed execution plans with:
 * - Task decomposition into independent waves
 * - Dependency graph construction
 * - Critical path identification
 * - Parallelization optimization
 */
export const defaultTemplate: PromptTemplate = {
  name: 'default',
  version: '1.0.0',

  render(context: PromptContext): string {
    return `# Wave-Decomposed Execution Plan Generator

You are an expert software architect generating a wave-decomposed execution plan. Your goal is to break down the specification into parallel-executable tasks organized into waves.

## Specification
\`\`\`
${context.specContent}
\`\`\`

## Context

### Item Metadata
- **Title**: ${context.itemTitle}
- **Item ID**: ${context.itemId}
- **Repository**: ${context.repo}

${renderFleetContext(context)}

${renderCodebaseContext(context)}

${renderConstraints(context)}

${renderMemoryContext(context)}

${renderWorkContext(context)}

## Wave Planning Rules

### Wave Structure
1. **Waves are execution phases**: All tasks within a wave can run in parallel
2. **Dependencies define wave boundaries**: A task cannot start until all its dependencies complete
3. **File conflicts prevent parallelism**: Tasks touching the same file MUST be in different waves
4. **Maximize parallelization**: Break work into the smallest independent units possible
5. **Minimize critical path**: Reduce the longest chain of dependent tasks

### Task Granularity
- **Small tasks (S)**: Single function/component changes, 5-15 minutes
- **Medium tasks (M)**: Multiple related files, 15-30 minutes
- **Large tasks (L)**: Cross-cutting changes, 30-60 minutes
- **Extra Large (XL)**: Major refactors or migrations, 60+ minutes

### Model Selection
- **Haiku**: Simple changes, clear specifications, low complexity (S-M tasks)
- **Sonnet**: Moderate complexity, requires reasoning, most tasks (M-L tasks)
- **Opus**: Complex architecture changes, ambiguous requirements (L-XL tasks)

### Dependency Types
- **Hard dependencies**: Task B requires outputs from Task A (code, types, interfaces)
- **Soft dependencies**: Task B benefits from Task A context but can technically run independently
- Use hard dependencies sparingly; prefer file-based sequencing

## Output Format

Generate your plan using the following structure:

### Wave Tables

For each wave, create a markdown table with these columns:

| Task ID | Description | Files | Dependencies | Parallel? | Model | Complexity |
|---------|-------------|-------|--------------|-----------|-------|------------|

**Column specifications:**
- **Task ID**: Format as \`W.T\` (e.g., 1.1, 1.2, 2.1) where W=wave number, T=task number
- **Description**: Clear, actionable task description (1-2 sentences)
- **Files**: Comma-separated list of files this task will modify/create
- **Dependencies**: Comma-separated list of Task IDs this task depends on (empty if none)
- **Parallel?**: "Yes" if can run with other tasks in wave, "No" if sequential
- **Model**: "haiku", "sonnet", or "opus"
- **Complexity**: "S", "M", "L", or "XL"

**Example:**
\`\`\`markdown
## Wave 1: Foundation

| Task ID | Description | Files | Dependencies | Parallel? | Model | Complexity |
|---------|-------------|-------|--------------|-----------|-------|------------|
| 1.1 | Create base type definitions | src/types.ts | - | Yes | haiku | S |
| 1.2 | Set up database schema | src/db/schema.ts | - | Yes | sonnet | M |
| 1.3 | Initialize config module | src/config.ts | - | Yes | haiku | S |

## Wave 2: Core Implementation

| Task ID | Description | Files | Dependencies | Parallel? | Model | Complexity |
|---------|-------------|-------|--------------|-----------|-------|------------|
| 2.1 | Implement user service | src/services/user.ts | 1.1, 1.2 | Yes | sonnet | M |
| 2.2 | Implement auth service | src/services/auth.ts | 1.1, 1.2 | Yes | sonnet | M |
\`\`\`

### Dependency Graph

After all wave tables, include a dependency graph section:

\`\`\`markdown
## Dependency Graph

\`\`\`mermaid
graph TD
  1.1[Task 1.1: Base types]
  1.2[Task 1.2: Database schema]
  1.3[Task 1.3: Config]
  2.1[Task 2.1: User service]
  2.2[Task 2.2: Auth service]

  1.1 --> 2.1
  1.2 --> 2.1
  1.1 --> 2.2
  1.2 --> 2.2
\`\`\`
\`\`\`

### Critical Path

Identify the longest chain of dependent tasks:

\`\`\`markdown
## Critical Path

**Path**: 1.1 → 2.1 → 3.1 → 4.1
**Length**: 4 tasks
**Description**: This represents the minimum time to completion if all parallel work executes optimally.
\`\`\`

### Statistics

Provide high-level metrics:

\`\`\`markdown
## Statistics

- **Total Tasks**: 12
- **Total Waves**: 4
- **Max Parallelism**: 5 tasks (Wave 2)
- **Critical Path Length**: 4 tasks
- **Sequential Chains**: 2
- **Parallelization Ratio**: 67% (8 parallel tasks / 12 total)
\`\`\`

## Planning Strategy

1. **Identify foundations**: What types, schemas, or configs must exist first?
2. **Find natural boundaries**: Group related work that shares context
3. **Detect conflicts**: Ensure no two tasks in the same wave touch the same file
4. **Minimize dependencies**: Only add dependencies when truly required
5. **Balance waves**: Aim for similar amounts of work per wave
6. **Verify critical path**: Ensure the longest chain is as short as possible

## Important Notes

- If the specification is unclear, make reasonable assumptions and note them in task descriptions
- Prefer creating new files over modifying existing files when possible (less conflict)
- Break large tasks into smaller subtasks across multiple waves
- Consider test files as separate tasks that depend on implementation tasks
- Documentation tasks can often run in parallel with implementation

Generate the complete wave-decomposed plan now.`;
  },
};

/**
 * Renders the fleet context block with available workers and in-flight work.
 */
function renderFleetContext(context: PromptContext): string {
  const { fleetContext } = context;

  let output = '### Fleet Context\n\n';

  // Available workers
  const workers = Object.entries(fleetContext.availableWorkers)
    .map(([model, count]) => `- **${model}**: ${count} worker${count !== 1 ? 's' : ''}`)
    .join('\n');

  output += '**Available Workers:**\n' + (workers || '- No workers available');
  output += '\n\n';

  // In-flight files
  if (fleetContext.inFlightFiles.length > 0) {
    output += '**Files Currently Being Modified:**\n';
    fleetContext.inFlightFiles.forEach((file) => {
      output += `- \`${file.path}\` (${file.ticketId}, ~${file.estimatedMinutesRemaining}min remaining)\n`;
    });
    output += '\n**Important**: Do not schedule tasks that modify these files until they complete.\n\n';
  }

  // Active sessions
  if (fleetContext.activeSessions.length > 0) {
    output += '**Active Sessions:**\n';
    fleetContext.activeSessions.forEach((session) => {
      output += `- ${session.ticketId} (${session.progressPercent}% complete, ~${session.estimatedRemainingMinutes}min remaining)\n`;
    });
    output += '\n';
  }

  return output;
}

/**
 * Renders the codebase context block with file structure and recent changes.
 */
function renderCodebaseContext(context: PromptContext): string {
  const { codebaseContext } = context;

  let output = '### Codebase Context\n\n';

  // File tree
  if (codebaseContext.fileTree) {
    output += '**Project Structure:**\n\`\`\`\n';
    output += codebaseContext.fileTree;
    output += '\n\`\`\`\n\n';
  }

  // Recently modified files
  if (codebaseContext.recentlyModifiedFiles.length > 0) {
    output += '**Recently Modified Files:**\n';
    codebaseContext.recentlyModifiedFiles.forEach((file) => {
      output += `- \`${file}\`\n`;
    });
    output += '\nConsider these files when planning changes to maintain consistency.\n\n';
  }

  // Module structure
  if (codebaseContext.moduleStructure) {
    output += '**Module Structure:**\n\`\`\`\n';
    output += codebaseContext.moduleStructure;
    output += '\n\`\`\`\n\n';
  }

  return output;
}

/**
 * Renders the constraints block with restrictions and preferences.
 */
function renderConstraints(context: PromptContext): string {
  const { constraints } = context;

  let output = '### Constraints\n\n';

  // Avoid files
  if (constraints.avoidFiles.length > 0) {
    output += '**Files to Avoid:**\n';
    constraints.avoidFiles.forEach((file) => {
      output += `- \`${file}\`\n`;
    });
    output += '\nDo not schedule tasks that modify these files.\n\n';
  }

  // Model preference
  if (constraints.preferModel) {
    output += `**Preferred Model**: ${constraints.preferModel}\n`;
    output += 'Use this model for tasks when appropriate.\n\n';
  }

  // Cost constraint
  if (constraints.maxCost) {
    output += `**Maximum Cost**: $${constraints.maxCost}\n`;
    output += 'Optimize for cost by preferring smaller models when possible.\n\n';
  }

  // Concurrency constraint
  if (constraints.maxConcurrency) {
    output += `**Maximum Concurrency**: ${constraints.maxConcurrency} tasks\n`;
    output += 'Ensure no wave exceeds this parallelism limit.\n\n';
  }

  // Custom constraints
  if (constraints.customConstraints.length > 0) {
    output += '**Additional Constraints:**\n';
    constraints.customConstraints.forEach((constraint) => {
      output += `- ${constraint}\n`;
    });
    output += '\n';
  }

  return output;
}

/**
 * Renders the memory context block with relevant past sessions.
 */
function renderMemoryContext(context: PromptContext): string {
  if (!context.memoryContext || context.memoryContext.relevantSessions.length === 0) {
    return '';
  }

  let output = '### Memory Context\n\n';
  output += '**Relevant Past Sessions:**\n';

  context.memoryContext.relevantSessions.forEach((session) => {
    output += `- **${session.date}** (${session.ticketId}): ${session.summary}\n`;
    if (session.constraintApplied) {
      output += `  *Constraint*: ${session.constraintApplied}\n`;
    }
  });

  output += '\nUse these insights to inform your planning decisions.\n\n';
  return output;
}

/**
 * Renders the work context block with completed and remaining work.
 */
function renderWorkContext(context: PromptContext): string {
  let output = '';

  // Completed work
  if (context.completedWork && context.completedWork.tasks.length > 0) {
    output += '### Completed Work\n\n';
    output += 'The following tasks have already been completed:\n\n';

    context.completedWork.tasks.forEach((task) => {
      output += `**${task.taskCode}**: ${task.description}\n`;
      output += `- Files modified: ${task.filesModified.join(', ')}\n`;
      output += `- Summary: ${task.completionSummary}\n\n`;
    });
  }

  // Remaining work
  if (context.remainingWork && context.remainingWork.tasks.length > 0) {
    output += '### Remaining Work\n\n';
    output += 'Focus your plan on these remaining tasks:\n\n';

    context.remainingWork.tasks.forEach((task) => {
      output += `**${task.taskCode}**: ${task.description}\n`;
      output += `- Original dependencies: ${task.originalDependencies.join(', ') || 'None'}\n`;
      output += `- Original files: ${task.originalFiles.join(', ')}\n\n`;
    });

    output += 'Adjust dependencies based on completed work and current codebase state.\n\n';
  }

  return output;
}
