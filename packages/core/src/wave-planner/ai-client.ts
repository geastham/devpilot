import Anthropic from '@anthropic-ai/sdk';
import type { GenerationResult } from './types';

// ============================================================================
// AI Client Configuration
// ============================================================================

export interface AIClientConfig {
  apiKey: string;
  model: string; // e.g., 'claude-sonnet-4-20250514'
  maxTokens: number; // e.g., 8192
  timeout?: number; // ms
  /**
   * When set, extended thinking is enabled and the budget (in tokens) is passed
   * through to the API. Must be strictly less than maxTokens. Intended for the
   * `ultra` tier (Opus 4.6) where we want the model to spend most of its
   * compute in the thinking block and reserve the output tokens for the
   * structured plan.
   */
  thinkingBudget?: number;
}

// ============================================================================
// Progress Callback
// ============================================================================

/**
 * Fine-grained progress events emitted while a single generation call is in
 * flight. Used by the async job runner to populate the `PlanProgressCard` UI.
 */
export type GenerationProgressEvent =
  | { type: 'started'; model: string; hasThinking: boolean }
  | { type: 'thinking'; thinkingTokens: number }
  | { type: 'drafting'; outputTokens: number }
  | { type: 'completed'; tokensInput: number; tokensOutput: number; thinkingTokens: number; durationMs: number };

export type GenerationProgressCallback = (event: GenerationProgressEvent) => void;

export interface GenerateOptions {
  onProgress?: GenerationProgressCallback;
  signal?: AbortSignal;
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
   * Returns true if this client is configured with extended thinking (ultra tier).
   */
  hasExtendedThinking(): boolean {
    return typeof this.config.thinkingBudget === 'number' && this.config.thinkingBudget > 0;
  }

  getModel(): string {
    return this.config.model;
  }

  /**
   * Generate a wave plan by calling Claude API.
   *
   * When `thinkingBudget` is configured, this uses extended thinking and
   * streams the response so progress events can be surfaced to the UI as the
   * model transitions from the thinking phase into the drafting phase.
   *
   * @param prompt - The constructed prompt for wave planning
   * @returns Generation result with content and metadata
   */
  async generatePlan(prompt: string, options?: GenerateOptions): Promise<GenerationResult> {
    const startTime = Date.now();
    const hasThinking = this.hasExtendedThinking();

    options?.onProgress?.({
      type: 'started',
      model: this.config.model,
      hasThinking,
    });

    try {
      if (hasThinking) {
        return await this.generateWithThinking(prompt, startTime, options);
      }

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

      const result: GenerationResult = {
        content: textContent,
        tokensInput: response.usage.input_tokens,
        tokensOutput: response.usage.output_tokens,
        cacheReadTokens: (response.usage as any).cache_read_input_tokens ?? 0,
        cacheWriteTokens: (response.usage as any).cache_creation_input_tokens ?? 0,
        durationMs,
        model: response.model,
        thinkingTokens: 0,
      };

      options?.onProgress?.({
        type: 'completed',
        tokensInput: result.tokensInput,
        tokensOutput: result.tokensOutput,
        thinkingTokens: 0,
        durationMs,
      });

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      throw new Error(
        `Claude API call failed after ${durationMs}ms: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Extended-thinking code path. Streams the response so we can report phase
   * transitions (thinking -> drafting) to the job runner.
   */
  private async generateWithThinking(
    prompt: string,
    startTime: number,
    options?: GenerateOptions
  ): Promise<GenerationResult> {
    const thinkingBudget = this.config.thinkingBudget!;
    // Reserve some room for the structured output on top of the thinking budget.
    const maxTokens = Math.max(this.config.maxTokens, thinkingBudget + 2048);

    const stream = this.client.messages.stream(
      {
        model: this.config.model,
        max_tokens: maxTokens,
        thinking: {
          type: 'enabled',
          budget_tokens: thinkingBudget,
        } as any,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      },
      options?.signal ? { signal: options.signal } : undefined
    );

    let sawThinking = false;
    let sawText = false;

    // Accumulate progress signals from the stream without blocking on final.
    // The SDK types for `stream()` expose event handlers via `.on()` but we
    // consume the aggregated `finalMessage()` below for the authoritative
    // content and usage counts.
    stream.on('contentBlock', (block: any) => {
      if (block.type === 'thinking' && !sawThinking) {
        sawThinking = true;
        options?.onProgress?.({ type: 'thinking', thinkingTokens: 0 });
      }
      if (block.type === 'text' && !sawText) {
        sawText = true;
        options?.onProgress?.({ type: 'drafting', outputTokens: 0 });
      }
    });

    const finalMessage = await stream.finalMessage();
    const durationMs = Date.now() - startTime;

    const textContent = finalMessage.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => ('text' in block ? block.text : ''))
      .join('\n');

    // Usage from extended-thinking responses includes a dedicated field for
    // thinking output tokens. Fall back to 0 if the SDK shape differs.
    const usage = finalMessage.usage as any;
    const thinkingTokens = usage?.cache_creation_input_tokens !== undefined
      ? (usage?.output_tokens ?? 0) // thinking tokens are billed under output; see below
      : 0;

    // Newer SDKs expose `thinking_output_tokens` or similar; prefer that when
    // present so we can distinguish thinking from visible output.
    const explicitThinkingTokens =
      usage?.thinking_output_tokens ??
      usage?.cache_thinking_tokens ??
      undefined;

    const resolvedThinkingTokens = typeof explicitThinkingTokens === 'number'
      ? explicitThinkingTokens
      : 0;

    const result: GenerationResult = {
      content: textContent,
      tokensInput: usage?.input_tokens ?? 0,
      tokensOutput: usage?.output_tokens ?? 0,
      cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
      cacheWriteTokens: usage?.cache_creation_input_tokens ?? 0,
      durationMs,
      model: finalMessage.model,
      thinkingTokens: resolvedThinkingTokens,
    };

    options?.onProgress?.({
      type: 'completed',
      tokensInput: result.tokensInput,
      tokensOutput: result.tokensOutput,
      thinkingTokens: resolvedThinkingTokens,
      durationMs,
    });

    return result;
  }

  /**
   * Generate a wave plan with retry logic and exponential backoff.
   * @param prompt - The constructed prompt for wave planning
   * @param maxRetries - Maximum number of retry attempts (default: 3)
   * @returns Generation result with content and metadata
   */
  async generateWithRetry(
    prompt: string,
    maxRetries: number = 3,
    options?: GenerateOptions
  ): Promise<GenerationResult> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.generatePlan(prompt, options);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Bail out immediately if the caller cancelled the job.
        if (options?.signal?.aborted) {
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
