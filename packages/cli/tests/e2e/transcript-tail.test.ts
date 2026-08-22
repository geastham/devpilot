import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tailTranscript, initialTailState } from '../../src/commands/bridge/transcript-tail';

/**
 * The deriver feeds the live watch view, so what it must never do is leak: the
 * only fields that cross are tool name, repo-relative path, and time offset.
 * The tests that matter most here are the negative ones.
 */

const workspace = mkdtempSync(join(tmpdir(), 'devpilot-tail-'));
afterAll(() => rmSync(workspace, { recursive: true, force: true }));

const CWD = '/home/dev/acme/widget';
let n = 0;

function line(tsOffsetS: number, blocks: unknown[]): string {
  return (
    JSON.stringify({
      type: 'assistant',
      timestamp: new Date(1_700_000_000_000 + tsOffsetS * 1000).toISOString(),
      message: { content: blocks },
    }) + '\n'
  );
}

const tool = (name: string, input: Record<string, unknown> = {}) => ({
  type: 'tool_use',
  name,
  input,
});

function fresh(content: string): string {
  const p = join(workspace, `t-${n++}.jsonl`);
  writeFileSync(p, content, 'utf8');
  return p;
}

describe('what crosses the line', () => {
  it('derives tool, relative path, and offset — nothing else', () => {
    const p = fresh(
      line(0, [tool('Read', { file_path: `${CWD}/src/index.ts` })]) +
        line(5, [tool('Edit', { file_path: `${CWD}/src/app.ts`, old_string: 'SECRET SOURCE' })])
    );
    const state = initialTailState();
    const events = tailTranscript(p, state, CWD);

    expect(events).toEqual([
      { seq: 0, t: 0, tool: 'Read', path: 'src/index.ts' },
      { seq: 1, t: 5, tool: 'Edit', path: 'src/app.ts' },
    ]);
    // The event objects have no field that could carry the input.
    for (const e of events) expect(Object.keys(e).sort()).toEqual(['path', 'seq', 't', 'tool']);
  });

  it('drops a path outside the repo instead of shipping it', () => {
    const p = fresh(line(0, [tool('Read', { file_path: '/etc/passwd' })]));
    const events = tailTranscript(p, initialTailState(), CWD);
    expect(events[0].path).toBeNull();
  });

  it('recovers a path from a Bash command without keeping the command', () => {
    const p = fresh(
      line(0, [tool('Bash', { command: 'pnpm vitest run tests/unit/app.test.ts --reporter=min' })])
    );
    const events = tailTranscript(p, initialTailState(), CWD);
    expect(events[0]).toMatchObject({ tool: 'Bash', path: 'tests/unit/app.test.ts' });
  });

  it('ignores prose blocks entirely', () => {
    const p = fresh(line(0, [{ type: 'text', text: 'here is your entire source file: …' }]));
    expect(tailTranscript(p, initialTailState(), CWD)).toEqual([]);
  });
});

describe('incremental reads', () => {
  it('reads only what was appended since the last tick', () => {
    const p = fresh(line(0, [tool('Read', { file_path: `${CWD}/a.ts` })]));
    const state = initialTailState();

    expect(tailTranscript(p, state, CWD)).toHaveLength(1);
    expect(tailTranscript(p, state, CWD)).toHaveLength(0); // nothing new

    appendFileSync(p, line(10, [tool('Write', { file_path: `${CWD}/b.ts` })]));
    const next = tailTranscript(p, state, CWD);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ seq: 1, tool: 'Write', path: 'b.ts' });
  });

  it('carries a torn trailing line to the next tick instead of losing it', () => {
    const whole = line(0, [tool('Read', { file_path: `${CWD}/a.ts` })]);
    const partial = line(5, [tool('Edit', { file_path: `${CWD}/b.ts` })]);
    const cut = Math.floor(partial.length / 2);

    const p = fresh(whole + partial.slice(0, cut));
    const state = initialTailState();
    // First tick: the torn line is not parseable and not consumed.
    expect(tailTranscript(p, state, CWD)).toHaveLength(1);

    appendFileSync(p, partial.slice(cut));
    const next = tailTranscript(p, state, CWD);
    expect(next).toHaveLength(1);
    expect(next[0].path).toBe('b.ts');
  });

  it('starts over when the file shrank rather than reading garbage offsets', () => {
    const p = fresh(line(0, [tool('Read', { file_path: `${CWD}/a.ts` })]) .repeat(3));
    const state = initialTailState();
    tailTranscript(p, state, CWD);

    writeFileSync(p, line(0, [tool('Read', { file_path: `${CWD}/z.ts` })]), 'utf8');
    const events = tailTranscript(p, state, CWD);
    expect(events.map((e) => e.path)).toEqual(['z.ts']);
  });
});

describe('time is active time', () => {
  it('collapses an idle gap to a single beat', () => {
    const p = fresh(
      line(0, [tool('Read', { file_path: `${CWD}/a.ts` })]) +
        // Eight hours of nothing — the overnight pause.
        line(8 * 3600, [tool('Read', { file_path: `${CWD}/b.ts` })])
    );
    const events = tailTranscript(p, initialTailState(), CWD);
    // The pause becomes a 30s beat, not eight silent hours on the strip.
    expect(events[1].t).toBe(30);
  });

  it('does not charge a pause for parallel calls in one turn', () => {
    // One assistant message, three tool blocks, one timestamp.
    const p = fresh(
      line(0, [
        tool('Read', { file_path: `${CWD}/a.ts` }),
        tool('Read', { file_path: `${CWD}/b.ts` }),
        tool('Read', { file_path: `${CWD}/c.ts` }),
      ])
    );
    const events = tailTranscript(p, initialTailState(), CWD);
    expect(events.map((e) => e.t)).toEqual([0, 0, 0]);
  });

  it('keeps short gaps as they were', () => {
    const p = fresh(
      line(0, [tool('Read', { file_path: `${CWD}/a.ts` })]) +
        line(90, [tool('Read', { file_path: `${CWD}/b.ts` })])
    );
    const events = tailTranscript(p, initialTailState(), CWD);
    expect(events[1].t).toBe(90);
  });
});
