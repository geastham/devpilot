# TRD 21 — Fleet Introspection & Adoption
## Discovering Live Agent Sessions · Backing Them Onto the Board · Repo/Org Scaffolding
### v1.1 · August 2026 · Status: BUILT

> **Change log — v1.1 (21 Aug 2026)**
> - All five waves built. 93 new tests in `devpilot`, 37 in `devpilot-website`.
> - **§6.1 corrected by real data.** A single 64 KB head read was wrong: a
>   session can open with one `attachment` entry larger than the whole chunk,
>   which produced `Agent session 9030b53a` titles for three of the first eight
>   live sessions on the reference machine. The probe now reads bounded chunks
>   to `MAX_PROBE_BYTES`, and scrapes rather than parses any line over 128 KB.
>   T21-AC-02 restated accordingly, and T21-AC-02b added.
> - **§8.2 corrected.** The matcher was deriving a team key from the team name.
>   Linear has always returned the real key in the OAuth flow and it was
>   discarded; `team_configs.linear_team_key` now stores it. A guess living next
>   to the real answer is two sources of truth.
> - **§5 `linearIdentifierFromBranch` narrowed twice**, both from real branch
>   names: `v1-2-3` parsed as `V1-2`, and `work-2026-08-09` — a worktree name
>   that exists on this machine — parsed as `WORK-2026`.
> - **§4.3 gains `transcriptPaths`** on the scan result, local-only, so the
>   summarizer can re-read one transcript without `SessionObservation` (which
>   carries transcript text) ever becoming part of the value that is uploaded.
> - §7.1 step 3 gains a cross-team check. Linear's issue search is
>   workspace-wide, so a branch named `ENG-4` would otherwise attach an agent
>   session to another team's ticket four.
> - **Not proven:** every Linear call in the test suite goes to a local GraphQL
>   stub. No issue has been created in a live Linear workspace (§10).

> **Depends on:** `04-HOSTED-ACCOUNTS.md` (orgs, guards, machine tokens),
> `05-HOSTED-BRIDGE.md` (queue, routing, `dispatch_sessions`, Linear write-back).
> Both shipped. This TRD extends them and reverses nothing.
>
> **Repo split:** `devpilot-website` owns schema, routes, and portal UI.
> `devpilot` owns the protocol additions, the scanner, and CLI commands.
> No task touches both.
>
> This TRD owns the table `discovered_repos`, the columns
> `dispatch_sessions.origin` and `dispatch_sessions.adoption_key`, and the CLI
> commands `devpilot sessions scan` / `devpilot sessions adopt`.

---

## 1. Problem Statement & Goals

### 1.1 Problem

DevPilot's loop runs in exactly one direction. A Linear issue is delegated to
the bot, the hosted plane routes it to a machine, that machine starts an agent,
and the agent reports back. Every session DevPilot knows about is a session
DevPilot started.

Meanwhile the same engineer has six Claude Code sessions open that DevPilot
started none of. They are the *majority* of the agent work happening on that
machine, and to the product they do not exist. Concretely, on the reference
machine at the time of writing:

```
$ ls ~/.claude/projects | wc -l
38
```

Thirty-eight project directories, several with sessions modified within the
last minute, and the board shows none of them.

This produces four specific failures:

1. **The board lies about capacity.** `FleetContextService.assembleContext`
   (`packages/core/src/wave-planner/fleet-context.ts:19`) computes available
   workers as `4 − activeSessions` counted from `ruflo_sessions`. Sessions
   DevPilot did not start are invisible to that count, so the planner believes a
   machine is idle while four agents are running on it.
2. **The board lies about files.** `getAvoidFiles` exists precisely so two
   agents do not edit the same file. An unadopted session holds files that no
   in-flight-file record covers, so the guard is silently partial.
3. **Onboarding starts from zero.** A new user connects the bridge and sees an
   empty fleet, an empty session list, and an empty board. Everything they have
   *already been doing* with agents is on the other side of a wall.
4. **The work is unrecorded.** An hour of agent work that produced a real diff
   leaves nothing on the ticket, because there was no ticket.

Item 3 is the commercial one. The product's first-run experience should not be a
blank page; it should be recognition.

### 1.2 The insight

The transcript store is already a complete, structured, local record of every
agent session on the machine. `~/.claude/projects/<cwd-slug>/<uuid>.jsonl`
carries, per entry, the working directory, the git branch, the timestamp, the
CLI version, and — for the entries that matter — a `custom-title` the client
already computed and the human's own first prompt. A live session is further
identifiable by its scratchpad directory, whose *name is the session UUID*:

```
/private/tmp/claude-501/<cwd-slug>/<session-uuid>/scratchpad
~/.claude/projects/<cwd-slug>/<session-uuid>.jsonl
```

So process → session → transcript → cwd → git remote → repo is a join that
needs no API, no daemon, and no cooperation from the agent. Introspection is a
filesystem walk.

### 1.3 Goals

1. **Adoption.** A running or recently-active agent session that DevPilot did
   not start gets a place on the Linear board — attached to an existing issue
   where one can be identified, and a new issue otherwise.
2. **Discovery.** The same walk produces an inventory of the repos and GitHub
   owners present on the machine, pushed as *proposals* the org can accept.
3. **Scaffolding.** Those proposals drive first-run setup: repo routes, and a
   suggested `defaultRepo` per Linear team when a workspace connects. Turning
   the bridge on populates the product.
4. **Preview before write.** Nothing reaches a shared board without a human
   seeing the exact list first.
5. **The invariant is untouched.** No transcript, diff, or file content crosses
   the boundary. TRD 05 §1.3 still holds and is not negotiable.

