import { adoption } from '@devpilot.sh/core';
import type { BridgeClient, SessionCommandMessage } from '@devpilot.sh/bridge-client';
import { planFromSession } from './conductor-handler';

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
  /** What the cockpit calls this session; the planner's item title. */
  title?: string;
  summary?: string;
  branch?: string;
  touchedPaths?: string[];
}

export interface ResumeApplierOptions {
  client: BridgeClient;
  /**
   * Session-runner base URL, e.g. http://127.0.0.1:3900.
   *
   * Required only for `continue`. A planning bridge does not run one, and
   * demanding it would refuse the mode that does not need it.
   */
  sessionApiUrl?: string;
  sessionApiKey?: string;
  /**
   * Where the runner should report back to — usually nowhere.
   *
   * An adopted session's status comes from the OBSERVATION SWEEP, not from
   * callbacks: the resumed run appends to the same transcript, so the next
   * sweep sees it live and reports it, and sees it quiet and settles it. That
   * is already the mechanism keeping every adopted row current.
   *
   * The first version pointed this at `/api/orchestrator`, which does not
   * exist — the hosted routes are `/api/sessions/:id/status` — so every
   * callback 404'd. Pointing it at the real route would not have worked either:
   * the runner authenticates callbacks with `X-DevPilot-Callback-Token`, and
   * the hosted routes read `Authorization: Bearer`. Two reporting paths where
   * one already works is not worth reconciling.
   */
  callbackUrl?: string;
  /** `adoptionKey → where that conversation lives on this machine`. */
  resolveTarget: (adoptionKey: string) => ResumeTarget | undefined;
  /**
   * Local cockpit base URL (`devpilot serve`).
   *
   * Required only for `plan`. The conductor graph lives in the Next app rather
   * than in core — langchain is deliberately kept out of the package every CLI
   * install pulls down — so planning is an HTTP call to the cockpit, exactly as
   * the dispatch path does it.
   */
  cockpitUrl?: string;
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

    /**
     * Liveness blocks CONTINUING, not planning.
     *
     * The rule was never "leave live sessions alone", it was "do not put a
     * second process on one transcript". Planning does not touch the transcript
     * at all — it reads what the observer already recorded and asks the
     * conductor — so refusing it on a live session withheld the safe mode along
     * with the unsafe one.
     *
     * That matters in practice: a session you are watching run and want to
     * redirect is exactly when a plan is most useful, and it is the state a
     * busy fleet is mostly in.
     */
    if (
      command.payload?.mode !== 'plan' &&
      Date.now() - observation.lastActivityMs < this.liveWithinMs
    ) {
      await this.fail(
        command,
        'That session is still running, so continuing it would put two agents on one ' +
          'transcript. Open it in Claude Code, or plan the work instead.',
      );
      return;
    }

    const message = command.payload?.message?.trim();

    if (command.payload?.mode !== 'plan' && !this.opts.sessionApiUrl) {
      await this.fail(
        command,
        'Continuing a session needs the local session runner. Start one with ' +
          '`devpilot session-runner` and reconnect with --session-api-url, or use Plan it.',
      );
      return;
    }

    /**
     * Plan, rather than continue — TRD 23 §3.5.
     *
     * Handled before the runner call because it is a different request, not a
     * variation on one: the person asked what the work SHOULD be, and the
     * answer is a decomposition they approve before anything runs.
     */
    if (command.payload?.mode === 'plan') {
      if (!this.opts.cockpitUrl) {
        await this.fail(
          command,
          'Planning needs the local cockpit. Start it with `devpilot serve`, reconnect the ' +
            'bridge with --cockpit-url, or take the wheel without planning.',
        );
        return;
      }
      try {
        const summary = await planFromSession({
          client: this.opts.client,
          cockpitUrl: this.opts.cockpitUrl,
          sessionId: command.sessionId,
          repo: target.repo,
          title: target.title || `Continue work in ${target.repo}`,
          message,
          summary: target.summary,
          branch: target.branch,
          touchedPaths: target.touchedPaths,
          fetchImpl: this.doFetch,
          onLog: this.log,
        });
        await this.opts.client.acknowledgeCommands([command.id], 'applied');
        this.log(`planned ${target.repo}: ${summary}`);
      } catch (err) {
        /**
         * FAILED, not left pending, unlike an unreachable runner. A planning
         * call that got as far as the cockpit and came back with an error —
         * no API key, a refused model, a graph failure — will fail the same way
         * on every retry, and a command that retries forever is worse than one
         * that says why it stopped.
         */
        await this.fail(
          command,
          `Planning failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      return;
    }

    try {
      const res = await this.doFetch(`${this.opts.sessionApiUrl!.replace(/\/$/, '')}/v1/sessions`, {
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
          // Empty is the established "no callbacks" value; the dispatch path
          // passes the same and relies on polling instead.
          callbackUrl: this.opts.callbackUrl ?? '',
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
