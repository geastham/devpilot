import { Command } from 'commander';
import { connectCommand, disconnectCommand, statusCommand } from './bridge/index';

export const bridgeCommand = new Command('bridge')
  .description('Manage connection to DevPilot cloud bridge')
  .addCommand(connectCommand)
  .addCommand(disconnectCommand)
  .addCommand(statusCommand);
