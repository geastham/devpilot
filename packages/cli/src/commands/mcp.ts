import { Command } from 'commander';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import chalk from 'chalk';
import { z } from 'zod';
import { connectStdio, createServer } from '@devpilot.sh/mcp-session';
import { createRepoTools, defaultRepoDeps } from './mcp/repo-tools';

const execFileAsync = promisify(execFile);

/**
 * `devpilot mcp` — DevPilot as a tool server inside a coding session.
 *
 * One local server for an agent working on this machine: the shared-session
 * tools (make a link for someone to join, read and post), work history, and
 * the repository tools — set this repository up, sync its code graph, ask what
 * a change would reach. It runs here, in the session's directory, with this
 * machine's credentials; the hosted MCP server at devpilot.sh is the other
 * one, for an assistant that is not on a machine at all.
 */
const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] });
const failing = (run: () => Promise<string>) => async () => {
  try {
    return text(await run());
  } catch (error) {
    return { ...text(`That did not work: ${error instanceof Error ? error.message.slice(0, 600) : String(error)}`), isError: true };
  }
};

/** The server Claude Code is given. Exported for tests. */
export function buildServer(env: NodeJS.ProcessEnv = process.env) {
  const server = createServer({ env });
  const named = (env.DEVPILOT_MCP_TOOLS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  // A runner that names its groups gets exactly those; see `toolGroups`.
  if (named.length > 0 && !named.includes('repo')) return server;

  const repo = createRepoTools(defaultRepoDeps(env));

  server.registerTool(
    'devpilot_repo_status',
    {
      title: 'Is this repository set up with DevPilot',
      description:
        'Whether the repository this session is in is set up with DevPilot: is the machine connected, is there a ' +
        'code graph index and how fresh, and is the graph shared with the hosted plane. Changes nothing.',
      inputSchema: {},
    },
    failing(() => repo.status()),
  );

  server.registerTool(
    'devpilot_repo_init',
    {
      title: 'Set this repository up with DevPilot',
      description:
        'Set up the repository this session is in: build (or refresh) its code graph index, locally. With ' +
        '`share: true`, also send the graph\'s structure — file paths, symbol names and which refers to which, never ' +
        'file contents — to the hosted plane and keep it current. Pass `share: true` ONLY when the user has asked ' +
        'for the graph to be shared; without it nothing leaves the machine and the result says what sharing would send.',
      inputSchema: { share: z.boolean().optional().describe('Also share the graph with the hosted plane. Only when the user asked.') },
    },
    (input) => failing(() => repo.init(input))(),
  );

  server.registerTool(
    'devpilot_graph_sync',
    {
      title: 'Bring the code graph up to date',
      description:
        'Re-index what changed on disk in this repository, and if its graph is shared and the checkout is on the ' +
        'default branch, send the difference to the hosted plane. Use after a batch of edits, before asking ' +
        'devpilot_code_impact about them.',
      inputSchema: {},
    },
    failing(() => repo.sync()),
  );

  server.registerTool(
    'devpilot_code_impact',
    {
      title: 'What a change to these files would reach',
      description:
        'Before changing files, ask the local code graph what depends on them (within two steps) and which test ' +
        'files reach them. Pass repo-relative paths. Local only: nothing is sent anywhere. Pair with ' +
        'devpilot_history for what earlier tasks did to the same files.',
      inputSchema: { paths: z.array(z.string().max(500)).min(1).max(20).describe('Repo-relative file paths.') },
    },
    (input) => failing(() => repo.impact(input))(),
  );

  return server;
}

export const mcpCommand = new Command('mcp')
  .description('Run DevPilot as an MCP server for a coding agent on this machine (stdio)')
  .action(async () => {
    await connectStdio(buildServer());
  });

mcpCommand
  .command('install')
  .description('Add the DevPilot MCP server to Claude Code')
  .option('-s, --scope <scope>', 'user (every project), project (.mcp.json) or local (this project, just you)', 'user')
  .action(async (options: { scope: string }) => {
    if (!['user', 'project', 'local'].includes(options.scope)) {
      console.error(chalk.red('--scope must be user, project or local.'));
      process.exitCode = 1;
      return;
    }
    const args = ['mcp', 'add', '--scope', options.scope, 'devpilot-local', '--', 'devpilot', 'mcp'];
    try {
      await execFileAsync('claude', args, { timeout: 30_000 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/already exists/i.test(message)) {
        console.log(chalk.gray('Already added. `claude mcp remove devpilot-local` first to change its scope.'));
        return;
      }
      console.error(chalk.red('Could not add it through the `claude` command.'));
      console.log('  Run this yourself where you use Claude Code:');
      console.log(chalk.cyan(`    claude ${args.join(' ')}`));
      process.exitCode = 1;
      return;
    }
    console.log(chalk.green('Added to Claude Code as `devpilot-local`.'));
    console.log(chalk.gray('  New sessions have it; `/mcp` in a session shows it. It runs on this machine, in the'));
    console.log(chalk.gray('  session\'s directory, and can:'));
    console.log('  · make a link that brings someone into a shared, end-to-end encrypted session');
    console.log('  · set a repository up and keep its code graph current');
    console.log('  · say what a change to a file would reach, and what earlier tasks did to it');
  });
