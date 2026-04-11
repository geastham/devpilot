import type { PromptContext, FleetContextBlock, CodebaseContextBlock, ConstraintBlock, MemoryContextBlock } from './types';
import { FleetContextService } from './fleet-context';
import { CodebaseContextService } from './codebase-context';
import { defaultTemplate } from './prompt-templates/default';
import { simplifiedTemplate } from './prompt-templates/simplified';
import { refinementTemplate } from './prompt-templates/refinement';
import type { PromptTemplate, RefinementPromptTemplate } from './prompt-templates/types';
import type { MemPalaceService } from '../mempalace/service';

// ============================================================================
// Prompt Constructor Configuration
// ============================================================================

export interface PromptConstructorConfig {
  /** Working directory for codebase context */
  workingDir: string;
  /** Maximum concurrency per wave */
  maxConcurrency?: number;
  /** Preferred model for tasks */
  preferModel?: 'haiku' | 'sonnet' | 'opus';
  /** Maximum cost in USD */
  maxCost?: number;
  /** Custom constraints to include in prompt */
  customConstraints?: string[];
  /** Which template to use */
  template?: 'default' | 'simplified' | 'refinement';
  /**
   * Optional MemPalace wing slug override. When omitted, the service's
   * default wing (usually the repo identifier) is used.
   */
  memPalaceWingSlug?: string;
  /**
   * Optional topic hints passed to MemPalace L2 recall. Typically derived
   * from the spec content or ticket metadata (e.g. ["auth", "billing"]).
   */
  memPalaceTopicHints?: string[];
  /**
   * Token budget for MemPalace context block. Defaults to 2000.
   */
  memPalaceMaxTokens?: number;
}

// ============================================================================
// Prompt Constructor
// ============================================================================

/**
 * PromptConstructor assembles complete prompt context from various services
 * and renders prompts using the appropriate template.
 *
 * Responsibilities:
 * - Gather fleet context (active sessions, in-flight files)
 * - Gather codebase context (file tree, recently modified files)
 * - Assemble constraints
 * - Select and render appropriate template
 */
export class PromptConstructor {
  private fleetContextService: FleetContextService;
  private codebaseContextService: CodebaseContextService;
  private templates: Map<string, PromptTemplate>;
  private memPalaceService?: MemPalaceService;

  constructor(options?: { memPalaceService?: MemPalaceService }) {
    this.fleetContextService = new FleetContextService();
    this.codebaseContextService = new CodebaseContextService();
    this.memPalaceService = options?.memPalaceService;

    // Register available templates
    this.templates = new Map<string, PromptTemplate>([
      ['default', defaultTemplate],
      ['simplified', simplifiedTemplate],
      ['refinement', refinementTemplate],
    ]);
  }

  /**
   * Attach (or replace) the MemPalace service after construction.
   * Useful for wiring in dependency-injection-style contexts.
   */
  setMemPalaceService(service: MemPalaceService | undefined): void {
    this.memPalaceService = service;
  }

  /**
   * Assemble full prompt context from services and configuration.
   *
   * @param specContent - The specification content to plan
   * @param itemTitle - Title of the horizon item
   * @param itemId - ID of the horizon item
   * @param repo - Repository identifier
   * @param config - Constructor configuration
   * @returns Complete PromptContext ready for template rendering
   */
  async assembleContext(
    specContent: string,
    itemTitle: string,
    itemId: string,
    repo: string,
    config: PromptConstructorConfig
  ): Promise<PromptContext> {
    // Gather fleet context
    const fleetContext = await this.fleetContextService.assembleContext(repo);

    // Gather codebase context
    const codebaseContext = await this.codebaseContextService.assembleContext(
      repo,
      config.workingDir
    );

    // Assemble constraints
    const constraints = this.assembleConstraints(config, fleetContext);

    // Assemble MemPalace context (tiered L0-L3 stack) when a service is
    // configured. This is strictly additive — the wiki/legacy memory path
    // continues to work when MemPalace is absent.
    const memoryContext = await this.assembleMemoryContext(
      specContent,
      itemTitle,
      repo,
      config
    );

    return {
      specContent,
      itemTitle,
      itemId,
      repo,
      fleetContext,
      codebaseContext,
      constraints,
      memoryContext,
    };
  }

  /**
   * Assemble MemoryContextBlock. Currently produces only the palace
   * portion; the legacy `relevantSessions` list is left empty for
   * callers that don't supply one (the wave planner then only renders
   * the palace block).
   */
  private async assembleMemoryContext(
    specContent: string,
    itemTitle: string,
    repo: string,
    config: PromptConstructorConfig
  ): Promise<MemoryContextBlock | undefined> {
    if (!this.memPalaceService || !this.memPalaceService.enabled) {
      return undefined;
    }

    const topicHints =
      config.memPalaceTopicHints ??
      deriveTopicHints(itemTitle, specContent);

    const block = await this.memPalaceService.assemblePromptContext({
      wingSlug: config.memPalaceWingSlug ?? repo,
      topicHints,
      maxTokens: config.memPalaceMaxTokens,
    });

    if (!block) return undefined;

    return {
      relevantSessions: [],
      palace: {
        identity: block.identity,
        criticalFacts: block.criticalFacts,
        topicalClosets: block.topicalClosets,
        tokenEstimate: block.tokenEstimate,
        wingSlug: block.wingSlug,
      },
    };
  }