### 1.4 Non-Goals

- **Steering an adopted session.** DevPilot did not spawn it, holds no session
  handle, and will not acquire one. Adoption is observation (§3.4).
- **Replacing dispatch.** The dispatch path is unchanged. Adoption is a second,
  parallel origin for a session row, not a rewrite of the first.
- **Reading transcripts server-side.** There is no route that accepts transcript
  content, and no column that could hold it (§3.3).
- **Auto-creating tenants.** A machine token may propose structure; it may never
  create an organization (§7.2).
- **Adopting other agents.** Claude Code's transcript store is the only format
  parsed in v1. Codex and `ao` are §11 follow-ups; the `SessionProbe` interface
  is shaped for them but only one implementation ships.

---

## 2. Current State (file-cited)

| Area | File | State |
| --- | --- | --- |
| Session rows | `devpilot-website/lib/db/schema/sessions.ts:26` | `dispatch_sessions`. Every row implies a dispatch: `orchestrator_id` set at webhook time, `linear_issue_id` NOT NULL. No column distinguishes *how* the row came to exist. |
| Dispatch entry | `devpilot-website/app/api/webhooks/linear/route.ts:288` | The only writer of `dispatch_sessions` that creates work. Session + event + queue row in one transaction. |
| Routing | `devpilot-website/lib/db/schema/orchestrators.ts:38` | `repo_routes`, UNIQUE(org_id, repo). Written at register time from `--repos`. |
| Register | `devpilot-website/app/api/orchestrators/register/route.ts:31` | Upserts the machine and its repo routes under the token's org. The one place a machine declares what it has. |
| Linear write-back | `devpilot-website/lib/bridge/linear.ts:118` | `syncSessionCompletionToLinear`. Comments, then moves to a completed state **when `success`**. Never throws. |
| Linear reads | `devpilot-website/lib/bridge/workspace-secrets.ts:124` | `getLinearApiKey(workspaceId)`. The only sanctioned decrypt path. |
| Bridge client | `devpilot/packages/bridge-client/src/client.ts:63` | `register`, `poll`, `claim`, `reportSessionStatus`, `reportSessionComplete`, `mirrorSessionPlan`. No adoption surface. |
| Bridge start | `devpilot/packages/cli/src/commands/bridge/connect.ts:112` | Registers, then starts the dispatch loop. Nothing inspects the machine. |
| Re-adoption precedent | `devpilot/packages/cli/src/commands/bridge/conductor-watcher.ts:275` | `restore()` re-adopts *DevPilot's own* orphaned runs from a disk ledger. The mechanism this TRD generalizes. |
| Fleet capacity | `devpilot/packages/core/src/wave-planner/fleet-context.ts:19` | Counts only sessions in DevPilot's own store. The undercount in §1.1. |
| Model tiers | `devpilot/packages/core/src/wave-planner/models.ts:44` | `resolvePlannerModel()` / `resolveWikiModel()`. Summarization is explicitly the wiki tier. |

Nothing in the codebase reads `~/.claude`. The single reference —
`packages/cli/src/utils/orchestrator.ts:263` — checks for hook scripts and does
not touch `projects/`.

---

## 3. Architecture

### 3.1 The shape

```
YOUR MACHINE — devpilot bridge                  HOSTED PLANE                 LINEAR
┌───────────────────────────────────┐        ┌──────────────────────┐     ┌────────┐
│ scan ~/.claude/projects/*.jsonl   │        │                      │     │        │
│   head+tail probe, never full read│        │                      │     │        │
│              ↓                    │        │                      │     │        │
│  SessionObservation               │        │                      │     │        │
│   uuid · cwd · branch · title     │        │                      │     │        │
│   firstPrompt · lastActivity      │        │                      │     │        │
│              ↓ resolve            │        │                      │     │        │
│  git remote → owner/name          │        │                      │     │        │
│              ↓ classify           │        │                      │     │        │
│  routed? devpilot-owned? fresh?   │        │                      │     │        │
│              ↓ summarize (LOCAL)  │        │                      │     │        │
│  AdoptionCandidate                │  POST  │ match → attach/create│ GQL │ issue  │
│   title · summary · repo · branch │───────►│ dispatch_sessions    │────►│        │
│   adoptionKey · touchedPaths      │        │   origin='adopted'   │     │        │
│              ↓                    │◄───────│   adoption_key uniq  │     │        │
│  ledger ~/.devpilot/adopted.json  │        │                      │     │        │
│              ↓ watch mtime        │        │                      │     │        │
│  status ─────────────────────────►│───────►│ progress event       │     │        │
│  settle ─────────────────────────►│───────►│ complete (NO move) ──┼────►│ comment│
│                                   │        │                      │     │        │
│ ── discovery, same walk ──────────│        │                      │     │        │
│  DiscoveredRepo[] (owner/name)    │───────►│ discovered_repos     │     │        │
│                                   │        │ status='proposed'    │     │        │
└───────────────────────────────────┘        └──────────────────────┘     └────────┘
```

Two pushes, deliberately separate:

- **Discovery** is an inventory. Cheap, no model call, no board write, no Linear
  API call. It is safe enough to run on every `bridge connect`.
- **Adoption** is a commitment. It creates issues on a shared board, so it is
  explicit, previewed, and never automatic without a flag.

### 3.2 Why this lives on the bridge

The hosted plane cannot see `~/.claude`, and giving it a way to would be the
same architectural mistake TRD 05 §3.2 removed when it deleted GCP: it would
require the laptop to hand credentials or content upward. The scan runs where
the data already is, and only conclusions travel.

