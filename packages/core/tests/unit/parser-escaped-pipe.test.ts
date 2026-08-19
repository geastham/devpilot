import { describe, it, expect } from 'vitest';
import { parseWavePlanResponse } from '../../src/wave-planner/parser';

/**
 * Regression: escaped pipes inside markdown table cells.
 *
 * The row below is copied verbatim from a real planning response captured via
 * DEVPILOT_PLANNER_DUMP_DIR while verifying the conductor end to end. The model
 * emitted correct GFM — a literal pipe inside a cell escaped as `\|` — and the
 * parser's `line.split('|')` treated it as a column break, shifting every later
 * cell one position left.
 *
 * The consequence is not cosmetic: `filePaths` drives the conflict detection
 * that decides which tasks may share a wave. Corrupted paths mean genuinely
 * colliding tasks are not seen to collide, and the conductor dispatches them in
 * parallel onto the same file.
 */
describe('parseWavePlanResponse — escaped pipes in table cells', () => {
  const markdown = `
## Wave 1: Types & Contracts

| Task ID | Description | Files | Dependencies | Parallel | Model | Complexity |
|---------|-------------|-------|--------------|----------|-------|------------|
| 1.1 | Define \`ExportFormat\` (\`'png'\\|'svg'\`), \`ExportScale\` (\`1\\|2\\|4\`) | \`src/types/export.ts\` | - | Yes | haiku | S |
| 1.2 | Plain row with no escaped pipes | \`src/lib/other.ts\` | - | Yes | sonnet | M |
`;

  const plan = parseWavePlanResponse(markdown);
  const tasks = plan.waves.flatMap((w) => w.tasks);
  const task11 = tasks.find((t) => t.taskCode === '1.1');

  it('keeps the escaped pipe inside the description instead of ending the cell', () => {
    expect(task11).toBeDefined();
    expect(task11!.description).toContain(`'png'|'svg'`);
    expect(task11!.description).toContain(`1|2|4`);
  });

  it('does not leak description fragments into filePaths', () => {
    // The bug produced filePaths of ["'svg'`)", "`ExportScale` (`1"].
    expect(task11!.filePaths).toEqual(['`src/types/export.ts`']);
  });

  it('unescapes \\| to a literal pipe in cell values', () => {
    expect(task11!.description).not.toContain('\\|');
  });

  it('still parses rows that contain no escaped pipes', () => {
    const task12 = tasks.find((t) => t.taskCode === '1.2');
    expect(task12!.description).toBe('Plain row with no escaped pipes');
    expect(task12!.filePaths).toEqual(['`src/lib/other.ts`']);
  });
});
