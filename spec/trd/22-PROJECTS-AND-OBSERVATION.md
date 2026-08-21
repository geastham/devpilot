# TRD 22 — Projects & Observed Sessions
## Repo→Team Mapping · Linear-Free Observation · PLG Onboarding
### v1.0 · August 2026 · Status: DRAFT

> **Depends on:** `21-FLEET-INTROSPECTION.md` (the scanner, `discovered_repos`,
> `origin='adopted'`). This TRD **corrects two things TRD 21 got wrong** and is
> binding over it where they disagree.
>
> This TRD owns the table `projects`, the column
> `dispatch_sessions.web_url`, and the route `POST /api/observations`.

---

## 1. What TRD 21 got wrong

TRD 21 shipped and works. Standing it up against the real fleet surfaced two
design errors, both found by trying to use it rather than by reasoning about it.

### 1.1 Repo→team was collapsed into a column that means something else

`lib/adoption/service.ts:resolveRouting` maps a repo to a Linear team by
scanning `team_configs.default_repo`. That column already had a meaning, and it
is the **opposite direction**:

| Column | Question it answers | Direction |
| --- | --- | --- |
| `team_configs.default_repo` | *When this Linear team delegates an issue, which repo does the work happen in?* | Linear → repo (inbound dispatch) |
| what adoption needed | *When this repo produces observed work, which Linear team should hear about it?* | repo → Linear (outbound placement) |

Those are different questions and reading one for the other makes the mapping
**1:1 when it is naturally many-to-one**. On the reference fleet: 12 repos, one
Linear team. Adoption skips all 12 with *"No Linear team has X as its default
repository"*, and the only way to fix it inside TRD 21's model is to invent 12
team configs for teams that do not exist.

### 1.2 Observation was made to depend on Linear

`dispatch_sessions` requires `workspace_id`, `linear_issue_id` and
`linear_identifier` — all `NOT NULL` — so **an adopted session cannot exist
without a Linear issue**, and an org with no connected Linear workspace has no
`workspaces` row for the foreign key to point at.

That inverts the product promise. The pitch is *turn the bridge on and your
agent sessions are there*; the implementation is *connect Linear, connect a
machine, route a repo, configure a team, then your sessions are there*. Four
configuration steps before the first pixel.

Worse, it forces a shared-board write to be the price of visibility. Seeing your
own sessions in your own cockpit should cost nothing and risk nothing.

---

## 2. Goals

1. **Observation is free.** A session is visible in the cockpit with no Linear
   workspace, no team, no issue, and no route. Connecting the bridge is enough.
2. **Placement is separate and deliberate.** Creating a Linear issue for an
   observed session is a second, explicit step — the thing TRD 21 called
   adoption.
3. **Repo→team is many-to-one and explicit**, on a column that means only that.
4. **Observed sessions are reachable.** Each one links to where it is actually
   being driven, which for this user is Claude Code on the web.
5. **PLG shape.** Personal scope works immediately; organizations are an easy,
   externally-informed upgrade rather than a prerequisite.

### Non-Goals

- **Steering an observed session.** Unchanged from TRD 21 §3.4 and not
  negotiable: DevPilot has no handle on a session it did not spawn. "Manageable"
  in this TRD means *visible, attributable, linkable, and placeable* — never
  *steerable*. §6.3 says what the link does instead.
- Replacing `team_configs.default_repo`. It keeps its inbound meaning.

---

## 3. The model

```
                    ┌──────────────┐
   discovery  ──────▶ discovered_  │   proposal inbox (TRD 21)
   (machine)        │   repos      │
                    └──────┬───────┘
                           │ a member accepts
                           ▼
   ┌───────────┐    ┌──────────────┐    ┌──────────────┐
   │repo_routes│◀───│   projects   │───▶│ linear team  │
   │ repo→machine   │ owner/name   │    │  (optional)  │
   └───────────┘    └──────┬───────┘    └──────────────┘
      WHERE it runs        │                WHERE it files
                           │
                    ┌──────▼───────────────────────────┐
                    │ dispatch_sessions                │
                    │  origin='adopted'                │
                    │  linear_issue_id NULL → observed │
                    │  linear_issue_id set  → placed   │
                    └──────────────────────────────────┘
```

A **project** is a repository this organization cares about. It is the noun the
product was missing: `repo_routes` knew where a repo runs, `team_configs` knew
what a team dispatches, and nothing knew that a repository *exists* and belongs
to you.

### 3.1 Two states, one row — DECISION C

An adopted session is **observed** when `linear_issue_id IS NULL` and **placed**
when it is set. No new enum, no second table, no migration between them.

