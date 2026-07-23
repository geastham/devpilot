/**
 * Analysis Module
 *
 * Scoring, wave analysis, comparison, and trend analysis.
 */

export {
  ScoringEngine,
  DEFAULT_WEIGHTS,
  createScoringEngine,
  calculateScore,
} from './scoring';
export type { ScoringConfig } from './scoring';

export {
  WaveAnalyzer,
  createWaveAnalyzer,
  analyzeWavePlan,
} from './wave-analyzer';

export {
  Comparator,
  createComparator,
  compareScenarios,
} from './comparator';

export {
  TrendAnalyzer,
  createTrendAnalyzer,
  analyzeTrends,
} from './trend';
