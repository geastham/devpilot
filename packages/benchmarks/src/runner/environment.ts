/**
 * Workspace Manager
 *
 * Manages isolated workspace environments for benchmark execution.
 */

import { createWriteStream } from 'fs';
import { mkdir, rm, cp, readdir, stat, writeFile, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { createReadStream } from 'fs';
import * as tar from 'tar';
import type { BenchmarkId, ScenarioType, WorkspaceInfo } from '../types';
import { ProcessManager } from './process-manager';

const TEMP_BASE = '/tmp/devpilot-bench';

export interface WorkspaceConfig {
  runId: string;
  benchmarkId: BenchmarkId;
  scenario: ScenarioType;
  benchmarksDir: string;
  archiveOnCleanup?: boolean;
}

/**
 * Manages workspace creation, setup, and cleanup for benchmark execution.
 */
export class WorkspaceManager {
  private processManager: ProcessManager;
  private activeWorkspaces: Map<string, WorkspaceInfo> = new Map();

  constructor(processManager: ProcessManager) {
    this.processManager = processManager;
  }

  /**
   * Create and setup a workspace for benchmark execution.
   */
  async createWorkspace(config: WorkspaceConfig): Promise<WorkspaceInfo> {
    const {
      runId,
      benchmarkId,
      scenario,
      benchmarksDir,
    } = config;

    // Create workspace directory
    const workspacePath = join(TEMP_BASE, runId, scenario, benchmarkId);
    await mkdir(workspacePath, { recursive: true });

    // Determine source benchmark path
    const benchmarkPath = await this.findBenchmarkPath(benchmarksDir, benchmarkId);
    if (!benchmarkPath) {
      throw new Error(`Benchmark not found: ${benchmarkId}`);
    }

    // Copy PRD.md
    const prdSource = join(benchmarkPath, 'PRD.md');
    const prdDest = join(workspacePath, 'PRD.md');
    try {
      await cp(prdSource, prdDest);
    } catch {
      throw new Error(`PRD.md not found at ${prdSource}`);
    }

    // Copy fixtures if they exist
    const fixturesSource = join(benchmarkPath, 'fixtures');
    const fixturesDest = join(workspacePath, 'fixtures');
    try {
      const fixturesStat = await stat(fixturesSource);
      if (fixturesStat.isDirectory()) {
        await cp(fixturesSource, fixturesDest, { recursive: true });
      }
    } catch {
      // Fixtures are optional
    }

    // Copy acceptance tests if they exist
    const acceptanceSource = join(benchmarkPath, 'acceptance');
    const acceptanceDest = join(workspacePath, 'acceptance');
    try {
      const acceptanceStat = await stat(acceptanceSource);
      if (acceptanceStat.isDirectory()) {
        await cp(acceptanceSource, acceptanceDest, { recursive: true });
        // Make test scripts executable
        await this.makeScriptsExecutable(acceptanceDest);
      }
    } catch {
      // Acceptance tests are optional in the benchmark folder
    }

    // Initialize package.json based on benchmark requirements
    await this.initializePackageJson(workspacePath, benchmarkId, benchmarkPath);

    const workspaceId = `${runId}-${scenario}-${benchmarkId}`;
    const info: WorkspaceInfo = {
      path: workspacePath,
      benchmarkId,
      scenario,
      runId,
      createdAt: new Date().toISOString(),
    };

    this.activeWorkspaces.set(workspaceId, info);

    return info;
  }

  /**
   * Find the benchmark directory path.
   */
  private async findBenchmarkPath(
    benchmarksDir: string,
    benchmarkId: BenchmarkId
  ): Promise<string | null> {
    // Try exact match first
    const exactPath = join(benchmarksDir, benchmarkId);
    try {
      const s = await stat(exactPath);
      if (s.isDirectory()) return exactPath;
    } catch {
      // Not found
    }

    // Try prefix match (e.g., "01-" matches "01-cli-static-site-gen")
    try {
      const entries = await readdir(benchmarksDir);
      const prefix = benchmarkId.split('-')[0];
      for (const entry of entries) {
        if (entry.startsWith(`${prefix}-`)) {
          const fullPath = join(benchmarksDir, entry);
          const s = await stat(fullPath);
          if (s.isDirectory()) return fullPath;
        }
      }
    } catch {
      // Directory not readable
    }

    return null;
  }

  /**
   * Make shell scripts executable.
   */
  private async makeScriptsExecutable(dir: string): Promise<void> {
    try {
      const entries = await readdir(dir);
      for (const entry of entries) {
        if (entry.endsWith('.sh')) {
          const scriptPath = join(dir, entry);
          await this.processManager.spawn('chmod', ['+x', scriptPath]);
        }
      }
    } catch {
      // Ignore errors
    }
  }

  /**
   * Initialize package.json for the workspace.
   */
  private async initializePackageJson(
    workspacePath: string,
    benchmarkId: BenchmarkId,
    benchmarkPath: string
  ): Promise<void> {
    // Check if benchmark has a template package.json
    const templatePath = join(benchmarkPath, 'package.template.json');
    try {
      const template = await readFile(templatePath, 'utf-8');
      await writeFile(join(workspacePath, 'package.json'), template);
      return;
    } catch {
      // No template, create minimal package.json
    }

    // Create a minimal package.json based on benchmark type
    const packageJson = {
      name: `benchmark-${benchmarkId}`,
      version: '0.0.0',
      private: true,
      type: 'module',
      scripts: {
        build: 'echo "Build not configured"',
        test: 'echo "Tests not configured"',
      },
    };

    // Add dependencies based on benchmark ID
    if (benchmarkId.includes('cli-static-site-gen')) {
      Object.assign(packageJson, {
        dependencies: {
          commander: '^12.0.0',
          'gray-matter': '^4.0.3',
          marked: '^12.0.0',
          handlebars: '^4.7.8',
          'highlight.js': '^11.9.0',
          express: '^4.18.2',
          chokidar: '^3.6.0',
        },
      });
    } else if (benchmarkId.includes('rest-api')) {
      Object.assign(packageJson, {
        dependencies: {
          express: '^4.18.2',
          'better-sqlite3': '^9.4.0',
          bcryptjs: '^2.4.3',
          jsonwebtoken: '^9.0.2',
          uuid: '^9.0.0',
          zod: '^3.22.0',
        },
      });
    } else if (benchmarkId.includes('react') || benchmarkId.includes('dashboard')) {
      Object.assign(packageJson, {
        dependencies: {
          'better-sqlite3': '^9.4.0',
          express: '^4.18.2',
          cors: '^2.8.5',
          'csv-parse': '^5.5.3',
          react: '^18.2.0',
          'react-dom': '^18.2.0',
          recharts: '^2.12.0',
        },
        devDependencies: {
          vite: '^5.1.0',
          '@vitejs/plugin-react': '^4.2.0',
        },
      });
    }

    await writeFile(
      join(workspacePath, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );
  }

  /**
   * Cleanup a workspace.
   */
  async cleanupWorkspace(
    workspaceId: string,
    options: { archive?: boolean; archivePath?: string } = {}
  ): Promise<void> {
    const info = this.activeWorkspaces.get(workspaceId);
    if (!info) return;

    // Kill any running processes for this workspace
    await this.processManager.killWorkspace(workspaceId);

    // Archive if requested
    if (options.archive && options.archivePath) {
      await this.archiveWorkspace(info.path, options.archivePath);
    }

    // Remove workspace directory
    try {
      await rm(info.path, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    this.activeWorkspaces.delete(workspaceId);
  }

  /**
   * Archive a workspace to a tar.gz file.
   */
  async archiveWorkspace(workspacePath: string, archivePath: string): Promise<void> {
    await mkdir(dirname(archivePath), { recursive: true });

    // Use tar to create archive (requires tar module or shell command)
    try {
      await tar.create(
        {
          gzip: true,
          file: archivePath,
          cwd: dirname(workspacePath),
        },
        [workspacePath.split('/').pop()!]
      );
    } catch {
      // Fallback to shell tar command
      await this.processManager.spawn('tar', [
        '-czf',
        archivePath,
        '-C',
        dirname(workspacePath),
        workspacePath.split('/').pop()!,
      ]);
    }
  }

  /**
   * Cleanup all active workspaces.
   */
  async cleanupAll(): Promise<number> {
    const count = this.activeWorkspaces.size;

    for (const [workspaceId] of this.activeWorkspaces) {
      await this.cleanupWorkspace(workspaceId);
    }

    return count;
  }

  /**
   * Get workspace info.
   */
  getWorkspace(workspaceId: string): WorkspaceInfo | undefined {
    return this.activeWorkspaces.get(workspaceId);
  }

  /**
   * List active workspaces.
   */
  listWorkspaces(): WorkspaceInfo[] {
    return Array.from(this.activeWorkspaces.values());
  }

  /**
   * Get workspace ID from components.
   */
  static getWorkspaceId(runId: string, scenario: ScenarioType, benchmarkId: BenchmarkId): string {
    return `${runId}-${scenario}-${benchmarkId}`;
  }
}

/**
 * Create a workspace manager.
 */
export function createWorkspaceManager(processManager: ProcessManager): WorkspaceManager {
  return new WorkspaceManager(processManager);
}
