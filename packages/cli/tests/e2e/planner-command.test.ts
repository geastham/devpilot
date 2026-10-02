import { describe, it, expect } from 'vitest';
import { formatPlannerStats, type PlannerEpisodesResponse } from '../../src/commands/planner';

/** What `devpilot planner stats` says, and what it is careful not to say. */

const summary = (over: Partial<PlannerEpisodesResponse['summary']> = {}): PlannerEpisodesResponse['summary'] => ({
  episodes: 12,
  withPlan: 11,
  ended: 9,
  calls: 30,
  callOutcomes: { valid: 26, invalid: 1, error: 3 },
  refinements: 14,
  refinementsImproved: 4,
  truncated: 2,
  reviews: { approve: 9, refine: 3, abort: 1 },
  tokensInput: 310_000,
  tokensOutput: 96_000,
  firstAttemptPassRate: 0.82,
  filePrecision: 0.7,
  fileRecall: 0.55,
  sameWaveCollisions: 3,
  ...over,
});
const body = (over: Partial<PlannerEpisodesResponse['summary']> = {}) => ({
  since: '2026-07-04T00:00:00.000Z',
  truncated: false,
  summary: summary(over),
});

describe('devpilot planner stats', () => {
  it('reports calls, reviews and how the plans ran', () => {
    const text = formatPlannerStats(body()).join('\n');
    expect(text).toContain('Plans since 2026-07-04: 11 persisted; 9 finished running.');
    expect(text).toContain('never produced a plan (abandoned at review, or every call failed): 1');
    expect(text).toContain('Calls: 30 — valid plan 26, rejected 1, failed 3');
    expect(text).toContain('Refinements: 14, of which 4 scored above the plan they were given');
    expect(text).toContain('Cut off at the token ceiling: 2.');
    expect(text).toContain('Approved 9, sent back with changes 3, abandoned 1');
    expect(text).toContain('Tasks that finished on their first attempt: 82%');
    expect(text).toContain('Of the files tasks changed, the share the plan had named: 55%');
    expect(text).toContain('changed the same file: 3');
  });

  it('says these are not a measure of whether the code was right', () => {
    expect(formatPlannerStats(body()).join('\n')).toContain('None of them says whether the code was right.');
  });

  it('says "not measured yet" rather than 0% when nothing recorded a figure', () => {
    const text = formatPlannerStats(body({ firstAttemptPassRate: null, filePrecision: null, fileRecall: null })).join('\n');
    expect(text).toContain('first attempt: not measured yet');
    expect(text).not.toContain('NaN');
    expect(text).not.toMatch(/: 0%/);
  });

  it('explains plans that have outcomes and no recorded calls', () => {
    const text = formatPlannerStats(body({ calls: 0, callOutcomes: {}, refinements: 0, truncated: 0 })).join('\n');
    expect(text).toContain('Calls are recorded from this version on');
  });

  it('does not report on runs when none has finished', () => {
    const text = formatPlannerStats(body({ ended: 0 })).join('\n');
    expect(text).toContain('No plan has finished running yet.');
    expect(text).not.toContain('first attempt');
  });

  it('says so when there is nothing at all', () => {
    expect(formatPlannerStats(body({ episodes: 0, withPlan: 0 }))[0]).toBe('No plans since 2026-07-04.');
  });
});
