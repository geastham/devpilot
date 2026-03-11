import { execSync, spawnSync } from 'child_process';
import { existsSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import chalk from 'chalk';

export interface SystemRequirements {
  node: { installed: boolean; version: string | null; meetsMinimum: boolean };
  git: { installed: boolean; version: string | null; meetsMinimum: boolean };
  tmux: { installed: boolean };
  gh: { installed: boolean; authenticated: boolean };
}

export interface OrchestratorConfig {
  dataDir: string;
  worktreeDir: string;
  projects: {
    [key: string]: {
      repo: string;
      path: string;
      defaultBranch: string;
      tracker?: {
        plugin: string;
        teamId: string;
      };
      agentRules?: string;
    };
  };
}

/**
 * Check if a command exists and get its version
 */
function checkCommand(cmd: string, versionArg = '--version'): { installed: boolean; version: string | null } {
  try {
    const result = spawnSync(cmd, [versionArg], { encoding: 'utf-8', stdio: 'pipe' });
    if (result.status === 0) {
      const versionMatch = result.stdout.match(/(\d+\.\d+(\.\d+)?)/);
      return {
        installed: true,
        version: versionMatch ? versionMatch[1] : null,
      };
    }
    return { installed: false, version: null };
  } catch {
    return { installed: false, version: null };
  }
}

/**
 * Parse version string and compare
 */
function versionMeetsMinimum(version: string | null, minimum: string): boolean {
  if (!version) return false;
  const vParts = version.split('.').map(Number);
  const mParts = minimum.split('.').map(Number);
  for (let i = 0; i < mParts.length; i++) {
    if ((vParts[i] || 0) > mParts[i]) return true;
    if ((vParts[i] || 0) < mParts[i]) return false;
  }
  return true;
}

/**
 * Check all system requirements for agent-orchestrator
 */
export function checkSystemRequirements(): SystemRequirements {
  // Check Node.js (minimum 20.0.0)
  const node = checkCommand('node');
  const nodeMeetsMin = versionMeetsMinimum(node.version, '20.0.0');

  // Check Git (minimum 2.25.0)
  const git = checkCommand('git');
  const gitMeetsMin = versionMeetsMinimum(git.version, '2.25.0');

  // Check tmux
  const tmux = checkCommand('tmux', '-V');

  // Check GitHub CLI and authentication
  const gh = checkCommand('gh');
  let ghAuthenticated = false;
  if (gh.installed) {
    try {
      const result = spawnSync('gh', ['auth', 'status'], { encoding: 'utf-8', stdio: 'pipe' });
      ghAuthenticated = result.status === 0;
    } catch {
      ghAuthenticated = false;
    }
  }

  return {
    node: { ...node, meetsMinimum: nodeMeetsMin },
    git: { ...git, meetsMinimum: gitMeetsMin },
    tmux: { installed: tmux.installed },
    gh: { installed: gh.installed, authenticated: ghAuthenticated },
  };
}

/**
 * Print system requirements status
 */
export function printRequirementsStatus(reqs: SystemRequirements): void {
  console.log(chalk.cyan('\nSystem Requirements:'));
  console.log('');

  // Node.js
  if (reqs.node.installed && reqs.node.meetsMinimum) {
    console.log(chalk.green(`  ✓ Node.js ${reqs.node.version}`));
  } else if (reqs.node.installed) {
    console.log(chalk.yellow(`  ⚠ Node.js ${reqs.node.version} (requires 20.0.0+)`));
  } else {
    console.log(chalk.red('  ✗ Node.js not found'));
  }

  // Git
  if (reqs.git.installed && reqs.git.meetsMinimum) {
    console.log(chalk.green(`  ✓ Git ${reqs.git.version}`));
  } else if (reqs.git.installed) {
    console.log(chalk.yellow(`  ⚠ Git ${reqs.git.version} (requires 2.25.0+)`));
  } else {
    console.log(chalk.red('  ✗ Git not found'));
  }

  // tmux
  if (reqs.tmux.installed) {
    console.log(chalk.green('  ✓ tmux'));
  } else {
    console.log(chalk.yellow('  ⚠ tmux not found (optional, for session management)'));
  }

  // GitHub CLI
  if (reqs.gh.installed && reqs.gh.authenticated) {
    console.log(chalk.green('  ✓ GitHub CLI (authenticated)'));
  } else if (reqs.gh.installed) {
    console.log(chalk.yellow('  ⚠ GitHub CLI (not authenticated - run: gh auth login)'));
  } else {
    console.log(chalk.yellow('  ⚠ GitHub CLI not found (optional, for PR creation)'));
  }
}

/**
 * Check if agent-orchestrator CLI is installed
 */
export function isOrchestratorInstalled(): boolean {
  try {
    const result = spawnSync('npx', ['@composio/ao-cli', '--version'], {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Install agent-orchestrator CLI globally
 */
export function installOrchestrator(): boolean {
  console.log(chalk.cyan('\nInstalling @composio/ao-cli...'));
  try {
    execSync('npm install -g @composio/ao-cli', { stdio: 'inherit' });
    console.log(chalk.green('✓ @composio/ao-cli installed successfully'));
    return true;
  } catch {
    console.log(chalk.red('✗ Failed to install @composio/ao-cli'));
    console.log(chalk.gray('  Try manually: npm install -g @composio/ao-cli'));
    return false;
  }
}

/**
 * Detect git repository information
 */
export function detectRepoInfo(cwd: string): { repo: string; branch: string } | null {
  try {
    // Get remote origin URL
    const remoteResult = spawnSync('git', ['remote', 'get-url', 'origin'], {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    if (remoteResult.status !== 0) return null;

    const remoteUrl = remoteResult.stdout.trim();
    let repo = '';

    // Parse GitHub URL (HTTPS or SSH)
    const httpsMatch = remoteUrl.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/);
    const sshMatch = remoteUrl.match(/git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/);

    if (httpsMatch) {
      repo = httpsMatch[1];
    } else if (sshMatch) {
      repo = sshMatch[1];
    } else {
      return null;
    }

    // Get default branch
    const branchResult = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    const branch = branchResult.status === 0 ? branchResult.stdout.trim() : 'main';

    return { repo, branch };
  } catch {
    return null;
  }
}

/**
 * Generate agent-orchestrator.yaml configuration
 */
export function generateOrchestratorConfig(options: {
  cwd: string;
  linearTeamId?: string;
  agentRules?: string;
}): OrchestratorConfig {
  const { cwd, linearTeamId, agentRules } = options;
  const projectName = basename(cwd);
  const repoInfo = detectRepoInfo(cwd);

  const config: OrchestratorConfig = {
    dataDir: '~/.agent-orchestrator',
    worktreeDir: '~/.worktrees',
    projects: {
      [projectName]: {
        repo: repoInfo?.repo || `owner/${projectName}`,
        path: cwd,
        defaultBranch: repoInfo?.branch || 'main',
      },
    },
  };

  // Add Linear tracker if team ID provided
  if (linearTeamId) {
    config.projects[projectName].tracker = {
      plugin: 'linear',
      teamId: linearTeamId,
    };
  }

  // Add agent rules if provided
  if (agentRules) {
    config.projects[projectName].agentRules = agentRules;
  } else {
    // Default agent rules
    config.projects[projectName].agentRules = `Always link Linear tickets in commit messages.
Run tests before pushing.
Use conventional commits (feat:, fix:, chore:).
Create small, focused PRs.`;
  }

  return config;
}

/**
 * Write agent-orchestrator.yaml to disk
 */
export function writeOrchestratorConfig(cwd: string, config: OrchestratorConfig): void {
  const YAML = require('yaml');
  const configPath = join(cwd, 'agent-orchestrator.yaml');
  const yamlContent = YAML.stringify(config);
  writeFileSync(configPath, yamlContent);
}

/**
 * Check if agent-orchestrator.yaml exists
 */
export function orchestratorConfigExists(cwd: string): boolean {
  return existsSync(join(cwd, 'agent-orchestrator.yaml'));
}

/**
 * Get installation instructions for missing requirements
 */
export function getInstallInstructions(reqs: SystemRequirements): string[] {
  const instructions: string[] = [];

  if (!reqs.node.installed || !reqs.node.meetsMinimum) {
    instructions.push('Node.js 20+: https://nodejs.org or use nvm: nvm install 20');
  }

  if (!reqs.git.installed || !reqs.git.meetsMinimum) {
    instructions.push('Git 2.25+: https://git-scm.com/downloads');
  }

  if (!reqs.tmux.installed) {
    instructions.push('tmux: brew install tmux (macOS) or apt install tmux (Linux)');
  }

  if (!reqs.gh.installed) {
    instructions.push('GitHub CLI: brew install gh (macOS) or https://cli.github.com');
  } else if (!reqs.gh.authenticated) {
    instructions.push('GitHub CLI auth: gh auth login');
  }

  return instructions;
}
