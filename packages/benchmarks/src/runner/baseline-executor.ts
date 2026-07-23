/**
 * Baseline Executor
 *
 * Executes benchmark using a single Claude Code session (baseline scenario).
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import type {
  ScenarioResult,
  ScenarioStatus,
  SessionRecord,
  ExecutionError,
  WorkspaceInfo,
  TokenUsage,
  AcceptanceResult,
} from '../types';
import { ProcessManager, ProcessResult } from './process-manager';
import { AcceptanceRunner } from './acceptance';
import { MetricsCollector, ScenarioMetrics } from '../metrics/collector';
import { createId } from '@paralleldrive/cuid2';

const DEFAULT_TIMEOUT_MS = 600000; // 10 minutes
const DEFAULT_MODEL = 'sonnet';

export interface BaselineExecutorConfig {
  timeoutMs?: number;
  model?: string;
  claudeCliPath?: string;
  retryOnFailure?: boolean;
  verbose?: boolean;
}

interface ClaudeOutput {
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  content?: string;
  error?: string;
}

/**
 * Executes baseline scenario using single Claude Code session.
 */
export class BaselineExecutor {
  private processManager: ProcessManager;
  private acceptanceRunner: AcceptanceRunner;
  private config: Required<BaselineExecutorConfig>;

  constructor(
    processManager: ProcessManager,
    acceptanceRunner: AcceptanceRunner,
    config: BaselineExecutorConfig = {}
  ) {
    this.processManager = processManager;
    this.acceptanceRunner = acceptanceRunner;
    this.config = {
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      model: config.model ?? DEFAULT_MODEL,
      claudeCliPath: config.claudeCliPath ?? 'claude',
      retryOnFailure: config.retryOnFailure ?? true,
      verbose: config.verbose ?? false,
    };
  }

  /**
   * Execute baseline scenario.
   */
  async execute(
    workspace: WorkspaceInfo,
    collector: MetricsCollector
  ): Promise<ScenarioResult> {
    const startTime = Date.now();
    const startedAt = new Date(startTime).toISOString();
    const sessionId = createId();
    const sessions: SessionRecord[] = [];
    const errors: ExecutionError[] = [];

    try {
      // Read PRD
      const prdPath = join(workspace.rootDir, 'PRD.md');
      const prdContent = await readFile(prdPath, 'utf-8');

      // Build prompt
      const prompt = this.buildPrompt(prdContent);

      // Execute Claude Code
      collector.getTimeline().recordEvent('session_start', { sessionId });

      const result = await this.executeClaudeCode(workspace, prompt, sessionId);

      collector.getTimeline().recordEvent('session_complete', { sessionId });

      // Parse output, build session record and record tokens
      const usage = this.parseTokenUsage(result.stdout);
      const session = this.buildSession(
        sessionId,
        prompt,
        startedAt,
        usage,
        result
      );
      collector.registerSession(session);
      sessions.push(session);

      // Run acceptance tests
      const acceptanceResults = await this.acceptanceRunner.run(
        workspace.rootDir
      );

      // Retry if tests failed and retry is enabled
      if (acceptanceResults.passRate < 1.0 && this.config.retryOnFailure) {
        const retryResult = await this.retryExecution(
          workspace,
          acceptanceResults,
          collector,
          sessions,
          startedAt
        );
        if (retryResult) {
          return retryResult;
        }
      }

      // Calculate metrics
      const metrics = collector.aggregateScenarioMetrics(
        sessions,
        acceptanceResults.passRate
      );

      return this.buildResult(
        'completed',
        startedAt,
        startTime,
        sessions,
        metrics,
        acceptanceResults,
        collector,
        errors,
        acceptanceResults.passRate,
        1.0 // Single session, no rework
      );
    } catch (error) {
      errors.push({
        timestamp: new Date().toISOString(),
        phase: 'execution',
        code: 'EXECUTION_ERROR',
        message: error instanceof Error ? error.message : String(error),
        recoverable: false,
      });

      return this.buildFailedResult(startedAt, startTime, sessions, collector, errors);
    }
  }

