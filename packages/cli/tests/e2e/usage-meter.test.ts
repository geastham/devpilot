import { describe, it, expect } from 'vitest';
import {
  countUsage,
  dominantModel,
  initialUsageMeter,
  priceAtReference,
  priceMeter,
  priceUsage,
  totalTokens,
} from '../../src/utils/usage-meter';

/**
 * The meter is what every token figure and every "at API rates" figure in the
 * product is made from. Two ways for it to be wrong look identical on a
 * dashboard: counting a response more than once, and pricing one model's
 * tokens at another's rate.
 */

describe('counting', () => {
  it('counts a repeated response once and corrects it if its usage grew', () => {
    const m = initialUsageMeter();
    countUsage(m, 'msg_1', { output_tokens: 4 }, 'claude-opus-5');
    // A later line of the same response carrying a larger figure: replace.
    countUsage(m, 'msg_1', { output_tokens: 120 }, 'claude-opus-5');

    expect(m.totals.output).toBe(120);
    expect(m.byModel?.['claude-opus-5'].output).toBe(120);
    expect(m.turns).toBe(1);
  });

  it('keeps each model in its own bucket', () => {
    const m = initialUsageMeter();
    countUsage(m, 'a', { output_tokens: 100 }, 'claude-opus-5');
    countUsage(m, 'b', { output_tokens: 7 }, 'claude-haiku-4-5-20251001');

    expect(m.byModel?.['claude-opus-5'].output).toBe(100);
    expect(m.byModel?.['claude-haiku-4-5-20251001'].output).toBe(7);
    expect(m.totals.output).toBe(107);
  });

  it('does not treat the client talking to itself as a model', () => {
    const m = initialUsageMeter();
    countUsage(m, 'a', { output_tokens: 5 }, '<synthetic>');
    expect(m.byModel ?? {}).toEqual({});
    expect(m.totals.output).toBe(5);
  });

  it('never lets the one-hour share exceed the write it is part of', () => {
    const m = initialUsageMeter();
    countUsage(
      m,
      'a',
      { cache_creation_input_tokens: 100, cache_creation: { ephemeral_1h_input_tokens: 999 } },
      'claude-opus-5',
    );
    expect(m.totals.cacheWrite).toBe(100);
    expect(m.totals.cacheWrite1h).toBe(100);
  });
});