This matters because the cockpit already renders `dispatch_sessions` with a live
status. An observed session appears there the moment it is written, and placing
it later changes one column rather than moving a row between surfaces.

### 3.2 What may be null, and when

```sql
CHECK (origin <> 'dispatched' OR (
  workspace_id IS NOT NULL AND
  linear_issue_id IS NOT NULL AND
  linear_identifier IS NOT NULL
))
```

The constraint states the actual rule rather than the accidental one. A
dispatched row still cannot exist without its Linear identity — that path is
untouched and the guarantee it relied on is preserved exactly. An adopted row
may have none of it.

Making these columns nullable *unconditionally* would have been the easy change
and the wrong one: it would silently permit a dispatch with no issue, which is
the bug the original `NOT NULL` was there to prevent.

---

## 4. Data model

### 4.1 `projects` (new)

```ts
export const projects = pgTable('projects', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  orgId: text('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),

  /** `owner/name`. The same shape repo_routes and discovered_repos use. */
  repo: text('repo').notNull(),
  owner: text('owner').notNull(),
  host: text('host').notNull().default('github.com'),
  /** Display name. Defaults to the repo's name half. */
  name: text('name').notNull(),

  /**
   * WHERE OBSERVED WORK FILES. Many projects → one team, which is the whole
   * point of this TRD. Null means observed sessions here stay unplaced, which
   * is a perfectly good steady state and the default.
   */
  linearTeamId: text('linear_team_id'),
  linearTeamName: text('linear_team_name'),
  workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),

  /** How this project came to exist, for the onboarding surface's copy. */
  source: text('source', { enum: ['discovered', 'manual', 'migrated'] }).notNull()
    .default('discovered'),

  createdAt: ..., updatedAt: ...,
}, (t) => ({
  uniq: unique('projects_org_repo_uniq').on(t.orgId, t.repo),
  byOrg: index('projects_org_idx').on(t.orgId),
}));
```

`onDelete: 'set null'` on `workspaceId`: disconnecting Linear must unbind
projects, not delete them. The project is yours; the Linear binding is a
setting.

### 4.2 `dispatch_sessions.web_url` (new)

Where this session is being driven — `https://claude.ai/code/session_…`.

It is not derived and cannot be: it comes from the transcript, which only the
machine can read. See §6.3 for why this single column carries most of the
product value of the feature.

### 4.3 Migration of existing state

Every `team_configs` row with a `default_repo` becomes a project bound to that
team, `source: 'migrated'`. That preserves today's behaviour exactly — the one
routed repo on the reference fleet keeps filing where it files — while moving
the mapping onto a column that means it.

`team_configs.default_repo` is **not dropped**. It still answers the inbound
question, and the Linear webhook still reads it.

---

## 5. Resolution order

Placing an observed session on a board:

1. `repo → projects` (org-scoped, unique). No project → **unplaced**, and the
   session is still recorded.
2. `project.linearTeamId` → the team. Null → **unplaced**.
3. The TRD 21 matching ladder runs unchanged: duplicate → branch → exact title →
   create.

Routing work to a machine is unchanged and still `repo_routes`. A project may be
routed and unbound (observed only), bound and unrouted (files, but no dispatch
target), or both.

---

## 6. Surfaces

### 6.1 `/projects` — the Vercel-shaped page

Grouped by owner, because owner is what a person recognises. Each row: repo,
which machine runs it, which Linear team it files into, live session count.

The two affordances that matter:

- **Bind all to one team.** An org with 12 projects and 1 Linear team gets one
  button. Binding them individually would be 12 identical decisions, which is
  not a decision, it is a chore.
- **Unbind.** Reversible in one click, because a binding that is hard to undo is
  a binding people are afraid to make.

### 6.2 Organizations from external identity

Discovery already reports the GitHub owner of everything on the machine. When
an owner's repos are not covered by the active organization, the page offers to
create one named after it.

**A member does this, never a machine.** TRD 21 §3.6 forbids a machine token
minting tenants and that stands. What changes is that a person now has a
one-click path, prefilled from something real, instead of a blank "New
organization" form.

This is the Vercel motion: the personal scope exists from the first second
(DevPilot already auto-provisions `"<name>'s Workspace"` at signup), and the
organization is a later upgrade made easy by external identity rather than a
prerequisite.

### 6.3 The link is the management story

An observed session cannot be steered by DevPilot, and TRD 21 §3.4 is right that
pretending otherwise is worse than not offering it. But that reasoning assumed
the only options were *steer* or *nothing*.

There is a third: **take the person to where the session already is.**

19 of the 25 most recent sessions on the reference machine carry a Claude Code
web link in their transcript — either explicitly:

