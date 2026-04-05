import type { PromptContext, FleetContextBlock, CodebaseContextBlock, ConstraintBlock } from './types';
import { FleetContextService } from './fleet-context';
import { CodebaseContextService } from './codebase-context';
import { MemoryContextService, type MemoryContextServiceConfig } from './memory-context';
import { defaultTemplate } from './prompt-templates/default';
import { simplifiedTemplate } from './prompt-templates/simplified';
import { refinementTemplate } from './prompt-templates/refinement';
import type { PromptTemplate, RefinementPromptTemplate } from './prompt-templates/types';

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
  /** Memory provider configuration */
  memory?: MemoryContextServiceConfig;
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
  private memoryContextService: MemoryContextService;
  private templates: Map<string, PromptTemplate>;

  constructor(memoryConfig?: MemoryContextServiceConfig) {
    this.fleetContextService = new FleetContextService();
    this.codebaseContextService = new CodebaseContextService();
    this.memoryContextService = new MemoryContextService(memoryConfig);

    // Register available templates
    this.templates = new Map<string, PromptTemplate>([
      ['default', defaultTemplate],
      ['simplified', simplifiedTemplate],
      ['refinement', refinementTemplate],
    ]);
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
    // Gather fleet context, codebase context, and memory context in parallel
    const [fleetContext, codebaseContext, memoryContext] = await Promise.all([
      this.fleetContextService.assembleContext(repo),
      this.codebaseContextService.assembleContext(repo, config.workingDir),
      this.memoryContextService.assembleContext(specContent, repo),
    ]);

    // Assemble constraints
    const constraints = this.assembleConstraints(config, fleetContext);

    // Add high-conflict files from memory to avoid list
    if (memoryContext.memorySignals?.highConflictFiles.length) {
      for (const file of memoryContext.memorySignals.highConflictFiles) {
        if (!constraints.avoidFiles.includes(file)) {
          constraints.customConstraints.push(
            `File \`${file}\` has high conflict frequency in past sessions — prefer isolating changes to this file in its own wave`
          );
        }
      }
    }

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
 *
 * @param memoryConfig - Optional memory provider configuration.
 *   Default uses SQLite provider (queries existing completedTasks).
 *   Set { provider: 'memvid' } to use Memvid .mv2 file-based memory.
 */
export function createPromptConstructor(
  memoryConfig?: MemoryContextServiceConfig
): PromptConstructor {
  return new PromptConstructor(memoryConfig);
}
