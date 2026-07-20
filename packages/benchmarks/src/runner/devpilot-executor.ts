/**
 * DevPilot Executor
 *
 * Executes benchmark using orchestrated parallel sessions (DevPilot scenario).
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import type {
  ScenarioResult,
  ScenarioStatus,
  SessionRecord,
  ExecutionError,
  WorkspaceInfo,
  WavePlan,
  Wave,
  PlannedTask,
  WaveExecution,
  TokenUsage,
  ModelTier,
  AcceptanceResult,
} from '../types';
import { ProcessManager, ProcessResult } from './process-manager';
import { AcceptanceRunner } from './acceptance';
import { MetricsCollector, ScenarioMetrics } from '../metrics/collector';
import { createId } from '@paralleldrive/cuid2';

const DEFAULT_TIMEOUT_MS = 600000; // 10 minutes
const DEFAULT_MODEL = 'sonnet';
const PLANNER_MODEL = 'sonnet';

export interface DevPilotExecutorConfig {
  timeoutMs?: number;
  model?: string;
  plannerModel?: string;
  claudeCliPath?: string;
  maxConcurrency?: number;
  retryOnFailure?: boolean;
  verbose?: boolean;
}

/**
 * Executes DevPilot scenario with orchestrated parallel sessions.
 */
export class DevPilotExecutor {
  private processManager: ProcessManager;
  private acceptanceRunner: AcceptanceRunner;
  private config: Required<DevPilotExecutorConfig>;

  constructor(
    processManager: ProcessManager,
    acceptanceRunner: AcceptanceRunner,
    config: DevPilotExecutorConfig = {}
  ) {
    this.processManager = processManager;
    this.acceptanceRunner = acceptanceRunner;
    this.config = {
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      model: config.model ?? DEFAULT_MODEL,
      plannerModel: config.plannerModel ?? PLANNER_MODEL,
      claudeCliPath: config.claudeCliPath ?? 'claude',
      maxConcurrency: config.maxConcurrency ?? 4,
      retryOnFailure: config.retryOnFailure ?? true,
      verbose: config.verbose ?? false,
    };
  }

