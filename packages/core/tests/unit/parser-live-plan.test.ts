import { describe, it, expect } from 'vitest';
import { parseWavePlanResponse } from '../../src/wave-planner/parser';
import { parseFilePaths } from '../../src/wave-planner/utils';

/**
 * Two rows as the planner actually wrote them on the first live run of the
 * planner record. Both parsed into plans that looked fine and were wrong.
 */
const plan = `## Wave 1: Foundation

| Task ID | Description | Files | Dependencies | Parallel? | Model | Complexity |
|---------|-------------|-------|--------------|-----------|-------|------------|
| 1.1 | Create \`retry-context.ts\` exporting \`buildRetryContextSection({ attempt, lastError })\` | \`packages/core/src/orchestrator/retry-context.ts\` | - | Yes | sonnet | M |
| 1.2 | Export a \`RetryContext\` interface (\`attempt: number; lastError?: string | null\`) | \`packages/core/src/orchestrator/retry-context.types.ts\` | - | Yes | sonnet | S |
`;

describe('a plan as the model writes it', () => {
  const tasks = parseWavePlanResponse(plan).waves[0].tasks;

  it('takes paths out of their backticks', () => {
    expect(tasks[0].filePaths).toEqual(['packages/core/src/orchestrator/retry-context.ts']);
  });

  it('keeps a pipe inside a code span in its cell', () => {
    expect(tasks[1].description).toContain('lastError?: string | null');
    expect(tasks[1].filePaths).toEqual(['packages/core/src/orchestrator/retry-context.types.ts']);
    expect(tasks[1].complexity).toBe('S');
  });
});

describe('parseFilePaths', () => {
  it('unwraps the markdown a path arrives in', () => {
    expect(parseFilePaths('`a.ts`, "b.ts", **c.ts**, ``d.ts``, e.ts')).toEqual(['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts']);
  });
  it('leaves a path with a backtick only on one side alone', () => {
    expect(parseFilePaths('`a.ts')).toEqual(['`a.ts']);
  });
});