This also means adoption works identically for a self-hosted bridge. Anything
implementing `@devpilot.sh/bridge-protocol` gets it by implementing two routes.

### 3.3 What crosses the boundary — DECISION B

**The transcript never leaves the machine.** What crosses is a fixed, closed
list:

| Field | Source | Why it is safe |
| --- | --- | --- |
| `adoptionKey` | `sha256(machineName + ':' + sessionUuid)` | Opaque. Idempotence only. |
| `title` | `custom-title` entry, or the summarizer | Already a one-line label. |
| `summary` | Local model call, ≤ 400 chars | Derived; never quoted source. |
| `repo` | `git remote get-url origin`, normalized | Already declared at register time. |
| `branch` | `gitBranch` field on transcript entries | A ref name. |
| `startedAt` / `lastActivityAt` | Transcript timestamps | Times. |
| `messageCount` | Entry count | An integer. |
| `touchedPaths` | `git status --porcelain -uall` paths | **Paths only, never contents.** Capped at 50. |
| `agent` | Constant `'claude-code'` | — |

Enforcement is structural, not editorial:

1. `AdoptionCandidateSchema` is a **`.strict()` zod object** in
   `@devpilot.sh/bridge-protocol`. An extra key is a parse failure on both
   sides, so a future field cannot be added by a caller — only by amending the
   contract.
2. The hosted table has **no column** that could hold transcript text.
   `summary` is `text` and already exists; `metadata` is jsonb and is written
   from a whitelist in the route, not spread from the request body.
3. `scripts/check-secret-columns.mjs` already gates the ciphertext columns. This
   TRD adds no secret columns and needs no new allowlist entry.

`touchedPaths` is the one genuinely new class of information — file *paths* in
a private repo. It is what makes `getAvoidFiles` correct for adopted sessions
(§1.1 item 2), which is the reason to accept it. It is capped, it is opt-out
with `--no-paths`, and the preview shows it.

### 3.4 Adopted is not dispatched — DECISION A

An adopted session row is a *record of work DevPilot is watching*, not work
DevPilot is doing. Three consequences, all enforced:

1. **No queue row.** Adoption never calls `enqueueDispatch`. There is nothing
   to claim, so the stale sweep never sees it.
2. **Commands are rejected.** `POST /api/sessions/:id/commands` returns 409 for
   `origin = 'adopted'`. `approve`/`replan`/`abort` are meaningless against a
   session with no dispatch handle — accepting them would create a control
   affordance the product cannot honour, which is worse than not offering it.
3. **Completion never moves the issue.** `syncSessionCompletionToLinear` gains
   an explicit `moveToDone` parameter, and adoption passes `false`.

Point 3 is the important one and deserves its own statement, because it is the
difference between a useful feature and a dangerous one:

> **DevPilot did not do this work and cannot judge whether it is finished.** A
> transcript going quiet means a person closed a terminal. It does not mean the
> task is done, and moving a ticket to Done on that evidence would be a lie the
> board cannot distinguish from a real completion.

The adopted-session completion comment says exactly what happened — how long the
session ran, what it touched, and that it was observed rather than dispatched —
and leaves the issue where it is.

### 3.5 Scope — DECISION C

The default scan is restricted to repos this machine already routes: the
`--repos` set from `bridge connect`, which is the same set `repo_routes` holds.

The reference machine makes the reason concrete. `~/.claude/projects` there
contains work for `devpilot`, `arthaus`, `neurograph`, and `memoryframe` — four
unrelated clients. A scan that defaults to everything would push one client's
repo names into another client's Linear workspace on the strength of a flag the
user flipped once.

- Default: routed repos only.
- `--all-repos`: everything, with every owner named in the preview.
- `--repo <owner/name>`: an explicit subset.
- A cwd with no git remote is **never** adopted (there is no repo to attach to)
  but *is* counted in discovery as `unmapped`, because "you have 12 sessions in
  directories DevPilot cannot route" is exactly the onboarding signal §1.3 wants.

### 3.6 Discovery proposes; it does not create — DECISION D

Discovery pushes an inventory. The hosted plane stores it as `proposed` and
renders it. Accepting a proposal is a portal action taken by a *member*, not by
the machine, and the split is by capability:

| Object | May a machine token create it? | Why |
| --- | --- | --- |
| `discovered_repos` row | **Yes** | It is an observation, scoped to the token's org, and inert. |
| `repo_routes` row | Yes, on accept | Already true today: `register` writes routes from `--repos`. |
| `dispatch_sessions` (adopted) | Yes | The point of the feature; idempotent and previewed. |
| Linear issue | Yes, via adoption | Previewed, and match-before-create (§6.4). |
| `team_configs.defaultRepo` | **No — suggestion only** | It is the switch that makes dispatch fire. |
| `organizations` | **Never** | The tenant root. A laptop scan must not mint tenants. |

---

## 4. Data Model

### 4.1 `dispatch_sessions` — two columns

```ts
// devpilot-website/lib/db/schema/sessions.ts
export const SESSION_ORIGINS = ['dispatched', 'adopted'] as const;

origin: text('origin', { enum: SESSION_ORIGINS }).notNull().default('dispatched'),
adoptionKey: text('adoption_key'),
```

`default('dispatched')` makes the migration a no-op for every existing row and
every existing writer. The webhook route is not touched.

Index:

```sql
CREATE UNIQUE INDEX dispatch_sessions_adoption_key_uniq
  ON dispatch_sessions (org_id, adoption_key)
  WHERE adoption_key IS NOT NULL;
```

