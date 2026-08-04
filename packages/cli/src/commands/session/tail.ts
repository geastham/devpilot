import os from 'os';
import { Command } from 'commander';
import chalk from 'chalk';
import { SharedSessionClient, type TranscriptEntry } from '@devpilot.sh/bridge-client';

/**
 * `devpilot session tail <url>` — TRD 06 §6.3.
 *
 * Polls for new messages by `seq` and decrypts locally.
 *
 * POLLING, not Realtime, and that is not a stopgap: TRD 05 established that the
 * durable table is the delivery guarantee and Realtime is a latency
 * optimisation. `?since=<seq>` cannot miss a message or deliver one twice,
 * which a dropped websocket can. Realtime for session_messages was
 * deliberately not wired in Wave 2 and has never connected in this project.
 */
export const tailCommand = new Command('tail')
  .description('Follow a shared session transcript in the terminal')
  .argument('<url>', 'Join link, including the #k=… fragment')
  .option('-n, --name <name>', 'Display name in the transcript', os.hostname())
  .option('-i, --interval <seconds>', 'Poll interval', '3')
  .action(async (url: string, options: { name: string; interval: string }) => {
    const intervalMs = Math.max(1, parseInt(options.interval, 10) || 3) * 1000;

    let client: SharedSessionClient;
    try {
      client = await SharedSessionClient.join({ link: url, displayName: options.name });
    } catch (err) {
      console.error(chalk.red(`✗ ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
      return;
    }

    const names = new Map<string, string>();
    for (const p of await client.who()) names.set(p.id, p.displayName);

    console.log(chalk.cyan(`\n  ${client.session.title}`));
    console.log(chalk.gray(`  following · ctrl-c to stop\n`));

    let cursor = 0;
    let stopped = false;
    process.on('SIGINT', () => {
      stopped = true;
      console.log(chalk.gray('\n  stopped\n'));
      process.exit(0);
    });

    while (!stopped) {
      try {
        const { entries, latestSeq } = await client.read(cursor);

        if (entries.length > 0) {
          // Refresh names only when someone unknown appears, rather than every
          // tick: the roster is a second request and this loop runs forever.
          if (entries.some((e) => e.participantId && !names.has(e.participantId))) {
            for (const p of await client.who()) names.set(p.id, p.displayName);
          }
          for (const e of entries) console.log(format(e, names));
          cursor = latestSeq;
        }
      } catch (err) {
        // Keep following. A transient network failure must not end a tail the
        // user left running — the seq cursor means nothing is missed on resume.
        console.error(chalk.gray(`  … ${err instanceof Error ? err.message : String(err)}`));
      }

      await new Promise((r) => setTimeout(r, intervalMs));
    }
  });

function format(e: TranscriptEntry, names: Map<string, string>): string {
  const who = e.participantId ? (names.get(e.participantId) ?? e.participantId) : 'system';
  const seq = chalk.gray(`#${String(e.seq).padStart(3)}`);

  if (e.status === 'system') {
    const reason = e.systemNotice?.reason ? ` (${e.systemNotice.reason})` : '';
    return `  ${seq} ${chalk.yellow(`⚙ ${e.systemNotice?.type ?? e.text}${reason}`)}`;
  }
  if (e.status === 'undecryptable') {
    // Shown, not skipped. A transcript with silent holes is worse than one with
    // visible ones — the reader would not know to go looking.
    return `  ${seq} ${chalk.gray(`${who}: <sealed under an earlier key — not readable with this link>`)}`;
  }
  return `  ${seq} ${chalk.bold(who)}: ${e.text}`;
}
