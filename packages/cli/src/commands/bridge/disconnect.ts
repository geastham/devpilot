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
 * A running bridge is a separate process and is not stopped here: it read the
 * token when it started and goes on using it. The closing message names how
 * each kind is stopped — Ctrl+C in the foreground, `bridge stop` for one in the
 * background, `bridge uninstall` for the login service, which would otherwise
 * also come back at the next login and fail, with no token to read.
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
    console.log(chalk.gray('  A bridge that is running now keeps running until you stop it: Ctrl+C in'));
    console.log(chalk.gray('  its terminal, `devpilot bridge stop` if it was started in the background,'));
    console.log(chalk.gray('  `devpilot bridge uninstall` if it runs as the login service.'));
    console.log('');
  });
