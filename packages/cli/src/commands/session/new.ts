import os from 'os';
import { Command } from 'commander';
import chalk from 'chalk';
import {
  buildSessionHandoff,
  INTENT_MODE,
  SESSION_INTENTS,
  SESSION_LIFETIMES,
  SESSION_LIMITS,
  type SessionIntent,
  type SessionLifetime,
} from '@devpilot.sh/bridge-protocol';
import { adoption } from '@devpilot.sh/core';
import {
  DEFAULT_BRIDGE_URL,
  SharedSessionClient,
  resolveBridgeCredentials,
} from '@devpilot.sh/bridge-client';

interface NewOptions {
  url?: string;
  token?: string;
  issue?: string;
  mode?: string;
  intent: string;
  lifetime?: string;
  budget?: string;
  minutes?: string;
  name: string;
  message?: string;
  linkOnly?: boolean;
}

const MODES = ['observe', 'relay', 'auto'] as const;
type Mode = (typeof MODES)[number];

/**
 * `devpilot session new "…"` — TRD 06 §6.3.
 *
 * The key is generated HERE and never sent. What goes to the bridge is
 * sha256(verifier), where the verifier is a separate HKDF branch that cannot
 * decrypt anything. The bridge stores that hash and nothing else, which is why
 * it can host the transcript without being able to read it.
 *
 * ## What changed, and why
 *
 * This needed three things typed out every time — `--url`, `--token` and
 * `--org <orgId>` — on a machine that was already connected. The org was the
 * worst of them: the bridge takes it from the token and only used the flag to
 * check that it matched, and nothing in the product shows an org id to copy.
 * So the credentials come from wherever `bridge connect` left them, and the
 * org is not asked for at all.
 *
 * It also printed a bare link and "others join with: devpilot session join",
 * which assumes the other person has this CLI and knows what to do with a
 * link. It now prints the message to send them — the same one the Claude Code
 * tool puts on the clipboard, from the same builder.
 */
export const newCommand = new Command('new')
  .description('Create a shared session and print the message to send your teammate')
  .argument('<title>', 'What this session is about (stored in plaintext — no secrets)')
  .option('-u, --url <url>', 'Bridge URL (defaults to the one this machine is connected to)')
  .option('-t, --token <token>', 'Machine token (defaults to the one this machine is connected with)')
  .option('--issue <identifier>', 'Linear issue identifier to attach, e.g. ENG-394')
  .option(
    '--intent <intent>',
    'Why someone is being asked in: look (come and see) | pair (work it through) | fix (the agents sort it out, bounded)',
    'look',
  )
  .option('--lifetime <lifetime>', 'How long it lasts before it ends and its messages are deleted: 1h | 24h | 7d (default 24h)')
  .option(
    '--mode <mode>',
    'Override the mode the intent sets: observe (agents post only when asked) | relay | auto (agents may reply, bounded)',
  )
  .option('--budget <n>', `Agent messages allowed in auto mode (default ${SESSION_LIMITS.autoDefaultBudget})`)
  .option('--minutes <n>', `Minutes auto mode lasts (default ${SESSION_LIMITS.autoDefaultTtlMinutes})`)
  .option('-n, --name <name>', 'Your display name in the transcript', os.hostname())
  .option('-m, --message <text>', 'Post this as the first message (encrypted)')
  .option('--link-only', 'Print just the join link, for scripts')
  .action(async (title: string, options: NewOptions) => {
    const credentials = resolveBridgeCredentials({ url: options.url, token: options.token });
    if (!credentials.token) {
      console.error(chalk.red('✗ No machine token'));
      console.error(
        chalk.gray('  Connect this machine once with `devpilot bridge connect --token <token>` and it'),
      );
      console.error(chalk.gray('  is remembered, or pass --token / set DEVPILOT_BRIDGE_TOKEN.'));
      process.exit(1);
    }

    if (!(SESSION_INTENTS as readonly string[]).includes(options.intent)) {
      console.error(chalk.red(`✗ Unknown intent "${options.intent}" — use look, pair or fix`));
      process.exit(1);
    }
    const intent = options.intent as SessionIntent;
    if (options.lifetime && !(SESSION_LIFETIMES as readonly string[]).includes(options.lifetime)) {
      console.error(chalk.red(`✗ Unknown lifetime "${options.lifetime}" — use 1h, 24h or 7d`));
      process.exit(1);
    }
    const lifetime = options.lifetime as SessionLifetime | undefined;
    if (options.mode && !(MODES as readonly string[]).includes(options.mode)) {
      console.error(chalk.red(`✗ Unknown mode "${options.mode}" — use observe, relay or auto`));
      process.exit(1);
    }
    // The intent chooses the mode unless one was named.
    const mode = (options.mode as Mode | undefined) ?? INTENT_MODE[intent];
    // A name, from the origin remote of wherever this was run. Never a path.
    const repo = adoption.resolveRepo(process.cwd())?.repo ?? null;
    const autoBudget = options.budget ? parseInt(options.budget, 10) : SESSION_LIMITS.autoDefaultBudget;
    const autoTtlMinutes = options.minutes
      ? parseInt(options.minutes, 10)
      : SESSION_LIMITS.autoDefaultTtlMinutes;
    if (mode === 'auto' && !(autoBudget > 0 && autoTtlMinutes > 0)) {
      // Never unbounded — the same rule the server and the database enforce.
      console.error(chalk.red('✗ auto mode needs a positive --budget and --minutes'));
      process.exit(1);
    }

    let created;
    try {
      created = await SharedSessionClient.create({
        baseUrl: credentials.url ?? DEFAULT_BRIDGE_URL,
        token: credentials.token,
        title,
        displayName: options.name,
        kind: 'human',
        linearIdentifier: options.issue,
        mode,
        autoBudget,
        autoTtlMinutes,
        intent,
        ...(repo ? { repo } : {}),
        ...(lifetime ? { lifetime } : {}),
      });
    } catch (err) {
      console.error(chalk.red('✗ Could not create the session'));
      console.error(chalk.gray(`  ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }

    const { client, link } = created;
    if (options.message) await client.post(options.message);

    if (options.linkOnly) {
      console.log(link);
      return;
    }

    console.log('');
    console.log(chalk.cyan(`  ${title}`) + chalk.gray(`  ·  ${mode}`));
    console.log('');
    console.log(chalk.gray('  Send this to your teammate:'));
    console.log('');
    for (const line of buildSessionHandoff({
      title,
      link,
      mode,
      autoBudget,
      autoTtlMinutes,
      intent,
      repo,
      expiresAt: created.client.session.expiresAt,
    }).split('\n')) {
      console.log(`  ${line}`);
    }
    console.log('');
    // §3.4 requires this AT COPY TIME, not in a footnote. The link is the
    // credential: there is no second factor and no per-person access list.
    console.log(chalk.yellow('  Anyone with that link can read the whole transcript.'));
    console.log(chalk.gray('  The key is after the #, and never reaches the bridge. To revoke the'));
    console.log(chalk.gray('  link, re-key the session from the dashboard; that ends access for it'));
    console.log(chalk.gray('  but cannot un-send what was already read.'));
    console.log('');
    console.log(chalk.gray(`  Follow it here with:  devpilot session tail "${chalk.italic('<link>')}"`));
    console.log('');
  });
