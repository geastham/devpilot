import { describe, it, expect } from 'vitest';
import {
  SCORE_MODEL,
  SCORE_TOTAL,
  scoreModelIsValid,
  clampDimension,
  totalFrom,
} from '../src/score/model';

/**
 * TRD 16 T16-AC-02. These are cheap and they are the whole point of the module:
 * the divergence this model exists to fix (implementation 5×200 vs DESIGN.md
 * §8.1's 250/250/200/200/100, with a seeded velocityTrend of 138 against a cap
 * of 100) would have failed here on the day it was introduced.
 */
describe('score model', () => {
  it('sums to exactly the total', () => {
    expect(scoreModelIsValid()).toBe(true);
    expect(SCORE_MODEL.reduce((s, d) => s + d.max, 0)).toBe(SCORE_TOTAL);
  });

  it('declares every dimension exactly once', () => {
    const keys = SCORE_MODEL.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('includes parallelizationQuality — the dimension this product is for', () => {
    expect(SCORE_MODEL.map((d) => d.key)).toContain('parallelizationQuality');
  });

  it('gives every dimension a meaning and a method', () => {
    // A public score needs a public method, per dimension, or it is astrology.
    for (const d of SCORE_MODEL) {
      expect(d.meaning.length).toBeGreaterThan(10);
      expect(d.method.length).toBeGreaterThan(20);
      expect(d.max).toBeGreaterThan(0);
    }
  });

  it('weights runway and utilization as the largest part of the job', () => {
    // The claim the model encodes: keeping the fleet fed IS conducting well.
    // If someone reweights below this, they are changing the product's opinion
    // and should have to change this test to do it.
    const fed =
      SCORE_MODEL.find((d) => d.key === 'runwayHealth')!.max +
      SCORE_MODEL.find((d) => d.key === 'fleetUtilization')!.max;
    expect(fed).toBeGreaterThanOrEqual(SCORE_TOTAL * 0.4);
  });

  it('clamps a dimension to its own max, not a shared constant', () => {
    expect(clampDimension('velocityTrend', 138)).toBe(100);
    expect(clampDimension('runwayHealth', 138)).toBe(138);
    expect(clampDimension('runwayHealth', -5)).toBe(0);
  });

  it('totals a full set to at most the maximum', () => {
    const perfect = Object.fromEntries(SCORE_MODEL.map((d) => [d.key, d.max]));
    expect(totalFrom(perfect)).toBe(SCORE_TOTAL);
    expect(totalFrom({})).toBe(0);
  });
});