  /**
   * Build a canonical session record from execution output.
   */
  private buildSession(
    sessionId: string,
    prompt: string,
    startedAt: string,
    usage: TokenUsage | null,
    result: ProcessResult
  ): SessionRecord {
    return {
      sessionId,
      scenario: 'baseline',
      model: this.config.model,
      prompt,
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - new Date(startedAt).getTime(),
      tokensInput: usage?.inputTokens ?? 0,
      tokensOutput: usage?.outputTokens ?? 0,
      cacheReadTokens: usage?.cacheReadTokens ?? 0,
      cacheWriteTokens: usage?.cacheWriteTokens ?? 0,
      costUsd: 0,
      filesCreated: [],
      filesModified: [],
      success: (result.exitCode ?? 0) === 0,
      stdout: result.stdout,
    };
  }

  /**
   * Assemble a completed scenario result from aggregated metrics.
   */
  private buildResult(
    status: ScenarioStatus,
    startedAt: string,
    startTime: number,
    sessions: SessionRecord[],
    metrics: ScenarioMetrics,
    acceptanceResults: AcceptanceResult,
    collector: MetricsCollector,
    errors: ExecutionError[],
    firstAttemptPassRate: number,
    reworkRatio: number
  ): ScenarioResult {
    return {
      scenario: 'baseline',
      status,
      startedAt,
      completedAt: new Date().toISOString(),
      wallClockMs: Date.now() - startTime,
      totalTokensInput: metrics.tokens.inputTokens,
      totalTokensOutput: metrics.tokens.outputTokens,
      totalTokens: metrics.tokens.totalTokens,
      cacheReadTokens: metrics.tokens.cacheReadTokens,
      cacheWriteTokens: metrics.tokens.cacheWriteTokens,
      totalCostUsd: metrics.totalCostUsd,
      costBreakdown: metrics.costBreakdown,
      acceptanceResults,
      firstAttemptPassRate,
      reworkRatio,
      sessions,
      timeline: collector.exportTimeline(),
      errors,
      filesCreated: metrics.filesCreated,
      filesModified: metrics.filesModified,
    };
  }

  /**
   * Assemble a failed scenario result with zeroed metrics.
   */
  private buildFailedResult(
    startedAt: string,
    startTime: number,
    sessions: SessionRecord[],
    collector: MetricsCollector,
    errors: ExecutionError[]
  ): ScenarioResult {
    return {
      scenario: 'baseline',
      status: 'failed',
      startedAt,
      completedAt: new Date().toISOString(),
      wallClockMs: Date.now() - startTime,
      totalTokensInput: 0,
      totalTokensOutput: 0,
      totalTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalCostUsd: 0,
      costBreakdown: [],
      acceptanceResults: {
        totalTests: 0,
        passed: 0,
        failed: 0,
        passRate: 0,
        details: [],
        scriptOutput: '',
      },
      firstAttemptPassRate: 0,
      reworkRatio: 1.0,
      sessions,
      timeline: collector.exportTimeline(),
      errors,
      filesCreated: [],
      filesModified: [],
    };
  }

  /**
   * Build the prompt for Claude Code.
   */
  private buildPrompt(prdContent: string): string {
    return `Read the following PRD and implement the entire project as specified.
Create all necessary files and ensure the project passes all acceptance criteria.

# PRD

${prdContent}

# Instructions

1. Read the PRD carefully and understand all requirements
2. Create the project structure as specified
3. Implement all components in the correct dependency order
4. Ensure all acceptance criteria are met
5. Run any tests if specified

Start implementation now.`;
  }