Partial, so the millions of dispatched rows with `NULL` do not collide. This is
the idempotence guarantee: re-running `adopt` writes nothing, and it survives the
local ledger being deleted, which a `rm -rf ~/.devpilot` makes routine.

`adoption_key` is `sha256(machineName + ':' + sessionUuid)` — computed on the
machine, opaque on the wire. Machine name is in the hash because two laptops can
hold transcripts with the same UUID only by copying a `~/.claude` directory, and
if someone does, those are genuinely two observations.

Adopted rows carry in `metadata` (whitelisted in the route, never spread):

```ts
{
  agent: 'claude-code',
  claudeSessionId: string,
  machineName: string,
  branch?: string,
  touchedPaths?: string[],   // ≤ 50
  messageCount?: number,
  adoptedAt: string,
  matchedBy: 'branch' | 'title' | 'created',
}
```

### 4.2 `discovered_repos` (new)

```ts
export const DISCOVERY_STATUSES = ['proposed', 'routed', 'ignored'] as const;

export const discoveredRepos = pgTable('discovered_repos', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  orgId: text('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  orchestratorId: text('orchestrator_id').notNull()
    .references(() => orchestrators.id, { onDelete: 'cascade' }),
  /** `owner/name`, normalized from the git remote. */
  repo: text('repo').notNull(),
  /** The grouping key the portal renders sections by. */
  owner: text('owner').notNull(),
  /** `github.com`, `gitlab.com`, … or `local` for a repo with no remote. */
  host: text('host').notNull().default('github.com'),
  /** Distinct working directories seen for this repo (worktrees inflate this). */
  projectCount: integer('project_count').notNull().default(0),
  /** Agent sessions observed for this repo in the scan window. */
  sessionCount: integer('session_count').notNull().default(0),
  /** Sessions still live at scan time. The "this is happening now" number. */
  liveSessionCount: integer('live_session_count').notNull().default(0),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
  status: text('status', { enum: DISCOVERY_STATUSES }).notNull().default('proposed'),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniq: unique('discovered_repos_org_machine_repo_uniq')
    .on(t.orgId, t.orchestratorId, t.repo),
  byOrg: index('discovered_repos_org_idx').on(t.orgId, t.status),
}));
```

Scoped to `(org, machine)` because two laptops in the same org legitimately see
different repos, and the portal wants to say *which* machine has the work.

`status` transitions: `proposed → routed` when a member accepts (which writes
`repo_routes`), `proposed → ignored` when they dismiss. A re-scan updates counts
and `lastActivityAt` but **never resets `ignored` back to `proposed`** — a
dismissal that un-dismisses itself on the next heartbeat is how a feature
becomes something users turn off.

### 4.3 Local ledger — `~/.devpilot/adopted.json`

```ts
interface AdoptionLedger {
  version: 1;
  entries: Record<string /* claude session uuid */, {
    adoptionKey: string;
    sessionId: string;          // hosted dispatch_sessions.id
    identifier: string;         // e.g. AVA-42
    transcriptPath: string;
    repo: string;
    lastReportedAt: string;
    lastMtimeMs: number;
    settled: boolean;
  }>;
}
```

Mirrors `conductor-watch.json` (`conductor-watcher.ts:275`) in both purpose and
failure posture: restored entries are **claims to verify, not truth**. An entry
whose transcript file no longer exists is dropped rather than polled forever.

### 4.4 DevPilot's own sessions must not be adopted

The session-runner spawns `claude -p` and those runs write transcripts like any
other. Adopting them would double-count work already on the board.

Two mechanisms, because either alone has a hole:

1. **Exact.** `claude -p --output-format json` returns `session_id`
   (`claude-runner.ts:32` already parses this envelope). The runner appends it to
   `~/.devpilot/owned-sessions.json`. The scanner excludes those UUIDs outright.
2. **Structural.** DevPilot-composed prompts carry a stable marker
   (`session-prompt.ts` already emits the callback block). The probe treats a
   first human prompt containing `DEVPILOT_SESSION_ID` as owned.

Mechanism 1 is exact but requires the runner to have written the file, which it
will not have for sessions predating this TRD. Mechanism 2 covers those. Neither
is load-bearing alone; the union is.

---

## 5. Wire Contract — `@devpilot.sh/bridge-protocol`

New module `src/adoption.ts`, re-exported from the barrel.

```ts
export const ADOPTION_AGENTS = ['claude-code'] as const;

export const AdoptionCandidateSchema = z.object({
  adoptionKey: z.string().length(64),
  agent: z.enum(ADOPTION_AGENTS),
  title: z.string().min(1).max(120),
  summary: z.string().max(400).optional(),
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  branch: z.string().max(255).optional(),
  startedAt: z.string().datetime(),
  lastActivityAt: z.string().datetime(),
  messageCount: z.number().int().nonnegative().optional(),
  live: z.boolean(),
  touchedPaths: z.array(z.string().max(400)).max(50).optional(),
}).strict();

export const AdoptionRequestSchema = z.object({
  machineName: z.string().min(1).max(255),
  candidates: z.array(AdoptionCandidateSchema).min(1).max(100),
  /** Preview: validate, match, and report — write nothing. */
  dryRun: z.boolean().default(false),
}).strict();

export const AdoptionOutcomeSchema = z.object({
  adoptionKey: z.string(),
  status: z.enum(['adopted', 'duplicate', 'attached', 'skipped']),
  sessionId: z.string().nullable(),
  linearIdentifier: z.string().nullable(),
  linearUrl: z.string().url().nullable(),
  matchedBy: z.enum(['branch', 'title', 'created']).nullable(),
  reason: z.string().optional(),
});

export const AdoptionResponseSchema = z.object({
  outcomes: z.array(AdoptionOutcomeSchema),
  adopted: z.number().int(),
  skipped: z.number().int(),
});

export const DiscoveredRepoSchema = z.object({
  repo: z.string(),
  owner: z.string(),
  host: z.string().max(255),
  projectCount: z.number().int().nonnegative(),
  sessionCount: z.number().int().nonnegative(),
  liveSessionCount: z.number().int().nonnegative(),
  lastActivityAt: z.string().datetime().nullable(),
}).strict();

export const DiscoveryRequestSchema = z.object({
  machineName: z.string().min(1).max(255),
  repos: z.array(DiscoveredRepoSchema).max(500),
  /** Directories with agent activity and no resolvable git remote. */
  unmappedProjectCount: z.number().int().nonnegative().default(0),
}).strict();
```

