import { Command } from 'commander';
import chalk from 'chalk';
import { resolve } from 'path';
import { SessionRunner } from './server';
import type { RunnerConfig } from './types';

export { SessionRunner } from './server';
export type { RunnerConfig } from './types';

/**
 * `devpilot session-runner` — the local execution engine for `claude-session`
 * orchestrator mode (TRD-01 §7.1).
 *
 * Run it beside `devpilot serve`:
 *
 *   devpilot session-runner --workspace ~/dev --token dp_local_dev
 *   DEVPILOT_ORCHESTRATOR_MODE=claude-session \
 *   DEVPILOT_SESSION_API_URL=http://127.0.0.1:3900 \
 *   DEVPILOT_SESSION_API_KEY=dp_local_dev \
 *   devpilot serve
 */
function parseRepoMap(values: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of values) {
    const idx = entry.indexOf('=');
    if (idx === -1) {
      throw new Error(`--repo expects <repo>=<path>, got '${entry}'`);
    }
    map.set(entry.slice(0, idx).trim(), resolve(entry.slice(idx + 1).trim()));
  }
  return map;
}

export const sessionRunnerCommand = new Command('session-runner')
  .description('Run Claude Code sessions dispatched by DevPilot (claude-session mode)')
  .option('-p, --port <port>', 'Port to listen on', '3900')
  .option('--host <host>', 'Interface to bind', '127.0.0.1')
  .option('--token <token>', 'Bearer token the dispatcher must present')
  .option('-w, --workspace <dir>', 'Directory containing repo checkouts', process.cwd())
  .option(
    '--repo <mapping>',
    'Explicit repo mapping, <owner/name>=<path> (repeatable)',
    (value: string, previous: string[]) => [...previous, value],
    [] as string[]
  )
  .option('--claude-path <path>', 'Path to the claude executable', 'claude')
  .option(
    '--permission-mode <mode>',
    'claude --permission-mode (acceptEdits | bypassPermissions | plan)',
    'acceptEdits'
  )
  .option('--max-concurrent <n>', 'Max simultaneous sessions before answering 429', '3')
  .option('--timeout <minutes>', 'Wall-clock cap per session', '30')
  .action(async (options) => {
    let repoMap: Map<string, string>;
    try {
      repoMap = parseRepoMap(options.repo ?? []);
    } catch (error) {
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exitCode = 1;
      return;
    }

    const config: RunnerConfig = {
      port: parseInt(options.port, 10),
      host: options.host,
      apiKey: options.token ?? process.env.DEVPILOT_SESSION_API_KEY,
      workspace: resolve(options.workspace),
      repoMap,
      claudePath: options.claudePath,
      permissionMode: options.permissionMode,
      maxConcurrent: parseInt(options.maxConcurrent, 10),
      timeoutMs: parseInt(options.timeout, 10) * 60_000,
      log: (line) => console.log(chalk.dim(`[runner] ${line}`)),
    };

    const runner = new SessionRunner(config);

    try {
      await runner.start();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Failed to start session runner: ${message}`));
      process.exitCode = 1;
      return;
    }

    const base = `http://${config.host}:${config.port}`;
    console.log(chalk.bold('\n  DevPilot session runner\n'));
    console.log(`  ${chalk.dim('listening')}   ${base}`);
    console.log(`  ${chalk.dim('workspace')}   ${config.workspace}`);
    console.log(`  ${chalk.dim('claude')}      ${config.claudePath} (${config.permissionMode})`);
    console.log(`  ${chalk.dim('concurrency')} ${config.maxConcurrent}`);
    if (repoMap.size > 0) {
      for (const [repo, path] of repoMap) console.log(`  ${chalk.dim('repo')}        ${repo} → ${path}`);
    }
    if (!config.apiKey) {
      console.log(chalk.yellow('\n  No --token set: the dispatcher API is unauthenticated.'));
    }
    console.log(chalk.dim('\n  Point DevPilot at it:'));
    console.log(
      chalk.dim(
        `    DEVPILOT_ORCHESTRATOR_MODE=claude-session DEVPILOT_SESSION_API_URL=${base} devpilot serve\n`
      )
    );

    const shutdown = async () => {
      console.log(chalk.dim('\n[runner] shutting down…'));
      await runner.stop();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
