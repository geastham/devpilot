/**
 * ao CLI Adapter
 *
 * Implements IOrchestratorAdapter using the ao (agent-orchestrator) CLI.
 * Executes ao spawn, ao status, ao send, and ao stop commands.
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import type {
  IOrchestratorAdapter,
  OrchestratorAdapterConfig,
  JobStatus,
  SendMessageResult,
  OrchestratorMode,
} from './adapter';
import type {
  DispatchRequest,
  DispatchResponse,
  OrchestratorHealth,
  CompletionReport,
} from './types';

const execAsync = promisify(exec);

/**
 * Parse session ID from ao spawn output
 * Expected format: "Session started: <session-id>"
 */
function parseSessionId(output: string): string | null {
  const match = output.match(/Session started:\s*(\S+)/i);
  if (match) return match[1];

  // Alternative format: just a UUID-like string on its own line
  const uuidMatch = output.match(/^([a-f0-9-]{36})$/im);
  if (uuidMatch) return uuidMatch[1];

  // Try to find any session-like ID
  const sessionMatch = output.match(/session[:\s]+([a-zA-Z0-9_-]+)/i);
  if (sessionMatch) return sessionMatch[1];

  return null;
}

/**
 * Parse status from ao status output
 * Expected JSON or structured text output
 */
function parseStatusOutput(output: string): Partial<JobStatus> {
  // Try JSON parse first
  try {
    const json = JSON.parse(output);
    return {
      status: mapAoStatus(json.status || json.state),
      progressPercent: json.progress ?? json.progressPercent ?? 0,
      currentStep: json.currentStep ?? json.step,
      currentFile: json.currentFile ?? json.file,
      message: json.message,
      filesModified: json.filesModified ?? json.files,
      tokensUsed: json.tokensUsed ?? json.tokens,
      costUsd: json.costUsd ?? json.cost,
    };
  } catch {
    // Parse text output
    const status: Partial<JobStatus> = {};

    // Parse status
    const statusMatch = output.match(/status:\s*(\w+)/i);
    if (statusMatch) {
      status.status = mapAoStatus(statusMatch[1]);
    }

    // Parse progress
    const progressMatch = output.match(/progress:\s*(\d+)/i);
    if (progressMatch) {
      status.progressPercent = parseInt(progressMatch[1], 10);
    }

    // Parse current step
    const stepMatch = output.match(/(?:step|task|working on):\s*(.+)/i);
    if (stepMatch) {
      status.currentStep = stepMatch[1].trim();
    }

    // Parse current file
    const fileMatch = output.match(/(?:file|editing):\s*(.+)/i);
    if (fileMatch) {
      status.currentFile = fileMatch[1].trim();
    }

    // Parse message
    const messageMatch = output.match(/message:\s*(.+)/i);
    if (messageMatch) {
      status.message = messageMatch[1].trim();
    }

    return status;
  }
}

/**
 * Map ao status strings to our status enum
 */
function mapAoStatus(aoStatus: string): JobStatus['status'] {
  const normalized = aoStatus?.toLowerCase() ?? '';
  if (normalized.includes('queue') || normalized.includes('pending')) return 'queued';
  if (normalized.includes('run') || normalized.includes('active') || normalized.includes('working')) return 'running';
  if (normalized.includes('wait') || normalized.includes('pause')) return 'waiting';
  if (normalized.includes('complete') || normalized.includes('done') || normalized.includes('finished')) return 'complete';
  if (normalized.includes('error') || normalized.includes('fail')) return 'error';
  if (normalized.includes('cancel') || normalized.includes('stop')) return 'cancelled';
  return 'running'; // Default to running for unknown statuses
}

/**
 * ao CLI adapter implementation
 */
export class AoCliAdapter implements IOrchestratorAdapter {
  readonly mode: OrchestratorMode = 'ao-cli';
  private config: OrchestratorAdapterConfig;
  private aoPath: string;
  private projectName: string;
  private workingDirectory?: string;

