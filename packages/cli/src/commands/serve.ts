import { Command } from 'commander';
import chalk from 'chalk';
import open from 'open';
import { spawn } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';

/**
 * Where the bundled cockpit lives inside the published package.
 *
 * Assembled by scripts/bundle-cockpit.mjs at publish time and listed in
 * package.json `files`. From a repo checkout it will be absent until someone
 * runs `pnpm --filter @devpilot.sh/cli bundle:cockpit`, which is why the
 * missing case below explains itself rather than just failing.
 */
function cockpitEntry(): string | null {
  /**
   * Candidates, not one path. tsup bundles every command into dist/cli.js, so
   * __dirname is <pkg>/dist — but that is a property of the bundler config, not
   * a fact. The first version hard-coded '../../ui/server.js' on the assumption
   * of dist/commands/serve.js and resolved to packages/ui, which does not exist;
   * the CLI then reported the bundle as missing when it was sitting right there.
   */
  for (const rel of ['../ui/server.js', '../../ui/server.js', './ui/server.js']) {
    const entry = resolve(__dirname, rel);
    if (existsSync(entry)) return entry;
  }
  return null;
}

export const serveCommand = new Command('serve')
  .description('Start the local DevPilot Conductor API server')
  .option('-p, --port <port>', 'Port to run the server on', '3847')
  .option('--no-open', 'Do not open browser automatically')
  .option('--sync', 'Enable cloud sync')
  .option('--db <path>', 'Path to SQLite database', '.devpilot/data.db')
  .option(
    '--orchestrator-mode <mode>',
    'Orchestrator mode: claude-session | ao-cli | http | disabled'
  )
  .option('--session-api-url <url>', 'claude-session dispatcher base URL')
  .option('--session-api-key <key>', 'claude-session dispatcher bearer token')
  .option('--ao-project <name>', 'ao-cli project name')
  .option('--ao-path <path>', 'Path to the ao binary')
  .option('--orchestrator-url <url>', 'Remote orchestrator base URL (http mode)')
  .action(async (options) => {
    const port = parseInt(options.port, 10);

    // Assemble orchestrator config from flags, falling back to env (§8.1).
    const orchestratorMode = options.orchestratorMode || process.env.DEVPILOT_ORCHESTRATOR_MODE;
    const orchestrator = orchestratorMode
      ? {
          mode: orchestratorMode as 'claude-session' | 'ao-cli' | 'http' | 'disabled',
          sessionApiUrl: options.sessionApiUrl || process.env.DEVPILOT_SESSION_API_URL,
          sessionApiKey: options.sessionApiKey || process.env.DEVPILOT_SESSION_API_KEY,
          sessionEnvironmentId: process.env.DEVPILOT_SESSION_ENVIRONMENT_ID,
          callbackToken: process.env.DEVPILOT_CALLBACK_TOKEN,
          aoProjectName: options.aoProject || process.env.DEVPILOT_AO_PROJECT,
          aoPath: options.aoPath || process.env.DEVPILOT_AO_PATH,
          httpUrl: options.orchestratorUrl || process.env.DEVPILOT_ORCHESTRATOR_URL,
          apiKey: process.env.DEVPILOT_ORCHESTRATOR_API_KEY,
        }
      : undefined;

    const dbPath = options.db.startsWith('/') ? options.db : join(process.cwd(), options.db);

    console.log(chalk.cyan('🚀 Starting DevPilot Conductor...'));
    console.log('');
    console.log(chalk.gray(`   Port: ${port}`));
    console.log(chalk.gray(`   Database: ${dbPath}`));
    console.log('');

    const dbDir = join(process.cwd(), '.devpilot');
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
      console.log(chalk.gray(`   Created: ${dbDir}`));
    }

    const entry = cockpitEntry();
    if (!entry) {
      console.error(chalk.red('✗ The cockpit bundle is missing from this install.'));
      console.error('');
      console.error(chalk.gray('  Expected: <package>/ui/server.js'));
      console.error(chalk.gray('  From a repo checkout, build it with:'));
      console.error(chalk.cyan('    pnpm --filter @devpilot.sh/cli bundle:cockpit'));
      console.error('');
      console.error(chalk.gray('  If you installed from npm, this is a packaging bug — please file'));
      console.error(chalk.gray('  an issue at https://github.com/geastham/devpilot/issues'));
      process.exit(1);
      return;
    }

    /**
     * The cockpit IS the server now.
     *
     * `serve` used to start a separate Fastify app that reimplemented the same
     * API over the same tables, and never served a UI at all. Running the
     * cockpit's own Next server means one API, one UI, one command — and the
     * wave-planner routes that Fastify never had come along for free.
     *
     * Config crosses the boundary as environment variables because that is what
     * a Next server reads; there is no argv to thread through.
     */
    const child = spawn(process.execPath, [entry], {
      stdio: ['ignore', 'pipe', 'inherit'],
      env: {
        ...process.env,
        PORT: String(port),
        HOSTNAME: '127.0.0.1',
        DEVPILOT_SQLITE_PATH: dbPath,
        ...(orchestrator?.mode ? { DEVPILOT_ORCHESTRATOR_MODE: orchestrator.mode } : {}),
        ...(orchestrator?.sessionApiUrl ? { DEVPILOT_SESSION_API_URL: orchestrator.sessionApiUrl } : {}),
        ...(orchestrator?.sessionApiKey ? { DEVPILOT_SESSION_API_KEY: orchestrator.sessionApiKey } : {}),
        ...(orchestrator?.aoProjectName ? { DEVPILOT_AO_PROJECT: orchestrator.aoProjectName } : {}),
        ...(orchestrator?.aoPath ? { DEVPILOT_AO_PATH: orchestrator.aoPath } : {}),
        ...(orchestrator?.httpUrl ? { DEVPILOT_ORCHESTRATOR_URL: orchestrator.httpUrl } : {}),
      },
    });

    const url = `http://127.0.0.1:${port}`;
    let opened = false;

    // Next prints its own ready line; wait for it rather than guessing with a
    // timer, so `--open` never races a server that is not listening yet.
    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      process.stdout.write(chalk.gray(text.replace(/^/gm, '   ')));

      if (!opened && /Ready in|started server|Local:/i.test(text)) {
        opened = true;
        console.log('');
        console.log(chalk.green('✓ Cockpit ready'));
        console.log('');
        console.log(chalk.cyan(`   ${url}`));
        console.log('');
        console.log(chalk.gray('   Press Ctrl+C to stop'));
        console.log('');
        if (options.open) void open(url);
      }
    });

    child.on('exit', (code) => {
      if (code && code !== 0) {
        console.error(chalk.red(`\n✗ Cockpit exited with code ${code}`));
      }
      process.exit(code ?? 0);
    });

    const stop = () => {
      child.kill('SIGTERM');
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  });