  /**
   * Assemble constraints from configuration and fleet context.
   */
  private assembleConstraints(
    config: PromptConstructorConfig,
    fleetContext: FleetContextBlock
  ): ConstraintBlock {
    // Get files to avoid from in-flight files
    const avoidFiles = this.fleetContextService.getAvoidFiles(fleetContext);

    return {
      avoidFiles,
      preferModel: config.preferModel,
      maxCost: config.maxCost,
      maxConcurrency: config.maxConcurrency,
      customConstraints: config.customConstraints || [],
    };
  }

  /**
   * Construct a full prompt for wave plan generation.
   *
   * @param specContent - The specification content to plan
   * @param itemTitle - Title of the horizon item
   * @param itemId - ID of the horizon item
   * @param repo - Repository identifier
   * @param config - Constructor configuration
   * @returns Rendered prompt string ready for Claude API
   */
  async constructPrompt(
    specContent: string,
    itemTitle: string,
    itemId: string,
    repo: string,
    config: PromptConstructorConfig
  ): Promise<string> {
    // Assemble context
    const context = await this.assembleContext(
      specContent,
      itemTitle,
      itemId,
      repo,
      config
    );

    // Select template
    const templateName = config.template || 'default';
    const template = this.templates.get(templateName);

    if (!template) {
      throw new Error(`Unknown template: ${templateName}`);
    }

    // Render prompt
    return template.render(context);
  }

  /**
   * Construct a refinement prompt for improving an existing plan.
   *
   * @param specContent - The specification content
   * @param itemTitle - Title of the horizon item
   * @param itemId - ID of the horizon item
   * @param repo - Repository identifier
   * @param config - Constructor configuration
   * @param currentPlan - Current plan markdown to refine
   * @param currentScore - Current parallelization score (0-1)
   * @returns Rendered refinement prompt
   */
  async constructRefinementPrompt(
    specContent: string,
    itemTitle: string,
    itemId: string,
    repo: string,
    config: PromptConstructorConfig,
    currentPlan: string,
    currentScore: number
  ): Promise<string> {
    // Assemble context
    const context = await this.assembleContext(
      specContent,
      itemTitle,
      itemId,
      repo,
      config
    );

    // Use refinement template
    const template = refinementTemplate as RefinementPromptTemplate;
    return template.renderRefinement(context, currentPlan, currentScore);
  }

  /**
   * Construct a reoptimization prompt for mid-execution replanning.
   *
   * @param specContent - The specification content
   * @param itemTitle - Title of the horizon item
   * @param itemId - ID of the horizon item
   * @param repo - Repository identifier
   * @param config - Constructor configuration
   * @param completedTasks - Summary of completed tasks
   * @param remainingTasks - Remaining tasks to replan
   * @returns Rendered reoptimization prompt
   */
  async constructReoptimizePrompt(
    specContent: string,
    itemTitle: string,
    itemId: string,
    repo: string,
    config: PromptConstructorConfig,
    completedTasks: {
      taskCode: string;
      description: string;
      filesModified: string[];
      completionSummary: string;
    }[],
    remainingTasks: {
      taskCode: string;
      description: string;
      originalDependencies: string[];
      originalFiles: string[];
    }[]
  ): Promise<string> {
    // Assemble base context
    const context = await this.assembleContext(
      specContent,
      itemTitle,
      itemId,
      repo,
      config
    );

    // Add completed and remaining work to context
    const fullContext: PromptContext = {
      ...context,
      completedWork: { tasks: completedTasks },
      remainingWork: { tasks: remainingTasks },
    };

    // Use default template with work context
    return defaultTemplate.render(fullContext);
  }

  /**
   * Get available template names.
   */
  getAvailableTemplates(): string[] {
    return Array.from(this.templates.keys());
  }

  /**
   * Register a custom template.
   */
  registerTemplate(name: string, template: PromptTemplate): void {
    this.templates.set(name, template);
  }
}

/**
 * Create a prompt constructor instance.
 * Convenience factory function.
 */
export function createPromptConstructor(options?: {
  memPalaceService?: MemPalaceService;
}): PromptConstructor {
  return new PromptConstructor(options);
}

/**
 * Derive topic hints for MemPalace L2 recall from the item title and
 * spec content. This is intentionally simple — it grabs nouns and
 * known domain keywords. Callers can always override by passing
 * `memPalaceTopicHints` explicitly.
 */
function deriveTopicHints(itemTitle: string, specContent: string): string[] {
  const text = `${itemTitle}\n${specContent}`.toLowerCase();
  const candidates = new Set<string>();

  // Pull capitalized words from the title (likely topic markers).
  for (const match of itemTitle.matchAll(/\b([A-Z][a-z]{3,})/g)) {
    candidates.add(match[1].toLowerCase());
  }

  // Well-known domain keywords that are likely to match room topics.
  const domainKeywords = [
    'auth',
    'authentication',
    'authorization',
    'billing',
    'payments',
    'api',
    'database',
    'schema',
    'migration',
    'frontend',
    'backend',
    'deploy',
    'deployment',
    'test',
    'testing',
    'architecture',
    'refactor',
    'performance',
    'security',
    'cache',
  ];
  for (const kw of domainKeywords) {
    if (text.includes(kw)) candidates.add(kw);
  }

  return Array.from(candidates).slice(0, 5);
}