  constructor(config: OrchestratorAdapterConfig) {
    this.config = config;
    this.aoPath = config.aoPath || 'ao';
    this.projectName = config.aoProjectName || 'default';
    this.workingDirectory = config.workingDirectory;
  }

  /**
   * Execute an ao command and return stdout
   */
  private async execAo(args: string[], options?: { cwd?: string }): Promise<{ stdout: string; stderr: string }> {
    const cmd = `${this.aoPath} ${args.join(' ')}`;
    const cwd = options?.cwd || this.workingDirectory || process.cwd();

    try {
      const { stdout, stderr } = await execAsync(cmd, {
        cwd,
        timeout: 60000, // 1 minute timeout for most commands
        env: {
          ...process.env,
          // Pass through any ao-specific env vars
        },
      });
      return { stdout: stdout.trim(), stderr: stderr.trim() };
    } catch (error: unknown) {
      const execError = error as { stdout?: string; stderr?: string; message: string };
      // exec throws on non-zero exit, but we might still have useful output
      if (execError.stdout || execError.stderr) {
        return {
          stdout: execError.stdout?.trim() || '',
          stderr: execError.stderr?.trim() || execError.message,
        };
      }
      throw error;
    }
  }

  /**
   * Check if ao CLI is available and working
   */
  async healthCheck(): Promise<OrchestratorHealth> {
    try {
      // Check ao version to verify it's installed
      const { stdout } = await this.execAo(['--version']);

      // Try to get any running sessions count
      let activeJobs = 0;
      try {
        const { stdout: listOutput } = await this.execAo(['list']);
        // Count active sessions from list output
        const lines = listOutput.split('\n').filter(l => l.trim());
        activeJobs = lines.length > 1 ? lines.length - 1 : 0; // Subtract header line
      } catch {
        // list might not be available, that's ok
      }

      return {
        status: 'healthy',
        version: stdout || 'unknown',
        activeJobs,
        queueLength: 0, // ao-cli doesn't have a queue concept
        availableWorkers: 1, // Local execution
      };
    } catch (error) {
      return {
        status: 'down',
        version: 'unknown',
        activeJobs: 0,
        queueLength: 0,
        availableWorkers: 0,
      };
    }
  }

  /**
   * Dispatch a task using ao spawn
   * Command: ao spawn <project> <ticket-id> "<prompt>"
   */
  async dispatch(request: DispatchRequest): Promise<DispatchResponse> {
    try {
      // Build the spawn command
      const ticketId = request.linearTicketId || request.sessionId;
      const prompt = request.taskSpec.prompt;

      // ao spawn <project> <ticket-id> "<prompt>"
      const args = [
        'spawn',
        this.projectName,
        ticketId,
        `"${prompt.replace(/"/g, '\\"')}"`,
      ];

      // Add optional flags
      if (request.taskSpec.model) {
        args.push('--model', request.taskSpec.model);
      }

      if (request.repo) {
        args.push('--repo', request.repo);
      }

      // Execute spawn command
      const { stdout, stderr } = await this.execAo(args);

      // Parse session ID from output
      const externalJobId = parseSessionId(stdout);

      if (!externalJobId && stderr) {
        return {
          accepted: false,
          error: `ao spawn failed: ${stderr}`,
        };
      }

      return {
        accepted: true,
        orchestratorJobId: externalJobId || ticketId,
        estimatedStartTime: new Date().toISOString(),
        queuePosition: 0,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        accepted: false,
        error: `Failed to dispatch via ao CLI: ${errorMessage}`,
      };
    }
  }

