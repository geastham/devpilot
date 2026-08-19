import { Command } from 'commander';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { resolveWikiModel } from '@devpilot.sh/core/wave-planner';

// ============================================================================
// Wiki CLI Command
// ============================================================================
// devpilot wiki — LLM-compiled knowledge base for your codebase
//
// Subcommands:
//   init     Initialize the wiki system
//   ingest   Ingest a source into the wiki
//   query    Ask a question against the wiki
//   lint     Check wiki health
//   status   Show wiki stats
//   flush    Export wiki to disk as markdown
//   index    Show the wiki table of contents

export const wikiCommand = new Command('wiki')
  .description('LLM-compiled knowledge base — institutional memory for your codebase');

// --------------------------------------------------------------------------
// wiki init
// --------------------------------------------------------------------------

wikiCommand
  .command('init')
  .description('Initialize the wiki system in the current repository')
  .option('--wiki-dir <path>', 'Wiki output directory', '.devpilot/wiki')
  .action(async (options) => {
    const cwd = process.cwd();
    const devpilotDir = join(cwd, '.devpilot');
    const wikiDir = join(cwd, options.wikiDir);

    // Ensure .devpilot exists
    if (!existsSync(devpilotDir)) {
      console.log(
        chalk.yellow('⚠️  DevPilot not initialized. Run `devpilot init` first.')
      );
      return;
    }

    // Create wiki directory structure
    if (!existsSync(wikiDir)) {
      mkdirSync(wikiDir, { recursive: true });
    }

    // Create initial index.md
    const indexPath = join(wikiDir, 'index.md');
    if (!existsSync(indexPath)) {
      const initialIndex = `# Wiki Index

> Auto-generated wiki — compiled from session logs, commits, specs, and decisions.
> This wiki is maintained by DevPilot's wiki compiler following the LLM Knowledge Base pattern.

## Getting Started

This wiki will grow automatically as you work with DevPilot:
- **Session logs** are compiled into architecture and decision articles
- **Commits** are analyzed for patterns and architectural changes
- **Specs** are indexed for requirements and design rationale

Run \`devpilot wiki ingest\` to manually add sources, or let the session hook capture knowledge automatically.
`;
      writeFileSync(indexPath, initialIndex);
    }

    // Create log.md
    const logPath = join(wikiDir, 'log.md');
    if (!existsSync(logPath)) {
      writeFileSync(
        logPath,
        `# Wiki Activity Log\n\n> Append-only chronicle of wiki operations.\n\n- **${new Date().toISOString().split('T')[0]}** [init] Wiki initialized\n`
      );
    }

    // Update .gitignore — wiki content should be committed
    const gitignorePath = join(cwd, '.gitignore');
    if (existsSync(gitignorePath)) {
      const gitignore = readFileSync(gitignorePath, 'utf-8');
      if (!gitignore.includes('.devpilot/wiki')) {
        // Don't ignore the wiki — it should be version controlled
        // But ensure the DB is still ignored
      }
    }

    console.log(chalk.green('✅ Wiki initialized!'));
    console.log('');
    console.log(chalk.white('Wiki directory: ') + chalk.cyan(wikiDir));
    console.log('');
    console.log(chalk.white('Next steps:'));
    console.log(
      chalk.gray('  1. ') +
        chalk.cyan('devpilot wiki ingest --file <path>') +
        chalk.gray(' to add source material')
    );
    console.log(
      chalk.gray('  2. ') +
        chalk.cyan('devpilot wiki query "How does auth work?"') +
        chalk.gray(' to ask questions')
    );
    console.log(
      chalk.gray('  3. ') +
        chalk.cyan('devpilot wiki status') +
        chalk.gray(' to check wiki health')
    );
    console.log('');
    console.log(
      chalk.gray(
        'The wiki will grow automatically as agents work — each session compounds the knowledge base.'
      )
    );
  });

// --------------------------------------------------------------------------
// wiki ingest
// --------------------------------------------------------------------------