  /**
   * Execute Claude Code CLI.
   */
  private async executeClaudeCode(
    workspace: WorkspaceInfo,
    prompt: string,
    sessionId: string
  ): Promise<ProcessResult> {
    const args = [
      '--dangerously-skip-permissions',
      '--print',
      '--output-format', 'json',
      '--model', this.config.model,
      prompt,
    ];

    return this.processManager.spawn(this.config.claudeCliPath, args, {
      cwd: workspace.rootDir,
      workspaceId: sessionId,
      timeoutMs: this.config.timeoutMs,
      env: {
        ...process.env,
        // Disable interactive features
        CI: 'true',
        NONINTERACTIVE: '1',
      },
    });
  }

  /**
   * Parse token usage from Claude Code output.
   */
  private parseTokenUsage(output: string): TokenUsage | null {
    try {
      // Try JSON format first
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(line) as ClaudeOutput;
            if (parsed.usage) {
              return {
                inputTokens: parsed.usage.input_tokens,
                outputTokens: parsed.usage.output_tokens,
                totalTokens: parsed.usage.input_tokens + parsed.usage.output_tokens,
                cacheReadTokens: parsed.usage.cache_read_input_tokens ?? 0,
                cacheWriteTokens: parsed.usage.cache_creation_input_tokens ?? 0,
              };
            }
          } catch {
            // Not valid JSON
          }
        }
      }

      // Try text format fallback
      const textMatch = output.match(
        /Total tokens:\s*(\d+)\s*\((\d+)\s*input,\s*(\d+)\s*output\)/i
      );
      if (textMatch) {
        return {
          inputTokens: parseInt(textMatch[2], 10),
          outputTokens: parseInt(textMatch[3], 10),
          totalTokens: parseInt(textMatch[1], 10),
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        };
      }
    } catch {
      // Parsing failed
    }

    return null;
  }

  /**
   * Retry execution after test failures.
   */
  private async retryExecution(
    workspace: WorkspaceInfo,
    firstAttemptResults: AcceptanceResult,
    collector: MetricsCollector,
    sessions: SessionRecord[],
    scenarioStartedAt: string
  ): Promise<ScenarioResult | null> {
    const retrySessionId = createId();
    const retryStartTime = Date.now();
    const retryStartedAt = new Date(retryStartTime).toISOString();

    // Build retry prompt with failure context
    const failedTests = firstAttemptResults.details
      .filter((t) => t.status !== 'pass')
      .map((t) => `- ${t.name}${t.output ? `: ${t.output}` : ''}`)
      .join('\n');

    const retryPrompt = `The following acceptance tests failed:

${failedTests}

Please fix the issues and ensure all tests pass. Review the error messages and make the necessary corrections.`;

    try {
      collector.getTimeline().recordEvent('session_start', {
        sessionId: retrySessionId,
      });

      const result = await this.executeClaudeCode(workspace, retryPrompt, retrySessionId);

      collector.getTimeline().recordEvent('session_complete', {
        sessionId: retrySessionId,
      });

      const usage = this.parseTokenUsage(result.stdout);
      const session = this.buildSession(
        retrySessionId,
        retryPrompt,
        retryStartedAt,
        usage,
        result
      );
      collector.registerSession(session);
      sessions.push(session);

      // Run acceptance tests again
      const retryAcceptanceResults = await this.acceptanceRunner.run(
        workspace.rootDir
      );

      const metrics = collector.aggregateScenarioMetrics(
        sessions,
        firstAttemptResults.passRate
      );

      return this.buildResult(
        'completed',
        scenarioStartedAt,
        new Date(scenarioStartedAt).getTime(),
        sessions,
        metrics,
        retryAcceptanceResults,
        collector,
        [],
        firstAttemptResults.passRate,
        sessions.length // Number of attempts
      );
    } catch (error) {
      // Retry failed, return null to use first attempt results
      return null;
    }
  }
}

/**
 * Create a baseline executor.
 */
export function createBaselineExecutor(
  processManager: ProcessManager,
  acceptanceRunner: AcceptanceRunner,
  config?: BaselineExecutorConfig
): BaselineExecutor {
  return new BaselineExecutor(processManager, acceptanceRunner, config);
}