`.strict()` on the two request schemas and on the candidate is the enforcement
described in §3.3. `max(100)` on candidates bounds a single request; the CLI
chunks beyond that.

`buildAdoptionComment(...)` joins `buildBridgeCompletionComment` in
`messages.ts`, so the hosted bridge and any third-party bridge render the same
Linear comment. Its body states plainly that the session was observed, not
dispatched.

---

## 6. Core Components

### 6.1 `packages/core/src/adoption/transcript.ts` — the probe

```ts
export interface SessionObservation {
  sessionUuid: string;
  transcriptPath: string;
  cwd: string | null;
  gitBranch: string | null;
  customTitle: string | null;
  firstHumanPrompt: string | null;
  startedAt: string | null;
  lastActivityAt: string;      // from mtime, not content
  messageCount: number;
  sizeBytes: number;
  isSidechain: boolean;
}
```

**It must not read whole files.** The reference machine has a 36 MB transcript
and 670 sessions across 38 project directories; `JSON.parse` per line over all
of it on every `bridge connect` would make the command feel broken. The probe
therefore reads **64 KB chunks from the front, stopping as soon as it has `cwd`,
a title and a first prompt, and never exceeding 1 MB** (`MAX_PROBE_BYTES`).

> **Corrected during Wave 2, from real data.** The first version read exactly
> one 64 KB chunk. On the reference machine that produced useless titles —
> `Agent session 9030b53a` — for three of the first eight live sessions, because
> a session can open with a single `attachment` entry (a pasted file, an image)
> **larger than the whole chunk**, pushing `custom-title` and the first human
> prompt past it. A fixed single-chunk read is wrong; a bounded progressive one
> is right, and still costs one read for a well-formed transcript.

Also:

- `lastActivityAt` comes from `stat().mtime`, one syscall rather than a scan.
- A line over 128 KB is **not** parsed as JSON. `JSON.parse` on a multi-megabyte
  attachment to reach a 40-character `cwd` is the one genuinely wasteful thing
  this module could do, so those lines are scraped for `cwd` and `gitBranch`
  with a targeted regex. `content` is never touched on that path.
- `messageCount` is estimated from bytes-per-entry and flagged approximate
  rather than pretending to precision nobody paid for.
- `headSample` — what the summarizer sees — is the **first chunk only**. Later
  chunks exist to find a title, not to widen what a model is shown.

Malformed lines are skipped, not thrown on. A transcript being written
concurrently has a torn final line by definition, and a scanner that crashes on
live data is useless.

Measured on the reference machine: **670 sessions across 38 project directories
in 634 ms.**

### 6.2 `packages/core/src/adoption/repo.ts` — resolution

`cwd → owner/name`. Runs `git -C <cwd> remote get-url origin` (execFile, no
shell, 2 s timeout) and normalizes:

```
git@github.com:openconjecture/devpilot.git  → github.com  openconjecture/devpilot
https://github.com/openconjecture/devpilot  → github.com  openconjecture/devpilot
/Users/x/scratch (no remote)                → local       null
```

Results are memoized per cwd for the process. Worktrees resolve to the same
repo as their parent, which is correct — `--claude-worktrees-*` directories are
visible in the reference scan and are the same project.

A `cwd` that no longer exists (a deleted scratch directory) yields `null` and is
dropped from adoption, counted in `unmappedProjectCount`.

### 6.3 `packages/core/src/adoption/scanner.ts` — the walk

```ts
export interface ScanOptions {
  root?: string;                 // default ~/.claude/projects
  repos?: string[];              // routed set; empty = all (with --all-repos)
  liveWithinMs?: number;         // default 15 min
  sinceMs?: number;              // default 24 h
  excludeSessionUuids?: Set<string>;
  includePaths?: boolean;        // default true
  now?: Date;
}

export interface ScanResult {
  candidates: AdoptionCandidate[];
  discovered: DiscoveredRepo[];
  unmappedProjectCount: number;
  skipped: { sessionUuid: string; reason: SkipReason }[];
}

export type SkipReason =
  | 'devpilot-owned' | 'not-routed' | 'no-repo' | 'too-old'
  | 'sidechain' | 'empty' | 'unreadable';
```

Every exclusion is *reported*, not silently dropped. A user who expects a
session to appear and does not see it must be able to find out why in the
preview output — a scanner whose skips are invisible is indistinguishable from
one that is broken.

Liveness:

- `live` — mtime within `liveWithinMs` **or** the scratchpad directory
  `/private/tmp/claude-<uid>/<cwd-slug>/<session-uuid>` exists.
- `recent` — mtime within `sinceMs`. Adoptable.
- older — skipped as `too-old`.

The scratchpad check is what distinguishes a session that is thinking (no
transcript write for several minutes) from one that ended.

### 6.4 `packages/core/src/adoption/summarize.ts`

