// ============================================================================
// Wiki Prompt Templates
// ============================================================================
// These prompts power the wiki compiler — turning raw sources into structured,
// cross-referenced wiki articles following Karpathy's LLM Knowledge Base pattern.

/**
 * System prompt that defines the wiki compiler's role and behavior.
 */
export const WIKI_COMPILER_SYSTEM = `You are a disciplined wiki compiler for a software project's knowledge base.
Your job is to transform raw source materials (session logs, commits, specs, decisions)
into well-structured, cross-referenced wiki articles.

## Principles
- Write in encyclopedia style: factual, concise, third-person
- Every article must have a clear title, category, and backlinks to related articles
- Use [[Article Slug]] notation for internal backlinks
- Prefer updating existing articles over creating new ones
- Extract architectural decisions, patterns, and "what we tried and why it broke" insights
- Never invent information — only compile what's in the sources
- Track provenance: cite which sources informed each article

## Article Categories
- architecture: System design, component relationships, data flow
- patterns: Recurring code patterns, conventions, idioms
- decisions: Why X was chosen over Y, tradeoffs made
- components: Individual modules, services, packages
- workflows: How things are done (build, deploy, test)
- troubleshooting: Known issues, gotchas, "what broke and why"

## Output Format
Return a JSON array of compiled articles:
\`\`\`json
[
  {
    "slug": "url-safe-slug",
    "title": "Human Readable Title",
    "category": "architecture|patterns|decisions|components|workflows|troubleshooting",
    "content": "Markdown content with [[backlinks]]...",
    "backlinks": ["related-slug-1", "related-slug-2"]
  }
]
\`\`\``;

/**
 * Build an ingest prompt to compile new source material into wiki articles.
 */
export function buildIngestPrompt(
  sourceContent: string,
  sourceType: string,
  sourceTitle: string,
  existingIndex: string
): string {
  return `## Task: Ingest Source Material

Compile the following source material into wiki articles. Review the existing wiki index
to decide whether to create new articles or update existing ones.

### Existing Wiki Index
${existingIndex || '(empty wiki — create foundational articles)'}

### Source Material
**Type:** ${sourceType}
**Title:** ${sourceTitle}

\`\`\`
${sourceContent}
\`\`\`

### Instructions
1. Extract key concepts, decisions, patterns, and architectural details
2. For each concept, either create a new article or note which existing article should be updated
3. Add backlinks between related articles
4. Focus on durable knowledge — skip transient details like typos fixed or formatting changes
5. For session logs: extract "what was built", "what decisions were made", "what didn't work and why"
6. For commits: extract "what changed", "why it changed", architectural impact
7. For specs: extract requirements, constraints, design rationale

Return your compiled articles as a JSON array.`;
}

/**
 * Build a prompt to update an existing article with new information.
 */
export function buildUpdatePrompt(
  existingArticle: string,
  newSourceContent: string,
  sourceType: string
): string {
  return `## Task: Update Wiki Article

Merge new information from a source into an existing wiki article.
Preserve existing content while integrating new insights.

### Existing Article
\`\`\`markdown
${existingArticle}
\`\`\`

### New Source Material
**Type:** ${sourceType}

\`\`\`
${newSourceContent}
\`\`\`

### Instructions
1. Integrate new information into the existing article
2. Resolve any contradictions (prefer newer information, note the change)
3. Add new backlinks if relationships are discovered
4. Keep the article concise — don't just append, synthesize
5. Maintain the same slug, title, and category unless a rename is clearly needed

Return the updated article as a single JSON object with the same schema.`;
}

/**
 * Build a query prompt to answer questions using the wiki.
 */
export function buildQueryPrompt(
  question: string,
  relevantArticles: string
): string {
  return `## Task: Answer Question from Wiki

Answer the following question using the wiki articles provided.
Cite specific articles using [[slug]] notation.

### Question
${question}

### Relevant Wiki Articles
${relevantArticles}

### Instructions
1. Synthesize an answer from the wiki articles
2. Cite sources with [[article-slug]] backlinks
3. If the wiki doesn't contain enough information, say so clearly
4. If the answer reveals a gap in the wiki, note what article should be created

Return your response as JSON:
\`\`\`json
{
  "answer": "Your synthesized answer with [[backlinks]]...",
  "citedArticles": ["slug-1", "slug-2"],
  "suggestedNewArticle": null or { "slug": "...", "title": "...", "category": "..." }
}
\`\`\``;
}

/**
 * Build a lint prompt to check wiki health.
 */
export function buildLintPrompt(
  wikiIndex: string,
  articleContents: string
): string {
  return `## Task: Lint Wiki for Quality Issues

Review the wiki for quality issues: stale content, contradictions, orphaned pages,
broken links, and knowledge gaps.

### Wiki Index
${wikiIndex}

### Article Contents
${articleContents}

### Instructions
Check for:
1. **Stale content**: Articles that reference outdated patterns or deprecated approaches
2. **Orphaned pages**: Articles with no backlinks from other articles
3. **Contradictions**: Articles that disagree with each other
4. **Gaps**: Topics referenced in backlinks that don't have articles yet
5. **Broken links**: [[backlinks]] that point to non-existent articles

Return findings as JSON:
\`\`\`json
{
  "findings": [
    {
      "type": "stale|orphaned|contradiction|gap|broken_link",
      "articleSlug": "affected-article",
      "description": "What's wrong",
      "suggestion": "How to fix it"
    }
  ]
}
\`\`\``;
}

/**
 * Build a prompt to extract wiki-worthy content from a session log.
 * This is used by the auto-extraction hook.
 */
export function buildSessionExtractPrompt(
  sessionLog: string,
  existingIndex: string
): string {
  return `## Task: Extract Knowledge from Claude Session Log

Analyze this Claude Code session log and extract durable knowledge that should
be compiled into the project wiki.

### Existing Wiki Index
${existingIndex || '(empty wiki)'}

### Session Log
\`\`\`
${sessionLog}
\`\`\`

### What to Extract
- Architectural decisions made during the session
- Patterns established or discovered
- "We tried X and it broke because Y" — troubleshooting knowledge
- New components or modules created and their purpose
- Workflows established (how to build, test, deploy)
- Integration points and data flow discovered

### What to Skip
- Routine code formatting or typo fixes
- Transient debugging steps that led nowhere
- Generic coding knowledge (things any developer knows)

If the session contains no wiki-worthy knowledge, return an empty array.

Return compiled articles as a JSON array with the standard schema.`;
}
