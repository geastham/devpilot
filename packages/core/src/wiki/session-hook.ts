import { WikiCompiler } from './compiler';
import type { WikiCompilerConfig, IngestResult } from './types';

// ============================================================================
// Wiki Session Hook
// ============================================================================

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
export class WikiSessionHook {
  private compiler: WikiCompiler;
  private config: WikiCompilerConfig;

  constructor(config: WikiCompilerConfig) {
    this.config = config;
    this.compiler = new WikiCompiler(config);
  }

  /**
   * Called when a Claude Code session ends.
   * Extracts wiki-worthy knowledge and compiles it into articles.
   */
  async onSessionEnd(
    sessionLog: string,
    sessionId: string
  ): Promise<IngestResult> {
    // Skip very short sessions — likely just status checks
    if (sessionLog.length < 200) {
      return {
        sourceId: '',
        articlesCreated: [],
        articlesUpdated: [],
        tokensUsed: 0,
      };
    }

    return this.compiler.extractFromSession(sessionLog, sessionId);
  }

  /**
   * Called when a commit is made during a session.
   * Ingests the commit diff and message as a source.
   */
  async onCommit(
    commitSha: string,
    commitMessage: string,
    diffContent: string
  ): Promise<IngestResult> {
    const content = `## Commit: ${commitSha.slice(0, 8)}\n\n**Message:** ${commitMessage}\n\n### Diff\n\`\`\`\n${diffContent}\n\`\`\``;

    return this.compiler.ingest(
      content,
      'commit',
      commitMessage.split('\n')[0],
      commitSha
    );
  }

  /**
   * Called when a spec or requirements document is created/updated.
   */
  async onSpecUpdate(
    specContent: string,
    specTitle: string,
    filePath: string
  ): Promise<IngestResult> {
    return this.compiler.ingest(specContent, 'spec', specTitle, filePath);
  }

  /**
   * Flush the wiki to disk after extraction.
   * Typically called after onSessionEnd to persist changes.
   */
  async flush(): Promise<{ filesWritten: number; wikiDir: string }> {
    return this.compiler.flushToDisk();
  }

  /**
   * Generate the Claude Code hook script that captures session logs
   * and triggers wiki extraction.
   *
   * Returns a shell script suitable for use as a Claude Code PostSession hook.
   */
  static generateHookScript(wikiDir: string, repo: string): string {
    return `#!/bin/bash
# DevPilot Wiki Session Hook
# Auto-extracts knowledge from Claude Code sessions into the wiki.
# Install: Add to .claude/settings.json under hooks.PostSession

WIKI_DIR="${wikiDir}"
REPO="${repo}"
SESSION_LOG="$1"

# Skip if no session log provided
if [ -z "$SESSION_LOG" ] || [ ! -f "$SESSION_LOG" ]; then
  exit 0
fi

# Skip very short sessions
LINES=$(wc -l < "$SESSION_LOG")
if [ "$LINES" -lt 10 ]; then
  exit 0
fi

# Run wiki extraction via devpilot CLI
devpilot wiki ingest --type session_log --title "Session $(date +%Y-%m-%d-%H%M)" --file "$SESSION_LOG" 2>/dev/null

# Flush wiki to disk
devpilot wiki flush 2>/dev/null
`;
  }

  /**
   * Generate the Claude Code settings.json hook configuration.
   */
  static generateHookConfig(wikiDir: string, repo: string): object {
    return {
      hooks: {
        PostSession: [
          {
            type: 'command',
            command: `devpilot wiki ingest --type session_log --title "Session $(date +%Y-%m-%d-%H%M)" --stdin`,
          },
        ],
      },
    };
  }
}
