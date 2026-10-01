import { Command } from 'commander';
import chalk from 'chalk';
import {
  bridgePaths,
  findOnPath,
  installService,
  realSystem,
  uninstallService,
  type ServiceKind,
} from './service';
import {
  displayPath,
  launchInput,
  printLogLines,
  printNoCredentials,
  printOtherBridges,
  printRefusal,
  shellJoin,
} from './background';

/**
 * `devpilot bridge install | uninstall` — the bridge as a login service.
 *
 * `start` survives a closed terminal and not a restart. This is the part that
 * survives a restart: a launchd LaunchAgent on macOS, a systemd user unit on
 * Linux. Both run `devpilot bridge connect` with the options given here, and
 * restart it if it exits.
 *
 * What is written, and how it is loaded, is in `service.ts`.
 */

const SERVICE_NAME: Record<ServiceKind, string> = {
  launchd: 'launchd LaunchAgent',
  systemd: 'systemd user unit',
};

function printUnsupported(platform: NodeJS.Platform): void {
  console.error(chalk.red(`✗ The login service is not supported on ${platform}`));
  console.error(chalk.gray('  It is written for launchd (macOS) and systemd (Linux).'));
  console.error(chalk.gray('  `devpilot bridge start` works here: it keeps the bridge running after the'));
  console.error(chalk.gray('  terminal closes, and needs running again after a restart.'));
}

const FORWARDED_HELP = `
Takes the same options as \`devpilot bridge connect\` (--repos, --plan, --name,
--no-observe, …); the service runs the bridge with them. \`--url\` and \`--token\`
are saved to ~/.devpilot/bridge.json and are not written into the service file.

The service does not inherit your shell's environment. Anything you set through
a DEVPILOT_* variable for \`connect\` has to be given here as a flag.`;

export const installCommand = new Command('install')
  .description('Install the bridge as a login service, so it starts again after a restart')
  .argument('[connect options...]', 'Options for `devpilot bridge connect`')
  .allowUnknownOption()
  .addHelpText('after', FORWARDED_HELP)
  .action(async (_forwarded: string[], _options: unknown, command: Command) => {
    const input = launchInput(command.args);
    const { home } = input.paths;
    const outcome = await installService(
      { ...input, claudePath: findOnPath('claude', process.env.PATH) },
      realSystem(),
    );

    switch (outcome.status) {
      case 'installed':
        console.log(chalk.green('✓ Bridge installed as a login service') + chalk.gray(` (${SERVICE_NAME[outcome.kind]})`));
        console.log(chalk.gray(`   ${displayPath(outcome.path, home)}`));
        console.log(chalk.gray(`   ${outcome.url}`));
        if (outcome.args.length > 0) console.log(chalk.gray(`   with: ${shellJoin(outcome.args)}`));
        if (outcome.savedCredentials) {
          console.log(chalk.gray(`   token saved in ${displayPath(input.paths.credentialsPath, home)}`));
        }
        console.log(chalk.gray(`   log:  ${displayPath(outcome.logPath, home)}`));
        console.log('');
        console.log(chalk.gray('   It is running now, starts at login, and is restarted if it exits.'));
        if (outcome.kind === 'systemd') {
          console.log(chalk.gray('   A user unit runs only while you are logged in. On a machine that should'));
          console.log(chalk.gray('   run it with nobody logged in: `loginctl enable-linger $USER`.'));
        }
        console.log(chalk.gray('   `devpilot bridge status` shows it; `devpilot bridge uninstall` removes it.'));
        printOtherBridges(outcome.others);
        return;

      case 'unsupported':
        printUnsupported(outcome.platform);
        break;

      case 'already-installed':
        console.error(chalk.red('✗ The login service is already installed'));
        console.error(chalk.gray(`  ${displayPath(outcome.path, home)}`));
        if (!outcome.loaded) console.error(chalk.gray('  It is not loaded right now; it would be at your next login.'));
        console.error(chalk.gray('  To change what it runs with: `devpilot bridge uninstall`, then install again.'));
        break;

      case 'background-running':
        console.error(chalk.red(`✗ A background bridge is running (pid ${outcome.pid})`));
        console.error(chalk.gray('  Two bridges on one machine would each report every session.'));
        console.error(chalk.gray('  Run `devpilot bridge stop`, then install.'));
        break;

      case 'no-credentials':
        printNoCredentials(outcome.url, 'install');
        break;

      case 'credentials-unwritable':
        console.error(chalk.red(`✗ Could not save the token to ${displayPath(outcome.path, home)}`));
        console.error(chalk.gray('  The service reads it from there. Check that the directory is writable.'));
        break;

      case 'invalid-args':
        printRefusal(outcome.message);
        break;

      case 'load-failed':
        console.error(chalk.red(`✗ ${outcome.kind === 'launchd' ? 'launchd' : 'systemd'} would not load the service. Nothing was installed.`));
        for (const line of outcome.message.split('\n')) console.error(chalk.gray(`   │ ${line}`));
        console.error(chalk.gray('  `devpilot bridge start` does not need it.'));
        break;

      case 'failed':
        console.error(
          chalk.red(
            outcome.reason === 'exited'
              ? '✗ The service loaded, but the bridge it started could not connect. It was removed again.'
              : '✗ The service loaded, but the bridge did not register within 30 seconds. It was removed again.',
          ),
        );
        printLogLines(outcome.lines);
        console.error(chalk.gray(`  Full log: ${displayPath(outcome.logPath, home)}`));
        break;
    }
    process.exitCode = 1;
  });

export const uninstallCommand = new Command('uninstall')
  .description('Stop the login service and remove it')
  .action(() => {
    const paths = bridgePaths();
    const outcome = uninstallService(paths, realSystem());

    if (outcome.status === 'unsupported') {
      printUnsupported(outcome.platform);
      process.exitCode = 1;
      return;
    }
    if (outcome.status === 'not-installed') {
      console.log(chalk.gray('The login service is not installed.'));
      console.log(chalk.gray(`  (nothing at ${displayPath(outcome.path, paths.home)})`));
      console.log(chalk.gray('  A bridge started with `devpilot bridge start` is stopped with `devpilot bridge stop`.'));
      return;
    }

    if (outcome.status === 'unload-failed') {
      console.error(chalk.red(`✗ ${outcome.kind === 'launchd' ? 'launchd' : 'systemd'} still has the service loaded. It was not removed.`));
      for (const line of outcome.message.split('\n')) console.error(chalk.gray(`   │ ${line}`));
      console.error(chalk.gray(`  ${displayPath(outcome.path, paths.home)}`));
      process.exitCode = 1;
      return;
    }

    console.log(chalk.green('✓ Login service removed') + chalk.gray(` (${SERVICE_NAME[outcome.kind]})`));
    console.log(chalk.gray(`   ${displayPath(outcome.path, paths.home)}`));
    console.log(chalk.gray('   The saved token is untouched; `devpilot bridge disconnect` forgets it.'));
  });
