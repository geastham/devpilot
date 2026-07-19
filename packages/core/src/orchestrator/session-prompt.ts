/**
 * Session prompt envelope (spec/trd/01-TIER1-EXECUTION-LOOP.md §7.3).
 *
 * Composes the markdown task prompt handed to a Claude Code session at dispatch
 * time. The critical piece is the Reporting Protocol section: it tells the
 * session exactly how to POST status/completion callbacks (§7.2) so DevPilot's
 * ExecutionBridge learns when the wave task finishes. The same text is reused
 * verbatim for the `ao-cli` fallback (where the reporting section is harmless —
 * the ao poller supersedes it).
 */

export interface SessionPromptPredecessor {
  taskCode: string;
  description: string;
  filesModified: string[];
  completionSummary: string;
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
  } = input;

  const sections: string[] = [];

  // --- Task -----------------------------------------------------------------
  sections.push(`# Task\n\n${taskDescription}\n\n**Repository:** \`${repo}\``);

  // --- File Scope -----------------------------------------------------------
  if (fileScope.length > 0) {
    sections.push(
      `# File Scope\n\n` +
        `You hold an **exclusive lock** on the following files for the duration of ` +
        `this task. Do not modify files outside this set — other agents are working ` +
        `in parallel and edits outside your scope will conflict:\n\n` +
        fileScope.map((f) => `- \`${f}\``).join('\n')
    );
  }

  // --- Context From Predecessors -------------------------------------------
  if (predecessorContext.length > 0) {
    const blocks = predecessorContext
      .map((p) => {
        const files = p.filesModified.length > 0
          ? p.filesModified.map((f) => `\`${f}\``).join(', ')
          : '(none recorded)';
        const summary = p.completionSummary?.trim() || '(no summary provided)';
        return `## ${p.taskCode} — ${p.description}\n\n- Files modified: ${files}\n- Summary: ${summary}`;
      })
      .join('\n\n');
    sections.push(
      `# Context From Predecessors\n\n` +
        `These upstream tasks completed before yours; build on their work:\n\n${blocks}`
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

  // --- Reporting Protocol ---------------------------------------------------
  const statusUrl = `${callbackUrl}/status`;
  const completeUrl = `${callbackUrl}/complete`;
  sections.push(
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

  return sections.join('\n\n');
}
