import os from 'os';
import { Command } from 'commander';
import chalk from 'chalk';
import { SharedSessionClient } from '@devpilot.sh/bridge-client';

/**
 * `devpilot session join <url>` — TRD 06 §6.3.
 *
 * Joins, posts an optional opening message, and prints the roster. For a live
 * view use `devpilot session tail`.
 */
export const joinCommand = new Command('join')
  .description('Join a shared session by link and post a message')
  .argument('<url>', 'Join link, including the #k=… fragment')
  .option('-n, --name <name>', 'Display name in the transcript', os.hostname())
  .option('-m, --message <text>', 'Post this message after joining')
  .action(async (url: string, options: { name: string; message?: string }) => {
    try {
      const client = await SharedSessionClient.join({ link: url, displayName: options.name });
      const s = client.session;

      console.log(chalk.cyan(`\n  ${s.title}`));
      console.log(chalk.gray(`  mode: ${s.mode}  ·  messages: ${s.lastSeq ?? 0}\n`));

      if (options.message) {
        const posted = await client.post(options.message);
        console.log(chalk.green(`  posted #${posted.seq}\n`));
      }

      const participants = await client.who();
      for (const p of participants) {
        const agent = p.agentKind ? chalk.gray(` [${p.agentKind}]`) : '';
        console.log(`  · ${p.displayName}${agent}${p.leftAt ? chalk.gray(' (left)') : ''}`);
      }
      console.log('');
    } catch (err) {
      // Never echo the link back: it contains the key, and shell history and
      // terminal recordings both outlive the session.
      console.error(chalk.red(`✗ ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });
