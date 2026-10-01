import { Command } from 'commander';
import {
  connectCommand,
  disconnectCommand,
  installCommand,
  logsCommand,
  startCommand,
  statusCommand,
  stopCommand,
  uninstallCommand,
} from './bridge/index';

// In the order a person meets them: connect in the foreground, keep it running
// (start/stop, then install/uninstall for across restarts), look at it, and
// finally forget the machine's token.
export const bridgeCommand = new Command('bridge')
  .description('Manage connection to DevPilot cloud bridge')
  .addCommand(connectCommand)
  .addCommand(startCommand)
  .addCommand(stopCommand)
  .addCommand(installCommand)
  .addCommand(uninstallCommand)
  .addCommand(statusCommand)
  .addCommand(logsCommand)
  .addCommand(disconnectCommand);
