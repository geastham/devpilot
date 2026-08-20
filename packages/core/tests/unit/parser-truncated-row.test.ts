import { describe, it, expect } from 'vitest';
import { parseWavePlanResponse } from '../../src/wave-planner/parser';

/**
 * Regression: a planning response cut off at the token ceiling.
 *
 * The truncated row below is copied from AVA-12's real response. The model ran
 * out of output tokens partway through the final row, which arrived with a task
 * code, part of a description, and none of the remaining columns.
 *
 * The parser turned that into a task with an EMPTY description. It was counted
 * in the plan, scored, presented to a human as part of a finished plan, and
 * would have been dispatched to an agent as an instruction to do nothing. The
 * hosted cockpit rendered it as a nameless box, which is how it was noticed.
 *
 * `ai-client` now rejects `stop_reason: 'max_tokens'` outright, so a truncated
 * response should never reach here — but a malformed row must not become a
 * silent empty task whatever produced it.
 */
describe('parseWavePlanResponse — a response cut off mid-table', () => {
  const markdown = `
## Wave 2: Implementation

| Task ID | Description | Files | Dependencies | Parallel | Model | Complexity |
|---------|-------------|-------|--------------|----------|-------|------------|
| 2.1 | Implement \`debounce()\` over the scheduler core | \`src/debounce.ts\` | 1.3 | Yes | sonnet | M |
| 2.2 | Implement \`throttle()\` over the scheduler core:`;

  const tasks = parseWavePlanResponse(markdown).waves.flatMap((w) => w.tasks);

  it('keeps the complete row', () => {
    expect(tasks.map((t) => t.taskCode)).toContain('2.1');
  });

  it('drops the truncated row rather than inventing an empty task', () => {
    expect(tasks.map((t) => t.taskCode)).not.toContain('2.2');
  });

  it('never emits a task that says nothing', () => {
    // The precise defect: a task that exists, is counted, and has no
    // instruction in it.
    expect(tasks.every((t) => t.description.trim().length > 0)).toBe(true);
  });
});

describe('parseWavePlanResponse — cells that are blank rather than missing', () => {
  const markdown = `
## Wave 1: Setup

| Task ID | Description | Files | Dependencies | Parallel | Model | Complexity |
|---------|-------------|-------|--------------|----------|-------|------------|
| 1.1 |  | \`src/a.ts\` | - | Yes | sonnet | S |
| 1.2 | A real task | \`src/b.ts\` | - | Yes | sonnet | S |
`;

  it('drops a well-formed row whose description is empty', () => {
    const tasks = parseWavePlanResponse(markdown).waves.flatMap((w) => w.tasks);
    expect(tasks.map((t) => t.taskCode)).toEqual(['1.2']);
  });
});
