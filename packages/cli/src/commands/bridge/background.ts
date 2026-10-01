import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { VERSION } from '../../version';
import {
  bridgePaths,
  readLogFrom,
  realSystem,
  redact,
  rotateLog,
  startBridge,
  stopBridge,
  tailLog,
  type LaunchInput,
} from './service';

/**
 * `devpilot bridge start | stop | logs` — the bridge without a terminal.
 *
 * The logic is in `service.ts` and returns what happened; this file is the
 * part that prints it. Each outcome a person can reach has its own message,
 * and every refusal names the command to run instead.
 */

/** `~/…` for a path under the home directory: shorter, and safe to paste into a bug report. */
export function displayPath(path: string, home: string): string {
  return path === home ? '~' : path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

/** Arguments as they would be typed, for showing what a bridge was started with. */
export function shellJoin(args: string[]): string {
  return args.map((arg) => (/^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`)).join(' ');
}

/**
 * What a background bridge is launched as: this node, this CLI, by absolute
 * path. Not `devpilot`: a login service starts with a PATH that does not
 * include wherever a global npm bin lives, and `start` records the same pair
 * so `status` can say which install is running.
 */
export function launchInput(args: string[]): LaunchInput {
  return {
    paths: bridgePaths(),
    args,
    node: process.execPath,
    script: resolve(process.argv[1] ?? 'devpilot'),
    env: process.env,
    cliVersion: VERSION,
  };
}

/** The lines a failed start or install shows from the log. */
export function printLogLines(lines: string[]): void {
  if (lines.length === 0) {
    console.error(chalk.gray('   (it wrote nothing to the log)'));
    return;
  }
  for (const line of lines) console.error(chalk.gray(`   │ ${line}`));
}

/** A refusal from `service.ts`: its first line is what was refused, the rest is why and what to do. */
export function printRefusal(message: string): void {
  const [first, ...rest] = message.split('\n');
  console.error(chalk.red(`✗ ${first}`));
  for (const line of rest) console.error(chalk.gray(`  ${line}`));
}

/**
 * Said after a successful `start` or `install` when another `bridge connect`
 * was already running — one left in a terminal, usually. Not a refusal: it
 * may be a bridge for a different deployment, and only the person knows.
 */
export function printOtherBridges(pids: number[]): void {
  if (pids.length === 0) return;
  const which = pids.length === 1 ? `pid ${pids[0]} is` : `pids ${pids.join(', ')} are`;
  console.log('');
  console.log(chalk.yellow(`   ⚠ ${which} also running \`devpilot bridge connect\` on this machine`));
  console.log(chalk.gray('     — started in a terminal, or by something other than this command. If it'));
  console.log(chalk.gray('     connects to the same bridge, stop it: two bridges each report every session.'));
}

export function printNoCredentials(url: string | undefined, command: 'start' | 'install'): void {
  if (url) {
    console.error(chalk.red(`✗ No token is saved for ${url}`));
  } else {
    console.error(chalk.red('✗ No bridge credentials are saved on this machine'));
  }
  console.error(chalk.gray('  Mint a token in the dashboard under Settings → Tokens, then:'));
  console.error(chalk.gray(`    devpilot bridge ${command} --token <token>`));
  console.error(chalk.gray('  It is saved to ~/.devpilot/bridge.json (readable by you only) and is not'));
  console.error(chalk.gray('  passed on the command line of the bridge that is started.'));
}

const FORWARDED_HELP = `
Takes the same options as \`devpilot bridge connect\` (--repos, --plan, --name,
--no-observe, …) and starts the bridge with them. \`--url\` and \`--token\` are
saved to ~/.devpilot/bridge.json and are not passed on.`;

export const startCommand = new Command('start')
  .description('Start the bridge in the background, detached from this terminal')
  .argument('[connect options...]', 'Options for `devpilot bridge connect`')
  // The options belong to `connect`, not to this command: they are taken as
  // typed and handed on, so a flag `connect` gains later needs nothing here.
  .allowUnknownOption()
  .addHelpText('after', FORWARDED_HELP)
  .action(async (_forwarded: string[], _options: unknown, command: Command) => {
    const input = launchInput(command.args);
    const { home } = input.paths;
    const outcome = await startBridge(input, realSystem());

    switch (outcome.status) {
      case 'started':
        console.log(chalk.green(`✓ Bridge started in the background`) + chalk.gray(` (pid ${outcome.pid})`));
        console.log(chalk.gray(`   ${outcome.url}`));
        if (outcome.args.length > 0) console.log(chalk.gray(`   with: ${shellJoin(outcome.args)}`));
        if (outcome.savedCredentials) {
          console.log(chalk.gray(`   token saved in ${displayPath(input.paths.credentialsPath, home)}`));
        }
        console.log(chalk.gray(`   log:  ${displayPath(outcome.logPath, home)}`));
        console.log('');
        console.log(chalk.gray('   It keeps running after this terminal closes, until the machine restarts or'));
        console.log(chalk.gray('   you run `devpilot bridge stop`. To have it start at login as well, stop it'));
        console.log(chalk.gray('   and run `devpilot bridge install`.'));
        printOtherBridges(outcome.others);
        return;

      case 'already-running':
        console.error(chalk.red(`✗ A background bridge is already running (pid ${outcome.pid}, since ${outcome.startedAt})`));
        console.error(chalk.gray('  `devpilot bridge status` shows what it was started with.'));
        console.error(chalk.gray('  `devpilot bridge stop` stops it, if you want to start it differently.'));
        break;

      case 'service-installed':
        console.error(
          chalk.red(
            outcome.loaded
              ? '✗ The login service is installed and already runs the bridge'
              : '✗ The login service is installed, and will run the bridge at your next login',
          ),
        );
        console.error(chalk.gray(`  ${displayPath(outcome.path, home)}`));
        console.error(chalk.gray('  Two bridges on one machine would each report every session.'));
        console.error(chalk.gray('  `devpilot bridge status` shows it; `devpilot bridge uninstall` removes it,'));
        console.error(chalk.gray('  after which `devpilot bridge start` works.'));
        break;

      case 'no-credentials':
        printNoCredentials(outcome.url, 'start');
        break;

      case 'credentials-unwritable':
        console.error(chalk.red(`✗ Could not save the token to ${displayPath(outcome.path, home)}`));
        console.error(chalk.gray('  A background bridge reads it from there. Check that the directory is writable.'));
        break;

      case 'invalid-args':
        printRefusal(outcome.message);
        break;

      case 'spawn-failed':
        console.error(chalk.red(`✗ Could not start ${outcome.node}`));
        break;

      case 'failed':
        console.error(
          chalk.red(
            outcome.reason === 'exited'
              ? '✗ The bridge exited instead of connecting. Nothing is running.'
              : '✗ The bridge did not register within 30 seconds, so it was stopped. Nothing is running.',
          ),
        );
        printLogLines(outcome.lines);
        console.error(chalk.gray(`  Full log: ${displayPath(outcome.logPath, home)}`));
        console.error(chalk.gray('  `devpilot bridge connect` with the same options shows the same thing in the foreground.'));
        break;
    }
    process.exitCode = 1;
  });

export const stopCommand = new Command('stop')
  .description('Stop the bridge that `devpilot bridge start` started')
  .action(async () => {
    const outcome = await stopBridge(bridgePaths(), realSystem());

    switch (outcome.status) {
      case 'stopped':
        console.log(chalk.green('✓ Bridge stopped') + chalk.gray(` (pid ${outcome.pid})`));
        if (outcome.forced) {
          console.log(chalk.yellow('   It did not exit within 10 seconds of being asked and was killed.'));
          console.log(chalk.gray('   A run that was in flight may not have reported how it ended.'));
        }
        return;

      case 'not-running':
        if (outcome.stalePid) {
          console.log(chalk.gray(`No bridge is running. The one recorded (pid ${outcome.stalePid}) had already exited;`));
          console.log(chalk.gray('the record was cleared.'));
        } else {
          console.log(chalk.gray('No background bridge is running.'));
        }
        return;

      case 'not-ours':
        console.log(chalk.gray(`No bridge is running. Pid ${outcome.pid} was recorded, but that number now belongs`));
        console.log(chalk.gray('to another process, which was left alone. The record was cleared.'));
        return;

      case 'service-managed':
        console.log(chalk.gray('No background bridge is running — the login service is running the bridge.'));
        console.log(chalk.gray('`devpilot bridge uninstall` stops it and removes the service.'));
        return;

      case 'still-running':
        console.error(chalk.red(`✗ Pid ${outcome.pid} is still running after SIGKILL.`));
        process.exitCode = 1;
        return;
    }
  });

export const logsCommand = new Command('logs')
  .description('Print the background bridge’s log')
  .option('-f, --follow', 'Keep printing as the bridge writes')
  .option('-n, --lines <n>', 'How many lines to print', '50')
  .action(async (options: { follow?: boolean; lines: string }) => {
    const paths = bridgePaths();
    // The only bridge command a long-running service's owner is likely to
    // run again, so it is also where the log gets a chance to be capped.
    rotateLog(paths.logPath);

    if (!existsSync(paths.logPath)) {
      console.log(chalk.gray(`No log yet at ${displayPath(paths.logPath, paths.home)}.`));
      console.log(chalk.gray('It is written by `devpilot bridge start` and by the login service.'));
      if (!options.follow) return;
    }

    const count = Math.max(0, parseInt(options.lines, 10) || 0);
    for (const line of tailLog(paths.logPath, count)) console.log(line);
    if (!options.follow) return;

    let offset = existsSync(paths.logPath) ? statSync(paths.logPath).size : 0;
    setInterval(() => {
      // `readLogFrom` starts over from the top when the file is shorter than
      // the offset — which is what a rotation looks like from here.
      const next = readLogFrom(paths.logPath, offset);
      offset = next.offset;
      if (next.text) process.stdout.write(redact(next.text));
    }, 500);
    await new Promise<never>(() => {});
  });
