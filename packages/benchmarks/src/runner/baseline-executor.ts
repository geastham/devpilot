/**
 * Baseline Executor
 *
 * Executes benchmark using a single Claude Code session (baseline scenario).
 */

import { readFile, readdir, stat } from 'fs/promises';
import { join } from 'path';
import type {
  ScenarioResult,
  SessionRecord,
  ExecutionError,
  WorkspaceInfo,
  TokenUsage,
} from '../types';
import { ProcessManager, StreamingProcess, ProcessResult } from './process-manager';
import { AcceptanceRunner } from './acceptance';
import { MetricsCollector } from '../metrics/collector';
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
    const sessionId = createId();
    const sessions: SessionRecord[] = [];
    const errors: ExecutionError[] = [];

    collector.registerSession(sessionId, this.config.model);

    try {
      // Read PRD
      const prdPath = join(workspace.path, 'PRD.md');
      const prdContent = await readFile(prdPath, 'utf-8');

      // Build prompt
      const prompt = this.buildPrompt(prdContent);

      // Execute Claude Code
      collector.getTimeline().recordEvent({
        type: 'session_start',
        timestamp: new Date().toISOString(),
        sessionId,
      });

      const result = await this.executeClaudeCode(workspace, prompt, sessionId);

      collector.getTimeline().recordEvent({
        type: 'session_complete',
        timestamp: new Date().toISOString(),
        sessionId,
      });

      // Parse output and record tokens
      const usage = this.parseTokenUsage(result.stdout);
      if (usage) {
        collector.recordTokenUsage(sessionId, usage);
      }

      // Record session
      sessions.push({
        sessionId,
        model: this.config.model,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        tokenUsage: usage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        exitCode: result.exitCode ?? 0,
        output: result.stdout,
      });

      // Run acceptance tests
      const acceptanceResults = await this.acceptanceRunner.run(workspace.path);

      // Retry if tests failed and retry is enabled
      if (acceptanceResults.passRate < 1.0 && this.config.retryOnFailure) {
        const retryResult = await this.retryExecution(
          workspace,
          acceptanceResults,
          collector,
          sessions
        );
        if (retryResult) {
          return retryResult;
        }
      }

      // Calculate metrics
      const metrics = collector.aggregateScenarioMetrics();

      return {
        scenario: 'baseline',
        benchmarkId: workspace.benchmarkId,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date().toISOString(),
        wallClockMs: Date.now() - startTime,
        sessions,
        totalTokens: metrics.totalTokens,
        totalCostUsd: metrics.totalCost,
        acceptanceResults,
        firstAttemptPassRate: acceptanceResults.passRate,
        reworkRatio: 1.0, // Single session, no rework
        errors,
      };
    } catch (error) {
      const execError: ExecutionError = {
        code: 'EXECUTION_ERROR',
        message: error instanceof Error ? error.message : String(error),
        context: 'baseline-executor',
        recoverable: false,
      };
      errors.push(execError);

      return {
        scenario: 'baseline',
        benchmarkId: workspace.benchmarkId,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date().toISOString(),
        wallClockMs: Date.now() - startTime,
        sessions,
        totalTokens: 0,
        totalCostUsd: 0,
        acceptanceResults: {
          tests: [],
          passed: 0,
          failed: 0,
          total: 0,
          passRate: 0,
          output: '',
          durationMs: 0,
        },
        firstAttemptPassRate: 0,
        reworkRatio: 1.0,
        errors,
      };
    }
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
      cwd: workspace.path,
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
                cacheCreationInputTokens: parsed.usage.cache_creation_input_tokens,
                cacheReadInputTokens: parsed.usage.cache_read_input_tokens,
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
    firstAttemptResults: ScenarioResult['acceptanceResults'],
    collector: MetricsCollector,
    sessions: SessionRecord[]
  ): Promise<ScenarioResult | null> {
    const retrySessionId = createId();
    const retryStartTime = Date.now();

    collector.registerSession(retrySessionId, this.config.model);

    // Build retry prompt with failure context
    const failedTests = firstAttemptResults.tests
      .filter((t) => !t.passed)
      .map((t) => `- ${t.name}${t.error ? `: ${t.error}` : ''}`)
      .join('\n');

    const retryPrompt = `The following acceptance tests failed:

${failedTests}

Please fix the issues and ensure all tests pass. Review the error messages and make the necessary corrections.`;

    try {
      collector.getTimeline().recordEvent({
        type: 'session_start',
        timestamp: new Date().toISOString(),
        sessionId: retrySessionId,
      });

      const result = await this.executeClaudeCode(workspace, retryPrompt, retrySessionId);

      collector.getTimeline().recordEvent({
        type: 'session_complete',
        timestamp: new Date().toISOString(),
        sessionId: retrySessionId,
      });

      const usage = this.parseTokenUsage(result.stdout);
      if (usage) {
        collector.recordTokenUsage(retrySessionId, usage);
      }

      sessions.push({
        sessionId: retrySessionId,
        model: this.config.model,
        startTime: new Date(retryStartTime).toISOString(),
        endTime: new Date().toISOString(),
        durationMs: Date.now() - retryStartTime,
        tokenUsage: usage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        exitCode: result.exitCode ?? 0,
        output: result.stdout,
      });

      // Run acceptance tests again
      const retryAcceptanceResults = await this.acceptanceRunner.run(workspace.path);

      const metrics = collector.aggregateScenarioMetrics();
      const totalWallClockMs = sessions.reduce((sum, s) => sum + s.durationMs, 0);

      return {
        scenario: 'baseline',
        benchmarkId: workspace.benchmarkId,
        startTime: sessions[0].startTime,
        endTime: new Date().toISOString(),
        wallClockMs: totalWallClockMs,
        sessions,
        totalTokens: metrics.totalTokens,
        totalCostUsd: metrics.totalCost,
        acceptanceResults: retryAcceptanceResults,
        firstAttemptPassRate: firstAttemptResults.passRate,
        reworkRatio: sessions.length, // Number of attempts
        errors: [],
      };
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