Two tiers, and the lower one is not a degraded mode — it is the floor:

1. **Heuristic (always available).** `customTitle` if present — the client
   already computed a human title, visible in the reference transcript as
   `"DevPilot: Claude Code Bootstrap"`. Otherwise the first human prompt,
   collapsed to one line and truncated at 120 chars on a word boundary.
2. **Model (when `ANTHROPIC_API_KEY` is set).** One call at
   `resolveWikiModel()` — summarization is explicitly that tier per
   `models.ts:33` — over the head sample plus `touchedPaths`, returning a title
   and a ≤ 400 char summary.

**A missing API key must never block adoption.** The heuristic title from
`custom-title` is genuinely good, and gating the whole feature on a key the user
may not have would make the headline experience — turn it on, everything is
there — conditional on configuration.

The model call is per-candidate and bounded: `--max-summaries` (default 25),
concurrency 4, 20 s timeout each, and any failure degrades that one candidate to
the heuristic rather than failing the scan.

### 6.5 `packages/cli/src/commands/sessions/` — the commands

```
devpilot sessions scan  [--all-repos] [--repo <r>] [--since 24h] [--json]
devpilot sessions adopt [--all-repos] [--repo <r>] [--since 24h] [--yes]
                        [--no-paths] [--max-summaries <n>]
```

`scan` is read-only and reaches the network **only** for `--json`-less pretty
output of what *would* happen — it calls the adoption route with `dryRun: true`
so the match results shown are the real ones, not a local guess.

`adopt` prints the same table and requires confirmation unless `--yes`:

```
  Scanned 38 project directories · 12 sessions in the last 24h

  REPO                          SESSION                          LAST     → BOARD
  openconjecture/devpilot       Fleet introspection & adoption   2m  ●    → create
  openconjecture/devpilot       Release CLI 0.4.0                4h       → AVA-31 (branch)
  openconjecture/website        Cockpit landing copy             1h  ●    → create

  Skipped: 3 not routed (arthaus, neurograph), 2 DevPilot-owned, 4 older than 24h
           Run with --all-repos to include the others.

  This creates 2 Linear issues in Avant-Garde and attaches 1 existing.
  Continue? [y/N]
```

The skip line names the owners it is holding back. That is the §3.5 consent
moment made concrete: the user sees *arthaus* and *neurograph* named and chooses.

### 6.6 `packages/cli/src/commands/bridge/adoption-watcher.ts`

The counterpart to `ConductorWatcher`, same posture and same disk-backed
restore. Per adopted session, on a 60 s tick:

- mtime advanced → `reportSessionStatus({ status: 'running', progressPercent })`,
  where progress is a **time-boxed heuristic explicitly labelled as such** — an
  adopted session has no plan, so there is no real denominator. It reports
  `progressPercent: 0` and puts elapsed time in the message rather than inventing
  a fraction.
- mtime static for `--settle` (default 30 min) → `reportSessionComplete` with
  `success: true`, the summary, and `moveToDone: false` (§3.4).
- transcript file gone → drop the entry, report nothing.

### 6.7 `BridgeClient` additions

```ts
async adoptSessions(req: AdoptionRequest): Promise<AdoptionResponse>
async reportDiscovery(req: DiscoveryRequest): Promise<{ accepted: number }>
```

`reportDiscovery` returns a count and never throws into the caller — discovery
failing must not stop a bridge from connecting.

---

## 7. API Surface (hosted)

### 7.1 `POST /api/adoptions`

Auth: `requireOrchestrator` (machine token). Org is the token's org; the caller
cannot choose.

```
200 { outcomes: AdoptionOutcome[], adopted: n, skipped: m }
400 invalid_request   — schema failure, including an unknown key
409 no_workspace      — the org has no connected Linear workspace
```

Per candidate, in order:

1. **Duplicate.** `adoption_key` already present for this org → `duplicate`,
   returning the existing `sessionId` and identifier. Cheapest path, taken first
   because it is the common one on re-run.
2. **Route.** Resolve `repo → repo_routes → orchestrator`. No route → `skipped`
   with reason. Resolve `repo → team_configs` for the team to create in; if more
   than one team maps to the repo, take the lowest-priority-ordered route and say
   so in `reason`.
3. **Branch match.** `branch` matching `/\b([A-Z][A-Z0-9]{1,5})-(\d+)\b/` and the
   key belongs to a known team → look the issue up by identifier. Found and open
   → `attached`, `matchedBy: 'branch'`.
4. **Title match.** Exact, case-insensitive title match against the team's open
   issues → `attached`, `matchedBy: 'title'`. Exact only: fuzzy matching that
   attaches to the wrong ticket is worse than creating a new one, because the
   wrong attachment is silent and the extra issue is visible.
5. **Create.** `issueCreate` in the resolved team, titled from the candidate,
   described with the summary and a plain statement that DevPilot observed this
   session on machine *N* and did not start it. → `matchedBy: 'created'`.

Then one INSERT into `dispatch_sessions` with `origin: 'adopted'`,
`status: 'running'` (or `'complete'` when `!live` and already settled),
`orchestrator_id` from the route, and the whitelisted metadata. **No
`enqueueDispatch`.** Plus a `session_events` row of type `created` with message
`Adopted from <machine>`.

`dryRun: true` performs steps 1–4 (all reads) and reports what step 5 *would*
do, without the `issueCreate` and without the INSERT.

### 7.2 `POST /api/discovery`

Auth: `requireOrchestrator`. Upserts `discovered_repos` on
`(org_id, orchestrator_id, repo)`, updating counts and `last_activity_at`,
preserving `status` (§4.2).

