import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import YAML from 'yaml';
import * as readline from 'readline';
import { linear } from '@devpilot.sh/core';
import {
  checkSystemRequirements,
  printRequirementsStatus,
  getInstallInstructions,
  isOrchestratorInstalled,
  installOrchestrator,
  generateOrchestratorConfig,
  writeOrchestratorConfig,
  orchestratorConfigExists,
} from '../utils/orchestrator';

/**
 * Prompt user for input
 */
function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Prompt for yes/no confirmation
 */
async function confirm(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = await prompt(`${question} ${hint}: `);
  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith('y');
}

export const setupCommand = new Command('setup')
  .description('Interactive setup wizard for DevPilot and agent-orchestrator')
  .option('--linear-only', 'Only configure Linear integration')
  .option('--orchestrator-only', 'Only configure agent-orchestrator')
  .option('--check', 'Only check system requirements')
  .option('-y, --yes', 'Accept all defaults (non-interactive mode)')
  .action(async (options) => {
    const nonInteractive = options.yes;
    const cwd = process.cwd();
    const configPath = join(cwd, '.devpilot', 'config.yaml');

    // Check if DevPilot is initialized
    if (!existsSync(configPath)) {
      console.log(chalk.red('DevPilot not initialized. Run "devpilot init" first.'));
      return;
    }

    console.log(chalk.bold.cyan('\n DevPilot Setup Wizard\n'));
    console.log(chalk.gray('This wizard will help you configure DevPilot and agent-orchestrator.\n'));

    // Step 1: Check system requirements
    console.log(chalk.bold('Step 1: Checking System Requirements'));
    const reqs = checkSystemRequirements();
    printRequirementsStatus(reqs);

    // Check for critical missing requirements
    if (!reqs.node.meetsMinimum) {
      console.log(chalk.red('\nNode.js 20+ is required. Please upgrade and try again.'));
      return;
    }

    if (!reqs.git.meetsMinimum) {
      console.log(chalk.red('\nGit 2.25+ is required. Please upgrade and try again.'));
      return;
    }

    // Show optional installation instructions
    const instructions = getInstallInstructions(reqs);
    if (instructions.length > 0) {
      console.log(chalk.yellow('\nOptional installations:'));
      instructions.forEach((inst) => console.log(chalk.gray(`  - ${inst}`)));
    }

    if (options.check) {
      return; // Only checking requirements
    }

    console.log('');

    // Step 2: Linear Integration
    if (!options.orchestratorOnly) {
      console.log(chalk.bold('Step 2: Linear Integration'));
      console.log(chalk.gray('Linear integration enables ticket tracking and auto-status updates.\n'));

      const configContent = readFileSync(configPath, 'utf-8');
      const config = YAML.parse(configContent);

      const existingApiKey = config.integrations?.linear?.apiKey;
      const existingTeamId = config.integrations?.linear?.teamId;

      if (existingApiKey && existingTeamId) {
        console.log(chalk.green('  Linear is already configured.'));
        if (!nonInteractive) {
          const reconfigure = await confirm('  Reconfigure Linear?', false);
          if (reconfigure) {
            await configureLinear(configPath, config);
          }
        }
        console.log('');
      } else if (nonInteractive) {
        console.log(chalk.gray('  Skipping Linear setup (non-interactive mode).\n'));
      } else {
        const setupLinear = await confirm('  Would you like to set up Linear integration?');
        if (setupLinear) {
          await configureLinear(configPath, config);
        } else {
          console.log(chalk.gray('  Skipping Linear setup.\n'));
        }
      }
    }

    // Step 3: Agent Orchestrator
    if (!options.linearOnly) {
      console.log(chalk.bold('Step 3: Agent Orchestrator'));
      console.log(chalk.gray('Agent orchestrator manages parallel AI coding agents.\n'));

      // Check if installed
      const installed = isOrchestratorInstalled();
      if (!installed) {
        console.log(chalk.yellow('  @composio/ao-cli is not installed.'));
        if (nonInteractive) {
          console.log(chalk.gray('  Skipping installation (non-interactive mode).'));
          console.log(chalk.gray('  Install later with: npm install -g @composio/ao-cli\n'));
        } else {
          const install = await confirm('  Install @composio/ao-cli globally?');
          if (install) {
            const success = installOrchestrator();
            if (!success) {
              console.log(chalk.yellow('  Continuing without agent-orchestrator CLI...\n'));
            }
          } else {
            console.log(chalk.gray('  Skipping installation. You can install later with:'));
            console.log(chalk.cyan('    npm install -g @composio/ao-cli\n'));
          }
        }
      } else {
        console.log(chalk.green('  @composio/ao-cli is installed.'));
      }

      // Generate config
      if (orchestratorConfigExists(cwd)) {
        console.log(chalk.green('  agent-orchestrator.yaml already exists.'));
        if (!nonInteractive) {
          const regenerate = await confirm('  Regenerate configuration?', false);
          if (regenerate) {
            await configureOrchestrator(cwd, configPath, nonInteractive);
          }
        }
      } else {
        if (nonInteractive) {
          // Auto-generate in non-interactive mode
          await configureOrchestrator(cwd, configPath, nonInteractive);
        } else {
          const generate = await confirm('  Generate agent-orchestrator.yaml?');
          if (generate) {
            await configureOrchestrator(cwd, configPath, nonInteractive);
          } else {
            console.log(chalk.gray('  Skipping config generation.\n'));
          }
        }
      }
    }

    // Summary
    console.log(chalk.bold.green('\nSetup Complete!\n'));
    console.log(chalk.white('Next steps:'));
    console.log(chalk.gray('  1. Run ') + chalk.cyan('devpilot serve') + chalk.gray(' to start the UI'));
    console.log(chalk.gray('  2. Run ') + chalk.cyan('ao start') + chalk.gray(' to start agent orchestrator'));
    console.log(chalk.gray('  3. Use the UI to create items and dispatch to the fleet\n'));
  });

