import os from 'os';
import { Command } from 'commander';
import chalk from 'chalk';
import { BridgeClient, DispatchLoop, HeartbeatService } from '@devpilot.sh/bridge-client';
import { createBridgeDispatchHandler } from './dispatch-handler';
import { createConductorDispatchHandler } from './conductor-handler';
import { ConductorWatcher } from './conductor-watcher';

interface ConnectOptions {
  url?: string;
  token?: string;
  name: string;
  repos?: string;
  mode: 'ao-cli' | 'http' | 'claude-session';
  transport: 'realtime' | 'poll';
  sessionApiUrl?: string;
  sessionApiKey?: string;
  plan?: boolean;
  cockpitUrl?: string;
  maxJobs: string;
  httpUrl?: string;
  aoProject?: string;
  aoPath?: string;
}

export const connectCommand = new Command('connect')
  .description('Connect this machine to a DevPilot bridge and run dispatched work locally')
  .option('-u, --url <url>', 'Bridge URL', process.env.DEVPILOT_BRIDGE_URL)
  .option('-t, --token <token>', 'Orchestrator token (dp_orch_…)', process.env.DEVPILOT_BRIDGE_TOKEN)
  .option('-n, --name <name>', 'Name for this machine', os.hostname())
  .option('-r, --repos <repos>', 'Comma-separated repos this machine handles')
  // Default is `http`: ao-cli is deprecated and throws (see ao-cli-adapter.ts),
  // and http is the mode that points at the current ao daemon on :3001.
  .option('-m, --mode <mode>', 'Local orchestrator mode (http|claude-session)', 'http')
  .option(
    '--transport <transport>',
    'realtime | poll — polling is fully correct, just higher latency',
    process.env.DEVPILOT_BRIDGE_TRANSPORT || 'realtime',
  )
  .option('-j, --max-jobs <n>', 'Max concurrent local jobs', '4')
  .option('--http-url <url>', 'Orchestrator URL (required for --mode http)')
  .option('--ao-project <name>', 'ao project name (for --mode ao-cli)')
  .option('--ao-path <path>', 'Path to the ao binary (default: ao on PATH)')
  .option(
    '--session-api-url <url>',
    'Session runner URL (required for --mode claude-session)',
    process.env.DEVPILOT_SESSION_API_URL,
  )
  .option(
    '--session-api-key <token>',
    'Bearer token the session runner expects',
    process.env.DEVPILOT_SESSION_API_KEY,
  )
  // Off by default: planning a ticket costs a model call and stops at a human
  // review gate, which is a different contract from "run this ticket now".
  // Opt in per machine until the planned path is the one you want by default.
  .option(
    '--plan',
    'Route dispatches through the conductor (plan → waves) instead of one session',
    process.env.DEVPILOT_BRIDGE_PLAN === 'true',
  )
  .option(
    '--cockpit-url <url>',
    'Local cockpit base URL for --plan',
    process.env.DEVPILOT_COCKPIT_URL || 'http://127.0.0.1:3000',
  )
  .action(async (options: ConnectOptions) => {
    if (!options.url) {
      console.error(chalk.red('✗ Bridge URL required (--url or DEVPILOT_BRIDGE_URL)'));
      process.exit(1);
    }
    if (!options.token) {
      console.error(chalk.red('✗ Token required (--token or DEVPILOT_BRIDGE_TOKEN)'));
      console.error(chalk.gray('  Mint one in the dashboard under Settings → Tokens.'));
      process.exit(1);
    }

    const repos = options.repos?.split(',').map((r) => r.trim()).filter(Boolean) ?? [];
    const maxConcurrentJobs = Math.max(1, parseInt(options.maxJobs, 10) || 4);

    console.log(chalk.cyan('🌉 DevPilot bridge'));
    console.log(chalk.gray(`   ${options.url}`));
    console.log(chalk.gray(`   machine: ${options.name}`));
    console.log('');

    // --plan routes dispatches to the local cockpit, which builds its own
    // orchestrator config from env. The local orchestrator mode is therefore
    // unused on that path, and demanding --http-url for it blocks the planned
    // flow with a message about a daemon it will never contact.
    const usesLocalOrchestrator = !options.plan;

    if (usesLocalOrchestrator && options.mode === 'ao-cli') {
      console.error(chalk.red('✗ --mode ao-cli is deprecated and non-functional.'));
      console.error(chalk.gray('  `ao` is now a daemon on 127.0.0.1:3001; point http mode at it:'));
      console.error(chalk.gray('    devpilot bridge connect --mode http --http-url http://127.0.0.1:3001'));
      process.exit(1);
    }
    if (usesLocalOrchestrator && options.mode === 'http' && !options.httpUrl) {
      console.error(chalk.red('✗ --mode http requires --http-url'));
      console.error(chalk.gray('  For the ao daemon: --http-url http://127.0.0.1:3001'));
      process.exit(1);
    }
    if (usesLocalOrchestrator && options.mode === 'claude-session' && !options.sessionApiUrl) {
      console.error(chalk.red('✗ --mode claude-session requires --session-api-url'));
      console.error(chalk.gray('  Start the runner, then point at it:'));
      console.error(chalk.gray('    devpilot session-runner --port 3900 --token <t>'));
      console.error(chalk.gray('    … --session-api-url http://127.0.0.1:3900 --session-api-key <t>'));
      process.exit(1);
    }

    const client = new BridgeClient({ bridgeUrl: options.url, token: options.token });

    let registration;
    try {
      registration = await client.register({ name: options.name, repos, maxConcurrentJobs });
    } catch (err) {
      console.error(chalk.red('✗ Registration failed'));
      console.error(chalk.red(`   ${err instanceof Error ? err.message : err}`));
      process.exit(1);
    }

    console.log(chalk.green('✓ Registered'));
    console.log(chalk.gray(`   orchestrator: ${registration.orchestratorId}`));
    console.log(chalk.gray(`   repos: ${repos.join(', ') || '(none)'}`));
    if (repos.length === 0) {
      console.log(chalk.yellow('   ⚠ No repos specified — nothing can route to this machine.'));
      console.log(chalk.gray('     Re-run with --repos owner/name to receive dispatches.'));
    }
    console.log('');

    // The bridge returns realtime credentials only when it can mint a scoped
    // JWT. If it could not, or the user asked for polling, we poll — which is
    // fully correct, because the delivery guarantee is in the queue table.
    const useRealtime = options.transport !== 'poll' && registration.realtime !== null;
    if (options.transport !== 'poll' && !registration.realtime) {
      console.log(chalk.yellow('   Realtime unavailable from this bridge — polling instead.'));
    }

    // Reports a finished conductor run to the bridge, which is what makes the
    // hosted side write back to Linear. Only the planned path needs it: the
    // single-session path reports through the orchestrator's status poller.
    const conductorWatcher = options.plan
      ? new ConductorWatcher({
          client,
          cockpitUrl: options.cockpitUrl!,
          onLog: (line) => console.log(chalk.blue(`   ${line}`)),
          onLost: (run) =>
            console.log(
              chalk.yellow(
                `   ${run.linearIdentifier} was still running at shutdown — Linear will not be updated for it`,
              ),
            ),
        })
      : null;

    const loop = new DispatchLoop({
      client,
      orchestratorId: registration.orchestratorId,
      realtime: useRealtime && registration.realtime
        ? {
            supabaseUrl: registration.realtime.supabaseUrl,
            anonKey: registration.realtime.anonKey,
            jwt: registration.realtime.jwt,
          }
        : null,
      maxConcurrent: maxConcurrentJobs,
      handler: options.plan
        ? createConductorDispatchHandler({
            client,
            cockpitUrl: options.cockpitUrl!,
            watcher: conductorWatcher!,
            onLog: (line) => console.log(chalk.blue(`   ${line}`)),
          })
        : createBridgeDispatchHandler({
            client,
            orchestratorMode: options.mode,
            httpUrl: options.httpUrl,
            sessionApiUrl: options.sessionApiUrl,
            sessionApiKey: options.sessionApiKey,
            aoProjectName: options.aoProject,
            aoPath: options.aoPath,
            onLog: (line) => console.log(chalk.blue(`   ${line}`)),
          }),
      onLog: (line) => console.log(chalk.gray(`   ${line}`)),
      onError: (e) => console.log(chalk.yellow(`   ${e.message}`)),
    });

    const heartbeat = new HeartbeatService({
      client,
      activeJobs: () => loop.activeJobs,
      onError: (e) => console.log(chalk.gray(`   heartbeat: ${e.message}`)),
    });

    await loop.start();
    heartbeat.start();

    console.log(chalk.green(`✓ Listening (${useRealtime ? 'realtime' : 'poll'})`));
    console.log(chalk.gray('   Agents run on THIS machine. Ctrl+C to disconnect.'));
    console.log('');

    let shuttingDown = false;
    const shutdown = async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log('');
      console.log(chalk.yellow('Disconnecting…'));
      heartbeat.stop();
      // Before the loop: stopping surfaces any run still in flight via onLost,
      // and that warning is the only signal that a ticket's completion will
      // never reach Linear.
      conductorWatcher?.stop();
      await loop.stop();
      console.log(chalk.green('✓ Disconnected'));
      process.exit(0);
    };

    process.on('SIGINT', () => void shutdown());
    process.on('SIGTERM', () => void shutdown());

    await new Promise<never>(() => {});
  });
