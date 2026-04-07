import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';
import { getDatabase } from '../db/client';
import { wikiSources, wikiArticles, wikiLog } from '../db/schema/wiki';
import { eq, desc, like, or, and } from 'drizzle-orm';
import type {
  WikiCompilerConfig,
  CompiledArticle,
  IngestResult,
  QueryResult,
  LintResult,
  LintFinding,
  WikiStatus,
  WikiIndexEntry,
  WikiGenerationResult,
} from './types';
import type { WikiSourceType } from '../db/schema/enums';
import {
  WIKI_COMPILER_SYSTEM,
  buildIngestPrompt,
  buildUpdatePrompt,
  buildQueryPrompt,
  buildLintPrompt,
  buildSessionExtractPrompt,
} from './prompts';

// ============================================================================
// Wiki Compiler Service
// ============================================================================

/**
 * The WikiCompiler is the core engine of the wiki system.
 * It follows the Karpathy LLM Knowledge Base pattern:
 *   raw sources → LLM compiler → wiki articles
 *
 * The compiler:
 * - Ingests raw source materials (session logs, commits, specs)
 * - Compiles them into structured, cross-referenced wiki articles
 * - Answers questions by synthesizing across articles
 * - Lints the wiki for quality issues
 * - Auto-extracts knowledge from Claude session logs
 */
export class WikiCompiler {
  private client: Anthropic;
  private config: WikiCompilerConfig;

  constructor(config: WikiCompilerConfig) {
    this.config = config;
    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
  }

  // --------------------------------------------------------------------------
  // Ingest: Raw sources → wiki articles
  // --------------------------------------------------------------------------

  /**
   * Ingest a raw source and compile it into wiki articles.
   * This is the primary entry point for feeding knowledge into the wiki.
   */
  async ingest(
    content: string,
    sourceType: WikiSourceType,
    title: string,
    origin?: string
  ): Promise<IngestResult> {
    const db = getDatabase();

    // Deduplicate by content hash
    const contentHash = createHash('sha256').update(content).digest('hex');
    const existing = await db
      .select()
      .from(wikiSources)
      .where(eq(wikiSources.contentHash, contentHash))
      .limit(1);

    if (existing.length > 0) {
      return {
        sourceId: existing[0].id,
        articlesCreated: [],
        articlesUpdated: [],
        tokensUsed: 0,
      };
    }

    // Persist the raw source
    const [source] = await db
      .insert(wikiSources)
      .values({
        sourceType,
        title,
        content,
        origin,
        repo: this.config.repo,
        contentHash,
      })
      .returning();

    // Get existing wiki index for context
    const existingIndex = await this.buildIndexString();

    // Compile source into articles via LLM
    const result = await this.callLLM(
      buildIngestPrompt(content, sourceType, title, existingIndex)
    );

    const articles = this.parseArticlesFromResponse(result.content);
    const articlesCreated: string[] = [];
    const articlesUpdated: string[] = [];

    for (const article of articles) {
      // Check if article already exists
      const existingArticle = await db
        .select()
        .from(wikiArticles)
        .where(eq(wikiArticles.slug, article.slug))
        .limit(1);

      if (existingArticle.length > 0) {
        // Update existing article
        await db
          .update(wikiArticles)
          .set({
            content: article.content,
            backlinks: article.backlinks,
            sourceIds: [
              ...((existingArticle[0].sourceIds as string[]) || []),
              source.id,
            ],
            version: existingArticle[0].version + 1,
            status: 'active',
            updatedAt: new Date(),
          })
          .where(eq(wikiArticles.slug, article.slug));
        articlesUpdated.push(article.slug);
      } else {
        // Create new article
        await db.insert(wikiArticles).values({
          slug: article.slug,
          title: article.title,
          category: article.category,
          content: article.content,
          backlinks: article.backlinks,
          sourceIds: [source.id],
          repo: this.config.repo,
        });
        articlesCreated.push(article.slug);
      }
    }

    const tokensUsed = result.tokensInput + result.tokensOutput;

    // Log the ingest operation
    await db.insert(wikiLog).values({
      action: 'ingest',
      summary: `Ingested ${sourceType} "${title}": created ${articlesCreated.length}, updated ${articlesUpdated.length} articles`,
      articleIds: [...articlesCreated, ...articlesUpdated],
      sourceIds: [source.id],
      repo: this.config.repo,
      tokensUsed,
    });

    return {
      sourceId: source.id,
      articlesCreated,
      articlesUpdated,
      tokensUsed,
    };
  }

