import { z } from 'zod';

/**
 * Session adoption & fleet discovery — TRD 21 §5.
 *
 * The reverse of `messages.ts`. That file describes work the bridge is being
 * *given*; this one describes work the bridge *found already running* on the
 * machine and is reporting upward.
 *
 * ## Why every schema here is `.strict()`
 *
 * TRD 21 DECISION B: the transcript never leaves the machine. That claim needs
 * an enforcement mechanism, not a comment, because the pressure to widen it is
 * real — the very next feature anyone asks for is "show me what the agent
 * said", and the cheapest way to build it is one more field.
 *
 * `.strict()` makes an unknown key a parse failure on BOTH sides. A caller
 * cannot smuggle content through by adding a property, and a bridge cannot
 * start accepting one without amending this file, which is a reviewable diff in
 * a published package. The hosted table additionally has no column that could
 * hold transcript text, so the two defences are independent.
 *
 * The closed list of what may cross is in TRD 21 §3.3. `touchedPaths` is the
 * only genuinely new class of information — file PATHS, never contents — and it
 * exists so the in-flight-file guard is correct for adopted sessions.
 */

/**
 * Agents whose local session store this protocol knows how to read.
 *
 * A one-element enum rather than a free string: an unrecognised agent name
 * would be recorded and rendered as though the hosted side understood its
 * semantics, when in fact nothing would. Adding `codex` means adding a probe.
 */
export const ADOPTION_AGENTS = ['claude-code'] as const;
export const AdoptionAgentSchema = z.enum(ADOPTION_AGENTS);
export type AdoptionAgent = (typeof ADOPTION_AGENTS)[number];

/** How an adopted session found its place on the board. */
export const ADOPTION_MATCH_KINDS = ['branch', 'title', 'created'] as const;
export const AdoptionMatchKindSchema = z.enum(ADOPTION_MATCH_KINDS);
export type AdoptionMatchKind = (typeof ADOPTION_MATCH_KINDS)[number];

/** What happened to one candidate. */
export const ADOPTION_OUTCOME_STATUSES = [
  /** A new session row, and a new Linear issue. */
  'adopted',
  /** Already adopted — same `adoptionKey`. Nothing was written. */
  'duplicate',
  /** A new session row against an issue that already existed. */
  'attached',
  /** Nothing was written; `reason` says why. */
  'skipped',
] as const;
export const AdoptionOutcomeStatusSchema = z.enum(ADOPTION_OUTCOME_STATUSES);
export type AdoptionOutcomeStatus = (typeof ADOPTION_OUTCOME_STATUSES)[number];

export const ADOPTION_LIMITS = {
  /** Per request. The CLI chunks beyond this. */
  MAX_CANDIDATES: 100,
  /** Paths only, and not many. A session touching more is summarised, not listed. */
  MAX_TOUCHED_PATHS: 50,
  MAX_TITLE_CHARS: 120,
  MAX_SUMMARY_CHARS: 400,
  /** Per discovery request. A machine with more repos than this has bigger problems. */
  MAX_DISCOVERED_REPOS: 500,
} as const;

/**
 * `owner/name`. Deliberately the same shape the machine already declared at
 * register time, so adoption can never introduce a repo identifier the routing
 * table cannot match.
 */
export const RepoSlugSchema = z
  .string()
  .min(3)
  .max(255)
  .regex(/^[\w.-]+\/[\w.-]+$/, 'repo must be owner/name');

/**
 * One agent session observed on a machine, offered for a place on the board.
 *
 * NOTE what is absent and must stay absent: transcript, messages, prompt,
 * diff, patch, fileContents. There is a test asserting each of those is
 * rejected (`adoption.test.ts`), because this is the whole product boundary.
 */
