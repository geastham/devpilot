import type { PromptTemplate } from './types';
import type { PromptContext } from '../types';

/**
 * Ultra wave planner prompt template.
 *
 * Designed for the `ultra` tier (Opus 4.6 + extended thinking). Unlike the
 * default template, this one:
 *
 *   1. Front-loads the problem, constraints, and success criteria without
 *      prescribing a rigid "planning strategy" section — we want the model
 *      to *use* its thinking budget to work out the strategy, not regurgitate
 *      ours.
 *   2. Keeps the output schema instructions extremely terse so the visible
 *      token budget is reserved for the structured plan itself, not for
 *      restating rules the model already absorbed during thinking.
 *   3. Explicitly calls out the parallelization and critical-path objectives
 *      as the things the thinking phase should optimize against — this is
 *      the payoff of using extended thinking at all.
 *
 * The output format is intentionally identical to the default template so the
 * existing parser (`parseWavePlanResponse`) handles both tiers uniformly.
 */
export const ultraTemplate: PromptTemplate = {
  name: 'ultra',
  version: '1.0.0',

  render(context: PromptContext): string {
    return `# Wave-Decomposed Execution Plan (Ultra Tier)

You are an expert software architect. A naïve pass at this planning problem has either failed to meet the quality bar or the input is known to be unusually hard. Use your thinking budget to reason deeply before writing the plan.

## What you are optimizing

1. **Parallelization score**: maximize the ratio of tasks that can run in parallel. This is the primary metric.
2. **Critical path length**: minimize the longest chain of hard-dependent tasks.
3. **File-conflict safety**: never schedule two tasks in the same wave that write to the same file.
4. **Model cost efficiency**: prefer the smallest model that can plausibly complete each task (haiku < sonnet < opus).

Your thinking phase should explore alternative decompositions and pick the one that scores best on (1) and (2) together, not just one of them.

## Specification
\`\`\`
${context.specContent}
\`\`\`

## Item Context
- **Title**: ${context.itemTitle}
- **Item ID**: ${context.itemId}
- **Repository**: ${context.repo}

${renderFleet(context)}${renderCodebase(context)}${renderConstraints(context)}${renderWorkContext(context)}${renderPriorAttempt(context)}
## Hard Rules (violating any of these invalidates the plan)

- Two tasks in the same wave MUST NOT modify the same file.
- A task MUST NOT list a dependency that does not exist in the plan.
- The dependency graph MUST be acyclic.
- Every task MUST have a unique \`W.T\` task code.
- Only use models from: haiku, sonnet, opus.
- Only use complexity from: S, M, L, XL.

## Output Format (exactly this structure, no preamble)

For each wave, emit a markdown table:

\`\`\`markdown
## Wave N: <short label>

| Task ID | Description | Files | Dependencies | Parallel? | Model | Complexity |
|---------|-------------|-------|--------------|-----------|-------|------------|
| N.1 | ... | path/a.ts | - | Yes | sonnet | M |
\`\`\`

Then a dependency graph:

\`\`\`markdown
## Dependency Graph

\`\`\`mermaid
graph TD
  1.1[...]
  2.1[...]
  1.1 --> 2.1
\`\`\`
\`\`\`

Then the critical path:

\`\`\`markdown
## Critical Path

**Path**: 1.1 → 2.1 → 3.1
**Length**: 3 tasks
\`\`\`

Then summary statistics:

\`\`\`markdown
## Statistics

- **Total Tasks**: N
- **Total Waves**: N
- **Max Parallelism**: N
- **Critical Path Length**: N
- **Parallelization Ratio**: NN%
\`\`\`

Now produce the plan.`;
  },
};

// ---------------------------------------------------------------------------
// Lightweight context renderers. Kept local so they stay terse — the ultra
// prompt is deliberately smaller than the default prompt to leave headroom
// for the thinking budget.
// ---------------------------------------------------------------------------

function renderFleet(context: PromptContext): string {
  const { fleetContext } = context;
  const workers = Object.entries(fleetContext.availableWorkers)
    .map(([model, count]) => `${model}:${count}`)
    .join(', ');

  let out = `\n## Fleet\n- Workers: ${workers || 'none'}\n`;

  if (fleetContext.inFlightFiles.length > 0) {
    out += `- In-flight files (DO NOT schedule):\n`;
    fleetContext.inFlightFiles.forEach((f) => {
      out += `  - \`${f.path}\` (~${f.estimatedMinutesRemaining}min)\n`;
    });
  }

  return out;
}

function renderCodebase(context: PromptContext): string {
  const { codebaseContext } = context;
  let out = `\n## Codebase\n`;

  if (codebaseContext.fileTree) {
    out += '```\n' + codebaseContext.fileTree + '\n```\n';
  }

  if (codebaseContext.recentlyModifiedFiles.length > 0) {
    out += `- Recently modified: ${codebaseContext.recentlyModifiedFiles
      .map((f) => `\`${f}\``)
      .join(', ')}\n`;
  }

  return out;
}

function renderConstraints(context: PromptContext): string {
  const { constraints } = context;
  const parts: string[] = [];

  if (constraints.avoidFiles.length > 0) {
    parts.push(
      `- Avoid files: ${constraints.avoidFiles.map((f) => `\`${f}\``).join(', ')}`
    );
  }
  if (constraints.preferModel) {
    parts.push(`- Prefer model: ${constraints.preferModel}`);
  }
  if (constraints.maxCost) {
    parts.push(`- Max cost: $${constraints.maxCost}`);
  }
  if (constraints.maxConcurrency) {
    parts.push(`- Max concurrency per wave: ${constraints.maxConcurrency}`);
  }
  constraints.customConstraints.forEach((c) => parts.push(`- ${c}`));

  if (parts.length === 0) return '';
  return `\n## Constraints\n${parts.join('\n')}\n`;
}

function renderWorkContext(context: PromptContext): string {
  let out = '';

  if (context.completedWork && context.completedWork.tasks.length > 0) {
    out += `\n## Already Completed\n`;
    context.completedWork.tasks.forEach((t) => {
      out += `- **${t.taskCode}**: ${t.description} (files: ${t.filesModified.join(', ')})\n`;
    });
  }

  if (context.remainingWork && context.remainingWork.tasks.length > 0) {
    out += `\n## Remaining Work (plan only these)\n`;
    context.remainingWork.tasks.forEach((t) => {
      out += `- **${t.taskCode}**: ${t.description}\n`;
    });
  }

  return out;
}

function renderPriorAttempt(context: PromptContext): string {
  // If a `priorPlanMarkdown` constraint is passed, surface it so the ultra
  // pass knows what the standard tier already tried and can iterate on it
  // rather than starting from scratch.
  const priorConstraint = context.constraints.customConstraints.find((c) =>
    c.startsWith('PRIOR_PLAN_MARKDOWN:')
  );
  if (!priorConstraint) return '';

  const prior = priorConstraint.slice('PRIOR_PLAN_MARKDOWN:'.length).trim();
  return `\n## Prior Attempt (lower-tier output)\n\nThe standard tier produced this plan. It failed the quality bar. Diagnose what's wrong and do better:\n\n${prior}\n`;
}
