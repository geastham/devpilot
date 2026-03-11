import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import YAML from 'yaml';
import { linear } from '@devpilot/core';

// Linear setup subcommand
const linearCommand = new Command('linear')
  .description('Configure Linear integration')
  .option('--api-key <key>', 'Linear API key')
  .option('--team-id <id>', 'Linear team ID')
  .option('--test', 'Test the connection')
  .action(async (options) => {
    const configPath = join(process.cwd(), '.devpilot', 'config.yaml');

    if (!existsSync(configPath)) {
      console.log(chalk.red('DevPilot not initialized. Run "devpilot init" first.'));
      return;
    }

    const configContent = readFileSync(configPath, 'utf-8');
    const config = YAML.parse(configContent);

    // Initialize integrations section if needed
    if (!config.integrations) config.integrations = {};
    if (!config.integrations.linear) config.integrations.linear = {};

    // Update API key if provided
    if (options.apiKey) {
      config.integrations.linear.apiKey = options.apiKey;
      writeFileSync(configPath, YAML.stringify(config));
      console.log(chalk.green('Linear API key saved.'));
    }

    // Update team ID if provided
    if (options.teamId) {
      config.integrations.linear.teamId = options.teamId;
      writeFileSync(configPath, YAML.stringify(config));
      console.log(chalk.green('Linear team ID saved.'));
    }

    // Test the connection
    if (options.test || (options.apiKey && options.teamId)) {
      const apiKey = config.integrations.linear.apiKey;
      const teamId = config.integrations.linear.teamId;

      if (!apiKey || !teamId) {
        console.log(chalk.yellow('Missing API key or team ID. Set both to test connection.'));
        return;
      }

      console.log(chalk.cyan('Testing Linear connection...'));

      try {
        const client = linear.initLinearClient({ apiKey, teamId });
        const team = await client.getTeam();
        console.log(chalk.green(`Connected to Linear team: ${team.name} (${team.key})`));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.log(chalk.red(`Connection failed: ${message}`));
      }
    }

    // Show current config if no options
    if (!options.apiKey && !options.teamId && !options.test) {
      const apiKey = config.integrations.linear.apiKey;
      const teamId = config.integrations.linear.teamId;

      console.log(chalk.cyan('Linear Configuration:'));
      console.log(`  API Key: ${apiKey ? chalk.green('configured') : chalk.yellow('not set')}`);
      console.log(`  Team ID: ${teamId || chalk.yellow('not set')}`);
    }
  });

export const configCommand = new Command('config')
  .description('Manage DevPilot configuration')
  .argument('[key]', 'Configuration key (e.g., ui.port)')
  .argument('[value]', 'Value to set')
  .option('-l, --list', 'List all configuration')
  .action(async (key, value, options) => {
    const configPath = join(process.cwd(), '.devpilot', 'config.yaml');

    if (!existsSync(configPath)) {
      console.log(chalk.red('❌ DevPilot not initialized. Run "devpilot init" first.'));
      return;
    }

    const configContent = readFileSync(configPath, 'utf-8');
    const config = YAML.parse(configContent);

    if (options.list || (!key && !value)) {
      // List all config
      console.log(chalk.cyan('DevPilot Configuration:'));
      console.log('');
      console.log(YAML.stringify(config));
      return;
    }

    if (key && !value) {
      // Get a specific key
      const keys = key.split('.');
      let current = config;
      for (const k of keys) {
        if (current && typeof current === 'object' && k in current) {
          current = current[k];
        } else {
          console.log(chalk.red(`❌ Key "${key}" not found.`));
          return;
        }
      }
      console.log(current);
      return;
    }

    if (key && value) {
      // Set a value
      const keys = key.split('.');
      let current = config;
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        if (!(k in current)) {
          current[k] = {};
        }
        current = current[k];
      }

      // Parse value (try JSON, then boolean, then number, then string)
      let parsedValue: unknown = value;
      try {
        parsedValue = JSON.parse(value);
      } catch {
        if (value === 'true') parsedValue = true;
        else if (value === 'false') parsedValue = false;
        else if (!isNaN(Number(value))) parsedValue = Number(value);
      }

      current[keys[keys.length - 1]] = parsedValue;

      writeFileSync(configPath, YAML.stringify(config));
      console.log(chalk.green(`✅ Set ${key} = ${JSON.stringify(parsedValue)}`));
    }
  })
  .addCommand(linearCommand);
