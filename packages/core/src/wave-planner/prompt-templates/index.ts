/**
 * Prompt Templates for Wave Planner
 *
 * This module provides structured prompt templates for generating wave-decomposed
 * execution plans. Templates guide Claude to produce parseable, high-quality plans
 * that optimize for parallelization while respecting dependencies and constraints.
 *
 * @module prompt-templates
 */

// Export types
export * from './types';

// Export template implementations
export { defaultTemplate } from './default';
export { simplifiedTemplate } from './simplified';
export { refinementTemplate } from './refinement';