```json
{"type":"system","subtype":"bridge_status","url":"https://claude.ai/code/session_01Xdtzh5e7ZNYsNqtrK9BmeV"}
```

or reconstructably, since `bridgeSessionId: "cse_01Xdtzh…"` maps to
`session_01Xdtzh…`:

```json
{"type":"bridge-session","bridgeSessionId":"cse_01Xdtzh5e7ZNYsNqtrK9BmeV"}
```

The six without one were never remote-controlled, so no link exists — correctly
absent rather than broken.

So the cockpit shows what is running, and one click puts you in the session
driving it. DevPilot does not need to be the thing that steers the agent to be
the thing that shows you your fleet and gets you to the right session.

---

## 7. API

| Route | Auth | Purpose |
| --- | --- | --- |
| `POST /api/observations` | machine token | Upsert observed sessions. **Needs no Linear workspace, no team, no route.** Idempotent on `adoption_key`. |
| `POST /api/adoptions` | machine token | Unchanged: place observed sessions on a board. Now resolves through `projects`. |
| `GET/POST /api/orgs/:id/projects` | session | List / create. |
| `PATCH /api/orgs/:id/projects/:projectId` | session | Bind or unbind a Linear team; rename. |
| `POST /api/orgs/:id/projects/bind-all` | session, owner/admin | Bind every unbound project to one team. |

`POST /api/observations` is the one that unlocks the happy path. It writes
`dispatch_sessions` rows with `origin='adopted'`, no Linear columns, `status`
from liveness, and `web_url` — and it auto-creates a `projects` row for any repo
it has not seen, because a repo with a live agent session in it is self-evidently
a project this org cares about.

> **Why auto-creating a project here is safe, when auto-routing is not.** A
> project row grants nothing. It does not decide which machine gets work
> (`repo_routes`), it does not decide where issues file (`linear_team_id` starts
> null), and it does not enable dispatch. It is the inventory entry that makes
> the repo nameable in the UI. TRD 21 §3.6's line holds: a machine may create
> inert records; only a member may create capability.

---

## 8. The happy path this produces

```
$ devpilot bridge connect --url https://devpilot.sh --token dp_orch_…

  ✓ Registered · mac.lan
  Looked around this machine: 38 projects, 5 owners, 34 sessions

    NeuroGraph-AI    4 repos  16 sessions  ● 11 live
    Arthaus-Inc      3 repos   9 sessions  ●  6 live
    …

  ✓ Observing 34 sessions — devpilot.sh/cockpit
```

and the cockpit shows all 34, live, each linking to Claude Code web. No Linear.
No routing. No team configuration. Those become things you do *later*, to put
work on a board — not things you do *first*, to see anything at all.

---

## 9. Acceptance criteria

| # | Criterion |
| --- | --- |
| T22-AC-01 | An org with **no** Linear workspace observes sessions and sees them in the cockpit. |
| T22-AC-02 | `POST /api/observations` writes no Linear columns and creates no `dispatch_queue` row. |
| T22-AC-03 | A dispatched session still cannot be written without workspace + issue + identifier (the CHECK). |
| T22-AC-04 | Observing twice updates the existing row rather than duplicating it. |
| T22-AC-05 | A live session's `web_url` reaches the cockpit and is clickable. |
| T22-AC-06 | 12 projects bind to 1 Linear team in one action, and placement then succeeds for all 12. |
| T22-AC-07 | Unbinding a project leaves its observed sessions intact and unplaced. |
| T22-AC-08 | Existing `team_configs.default_repo` rows are migrated to projects with identical behaviour. |
| T22-AC-09 | Disconnecting a Linear workspace unbinds projects rather than deleting them. |
| T22-AC-10 | A machine token cannot bind a team, create a route, or create an org. |

---

## 10. Waves

1. **Schema** — `projects`, `web_url`, the CHECK, nullable Linear columns, backfill migration.
2. **Protocol + scanner** — `web_url` extraction, `ObservationRequest`.
3. **Hosted** — `/api/observations`, projects routes, adoption resolves via projects.
4. **CLI** — continuous observe loop on `bridge connect`, default on.
5. **Portal** — `/projects`, bulk bind, org-from-owner, cockpit deep links.
6. **Release** — publish the CLI so a running bridge picks all of this up.

---

## Decisions other TRDs must respect

- **Observation is free; placement is deliberate.** Do not reintroduce a
  dependency from "can I see it" to "is Linear connected".
- **`projects.linear_team_id` is the only answer to "where does this repo
  file".** `team_configs.default_repo` answers the inbound question and must not
  be read for the outbound one again.
- **Observed sessions are still not steerable** (TRD 21 §3.4). The web link is
  how a person reaches them; it is not a control channel DevPilot owns.
