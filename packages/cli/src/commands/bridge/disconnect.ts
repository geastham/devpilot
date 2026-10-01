import { Command } from 'commander';
import chalk from 'chalk';
import {
  bridgeCredentialsPath,
  clearBridgeCredentials,
  loadBridgeCredentials,
} from '@devpilot.sh/bridge-client';

/**
 * `devpilot bridge disconnect` — forget this machine's bridge credentials.
 *
 * This used to send `DELETE /api/orchestrators/:id` with an "API key". The
 * bridge has no such route and no such credential, so the command could only
 * ever fail, after asking for an orchestrator id nobody had to hand.
 *
 * What a person running it wants is for this machine to stop being able to
 * connect. Two things make that true, and only one of them is local:
 *
 *   - the token saved on this machine is removed — done here
 *   - the token itself is revoked — done in the dashboard, because revoking is
 *     an admin's decision and a machine token cannot revoke itself
 *
 * A running `bridge connect` is a separate process; stopping it is Ctrl+C.
 */
export const disconnectCommand = new Command('disconnect')
  .description('Forget the bridge URL and token saved on this machine')
  .action(async () => {
    const saved = loadBridgeCredentials();
    clearBridgeCredentials();

    if (saved) {
      console.log(chalk.green('✓ Forgot the saved token for ') + chalk.gray(saved.url));
    } else {
      console.log(chalk.gray(`Nothing was saved at ${bridgeCredentialsPath()}.`));
    }
    console.log('');
    console.log(chalk.gray('  The token still works for anyone who has a copy of it. To end that,'));
    console.log(chalk.gray('  revoke it in the dashboard under Settings → Tokens — it stops being'));
    console.log(chalk.gray('  accepted on the very next request.'));
    console.log(chalk.gray('  A bridge that is running now keeps running until you stop it (Ctrl+C).'));
    console.log('');
  });