export const AdoptionCandidateSchema = z
  .object({
    /**
     * `sha256(machineName + ':' + sessionUuid)`, hex.
     *
     * Opaque on the wire and used only for idempotence. The machine name is in
     * the hash because two laptops share a session UUID only if someone copied
     * a `~/.claude` directory between them — and if they did, those genuinely
     * are two observations of two different machines.
     */
    adoptionKey: z.string().regex(/^[0-9a-f]{64}$/, 'adoptionKey must be sha256 hex'),
    agent: AdoptionAgentSchema,
    /** One line. From the client's own session title where it has one. */
    title: z.string().min(1).max(ADOPTION_LIMITS.MAX_TITLE_CHARS),
    /** Derived locally. Never a quotation from the transcript. */
    summary: z.string().max(ADOPTION_LIMITS.MAX_SUMMARY_CHARS).optional(),
    repo: RepoSlugSchema,
    branch: z.string().max(255).optional(),
    startedAt: z.string().datetime(),
    lastActivityAt: z.string().datetime(),
    /** Approximate — see the probe's note on why it is not paid for exactly. */
    messageCount: z.number().int().nonnegative().optional(),
    /** Still running at scan time. */
    live: z.boolean(),
    /**
     * Changed file PATHS. Not contents, not diffs.
     *
     * This is what makes `getAvoidFiles` correct for a session DevPilot did not
     * start: without it, an adopted agent holds files nothing knows about.
     */
    touchedPaths: z
      .array(z.string().min(1).max(400))
      .max(ADOPTION_LIMITS.MAX_TOUCHED_PATHS)
      .optional(),
  })
  .strict();

export type AdoptionCandidate = z.infer<typeof AdoptionCandidateSchema>;

export const AdoptionRequestSchema = z
  .object({
    machineName: z.string().min(1).max(255),
    candidates: z.array(AdoptionCandidateSchema).min(1).max(ADOPTION_LIMITS.MAX_CANDIDATES),
    /**
     * Preview. Every read runs — routing, duplicate detection, branch and title
     * matching — and the response says what creation *would* do. Nothing is
     * written and no Linear issue is created.
     *
     * This is what `devpilot sessions scan` calls, so the matches a user sees
     * before confirming are the real ones rather than a local guess that can
     * disagree with the server.
     */
    dryRun: z.boolean().default(false),
  })
  .strict();

export type AdoptionRequest = z.infer<typeof AdoptionRequestSchema>;

export const AdoptionOutcomeSchema = z.object({
  adoptionKey: z.string(),
  status: AdoptionOutcomeStatusSchema,
  /** `dispatch_sessions.id`, or null when nothing was written. */
  sessionId: z.string().nullable(),
  linearIdentifier: z.string().nullable(),
  linearUrl: z.string().url().nullable(),
  matchedBy: AdoptionMatchKindSchema.nullable(),
  /** Present for `skipped`, and for any outcome worth explaining. */
  reason: z.string().max(400).optional(),
});

export type AdoptionOutcome = z.infer<typeof AdoptionOutcomeSchema>;

export const AdoptionResponseSchema = z.object({
  outcomes: z.array(AdoptionOutcomeSchema),
  adopted: z.number().int().nonnegative(),
  attached: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  /** Echoed so a client cannot mistake a preview for a write. */
  dryRun: z.boolean(),
});

export type AdoptionResponse = z.infer<typeof AdoptionResponseSchema>;

// ---------------------------------------------------------------------------
// Discovery — the inventory half
// ---------------------------------------------------------------------------

/**
 * A repo seen on a machine, with how much agent activity it carries.
 *
 * Separate from adoption on purpose (TRD 21 §3.1): discovery costs no model
 * call, writes to no board, and calls no Linear API, which is what makes it
 * safe to run on every connect. Adoption creates issues, so it does not.
 */
