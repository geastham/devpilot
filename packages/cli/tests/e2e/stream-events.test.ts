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


/**
 * The money dial, while there is still time to act on it.
 *
 * `total_cost_usd` only arrives in the final `result` event, so cost read
 * $0.0000 for the entire life of a run — dark at exactly the moment a conductor
 * could do something about it. Each assistant turn carries its own usage.
 */
describe('cost while running', () => {
  function turn(usage: Record<string, number>) {
    return JSON.stringify({ type: 'assistant', message: { usage, content: [] } });
  }

  it('accumulates an estimate from per-turn usage', () => {
    const c = new TelemetryCollector();
    c.ingestLine(turn({ input_tokens: 1000, output_tokens: 1000 }));
    const t = c.snapshot();
    expect(t.costUsd).toBeGreaterThan(0);
    // Flagged, because a guess presented as fact is worse than a blank dial.
    expect(t.costIsEstimate).toBe(true);
  });

  /**
   * The stream emits one event per content block and repeats the response's
   * usage on each — verified against `claude -p --output-format stream-json`,
   * where a thinking + text + tool_use reply arrived as three events with one
   * id and identical usage. Adding each one tripled the running estimate.
   */
  it('counts a response once, however many blocks the stream splits it into', () => {
    const block = (id: string, usage: Record<string, number>) =>
      JSON.stringify({ type: 'assistant', message: { id, usage, content: [] } });
    const usage = { input_tokens: 10, output_tokens: 4, cache_read_input_tokens: 13_796 };

    const once = new TelemetryCollector();
    once.ingestLine(block('msg_1', usage));

    const split = new TelemetryCollector();
    for (let i = 0; i < 3; i++) split.ingestLine(block('msg_1', usage));

    expect(split.snapshot().costUsd).toBeCloseTo(once.snapshot().costUsd);
    expect(split.snapshot().tokensCacheRead).toBe(13_796);
    expect(split.snapshot().turns).toBe(1);
  });

  it('takes the final token counts from the result, including cache', () => {
    const c = new TelemetryCollector();
    c.ingestLine(turn({ input_tokens: 10, output_tokens: 4 }));
    c.ingestLine(
      JSON.stringify({
        type: 'result',
        total_cost_usd: 0.03,
        num_turns: 2,
        usage: {
          input_tokens: 18,
          output_tokens: 173,
          cache_read_input_tokens: 40_523,
          cache_creation_input_tokens: 16_070,
        },
      })
    );
    expect(c.snapshot()).toMatchObject({
      tokensIn: 18,
      tokensOut: 173,
      tokensCacheRead: 40_523,
      tokensCacheWrite: 16_070,
    });
  });

  /**
   * The shape of a real run, numbers and all: three Haiku responses whose
   * stream usage carries the input side and a placeholder for output (3, 4, 4),
   * then a result with the real output (567) and Claude's own cost.
   *
   * The per-model buckets used to be left as the stream had counted them, so
   * the 556 output tokens that only the result knew about belonged to no model
   * and were priced at the default rate — Opus. The list price of a Haiku
   * session came out at nearly twice what Claude Code itself reported.
   */
  describe('a finished run is priced at its own model’s rates', () => {
    const haiku = 'claude-haiku-4-5-20251001';
    const response = (id: string, cacheRead: number, cacheWrite: number, output: number) =>
      JSON.stringify({
        type: 'assistant',
        message: {
          id,
          model: haiku,
          usage: {
            input_tokens: 8,
            output_tokens: output,
            cache_read_input_tokens: cacheRead,
            cache_creation_input_tokens: cacheWrite,
            cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: cacheWrite },
          },
          content: [{ type: 'text', text: 'working' }],
        },
      });
    const usage = {
      input_tokens: 25,
      output_tokens: 567,
      cache_read_input_tokens: 66_702,
      cache_creation_input_tokens: 6_570,
      cache_creation: { ephemeral_1h_input_tokens: 6_570, ephemeral_5m_input_tokens: 0 },
    };
    const stream = () => {
      const c = new TelemetryCollector();
      c.ingestLine(response('msg_1', 18_138, 5_904, 3));
      c.ingestLine(response('msg_2', 24_042, 480, 4));
      c.ingestLine(response('msg_3', 24_522, 186, 4));
      return c;
    };

    it('agrees with Claude Code’s own figure once the result arrives', () => {
      const c = stream();
      c.ingestLine(
        JSON.stringify({
          type: 'result',
          total_cost_usd: 0.0226702,
          num_turns: 3,
          usage,
          modelUsage: {
            [haiku]: { inputTokens: 25, outputTokens: 567, cacheReadInputTokens: 66_702, cacheCreationInputTokens: 6_570 },
          },
        })
      );
      const reading = c.snapshot();
      expect(reading.tokensOut).toBe(567);
      // 25×$1 + 567×$5 + 66,702×$0.10 + 6,570×$2 (one-hour write), per million.
      expect(reading.listCostUsd).toBeCloseTo(0.0226702, 7);
      expect(reading.listCostUsd).toBeCloseTo(reading.costUsd, 7);
      expect(reading.model).toBe(haiku);
    });

    it('still does when the result names no models', () => {
      const c = stream();
      c.ingestLine(JSON.stringify({ type: 'result', total_cost_usd: 0.0226702, num_turns: 3, usage }));
      expect(c.snapshot().listCostUsd).toBeCloseTo(0.0226702, 7);
    });

    it('includes a model that only did background work', () => {
      // The top-level usage can leave out a model the per-model figures name.
      const c = stream();
      c.ingestLine(
        JSON.stringify({
          type: 'result',
          total_cost_usd: 0.05,
          num_turns: 3,
          usage,
          modelUsage: {
            [haiku]: { inputTokens: 25, outputTokens: 567, cacheReadInputTokens: 66_702, cacheCreationInputTokens: 6_570 },
            'claude-opus-5-5': { inputTokens: 1_000, outputTokens: 200, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
          },
        })
      );
      const reading = c.snapshot();
      expect(reading.tokensIn).toBe(1_025);
      expect(reading.tokensOut).toBe(767);
      // Haiku's share as before, plus 1,000×$4 + 200×$20 per million on Opus 5.5.
      expect(reading.listCostUsd).toBeCloseTo(0.0226702 + 0.004 + 0.004, 7);
    });

    it('says so while the run is in flight: output is not yet known', () => {
      // Before the result, only the placeholder output has been seen.
      expect(stream().snapshot().tokensOut).toBe(11);
      expect(stream().snapshot().costIsEstimate).toBe(true);
    });
  });

  it('prices cache reads far below fresh input', () => {
    const fresh = new TelemetryCollector();
    fresh.ingestLine(turn({ input_tokens: 100_000 }));

    const cached = new TelemetryCollector();
    cached.ingestLine(turn({ cache_read_input_tokens: 100_000 }));

    expect(cached.snapshot().costUsd).toBeLessThan(fresh.snapshot().costUsd);
  });

  it('replaces the estimate with the authoritative figure and stops adding', () => {
    const c = new TelemetryCollector();
    c.ingestLine(turn({ input_tokens: 50_000, output_tokens: 5_000 }));
    expect(c.snapshot().costIsEstimate).toBe(true);

    c.ingestLine(JSON.stringify({ type: 'result', total_cost_usd: 0.2256, num_turns: 2 }));
    expect(c.snapshot().costUsd).toBeCloseTo(0.2256);
    expect(c.snapshot().costIsEstimate).toBe(false);

    // A turn arriving after the result must not be added to the real number.
    c.ingestLine(turn({ input_tokens: 999_999 }));
    expect(c.snapshot().costUsd).toBeCloseTo(0.2256);
  });
});


