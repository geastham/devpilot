import { Command } from 'commander';
import chalk from 'chalk';
import { bridgePaths, bridgeStatus, realSystem, rotateLog, type BridgeStatus } from './service';
import { displayPath, shellJoin } from './background';

/**
 * `devpilot bridge status` — is this machine being watched, and by what.
 *
 * This used to ask the hosted side: it required `--bridge-url`, called
 * `/health` and `/api/orchestrators/:id`, and sent an "API key". The bridge has
 * neither route and no such credential, so the command could only ever fail.
 *
 * The question a person has is local anyway. The cockpit already shows whether
 * the hosted side has heard from this machine; what it cannot show is why not
 * — no token saved, nothing running, a service that was never installed, or a
 * bridge that is running and logging an error. All of that is on this machine,
 * needs no flags, and needs no network.
 *
 * The exit code is the answer to "is a bridge running?": 0 yes, 1 no. A script
 * can branch on it without parsing anything.
 */

/** "3h 12m" — how long ago an ISO timestamp was. */
function ago(iso: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (Number.isNaN(seconds)) return '';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function printStatus(status: BridgeStatus, home: string): void {
  const label = (text: string) => chalk.gray(text.padEnd(15));
  const short = (path: string) => displayPath(path, home);
  const next = (text: string) => console.log(' '.repeat(17) + chalk.gray(text));

  console.log(chalk.cyan('🌉 DevPilot bridge'));
  console.log('');

  // Credentials: where, and for which bridge. Never the token itself.
  if (status.credentials.saved) {
    console.log(`  ${label('Credentials')}saved for ${chalk.white(status.credentials.url)}`);
    next(short(status.credentials.path));
  } else {
    console.log(`  ${label('Credentials')}${chalk.yellow('none saved')}`);
    next('`devpilot bridge start --token <token>` saves one and starts the bridge');
  }

  if (status.running) {
    const how = status.managedBy === 'service' ? 'under the login service' : 'in the background';
    const since = status.since ? `, up ${ago(status.since)} (since ${status.since})` : '';
    console.log(`  ${label('Bridge')}${chalk.green('running')} ${how} — pid ${status.pid}${since}`);
    if (status.args) next(status.args.length > 0 ? `started with: ${shellJoin(status.args)}` : 'started with no options');
  } else {
    console.log(`  ${label('Bridge')}${chalk.red('not running')}`);
    if (status.stale) {
      next(`the one started ${status.stale.startedAt} (pid ${status.stale.pid}) has exited — the log below says why`);
    }
    if (status.service.installed && status.service.loaded) {
      // Loaded with no process: the bridge keeps exiting and is between restarts.
      next('the login service is loaded but has no process: it is exiting and being restarted');
    } else if (!status.service.installed) {
      next('`devpilot bridge start` starts it; `devpilot bridge install` also starts it at every login');
    }
  }

  if (status.unmanaged.length > 0) {
    const pids = status.unmanaged.join(', ');
    console.log(`  ${label('Other bridge')}${chalk.yellow(`pid ${pids}`)} — \`bridge connect\` started some other way (a terminal, usually)`);
    next('not counted above, and not stopped by `devpilot bridge stop`: stop it where it was started');
  }

  const service = status.service;
  if (!service.supported) {
    console.log(`  ${label('Login service')}not supported on this platform (\`devpilot bridge start\` still works)`);
  } else if (!service.installed) {
    console.log(`  ${label('Login service')}not installed`);
  } else {
    const state = service.loaded ? chalk.green('installed and loaded') : chalk.yellow('installed, not loaded');
    console.log(`  ${label('Login service')}${state} (${service.kind})`);
    next(short(service.path!));
    if (!service.loaded) next('it loads at the next login; `devpilot bridge uninstall` removes it');
  }

  console.log(`  ${label('Log')}${short(status.log.path)}${status.log.exists ? '' : chalk.gray(' (nothing written yet)')}`);
  if (status.log.tail.length > 0) {
    console.log('');
    for (const line of status.log.tail) console.log(chalk.gray(`    │ ${line}`));
    console.log(chalk.gray('    `devpilot bridge logs -f` follows it'));
  }
  console.log('');
}

export const statusCommand = new Command('status')
  .description('Show whether a bridge is running on this machine, and how')
  .option('--json', 'Print the status as JSON')
  .action((options: { json?: boolean }) => {
    const paths = bridgePaths();
    rotateLog(paths.logPath);
    const status = bridgeStatus(paths, realSystem());

    if (options.json) console.log(JSON.stringify(status, null, 2));
    else printStatus(status, paths.home);

    // Set, not `process.exit`: the output above may still be in a pipe.
    process.exitCode = status.running ? 0 : 1;
  });
