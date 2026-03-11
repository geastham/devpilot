/**
 * Linear bidirectional sync service
 * Handles synchronization between DevPilot sessions and Linear tickets
 */

import { getLinearClient, isLinearConfigured } from './client';
import type { SyncResult, LinearWebhookPayload } from './types';
import { verifyLinearWebhookSignature } from './webhook-verify';

export interface SessionToLinearSync {
  sessionId: string;
  ticketTitle: string;
  repo: string;
  workstream?: string;
  estimatedMinutes?: number;
  planUrl?: string;
}

export interface SessionProgressUpdate {
  linearTicketId: string;
  progressPercent: number;
  currentWorkstream?: string;
  filesModified?: string[];
  status: 'running' | 'waiting' | 'complete' | 'error';
  message?: string;
}

export interface SessionCompletionSync {
  linearTicketId: string;
  success: boolean;
  prUrl?: string;
  filesModified: string[];
  completionMessage?: string;
}

export interface DispatchIntent {
  linearIssueId: string;
  linearIdentifier: string;
  title: string;
  description?: string;
  teamId: string;
  priority?: number;
  labels?: string[];
}

/**
 * Create a Linear ticket when a session is dispatched
 */
export async function syncSessionToLinear(
  input: SessionToLinearSync
): Promise<SyncResult> {
  if (!isLinearConfigured()) {
    return { success: false, error: 'Linear not configured' };
  }

  try {
    const client = getLinearClient();
    const team = await client.getTeam();

    const description = buildSessionDescription(input);

    const issue = await client.createIssue({
      teamId: team.id,
      title: input.ticketTitle,
      description,
      priority: 2, // Medium priority
    });

    return {
      success: true,
      issueId: issue.identifier,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Update Linear ticket with session progress
 */
export async function syncProgressToLinear(
  input: SessionProgressUpdate
): Promise<SyncResult> {
  if (!isLinearConfigured()) {
    return { success: false, error: 'Linear not configured' };
  }

  try {
    const client = getLinearClient();

    // Add a comment with progress update
    const progressMessage = buildProgressComment(input);
    await client.addComment(input.linearTicketId, progressMessage);

    // If complete or error, move to appropriate state
    if (input.status === 'complete') {
      await client.moveIssueToState(input.linearTicketId, 'In Review');
    } else if (input.status === 'error') {
      await client.moveIssueToState(input.linearTicketId, 'Blocked');
    }

    return { success: true, issueId: input.linearTicketId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Mark Linear ticket as complete when session finishes
 */
export async function syncCompletionToLinear(
  input: SessionCompletionSync
): Promise<SyncResult> {
  if (!isLinearConfigured()) {
    return { success: false, error: 'Linear not configured' };
  }

  try {
    const client = getLinearClient();

    // Add completion comment
    const completionMessage = buildCompletionComment(input);
    await client.addComment(input.linearTicketId, completionMessage);

    // Move to Done or Error state
    const targetState = input.success ? 'Done' : 'Blocked';
    await client.moveIssueToState(input.linearTicketId, targetState);

    return { success: true, issueId: input.linearTicketId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Handle incoming Linear webhook
 */
export async function handleLinearWebhook(
  payload: LinearWebhookPayload,
  options?: {
    botUserId?: string;
    webhookSecret?: string;
    signature?: string;
    rawBody?: string;
  }
): Promise<{ handled: boolean; action?: string; dispatch?: DispatchIntent }> {
  // Verify webhook signature if credentials are provided
  if (options?.webhookSecret && options?.signature && options?.rawBody) {
    const isValid = verifyLinearWebhookSignature(
      options.rawBody,
      options.signature,
      options.webhookSecret
    );

    if (!isValid) {
      throw new Error('Invalid webhook signature');
    }
  }

  // Only handle Issue updates for now
  if (payload.type !== 'Issue') {
    return { handled: false };
  }

  switch (payload.action) {
    case 'update':
      // Check if the issue was assigned to the bot user
      if (options?.botUserId && payload.data?.assigneeId === options.botUserId) {
        // Extract issue data for dispatch
        const data = payload.data as Record<string, unknown>;
        const dispatch: DispatchIntent = {
          linearIssueId: data.id as string,
          linearIdentifier: data.identifier as string,
          title: data.title as string,
          description: data.description as string | undefined,
          teamId: data.teamId as string,
          priority: data.priority as number | undefined,
          labels: data.labelIds as string[] | undefined,
        };

        return {
          handled: true,
          action: 'bot_assigned',
          dispatch
        };
      }

      // Handle issue state changes from Linear
      // This could update local session state if needed
      return { handled: true, action: 'issue_updated' };

    case 'create':
      // Could create a new horizon item from Linear issue
      return { handled: true, action: 'issue_created' };

    case 'remove':
      // Could mark local item as removed
      return { handled: true, action: 'issue_removed' };

    default:
      return { handled: false };
  }
}

// Helper functions

function buildSessionDescription(input: SessionToLinearSync): string {
  const lines = [
    '## DevPilot Session',
    '',
    `**Repository:** ${input.repo}`,
  ];

  if (input.workstream) {
    lines.push(`**Workstream:** ${input.workstream}`);
  }

  if (input.estimatedMinutes) {
    lines.push(`**Estimated Time:** ${input.estimatedMinutes} minutes`);
  }

  if (input.planUrl) {
    lines.push(`**Plan:** [View Plan](${input.planUrl})`);
  }

  lines.push('', '---', '*This ticket was created by DevPilot*');

  return lines.join('\n');
}

function buildProgressComment(input: SessionProgressUpdate): string {
  const statusEmoji = {
    running: ':hourglass:',
    waiting: ':pause_button:',
    complete: ':white_check_mark:',
    error: ':x:',
  }[input.status];

  const lines = [
    `${statusEmoji} **Progress Update: ${input.progressPercent}%**`,
    '',
  ];

  if (input.currentWorkstream) {
    lines.push(`Working on: ${input.currentWorkstream}`);
  }

  if (input.message) {
    lines.push('', input.message);
  }

  if (input.filesModified && input.filesModified.length > 0) {
    lines.push('', '**Files modified:**');
    input.filesModified.slice(0, 5).forEach((f) => lines.push(`- \`${f}\``));
    if (input.filesModified.length > 5) {
      lines.push(`- ... and ${input.filesModified.length - 5} more`);
    }
  }

  return lines.join('\n');
}

function buildCompletionComment(input: SessionCompletionSync): string {
  const emoji = input.success ? ':rocket:' : ':warning:';
  const status = input.success ? 'Completed Successfully' : 'Failed';

  const lines = [
    `${emoji} **Session ${status}**`,
    '',
  ];

  if (input.prUrl) {
    lines.push(`**Pull Request:** [View PR](${input.prUrl})`);
  }

  if (input.completionMessage) {
    lines.push('', input.completionMessage);
  }

  if (input.filesModified.length > 0) {
    lines.push('', '**Files modified:**');
    input.filesModified.slice(0, 10).forEach((f) => lines.push(`- \`${f}\``));
    if (input.filesModified.length > 10) {
      lines.push(`- ... and ${input.filesModified.length - 10} more`);
    }
  }

  return lines.join('\n');
}