export const DiscoveredRepoSchema = z
  .object({
    repo: RepoSlugSchema,
    /** The grouping key the portal renders sections by — the GitHub org. */
    owner: z.string().min(1).max(255),
    /** `github.com`, `gitlab.com`, … Never a path. */
    host: z.string().min(1).max(255),
    /** Distinct working directories. Worktrees legitimately inflate this. */
    projectCount: z.number().int().nonnegative(),
    sessionCount: z.number().int().nonnegative(),
    /** The "this is happening right now" number. */
    liveSessionCount: z.number().int().nonnegative(),
    lastActivityAt: z.string().datetime().nullable(),
  })
  .strict();

export type DiscoveredRepo = z.infer<typeof DiscoveredRepoSchema>;

export const DiscoveryRequestSchema = z
  .object({
    machineName: z.string().min(1).max(255),
    repos: z.array(DiscoveredRepoSchema).max(ADOPTION_LIMITS.MAX_DISCOVERED_REPOS),
    /**
     * Directories with agent activity and no resolvable git remote.
     *
     * Reported as a count rather than a list: the paths are the user's private
     * directory layout, and "12 sessions DevPilot cannot route" is the whole of
     * what the onboarding surface needs to say.
     */
    unmappedProjectCount: z.number().int().nonnegative().default(0),
  })
  .strict();

export type DiscoveryRequest = z.infer<typeof DiscoveryRequestSchema>;

export const DiscoveryResponseSchema = z.object({
  /** Rows written or updated. */
  accepted: z.number().int().nonnegative(),
  /** Of those, awaiting a member's decision. */
  proposed: z.number().int().nonnegative(),
  /** Already routed to a machine — nothing to decide. */
  alreadyRouted: z.number().int().nonnegative(),
});

export type DiscoveryResponse = z.infer<typeof DiscoveryResponseSchema>;

// ---------------------------------------------------------------------------
// Linear rendering
// ---------------------------------------------------------------------------

/**
 * Neutralise markdown in attacker-influenced text before it reaches a board.
 *
 * A transcript is untrusted input the moment a user pastes anything into a
 * session, and title/summary are the two fields derived from it. They land in a
 * Linear issue that a whole team reads, so a summary containing
 * `[click here](javascript:…)` or a fenced block that swallows the rest of the
 * comment is a real outcome, not a hypothetical one.
 *
 * Escaping rather than stripping: a title that legitimately contains an
 * underscore should still read correctly.
 */
