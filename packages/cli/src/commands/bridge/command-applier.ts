import type { BridgeClient, SessionCommandMessage } from '@devpilot.sh/bridge-client';

/**
 * Applies decisions taken in the hosted cockpit to the local conductor.
 *
 * Everything else in the bridge runs one way: work comes down, status goes up.
 * This is the return path for the one thing a person has to decide — whether a
 * plan is good enough to spend money on. Without it, a hosted customer could
 * watch a run reach its review gate and had no way to answer it, which made the
 * mirrored plan a picture rather than a cockpit.
 *
 * ## Why the bridge is still the only thing that acts
 *
 * The hosted plane queues a row; this polls for it and applies it locally. No
 * inbound connection to anyone's laptop, and the machine that holds the
 * credentials remains the only thing that can start work. That property is the
 * whole reason DevPilot is safe to install, and a command channel that reached
 * the other way would quietly give it up.
 *
 * ## Acknowledgement is deliberate about ordering
 *
 * A command is acknowledged only AFTER the conductor has accepted it. If the
 * cockpit is unreachable the row stays pending and the next poll tries again —
 * a decision a human made must not be silently dropped because a laptop was
 * asleep. The cost is that a command applied but not acknowledged is retried,
 * so `approve` has to be safe to repeat: the conductor answers a resume on a
 * graph with no pending interrupt by continuing from where it is, not by
 * re-running the wave.
 */

export interface CommandApplierOptions {
  client: BridgeClient;
  /** Local cockpit base URL. */
  cockpitUrl: string;
  /** Maps a bridge session to the cockpit item its conductor run belongs to. */
  resolveItemId: (sessionId: string) => string | undefined;
  onLog?: (line: string) => void;
  fetchImpl?: typeof fetch;
  requestTimeoutMs?: number;
}

export class CommandApplier {
  private readonly base: string;
  private readonly log: (line: string) => void;
  private readonly doFetch: typeof fetch;
  private readonly timeout: number;

  constructor(private readonly opts: CommandApplierOptions) {
    this.base = opts.cockpitUrl.replace(/\/$/, '');
    this.log = opts.onLog ?? (() => {});
    this.doFetch = opts.fetchImpl ?? fetch;
    this.timeout = opts.requestTimeoutMs ?? 15 * 60_000;
  }

  /** One pass: fetch pending commands and apply them in order. */
  async sweep(): Promise<void> {
    let commands: SessionCommandMessage[];
    try {
      commands = await this.opts.client.pollSessionCommands();
    } catch (err) {
      // A hosted plane that is briefly unreachable is not an error worth
      // stopping the bridge for; the next sweep will pick these up.
      this.log(`command poll failed (${err instanceof Error ? err.message : String(err)})`);
      return;
    }

    for (const command of commands) {
      await this.apply(command);
    }
  }

  private async apply(command: SessionCommandMessage): Promise<void> {
    const itemId = this.opts.resolveItemId(command.sessionId);

    if (!itemId) {
      /**
       * The bridge does not know which cockpit item this session is. That
       * happens when the run was claimed by a previous process and this one has
       * not restored it, and it is permanent from here — there is nothing to
       * apply the decision to.
       *
       * Failing it is kinder than leaving it pending forever: the hosted
       * cockpit can show that the decision did not land, instead of a spinner
       * that never resolves.
       */
      await this.opts.client.acknowledgeCommands(
        [command.id],
        'failed',
        'This bridge is not tracking that run, so the decision could not be applied.'
      );
      this.log(`command ${command.command} for an untracked session — reported as failed`);
      return;
    }

    const decision =
      command.command === 'approve'
        ? { action: 'approve' as const }
        : command.command === 'replan'
          ? { action: 'refine' as const, constraints: command.payload?.constraints ?? [] }
          : { action: 'abort' as const, reason: 'Aborted from the hosted cockpit' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await this.doFetch(`${this.base}/api/items/${itemId}/conductor`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`conductor → ${res.status} ${detail.slice(0, 200)}`);
      }

      // Only now. See the header: acknowledging first would let a decision
      // vanish if the conductor rejected it.
      await this.opts.client.acknowledgeCommands([command.id], 'applied');
      this.log(`applied ${command.command} from the hosted cockpit`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);

      /**
       * Distinguish "the cockpit is not running" from "the conductor refused".
       * The first is transient and the command should be retried on the next
       * sweep; the second will fail identically forever, and leaving it pending
       * would retry a paid planning call every 30 seconds.
       */
      const transient = /fetch failed|ECONNREFUSED|abort|timeout/i.test(reason);
      if (transient) {
        this.log(`command ${command.command} deferred — cockpit unreachable (${reason})`);
        return;
      }

      await this.opts.client.acknowledgeCommands([command.id], 'failed', reason);
      this.log(`command ${command.command} failed: ${reason}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
