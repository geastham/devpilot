import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { wikiArticleStatusValues, wikiSourceTypeValues, wikiLogActionValues } from './enums';

// ============================================================================
// Wiki Raw Sources
// ============================================================================

/**
 * Raw source materials that feed the wiki compiler.
 * These are immutable once ingested — the LLM reads but never modifies them.
 * Sources include: session logs, commit diffs, specs, architecture decisions.
 */
export const wikiSources = sqliteTable('wiki_sources', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  /** Source type: session_log, commit, spec, decision, manual */
  sourceType: text('source_type', { enum: wikiSourceTypeValues }).notNull(),
  /** Human-readable title */
  title: text('title').notNull(),
  /** Raw content of the source material */
  content: text('content').notNull(),
  /** Origin identifier (e.g. session ID, commit SHA, file path) */
  origin: text('origin'),
  /** Repository this source belongs to */
  repo: text('repo'),
  /** Hash of content for deduplication */
  contentHash: text('content_hash').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================================
// Wiki Articles
// ============================================================================

/**
 * Compiled wiki articles — LLM-generated and maintained markdown.
 * These are the "compiled output" of the knowledge base.
 * Articles include: architecture overviews, entity pages, decision logs,
 * pattern catalogs, and cross-referenced concept pages.
 */
export const wikiArticles = sqliteTable('wiki_articles', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  /** URL-safe slug for the article (e.g. "authentication-flow") */
  slug: text('slug').notNull().unique(),
  /** Article title */
  title: text('title').notNull(),
  /** Category for organization (e.g. "architecture", "patterns", "decisions") */
  category: text('category').notNull(),
  /** Compiled markdown content with backlinks */
  content: text('content').notNull(),
  /** Status: active, stale, archived */
  status: text('status', { enum: wikiArticleStatusValues }).notNull().default('active'),
  /** Backlinks — slugs of related articles */
  backlinks: text('backlinks', { mode: 'json' }).$type<string[]>().default([]),
  /** Source IDs that contributed to this article */
  sourceIds: text('source_ids', { mode: 'json' }).$type<string[]>().default([]),
  /** Repository this article belongs to */
  repo: text('repo'),
  /** Version counter — incremented on each recompile */
  version: integer('version').notNull().default(1),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================================
// Wiki Log
// ============================================================================

/**
 * Append-only chronicle of all wiki operations.
 * Tracks ingests, queries, lint runs, and compiles for auditability.
 */
export const wikiLog = sqliteTable('wiki_log', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  /** Action type: ingest, compile, query, lint, update */
  action: text('action', { enum: wikiLogActionValues }).notNull(),
  /** Summary of what happened */
  summary: text('summary').notNull(),
  /** IDs of articles affected */
  articleIds: text('article_ids', { mode: 'json' }).$type<string[]>().default([]),
  /** IDs of sources involved */
  sourceIds: text('source_ids', { mode: 'json' }).$type<string[]>().default([]),
  /** Repository context */
  repo: text('repo'),
  /** Token usage for this operation */
  tokensUsed: integer('tokens_used'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================================
// Relations
// ============================================================================

export const wikiSourcesRelations = relations(wikiSources, ({ many }) => ({}));
export const wikiArticlesRelations = relations(wikiArticles, ({ many }) => ({}));
export const wikiLogRelations = relations(wikiLog, ({ many }) => ({}));
