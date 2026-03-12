import type { PromptContext } from '../types';

/**
 * Base interface for all wave planner prompt templates.
 * Templates render structured prompts that guide Claude to generate
 * wave-decomposed execution plans.
 */
export interface PromptTemplate {
  /** Human-readable template identifier */
  name: string;

  /** Template version for tracking iterations */
  version: string;

  /**
   * Renders the complete prompt string from the given context.
   * @param context - All relevant context for plan generation
   * @returns Formatted prompt string ready for Claude API
   */
  render(context: PromptContext): string;
}

/**
 * Extended template interface for refinement operations.
 * Used when iteratively improving existing plans.
 */
export interface RefinementPromptTemplate extends PromptTemplate {
  /**
   * Renders a refinement prompt with additional context about the current plan.
   * @param context - Base prompt context
   * @param currentPlan - The existing plan to improve (markdown format)
   * @param currentScore - Quality score of the current plan (0-1)
   * @returns Formatted refinement prompt
   */
  renderRefinement(context: PromptContext, currentPlan: string, currentScore: number): string;
}
