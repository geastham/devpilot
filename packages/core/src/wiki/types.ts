// ============================================================================
// Wiki System Types
// ============================================================================

import type { WikiSourceType, WikiArticleStatus, WikiLogAction } from '../db/schema/enums';

/** Result of an AI generation call */
export interface WikiGenerationResult {
  content: string;
  tokensInput: number;
  tokensOutput: number;
  durationMs: number;
  model: string;
}

/** A compiled wiki article ready for persistence */
export interface CompiledArticle {
  slug: string;
  title: string;
  category: string;
  content: string;
  backlinks: string[];
  sourceIds: string[];
}

/** Result of ingesting a raw source into the wiki */
export interface IngestResult {
  sourceId: string;
  articlesCreated: string[];
  articlesUpdated: string[];
  tokensUsed: number;
}

/** Result of a wiki query */
export interface QueryResult {
  answer: string;
  citedArticles: string[];
  tokensUsed: number;
  /** If the answer is valuable enough, it becomes a new article */
  newArticleSlug?: string;
}

/** A lint finding from wiki maintenance */
export interface LintFinding {
  type: 'stale' | 'orphaned' | 'contradiction' | 'gap' | 'broken_link';
  articleSlug: string;
  description: string;
  suggestion: string;
}

/** Result of a wiki lint operation */
export interface LintResult {
  findings: LintFinding[];
  articlesMarkedStale: string[];
  tokensUsed: number;
}

/** Wiki status summary */
export interface WikiStatus {
  totalSources: number;
  totalArticles: number;
  activeArticles: number;
  staleArticles: number;
  archivedArticles: number;
  totalLogEntries: number;
  lastActivity?: Date;
  categories: Record<string, number>;
}

/** Configuration for the wiki compiler */
export interface WikiCompilerConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  repo: string;
  wikiDir: string;
}

/** Options for wiki initialization */
export interface WikiInitOptions {
  repo: string;
  wikiDir: string;
}

/** Index entry for the wiki table of contents */
export interface WikiIndexEntry {
  slug: string;
  title: string;
  category: string;
  status: WikiArticleStatus;
  updatedAt: Date;
  backlinks: string[];
}
