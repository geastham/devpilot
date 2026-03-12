/**
 * Process Manager
 *
 * Subprocess lifecycle management for benchmark execution.
 */

import { spawn, ChildProcess, SpawnOptions } from 'child_process';
import type { ExecutionError } from '../types';

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
}

export interface StreamingProcess {
  process: ChildProcess;
  stdout: string[];
  stderr: string[];
  promise: Promise<ProcessResult>;
  kill: () => Promise<void>;
}

interface ProcessEntry {
  process: ChildProcess;
  workspaceId: string;
  startTime: number;
}

/**
 * Manages subprocess lifecycle for benchmark execution.
 */
export class ProcessManager {
  private registry: Map<number, ProcessEntry> = new Map();
  private defaultTimeoutMs: number;

  constructor(defaultTimeoutMs: number = 120000) {
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  /**
   * Spawn a process and wait for completion.
   */
  async spawn(
    command: string,
    args: string[],
    options: SpawnOptions & {
      workspaceId?: string;
      timeoutMs?: number;
    } = {}
  ): Promise<ProcessResult> {
    const { workspaceId = 'default', timeoutMs = this.defaultTimeoutMs, ...spawnOptions } = options;
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        ...spawnOptions,
      });

      if (proc.pid) {
        this.registry.set(proc.pid, { process: proc, workspaceId, startTime });
      }

      let stdout = '';
      let stderr = '';
      let timeoutId: NodeJS.Timeout | null = null;

      if (timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          proc.kill('SIGTERM');
          setTimeout(() => {
            if (!proc.killed) {
              proc.kill('SIGKILL');
            }
          }, 5000);
        }, timeoutMs);
      }

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (exitCode, signal) => {
        if (timeoutId) clearTimeout(timeoutId);
        if (proc.pid) this.registry.delete(proc.pid);

        resolve({
          stdout,
          stderr,
          exitCode,
          signal,
          durationMs: Date.now() - startTime,
        });
      });

      proc.on('error', (error) => {
        if (timeoutId) clearTimeout(timeoutId);
        if (proc.pid) this.registry.delete(proc.pid);
        reject(error);
      });
    });
  }

  /**
   * Spawn a process with streaming output capture.
   */
  spawnStreaming(
    command: string,
    args: string[],
    options: SpawnOptions & {
      workspaceId?: string;
      timeoutMs?: number;
      onStdout?: (data: string) => void;
      onStderr?: (data: string) => void;
    } = {}
  ): StreamingProcess {
    const {
      workspaceId = 'default',
      timeoutMs = this.defaultTimeoutMs,
      onStdout,
      onStderr,
      ...spawnOptions
    } = options;
    const startTime = Date.now();

    const stdout: string[] = [];
    const stderr: string[] = [];

    const proc = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      ...spawnOptions,
    });

    if (proc.pid) {
      this.registry.set(proc.pid, { process: proc, workspaceId, startTime });
    }

    let timeoutId: NodeJS.Timeout | null = null;

    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        proc.kill('SIGTERM');
        setTimeout(() => {
          if (!proc.killed) {
            proc.kill('SIGKILL');
          }
        }, 5000);
      }, timeoutMs);
    }

    proc.stdout?.on('data', (data) => {
      const text = data.toString();
      stdout.push(text);
      onStdout?.(text);
    });

    proc.stderr?.on('data', (data) => {
      const text = data.toString();
      stderr.push(text);
      onStderr?.(text);
    });

    const promise = new Promise<ProcessResult>((resolve, reject) => {
      proc.on('close', (exitCode, signal) => {
        if (timeoutId) clearTimeout(timeoutId);
        if (proc.pid) this.registry.delete(proc.pid);

        resolve({
          stdout: stdout.join(''),
          stderr: stderr.join(''),
          exitCode,
          signal,
          durationMs: Date.now() - startTime,
        });
      });

      proc.on('error', (error) => {
        if (timeoutId) clearTimeout(timeoutId);
        if (proc.pid) this.registry.delete(proc.pid);
        reject(error);
      });
    });

    const kill = async (): Promise<void> => {
      if (proc.killed) return;

      proc.kill('SIGTERM');

      await new Promise<void>((resolve) => {
        const checkInterval = setInterval(() => {
          if (proc.killed) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);

        setTimeout(() => {
          clearInterval(checkInterval);
          if (!proc.killed) {
            proc.kill('SIGKILL');
          }
          resolve();
        }, 5000);
      });

      if (proc.pid) this.registry.delete(proc.pid);
    };

    return {
      process: proc,
      stdout,
      stderr,
      promise,
      kill,
    };
  }

  /**
   * Kill all processes registered for a workspace.
   */
  async killWorkspace(workspaceId: string): Promise<number> {
    let killed = 0;

    for (const [pid, entry] of this.registry) {
      if (entry.workspaceId === workspaceId) {
        try {
          entry.process.kill('SIGTERM');

          await new Promise<void>((resolve) => {
            setTimeout(() => {
              if (!entry.process.killed) {
                entry.process.kill('SIGKILL');
              }
              resolve();
            }, 5000);
          });

          this.registry.delete(pid);
          killed++;
        } catch {
          // Process may already be dead
          this.registry.delete(pid);
        }
      }
    }

    return killed;
  }

  /**
   * Kill all registered processes.
   */
  async killAll(): Promise<number> {
    let killed = 0;

    for (const [pid, entry] of this.registry) {
      try {
        entry.process.kill('SIGTERM');

        await new Promise<void>((resolve) => {
          setTimeout(() => {
            if (!entry.process.killed) {
              entry.process.kill('SIGKILL');
            }
            resolve();
          }, 5000);
        });

        killed++;
      } catch {
        // Process may already be dead
      }
    }

    this.registry.clear();
    return killed;
  }

  /**
   * Get count of active processes.
   */
  getActiveCount(): number {
    return this.registry.size;
  }

  /**
   * Get active processes for a workspace.
   */
  getWorkspaceProcesses(workspaceId: string): number[] {
    const pids: number[] = [];
    for (const [pid, entry] of this.registry) {
      if (entry.workspaceId === workspaceId) {
        pids.push(pid);
      }
    }
    return pids;
  }
}

/**
 * Create a process manager with default settings.
 */
export function createProcessManager(defaultTimeoutMs?: number): ProcessManager {
  return new ProcessManager(defaultTimeoutMs);
}

/**
 * Wrap process execution with timeout.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string = 'Operation timed out'
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * Parse process error into ExecutionError.
 */
export function parseProcessError(error: unknown, context: string): ExecutionError {
  if (error instanceof Error) {
    return {
      code: 'PROCESS_ERROR',
      message: error.message,
      context,
      recoverable: false,
    };
  }
  return {
    code: 'UNKNOWN_ERROR',
    message: String(error),
    context,
    recoverable: false,
  };
}
