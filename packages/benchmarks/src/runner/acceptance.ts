/**
 * Acceptance Runner
 *
 * Executes acceptance test scripts and parses results.
 */

import { join } from 'path';
import { stat, readFile, readdir } from 'fs/promises';
import type { AcceptanceResult, AcceptanceTest } from '../types';
import { ProcessManager, ProcessResult } from './process-manager';

const DEFAULT_TIMEOUT_MS = 120000; // 2 minutes

export interface AcceptanceRunnerConfig {
  timeoutMs?: number;
  serverStartupDelayMs?: number;
}

/**
 * Runs acceptance tests for benchmark validation.
 */
export class AcceptanceRunner {
  private processManager: ProcessManager;
  private config: AcceptanceRunnerConfig;

  constructor(processManager: ProcessManager, config: AcceptanceRunnerConfig = {}) {
    this.processManager = processManager;
    this.config = {
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      serverStartupDelayMs: config.serverStartupDelayMs ?? 2000,
    };
  }

  /**
   * Run acceptance tests in a workspace.
   */
  async run(workspacePath: string): Promise<AcceptanceResult> {
    const startTime = Date.now();

    // Find acceptance test script
    const testScript = await this.findTestScript(workspacePath);
    if (!testScript) {
      return this.createEmptyResult('No acceptance tests found');
    }

    // Check if we need to start a server
    const needsServer = await this.needsServer(workspacePath, testScript);
    let serverProcess: ReturnType<typeof this.processManager.spawnStreaming> | null = null;

    try {
      // Start server if needed
      if (needsServer) {
        serverProcess = await this.startServer(workspacePath);
        // Wait for server to start
        await this.delay(this.config.serverStartupDelayMs!);
      }

      // Run test script
      const result = await this.runTestScript(workspacePath, testScript);

      // Parse results
      const tests = this.parseTestOutput(result.stdout + '\n' + result.stderr);
      const passed = tests.filter((t) => t.passed).length;
      const failed = tests.filter((t) => !t.passed).length;

      return {
        tests,
        passed,
        failed,
        total: tests.length,
        passRate: tests.length > 0 ? passed / tests.length : 0,
        output: result.stdout,
        durationMs: Date.now() - startTime,
      };
    } finally {
      // Stop server if we started one
      if (serverProcess) {
        await serverProcess.kill();
      }
    }
  }

  /**
   * Find the acceptance test script.
   */
  private async findTestScript(workspacePath: string): Promise<string | null> {
    const candidates = [
      'acceptance/run-tests.sh',
      'acceptance/acceptance.sh',
      'tests/acceptance.sh',
      'test.sh',
      'acceptance.sh',
    ];

    for (const candidate of candidates) {
      const fullPath = join(workspacePath, candidate);
      try {
        const s = await stat(fullPath);
        if (s.isFile()) return fullPath;
      } catch {
        // Not found
      }
    }

    return null;
  }

  /**
   * Check if the workspace needs a server running for tests.
   */
  private async needsServer(workspacePath: string, testScript: string): Promise<boolean> {
    try {
      const content = await readFile(testScript, 'utf-8');
      // Check for common server indicators
      return (
        content.includes('localhost:') ||
        content.includes('curl ') ||
        content.includes('http://') ||
        content.includes('BASE_URL')
      );
    } catch {
      return false;
    }
  }

  /**
   * Start a development server.
   */
  private async startServer(
    workspacePath: string
  ): Promise<ReturnType<typeof this.processManager.spawnStreaming>> {
    // Try different server start methods
    const serverCommands = [
      { cmd: 'node', args: ['src/api/server.js'] },
      { cmd: 'node', args: ['src/app.js'] },
      { cmd: 'npm', args: ['run', 'start'] },
      { cmd: 'npm', args: ['run', 'serve'] },
    ];

    for (const { cmd, args } of serverCommands) {
      try {
        // Check if the target file exists for node commands
        if (cmd === 'node') {
          await stat(join(workspacePath, args[0]));
        }

        const process = this.processManager.spawnStreaming(cmd, args, {
          cwd: workspacePath,
          workspaceId: workspacePath,
          timeoutMs: this.config.timeoutMs,
        });

        return process;
      } catch {
        // Try next option
      }
    }

    throw new Error('Could not find server start command');
  }

  /**
   * Run the test script.
   */
  private async runTestScript(
    workspacePath: string,
    testScript: string
  ): Promise<ProcessResult> {
    // Make sure script is executable
    await this.processManager.spawn('chmod', ['+x', testScript]);

    return this.processManager.spawn('bash', [testScript], {
      cwd: workspacePath,
      workspaceId: workspacePath,
      timeoutMs: this.config.timeoutMs,
    });
  }

  /**
   * Parse test output to extract individual test results.
   */
  private parseTestOutput(output: string): AcceptanceTest[] {
    const tests: AcceptanceTest[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      // Match common test output patterns
      const passMatch = line.match(/^\s*(PASS|✓|✔|passed?):\s*(.+)/i);
      const failMatch = line.match(/^\s*(FAIL|✗|✘|failed?):\s*(.+)/i);

      if (passMatch) {
        tests.push({
          name: passMatch[2].trim(),
          passed: true,
        });
      } else if (failMatch) {
        tests.push({
          name: failMatch[2].trim(),
          passed: false,
          error: this.findErrorContext(lines, lines.indexOf(line)),
        });
      }
    }

    // If no structured output found, try to parse summary line
    if (tests.length === 0) {
      const summaryMatch = output.match(
        /Results?:\s*(\d+)\s*passed?,\s*(\d+)\s*failed?/i
      );
      if (summaryMatch) {
        const passed = parseInt(summaryMatch[1], 10);
        const failed = parseInt(summaryMatch[2], 10);

        for (let i = 0; i < passed; i++) {
          tests.push({ name: `Test ${i + 1}`, passed: true });
        }
        for (let i = 0; i < failed; i++) {
          tests.push({ name: `Test ${passed + i + 1}`, passed: false });
        }
      }
    }

    return tests;
  }

  /**
   * Find error context for a failed test.
   */
  private findErrorContext(lines: string[], failIndex: number): string | undefined {
    // Look for error details in following lines
    const contextLines: string[] = [];
    for (let i = failIndex + 1; i < Math.min(failIndex + 5, lines.length); i++) {
      const line = lines[i].trim();
      if (!line) continue;
      if (line.match(/^(PASS|FAIL|✓|✗)/i)) break;
      contextLines.push(line);
    }
    return contextLines.length > 0 ? contextLines.join('\n') : undefined;
  }

  /**
   * Create an empty result for when no tests are found.
   */
  private createEmptyResult(reason: string): AcceptanceResult {
    return {
      tests: [],
      passed: 0,
      failed: 0,
      total: 0,
      passRate: 0,
      output: reason,
      durationMs: 0,
    };
  }

  /**
   * Delay helper.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create an acceptance runner.
 */
export function createAcceptanceRunner(
  processManager: ProcessManager,
  config?: AcceptanceRunnerConfig
): AcceptanceRunner {
  return new AcceptanceRunner(processManager, config);
}

/**
 * Quick helper to run acceptance tests.
 */
export async function runAcceptanceTests(
  workspacePath: string,
  processManager: ProcessManager,
  config?: AcceptanceRunnerConfig
): Promise<AcceptanceResult> {
  const runner = new AcceptanceRunner(processManager, config);
  return runner.run(workspacePath);
}