  /**
   * Execute DevPilot scenario.
   */
  async execute(
    workspace: WorkspaceInfo,
    collector: MetricsCollector
  ): Promise<ScenarioResult> {
    const startTime = Date.now();
    const startedAt = new Date(startTime).toISOString();
    const sessions: SessionRecord[] = [];
    const waveExecutions: WaveExecution[] = [];
    const errors: ExecutionError[] = [];

    try {
      // Read PRD
      const prdPath = join(workspace.rootDir, 'PRD.md');
      const prdContent = await readFile(prdPath, 'utf-8');

      // Generate wave plan
      collector.getTimeline().recordEvent('run_start', {});

      const wavePlan = await this.generateWavePlan(workspace, prdContent, collector);

      // Execute waves
      let firstAttemptPassRate = 0;

      for (const wave of wavePlan.waves) {
        collector.getTimeline().recordEvent('wave_start', {
          waveNumber: wave.waveNumber,
        });

        const waveExecution = await this.executeWave(
          workspace,
          wave,
          prdContent,
          collector,
          sessions
        );
        waveExecutions.push(waveExecution);

        collector.getTimeline().recordEvent('wave_complete', {
          waveNumber: wave.waveNumber,
        });
      }

      // Run acceptance tests
      let acceptanceResults = await this.acceptanceRunner.run(workspace.rootDir);
      firstAttemptPassRate = acceptanceResults.passRate;

      // Retry if tests failed and retry is enabled
      if (acceptanceResults.passRate < 1.0 && this.config.retryOnFailure) {
        const remediationResult = await this.executeRemediationWave(
          workspace,
          acceptanceResults,
          prdContent,
          collector,
          sessions
        );
        if (remediationResult) {
          waveExecutions.push(remediationResult.waveExecution);
          acceptanceResults = remediationResult.acceptanceResults;
        }
      }

      // Calculate metrics
      const metrics = collector.aggregateScenarioMetrics(
        sessions,
        firstAttemptPassRate
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
        firstAttemptPassRate,
        this.calculateReworkRatio(sessions, workspace),
        wavePlan,
        waveExecutions
      );
    } catch (error) {
      errors.push({
        timestamp: new Date().toISOString(),
        phase: 'execution',
        code: 'EXECUTION_ERROR',
        message: error instanceof Error ? error.message : String(error),
        recoverable: false,
      });

      return this.buildFailedResult(
        startedAt,
        startTime,
        sessions,
        collector,
        errors,
        waveExecutions
      );
    }
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
    reworkRatio: number,
    wavePlan?: WavePlan,
    waveExecutionLog?: WaveExecution[]
  ): ScenarioResult {
    return {
      scenario: 'devpilot',
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
      wavePlan,
      waveExecutionLog,
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
    errors: ExecutionError[],
    waveExecutionLog: WaveExecution[]
  ): ScenarioResult {
    return {
      scenario: 'devpilot',
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
      waveExecutionLog,
      reworkRatio: 1.0,
      sessions,
      timeline: collector.exportTimeline(),
      errors,
      filesCreated: [],
      filesModified: [],
    };
  }

  /**
   * Build a canonical session record from execution output.
   */
  private buildSession(
    sessionId: string,
    prompt: string,
    startedAt: string,
    usage: TokenUsage | null,
    result: ProcessResult,
    options: { taskId?: string; waveNumber?: number } = {}
  ): SessionRecord {
    return {
      sessionId,
      scenario: 'devpilot',
      waveNumber: options.waveNumber,
      taskId: options.taskId,
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
   * Generate wave plan from PRD.
   */
  private async generateWavePlan(
    workspace: WorkspaceInfo,
    prdContent: string,
    collector: MetricsCollector
  ): Promise<WavePlan> {
    const plannerSessionId = createId();
    const plannerStartedAt = new Date().toISOString();

    const planPrompt = `Analyze the following PRD and create a wave plan for parallel execution.

# PRD

${prdContent}

# Instructions

Output a JSON wave plan with this structure:
{
  "waves": [
    {
      "waveNumber": 1,
      "tasks": [
        {
          "id": "task-id",
          "description": "what to implement",
          "files": ["src/file.js"],
          "dependencies": []
        }
      ]
    }
  ],
  "totalTasks": <number>,
  "estimatedParallelism": <number>
}

Rules:
1. Group independent tasks into the same wave
2. Tasks in wave N+1 can only depend on tasks from waves <= N
3. Each task should have a clear, specific description
4. Include all files that will be created/modified

Output ONLY valid JSON, no other text.`;

    collector.getTimeline().recordEvent('session_start', {
      sessionId: plannerSessionId,
    });

    const result = await this.executeClaudeCode(workspace, planPrompt, plannerSessionId);

    collector.getTimeline().recordEvent('session_complete', {
      sessionId: plannerSessionId,
    });

    // Parse wave plan from output
    const wavePlan = this.parseWavePlan(result.stdout);

    // Record the planner session (and its token usage) with the collector
    const usage = this.parseTokenUsage(result.stdout);
    const plannerSession: SessionRecord = {
      ...this.buildSession(
        plannerSessionId,
        planPrompt,
        plannerStartedAt,
        usage,
        result,
        { taskId: 'planner' }
      ),
      model: this.config.plannerModel,
    };
    collector.registerSession(plannerSession);

    return wavePlan;
  }

  /**
   * Parse wave plan from Claude output.
   */
  private parseWavePlan(output: string): WavePlan {
    // Try to extract JSON from output
    const jsonMatch = output.match(/\{[\s\S]*"waves"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          waves: parsed.waves.map((w: any, idx: number) => ({
            waveNumber: w.waveNumber ?? idx + 1,
            tasks: w.tasks.map((t: any) => this.toPlannedTask(t)),
            dependsOn: w.dependsOn ?? [],
            estimatedDurationMs: 0,
          })),
          criticalPathMs: 0,
          maxParallelism: parsed.estimatedParallelism ?? 1,
          totalTasks: parsed.totalTasks ?? 0,
        };
      } catch {
        // Parsing failed
      }
    }

    // Return minimal wave plan if parsing fails
    return {
      waves: [
        {
          waveNumber: 1,
          tasks: [
            this.toPlannedTask({
              id: 'full-implementation',
              description: 'Implement entire project',
              files: [],
              dependencies: [],
            }),
          ],
          dependsOn: [],
          estimatedDurationMs: 0,
        },
      ],
      criticalPathMs: 0,
      maxParallelism: 1,
      totalTasks: 1,
    };
  }

  /**
   * Convert a raw parsed task object into a canonical PlannedTask.
   */
  private toPlannedTask(raw: {
    id: string;
    description?: string;
    files?: string[];
    dependencies?: string[];
  }): PlannedTask {
    const description = raw.description ?? raw.id;
    return {
      id: raw.id,
      name: description,
      files: raw.files ?? [],
      prompt: description,
      // Executor is configured with a single model tier for task sessions.
      model: this.config.model as ModelTier,
      dependsOn: raw.dependencies ?? [],
      estimatedDurationMs: 0,
    };
  }

  /**
   * Execute a single wave.
   */
  private async executeWave(
    workspace: WorkspaceInfo,
    wave: Wave,
    prdContent: string,
    collector: MetricsCollector,
    sessions: SessionRecord[]
  ): Promise<WaveExecution> {
    const waveStartTime = Date.now();
    const waveStartedAt = new Date(waveStartTime).toISOString();
    const taskPromises: Promise<{ task: PlannedTask; session: SessionRecord }>[] = [];

    // Execute tasks in parallel (up to maxConcurrency)
    const concurrencyLimit = Math.min(this.config.maxConcurrency, wave.tasks.length) || 1;
    const taskQueue = [...wave.tasks];
    const activeTasks: Promise<unknown>[] = [];

    while (taskQueue.length > 0 || activeTasks.length > 0) {
      // Fill up to concurrency limit
      while (activeTasks.length < concurrencyLimit && taskQueue.length > 0) {
        const task = taskQueue.shift()!;
        const taskPromise = this.executeTask(
          workspace,
          task,
          prdContent,
          collector,
          wave.waveNumber
        ).then((session) => {
          sessions.push(session);
          return { task, session };
        });
        taskPromises.push(taskPromise);
        activeTasks.push(taskPromise);
      }

      // Wait for at least one to complete
      if (activeTasks.length > 0) {
        await Promise.race(activeTasks);
        // Remove completed tasks
        for (let i = activeTasks.length - 1; i >= 0; i--) {
          const status = await Promise.race([
            activeTasks[i].then(() => 'resolved'),
            Promise.resolve('pending'),
          ]);
          if (status === 'resolved') {
            activeTasks.splice(i, 1);
          }
        }
      }
    }

    // Wait for all tasks to complete
    const results = await Promise.all(taskPromises);

    const completedTasks = results.filter((r) => r.session.success).length;

    return {
      waveNumber: wave.waveNumber,
      plannedTasks: wave.tasks.length,
      completedTasks,
      failedTasks: results.length - completedTasks,
      startedAt: waveStartedAt,
      completedAt: new Date().toISOString(),
      wallClockMs: Date.now() - waveStartTime,
      sessions: results.map((r) => r.session),
      parallelismActual: concurrencyLimit,
      idleTimeMs: 0,
    };
  }

  /**
   * Execute a single task.
   */
  private async executeTask(
    workspace: WorkspaceInfo,
    task: PlannedTask,
    prdContent: string,
    collector: MetricsCollector,
    waveNumber: number
  ): Promise<SessionRecord> {
    const sessionId = createId();
    const startedAt = new Date().toISOString();

    const taskPrompt = `You are implementing part of a larger project. Focus ONLY on this specific task:

# Task
${task.name}

# Files to create/modify
${task.files.join('\n') || 'Determine based on task'}

# Full PRD (for context only - do NOT implement everything)
${prdContent}

# Instructions
1. Focus ONLY on the task described above
2. Create/modify only the files needed for this task
3. Ensure your implementation integrates with other parts of the project
4. Do not duplicate functionality that other tasks will handle

Implement this task now.`;

    collector.getTimeline().recordEvent('session_start', {
      sessionId,
      taskId: task.id,
    });

    const result = await this.executeClaudeCode(workspace, taskPrompt, sessionId);

    collector.getTimeline().recordEvent('session_complete', {
      sessionId,
      taskId: task.id,
    });

    const usage = this.parseTokenUsage(result.stdout);
    const session = this.buildSession(sessionId, taskPrompt, startedAt, usage, result, {
      taskId: task.id,
      waveNumber,
    });
    collector.registerSession(session);
    return session;
  }

  /**
   * Execute remediation wave for failed tests.
   */
  private async executeRemediationWave(
    workspace: WorkspaceInfo,
    acceptanceResults: AcceptanceResult,
    prdContent: string,
    collector: MetricsCollector,
    sessions: SessionRecord[]
  ): Promise<{ waveExecution: WaveExecution; acceptanceResults: AcceptanceResult } | null> {
    const remediationSessionId = createId();
    const startTime = Date.now();
    const startedAt = new Date(startTime).toISOString();

    const failedTests = acceptanceResults.details
      .filter((t) => t.status !== 'pass')
      .map((t) => `- ${t.name}${t.output ? `: ${t.output}` : ''}`)
      .join('\n');

    const remediationPrompt = `Some acceptance tests failed. Fix the issues:

# Failed Tests
${failedTests}

# PRD (for reference)
${prdContent}

# Instructions
1. Analyze the failures and identify root causes
2. Fix the issues in the relevant files
3. Ensure all tests will pass after your fixes

Fix the issues now.`;

    try {
      collector.getTimeline().recordEvent('session_start', {
        sessionId: remediationSessionId,
      });

      const result = await this.executeClaudeCode(
        workspace,
        remediationPrompt,
        remediationSessionId
      );

      collector.getTimeline().recordEvent('session_complete', {
        sessionId: remediationSessionId,
      });

      const usage = this.parseTokenUsage(result.stdout);
      const session = this.buildSession(
        remediationSessionId,
        remediationPrompt,
        startedAt,
        usage,
        result,
        { taskId: 'remediation' }
      );
      collector.registerSession(session);
      sessions.push(session);

      // Run acceptance tests again
      const newAcceptanceResults = await this.acceptanceRunner.run(workspace.rootDir);

      return {
        waveExecution: {
          waveNumber: -1, // Remediation wave
          plannedTasks: 1,
          completedTasks: session.success ? 1 : 0,
          failedTasks: session.success ? 0 : 1,
          startedAt,
          completedAt: new Date().toISOString(),
          wallClockMs: Date.now() - startTime,
          sessions: [session],
          parallelismActual: 1,
          idleTimeMs: 0,
        },
        acceptanceResults: newAcceptanceResults,
      };
    } catch {
      return null;
    }
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
        CI: 'true',
        NONINTERACTIVE: '1',
      },
    });
  }

  /**
   * Parse token usage from output.
   */
  private parseTokenUsage(output: string): TokenUsage | null {
    try {
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(line);
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
    } catch {
      // Parsing failed
    }
    return null;
  }

  /**
   * Calculate rework ratio.
   */
  private calculateReworkRatio(sessions: SessionRecord[], workspace: WorkspaceInfo): number {
    // Count files edited multiple times
    const fileEditCounts = new Map<string, number>();

    for (const session of sessions) {
      // Parse file operations from session output (simplified)
      const fileMatches = (session.stdout ?? '').match(
        /(?:create|edit|write)\s+['"]([\w\/\-\.]+)['"]/gi
      );
      if (fileMatches) {
        for (const match of fileMatches) {
          const file = match.replace(/^(create|edit|write)\s+['"]/i, '').replace(/['"]$/, '');
          fileEditCounts.set(file, (fileEditCounts.get(file) ?? 0) + 1);
        }
      }
    }

    if (fileEditCounts.size === 0) return 1.0;

    const totalEdits = Array.from(fileEditCounts.values()).reduce((a, b) => a + b, 0);
    return totalEdits / fileEditCounts.size;
  }
}

/**
 * Create a DevPilot executor.
 */
export function createDevPilotExecutor(
  processManager: ProcessManager,
  acceptanceRunner: AcceptanceRunner,
  config?: DevPilotExecutorConfig
): DevPilotExecutor {
  return new DevPilotExecutor(processManager, acceptanceRunner, config);
}