  /**
   * Get job status using ao status <session>
   */
  async getJobStatus(externalJobId: string): Promise<JobStatus> {
    try {
      const { stdout, stderr } = await this.execAo(['status', externalJobId]);

      if (!stdout && stderr) {
        // Session might not exist or has error
        if (stderr.toLowerCase().includes('not found')) {
          return {
            sessionId: externalJobId,
            externalJobId,
            status: 'error',
            progressPercent: 0,
            message: 'Session not found',
          };
        }
      }

      const parsed = parseStatusOutput(stdout || stderr);

      return {
        sessionId: externalJobId,
        externalJobId,
        status: parsed.status || 'running',
        progressPercent: parsed.progressPercent || 0,
        currentStep: parsed.currentStep,
        currentFile: parsed.currentFile,
        message: parsed.message,
        filesModified: parsed.filesModified,
        tokensUsed: parsed.tokensUsed,
        costUsd: parsed.costUsd,
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        sessionId: externalJobId,
        externalJobId,
        status: 'error',
        progressPercent: 0,
        message: `Failed to get status: ${errorMessage}`,
      };
    }
  }

  /**
   * Cancel a job using ao stop <session>
   */
  async cancel(externalJobId: string): Promise<{ success: boolean; message: string }> {
    try {
      const { stdout, stderr } = await this.execAo(['stop', externalJobId]);

      if (stderr && stderr.toLowerCase().includes('error')) {
        return {
          success: false,
          message: stderr,
        };
      }

      return {
        success: true,
        message: stdout || `Session ${externalJobId} stopped`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to cancel: ${errorMessage}`,
      };
    }
  }

  /**
   * Send a message to an active session using ao send <session> "<message>"
   */
  async sendMessage(externalJobId: string, message: string): Promise<SendMessageResult> {
    try {
      const { stdout, stderr } = await this.execAo([
        'send',
        externalJobId,
        `"${message.replace(/"/g, '\\"')}"`,
      ]);

      if (stderr && stderr.toLowerCase().includes('error')) {
        return {
          success: false,
          error: stderr,
        };
      }

      return {
        success: true,
        message: stdout || 'Message sent',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to send message: ${errorMessage}`,
      };
    }
  }

  /**
   * Get completion report for a finished job
   * Uses ao status with detailed output
   */
  async getCompletionReport(externalJobId: string): Promise<CompletionReport | null> {
    try {
      // Try to get detailed status/report
      const { stdout } = await this.execAo(['status', externalJobId, '--json']);

      try {
        const json = JSON.parse(stdout);

        if (json.status !== 'complete' && json.status !== 'done' && json.status !== 'finished') {
          return null; // Not complete yet
        }

        return {
          sessionId: externalJobId,
          success: !json.error,
          prUrl: json.prUrl || json.pr_url,
          commitSha: json.commitSha || json.commit,
          filesModified: json.filesModified || [],
          filesCreated: json.filesCreated || [],
          filesDeleted: json.filesDeleted || [],
          summary: json.summary || json.message || 'Task completed',
          tokensUsed: json.tokensUsed || 0,
          costUsd: json.costUsd || 0,
          durationMinutes: json.durationMinutes || 0,
          error: json.error ? {
            code: json.error.code || 'UNKNOWN',
            message: json.error.message || String(json.error),
            recoverable: json.error.recoverable || false,
          } : undefined,
        };
      } catch {
        // Non-JSON output, parse as text
        const status = parseStatusOutput(stdout);

        if (status.status !== 'complete') {
          return null;
        }

        return {
          sessionId: externalJobId,
          success: true,
          filesModified: status.filesModified || [],
          filesCreated: [],
          filesDeleted: [],
          summary: status.message || 'Task completed',
          tokensUsed: status.tokensUsed || 0,
          costUsd: status.costUsd || 0,
          durationMinutes: 0,
        };
      }
    } catch {
      return null;
    }
  }

  /**
   * Cleanup - no persistent resources for CLI adapter
   */
  async shutdown(): Promise<void> {
    // No cleanup needed for CLI adapter
  }
}

/**
 * Create an ao CLI adapter instance
 */
export function createAoCliAdapter(config: OrchestratorAdapterConfig): AoCliAdapter {
  return new AoCliAdapter(config);
}
