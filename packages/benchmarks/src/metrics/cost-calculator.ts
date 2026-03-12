/**
 * Cost Calculator
 *
 * Maps token usage to USD costs based on model pricing.
 */

import type { TokenUsage, ModelPricing, CostEntry, SessionRecord } from '../types';
import { DEFAULT_MODEL_PRICING } from '../config';

/**
 * Cost breakdown by category.
 */
export interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  totalCost: number;
}

/**
 * Calculates costs from token usage based on model pricing.
 */
export class CostCalculator {
  private pricing: Map<string, ModelPricing>;
  private pricingSnapshot: ModelPricing[];

  constructor(pricingConfig?: ModelPricing[]) {
    this.pricing = new Map();
    this.pricingSnapshot = pricingConfig ?? DEFAULT_MODEL_PRICING;

    // Initialize pricing map
    this.loadPricing(this.pricingSnapshot);
  }

  /**
   * Load pricing configuration.
   */
  loadPricing(pricing: ModelPricing[]): void {
    this.pricing.clear();
    for (const p of pricing) {
      this.pricing.set(p.model.toLowerCase(), p);
    }
    this.pricingSnapshot = [...pricing];
  }

  /**
   * Set pricing for a specific model.
   */
  setPricing(model: string, pricing: ModelPricing): void {
    this.pricing.set(model.toLowerCase(), pricing);
    // Update snapshot
    const idx = this.pricingSnapshot.findIndex(
      (p) => p.model.toLowerCase() === model.toLowerCase()
    );
    if (idx >= 0) {
      this.pricingSnapshot[idx] = pricing;
    } else {
      this.pricingSnapshot.push(pricing);
    }
  }

  /**
   * Get pricing for a model.
   */
  getPricing(model: string): ModelPricing | undefined {
    return this.pricing.get(model.toLowerCase());
  }

  /**
   * Calculate cost for a given model and token usage.
   */
  calculateCost(model: string, usage: TokenUsage): number {
    const breakdown = this.calculateBreakdown(model, usage);
    return breakdown.totalCost;
  }

  /**
   * Calculate detailed cost breakdown.
   */
  calculateBreakdown(model: string, usage: TokenUsage): CostBreakdown {
    const pricing = this.getPricing(model);

    if (!pricing) {
      console.warn(
        `Unknown model pricing: ${model}, using sonnet rates as fallback`
      );
      return this.calculateBreakdown('sonnet', usage);
    }

    const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputPer1M;
    const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputPer1M;
    const cacheReadCost =
      (usage.cacheReadTokens / 1_000_000) * pricing.cacheReadPer1M;
    const cacheWriteCost =
      (usage.cacheWriteTokens / 1_000_000) * pricing.cacheWritePer1M;

    return {
      inputCost,
      outputCost,
      cacheReadCost,
      cacheWriteCost,
      totalCost: inputCost + outputCost + cacheReadCost + cacheWriteCost,
    };
  }

  /**
   * Calculate cost for a session record.
   */
  calculateSessionCost(session: SessionRecord): CostEntry {
    const usage: TokenUsage = {
      inputTokens: session.tokensInput,
      outputTokens: session.tokensOutput,
      cacheReadTokens: session.cacheReadTokens,
      cacheWriteTokens: session.cacheWriteTokens,
      totalTokens: session.tokensInput + session.tokensOutput,
    };

    const breakdown = this.calculateBreakdown(session.model, usage);

    return {
      sessionId: session.sessionId,
      model: session.model,
      tokens: usage,
      costUsd: breakdown.totalCost,
      breakdown: {
        inputCost: breakdown.inputCost,
        outputCost: breakdown.outputCost,
        cacheReadCost: breakdown.cacheReadCost,
        cacheWriteCost: breakdown.cacheWriteCost,
      },
    };
  }

  /**
   * Calculate total cost for multiple sessions.
   */
  calculateTotalCost(sessions: SessionRecord[]): number {
    return sessions.reduce((total, session) => {
      return total + this.calculateSessionCost(session).costUsd;
    }, 0);
  }

  /**
   * Get cost breakdown for multiple sessions.
   */
  getCostBreakdown(sessions: SessionRecord[]): CostEntry[] {
    return sessions.map((session) => this.calculateSessionCost(session));
  }

  /**
   * Get aggregated cost by model.
   */
  getCostByModel(sessions: SessionRecord[]): Map<string, number> {
    const costByModel = new Map<string, number>();

    for (const session of sessions) {
      const cost = this.calculateSessionCost(session).costUsd;
      const existing = costByModel.get(session.model) ?? 0;
      costByModel.set(session.model, existing + cost);
    }

    return costByModel;
  }

  /**
   * Get the pricing snapshot (for storing in results).
   */
  getPricingSnapshot(): ModelPricing[] {
    return [...this.pricingSnapshot];
  }

  /**
   * Format cost as a string with appropriate precision.
   */
  static formatCost(costUsd: number): string {
    if (costUsd < 0.01) {
      return `$${costUsd.toFixed(4)}`;
    }
    if (costUsd < 1) {
      return `$${costUsd.toFixed(3)}`;
    }
    return `$${costUsd.toFixed(2)}`;
  }

  /**
   * Estimate cost for a planned task.
   */
  estimateCost(
    model: string,
    estimatedInputTokens: number,
    estimatedOutputTokens: number
  ): number {
    const usage: TokenUsage = {
      inputTokens: estimatedInputTokens,
      outputTokens: estimatedOutputTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: estimatedInputTokens + estimatedOutputTokens,
    };

    return this.calculateCost(model, usage);
  }
}

/**
 * Create a cost calculator with default pricing.
 */
export function createCostCalculator(
  customPricing?: ModelPricing[]
): CostCalculator {
  return new CostCalculator(customPricing);
}