Returns `{ accepted, proposed, alreadyRouted }` so the CLI can print
*"6 repos proposed — review at devpilot.sh/fleet/discovered"*.

### 7.3 `POST /api/orgs/[id]/discovered-repos/[repoId]/accept`

Auth: `requireOrgRole(orgId, ['owner', 'admin'])`. **Browser session, not a
machine token** — this is the capability boundary from §3.6. Writes a
`repo_routes` row and flips `status` to `routed`.

`…/ignore` is the mirror, and is `requireOrgMember`.

### 7.4 `POST /api/sessions/[id]/commands` — one added guard

Reject `origin = 'adopted'` with 409 and a message saying why (§3.4 item 2).

---

## 8. PLG: what turning it on actually does

This section is the product argument, and it is why discovery ships alongside
adoption rather than after it.

### 8.1 First `bridge connect`

Today: registers, prints `repos: (none)`, warns that nothing can route, listens.
A blank board.

After: registers, scans, and prints

```
  ✓ Registered
    orchestrator: orc_xxx
    repos: (none)
    ⚠ No repos specified — nothing can route to this machine.

  Looked around this machine: 38 projects, 6 owners, 12 sessions in 24h

    openconjecture   4 repos   7 sessions   ● 2 live
    arthaus          2 repos   3 sessions
    memoryframe      1 repo    2 sessions

    Review and route them: https://devpilot.sh/fleet/discovered
```

The warning about no repos is immediately followed by the answer to it. That is
the whole PLG move: the product's first act is to demonstrate it can already see
the user's world.

### 8.2 Linear connect

`app/api/integrations/linear/oauth/callback/route.ts` already seeds a
`team_configs` row per Linear team with `autoDispatch` off and no `defaultRepo`,
and the comment there records why: a team config with a repo and auto-dispatch
on would start dispatching the moment someone connected.

This TRD adds a **suggestion**, not a default. After seeding, match each team
against `discovered_repos` for the org:

- team key `AVA` ↔ repo `avant-garde/…` (key initials against owner or name);
- normalized team name ↔ repo name (`Website` ↔ `openconjecture/website`);
- single-repo org → suggest it for every team.

Stored as `team_configs.suggested_repo` (new nullable column), rendered in the
team editor as a one-click *Use this*. `default_repo` stays null until a human
clicks. §3.6's table is the rule: the machine proposes, the member commits.

### 8.3 The onboarding surface

`/fleet/discovered` — grouped by owner, each row showing repo, project count,
session count, live count, last activity, and one button. Owners the user
recognizes, counts that are true, and the fastest path to a routed machine.

An org with zero discovered repos sees the existing empty state. Nothing
regresses for someone who never runs a scan.

---

## 9. Security Requirements

| # | Requirement | Enforcement |
| --- | --- | --- |
| S-01 | No transcript content crosses the boundary. | `.strict()` schemas (§5); no column can hold it (§4.1); metadata written from a whitelist. |
| S-02 | A machine token cannot adopt into another org. | `requireOrchestrator` returns the token's `orgId`; every write filters on it. Same posture as `register`. |
| S-03 | A machine token cannot create a tenant or enable dispatch. | §3.6 table. `accept` is `requireOrgRole`; `defaultRepo` is never machine-written. |
| S-04 | Adoption cannot mark someone's ticket Done. | `moveToDone: false`, passed explicitly, tested (T21-AC-06). |
| S-05 | Repos outside the routed set are not disclosed by default. | §3.5. `--all-repos` is explicit and names owners in the preview. |
| S-06 | A model call cannot exfiltrate a repo. | The summarizer receives the head sample and paths only, and runs against the user's own `ANTHROPIC_API_KEY` on their machine. It is not a DevPilot-hosted call. |
| S-07 | Re-running adopt cannot spam a board. | Partial unique index on `(org_id, adoption_key)` (§4.1). |
| S-08 | A hostile transcript cannot inject into Linear. | Title and summary are length-capped and markdown-escaped by `buildAdoptionComment` before they reach `issueCreate`. |

S-08 is worth stating plainly: a transcript is attacker-influenced input if the
user ever pasted untrusted content into a session. It reaches a shared board, so
it is escaped, capped, and never rendered as raw markdown.

---

## 10. Testing Strategy

**Unit — `packages/core` (vitest).**
Fixture transcripts under `tests/fixtures/claude-projects/`, hand-built to cover:
a normal session with `custom-title`; one with no title and a long first prompt;
a torn final line; a 0-byte file; a sidechain-only file; a DevPilot-owned
session carrying the marker; a cwd with no git remote. The probe is asserted to
read **at most 64 KB** of a 5 MB fixture (spy on the read), which is the only way
the performance claim in §6.1 stays true as the code changes.

**Unit — `packages/bridge-protocol`.**
`.strict()` rejects an extra key. `touchedPaths` over 50 rejects. A candidate
carrying a `transcript` field fails to parse — the direct test of DECISION B.

**Route — `devpilot-website` (vitest).**
Duplicate `adoption_key` returns `duplicate` and does not INSERT. `dryRun` writes
nothing (assert row counts before/after). No workspace → 409. A command against
an adopted session → 409. Branch match beats title match. Discovery upsert
preserves `ignored`.

**Integration.**
`packages/cli/tests/harness/run-local-adoption.mjs`, modelled on the existing
`run-local-dispatch.mjs`: builds a temporary `~/.claude/projects` tree, points
the scanner at it, drives the real route against the live database, and asserts
the resulting rows and the *absence* of a `dispatch_queue` row.

