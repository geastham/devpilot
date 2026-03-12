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
      throw new Error(
        `Claude API call failed after ${durationMs}ms: ${error instanceof Error ? error.message : String(error)}`
      );
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