wikiCommand
  .command('ingest')
  .description('Ingest a source document into the wiki')
  .requiredOption('--type <type>', 'Source type: session_log, commit, spec, decision, manual')
  .requiredOption('--title <title>', 'Human-readable title for the source')
  .option('--file <path>', 'Path to source file')
  .option('--stdin', 'Read source from stdin')
  .option('--origin <origin>', 'Origin identifier (e.g. session ID, commit SHA)')
  .action(async (options) => {
    let content: string;

    if (options.file) {
      if (!existsSync(options.file)) {
        console.log(chalk.red(`❌ File not found: ${options.file}`));
        return;
      }
      content = readFileSync(options.file, 'utf-8');
    } else if (options.stdin) {
      content = readFileSync(0, 'utf-8'); // Read from stdin
    } else {
      console.log(
        chalk.red('❌ Provide either --file <path> or --stdin')
      );
      return;
    }

    const validTypes = ['session_log', 'commit', 'spec', 'decision', 'manual'];
    if (!validTypes.includes(options.type)) {
      console.log(
        chalk.red(
          `❌ Invalid type "${options.type}". Must be one of: ${validTypes.join(', ')}`
        )
      );
      return;
    }

    console.log(chalk.gray(`Ingesting ${options.type}: "${options.title}"...`));

    try {
      const { createWikiCompiler } = await import('@devpilot.sh/core/wiki');
      const config = getWikiConfig();
      const compiler = createWikiCompiler(config);
      const result = await compiler.ingest(
        content,
        options.type,
        options.title,
        options.origin
      );

      console.log(chalk.green('✅ Ingested successfully!'));
      console.log(
        chalk.gray(`   Source ID: ${result.sourceId}`)
      );
      if (result.articlesCreated.length > 0) {
        console.log(
          chalk.white(`   Articles created: `) +
            chalk.cyan(result.articlesCreated.join(', '))
        );
      }
      if (result.articlesUpdated.length > 0) {
        console.log(
          chalk.white(`   Articles updated: `) +
            chalk.yellow(result.articlesUpdated.join(', '))
        );
      }
      console.log(
        chalk.gray(`   Tokens used: ${result.tokensUsed}`)
      );
    } catch (error) {
      console.log(
        chalk.red(
          `❌ Ingest failed: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  });

// --------------------------------------------------------------------------
// wiki query
// --------------------------------------------------------------------------

wikiCommand
  .command('query <question>')
  .description('Ask a question against the wiki')
  .action(async (question: string) => {
    console.log(chalk.gray(`Searching wiki for: "${question}"...`));

    try {
      const { createWikiCompiler } = await import('@devpilot.sh/core/wiki');
      const config = getWikiConfig();
      const compiler = createWikiCompiler(config);
      const result = await compiler.query(question);

      console.log('');
      console.log(chalk.white(result.answer));
      console.log('');

      if (result.citedArticles.length > 0) {
        console.log(
          chalk.gray('Cited: ') +
            chalk.cyan(result.citedArticles.map((s) => `[[${s}]]`).join(', '))
        );
      }

      if (result.newArticleSlug) {
        console.log(
          chalk.green(
            `📝 New article created from this query: [[${result.newArticleSlug}]]`
          )
        );
      }

      console.log(chalk.gray(`Tokens used: ${result.tokensUsed}`));
    } catch (error) {
      console.log(
        chalk.red(
          `❌ Query failed: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  });

// --------------------------------------------------------------------------
// wiki lint
// --------------------------------------------------------------------------

wikiCommand
  .command('lint')
  .description('Check wiki health — find stale content, orphans, and gaps')
  .action(async () => {
    console.log(chalk.gray('Linting wiki...'));

    try {
      const { createWikiCompiler } = await import('@devpilot.sh/core/wiki');
      const config = getWikiConfig();
      const compiler = createWikiCompiler(config);
      const result = await compiler.lint();

      if (result.findings.length === 0) {
        console.log(chalk.green('✅ Wiki is healthy — no issues found!'));
        return;
      }

      console.log(
        chalk.yellow(`⚠️  Found ${result.findings.length} issue(s):\n`)
      );

      for (const finding of result.findings) {
        const icon = {
          stale: '🕐',
          orphaned: '🔗',
          contradiction: '⚡',
          gap: '📭',
          broken_link: '💔',
        }[finding.type];

        console.log(
          `  ${icon} ${chalk.white(`[${finding.type}]`)} ${chalk.cyan(`[[${finding.articleSlug}]]`)}`
        );
        console.log(chalk.gray(`     ${finding.description}`));
        console.log(chalk.gray(`     → ${finding.suggestion}`));
        console.log('');
      }

      if (result.articlesMarkedStale.length > 0) {
        console.log(
          chalk.yellow(
            `Marked ${result.articlesMarkedStale.length} article(s) as stale.`
          )
        );
      }

      console.log(chalk.gray(`Tokens used: ${result.tokensUsed}`));
    } catch (error) {
      console.log(
        chalk.red(
          `❌ Lint failed: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  });

// --------------------------------------------------------------------------
// wiki status
// --------------------------------------------------------------------------

wikiCommand
  .command('status')
  .description('Show wiki statistics')
  .action(async () => {
    try {
      const { createWikiCompiler } = await import('@devpilot.sh/core/wiki');
      const config = getWikiConfig();
      const compiler = createWikiCompiler(config);
      const status = await compiler.getStatus();

      console.log(chalk.white.bold('\n📚 Wiki Status\n'));
      console.log(
        chalk.gray('  Sources:    ') + chalk.white(String(status.totalSources))
      );
      console.log(
        chalk.gray('  Articles:   ') +
          chalk.white(String(status.totalArticles)) +
          chalk.gray(' (') +
          chalk.green(`${status.activeArticles} active`) +
          (status.staleArticles > 0
            ? chalk.yellow(`, ${status.staleArticles} stale`)
            : '') +
          (status.archivedArticles > 0
            ? chalk.gray(`, ${status.archivedArticles} archived`)
            : '') +
          chalk.gray(')')
      );

      if (Object.keys(status.categories).length > 0) {
        console.log(chalk.gray('\n  Categories:'));
        for (const [category, count] of Object.entries(status.categories).sort()) {
          console.log(
            chalk.gray('    ') +
              chalk.cyan(category) +
              chalk.gray(': ') +
              chalk.white(String(count))
          );
        }
      }

      if (status.lastActivity) {
        console.log(
          chalk.gray('\n  Last activity: ') +
            chalk.white(status.lastActivity.toISOString().split('T')[0])
        );
      }

      console.log('');
    } catch (error) {
      console.log(
        chalk.red(
          `❌ Status failed: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  });

// --------------------------------------------------------------------------
// wiki flush
// --------------------------------------------------------------------------

wikiCommand
  .command('flush')
  .description('Export wiki to disk as markdown files')
  .action(async () => {
    console.log(chalk.gray('Flushing wiki to disk...'));

    try {
      const { createWikiCompiler } = await import('@devpilot.sh/core/wiki');
      const config = getWikiConfig();
      const compiler = createWikiCompiler(config);
      const result = await compiler.flushToDisk();

      console.log(chalk.green(`✅ Wrote ${result.filesWritten} files to ${result.wikiDir}`));
    } catch (error) {
      console.log(
        chalk.red(
          `❌ Flush failed: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  });

// --------------------------------------------------------------------------
// wiki index
// --------------------------------------------------------------------------

wikiCommand
  .command('index')
  .description('Show the wiki table of contents')
  .option('--category <category>', 'Filter by category')
  .action(async (options) => {
    try {
      const { createWikiCompiler } = await import('@devpilot.sh/core/wiki');
      const config = getWikiConfig();
      const compiler = createWikiCompiler(config);
      let index = await compiler.getIndex();

      if (options.category) {
        index = index.filter((e) => e.category === options.category);
      }

      if (index.length === 0) {
        console.log(chalk.gray('Wiki is empty. Run `devpilot wiki ingest` to add sources.'));
        return;
      }

      // Group by category
      const byCategory: Record<string, typeof index> = {};
      for (const entry of index) {
        if (!byCategory[entry.category]) {
          byCategory[entry.category] = [];
        }
        byCategory[entry.category].push(entry);
      }

      console.log(chalk.white.bold('\n📖 Wiki Index\n'));

      for (const [category, entries] of Object.entries(byCategory).sort()) {
        console.log(
          chalk.cyan.bold(
            `  ${category.charAt(0).toUpperCase() + category.slice(1)}`
          )
        );

        for (const entry of entries) {
          const statusColor =
            entry.status === 'active'
              ? chalk.green
              : entry.status === 'stale'
                ? chalk.yellow
                : chalk.gray;
          const badge = statusColor(`[${entry.status}]`);

          console.log(
            `    ${badge} ${chalk.white(entry.title)} ${chalk.gray(`[[${entry.slug}]]`)}`
          );
        }
        console.log('');
      }
    } catch (error) {
      console.log(
        chalk.red(
          `❌ Index failed: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  });

// --------------------------------------------------------------------------
// wiki read
// --------------------------------------------------------------------------

wikiCommand
  .command('read <slug>')
  .description('Read a specific wiki article')
  .action(async (slug: string) => {
    try {
      const { createWikiCompiler } = await import('@devpilot.sh/core/wiki');
      const config = getWikiConfig();
      const compiler = createWikiCompiler(config);
      const article = await compiler.getArticle(slug);

      if (!article) {
        console.log(chalk.red(`❌ Article not found: [[${slug}]]`));
        return;
      }

      console.log(chalk.white.bold(`\n# ${article.title}\n`));
      console.log(
        chalk.gray(
          `Category: ${article.category} | Status: ${article.status} | v${article.version}`
        )
      );

      if (article.backlinks.length > 0) {
        console.log(
          chalk.gray(
            `Related: ${article.backlinks.map((b) => `[[${b}]]`).join(', ')}`
          )
        );
      }

      console.log(chalk.gray('─'.repeat(60)));
      console.log(article.content);
      console.log('');
    } catch (error) {
      console.log(
        chalk.red(
          `❌ Read failed: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  });

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function getWikiConfig() {
  const cwd = process.cwd();
  return {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: resolveWikiModel(),
    maxTokens: parseInt(process.env.WIKI_MAX_TOKENS || '8192', 10),
    repo: getRepoName(cwd),
    wikiDir: join(cwd, '.devpilot', 'wiki'),
  };
}

function getRepoName(cwd: string): string {
  try {
    const { execSync } = require('child_process');
    const remote = execSync('git remote get-url origin', {
      cwd,
      encoding: 'utf-8',
    }).trim();
    // Extract owner/repo from git URL
    const match = remote.match(/[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?$/);
    return match ? match[1] : cwd.split('/').pop() || 'unknown';
  } catch {
    return cwd.split('/').pop() || 'unknown';
  }
}
