import { Command } from 'commander';
import chalk from 'chalk';
import { sessionCrypto, buildJoinLink, formatApiError } from '@devpilot.sh/bridge-protocol';

interface NewOptions {
  url?: string;
  token?: string;
  org?: string;
  issue?: string;
}

/**
 * `devpilot session new "…"` — TRD 06 §6.3.
 *
 * The key is generated HERE and never sent. What goes to the bridge is
 * sha256(verifier), where the verifier is a separate HKDF branch that cannot
 * decrypt anything. The bridge stores that hash and nothing else, which is why
 * it can host the transcript without being able to read it.
 */
export const newCommand = new Command('new')
  .description('Create a shared session and print its join link')
  .argument('<title>', 'What this session is about (stored in plaintext — no secrets)')
  .option('-u, --url <url>', 'Bridge URL', process.env.DEVPILOT_BRIDGE_URL)
  .option('-t, --token <token>', 'Orchestrator token (dp_orch_…)', process.env.DEVPILOT_BRIDGE_TOKEN)
  .option('-o, --org <orgId>', 'Organization id that will own the session')
  .option('--issue <identifier>', 'Linear issue identifier to attach, e.g. ENG-394')
  .action(async (title: string, options: NewOptions) => {
    if (!options.url || !options.token) {
      console.error(chalk.red('✗ Bridge URL and token required'));
      console.error(chalk.gray('  --url / DEVPILOT_BRIDGE_URL, --token / DEVPILOT_BRIDGE_TOKEN'));
      process.exit(1);
    }
    if (!options.org) {
      console.error(chalk.red('✗ --org <orgId> is required'));
      console.error(chalk.gray('  The token is bound to one org; this must be that org.'));
      process.exit(1);
    }

    const key = sessionCrypto.generateKey();
    const { joinKeyHash } = await sessionCrypto.deriveJoinCredentials(key);

    const base = options.url.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/sessions/shared`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.token}` },
      body: JSON.stringify({
        orgId: options.org,
        title,
        joinKeyHash,
        ...(options.issue ? { linearIdentifier: options.issue } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error(chalk.red(`✗ Could not create session (${res.status})`));
      // formatApiError renders the §5.4 envelope, so the user sees the server's
      // actual reason rather than a bare "Bad Request".
      console.error(chalk.gray(`  ${formatApiError(body, res.statusText)}`));
      process.exit(1);
    }

    const { session } = (await res.json()) as { session: { id: string; title: string } };
    const link = buildJoinLink(base, session.id, key);

    console.log('');
    console.log(chalk.cyan(`  ${session.title}`));
    console.log(chalk.bold(`  ${link}`));
    console.log('');
    // §3.4 requires this AT COPY TIME, not in a footnote. The link is the
    // credential: there is no second factor and no per-person access list.
    console.log(chalk.yellow('  Anyone with this link can read the whole transcript.'));
    console.log(chalk.gray('  It carries the encryption key after the #, which never reaches'));
    console.log(chalk.gray('  devpilot.sh. Send it the way you would send a password — not to'));
    console.log(chalk.gray('  a public channel. To revoke it, re-key the session; that ends'));
    console.log(chalk.gray('  access for this link but cannot un-send what was already read.'));
    console.log('');
    console.log(chalk.gray(`  Others join with:  devpilot session join "${chalk.italic('<link>')}"`));
    console.log('');
  });
