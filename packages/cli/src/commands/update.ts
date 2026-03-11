import { Command } from 'commander';
import { execSync, spawn } from 'child_process';
import chalk from 'chalk';
import { VERSION } from '../version';

/**
 * Get the latest version from npm registry
 */
async function getLatestVersion(): Promise<string | null> {
  try {
    const result = execSync('npm view @devpilot.sh/cli version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim();
  } catch {
    return null;
  }
}

/**
 * Compare semantic versions
 * Returns: 1 if a > b, -1 if a < b, 0 if equal
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  return 0;
}

/**
 * Detect package manager used for global install
 */
function detectPackageManager(): 'npm' | 'pnpm' | 'yarn' | 'bun' {
  try {
    // Check if installed via pnpm
    const pnpmList = execSync('pnpm list -g @devpilot.sh/cli 2>/dev/null', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (pnpmList.includes('@devpilot.sh/cli')) return 'pnpm';
  } catch {
    // Not installed via pnpm
  }

  try {
    // Check if installed via yarn
    const yarnList = execSync('yarn global list 2>/dev/null', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (yarnList.includes('@devpilot.sh/cli')) return 'yarn';
  } catch {
    // Not installed via yarn
  }

  try {
    // Check if bun is available
    execSync('bun --version', { stdio: ['pipe', 'pipe', 'pipe'] });
    return 'bun';
  } catch {
    // Bun not available
  }

  // Default to npm
  return 'npm';
}

/**
 * Get update command for package manager
 */
function getUpdateCommand(pm: 'npm' | 'pnpm' | 'yarn' | 'bun'): string {
  switch (pm) {
    case 'pnpm':
      return 'pnpm add -g @devpilot.sh/cli@latest';
    case 'yarn':
      return 'yarn global add @devpilot.sh/cli@latest';
    case 'bun':
      return 'bun add -g @devpilot.sh/cli@latest';
    default:
      return 'npm install -g @devpilot.sh/cli@latest';
  }
}

export const updateCommand = new Command('update')
  .description('Update DevPilot CLI to the latest version')
  .option('-c, --check', 'Only check for updates without installing')
  .option('--force', 'Force update even if already on latest version')
  .action(async (options) => {
    console.log(chalk.cyan('Checking for updates...'));

    const latestVersion = await getLatestVersion();

    if (!latestVersion) {
      console.log(chalk.yellow('Could not check for updates. Please check your network connection.'));
      console.log(chalk.gray('You can manually update with: npm install -g @devpilot.sh/cli@latest'));
      return;
    }

    const comparison = compareVersions(latestVersion, VERSION);

    if (comparison === 0 && !options.force) {
      console.log(chalk.green(`You're already on the latest version (${VERSION})`));
      return;
    }

    if (comparison === -1 && !options.force) {
      console.log(chalk.yellow(`You're on a newer version (${VERSION}) than the latest release (${latestVersion})`));
      console.log(chalk.gray('This might be a pre-release or development version.'));
      return;
    }

    if (options.check) {
      if (comparison === 1) {
        console.log(chalk.yellow(`Update available: ${VERSION} → ${latestVersion}`));
        console.log(chalk.gray('Run "devpilot update" to install the latest version.'));
      }
      return;
    }

    // Perform the update
    const pm = detectPackageManager();
    const updateCmd = getUpdateCommand(pm);

    console.log(chalk.cyan(`Updating from ${VERSION} to ${latestVersion}...`));
    console.log(chalk.gray(`Using: ${updateCmd}`));
    console.log('');

    try {
      // Run update command with inherited stdio for real-time output
      const [cmd, ...args] = updateCmd.split(' ');
      const child = spawn(cmd, args, {
        stdio: 'inherit',
        shell: true,
      });

      child.on('close', (code) => {
        if (code === 0) {
          console.log('');
          console.log(chalk.green(`Successfully updated to ${latestVersion}`));
          console.log(chalk.gray('Run "devpilot --version" to verify.'));
        } else {
          console.log('');
          console.log(chalk.red('Update failed. Please try manually:'));
          console.log(chalk.cyan(`  ${updateCmd}`));
        }
      });

      child.on('error', (err) => {
        console.log(chalk.red(`Update failed: ${err.message}`));
        console.log(chalk.gray('Please try manually:'));
        console.log(chalk.cyan(`  ${updateCmd}`));
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.log(chalk.red(`Update failed: ${message}`));
      console.log(chalk.gray('Please try manually:'));
      console.log(chalk.cyan(`  ${updateCmd}`));
    }
  });
