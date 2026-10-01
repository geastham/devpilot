/**
 * Session prompt envelope (spec/trd/01-TIER1-EXECUTION-LOOP.md §7.3).
 *
 * Composes the markdown task prompt handed to a Claude Code session at dispatch
 * time: the task, what the whole item is for, the files in scope, what the
 * tasks before it reported, and how the session should finish.
 *
 * How it should finish depends on who reports to DevPilot (§7.2 allows either
 * "the session (or runner on its behalf)"), and that is the `reporting` input:
 *
 * - `'runner'` — the session runner reports status and completion itself, from
 *   the process exit code, `claude`'s result envelope and the repo's git state.
 *   The agent is asked only for a good final message, because the runner sends
 *   that message as the completion summary.
 * - `'agent'` — the session is told to `curl` the callbacks itself: the
 *   original Reporting Protocol section, unchanged.
 *
 * The prompt used to carry the Reporting Protocol unconditionally. On the
 * runner path that instruction could not work — the token is a literal
 * `<callback-token>` placeholder and the permission mode denies the `curl` —
 * and it was not harmless either. In one run database 19 of 20 worker sessions
 * spent turns attempting it, and 16 of the 20 completion summaries were about
 * the failed callback rather than the work. Those summaries are what the next
 * wave receives as "Context From Predecessors", so the instruction wasted turns
 * in every session and then poisoned the handoff between them.
 */

import type { OrchestratorMode } from './adapter';
import {
  normalizeItemDescription,
  renderTicketDescription,
} from '../wave-planner/ticket-description';

/** Who tells DevPilot how a session is going. See the module comment. */
export type SessionReporting = 'runner' | 'agent';

export interface SessionPromptPredecessor {
  taskCode: string;
  description: string;
  filesModified: string[];
  /**
   * What `filesModified` actually holds.
   *
   * - `'changed'` — what git says the task's branch changed, from the commit
   *   it was cut from to its head. Only an isolated task has this. Exact: an
   *   empty list means the task changed nothing.
   * - `'touched'` — files the runner observed the session write to, as of its
   *   last status report. Real, but possibly short of the final few edits.
   * - `'scoped'` — the files the plan assigned to the task. Nothing checked
   *   that the task stayed inside them, or touched them at all.
   *
   * Defaults to `'scoped'`. That is what the one caller has always passed, and
   * the prompt nevertheless presented it as "Files modified".
   */
  filesSource?: 'changed' | 'touched' | 'scoped';
  completionSummary: string;
}

/** The horizon item a task belongs to: what the work as a whole is for. */
export interface SessionPromptGoal {
  title: string;
  /** The ticket body. Untrusted text; rendered as a labelled block. */
  description?: string | null;
}

export interface SessionPromptInput {
  taskDescription: string;
  repo: string;
  fileScope: string[];
  predecessorContext: SessionPromptPredecessor[];
  acceptanceCriteria?: string[];
  constraints?: string[];
  callbackUrl: string;
  sessionId: string;
  /**
   * Who reports status and completion. Defaults to `'agent'`, which is what
   * this function did before the option existed; pass `'runner'` when the
   * session runner reports on the session's behalf.
   */
  reporting?: SessionReporting;
  /**
   * The item this task is one part of. Without it a worker is handed a
   * one-sentence task and no idea what the work around it is for.
   */
  goal?: SessionPromptGoal;
  /**
   * True when the predecessors' work is actually in the checkout this session
   * will be given: the plan is isolated, and every predecessor listed has been
   * merged into the branch this task's worktree is cut from.
   *
   * The prompt then says so. Left false or absent it says only that they
   * completed — which is all that is known in a shared checkout, where a
   * predecessor's edits are there unless something has since written over
   * them, and nothing checked.
   */
  predecessorsMerged?: boolean;
}

