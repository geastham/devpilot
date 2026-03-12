/**
 * Scoring Engine
 *
 * Calculates composite benchmark scores per methodology rubric.
 */

import type {
  CompositeScore,
  ScoreComponent,
  ScenarioResult,
  WaveAnalysis,
} from '../types';
import { SCORING_CONSTANTS } from '../config';

/**
 * Default scoring weights from BENCHMARK-METHODOLOGY.md:
 * - Acceptance tests: 30%
 * - Wave plan quality: 25%
 * - First-attempt pass rate: 20%
 * - Completion time: 15%
 * - Rework ratio: 10%
 */
export const DEFAULT_WEIGHTS = {
  acceptanceTests: 0.30,
  wavePlanQuality: 0.25,
  firstAttemptPassRate: 0.20,
  completionTime: 0.15,
  reworkRatio: 0.10,
} as const;

export interface ScoringConfig {
  weights?: typeof DEFAULT_WEIGHTS;
  /** Ideal completion time for perfect score (ms) */
  idealTimeMs?: number;
  /** Maximum completion time before zero score (ms) */
  maxTimeMs?: number;
}

/**
 * Scoring engine for computing composite benchmark scores.
 */
export class ScoringEngine {
  private weights: typeof DEFAULT_WEIGHTS;
  private idealTimeMs: number;
  private maxTimeMs: number;

  constructor(config: ScoringConfig = {}) {
    this.weights = config.weights ?? DEFAULT_WEIGHTS;
    this.idealTimeMs = config.idealTimeMs ?? SCORING_CONSTANTS.IDEAL_TIME_MS;
    this.maxTimeMs = config.maxTimeMs ?? SCORING_CONSTANTS.MAX_TIME_MS;
  }

  /**
   * Calculate composite score for a scenario result.
   */
  calculateScore(
    result: ScenarioResult,
    waveAnalysis?: WaveAnalysis
  ): CompositeScore {
    // Calculate individual components
    const acceptanceTests = this.scoreAcceptanceTests(result);
    const wavePlanQuality = this.scoreWavePlanQuality(waveAnalysis);
    const firstAttemptPassRate = this.scoreFirstAttemptPassRate(result);
    const completionTime = this.scoreCompletionTime(result);
    const reworkRatio = this.scoreReworkRatio(result);

    // Calculate total weighted score
    const total =
      acceptanceTests.weighted +
      wavePlanQuality.weighted +
      firstAttemptPassRate.weighted +
      completionTime.weighted +
      reworkRatio.weighted;

    return {
      total: Math.round(total * 100) / 100,
      breakdown: {
        acceptanceTests,
        wavePlanQuality,
        firstAttemptPassRate,
        completionTime,
        reworkRatio,
      },
      grade: this.calculateGrade(total),
    };
  }

  /**
   * Score acceptance tests.
   * Raw value: pass rate (0-1)
   * Normalized: pass rate * 100 (0-100)
   */
  private scoreAcceptanceTests(result: ScenarioResult): ScoreComponent {
    const raw = result.acceptanceResults.passRate;
    const normalized = raw * 100;
    const weighted = normalized * this.weights.acceptanceTests;

    return {
      raw,
      normalized,
      weighted,
      weight: this.weights.acceptanceTests,
    };
  }

  /**
   * Score wave plan quality.
   * Uses the wave analysis score (0-25) if available, scaled to 0-100.
   */
  private scoreWavePlanQuality(waveAnalysis?: WaveAnalysis): ScoreComponent {
    // Wave analysis score is 0-25, scale to 0-100
    const raw = waveAnalysis?.score ?? 0;
    const normalized = (raw / 25) * 100;
    const weighted = normalized * this.weights.wavePlanQuality;

    return {
      raw,
      normalized,
      weighted,
      weight: this.weights.wavePlanQuality,
    };
  }

  /**
   * Score first-attempt pass rate.
   * Raw value: first attempt pass rate (0-1)
   */
  private scoreFirstAttemptPassRate(result: ScenarioResult): ScoreComponent {
    const raw = result.firstAttemptPassRate;
    const normalized = raw * 100;
    const weighted = normalized * this.weights.firstAttemptPassRate;

    return {
      raw,
      normalized,
      weighted,
      weight: this.weights.firstAttemptPassRate,
    };
  }

  /**
   * Score completion time.
   * Linear scale: idealTimeMs = 100, maxTimeMs = 0
   * Below ideal = 100 (capped)
   * Above max = 0 (capped)
   */
  private scoreCompletionTime(result: ScenarioResult): ScoreComponent {
    const raw = result.wallClockMs;

    let normalized: number;
    if (raw <= this.idealTimeMs) {
      // Perfect score for completion at or under ideal time
      normalized = 100;
    } else if (raw >= this.maxTimeMs) {
      // Zero score for exceeding max time
      normalized = 0;
    } else {
      // Linear interpolation between ideal and max
      const range = this.maxTimeMs - this.idealTimeMs;
      const overtime = raw - this.idealTimeMs;
      normalized = 100 * (1 - overtime / range);
    }

    const weighted = normalized * this.weights.completionTime;

    return {
      raw,
      normalized,
      weighted,
      weight: this.weights.completionTime,
    };
  }

  /**
   * Score rework ratio.
   * Raw value: rework ratio (1.0 = perfect, higher = more rework)
   * Normalized: max(0, 100 - (ratio - 1) * 100)
   * A ratio of 1.0 = 100 points
   * A ratio of 2.0 = 0 points
   */
  private scoreReworkRatio(result: ScenarioResult): ScoreComponent {
    const raw = result.reworkRatio ?? 1.0;

    // Convert ratio to score: 1.0 -> 100, 2.0 -> 0
    const normalized = Math.max(0, Math.min(100, 100 - (raw - 1) * 100));
    const weighted = normalized * this.weights.reworkRatio;

    return {
      raw,
      normalized,
      weighted,
      weight: this.weights.reworkRatio,
    };
  }

  /**
   * Calculate letter grade from total score.
   */
  private calculateGrade(total: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (total >= SCORING_CONSTANTS.GRADES.A) return 'A';
    if (total >= SCORING_CONSTANTS.GRADES.B) return 'B';
    if (total >= SCORING_CONSTANTS.GRADES.C) return 'C';
    if (total >= SCORING_CONSTANTS.GRADES.D) return 'D';
    return 'F';
  }

  /**
   * Format a score component for display.
   */
  static formatComponent(component: ScoreComponent): string {
    const raw =
      typeof component.raw === 'number' && component.raw < 10
        ? component.raw.toFixed(2)
        : Math.round(component.raw);
    return `${component.normalized.toFixed(1)}/100 (raw: ${raw}, weighted: ${component.weighted.toFixed(1)})`;
  }

  /**
   * Get a summary string for a composite score.
   */
  static formatScore(score: CompositeScore): string {
    return `${score.total.toFixed(1)}/100 (${score.grade})`;
  }
}

/**
 * Create a scoring engine with default or custom config.
 */
export function createScoringEngine(config?: ScoringConfig): ScoringEngine {
  return new ScoringEngine(config);
}

/**
 * Quick helper to calculate score without instantiating engine.
 */
export function calculateScore(
  result: ScenarioResult,
  waveAnalysis?: WaveAnalysis,
  config?: ScoringConfig
): CompositeScore {
  const engine = new ScoringEngine(config);
  return engine.calculateScore(result, waveAnalysis);
}
