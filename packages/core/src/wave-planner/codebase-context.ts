import { promises as fs } from 'fs';
import { join, relative } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { CodebaseContextBlock } from './types';

const execAsync = promisify(exec);

/**
 * CodebaseContextService
 * Assembles context about the codebase structure and recent changes
 */
export class CodebaseContextService {
  /**
   * Assemble codebase context for a repository
   * Generates file tree and identifies recently modified files
   *
   * @param repo - The repository identifier
   * @param workingDir - The working directory path for the repository
   * @returns CodebaseContextBlock with file tree and recently modified files
   */
  async assembleContext(repo: string, workingDir: string): Promise<CodebaseContextBlock> {
    const fileTree = await this.generateFileTree(workingDir, 3);
    const recentlyModifiedFiles = await this.getRecentlyModifiedFiles(workingDir, 20);

    return {
      fileTree,
      recentlyModifiedFiles,
    };
  }

  /**
   * Generate an ASCII file tree representation of the directory
   * Excludes common build artifacts and dependencies
   *
   * @param dir - The directory to generate the tree for
   * @param maxDepth - Maximum depth to traverse (default: 3)
   * @returns ASCII file tree string
   */
  private async generateFileTree(dir: string, maxDepth: number = 3): Promise<string> {
    const excludeDirs = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', 'out', '.cache']);
    const tree: string[] = [];

    const traverse = async (currentPath: string, depth: number, prefix: string = '') => {
      if (depth > maxDepth) return;

      try {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });
        const sortedEntries = entries.sort((a, b) => {
          // Directories first, then files
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        });

        for (let i = 0; i < sortedEntries.length; i++) {
          const entry = sortedEntries[i];
          const isLast = i === sortedEntries.length - 1;

          // Skip excluded directories
          if (excludeDirs.has(entry.name)) continue;

          // Skip hidden files/dirs except important ones
          if (entry.name.startsWith('.') && !['..env.example', '.gitignore'].includes(entry.name)) {
            continue;
          }

          const connector = isLast ? '└── ' : '├── ';
          const newPrefix = isLast ? '    ' : '│   ';

          if (entry.isDirectory()) {
            tree.push(`${prefix}${connector}${entry.name}/`);
            await traverse(join(currentPath, entry.name), depth + 1, prefix + newPrefix);
          } else {
            tree.push(`${prefix}${connector}${entry.name}`);
          }
        }
      } catch (error) {
        // Skip directories we can't read
        console.error(`Error reading directory ${currentPath}:`, error);
      }
    };

    try {
      const dirName = dir.split('/').pop() || 'root';
      tree.push(`${dirName}/`);
      await traverse(dir, 0);
    } catch (error) {
      tree.push(`Error generating file tree: ${error}`);
    }

    return tree.join('\n');
  }

  /**
   * Get recently modified files using git or file system stats
   * Prefers git for better accuracy
   *
   * @param dir - The directory to check
   * @param limit - Maximum number of files to return (default: 20)
   * @returns Array of file paths (relative to the working directory)
   */
  private async getRecentlyModifiedFiles(dir: string, limit: number = 20): Promise<string[]> {
    try {
      // Try git first
      const { stdout } = await execAsync(
        `git -C "${dir}" log --pretty=format: --name-only --since="1 week ago" | sort | uniq`,
        { maxBuffer: 1024 * 1024 }
      );

      const files = stdout
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .filter((file) => {
          // Filter out common non-code files
          const lowerFile = file.toLowerCase();
          return !lowerFile.includes('node_modules') &&
                 !lowerFile.includes('.git') &&
                 !lowerFile.includes('dist/') &&
                 !lowerFile.includes('build/') &&
                 !lowerFile.includes('coverage/') &&
                 !lowerFile.endsWith('.lock') &&
                 !lowerFile.endsWith('.log');
        })
        .slice(0, limit);

      if (files.length > 0) {
        return files;
      }
    } catch (error) {
      // Git not available or not a git repo, fall back to file stats
      console.warn('Git not available, falling back to file stats');
    }

    // Fallback: use file system stats
    return this.getRecentlyModifiedFilesByStats(dir, limit);
  }

  /**
   * Fallback method to get recently modified files using file system stats
   *
   * @param dir - The directory to check
   * @param limit - Maximum number of files to return
   * @returns Array of file paths (relative to the working directory)
   */
  private async getRecentlyModifiedFilesByStats(dir: string, limit: number): Promise<string[]> {
    const excludeDirs = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', 'out']);
    const files: { path: string; mtime: Date }[] = [];

    const traverse = async (currentPath: string, depth: number = 0) => {
      if (depth > 5) return; // Limit depth to prevent excessive traversal

      try {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });

        for (const entry of entries) {
          if (excludeDirs.has(entry.name)) continue;
          if (entry.name.startsWith('.')) continue;

          const fullPath = join(currentPath, entry.name);

          if (entry.isDirectory()) {
            await traverse(fullPath, depth + 1);
          } else {
            const stats = await fs.stat(fullPath);
            const relativePath = relative(dir, fullPath);
            files.push({ path: relativePath, mtime: stats.mtime });
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    };

    await traverse(dir);

    // Sort by modification time and return top N
    return files
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
      .slice(0, limit)
      .map((f) => f.path);
  }
}
