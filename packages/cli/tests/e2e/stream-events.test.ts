import { describe, it, expect } from 'vitest';
import {
  TelemetryCollector,
  estimateProgress,
  describeActivity,
  isStalled,
} from '../../src/commands/session-runner/stream-events';

/**
 * Reading what an agent is doing, from the stream it actually emits.
 *
 * The event shapes below are copied from a real `claude -p --output-format
 * stream-json --verbose` run, not invented. Before this existed the cockpit
 * showed a timer dressed as a progress bar — five percent every ninety seconds
 * — which is why three agents read 0% for ten minutes and then snapped to 100%,
 * with elapsed stuck at 0m against a real 5.76m.
 */

function toolUse(name: string, input: Record<string, unknown>) {
  return JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', name, input }] },
  });
}

describe('reading the agent stream', () => {
  it('counts tool calls and separates writes from reads', () => {
    const c = new TelemetryCollector();
    c.ingestLine(toolUse('Read', { file_path: 'src/types.ts' }));
    c.ingestLine(toolUse('Write', { file_path: 'src/debounce.ts' }));
    c.ingestLine(toolUse('Edit', { file_path: 'src/debounce.ts' }));

    const t = c.snapshot();
    expect(t.toolCalls).toBe(3);
    // Editing the same file twice is one file, not two: this reads as "what has
    // this agent been into", and repetition would drown out the other files.
    expect(t.filesTouched).toEqual(['src/debounce.ts']);
    expect(t.filesRead).toEqual(['src/types.ts']);
  });

  it('survives a malformed line without killing the run it describes', () => {
    const c = new TelemetryCollector();
    c.ingestLine('{ not json');
    c.ingestLine('');
    c.ingestLine(toolUse('Write', { file_path: 'a.ts' }));
    expect(c.snapshot().toolCalls).toBe(1);
  });

  it('takes real cost and turns from the result event', () => {
    const c = new TelemetryCollector();
    c.ingestLine(
      JSON.stringify({
        type: 'result',
        total_cost_usd: 0.2256,
        num_turns: 2,
        duration_ms: 3994,
        usage: { input_tokens: 4, output_tokens: 164 },
      })
    );
    const t = c.snapshot();
    expect(t.costUsd).toBeCloseTo(0.2256);
    expect(t.turns).toBe(2);
    expect(t.tokensIn + t.tokensOut).toBe(168);
  });
});

describe('progress measured against the plan', () => {
  const declared = ['src/lib/timing/debounce.ts', 'src/lib/timing/throttle.ts'];

  it('is evidence, not a timer: half the declared files is roughly half done', () => {
    const c = new TelemetryCollector();
    c.ingestLine(toolUse('Write', { file_path: '/abs/src/lib/timing/debounce.ts' }));
    const pct = estimateProgress(c.snapshot(), declared);
    expect(pct).toBeGreaterThan(35);
    expect(pct).toBeLessThan(55);
  });

  it('never reports finished — only the agent can declare that', () => {
    const c = new TelemetryCollector();
    for (const f of declared) c.ingestLine(toolUse('Write', { file_path: f }));
    expect(estimateProgress(c.snapshot(), declared)).toBeLessThanOrEqual(90);
  });

  it('never reports zero once work is visibly underway', () => {
    const c = new TelemetryCollector();
    c.ingestLine(toolUse('Read', { file_path: 'src/other.ts' }));
    // Nothing declared has been written, but five tool calls in, "0%" is a lie.
    expect(estimateProgress(c.snapshot(), declared)).toBeGreaterThan(0);
  });

  it('falls back to a capped curve when the plan declared no files', () => {
    const c = new TelemetryCollector();
    for (let i = 0; i < 40; i++) c.ingestLine(toolUse('Bash', { command: 'ls' }));
    const pct = estimateProgress(c.snapshot(), []);
    // Capped low on purpose: without file evidence this is a weak reading and
    // must not look like a strong one.
    expect(pct).toBeLessThanOrEqual(70);
    expect(pct).toBeGreaterThan(40);
  });
});

describe('what the conductor reads at a glance', () => {
  it('names the current action in plain words', () => {
    const c = new TelemetryCollector();
    c.ingestLine(toolUse('Edit', { file_path: 'src/lib/timing/scheduler.ts' }));
    expect(describeActivity(c.snapshot())).toBe('editing scheduler.ts');
  });

  it('says "starting up" before anything has happened', () => {
    expect(describeActivity(new TelemetryCollector().snapshot())).toBe('starting up');
  });

  it('flags a stall, which no wall-clock timer can detect', () => {
    let now = 1_000_000;
    const c = new TelemetryCollector(() => now);
    c.ingestLine(toolUse('Write', { file_path: 'a.ts' }));

    now += 60_000;
    expect(isStalled(c.snapshot())).toBe(false);

    now += 240_000;
    expect(isStalled(c.snapshot())).toBe(true);
  });

  it('does not call a session that has not started yet stalled', () => {
    let now = 1_000_000;
    const c = new TelemetryCollector(() => now);
    now += 600_000;
    // Silence before the first tool call is startup, not a stall.
    expect(isStalled(c.snapshot())).toBe(false);
  });
});