/**
 * Which reporting mode an orchestrator mode needs.
 *
 * - `claude-session`: the session runner reports on the agent's behalf (see
 *   the header of the CLI's `session-runner/claude-runner.ts`), so the agent
 *   is not asked to.
 * - `ao-cli`, `http`: kept on agent reporting. Both are also polled, and the
 *   module comment here used to call the section "harmless" for ao-cli — but
 *   neither the `ao` CLI nor a remote HTTP orchestrator is code in this
 *   repository, so nothing here can show that their completions do not lean on
 *   the session's own report. Until something does, their prompt is unchanged.
 */
export function sessionReportingForMode(mode: OrchestratorMode): SessionReporting {
  return mode === 'claude-session' ? 'runner' : 'agent';
}

/**
 * Build the composed task prompt for a session dispatch.
 */
export function buildSessionPrompt(input: SessionPromptInput): string {
  const {
    taskDescription,
    repo,
    fileScope,
    predecessorContext,
    acceptanceCriteria,
    constraints,
    callbackUrl,
    sessionId,
    reporting = 'agent',
    goal,
    predecessorsMerged = false,
  } = input;

  const sections: string[] = [];

  // --- Task -----------------------------------------------------------------
  sections.push(`# Task\n\n${taskDescription}\n\n**Repository:** \`${repo}\``);

  // --- Overall Goal ---------------------------------------------------------
  if (goal?.title) {
    // The ticket body is untrusted text from the tracker; it goes in only as
    // the labelled, delimited block `renderTicketDescription` produces.
    const description = normalizeItemDescription(goal.description);
    sections.push(
      `# Overall Goal\n\n` +
        `Your task is one part of a larger piece of work: **${goal.title}**. ` +
        `Other tasks cover the rest of it. This is here so you can judge what ` +
        `your part is for — do the task above, not the whole item.` +
        (description ? `\n\n${renderTicketDescription(description)}` : '')
    );
  }

  // --- File Scope -----------------------------------------------------------
  if (fileScope.length > 0) {
    // Scope, not a lock: nothing on this path writes a lock row or stops an
    // edit outside the list. What is true is that the planner gives tasks that
    // run in the same wave different files.
    sections.push(
      `# File Scope\n\n` +
        `These files are this task's scope. Other tasks running at the same time ` +
        `have been given different files, so stay inside this set — an edit ` +
        `outside it can collide with another agent's work:\n\n` +
        fileScope.map((f) => `- \`${f}\``).join('\n')
    );
  }

  // --- Context From Predecessors -------------------------------------------
  if (predecessorContext.length > 0) {
    const blocks = predecessorContext
      .map((p) => {
        const files = p.filesModified.length > 0
          ? p.filesModified.map((f) => `\`${f}\``).join(', ')
          : // For a `'changed'` list, empty is a finding, not a gap.
            p.filesSource === 'changed'
            ? '(none — it changed no files)'
            : '(none recorded)';
        const filesLabel = p.filesSource === 'changed'
          ? 'Files this task changed (from git: its branch against the commit it started from)'
          : p.filesSource === 'touched'
            ? 'Files this task touched (as last reported by its runner)'
            : 'Files this task was scoped to';
        const summary = p.completionSummary?.trim() || '(no summary provided)';
        return `## ${p.taskCode} — ${p.description}\n\n- ${filesLabel}: ${files}\n- Summary: ${summary}`;
      })
      .join('\n\n');
    sections.push(
      `# Context From Predecessors\n\n` +
        (predecessorsMerged
          ? `These upstream tasks completed before yours, and their work has been merged ` +
            `into the branch your checkout was cut from — it is in your working tree now. ` +
            `Build on it:`
          : `These upstream tasks completed before yours; build on their work:`) +
        `\n\n${blocks}`
    );
  }

  // --- Acceptance Criteria --------------------------------------------------
  if (acceptanceCriteria && acceptanceCriteria.length > 0) {
    sections.push(
      `# Acceptance Criteria\n\n` +
        acceptanceCriteria.map((c) => `- ${c}`).join('\n')
    );
  }

  // --- Constraints ----------------------------------------------------------
  if (constraints && constraints.length > 0) {
    sections.push(
      `# Constraints\n\n` + constraints.map((c) => `- ${c}`).join('\n')
    );
  }

  // --- Finishing ------------------------------------------------------------
  sections.push(
    reporting === 'runner'
      ? finishingSection(sessionId)
      : reportingProtocolSection(callbackUrl, sessionId)
  );

  return sections.join('\n\n');
}

