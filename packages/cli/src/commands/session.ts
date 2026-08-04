import { Command } from 'commander';
import { newCommand, joinCommand, tailCommand } from './session/index';

/**
 * Shared agent sessions — TRD 06.
 *
 * A shared, ordered, end-to-end encrypted transcript that several people and
 * their local agents read and write. The hosted plane relays ciphertext and
 * cannot read it: the key lives in the link fragment and never leaves the
 * machines holding it.
 */
export const sessionCommand = new Command('session')
  .description('Shared, end-to-end encrypted sessions across machines')
  .addCommand(newCommand)
  .addCommand(joinCommand)
  .addCommand(tailCommand);
