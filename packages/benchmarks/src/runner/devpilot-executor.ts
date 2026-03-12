/**
 * DevPilot Executor
 *
 * Executes benchmark using orchestrated parallel sessions (DevPilot scenario).
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import type {
  ScenarioResult,
  SessionRecord,
  ExecutionError,
  WorkspaceInfo,
  WavePlan,
  Wave,
  PlannedTask,
  WaveExecution,
  TokenUsage,
} from '../types';
import { ProcessManager, ProcessResult } from './process-manager';
import { AcceptanceRunner } from './acceptance';
import { MetricsCollector } from '../metrics/collector';
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
    const sessions: SessionRecord[] = [];
    const waveExecutions: WaveExecution[] = [];
    const errors: ExecutionError[] = [];

    try {
      // Read PRD
      const prdPath = join(workspace.path, 'PRD.md');
      const prdContent = await readFile(prdPath, 'utf-8');

      // Generate wave plan
      collector.getTimeline().recordEvent({
        type: 'run_start',
        timestamp: new Date().toISOString(),
      });

      const wavePlan = await this.generateWavePlan(workspace, prdContent, collector);

      // Execute waves
      let firstAttemptPassRate = 0;

      for (const wave of wavePlan.waves) {
        collector.getTimeline().recordEvent({
          type: 'wave_start',
          timestamp: new Date().toISOString(),
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

        collector.getTimeline().recordEvent({
          type: 'wave_complete',
          timestamp: new Date().toISOString(),
          waveNumber: wave.waveNumber,
        });
      }

      // Run acceptance tests
      let acceptanceResults = await this.acceptanceRunner.run(workspace.path);
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
      const metrics = collector.aggregateScenarioMetrics();

      return {
        scenario: 'devpilot',
        benchmarkId: workspace.benchmarkId,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date().toISOString(),
        wallClockMs: Date.now() - startTime,
        sessions,
        totalTokens: metrics.totalTokens,
        totalCostUsd: metrics.totalCost,
        acceptanceResults,
        wavePlan,
        waveExecutions,
        firstAttemptPassRate,
        reworkRatio: this.calculateReworkRatio(sessions, workspace),
        errors,
      };
    } catch (error) {
      const execError: ExecutionError = {
        code: 'EXECUTION_ERROR',
        message: error instanceof Error ? error.message : String(error),
        context: 'devpilot-executor',
        recoverable: false,
      };
      errors.push(execError);

      return {
        scenario: 'devpilot',
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
   * Generate wave plan from PRD.
   */
  private async generateWavePlan(
    workspace: WorkspaceInfo,
    prdContent: string,
    collector: MetricsCollector
  ): Promise<WavePlan> {
    const plannerSessionId = createId();
    collector.registerSession(plannerSessionId, this.config.plannerModel);

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

    collector.getTimeline().recordEvent({
      type: 'session_start',
      timestamp: new Date().toISOString(),
      sessionId: plannerSessionId,
    });

    const result = await this.executeClaudeCode(workspace, planPrompt, plannerSessionId);

    collector.getTimeline().recordEvent({
      type: 'session_complete',
      timestamp: new Date().toISOString(),
      sessionId: plannerSessionId,
    });

    // Parse wave plan from output
    const wavePlan = this.parseWavePlan(result.stdout);

    // Record token usage
    const usage = this.parseTokenUsage(result.stdout);
    if (usage) {
      collector.recordTokenUsage(plannerSessionId, usage);
    }

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
            tasks: w.tasks.map((t: any) => ({
              id: t.id,
              description: t.description,
              files: t.files ?? [],
              dependencies: t.dependencies ?? [],
            })),
            status: 'pending' as const,
          })),
          totalTasks: parsed.totalTasks ?? 0,
          estimatedParallelism: parsed.estimatedParallelism ?? 1,
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
            {
              id: 'full-implementation',
              description: 'Implement entire project',
              files: [],
              dependencies: [],
            },
          ],
          status: 'pending',
        },
      ],
      totalTasks: 1,
      estimatedParallelism: 1,
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
    const taskPromises: Promise<{ task: PlannedTask; session: SessionRecord }>[] = [];

    // Execute tasks in parallel (up to maxConcurrency)
    const concurrencyLimit = Math.min(this.config.maxConcurrency, wave.tasks.length);
    const taskQueue = [...wave.tasks];
    const activeTasks: Promise<any>[] = [];

    while (taskQueue.length > 0 || activeTasks.length > 0) {
      // Fill up to concurrency limit
      while (activeTasks.length < concurrencyLimit && taskQueue.length > 0) {
        const task = taskQueue.shift()!;
        const taskPromise = this.executeTask(workspace, task, prdContent, collector)
          .then((session) => {
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

    return {
      waveNumber: wave.waveNumber,
      startTime: new Date(waveStartTime).toISOString(),
      endTime: new Date().toISOString(),
      durationMs: Date.now() - waveStartTime,
      tasksCompleted: results.length,
      tasksFailed: results.filter((r) => r.session.exitCode !== 0).length,
    };
  }

  /**
   * Execute a single task.
   */
  private async executeTask(
    workspace: WorkspaceInfo,
    task: PlannedTask,
    prdContent: string,
    collector: MetricsCollector
  ): Promise<SessionRecord> {
    const sessionId = createId();
    const startTime = Date.now();

    collector.registerSession(sessionId, this.config.model);

    const taskPrompt = `You are implementing part of a larger project. Focus ONLY on this specific task:

# Task
${task.description}

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

    collector.getTimeline().recordEvent({
      type: 'session_start',
      timestamp: new Date().toISOString(),
      sessionId,
      taskId: task.id,
    });

    const result = await this.executeClaudeCode(workspace, taskPrompt, sessionId);

    collector.getTimeline().recordEvent({
      type: 'session_complete',
      timestamp: new Date().toISOString(),
      sessionId,
      taskId: task.id,
    });

    const usage = this.parseTokenUsage(result.stdout);
    if (usage) {
      collector.recordTokenUsage(sessionId, usage);
    }

    return {
      sessionId,
      model: this.config.model,
      startTime: new Date(startTime).toISOString(),
      endTime: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      tokenUsage: usage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      exitCode: result.exitCode ?? 0,
      output: result.stdout,
      taskId: task.id,
    };
  }

  /**
   * Execute remediation wave for failed tests.
   */
  private async executeRemediationWave(
    workspace: WorkspaceInfo,
    acceptanceResults: ScenarioResult['acceptanceResults'],
    prdContent: string,
    collector: MetricsCollector,
    sessions: SessionRecord[]
  ): Promise<{ waveExecution: WaveExecution; acceptanceResults: ScenarioResult['acceptanceResults'] } | null> {
    const remediationSessionId = createId();
    const startTime = Date.now();

    collector.registerSession(remediationSessionId, this.config.model);

    const failedTests = acceptanceResults.tests
      .filter((t) => !t.passed)
      .map((t) => `- ${t.name}${t.error ? `: ${t.error}` : ''}`)
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
      collector.getTimeline().recordEvent({
        type: 'session_start',
        timestamp: new Date().toISOString(),
        sessionId: remediationSessionId,
      });

      const result = await this.executeClaudeCode(
        workspace,
        remediationPrompt,
        remediationSessionId
      );

      collector.getTimeline().recordEvent({
        type: 'session_complete',
        timestamp: new Date().toISOString(),
        sessionId: remediationSessionId,
      });

      const usage = this.parseTokenUsage(result.stdout);
      if (usage) {
        collector.recordTokenUsage(remediationSessionId, usage);
      }

      sessions.push({
        sessionId: remediationSessionId,
        model: this.config.model,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        tokenUsage: usage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        exitCode: result.exitCode ?? 0,
        output: result.stdout,
        taskId: 'remediation',
      });

      // Run acceptance tests again
      const newAcceptanceResults = await this.acceptanceRunner.run(workspace.path);

      return {
        waveExecution: {
          waveNumber: -1, // Remediation wave
          startTime: new Date(startTime).toISOString(),
          endTime: new Date().toISOString(),
          durationMs: Date.now() - startTime,
          tasksCompleted: 1,
          tasksFailed: 0,
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
      cwd: workspace.path,
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
                cacheCreationInputTokens: parsed.usage.cache_creation_input_tokens,
                cacheReadInputTokens: parsed.usage.cache_read_input_tokens,
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
      const fileMatches = session.output.match(/(?:create|edit|write)\s+['"]([\w\/\-\.]+)['"]/gi);
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
