import type { WikiCompiler } from '../wiki/compiler';
import type { IngestResult } from '../wiki/types';
import type { MemPalaceService } from './service';

// ============================================================================
// Wiki ↔ MemPalace Bridge
// ============================================================================
//
// This bridge coordinates the two memory layers without entangling them.
// The Wiki remains fully in charge of its `/wiki` folder, compilation,
// refinement, and backlink generation. The bridge just:
//
//   1. Mirrors compiled wiki articles into MemPalace drawers, so that
//      prompt-time retrieval benefits from the palace's structured layout
//      and L0-L3 tiered loading.
//
//   2. Feeds MemPalace KG contradictions back to the Wiki as lint
//      candidates — when the palace detects a fact contradicting an
//      existing one, the matching wiki article is marked for recompile.
//
// Both directions are strictly advisory. If MemPalace is disabled, the
// Wiki continues to function exactly as before.
// ============================================================================

export interface WikiBridgeConfig {
  /** Wing slug to mirror wiki content into. Usually the repo identifier. */
  wingSlug: string;
  /** If true, attempt to derive KG triples from wiki articles. */
  extractFacts?: boolean;
}

export class WikiPalaceBridge {
  private wiki: WikiCompiler;
  private palace: MemPalaceService;
  private config: WikiBridgeConfig;

  constructor(
    wiki: WikiCompiler,
    palace: MemPalaceService,
    config: WikiBridgeConfig
  ) {
    this.wiki = wiki;
    this.palace = palace;
    this.config = config;
  }

  // --------------------------------------------------------------------------
  // Wiki → MemPalace: mirror articles as drawers
  // --------------------------------------------------------------------------

  /**
   * After a wiki ingest, mirror the created/updated articles into MemPalace
   * as drawers. The Wiki is the source of truth; drawers are copies indexed
   * by article slug for efficient recall.
   *
   * Call this immediately after `WikiCompiler.ingest()` returns.
   */
  async mirrorIngest(result: IngestResult): Promise<{ mirroredCount: number }> {
    if (!this.palace.enabled) return { mirroredCount: 0 };

    const allSlugs = [...result.articlesCreated, ...result.articlesUpdated];
    let mirroredCount = 0;

    for (const slug of allSlugs) {
      const article = await this.wiki.getArticle(slug);
      if (!article) continue;

      // Room slug = article category. This gives us a natural topical
      // organization (architecture, patterns, decisions, etc.) within the
      // wing without requiring any separate taxonomy.
      await this.palace.addDrawer({
        wingSlug: this.config.wingSlug,
        roomSlug: article.category,
        roomName: capitalize(article.category),
        roomTopic: article.category,
        memoryType: mapCategoryToMemoryType(article.category),
        label: article.title,
        content: article.content,
        source: { kind: 'wiki_article', ref: article.slug },
        tags: (article.backlinks ?? []).map((b) => `backlink:${b}`),
        salience: article.status === 'active' ? 1 : 0,
      });

      // Optional: extract simple facts from the article.
      // The LocalShim keeps these as KG triples so contradictions can be
      // surfaced later. We use a deliberately minimal heuristic: the first
      // sentence often has the form "X is Y" or "X provides Y".
      if (this.config.extractFacts) {
        await this.maybeExtractFact(article.slug, article.content);
      }

      mirroredCount++;
    }

    return { mirroredCount };
  }

  /**
   * Mirror a single article explicitly. Useful for CLI flows and backfill.
   */
  async mirrorArticle(slug: string): Promise<boolean> {
    const article = await this.wiki.getArticle(slug);
    if (!article || !this.palace.enabled) return false;

    await this.palace.addDrawer({
      wingSlug: this.config.wingSlug,
      roomSlug: article.category,
      roomName: capitalize(article.category),
      roomTopic: article.category,
      memoryType: mapCategoryToMemoryType(article.category),
      label: article.title,
      content: article.content,
      source: { kind: 'wiki_article', ref: article.slug },
      tags: (article.backlinks ?? []).map((b) => `backlink:${b}`),
      salience: article.status === 'active' ? 1 : 0,
    });

    return true;
  }

  // --------------------------------------------------------------------------
  // MemPalace → Wiki: surface contradictions as lint candidates
  // --------------------------------------------------------------------------

  /**
   * Given a set of KG contradictions (typically returned from
   * `MemPalaceService.addFact()`), build a list of wiki article slugs that
   * should be re-examined. Callers can pass these to `WikiCompiler.ingest()`
   * with fresh source material, or mark the articles stale directly.
   *
   * The bridge itself never mutates the wiki — it only advises.
   */
  candidateArticlesFromContradictions(
    contradictions: {
      subject: string;
      predicate: string;
      oldObject: string;
      newObject: string;
      oldDrawerId?: string;
    }[]
  ): { articleSlug: string; reason: string }[] {
    const candidates: { articleSlug: string; reason: string }[] = [];
    for (const c of contradictions) {
      // The drawer id alone doesn't know the article slug; the subject of
      // the triple is usually either an article slug or a human name from
      // which we can derive one.
      const guessedSlug = slugify(c.subject);
      candidates.push({
        articleSlug: guessedSlug,
        reason: `Contradiction: "${c.subject} ${c.predicate} ${c.oldObject}" → "${c.newObject}"`,
      });
    }
    return candidates;
  }

  // --------------------------------------------------------------------------
  // Internals
  // --------------------------------------------------------------------------

  private async maybeExtractFact(
    articleSlug: string,
    content: string
  ): Promise<void> {
    // Conservative heuristic: look for "<Article> is <complement>" in the
    // first paragraph. Misses are fine — we'd rather miss than poison the KG.
    const firstPara = content.split(/\n\n/)[0] ?? '';
    const match = firstPara.match(/^([A-Z][\w\s-]{2,40})\s+is\s+([^.]{3,120})/);
    if (!match) return;

    await this.palace.addFact({
      wingSlug: this.config.wingSlug,
      subject: match[1].trim(),
      predicate: 'is',
      object: match[2].trim(),
      confidence: 60,
    });
  }
}

// ============================================================================
// Helpers
// ============================================================================

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function mapCategoryToMemoryType(
  category: string
):
  | 'fact'
  | 'event'
  | 'discovery'
  | 'preference'
  | 'advice'
  | 'decision' {
  switch (category) {
    case 'decisions':
      return 'decision';
    case 'patterns':
      return 'advice';
    case 'troubleshooting':
      return 'discovery';
    case 'workflows':
      return 'advice';
    case 'architecture':
    case 'components':
    default:
      return 'fact';
  }
}

export function createWikiPalaceBridge(
  wiki: WikiCompiler,
  palace: MemPalaceService,
  config: WikiBridgeConfig
): WikiPalaceBridge {
  return new WikiPalaceBridge(wiki, palace, config);
}
