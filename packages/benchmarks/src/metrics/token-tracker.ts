/**
 * Token Tracker
 *
 * Parses and aggregates token usage from Claude Code CLI output
 * and CompletionReport objects.
 */

import type { TokenUsage } from '../types';

/**
 * Token snapshot aggregated by session and model.
 */
export interface TokenSnapshot {
  /** Usage by session ID */
  bySession: Map<string, TokenUsage>;
  /** Usage by model name */
  byModel: Map<string, TokenUsage>;
  /** Total usage across all sessions */
  total: TokenUsage;
  /** Cache hit rate (0-1) */
  cacheHitRate: number;
}

/**
 * Tracks and aggregates token usage across sessions.
 */
export class TokenTracker {
  private usageBySession: Map<string, TokenUsage> = new Map();
  private usageByModel: Map<string, TokenUsage> = new Map();

  /**
   * Record token usage for a session.
   */
  recordUsage(sessionId: string, model: string, usage: TokenUsage): void {
    // Store by session
    this.usageBySession.set(sessionId, usage);

    // Aggregate by model
    const existing = this.usageByModel.get(model) ?? createEmptyUsage();
    this.usageByModel.set(model, addUsage(existing, usage));
  }

  /**
   * Parse and record token usage from Claude Code CLI output.
   * Returns true if parsing was successful.
   */
  recordFromOutput(sessionId: string, model: string, output: string): boolean {
    // Try JSON format first
    let usage = this.parseJsonOutput(output);

    // Fall back to text format
    if (!usage) {
      usage = this.parseTextOutput(output);
    }

    if (usage) {
      this.recordUsage(sessionId, model, usage);
      return true;
    }

    return false;
  }

  /**
   * Record token usage from a CompletionReport.
   */
  recordFromCompletionReport(
    sessionId: string,
    model: string,
    report: {
      tokensUsed?: number;
      inputTokens?: number;
      outputTokens?: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
    }
  ): void {
    const usage: TokenUsage = {
      inputTokens: report.inputTokens ?? 0,
      outputTokens: report.outputTokens ?? 0,
      cacheReadTokens: report.cacheReadTokens ?? 0,
      cacheWriteTokens: report.cacheWriteTokens ?? 0,
      totalTokens:
        report.tokensUsed ??
        (report.inputTokens ?? 0) + (report.outputTokens ?? 0),
    };

    this.recordUsage(sessionId, model, usage);
  }

  /**
   * Parse JSON output format from Claude Code CLI.
   *
   * Expected format:
   * {
   *   "usage": {
   *     "input_tokens": 12500,
   *     "output_tokens": 45000,
   *     "cache_read_input_tokens": 5000,
   *     "cache_creation_input_tokens": 2000
   *   }
   * }
   */
  parseJsonOutput(output: string): TokenUsage | null {
    try {
      // Find JSON object containing usage info
      const jsonMatch = output.match(/\{[\s\S]*?"usage"[\s\S]*?\}/);
      if (!jsonMatch) {
        // Try to find standalone usage object
        const usageMatch = output.match(
          /\{[\s\S]*?"input_tokens"[\s\S]*?\}/
        );
        if (!usageMatch) return null;

        const data = JSON.parse(usageMatch[0]);
        return this.extractUsageFromObject(data);
      }

      const data = JSON.parse(jsonMatch[0]);
      const usage = data.usage || data;
      return this.extractUsageFromObject(usage);
    } catch {
      return null;
    }
  }

  /**
   * Extract TokenUsage from a parsed object.
   */
  private extractUsageFromObject(obj: Record<string, unknown>): TokenUsage | null {
    const inputTokens = this.extractNumber(obj, [
      'input_tokens',
      'inputTokens',
      'input',
    ]);
    const outputTokens = this.extractNumber(obj, [
      'output_tokens',
      'outputTokens',
      'output',
    ]);

    if (inputTokens === 0 && outputTokens === 0) {
      return null;
    }

    return {
      inputTokens,
      outputTokens,
      cacheReadTokens: this.extractNumber(obj, [
        'cache_read_input_tokens',
        'cacheReadInputTokens',
        'cache_read',
        'cacheRead',
      ]),
      cacheWriteTokens: this.extractNumber(obj, [
        'cache_creation_input_tokens',
        'cacheCreationInputTokens',
        'cache_write',
        'cacheWrite',
      ]),
      totalTokens: inputTokens + outputTokens,
    };
  }