**Gates.** Both repos' existing gates, unchanged and all green. No step gains
`|| true`.

---

## 11. Acceptance Criteria

| # | Criterion |
| --- | --- |
| T21-AC-01 | `devpilot sessions scan` on the reference machine lists sessions from routed repos only, and names the withheld owners. |
| T21-AC-02 | The probe reads ≤ 64 KB of a well-formed 5 MB transcript, and ≤ 1 MB of any transcript however large. Asserted, not assumed. |
| T21-AC-02b | A title behind a multi-chunk `attachment` entry is still found, and the attachment is never parsed. |
| T21-AC-03 | `adopt` creates a `dispatch_sessions` row with `origin='adopted'` and **no** `dispatch_queue` row. |
| T21-AC-04 | Running `adopt` twice produces zero new rows and zero new Linear issues. |
| T21-AC-05 | A session on a branch named `AVA-31-…` attaches to AVA-31 rather than creating an issue. |
| T21-AC-06 | An adopted session settling posts a Linear comment and leaves the issue's state unchanged. |
| T21-AC-07 | `POST /api/sessions/:id/commands` returns 409 for an adopted session. |
| T21-AC-08 | With `ANTHROPIC_API_KEY` unset, adoption still succeeds with heuristic titles. |
| T21-AC-09 | No request body accepted by `/api/adoptions` can carry transcript content: an extra key is a 400. |
| T21-AC-10 | `bridge connect` prints the discovery summary grouped by owner, and connects successfully when discovery fails. |
| T21-AC-11 | Accepting a discovered repo writes a `repo_routes` row; a machine token calling `accept` gets 404. |
| T21-AC-12 | A dismissed (`ignored`) repo stays dismissed across a re-scan. |
| T21-AC-13 | Linear connect suggests a `defaultRepo` per team and leaves `default_repo` null. |
| T21-AC-14 | All gates green in both repos. |

---

## 12. Implementation Plan

### Wave 1 — Protocol (`devpilot`, independent) ✅ COMPLETE
`packages/bridge-protocol/src/adoption.ts` + `buildAdoptionComment` in
`messages.ts` + barrel export + tests. Nothing consumes it yet.

### Wave 2 — Scanner (`devpilot`, depends on Wave 1) ✅ COMPLETE
`packages/core/src/adoption/{transcript,repo,scanner,summarize,index}.ts`,
fixtures, tests, barrel export. Pure library; no CLI, no network.

### Wave 3 — Hosted (`devpilot-website`, depends on Wave 1) ✅ COMPLETE
Schema columns + `discovered_repos` + `team_configs.suggested_repo` + migration;
`issueCreate`/`issueByIdentifier` on `LinearApiService`; `moveToDone` parameter;
`POST /api/adoptions`, `POST /api/discovery`, accept/ignore routes; the commands
guard. Route tests.

### Wave 4 — CLI (`devpilot`, depends on 2 and 3) ✅ COMPLETE
`BridgeClient.adoptSessions` / `reportDiscovery`; `devpilot sessions scan|adopt`;
`AdoptionWatcher`; `bridge connect --adopt` and the discovery summary; the
owned-sessions ledger written by the session-runner. Harness script.

### Wave 5 — Portal, PLG, docs (`devpilot-website` + `devpilot`) ✅ COMPLETE
`/fleet/discovered`; adopted badge on the sessions list and detail; Linear
connect suggestion; `docs/ADOPTION.md`; `docs/LINEAR-BRIDGE.md` and
`docs/ROADMAP.md` updated; end-to-end verification against the live deployment.

---

## 13. What is proven, and what is not

**Proven end to end, against the live database over real HTTP** — not only
in-process. The shipped CLI adopted 6 live sessions from this machine, the
route created 6 issues, and the database held 6 rows with `origin='adopted'`,
the correct `touchedPaths`, 6 `session_events`, and **zero `dispatch_queue`
rows**. A second run created nothing (T21-AC-04).

**Proven against real data.** The scanner reads this machine's actual store:
670 sessions across 38 project directories in 634 ms, 12 repos under 5 owners.
Every correction in the v1.1 change log came from that data rather than from
reasoning about it.

**Proven by test.** 130 tests across both repos, including both directions of
DECISION A: an adopted session comments and does not move its issue; a
dispatched session on the same route does move it.

**NOT proven — carried forward:**

- **No issue has been created in a live Linear workspace.** Every Linear call in
  the suite goes to a local GraphQL stub speaking the same protocol. The
  documents are the ones the route really sends and the stub asserts on them,
  but `issueCreate` against api.linear.app is unexercised. T21-AC-05 and
  T21-AC-06 are satisfied against the stub only.
- **The 30-minute settle has not run at full duration.** `AdoptionWatcher` is
  tested by advancing mtimes, not by waiting.
- **`@devpilot.sh/bridge-protocol` is not published.** `devpilot-website`
  resolves it from `github:geastham/devpilot#main`, so the hosted side cannot
  build against these changes until the public repo's `main` carries them.
- **`suggested_repo` is written but the OAuth path that populates
  `linear_team_key` has not run live.** Teams connected before this TRD have a
  null key and fall back to the matcher's name rules.

## Decisions other TRDs must respect

- **An `origin='adopted'` session is observational.** Do not add a control path
  to it without a real session handle behind that control.
- **`moveToDone` is now an explicit parameter of the Linear completion sync.**
  Passing `true` is a claim that DevPilot ran the work.
- **A machine token proposes; a member commits.** The §3.6 table is the rule for
  every future machine-originated write.
- **Scan scope defaults to routed repos.** Any future scanner inherits this
  default, for the reason in §3.5.
