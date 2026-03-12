/**
 * Version Tagger
 *
 * Detects current git version info for tagging benchmark results.
 */

import { execSync } from 'child_process';
import type { VersionInfo } from '../types';

/**
 * Get version information from git and package.json.
 */
export function getVersionInfo(projectRoot: string = process.cwd()): VersionInfo {
  const gitCommit = getGitCommit(projectRoot);
  const gitBranch = getGitBranch(projectRoot);
  const gitTag = getGitTag(projectRoot);
  const isDirty = isWorkingTreeDirty(projectRoot);

  // Determine version string
  let version: string;
  if (gitTag) {
    version = gitTag;
  } else {
    // Try to get a describe-style version
    const describeVersion = getGitDescribe(projectRoot);
    if (describeVersion) {
      version = describeVersion;
    } else {
      // Fall back to commit SHA
      version = `0.0.0-${gitCommit.slice(0, 7)}`;
    }
  }

  return {
    version,
    gitCommit,
    gitBranch,
    gitTag,
    isDirty,
  };
}

/**
 * Get the current git commit SHA.
 */
export function getGitCommit(projectRoot: string = process.cwd()): string {
  try {
    return execSync('git rev-parse HEAD', {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Get the current git branch name.
 */
export function getGitBranch(projectRoot: string = process.cwd()): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Get the current git tag if HEAD is tagged.
 */
export function getGitTag(
  projectRoot: string = process.cwd()
): string | undefined {
  try {
    const tag = execSync('git describe --exact-match --tags HEAD', {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return tag || undefined;
  } catch {
    // HEAD is not tagged
    return undefined;
  }
}

/**
 * Get a git describe-style version string.
 * e.g., "v0.1.0-3-gabcdef" (tag + commits since + short SHA)
 */
export function getGitDescribe(
  projectRoot: string = process.cwd()
): string | undefined {
  try {
    return execSync('git describe --tags --always', {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return undefined;
  }
}

/**
 * Check if the working tree has uncommitted changes.
 */
export function isWorkingTreeDirty(projectRoot: string = process.cwd()): boolean {
  try {
    const status = execSync('git status --porcelain', {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return status.length > 0;
  } catch {
    return false;
  }
}

/**
 * Create a version tag string suitable for directory naming.
 * Sanitizes the version string to remove characters that are
 * problematic in file paths.
 */
export function sanitizeVersionForPath(version: string): string {
  return version
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Create a timestamp string suitable for directory naming.
 * Format: YYYY-MM-DDTHH-MM-SSZ
 */
export function createTimestampPath(date: Date = new Date()): string {
  return date.toISOString().replace(/:/g, '-').replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Parse a timestamp path back to a Date.
 */
export function parseTimestampPath(timestampPath: string): Date {
  const isoString = timestampPath.replace(/-(\d{2})-(\d{2})Z$/, ':$1:$2Z');
  return new Date(isoString);
}
