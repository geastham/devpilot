import type { PromptTemplate } from './types';
import type { PromptContext } from '../types';

/**
 * Simplified wave planner prompt template.
 * Used as a fallback when the default template produces unparseable results.
 * Focuses on minimal instructions and clear output format.
 */
export const simplifiedTemplate: PromptTemplate = {
  name: 'simplified',
  version: '1.0.0',

  render(context: PromptContext): string {
    return `# Generate Wave Execution Plan

Break down this specification into tasks organized into waves.

## Specification
\`\`\`
${context.specContent}
\`\`\`

## Repository
${context.repo}

${renderSimplifiedConstraints(context)}

## Instructions

1. **Create waves**: Group tasks that can run in parallel
2. **No file conflicts**: Tasks in the same wave cannot modify the same file
3. **Add dependencies**: Only when task B needs outputs from task A
4. **Keep it simple**: Focus on clear task breakdown

## Output Format

Use this exact format:

\`\`\`markdown
## Wave 1: [Wave Name]

| Task ID | Description | Files | Dependencies | Parallel? | Model | Complexity |
|---------|-------------|-------|--------------|-----------|-------|------------|
| 1.1 | [Task description] | [file1.ts, file2.ts] | - | Yes | sonnet | M |
| 1.2 | [Task description] | [file3.ts] | - | Yes | haiku | S |

## Wave 2: [Wave Name]

| Task ID | Description | Files | Dependencies | Parallel? | Model | Complexity |
|---------|-------------|-------|--------------|-----------|-------|------------|
| 2.1 | [Task description] | [file4.ts] | 1.1 | Yes | sonnet | M |

## Critical Path

**Path**: 1.1 → 2.1 → 3.1
**Length**: 3 tasks

## Statistics

- **Total Tasks**: 6
- **Total Waves**: 3
- **Max Parallelism**: 3
- **Critical Path Length**: 3
- **Sequential Chains**: 1
\`\`\`

### Field Values

- **Task ID**: Format as \`wave.task\` (e.g., 1.1, 2.3)
- **Description**: 1-2 sentences
- **Files**: Comma-separated file paths
- **Dependencies**: Task IDs (e.g., "1.1, 1.2") or "-" for none
- **Parallel?**: "Yes" or "No"
- **Model**: "haiku", "sonnet", or "opus"
- **Complexity**: "S", "M", "L", or "XL"

## Guidelines

- **Complexity**: S=5-15min, M=15-30min, L=30-60min, XL=60+min
- **Model**: haiku=simple, sonnet=moderate, opus=complex
- **Wave boundaries**: Determined by dependencies and file conflicts
- **Maximize parallelism**: More tasks per wave = faster completion

Generate the plan now. Use the exact format shown above.`;
  },
};

/**
 * Renders simplified constraints focused on critical restrictions only.
 */
function renderSimplifiedConstraints(context: PromptContext): string {
  const { constraints, fleetContext } = context;

  let output = '';

  // Critical constraints only
  const criticalConstraints: string[] = [];

  if (constraints.avoidFiles.length > 0) {
    criticalConstraints.push(`Do not modify: ${constraints.avoidFiles.join(', ')}`);
  }

  if (fleetContext.inFlightFiles.length > 0) {
    const inFlightPaths = fleetContext.inFlightFiles.map((f) => f.path);
    criticalConstraints.push(`Currently being modified: ${inFlightPaths.join(', ')}`);
  }

  if (constraints.maxConcurrency) {
    criticalConstraints.push(`Maximum ${constraints.maxConcurrency} tasks per wave`);
  }

  if (constraints.preferModel) {
    criticalConstraints.push(`Prefer ${constraints.preferModel} model when appropriate`);
  }

  if (criticalConstraints.length > 0) {
    output += '## Constraints\n\n';
    criticalConstraints.forEach((constraint) => {
      output += `- ${constraint}\n`;
    });
    output += '\n';
  }

  return output;
}
