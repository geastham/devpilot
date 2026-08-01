/**
 * Linear comment formatting — TRD 05 §6.1.
 *
 * Ported from packages/core/src/integrations/linear/sync.ts (buildProgressComment /
 * buildCompletionComment) so there is exactly ONE definition rather than a copy
 * on each side of the repo boundary. `packages/core` re-exports from here;
 * a conforming third-party bridge gets the same formatting for free.
 *
 * Zero dependencies beyond zod elsewhere in the package — these are pure string
 * builders so any implementation can use them without pulling in Linear's SDK.
 */

/** Matches core's SessionProgressUpdate.status. */
export type ProgressStatus = 'running' | 'waiting' | 'complete' | 'error';

export interface ProgressCommentInput {
  progressPercent: number;
  status: ProgressStatus;
  currentWorkstream?: string;
  message?: string;
  filesModified?: string[];
}

const PROGRESS_STATUS_EMOJI: Record<ProgressStatus, string> = {
  running: ':hourglass:',
  waiting: ':pause_button:',
  complete: ':white_check_mark:',
  error: ':x:',
};

export interface CompletionCommentInput {
  success: boolean;
  prUrl?: string;
  completionMessage?: string;
  filesModified?: string[];
}

const PROGRESS_FILE_LIMIT = 5;
const COMPLETION_FILE_LIMIT = 10;

function fileList(files: string[], limit: number): string[] {
  const lines: string[] = ['', '**Files modified:**'];
  files.slice(0, limit).forEach((f) => lines.push(`- \`${f}\``));
  if (files.length > limit) {
    lines.push(`- ... and ${files.length - limit} more`);
  }
  return lines;
}

export function buildProgressComment(input: ProgressCommentInput): string {
  const lines: string[] = [
    `${PROGRESS_STATUS_EMOJI[input.status]} **Progress Update: ${input.progressPercent}%**`,
    '',
  ];

  if (input.currentWorkstream) {
    lines.push(`Working on: ${input.currentWorkstream}`);
  }
  if (input.message) {
    lines.push('', input.message);
  }
  if (input.filesModified && input.filesModified.length > 0) {
    lines.push(...fileList(input.filesModified, PROGRESS_FILE_LIMIT));
  }

  return lines.join('\n');
}

export function buildCompletionComment(input: CompletionCommentInput): string {
  const emoji = input.success ? ':rocket:' : ':warning:';
  const status = input.success ? 'Completed Successfully' : 'Failed';

  const lines: string[] = [`${emoji} **Session ${status}**`, ''];

  if (input.prUrl) {
    lines.push(`**Pull Request:** [View PR](${input.prUrl})`);
  }
  if (input.completionMessage) {
    lines.push('', input.completionMessage);
  }
  if (input.filesModified && input.filesModified.length > 0) {
    lines.push(...fileList(input.filesModified, COMPLETION_FILE_LIMIT));
  }

  return lines.join('\n');
}

/**
 * The comment the hosted bridge posts when a session finishes. Failure never
 * throws and never blocks the orchestrator's completion report (TRD 05 §6.3),
 * so this must produce something sane for every input.
 */
export function buildBridgeCompletionComment(input: {
  success: boolean;
  identifier: string;
  prUrl?: string;
  summary?: string;
  errorMessage?: string;
}): string {
  if (!input.success) {
    return buildCompletionComment({
      success: false,
      completionMessage: input.errorMessage
        ? `Session failed — ${input.errorMessage}`
        : 'Session failed — no error detail was reported.',
    });
  }

  return buildCompletionComment({
    success: true,
    prUrl: input.prUrl,
    completionMessage: input.summary,
  });
}
