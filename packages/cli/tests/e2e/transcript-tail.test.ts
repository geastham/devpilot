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

  /**
   * The hosted route refuses a whole batch for one tool name over 64
   * characters, and MCP tool names run past that. Found on a real fleet: two
   * sessions that used such a tool had stopped streaming at that event.
   */
  it('keeps an over-long tool name from costing the batch', () => {
    const name = 'mcp__claude_ai_Some_Production_Server__get_persona_decision_architecture';
    expect(name.length).toBeGreaterThan(64);

    const p = fresh(line(0, [tool(name)]) + line(1, [tool('Read', { file_path: `${CWD}/a.ts` })]));
    const events = tailTranscript(p, initialTailState(), CWD);

    expect(events).toHaveLength(2);
    expect(events[0].tool).toHaveLength(64);
    expect(events[0].tool.startsWith('mcp__claude_ai_Some_Production_Server__')).toBe(true);
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

/**
 * Usage, counted once per response.
 *
 * Claude Code writes one line per content block and repeats the response's
 * usage on each. Measured against real transcripts, a plain sum overcounts by
 * 2× to 5× — a figure that looks measured and is not.
 */
describe('what the session cost', () => {
  function reply(
    tsOffsetS: number,
    id: string,
    usage: Record<string, number>,
    blocks: unknown[],
  ): string {
    return (
      JSON.stringify({
        type: 'assistant',
        timestamp: new Date(1_700_000_000_000 + tsOffsetS * 1000).toISOString(),
        message: { id, usage, content: blocks },
      }) + '\n'
    );
  }

  const USAGE = {
    input_tokens: 10,
    output_tokens: 200,
    cache_read_input_tokens: 5_000,
    cache_creation_input_tokens: 300,
  };

  it('counts a response once however many lines it spans', () => {
    // One response: a text block and two tool calls, three lines, same usage.
    const p = fresh(
      reply(0, 'msg_1', USAGE, [{ type: 'text', text: 'looking' }]) +
        reply(0, 'msg_1', USAGE, [tool('Read', { file_path: `${CWD}/a.ts` })]) +
        reply(0, 'msg_1', USAGE, [tool('Read', { file_path: `${CWD}/b.ts` })])
    );
    const state = initialTailState();
    tailTranscript(p, state, CWD);

    expect(state.usage?.totals).toMatchObject({ input: 10, output: 200, cacheRead: 5_000, cacheWrite: 300 });
    expect(state.usage?.turns).toBe(1);
  });

  it('adds a new response on top', () => {
    const p = fresh(
      reply(0, 'msg_1', USAGE, [tool('Read', { file_path: `${CWD}/a.ts` })]) +
        reply(4, 'msg_2', USAGE, [tool('Edit', { file_path: `${CWD}/a.ts` })])
    );
    const state = initialTailState();
    tailTranscript(p, state, CWD);

    expect(state.usage?.totals.cacheRead).toBe(10_000);
    expect(state.usage?.turns).toBe(2);
  });

  it('does not double count a response split across two ticks', () => {
    const p = fresh(reply(0, 'msg_1', USAGE, [{ type: 'text', text: 'looking' }]));
    const state = initialTailState();
    tailTranscript(p, state, CWD);

    appendFileSync(p, reply(0, 'msg_1', USAGE, [tool('Read', { file_path: `${CWD}/a.ts` })]));
    tailTranscript(p, state, CWD);

    expect(state.usage?.totals.output).toBe(200);
    expect(state.usage?.turns).toBe(1);
  });

  it('counts a response that used no tools — it still spent tokens', () => {
    const p = fresh(reply(0, 'msg_1', USAGE, [{ type: 'text', text: 'thinking out loud' }]));
    const state = initialTailState();
    expect(tailTranscript(p, state, CWD)).toEqual([]);
    expect(state.usage?.totals.output).toBe(200);
  });

  it('survives the ledger round trip a restarted bridge puts it through', () => {
    const p = fresh(reply(0, 'msg_1', USAGE, [{ type: 'text', text: 'looking' }]));
    const state = initialTailState();
    tailTranscript(p, state, CWD);

    const restored = JSON.parse(JSON.stringify(state));
    appendFileSync(p, reply(0, 'msg_1', USAGE, [tool('Read', { file_path: `${CWD}/a.ts` })]));
    tailTranscript(p, restored, CWD);

    expect(restored.usage.totals.output).toBe(200);
  });

  /**
   * A bridge upgraded mid-session restores a tail whose offset is already past
   * everything so far. Counting from there would report a long session as
   * having spent only what it spent since the upgrade.
   */
  it('backfills a tail written before usage was derived, without re-emitting events', () => {
    const p = fresh(
      reply(0, 'msg_1', USAGE, [tool('Edit', { file_path: `${CWD}/a.ts` })]) +
        reply(5, 'msg_2', USAGE, [tool('Read', { file_path: `${CWD}/b.ts` })])
    );
    const state = initialTailState();
    expect(tailTranscript(p, state, CWD)).toHaveLength(2);

    // What an older version left in the ledger: the offset, and no usage.
    const legacy = { ...state, usage: undefined, written: undefined, writeCalls: undefined };
    appendFileSync(p, reply(9, 'msg_3', USAGE, [tool('Write', { file_path: `${CWD}/c.ts` })]));
    const events = tailTranscript(p, legacy, CWD);

    expect(events.map((e) => e.seq)).toEqual([2]);
    expect(legacy.usage?.totals.output).toBe(600);
    expect(legacy.usage?.turns).toBe(3);
    expect(legacy.written).toEqual(['a.ts', 'c.ts']);
    expect(legacy.writeCalls).toBe(2);
  });
});

describe('written files', () => {
  it('keeps the files the session changed, across ticks, once each', () => {
    const p = fresh(
      line(0, [tool('Read', { file_path: `${CWD}/a.ts` })]) +
        line(1, [tool('Edit', { file_path: `${CWD}/a.ts` })]) +
        line(2, [tool('Edit', { file_path: `${CWD}/a.ts` })])
    );
    const state = initialTailState();
    tailTranscript(p, state, CWD);
    appendFileSync(p, line(3, [tool('Write', { file_path: `${CWD}/b.ts` })]));
    tailTranscript(p, state, CWD);

    expect(state.written).toEqual(['a.ts', 'b.ts']);
    // Three edits to two files: the count is of calls, the list is of files.
    expect(state.writeCalls).toBe(3);
  });

  it('does not count a file that was only read or only named in a command', () => {
    const p = fresh(
      line(0, [tool('Read', { file_path: `${CWD}/a.ts` })]) +
        line(1, [tool('Bash', { command: 'cat src/secret.ts' })])
    );
    const state = initialTailState();
    tailTranscript(p, state, CWD);
    expect(state.written).toEqual([]);
  });
});