  // --------------------------------------------------------------------------
  // Query: Ask questions against the wiki
  // --------------------------------------------------------------------------

  /**
   * Answer a question by synthesizing across wiki articles.
   * Valuable answers can be automatically filed as new articles.
   */
  async query(question: string): Promise<QueryResult> {
    const db = getDatabase();

    // Find relevant articles by searching content and titles
    const allArticles = await db
      .select()
      .from(wikiArticles)
      .where(eq(wikiArticles.status, 'active'));

    // Simple keyword relevance — search question words in article content
    const keywords = question
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);

    const scored = allArticles
      .map((article) => {
        const text = `${article.title} ${article.content}`.toLowerCase();
        const score = keywords.filter((kw) => text.includes(kw)).length;
        return { article, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const relevantContent = scored
      .map(
        (s) =>
          `## [[${s.article.slug}]] — ${s.article.title}\n\n${s.article.content}`
      )
      .join('\n\n---\n\n');

    if (scored.length === 0) {
      return {
        answer:
          'No relevant wiki articles found. The wiki may need more source material ingested on this topic.',
        citedArticles: [],
        tokensUsed: 0,
      };
    }

    const result = await this.callLLM(
      buildQueryPrompt(question, relevantContent)
    );

    const parsed = this.parseJsonFromResponse<{
      answer: string;
      citedArticles: string[];
      suggestedNewArticle?: {
        slug: string;
        title: string;
        category: string;
      } | null;
    }>(result.content);

    const tokensUsed = result.tokensInput + result.tokensOutput;
    let newArticleSlug: string | undefined;

    // If a new article is suggested and the answer is substantial, create it
    if (parsed.suggestedNewArticle) {
      const newArticle = parsed.suggestedNewArticle;
      const existingArticle = await db
        .select()
        .from(wikiArticles)
        .where(eq(wikiArticles.slug, newArticle.slug))
        .limit(1);

      if (existingArticle.length === 0) {
        await db.insert(wikiArticles).values({
          slug: newArticle.slug,
          title: newArticle.title,
          category: newArticle.category,
          content: parsed.answer,
          backlinks: parsed.citedArticles,
          sourceIds: [],
          repo: this.config.repo,
        });
        newArticleSlug = newArticle.slug;
      }
    }

    // Log the query
    await db.insert(wikiLog).values({
      action: 'query',
      summary: `Query: "${question.slice(0, 100)}" — cited ${parsed.citedArticles.length} articles`,
      articleIds: parsed.citedArticles,
      repo: this.config.repo,
      tokensUsed,
    });

    return {
      answer: parsed.answer,
      citedArticles: parsed.citedArticles,
      tokensUsed,
      newArticleSlug,
    };
  }

  // --------------------------------------------------------------------------
  // Lint: Check wiki health
  // --------------------------------------------------------------------------

  /**
   * Run a lint pass over the wiki to find quality issues.
   * Identifies stale content, orphans, contradictions, gaps, and broken links.
   */
  async lint(): Promise<LintResult> {
    const db = getDatabase();

    const allArticles = await db.select().from(wikiArticles);

    if (allArticles.length === 0) {
      return { findings: [], articlesMarkedStale: [], tokensUsed: 0 };
    }

    const wikiIndex = allArticles
      .map(
        (a) =>
          `- [[${a.slug}]] (${a.category}) — ${a.title} [${a.status}]`
      )
      .join('\n');

    const articleContents = allArticles
      .map(
        (a) => `## [[${a.slug}]] — ${a.title}\nCategory: ${a.category}\n\n${a.content}`
      )
      .join('\n\n---\n\n');

    const result = await this.callLLM(
      buildLintPrompt(wikiIndex, articleContents)
    );

    const parsed = this.parseJsonFromResponse<{ findings: LintFinding[] }>(
      result.content
    );

    const tokensUsed = result.tokensInput + result.tokensOutput;

    // Mark stale articles
    const articlesMarkedStale: string[] = [];
    for (const finding of parsed.findings) {
      if (finding.type === 'stale') {
        await db
          .update(wikiArticles)
          .set({ status: 'stale', updatedAt: new Date() })
          .where(eq(wikiArticles.slug, finding.articleSlug));
        articlesMarkedStale.push(finding.articleSlug);
      }
    }

    // Log the lint operation
    await db.insert(wikiLog).values({
      action: 'lint',
      summary: `Lint: found ${parsed.findings.length} issues, marked ${articlesMarkedStale.length} stale`,
      articleIds: articlesMarkedStale,
      repo: this.config.repo,
      tokensUsed,
    });

    return {
      findings: parsed.findings,
      articlesMarkedStale,
      tokensUsed,
    };
  }

  // --------------------------------------------------------------------------
  // Session extraction: Auto-compile from Claude session logs
  // --------------------------------------------------------------------------

  /**
   * Extract wiki-worthy knowledge from a Claude Code session log.
   * This is the core of the "compounding loop" — each session makes the wiki smarter.
   */
  async extractFromSession(
    sessionLog: string,
    sessionId: string
  ): Promise<IngestResult> {
    const existingIndex = await this.buildIndexString();

    const result = await this.callLLM(
      buildSessionExtractPrompt(sessionLog, existingIndex)
    );

    const articles = this.parseArticlesFromResponse(result.content);

    if (articles.length === 0) {
      return {
        sourceId: '',
        articlesCreated: [],
        articlesUpdated: [],
        tokensUsed: result.tokensInput + result.tokensOutput,
      };
    }

    // Ingest the session log as a source, then compile articles
    return this.ingest(
      sessionLog,
      'session_log',
      `Session ${sessionId}`,
      sessionId
    );
  }

  // --------------------------------------------------------------------------
  // Wiki index and status
  // --------------------------------------------------------------------------

  /**
   * Get the full wiki index — the table of contents.
   */
  async getIndex(): Promise<WikiIndexEntry[]> {
    const db = getDatabase();
    const articles = await db
      .select()
      .from(wikiArticles)
      .orderBy(wikiArticles.category, wikiArticles.title);

    return articles.map((a) => ({
      slug: a.slug,
      title: a.title,
      category: a.category,
      status: a.status as 'active' | 'stale' | 'archived',
      updatedAt: a.updatedAt,
      backlinks: (a.backlinks as string[]) || [],
    }));
  }

  /**
   * Get wiki status summary.
   */
  async getStatus(): Promise<WikiStatus> {
    const db = getDatabase();

    const sources = await db.select().from(wikiSources);
    const articles = await db.select().from(wikiArticles);
    const logs = await db
      .select()
      .from(wikiLog)
      .orderBy(desc(wikiLog.createdAt))
      .limit(1);

    const categories: Record<string, number> = {};
    let activeCount = 0;
    let staleCount = 0;
    let archivedCount = 0;

    for (const article of articles) {
      categories[article.category] = (categories[article.category] || 0) + 1;
      if (article.status === 'active') activeCount++;
      else if (article.status === 'stale') staleCount++;
      else if (article.status === 'archived') archivedCount++;
    }

    return {
      totalSources: sources.length,
      totalArticles: articles.length,
      activeArticles: activeCount,
      staleArticles: staleCount,
      archivedArticles: archivedCount,
      totalLogEntries: logs.length > 0 ? 1 : 0, // simplified
      lastActivity: logs.length > 0 ? logs[0].createdAt : undefined,
      categories,
    };
  }

  /**
   * Get a specific article by slug.
   */
  async getArticle(slug: string): Promise<{
    slug: string;
    title: string;
    category: string;
    content: string;
    backlinks: string[];
    status: string;
    version: number;
    updatedAt: Date;
  } | null> {
    const db = getDatabase();
    const results = await db
      .select()
      .from(wikiArticles)
      .where(eq(wikiArticles.slug, slug))
      .limit(1);

    if (results.length === 0) return null;

    const a = results[0];
    return {
      slug: a.slug,
      title: a.title,
      category: a.category,
      content: a.content,
      backlinks: (a.backlinks as string[]) || [],
      status: a.status,
      version: a.version,
      updatedAt: a.updatedAt,
    };
  }

  // --------------------------------------------------------------------------
  // Flush: Export wiki to disk as markdown files
  // --------------------------------------------------------------------------

  /**
   * Flush the wiki to disk as markdown files in the wiki directory.
   * Creates index.md and individual article files organized by category.
   */
  async flushToDisk(): Promise<{ filesWritten: number; wikiDir: string }> {
    const fs = await import('fs');
    const path = await import('path');

    const wikiDir = this.config.wikiDir;
    const articles = await this.getIndex();
    const db = getDatabase();

    // Ensure wiki directory exists
    if (!fs.existsSync(wikiDir)) {
      fs.mkdirSync(wikiDir, { recursive: true });
    }

    let filesWritten = 0;

    // Group articles by category
    const byCategory: Record<string, WikiIndexEntry[]> = {};
    for (const article of articles) {
      if (!byCategory[article.category]) {
        byCategory[article.category] = [];
      }
      byCategory[article.category].push(article);
    }

    // Write index.md
    let indexContent = `# Wiki Index\n\n`;
    indexContent += `> Auto-generated wiki — compiled from session logs, commits, specs, and decisions.\n`;
    indexContent += `> Last updated: ${new Date().toISOString()}\n\n`;

    for (const [category, catArticles] of Object.entries(byCategory).sort()) {
      indexContent += `## ${category.charAt(0).toUpperCase() + category.slice(1)}\n\n`;
      for (const article of catArticles) {
        const statusBadge = article.status === 'stale' ? ' ⚠️' : '';
        indexContent += `- [${article.title}](./${category}/${article.slug}.md)${statusBadge}\n`;
      }
      indexContent += '\n';
    }

    fs.writeFileSync(path.join(wikiDir, 'index.md'), indexContent);
    filesWritten++;

    // Write individual article files organized by category
    for (const [category, catArticles] of Object.entries(byCategory)) {
      const categoryDir = path.join(wikiDir, category);
      if (!fs.existsSync(categoryDir)) {
        fs.mkdirSync(categoryDir, { recursive: true });
      }

      for (const entry of catArticles) {
        const fullArticle = await db
          .select()
          .from(wikiArticles)
          .where(eq(wikiArticles.slug, entry.slug))
          .limit(1);

        if (fullArticle.length > 0) {
          const a = fullArticle[0];
          let fileContent = `# ${a.title}\n\n`;
          fileContent += `> Category: ${a.category} | Status: ${a.status} | Version: ${a.version}\n\n`;

          if (a.backlinks && (a.backlinks as string[]).length > 0) {
            fileContent += `**Related:** ${(a.backlinks as string[]).map((b) => `[[${b}]]`).join(', ')}\n\n`;
          }

          fileContent += `---\n\n${a.content}\n`;

          fs.writeFileSync(
            path.join(categoryDir, `${a.slug}.md`),
            fileContent
          );
          filesWritten++;
        }
      }
    }

    // Write log.md — recent activity chronicle
    const recentLogs = await db
      .select()
      .from(wikiLog)
      .orderBy(desc(wikiLog.createdAt))
      .limit(50);

    if (recentLogs.length > 0) {
      let logContent = `# Wiki Activity Log\n\n`;
      logContent += `> Append-only chronicle of wiki operations.\n\n`;

      for (const log of recentLogs) {
        const date = log.createdAt.toISOString().split('T')[0];
        const tokens = log.tokensUsed ? ` (${log.tokensUsed} tokens)` : '';
        logContent += `- **${date}** [${log.action}] ${log.summary}${tokens}\n`;
      }

      fs.writeFileSync(path.join(wikiDir, 'log.md'), logContent);
      filesWritten++;
    }

    return { filesWritten, wikiDir };
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private async callLLM(userPrompt: string): Promise<WikiGenerationResult> {
    const startTime = Date.now();

    const response = await this.client.messages.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      system: WIKI_COMPILER_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const durationMs = Date.now() - startTime;
    const textContent = response.content
      .filter((block) => block.type === 'text')
      .map((block) => ('text' in block ? block.text : ''))
      .join('\n');

    return {
      content: textContent,
      tokensInput: response.usage.input_tokens,
      tokensOutput: response.usage.output_tokens,
      durationMs,
      model: response.model,
    };
  }

  private parseArticlesFromResponse(content: string): CompiledArticle[] {
    try {
      const parsed = this.parseJsonFromResponse<CompiledArticle[]>(content);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private parseJsonFromResponse<T>(content: string): T {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;

    try {
      return JSON.parse(jsonStr.trim());
    } catch {
      // Try to find raw JSON
      const rawMatch = content.match(/[\[{][\s\S]*[\]}]/);
      if (rawMatch) {
        return JSON.parse(rawMatch[0]);
      }
      throw new Error('Failed to parse JSON from LLM response');
    }
  }

  private async buildIndexString(): Promise<string> {
    const index = await this.getIndex();
    if (index.length === 0) return '';

    return index
      .map(
        (entry) =>
          `- [[${entry.slug}]] (${entry.category}) — ${entry.title}`
      )
      .join('\n');
  }
}

/**
 * Create a wiki compiler instance with default configuration.
 */
export function createWikiCompiler(config: WikiCompilerConfig): WikiCompiler {
  return new WikiCompiler(config);
}