/**
 * Configure Linear integration
 */
async function configureLinear(configPath: string, config: Record<string, unknown>): Promise<void> {
  console.log('');
  console.log(chalk.gray('  Get your API key from: https://linear.app/settings/api\n'));

  const apiKey = await prompt('  Linear API key: ');
  if (!apiKey) {
    console.log(chalk.yellow('  No API key provided. Skipping Linear setup.\n'));
    return;
  }

  // Initialize Linear client to fetch teams
  console.log(chalk.cyan('\n  Connecting to Linear...'));
  try {
    const tempClient = linear.initLinearClient({ apiKey, teamId: '' });
    const teams = await tempClient.getTeams();

    if (teams.length === 0) {
      console.log(chalk.yellow('  No teams found. Make sure you have access to at least one team.'));
      return;
    }

    console.log(chalk.green(`  Found ${teams.length} team(s):\n`));
    teams.forEach((team, i) => {
      console.log(chalk.white(`    ${i + 1}. ${team.name} (${team.key})`));
    });

    const teamChoice = await prompt('\n  Select team number: ');
    const teamIndex = parseInt(teamChoice, 10) - 1;

    if (isNaN(teamIndex) || teamIndex < 0 || teamIndex >= teams.length) {
      console.log(chalk.yellow('  Invalid selection. Skipping Linear setup.'));
      return;
    }

    const selectedTeam = teams[teamIndex];

    // Save to config
    if (!config.integrations) config.integrations = {};
    (config.integrations as Record<string, unknown>).linear = {
      apiKey,
      teamId: selectedTeam.id,
      teamName: selectedTeam.name,
      teamKey: selectedTeam.key,
    };

    writeFileSync(configPath, YAML.stringify(config));
    console.log(chalk.green(`\n  Linear configured for team: ${selectedTeam.name}\n`));

    // Set environment variable hint
    console.log(chalk.gray('  For agent-orchestrator, also set the LINEAR_API_KEY environment variable:'));
    console.log(chalk.cyan(`    export LINEAR_API_KEY="${apiKey}"\n`));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.log(chalk.red(`  Failed to connect: ${message}`));
    console.log(chalk.gray('  You can configure Linear later with: devpilot config linear\n'));
  }
}

/**
 * Configure agent orchestrator
 */
async function configureOrchestrator(cwd: string, configPath: string, nonInteractive = false): Promise<void> {
  const config = YAML.parse(readFileSync(configPath, 'utf-8'));
  const linearTeamId = config.integrations?.linear?.teamId;

  // Generate config
  const aoConfig = generateOrchestratorConfig({
    cwd,
    linearTeamId,
  });

  // Ask about custom agent rules (skip in non-interactive mode)
  if (!nonInteractive) {
    const customRules = await confirm('\n  Would you like to customize agent rules?', false);
    if (customRules) {
      console.log(chalk.gray('  Enter rules (one per line, empty line to finish):'));
      const rules: string[] = [];
      let line = '';
      do {
        line = await prompt('    > ');
        if (line) rules.push(line);
      } while (line);

      if (rules.length > 0) {
        const projectName = Object.keys(aoConfig.projects)[0];
        aoConfig.projects[projectName].agentRules = rules.join('\n');
      }
    }
  }

  // Write config
  writeOrchestratorConfig(cwd, aoConfig);
  console.log(chalk.green('\n  Created agent-orchestrator.yaml'));

  // Show sample YAML
  console.log(chalk.gray('\n  Configuration preview:'));
  console.log(chalk.gray('  ' + '-'.repeat(40)));
  const preview = YAML.stringify(aoConfig).split('\n').slice(0, 15).join('\n');
  preview.split('\n').forEach((line) => console.log(chalk.gray(`  ${line}`)));
  console.log(chalk.gray('  ...\n'));
}