/**
 * Paths a person can read.
 *
 * Claude reports `file_path` absolute, so every surface showed
 * `/private/tmp/claude-501/-Users-…/scratchpad/fleet-a/src/lru.ts`. Unreadable
 * on a ticket, and it publishes the directory layout of whoever ran the agent
 * to everyone who can see the issue.
 */
describe('file paths are relative to the repo', () => {
  const workdir = '/private/tmp/scratch/fleet-a';

  function write(path: string) {
    return JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: path } }] },
    });
  }

  it('strips the working directory', () => {
    const c = new TelemetryCollector(Date.now, workdir);
    c.ingestLine(write(`${workdir}/src/lru.ts`));
    expect(c.snapshot().filesTouched).toEqual(['src/lru.ts']);
  });

  it('handles the /private symlink macOS reports inconsistently', () => {
    // The workdir may be given as /var/… while the agent reports /private/var/…
    const c = new TelemetryCollector(Date.now, '/var/folders/x/repo');
    c.ingestLine(write('/private/var/folders/x/repo/src/a.ts'));
    expect(c.snapshot().filesTouched).toEqual(['src/a.ts']);
  });

  it('leaves a path outside the repo alone rather than mangling it', () => {
    // Truncating an unrelated path would produce a plausible-looking lie about
    // which file was touched.
    const c = new TelemetryCollector(Date.now, workdir);
    c.ingestLine(write('/etc/hosts'));
    expect(c.snapshot().filesTouched).toEqual(['/etc/hosts']);
  });

  it('is a no-op when no working directory is known', () => {
    const c = new TelemetryCollector();
    c.ingestLine(write('/abs/path/file.ts'));
    expect(c.snapshot().filesTouched).toEqual(['/abs/path/file.ts']);
  });
});

/**
 * A dispatched agent has no status line, but it spends the same subscription
 * windows. The stream reports them; the shape below is from a real run.
 */
describe('the account’s windows, from the stream', () => {
  const rateLimit = (five: number, seven: number) =>
    JSON.stringify({
      type: 'rate_limit_event',
      session_id: 'ec88c0dc-cf72-4fb4-89d5-11d8d257d4a9',
      rate_limit_info: {
        status: 'allowed',
        rateLimitType: 'five_hour',
        unifiedWindows: {
          five_hour: { utilization: five, resetsAt: 1790851200 },
          seven_day: { utilization: seven, resetsAt: 1791219600 },
        },
      },
    });

  it('has nothing to report before the stream has said anything', () => {
    expect(new TelemetryCollector().windowReading()).toBeNull();
  });

  it('reports them as percentages, with the session and what it has cost so far', () => {
    const c = new TelemetryCollector(() => 1_000);
    c.ingestLine(rateLimit(0.15, 0.41));
    expect(c.windowReading()).toEqual({
      t: 1_000,
      s: 'ec88c0dc-cf72-4fb4-89d5-11d8d257d4a9',
      c: 0,
      five: { used: 15, resetsAt: 1790851200 },
      seven: { used: 41, resetsAt: 1791219600 },
    });
  });

  it('keeps the last reading of a window the next event leaves out', () => {
    const c = new TelemetryCollector(() => 1_000);
    c.ingestLine(rateLimit(0.15, 0.41));
    c.ingestLine(
      JSON.stringify({
        type: 'rate_limit_event',
        session_id: 'ec88c0dc-cf72-4fb4-89d5-11d8d257d4a9',
        rate_limit_info: { unifiedWindows: { seven_day: { utilization: 0.42, resetsAt: 1791219600 } } },
      })
    );
    expect(c.windowReading()).toMatchObject({ five: { used: 15 }, seven: { used: 42 } });
  });
});