describe('pricing', () => {
  /**
   * Checked against Claude Code's own accounting for a real session: its
   * `cost-state` record reported $12.076 for exactly these Opus 5 tokens, all
   * of the cache writes at the one-hour lifetime.
   */
  it('reproduces Claude Code’s own figure for a real Opus 5 session', () => {
    const cost = priceUsage(
      { input: 274, output: 66_952, cacheRead: 12_197_878, cacheWrite: 430_228, cacheWrite1h: 430_228 },
      'claude-opus-5[1m]',
    );
    expect(cost).toBeCloseTo(12.076, 2);
  });

  it('prices a five-minute cache write below a one-hour one', () => {
    const base = { input: 0, output: 0, cacheRead: 0, cacheWrite: 1_000_000 };
    expect(priceUsage({ ...base, cacheWrite1h: 0 }, 'claude-opus-5')).toBeCloseTo(6.25);
    expect(priceUsage({ ...base, cacheWrite1h: 1_000_000 }, 'claude-opus-5')).toBeCloseTo(10);
  });

  it('does not price a cheaper model at Opus rates', () => {
    const usage = { input: 0, output: 1_000_000, cacheRead: 0, cacheWrite: 0 };
    expect(priceUsage(usage, 'claude-opus-5')).toBeCloseTo(25);
    expect(priceUsage(usage, 'claude-opus-5-5')).toBeCloseTo(20);
    expect(priceUsage(usage, 'claude-sonnet-5-5')).toBeCloseTo(10);
    expect(priceUsage(usage, 'claude-haiku-4-5-20251001')).toBeCloseTo(5);
  });

  it('matches the longer model name first', () => {
    // `claude-opus-5-5` must not be priced as `claude-opus-5`.
    const read = { input: 0, output: 0, cacheRead: 1_000_000, cacheWrite: 0 };
    expect(priceUsage(read, 'claude-opus-5-5')).toBeCloseTo(0.2);
    expect(priceUsage(read, 'claude-opus-5')).toBeCloseTo(0.5);
  });

  it('prices an unrecognised model at the default rather than at nothing', () => {
    const usage = { input: 0, output: 1_000_000, cacheRead: 0, cacheWrite: 0 };
    expect(priceUsage(usage, 'some-future-model')).toBeGreaterThan(0);
  });

  it('prices a mixed session model by model', () => {
    const m = initialUsageMeter();
    countUsage(m, 'a', { output_tokens: 1_000_000 }, 'claude-opus-5');
    countUsage(m, 'b', { output_tokens: 1_000_000 }, 'claude-haiku-4-5');
    expect(priceMeter(m)).toBeCloseTo(30);
  });

  it('still prices a meter restored from before models were recorded', () => {
    const legacy = {
      totals: { input: 0, output: 1_000_000, cacheRead: 0, cacheWrite: 0 },
      turns: 3,
      last: null,
    };
    expect(priceMeter(legacy)).toBeCloseTo(25);
  });

  it('prices what was counted before model tracking alongside what came after', () => {
    // A bridge upgraded mid-session: an old total, then attributed turns.
    const m = {
      totals: { input: 0, output: 1_000_000, cacheRead: 0, cacheWrite: 0 },
      turns: 1,
      last: null,
    };
    countUsage(m, 'b', { output_tokens: 1_000_000 }, 'claude-haiku-4-5');
    // 1M unattributed at the default (25) + 1M Haiku (5).
    expect(priceMeter(m)).toBeCloseTo(30);
  });
});

describe('the reference price', () => {
  const million = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

  it('is the dearest model for output when a session is mostly output', () => {
    const r = priceAtReference({ ...million, output: 1_000_000 })!;
    expect(r.costUsd).toBeCloseTo(50);
    expect(r.model).toBe('claude-fable-5-1');
  });

  /**
   * No model is dearest at everything. The newest one charges most for output
   * and less than its predecessor for a cached read — and a long agent session
   * is nearly all cached reads, so "the most expensive model" depends on the
   * tokens. The reference follows them.
   */
  it('is a different model when a session is mostly cached reads', () => {
    const r = priceAtReference({ ...million, cacheRead: 1_000_000 })!;
    expect(r.costUsd).toBeCloseTo(1);
    expect(r.model).toBe('claude-fable-5');
  });

  it('is never below what the session’s own model charged', () => {
    for (const model of ['claude-fable-5-1', 'claude-opus-5', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5']) {
      const usage = { input: 40_000, output: 90_000, cacheRead: 9_000_000, cacheWrite: 300_000, cacheWrite1h: 100_000 };
      expect(priceAtReference(usage)!.costUsd).toBeGreaterThanOrEqual(priceUsage(usage, model));
    }
  });

  it('has nothing to say about no tokens', () => {
    expect(priceAtReference(million)).toBeNull();
  });
});

describe('dominantModel', () => {
  it('names the model that processed the most tokens', () => {
    const m = initialUsageMeter();
    countUsage(m, 'a', { cache_read_input_tokens: 5_000_000 }, 'claude-opus-5[1m]');
    countUsage(m, 'b', { input_tokens: 28_000 }, 'claude-haiku-4-5-20251001');
    // The context-window suffix is dropped so one model is not two rows.
    expect(dominantModel(m)).toBe('claude-opus-5');
  });

  it('is null when no model has answered', () => {
    expect(dominantModel(initialUsageMeter())).toBeNull();
  });
});

describe('totalTokens', () => {
  it('does not count the one-hour share twice', () => {
    expect(totalTokens({ input: 1, output: 2, cacheRead: 3, cacheWrite: 4, cacheWrite1h: 4 })).toBe(10);
  });
});