  /**
   * Extract a number from an object using multiple possible keys.
   */
  private extractNumber(obj: Record<string, unknown>, keys: string[]): number {
    for (const key of keys) {
      const value = obj[key];
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        const parsed = parseInt(value.replace(/,/g, ''), 10);
        if (!isNaN(parsed)) return parsed;
      }
    }
    return 0;
  }

  /**
   * Parse text output format from Claude Code CLI.
   *
   * Expected formats:
   * - "Total tokens: 57500 (12500 input, 45000 output)"
   * - "Cache: 5000 read, 2000 written"
   * - "Tokens used: 57,500"
   */
  parseTextOutput(output: string): TokenUsage | null {
    const patterns = {
      // Match "Total tokens: 57500" or "Tokens: 57500"
      total: /(?:total\s+)?tokens[:\s]+([0-9,]+)/i,
      // Match "12500 input" or "input: 12500"
      input: /(?:input[:\s]+([0-9,]+)|([0-9,]+)\s+input)/i,
      // Match "45000 output" or "output: 45000"
      output: /(?:output[:\s]+([0-9,]+)|([0-9,]+)\s+output)/i,
      // Match "cache read: 5000" or "5000 cache read"
      cacheRead: /(?:cache\s*read[:\s]+([0-9,]+)|([0-9,]+)\s+cache\s*read)/i,
      // Match "cache write: 2000" or "2000 cache write"
      cacheWrite:
        /(?:cache\s*(?:write|creation)[:\s]+([0-9,]+)|([0-9,]+)\s+cache\s*(?:write|creation))/i,
    };

    const parseMatch = (match: RegExpMatchArray | null): number => {
      if (!match) return 0;
      const value = match[1] || match[2];
      return value ? parseInt(value.replace(/,/g, ''), 10) : 0;
    };

    const inputTokens = parseMatch(output.match(patterns.input));
    const outputTokens = parseMatch(output.match(patterns.output));
    const totalMatch = parseMatch(output.match(patterns.total));

    // If we couldn't find input/output but found total, estimate
    if (inputTokens === 0 && outputTokens === 0) {
      if (totalMatch > 0) {
        // Can't split, return as input only
        return {
          inputTokens: totalMatch,
          outputTokens: 0,
          cacheReadTokens: parseMatch(output.match(patterns.cacheRead)),
          cacheWriteTokens: parseMatch(output.match(patterns.cacheWrite)),
          totalTokens: totalMatch,
        };
      }
      return null;
    }

    return {
      inputTokens,
      outputTokens,
      cacheReadTokens: parseMatch(output.match(patterns.cacheRead)),
      cacheWriteTokens: parseMatch(output.match(patterns.cacheWrite)),
      totalTokens: inputTokens + outputTokens,
    };
  }

  /**
   * Get token usage for a specific session.
   */
  getSessionUsage(sessionId: string): TokenUsage | null {
    return this.usageBySession.get(sessionId) ?? null;
  }

  /**
   * Get aggregated token usage for a model.
   */
  getModelUsage(model: string): TokenUsage {
    return this.usageByModel.get(model) ?? createEmptyUsage();
  }

  /**
   * Get total token usage across all sessions.
   */
  getTotalUsage(): TokenUsage {
    let total = createEmptyUsage();
    for (const usage of this.usageBySession.values()) {
      total = addUsage(total, usage);
    }
    return total;
  }

  /**
   * Calculate cache hit rate (proportion of tokens from cache).
   */
  getCacheHitRate(): number {
    const total = this.getTotalUsage();
    const totalInput = total.inputTokens + total.cacheReadTokens;
    if (totalInput === 0) return 0;
    return total.cacheReadTokens / totalInput;
  }

  /**
   * Get complete snapshot of token usage.
   */
  getSnapshot(): TokenSnapshot {
    return {
      bySession: new Map(this.usageBySession),
      byModel: new Map(this.usageByModel),
      total: this.getTotalUsage(),
      cacheHitRate: this.getCacheHitRate(),
    };
  }

  /**
   * Clear all recorded usage.
   */
  clear(): void {
    this.usageBySession.clear();
    this.usageByModel.clear();
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Create an empty token usage object.
 */
export function createEmptyUsage(): TokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
  };
}

/**
 * Add two token usage objects together.
 */
export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}
