import { adoption } from '@devpilot.sh/core';
import type { BridgeClient, SessionCommandMessage } from '@devpilot.sh/bridge-client';

/**
 * Picking up the wheel on a session DevPilot did not start — TRD 23 §7.2.
 *
 * The hosted plane queues a `resume` against a DevPilot session id. This
 * resolves that, locally, to a Claude Code conversation on this machine and
 * continues it under the session-runner — at which point the run is
 * DevPilot-spawned and every callback, stream event and plan gate already built
 * applies to it.
 *
 * ## The hosted plane cannot name a local session, and this is why that holds
 *
 * `adoptionKey` is `sha256(machineName + ':' + sessionUuid)` and the uuid has
 * never crossed the wire (TRD 21 §4.1). So a command can only point at a row
 * the hosted plane already had; what that means on this machine is decided
 * here, from state only this machine holds.
 *
 * A compromised control plane therefore cannot ask a laptop to resume an
 * arbitrary conversation, because it does not know what any conversation is
 * called. That property is worth more than the convenience of sending a uuid.
 *
 * ## Why liveness is re-checked immediately before spawning
 *
 * Two processes appending to one transcript corrupts it. The cockpit's idea of
 * "held" can be a minute old — a person may have gone back to the terminal in
 * the meantime — so the decision is made here, against the file, at the moment
 * of acting. Refusing is cheap; a corrupted transcript is not recoverable.
 */

export interface ResumeTarget {
  transcriptPath: string;
  sessionUuid: string;
  repo: string;
  /** Absolute working directory the session ran in. */
  cwd: string;
}

export interface ResumeApplierOptions {
  client: BridgeClient;
  /** Session-runner base URL, e.g. http://127.0.0.1:3900. */
  sessionApiUrl: string;
  sessionApiKey?: string;
  /** Where the runner should report back to. */
  callbackUrl: string;
  /** `adoptionKey → where that conversation lives on this machine`. */
  resolveTarget: (adoptionKey: string) => ResumeTarget | undefined;
  /** Treated as still running within this window. Default 5 minutes. */
  liveWithinMs?: number;
  onLog?: (line: string) => void;
  fetchImpl?: typeof fetch;
}

const DEFAULT_LIVE_WITHIN_MS = 5 * 60_000;

export class ResumeApplier {
  private readonly log: (line: string) => void;
  private readonly doFetch: typeof fetch;
  private readonly liveWithinMs: number;

  constructor(private readonly opts: ResumeApplierOptions) {
    this.log = opts.onLog ?? (() => {});
    this.doFetch = opts.fetchImpl ?? fetch;
    this.liveWithinMs = opts.liveWithinMs ?? DEFAULT_LIVE_WITHIN_MS;
  }

  /** Whether this applier handles a given command. */
  static handles(command: SessionCommandMessage): boolean {
    return command.command === 'resume';
  }

  /**
   * Apply one resume.
   *
   * Acknowledges only AFTER the runner accepts, matching the ordering rule in
   * `command-applier.ts`: a decision a person made must not be silently dropped
   * because a laptop was asleep. The cost is that an accepted-but-unacknowledged
   * resume is retried, which the runner's own idempotency on `sessionId`
   * absorbs rather than starting a second agent on the same repo.
   */
  async apply(command: SessionCommandMessage): Promise<void> {
    const adoptionKey = command.payload?.adoptionKey;
    if (!adoptionKey) {
      await this.fail(
        command,
        'That resume carried no session key, so this machine cannot tell which conversation it means.',
      );
      return;
    }

    const target = this.opts.resolveTarget(adoptionKey);

    if (!target) {
      /**
       * This machine does not know that session.
       *
       * Legitimate and common: the ledger is per-machine, so a session observed
       * by a laptop that is now offline cannot be resumed by a different one.
       * Failing it says so; leaving it pending would spin forever on a cockpit
       * button that can never resolve.
       */
      await this.fail(
        command,
        'This machine is not tracking that session, so there is nothing to resume. ' +
          'It may belong to a different machine in the fleet.',
      );
      return;
    }

    // Re-probe against the file, not against a status that may be a minute old.
    const observation = adoption.probeTranscript(target.transcriptPath, target.sessionUuid);
    if (!observation) {
      await this.fail(command, 'That session’s transcript is no longer on this machine.');
      return;
    }

    if (Date.now() - observation.lastActivityMs < this.liveWithinMs) {
      await this.fail(
        command,
        'That session is still running. Two agents writing one transcript would corrupt it — ' +
          'open it in Claude Code, or wait for it to stop.',
      );
      return;
    }

    const message = command.payload?.message?.trim();

    try {
      const res = await this.doFetch(`${this.opts.sessionApiUrl.replace(/\/$/, '')}/v1/sessions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.opts.sessionApiKey
            ? { authorization: `Bearer ${this.opts.sessionApiKey}` }
            : {}),
        },
        body: JSON.stringify({
          sessionId: command.sessionId,
          repo: target.repo,
          /**
           * `--resume` continues the conversation, so a prompt is optional in a
           * way it never is for a fresh dispatch. With nothing to say, ask the
           * agent to take stock rather than sending an empty string — an empty
           * turn produces an empty answer, and the point of picking this up is
           * to find out where it got to.
           */
          prompt:
            message ||
            'Summarise where this session got to and what remains, then stop and wait.',
          resumeSessionId: target.sessionUuid,
          callbackUrl: this.opts.callbackUrl,
        }),
      });

      // 409 is the runner saying it already has this sessionId — idempotent,
      // and exactly what a retried acknowledgement should produce.
      if (!res.ok && res.status !== 409) {
        const body = await res.text().catch(() => '');
        await this.fail(
          command,
          `The local session runner refused: ${res.status} ${body.slice(0, 200)}`,
        );
        return;
      }

      await this.opts.client.acknowledgeCommands([command.id], 'applied');
      this.log(
        `took the wheel on ${target.repo}${message ? ' with an instruction' : ''} — ` +
          'it now reports as a DevPilot run',
      );
    } catch (err) {
      /**
       * Left PENDING deliberately, unlike the refusals above.
       *
       * Those are permanent facts about this machine; this is a runner that may
       * simply not be up yet. Failing it would throw away a decision a person
       * made because a daemon was starting.
       */
      this.log(
        `could not reach the session runner (${err instanceof Error ? err.message : String(err)}) — ` +
          'the resume stays queued',
      );
    }
  }

  private async fail(command: SessionCommandMessage, reason: string): Promise<void> {
    await this.opts.client.acknowledgeCommands([command.id], 'failed', reason);
    this.log(`resume refused — ${reason}`);
  }
}