export function escapeLinearMarkdown(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/([`*_[\]()#<>|~])/g, '\\$1')
    // A lone newline inside a table cell or list item breaks the surrounding
    // structure; these fields are single-paragraph by contract anyway.
    .replace(/\r?\n/g, ' ')
    .trim();
}

export interface AdoptionCommentInput {
  identifier: string;
  machineName: string;
  agent: AdoptionAgent;
  summary?: string;
  branch?: string;
  touchedPaths?: string[];
  startedAt: string;
  lastActivityAt: string;
}

const ADOPTION_FILE_LIMIT = 10;

function durationLabel(startedAt: string, endedAt: string): string {
  const ms = Date.parse(endedAt) - Date.parse(startedAt);
  if (!Number.isFinite(ms) || ms < 0) return 'an unknown duration';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0
    ? `${hours} hour${hours === 1 ? '' : 's'}`
    : `${hours}h ${rest}m`;
}

/**
 * The comment an adopted session posts when it settles.
 *
 * The wording is load-bearing. TRD 21 DECISION A says an adopted session never
 * moves the issue's state, and the reason is that DevPilot did not do this work
 * and cannot judge whether it is finished. A comment that read like a normal
 * completion would undo that care in prose — anyone scanning the ticket would
 * take it as "the agent finished". So it says, in the first line, that the
 * session was observed rather than dispatched, and it never says "completed".
 */
export function buildAdoptionComment(input: AdoptionCommentInput): string {
  const lines: string[] = [
    `:eyes: **Agent session observed** — \`${escapeLinearMarkdown(input.agent)}\` on \`${escapeLinearMarkdown(input.machineName)}\``,
    '',
    `DevPilot did not start this session. It was found already running on the machine and recorded here so the work is on the board.`,
    '',
    `**Ran for:** ${durationLabel(input.startedAt, input.lastActivityAt)}`,
  ];

  if (input.branch) {
    lines.push(`**Branch:** \`${escapeLinearMarkdown(input.branch)}\``);
  }

  if (input.summary) {
    lines.push('', escapeLinearMarkdown(input.summary));
  }

  if (input.touchedPaths && input.touchedPaths.length > 0) {
    lines.push('', '**Files touched:**');
    for (const path of input.touchedPaths.slice(0, ADOPTION_FILE_LIMIT)) {
      lines.push(`- \`${escapeLinearMarkdown(path)}\``);
    }
    if (input.touchedPaths.length > ADOPTION_FILE_LIMIT) {
      lines.push(`- … and ${input.touchedPaths.length - ADOPTION_FILE_LIMIT} more`);
    }
  }

  lines.push(
    '',
    '_This issue was not moved. Only a person can say whether observed work is done._',
  );

  return lines.join('\n');
}

/** The body of an issue created for an adopted session. */
export function buildAdoptionIssueDescription(input: {
  machineName: string;
  agent: AdoptionAgent;
  repo: string;
  branch?: string;
  summary?: string;
  startedAt: string;
}): string {
  const lines: string[] = [
    `Created by DevPilot from an agent session already running on \`${escapeLinearMarkdown(input.machineName)}\`.`,
    '',
    `**Repo:** \`${escapeLinearMarkdown(input.repo)}\``,
  ];

  if (input.branch) {
    lines.push(`**Branch:** \`${escapeLinearMarkdown(input.branch)}\``);
  }
  lines.push(`**Session started:** ${escapeLinearMarkdown(input.startedAt)}`);

  if (input.summary) {
    lines.push('', escapeLinearMarkdown(input.summary));
  }

  lines.push(
    '',
    '_DevPilot observed this session; it did not dispatch it. Status here reflects_',
    '_whether the session is still running, not whether the work is complete._',
  );

  return lines.join('\n');
}

/**
 * The Linear identifier a branch name is claiming, if any.
 *
 * `AVA-31-fleet-scan`, `feature/AVA-31`, `garrett/ava-31-x` → `AVA-31`.
 *
 * Lowercase is accepted because git branch conventions routinely lowercase the
 * key, and rejecting those would miss most real matches. The team key is
 * verified against the workspace's actual teams by the caller — this function
 * only proposes a candidate identifier.
 *
 * ## Two deliberate narrowings, both from real branch names
 *
 * **Letters only in the key.** `[A-Za-z0-9]` would read `v1-2-3` as `V1-2`.
 * Linear permits digits in a team key (`A11Y`), so this misses that case; a
 * missed match costs one unnecessary issue, while a wrong match silently
 * attaches an agent session to a stranger's ticket. The asymmetry decides it.
 *
 * **Dates are not identifiers.** `work-2026-08-09` parses as `WORK-2026` on any
 * naive pattern, and worktree directories named exactly that exist on the
 * machine this was built against. A number followed by `-DD-DD` is a date.
 */
const BRANCH_IDENTIFIER_RE = /(?:^|[^A-Za-z0-9])([A-Za-z]{2,5})-(\d{1,6})(?![0-9])/g;

export function linearIdentifierFromBranch(branch: string): string | null {
  BRANCH_IDENTIFIER_RE.lastIndex = 0;

  for (let m = BRANCH_IDENTIFIER_RE.exec(branch); m; m = BRANCH_IDENTIFIER_RE.exec(branch)) {
    const rest = branch.slice(m.index + m[0].length);
    if (/^-\d{2}(?:-\d{2})?(?![0-9])/.test(rest)) continue; // a date, not a ticket
    return `${m[1].toUpperCase()}-${m[2]}`;
  }

  return null;
}
