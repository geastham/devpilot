import { Command } from 'commander';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';

export const initCommand = new Command('init')
  .description('Initialize DevPilot in the current repository')
  .option('-f, --force', 'Overwrite existing configuration')
  .action(async (options) => {
    const cwd = process.cwd();
    const devpilotDir = join(cwd, '.devpilot');
    const configPath = join(devpilotDir, 'config.yaml');

    // Check if already initialized
    if (existsSync(configPath) && !options.force) {
      console.log(
        chalk.yellow('⚠️  DevPilot is already initialized in this directory.')
      );
      console.log(chalk.gray('   Use --force to reinitialize.'));
      return;
    }

    // Create .devpilot directory
    if (!existsSync(devpilotDir)) {
      mkdirSync(devpilotDir, { recursive: true });
    }

    // Create default config
    const defaultConfig = `# DevPilot Configuration
version: 1

mode: local  # 'local' | 'cloud' | 'hybrid'

database:
  type: sqlite
  path: .devpilot/data.db

sync:
  enabled: false
  endpoint: https://api.devpilot.sh
  org_id: null
  project_id: null

watchers:
  enabled: true
  patterns:
    - "src/**/*.ts"
    - "src/**/*.tsx"
    - "tests/**/*.ts"
  ignore:
    - "**/node_modules/**"
    - "**/.git/**"

ui:
  port: 3847
  open_browser: true
`;

    writeFileSync(configPath, defaultConfig);

    // Add to .gitignore if it exists
    const gitignorePath = join(cwd, '.gitignore');
    if (existsSync(gitignorePath)) {
      const gitignore = require('fs').readFileSync(gitignorePath, 'utf-8');
      if (!gitignore.includes('.devpilot/data.db')) {
        const addition = '\n# DevPilot\n.devpilot/data.db\n';
        require('fs').appendFileSync(gitignorePath, addition);
        console.log(chalk.gray('   Added .devpilot/data.db to .gitignore'));
      }
    }

    console.log(chalk.green('✅ DevPilot initialized successfully!'));
    console.log('');
    console.log(chalk.white('Next steps:'));
    console.log(chalk.gray('  1. Run ') + chalk.cyan('devpilot setup') + chalk.gray(' to configure Linear and agent-orchestrator'));
    console.log(chalk.gray('  2. Run ') + chalk.cyan('devpilot serve') + chalk.gray(' to start the local UI'));
    console.log(chalk.gray('  3. Run ') + chalk.cyan('devpilot status') + chalk.gray(' to see fleet status'));
  });
