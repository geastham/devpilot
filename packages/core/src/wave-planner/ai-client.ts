import Anthropic from '@anthropic-ai/sdk';
import type { GenerationResult } from './types';

// ============================================================================
// AI Client Configuration
// ============================================================================

export interface AIClientConfig {
  apiKey: string;
  /** Model ID. Prefer `resolvePlannerModel()` over a literal — see models.ts. */
  model: string;
  maxTokens: number; // e.g., 8192
  timeout?: number; // ms
}

/**
 * Status codes where retrying cannot possibly help.
 *
 * A retired model ID (404), a bad key (401), a revoked key (403), and a
 * malformed request (400) are all permanent for the lifetime of the process.
 * Retrying them costs the caller the full backoff ladder — 1s + 2s + 4s — and
 * then reports the failure as "after 4 attempts", which reads like a flaky
 * network rather than the configuration error it is.
 *
 * 408 and 429 are excluded deliberately: they are transient by definition.
 */
const NON_RETRYABLE_STATUS = new Set([400, 401, 403, 404, 405, 422]);

/**
 * Persist a raw model response when DEVPILOT_PLANNER_DUMP_DIR is set.
 *
 * Deliberately best-effort and never throwing: a diagnostic that can fail a
 * planning run is worse than no diagnostic. Off unless the env var is set, so
 * it costs nothing in normal operation and never writes plan text to disk
 * behind the user's back.
 */
function dumpRawResponse(text: string, model: string): void {
  const dir = process.env.DEVPILOT_PLANNER_DUMP_DIR;
  if (!dir) return;
  try {
    // Required lazily so the bundler does not pull node:fs into any consumer
    // that never enables dumping.
    const fs = require('node:fs') as typeof import('node:fs');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(
      `${dir}/planner-${stamp}.md`,
      `<!-- model: ${model} -->\n${text}`,
      { mode: 0o600 }
    );
  } catch {
    // Diagnostics must never break a run.
  }
}

function isRetryable(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  if (typeof status !== 'number') return true; // network/unknown — worth a retry
  return !NON_RETRYABLE_STATUS.has(status);
}

// ============================================================================
// Wave Planner AI Client
// ============================================================================

export class WavePlannerAIClient {
  private client: Anthropic;
  private config: AIClientConfig;

  constructor(config: AIClientConfig) {
    this.config = config;
    this.client = new Anthropic({
      apiKey: config.apiKey,
      timeout: config.timeout,
    });
  }

  /**
   * Generate a wave plan by calling Claude API
   * @param prompt - The constructed prompt for wave planning
   * @returns Generation result with content and metadata
   */
  async generatePlan(prompt: string): Promise<GenerationResult> {
    const startTime = Date.now();

    try {
      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const durationMs = Date.now() - startTime;

      // Extract text content from response
      const textContent = response.content
        .filter((block) => block.type === 'text')
        .map((block) => ('text' in block ? block.text : ''))
        .join('\n');

      // The parser consumes markdown tables, so a format drift between what the
      // model emits and what the parser expects shows up only as "contains no
      // tasks" — with the actual response nowhere to be seen. Set
      // DEVPILOT_PLANNER_DUMP_DIR to keep the raw text for diagnosis.
      dumpRawResponse(textContent, response.model);

      /**
       * A plan cut off at the token ceiling is not a plan.
       *
       * Observed on AVA-12: the model ran out of output tokens mid-table, the
       * last row ended after two pipes instead of seven, and the parser
       * salvaged a task code with an empty description. That plan was then
       * scored, shown to a human as complete, and would have dispatched an
       * agent with no instructions.
       *
       * `stop_reason: 'max_tokens'` is the API telling us exactly this, and it
       * was being ignored. Refusing here means the caller's retry/refinement
       * path sees a real failure rather than a quietly shorter plan.
       */
      if (response.stop_reason === 'max_tokens') {
        throw new Error(
          `Planner response hit the ${this.config.maxTokens}-token ceiling and was ` +
            `truncated mid-plan. Raise WAVE_PLANNER_MAX_TOKENS, or narrow the spec.`
        );
      }

      return {
        content: textContent,
        tokensInput: response.usage.input_tokens,
        tokensOutput: response.usage.output_tokens,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        durationMs,
        model: response.model,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const wrapped = new Error(
        `Claude API call failed after ${durationMs}ms: ${error instanceof Error ? error.message : String(error)}`
      );
      // Carry the HTTP status across the wrap. Without this the retry loop
      // cannot tell a retired model ID from a transient 529 and backs off
      // through the full ladder on both.
      const status = (error as { status?: number } | null)?.status;
      if (typeof status === 'number') {
        (wrapped as Error & { status?: number }).status = status;
      }
      throw wrapped;
    }
  }

  /**
   * Generate a wave plan with retry logic and exponential backoff
   * @param prompt - The constructed prompt for wave planning
   * @param maxRetries - Maximum number of retry attempts (default: 3)
   * @returns Generation result with content and metadata
   */
  async generateWithRetry(
    prompt: string,
    maxRetries: number = 3
  ): Promise<GenerationResult> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.generatePlan(prompt);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Fail fast on permanent errors. A retired model ID or a bad key will
        // fail identically on every attempt, so backing off just delays the
        // report and disguises a config problem as an outage.
        if (!isRetryable(error)) {
          throw lastError;
        }

        // Don't retry on the last attempt
        if (attempt === maxRetries) {
          break;
        }

        // Exponential backoff: 2^attempt * 1000ms (1s, 2s, 4s, ...)
        const delayMs = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw new Error(
      `Failed to generate plan after ${maxRetries + 1} attempts: ${lastError?.message || 'Unknown error'}`
    );
  }
}
