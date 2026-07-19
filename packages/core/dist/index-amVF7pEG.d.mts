import { W as WikiArticleStatus, a as WikiSourceType } from './enums-CbO5o4Mt.mjs';

/** Result of an AI generation call */
interface WikiGenerationResult {
    content: string;
    tokensInput: number;
    tokensOutput: number;
    durationMs: number;
    model: string;
}
/** A compiled wiki article ready for persistence */
interface CompiledArticle {
    slug: string;
    title: string;
    category: string;
    content: string;
    backlinks: string[];
    sourceIds: string[];
}
/** Result of ingesting a raw source into the wiki */
interface IngestResult {
    sourceId: string;
    articlesCreated: string[];
    articlesUpdated: string[];
    tokensUsed: number;
}
/** Result of a wiki query */
interface QueryResult {
    answer: string;
    citedArticles: string[];
    tokensUsed: number;
    /** If the answer is valuable enough, it becomes a new article */
    newArticleSlug?: string;
}
/** A lint finding from wiki maintenance */
interface LintFinding {
    type: 'stale' | 'orphaned' | 'contradiction' | 'gap' | 'broken_link';
    articleSlug: string;
    description: string;
    suggestion: string;
}
/** Result of a wiki lint operation */
interface LintResult {
    findings: LintFinding[];
    articlesMarkedStale: string[];
    tokensUsed: number;
}
/** Wiki status summary */
interface WikiStatus {
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
interface WikiCompilerConfig {
    apiKey: string;
    model: string;
    maxTokens: number;
    repo: string;
    wikiDir: string;
}
/** Options for wiki initialization */
interface WikiInitOptions {
    repo: string;
    wikiDir: string;
}
/** Index entry for the wiki table of contents */
interface WikiIndexEntry {
    slug: string;
    title: string;
    category: string;
    status: WikiArticleStatus;
    updatedAt: Date;
    backlinks: string[];
}

/**
 * System prompt that defines the wiki compiler's role and behavior.
 */
declare const WIKI_COMPILER_SYSTEM = "You are a disciplined wiki compiler for a software project's knowledge base.\nYour job is to transform raw source materials (session logs, commits, specs, decisions)\ninto well-structured, cross-referenced wiki articles.\n\n## Principles\n- Write in encyclopedia style: factual, concise, third-person\n- Every article must have a clear title, category, and backlinks to related articles\n- Use [[Article Slug]] notation for internal backlinks\n- Prefer updating existing articles over creating new ones\n- Extract architectural decisions, patterns, and \"what we tried and why it broke\" insights\n- Never invent information \u2014 only compile what's in the sources\n- Track provenance: cite which sources informed each article\n\n## Article Categories\n- architecture: System design, component relationships, data flow\n- patterns: Recurring code patterns, conventions, idioms\n- decisions: Why X was chosen over Y, tradeoffs made\n- components: Individual modules, services, packages\n- workflows: How things are done (build, deploy, test)\n- troubleshooting: Known issues, gotchas, \"what broke and why\"\n\n## Output Format\nReturn a JSON array of compiled articles:\n```json\n[\n  {\n    \"slug\": \"url-safe-slug\",\n    \"title\": \"Human Readable Title\",\n    \"category\": \"architecture|patterns|decisions|components|workflows|troubleshooting\",\n    \"content\": \"Markdown content with [[backlinks]]...\",\n    \"backlinks\": [\"related-slug-1\", \"related-slug-2\"]\n  }\n]\n```";
/**
 * Build an ingest prompt to compile new source material into wiki articles.
 */
declare function buildIngestPrompt(sourceContent: string, sourceType: string, sourceTitle: string, existingIndex: string): string;
/**
 * Build a prompt to update an existing article with new information.
 */
declare function buildUpdatePrompt(existingArticle: string, newSourceContent: string, sourceType: string): string;
/**
 * Build a query prompt to answer questions using the wiki.
 */
declare function buildQueryPrompt(question: string, relevantArticles: string): string;
/**
 * Build a lint prompt to check wiki health.
 */
declare function buildLintPrompt(wikiIndex: string, articleContents: string): string;
/**
 * Build a prompt to extract wiki-worthy content from a session log.
 * This is used by the auto-extraction hook.
 */
declare function buildSessionExtractPrompt(sessionLog: string, existingIndex: string): string;

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
declare class WikiCompiler {
    private client;
    private config;
    constructor(config: WikiCompilerConfig);
    /**
     * Ingest a raw source and compile it into wiki articles.
     * This is the primary entry point for feeding knowledge into the wiki.
     */
    ingest(content: string, sourceType: WikiSourceType, title: string, origin?: string): Promise<IngestResult>;
    /**
     * Answer a question by synthesizing across wiki articles.
     * Valuable answers can be automatically filed as new articles.
     */
    query(question: string): Promise<QueryResult>;
    /**
     * Run a lint pass over the wiki to find quality issues.
     * Identifies stale content, orphans, contradictions, gaps, and broken links.
     */
    lint(): Promise<LintResult>;
    /**
     * Extract wiki-worthy knowledge from a Claude Code session log.
     * This is the core of the "compounding loop" — each session makes the wiki smarter.
     */
    extractFromSession(sessionLog: string, sessionId: string): Promise<IngestResult>;
    /**
     * Get the full wiki index — the table of contents.
     */
    getIndex(): Promise<WikiIndexEntry[]>;
    /**
     * Get wiki status summary.
     */
    getStatus(): Promise<WikiStatus>;
    /**
     * Get a specific article by slug.
     */
    getArticle(slug: string): Promise<{
        slug: string;
        title: string;
        category: string;
        content: string;
        backlinks: string[];
        status: string;
        version: number;
        updatedAt: Date;
    } | null>;
    /**
     * Flush the wiki to disk as markdown files in the wiki directory.
     * Creates index.md and individual article files organized by category.
     */
    flushToDisk(): Promise<{
        filesWritten: number;
        wikiDir: string;
    }>;
    private callLLM;
    private parseArticlesFromResponse;
    private parseJsonFromResponse;
    private buildIndexString;
}
/**
 * Create a wiki compiler instance with default configuration.
 */
declare function createWikiCompiler(config: WikiCompilerConfig): WikiCompiler;

/**
 * Hook that auto-extracts knowledge from Claude Code session logs
 * and compiles it into wiki articles.
 *
 * This implements the "compounding loop" from Karpathy's LLM Knowledge Base:
 * - Every session produces raw material
 * - The hook compiles it into wiki articles
 * - Future sessions search the wiki before writing code
 * - The longer you use it, the smarter the wiki gets
 *
 * Usage:
 *   const hook = new WikiSessionHook(config);
 *   // After each session completes:
 *   await hook.onSessionEnd(sessionLog, sessionId);
 */
declare class WikiSessionHook {
    private compiler;
    private config;
    constructor(config: WikiCompilerConfig);
    /**
     * Called when a Claude Code session ends.
     * Extracts wiki-worthy knowledge and compiles it into articles.
     */
    onSessionEnd(sessionLog: string, sessionId: string): Promise<IngestResult>;
    /**
     * Called when a commit is made during a session.
     * Ingests the commit diff and message as a source.
     */
    onCommit(commitSha: string, commitMessage: string, diffContent: string): Promise<IngestResult>;
    /**
     * Called when a spec or requirements document is created/updated.
     */
    onSpecUpdate(specContent: string, specTitle: string, filePath: string): Promise<IngestResult>;
    /**
     * Flush the wiki to disk after extraction.
     * Typically called after onSessionEnd to persist changes.
     */
    flush(): Promise<{
        filesWritten: number;
        wikiDir: string;
    }>;
    /**
     * Generate the Claude Code hook script that captures session logs
     * and triggers wiki extraction.
     *
     * Returns a shell script suitable for use as a Claude Code PostSession hook.
     */
    static generateHookScript(wikiDir: string, repo: string): string;
    /**
     * Generate the Claude Code settings.json hook configuration.
     */
    static generateHookConfig(wikiDir: string, repo: string): object;
}

type index_CompiledArticle = CompiledArticle;
type index_IngestResult = IngestResult;
type index_LintFinding = LintFinding;
type index_LintResult = LintResult;
type index_QueryResult = QueryResult;
declare const index_WIKI_COMPILER_SYSTEM: typeof WIKI_COMPILER_SYSTEM;
type index_WikiCompiler = WikiCompiler;
declare const index_WikiCompiler: typeof WikiCompiler;
type index_WikiCompilerConfig = WikiCompilerConfig;
type index_WikiGenerationResult = WikiGenerationResult;
type index_WikiIndexEntry = WikiIndexEntry;
type index_WikiInitOptions = WikiInitOptions;
type index_WikiSessionHook = WikiSessionHook;
declare const index_WikiSessionHook: typeof WikiSessionHook;
type index_WikiStatus = WikiStatus;
declare const index_buildIngestPrompt: typeof buildIngestPrompt;
declare const index_buildLintPrompt: typeof buildLintPrompt;
declare const index_buildQueryPrompt: typeof buildQueryPrompt;
declare const index_buildSessionExtractPrompt: typeof buildSessionExtractPrompt;
declare const index_buildUpdatePrompt: typeof buildUpdatePrompt;
declare const index_createWikiCompiler: typeof createWikiCompiler;
declare namespace index {
  export { type index_CompiledArticle as CompiledArticle, type index_IngestResult as IngestResult, type index_LintFinding as LintFinding, type index_LintResult as LintResult, type index_QueryResult as QueryResult, index_WIKI_COMPILER_SYSTEM as WIKI_COMPILER_SYSTEM, index_WikiCompiler as WikiCompiler, type index_WikiCompilerConfig as WikiCompilerConfig, type index_WikiGenerationResult as WikiGenerationResult, type index_WikiIndexEntry as WikiIndexEntry, type index_WikiInitOptions as WikiInitOptions, index_WikiSessionHook as WikiSessionHook, type index_WikiStatus as WikiStatus, index_buildIngestPrompt as buildIngestPrompt, index_buildLintPrompt as buildLintPrompt, index_buildQueryPrompt as buildQueryPrompt, index_buildSessionExtractPrompt as buildSessionExtractPrompt, index_buildUpdatePrompt as buildUpdatePrompt, index_createWikiCompiler as createWikiCompiler };
}

export { type CompiledArticle as C, type IngestResult as I, type LintFinding as L, type QueryResult as Q, WikiCompiler as W, type WikiCompilerConfig as a, WikiSessionHook as b, type LintResult as c, WIKI_COMPILER_SYSTEM as d, type WikiGenerationResult as e, type WikiIndexEntry as f, type WikiInitOptions as g, type WikiStatus as h, index as i, buildIngestPrompt as j, buildLintPrompt as k, buildQueryPrompt as l, buildSessionExtractPrompt as m, buildUpdatePrompt as n, createWikiCompiler as o };
