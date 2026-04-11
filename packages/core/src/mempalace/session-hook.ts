import { WikiCompiler } from '../wiki/compiler';
import { WikiSessionHook } from '../wiki/session-hook';
import type { IngestResult, WikiCompilerConfig } from '../wiki/types';
import { MemPalaceService } from './service';
import { WikiPalaceBridge } from './wiki-bridge';
import type { MemPalaceConfig } from './types';

// ============================================================================
// Dual-Feed Session Hook
// ============================================================================
//
// This is the session hook that the orchestrator should wire up in place of
// the plain WikiSessionHook when MemPalace is enabled.
//
// It delegates all Wiki work to the existing WikiSessionHook (which keeps
// producing and grooming the `/wiki` folder exactly as before), and then
// mirrors the resulting articles into MemPalace via the bridge. MemPalace
// never sees the raw session log directly — it only gets the structured,
// backlinked articles the Wiki compiler already produced.
//
// If MemPalace is disabled, this class behaves identically to WikiSessionHook.
// ============================================================================

export interface DualFeedHookConfig {
  wiki: WikiCompilerConfig;
  mempalace: MemPalaceConfig;
  /** If true, flush the wiki to disk after each session. */
  flushWiki?: boolean;
}

export class DualFeedSessionHook {
  private wikiHook: WikiSessionHook;
  private wikiCompiler: WikiCompiler;
  private palace: MemPalaceService;
  private bridge: WikiPalaceBridge;
  private config: DualFeedHookConfig;

  constructor(config: DualFeedHookConfig) {
    this.config = config;
    this.wikiHook = new WikiSessionHook(config.wiki);
    this.wikiCompiler = new WikiCompiler(config.wiki);
    this.palace = new MemPalaceService(config.mempalace);
    this.bridge = new WikiPalaceBridge(this.wikiCompiler, this.palace, {
      wingSlug: config.mempalace.defaultWingSlug,
      extractFacts: true,
    });
  }

  /**
   * Called when a Claude Code session ends.
   * Flow:
   *   1. Wiki compiler extracts articles from the session log
   *   2. (If enabled) bridge mirrors those articles into MemPalace
   *   3. (If enabled) wiki is flushed to the `/wiki` folder on disk
   */
  async onSessionEnd(
    sessionLog: string,
    sessionId: string
  ): Promise<{
    wikiResult: IngestResult;
    mirroredCount: number;
    wikiFlush?: { filesWritten: number; wikiDir: string };
  }> {
    // 1. Wiki is the primary source of truth. Always run it first.
    const wikiResult = await this.wikiHook.onSessionEnd(sessionLog, sessionId);

    // 2. Mirror the newly-compiled articles into MemPalace. Strictly
    //    non-destructive — if this fails, the Wiki is still complete.
    let mirroredCount = 0;
    if (this.palace.enabled) {
      try {
        const mirror = await this.bridge.mirrorIngest(wikiResult);
        mirroredCount = mirror.mirroredCount;
      } catch (err) {
        // Swallow bridge errors so we never corrupt wiki operation.
        console.warn(
          '[mempalace] Failed to mirror wiki ingest into palace:',
          err
        );
      }
    }

    // 3. Flush the wiki to disk so the `/wiki` folder stays current.
    let wikiFlush: { filesWritten: number; wikiDir: string } | undefined;
    if (this.config.flushWiki !== false) {
      try {
        wikiFlush = await this.wikiHook.flush();
      } catch (err) {
        console.warn('[mempalace] Failed to flush wiki to disk:', err);
      }
    }

    return { wikiResult, mirroredCount, wikiFlush };
  }

  /**
   * Called on commit. Wiki owns commit ingestion; MemPalace mirrors the
   * resulting articles.
   */
  async onCommit(
    commitSha: string,
    commitMessage: string,
    diffContent: string
  ): Promise<{ wikiResult: IngestResult; mirroredCount: number }> {
    const wikiResult = await this.wikiHook.onCommit(
      commitSha,
      commitMessage,
      diffContent
    );

    let mirroredCount = 0;
    if (this.palace.enabled) {
      try {
        const mirror = await this.bridge.mirrorIngest(wikiResult);
        mirroredCount = mirror.mirroredCount;
      } catch (err) {
        console.warn(
          '[mempalace] Failed to mirror commit ingest into palace:',
          err
        );
      }
    }

    return { wikiResult, mirroredCount };
  }

  /**
   * Called on spec update. Same dual-feed pattern as onCommit.
   */
  async onSpecUpdate(
    specContent: string,
    specTitle: string,
    filePath: string
  ): Promise<{ wikiResult: IngestResult; mirroredCount: number }> {
    const wikiResult = await this.wikiHook.onSpecUpdate(
      specContent,
      specTitle,
      filePath
    );

    let mirroredCount = 0;
    if (this.palace.enabled) {
      try {
        const mirror = await this.bridge.mirrorIngest(wikiResult);
        mirroredCount = mirror.mirroredCount;
      } catch (err) {
        console.warn(
          '[mempalace] Failed to mirror spec ingest into palace:',
          err
        );
      }
    }

    return { wikiResult, mirroredCount };
  }

  /** Explicit access to the wiki hook for callers that still need it. */
  get wikiSessionHook(): WikiSessionHook {
    return this.wikiHook;
  }

  /** Explicit access to the palace service for callers that still need it. */
  get palaceService(): MemPalaceService {
    return this.palace;
  }
}