/**
 * What a session is asked for when the runner does the reporting: a final
 * message worth handing on, and nothing else.
 *
 * The first sentence is load-bearing beyond what it says. The adoption scanner
 * (`adoption/transcript.ts`) recognises a session DevPilot started by finding
 * "DevPilot session id is" in its first prompt, and for a session that is
 * still running that is the only thing identifying it: the owned-session
 * ledger is written when a run ends. Drop the phrase and a running worker is
 * offered for adoption — the same work put on the board a second time.
 */
function finishingSection(sessionId: string): string {
  return (
    `# When You Finish\n\n` +
      `Your DevPilot session id is \`${sessionId}\`. DevPilot's runner reports this ` +
      `session's progress, cost and changed files for you, so there is nothing to ` +
      `send.\n\n` +
      `End with a final message that says what you changed and why, which files ` +
      `you changed, and anything the next task needs to know. That message is ` +
      `handed, word for word, to the tasks that depend on this one — it is all ` +
      `they will know about your work.`
  );
}

/**
 * The Reporting Protocol: the session POSTs its own status and completion
 * callbacks (§7.2). Used when nothing reports on the session's behalf.
 */
function reportingProtocolSection(callbackUrl: string, sessionId: string): string {
  const statusUrl = `${callbackUrl}/status`;
  const completeUrl = `${callbackUrl}/complete`;
  return (
    `# Reporting Protocol\n\n` +
      `You MUST report progress back to DevPilot so it can track this task. Your ` +
      `DevPilot session id is \`${sessionId}\` — use it as \`sessionId\` in every ` +
      `callback body.\n\n` +
      `**On each meaningful milestone** (and at least every 2 minutes while working), ` +
      `POST a status update:\n\n` +
      '```bash\n' +
      `curl -sS -X POST '${statusUrl}' \\\n` +
      `  -H 'Content-Type: application/json' \\\n` +
      `  -H 'X-DevPilot-Callback-Token: <callback-token>' \\\n` +
      `  -d '{\n` +
      `    "sessionId": "${sessionId}",\n` +
      `    "status": "running",\n` +
      `    "progressPercent": 40,\n` +
      `    "currentStep": "implementing X",\n` +
      `    "message": "…",\n` +
      `    "filesModified": ["src/lib/foo.ts"],\n` +
      `    "timestamp": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"\n` +
      `  }'\n` +
      '```\n\n' +
      `**Exactly once, when the task is done** (success or failure), POST the final ` +
      `completion report:\n\n` +
      '```bash\n' +
      `curl -sS -X POST '${completeUrl}' \\\n` +
      `  -H 'Content-Type: application/json' \\\n` +
      `  -H 'X-DevPilot-Callback-Token: <callback-token>' \\\n` +
      `  -d '{\n` +
      `    "sessionId": "${sessionId}",\n` +
      `    "success": true,\n` +
      `    "filesModified": ["src/lib/foo.ts"],\n` +
      `    "filesCreated": [],\n` +
      `    "filesDeleted": [],\n` +
      `    "summary": "One-paragraph summary of what you did.",\n` +
      `    "tokensUsed": 0,\n` +
      `    "costUsd": 0,\n` +
      `    "durationMinutes": 0,\n` +
      `    "timestamp": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"\n` +
      `  }'\n` +
      '```\n\n' +
      `Replace \`<callback-token>\` with the token provided by your runner. Send the ` +
      `completion callback even if the task failed — set \`"success": false\` and ` +
      `include an \`"error"\` field describing what went wrong.`
  );
}
