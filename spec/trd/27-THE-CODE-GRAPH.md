# TRD 27 — The Code Graph
## Selecting a code knowledge graph, and how it fits the platform as it stands
### v0.1 · October 2026 · Status: DESIGN — nothing here is built

---

## 1. The decision asked for

Choose a default, best-of-breed code knowledge graph that agents query instead
of crawling the repository to orient themselves: local by default, with an
upgrade path to a Postgres-backed hosted graph for shared and Pro plans.

**The selection, in three lines:**

- **Local default:** [`colbymchenry/codegraph`](https://github.com/colbymchenry/codegraph)
  (MIT), behind a DevPilot-owned adapter, shipped **opt-in** until our own A/B
  says otherwise.
- **Hosted store:** plain Postgres tables in the existing Supabase database,
  mirroring the local schema. No graph extension.
- **Not Graphify**, though it is the best known. Reasons in §3.

And one finding that shapes everything after it: **no independent measurement
shows that a code graph saves tokens at equal task success.** So this design
puts the graph to work first where its value does not depend on that claim
(§5), and treats the token question as something we measure before we say
anything (§6).

---

## 2. What was checked, and how

Researched 1 October 2026 from each project's own repository, licence file,
release page and package registry. The claims this document depends on were
then re-checked directly, and the chosen tool was run.

**Verified from primary sources (GitHub API, npm, the project's files):**

| Fact | Source |
|---|---|
| codegraph is MIT, v1.6.1 released 2026-09-29, 72.7k stars, one author with 1,144 commits (next human contributor: 16) | GitHub API |
| It publishes prebuilt per-platform packages and has no install script | `npm view` |
| Its store is SQLite: `nodes`, `edges`, `files`, `unresolved_refs`, an FTS5 table | `src/db/schema.sql` |
| `nodes.docstring` and `nodes.signature` hold literal source text | `src/db/schema.sql`; confirmed in an index |
| Telemetry is anonymous usage, default-on at install, off with `DO_NOT_TRACK=1` or `CODEGRAPH_TELEMETRY=0` | `TELEMETRY.md` |
| Supabase offers 66 extensions; Apache AGE is not one. `vector`, `pgrouting`, `ltree`, `pg_trgm` are | `supabase/supabase` `extensions.json` |
| Graphify is Apache-2.0, Python, 123k stars | GitHub API |
| codebase-memory-mcp is MIT, written in C | GitHub API |

**Run by hand** (codegraph 1.6.1, telemetry off, a scratch clone of this
repository at `576b5d1`, Apple silicon):

| What | Result |
|---|---|
| Full index | 400 files, 7,219 nodes, 19,105 edges in 0.87 s (2.3 s wall); 24 MB database |
| Tracked `dist/` output | Skipped (0 files indexed from `dist/`) |
| Languages | TypeScript 331, TSX 49, JavaScript 16, YAML 4 |
| Where the index lives | `.codegraph/` in the working directory, self-ignored |
| A fresh git worktree | "Not initialized" — the index is per directory |
| Seeding a worktree: copy `.codegraph/` in, then `sync` | 0.42 s |
| `sync` after editing a file in the worktree | 0.77 s; the new symbols and their call edge are found; the main checkout's index is untouched |
| MCP surface | **One tool**, `codegraph_explore`; its schema is 1,735 bytes (about 430 tokens) |
| One `codegraph_explore` call | About 20 KB (about 5,000 tokens) returned |
| Retrieval quality, two probes | A query naming symbols (`prepareTaskWorkspace integrateRun …`) returned the right module. The same question in plain English ("how does the session runner give a task its own git worktree…") returned type definitions for `WaveTask` instead |
| Installed size | The platform package is **295 MB** unpacked |

Two things in that table were unknown before and matter here. Worktree
seeding works and is fast, which is what our per-task isolation needs. And the
plain-English miss is a caution: the tool is strongest when the caller already
knows a symbol's name — which an agent often does not, and which is the case
the whole category is sold on.

---

## 3. The candidates

Viable ones first. "Deterministic" means indexing needs no model call.

| Candidate | Licence | Runtime | Indexing | Local store | Postgres | Verdict |
|---|---|---|---|---|---|---|
| **codegraph** | MIT | Node shim + Rust kernel, prebuilt | tree-sitter, deterministic | SQLite | none | **Chosen** |
| **codebase-memory-mcp** | MIT | single C binary | tree-sitter, deterministic | SQLite | none | **Swap target** |
| Graphify | Apache-2.0 | Python | tree-sitter for code; a model for docs | `graph.json` | none (its `postgres` extra reads a schema as *input*) | Not chosen |
| code-review-graph | MIT | Python | tree-sitter | SQLite | none | Python sidecar |
| GitNexus | PolyForm Noncommercial | Node, native deps | tree-sitter | LadybugDB | none | **Licence rules it out** for a product with paid tiers |
| CodeGraphContext | MIT | Python | tree-sitter | FalkorDB Lite / Kuzu | none | FalkorDB engine is SSPL; Kuzu is archived |
| code-graph-rag | MIT | Python + Docker | tree-sitter; a model writes Cypher per query | Memgraph + Qdrant | none | Needs Docker and a model per query |
| Serena | GPL-3.0-or-later since 2026-09-14 | Python | live language server, no stored graph | — | — | Licence; and see the LSP study in §6 |
| SCIP indexers | Apache-2.0 | one per language | compiler-accurate | index file | bring your own | An indexing layer, not a product; candidate for a later precision upgrade |

Set aside: FalkorDB code-graph (three languages; SSPL engine), Blarify
(stagnant), Potpie (now a model-ingested context graph; its Postgres backend
is a stub), Graphiti and Cognee (model-extracted memory, not code structure;
Cognee's production Postgres graph is a licensed product), LightRAG (a model
call per chunk; its Postgres graph needs Apache AGE), Microsoft GraphRAG ("in
maintenance mode" by its own README).

### Why codegraph

It is the only candidate that is all of: MIT, deterministic, SQLite-backed,
incremental on file change, and callable from Node. Three properties matter
specifically to this platform:

1. **The cockpit can read its database directly.** It is SQLite with a
   documented schema, the same engine and driver the cockpit already uses.
2. **One MCP tool.** Uber measured 50–70K tokens of schema from 100+ tools;
   our `lean` harness exists to remove that kind of overhead. A graph that
   adds 430 tokens is compatible with it. codebase-memory-mcp's README lists
   17 tools (not measured here).
3. **Its benchmark method is ours.** It measures with headless `claude -p`
   under `--strict-mcp-config`, with and without the tool — exactly what the
   session runner and harness stamp already do.

### Why not Graphify

It is real, very active and has by far the most attention. But:

- It is a Python tool in a Node product, and it stores `graph.json` loaded
  through networkx with a 512 MB cap. There is no SQLite store for the cockpit
  to read and no Postgres store.
- Its code-specific evidence is six questions on one repository, self-run and
  model-judged. Its "71.5× fewer tokens" is against reading every raw file,
  which no agent does.
- Graphify Labs sells a hosted team graph. Building the paid tier on a vendor
  whose paid tier is the same product is a position to avoid.

### The strongest argument against the choice

codegraph is nine months old with one dominant author, and it does not
document worktree behaviour (we verified it; they do not promise it). That is
why it sits behind an adapter with a named swap target, why the version is
pinned, and why nothing in the product may depend on it being present.

---

## 4. Uber's graph is not this graph

The post that prompted this describes "24 million nodes and 80 million edges"
linking "services, engineering teams, incident logs, pull requests,
architectural design docs, deployments, datasets, and historical table usage
queries" (Uber Engineering Blog, 27 August 2026). That is an
**organisational context graph**. It is not a code symbol graph, and the one
measured effect given for it is a single example (38 s and correct, against
20 m 09 s and wrong).

For one developer the equivalent of "organisational context" is not the call
graph. It is their own history: which ticket led to which plan, which task
changed which files, what it cost, what conflicted, what failed and why.
**DevPilot already records all of that** and no off-the-shelf code graph has
it. So the design has two layers, joined on file path:

| Layer | What | Source | Who else has it |
|---|---|---|---|
| **L1 — structure** | Symbols, files, calls, imports | codegraph, deterministic | Everyone |
| **L2 — work history** | Ticket → plan → task → session → files changed, cost, outcome, conflicts | DevPilot's own tables | Nobody |

L2 is also the kind of memory the evidence supports. TRD 25 §6 records that
memory helps when it holds facts the agent **cannot derive from the repo**.
The call graph is derivable from the repo. "The last two tasks that touched
this file conflicted, and here is what the second one had to redo" is not.

---

## 5. Uses that do not depend on the unproven claim

Build these first. Each is deterministic and each improves something that is
already shipped.

### 5.1 Conflict prediction at plan time

The wave assigner separates tasks that declare the same file. It cannot see
that task A changes `retry-policy.ts` and task B changes a file that calls
into it. With L1, "the files a task touches" becomes "those files plus their
direct dependents" — the blast radius — and two tasks whose radii overlap are
either sequenced or flagged at review.

This targets a measured problem: in the live UAT run, two tasks the plan put
in one wave collided on `src/index.ts`, and one agent's work was redone. The
Conductor Score's parallelization dimension already counts contended pairs,
so the effect of this change is measurable with instruments that exist.

### 5.2 Test selection per task

`codegraph affected <files>` names the tests reached from changed files. The
runner can hand each worker the tests relevant to its task, and can run them
itself after the merge — a first step toward saying whether a task's work was
right, which nothing in the product measures today.

### 5.3 Blast radius at review

At the plan gate, show for each task what depends on the files it will
change. It is the question a reviewer is actually asking.

---

## 6. The token question — measure, then say

### What exists

- **Independent, nearest alternative:** a June 2026 study of language-server
  tools against grep for coding agents found "The answer is conditional and
  usually negative. On symbol-named localization the LSP costs tokens (+6% to
  +118%)", and that grep "solves multi-file renames perfectly" where a
  location-only LSP failed three-quarters (arXiv 2608.13568).
- **Author-run, the swap target:** the codebase-memory paper reports "83%
  answer quality versus 92% for a file-exploration agent … at ten times fewer
  tokens" (arXiv 2603.27277). Fewer tokens, and worse answers.
- **Author-run, the chosen tool:** codegraph reports fewer tokens on seven
  repositories with one question each, discloses that earlier figures were
  contaminated, and publishes a negative result of its own: more retrieval
  context left resident at the end of a session.
- **Our two probes** (§2): right module when asked by symbol name, wrong one
  when asked in plain English; about 5,000 tokens per call either way.

That is not a basis for a claim. It is a basis for an experiment.

### The experiment

The instruments shipped in 0.6.0 are sufficient:

1. A harness technique `code-graph` that adds the one MCP server to a
   dispatched agent. The stamp becomes `lean+code-graph@2`, so every reading
   is attributable.
2. The same plans run under `lean` and `lean+code-graph`, on this repository
   and at least two others of different size and language.
3. Compare, per task: tokens per written change, responses per prompt
   (TRD 26 §6), whether the task's tests pass (§5.2), and wall time.
4. Publish the result whichever way it goes, with the task list. If it does
   not help, the technique stays off and §5 still stands.

Until step 4, the worker-facing graph is **off by default** and no page,
README or tool description states a saving.

---

## 7. Integration — local (free, V1)

### 7.1 The adapter

In `packages/core`, beside the existing memory provider interface:

```ts
interface CodeGraphProvider {
  id: 'codegraph' | 'codebase-memory' | 'none';
  /** Is the indexer installed, and which version? Never installs anything. */
  probe(): Promise<{ available: boolean; version?: string }>;
  /** Build or refresh the index for a working directory. */
  sync(dir: string, opts?: { seedFrom?: string }): Promise<GraphStatus>;
  /** Deterministic reads, used by the planner and the runner. */
  dependents(dir: string, files: string[], depth: number): Promise<string[]>;
  affectedTests(dir: string, files: string[]): Promise<string[]>;
  /** The MCP server entry to hand an agent, or null. */
  mcpServer(dir: string): McpServerConfig | null;
}
```

`dependents` and `affectedTests` read the SQLite file directly. The cockpit
does not shell out per query, and a swap to codebase-memory-mcp changes one
file.

### 7.2 Install — never bundled

The platform package is 295 MB; the CLI is not. `devpilot graph enable`:

- finds an installed `codegraph`, or prints the one command to install the
  pinned version — it does not install anything itself;
- runs it with `DO_NOT_TRACK=1` in every invocation DevPilot makes. What the
  user's own `codegraph install` prompt does is theirs to answer, and the
  command says so;
- records the choice per repository. Off by default.

### 7.3 The session runner

In `isolation.ts`, after the task's worktree is created and before the agent
starts:

1. Add `.codegraph/` to the repository's `info/exclude`. **This is required:**
   the tool writes a `.codegraph/.gitignore` that un-ignores itself, and the
   runner's `git add -A` at task end would commit it into every task branch
   (confirmed: `git add -A --dry-run` in a seeded worktree lists it; with the
   exclude line it does not).
2. Copy the main checkout's `.codegraph/` into the worktree and `sync`
   (measured: 0.4 s). If the main checkout has no index, skip — never index a
   whole repository inside a task's time budget.
3. If the plan's harness includes `code-graph`, add the MCP server to the
   agent's config, pointed at the worktree, with the file watcher on so the
   index follows the agent's own edits.

A failure in any of these is logged and the task runs without the graph. It
is an aid, not a dependency.

### 7.4 The planner

`dependents()` feeds §5.1 in the wave assigner's conflict pass, as an
additional claim set per task, capped in depth and size so a change to a
widely imported file does not serialise the whole plan. Recorded as a new
adjustment type so the plan review can show why two tasks were sequenced.

### 7.5 L2, as one more tool

A second MCP tool in the existing `@devpilot.sh/mcp-session` package (not a
new server — one fewer schema): `devpilot_history(paths)` → the last tasks
that changed those paths, their summaries, whether they conflicted or failed,
and what they cost. Read from the local cockpit's SQLite. Fenced and
length-capped like every other stored text that reaches a prompt.

---

## 8. Integration — hosted Postgres (shared plan, Pro)

### 8.1 The boundary comes first

The hosted plane's central promise is that it never receives source. A code
graph tests that promise directly:

| Field | Is it source? | Crosses? |
|---|---|---|
| File path, language, line range | Already crosses (paths) | Yes |
| Node kind (`function`, `class`, …) and flags | Derived | Yes |
| **Symbol name and qualified name** | **Identifiers from your code** | **Yes — this is the new class** |
| Edge kind, source, target | Derived structure | Yes |
| `signature`, `docstring`, `decorators`, `return_type` | **Literal source text** | **Never** |
| File contents, code blocks returned by `explore` | Source | Never |

So a hosted graph means the hosted plane learns **the names of your functions
and how they call each other**. That is less than source and more than it
receives today. The consequences are not optional:

- **Opt-in per repository, off by default**, with the exact field list shown
  at the moment of opting in.
- The public security statement, the FAQ and `llms.txt` change in the same
  release, to say this plainly.
- `signature` and `docstring` are stripped on the machine, by an allowlist of
  columns — not a denylist — so a new column in a later indexer version cannot
  start crossing by accident. A test builds a graph from a fixture containing a
  marker string in a docstring and a signature and asserts the upload does not
  contain it.

**An alternative that keeps the promise intact** is to sync the index as an
end-to-end encrypted artifact (the shared-session model: the key never reaches
the server), so teammates' machines share one index the hosted plane cannot
read. It is the right answer for a customer who will not accept the row above,
and it should exist as the other option. It cannot power §8.4, because the
server cannot query what it cannot read.

### 8.2 Schema

Additive, in the existing database, RLS on `org_id` like every other table.
No extension beyond `pg_trgm`.

```sql
create table code_graphs (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id),
  repo            text not null,
  branch          text not null,
  commit_sha      text not null,
  indexer         text not null,          -- 'codegraph'
  indexer_version text not null,
  node_count      integer not null,
  edge_count      integer not null,
  synced_at       timestamptz not null default now(),
  unique (org_id, repo, branch)           -- one live graph per branch
);

create table code_graph_files (
  graph_id     uuid not null references code_graphs(id) on delete cascade,
  path         text not null,
  content_hash text not null,             -- what makes sync incremental
  language     text not null,
  primary key (graph_id, path)
);

create table code_graph_nodes (
  graph_id       uuid not null references code_graphs(id) on delete cascade,
  node_id        text not null,
  kind           text not null,
  name           text not null,
  qualified_name text not null,
  file_path      text not null,
  start_line     integer not null,
  end_line       integer not null,
  is_exported    boolean not null default false,
  primary key (graph_id, node_id)
);

create table code_graph_edges (
  graph_id uuid not null references code_graphs(id) on delete cascade,
  source   text not null,
  target   text not null,
  kind     text not null,
  line     integer,
  primary key (graph_id, source, target, kind, line)
);

create index on code_graph_nodes (graph_id, file_path);
create index on code_graph_nodes using gin (name gin_trgm_ops);
create index on code_graph_edges (graph_id, target, kind);  -- "who calls this"
```

Why plain tables: Apache AGE is not available on Supabase, and the queries
needed are shallow. Callers, callees and blast radius are a depth-capped
recursive CTE over `code_graph_edges`; at this repository's size (19k edges)
that is trivial. The one warning found about plain-Postgres graphs — a code
comment in Cognee's demo adapter recording a degree aggregate over 35M edges
taking 57 s, as reported by the research pass and not re-read — concerns
whole-graph analytics, which nothing here runs. `pgrouting` and `pgvector` are available and deliberately unused:
nothing here needs shortest paths, and embeddings would have to be computed on
the machine from source.

### 8.3 Sync

`devpilot bridge connect --graph`, per opted-in repository:

1. Read `.codegraph/codegraph.db` read-only.
2. Compare each file's `content_hash` with the manifest from the last upload.
3. For changed files, send their nodes and edges through the column allowlist
   to `POST /api/graph/sync` with the machine token; the server replaces those
   files' rows in one transaction.
4. Only the default branch and a run's merged run branch are synced — never a
   task worktree mid-flight.

### 8.4 What the hosted graph is for

Not for agents to query — agents run on the machine and have the local index.
It is for what only the hosted plane can see: **every machine at once.**

- **Collision warnings across machines.** The hosted plane already receives
  which files each live session is touching. Joined to the graph, it can say
  that an agent on one laptop is editing a function that an agent on another
  is calling into — before either merges. That is the tower's job (TRD 24),
  and it is a feature a team plan has that a single machine cannot.
- **Blast radius in the web review**, for approving a plan from a browser.
- **Efficiency by area.** Tokens per change grouped by module rather than by
  session: where in the codebase the fleet is expensive.

### 8.5 Tiers

| Tier | Gets |
|---|---|
| Free, local | L1 index, conflict prediction, test selection, blast radius, L2 history tool, the A/B measurement |
| Shared hosted plan | Structure-only sync (opt-in), cross-machine collision warnings, web blast radius; or the encrypted artifact |
| Pro (TRD 25) | The managed configuration — pinned indexer, tuned budgets — with before-and-after evidence; and the wider context graph: tickets, plans, sessions and pull requests linked to code, served to agents through a per-tenant hosted MCP endpoint (the pattern OpenConjecture already runs in production for hosted adapters in another product) |

Consistent with the rule that no reading is gated: the graph's measurements
are free at every tier.

---

## 9. Sequence

| # | Work | Size | Proves |
|---|---|---|---|
| 1 | Adapter + `devpilot graph enable` + `info/exclude` + worktree seeding in the runner | M | The tool fits the isolation model in production, not just in a probe |
| 2 | Conflict prediction in the wave assigner; blast radius at review | M | Fewer contended pairs, on the existing score |
| 3 | `code-graph` harness technique; the A/B in §6 on three repositories | M | Whether the token claim is true for us |
| 4 | Test selection per task; run after merge | M | A first correctness signal |
| 5 | `devpilot_history` (L2) | S | Memory the repo cannot supply |
| 6 | Hosted schema, allowlisted sync, opt-in UI, security copy | M | The boundary change, stated |
| 7 | Cross-machine collision warnings | M | The team-plan feature |
| 8 | Encrypted-artifact option | M | A hosted option with no boundary change |
| 9 | Pro context graph over a hosted MCP endpoint | L | — |

Steps 1–2 are useful with no further evidence. Step 3 decides whether the
worker-facing graph is ever on by default. Step 6 does not start until the
security wording is agreed.

---

## 10. Risks

- **Single-maintainer dependency.** Pinned version, an adapter, a named swap
  target with the same store shape. MIT permits a fork if it comes to that.
- **295 MB platform binary.** Never bundled; optional install.
- **Telemetry default-on in the tool's own installer.** DevPilot's invocations
  set `DO_NOT_TRACK=1`; the user's own installation is theirs, and we say so.
- **Resident context.** The tool's own README reports more retrieval context
  left in the window at session end. The A/B must measure whole-session cost,
  not per-question cost.
- **Stale index.** A graph that is wrong is worse than none. The runner syncs
  on worktree creation and the watcher follows edits; the hosted graph is
  refreshed on merge and carries its commit, so a consumer can see its age.
- **The boundary.** Symbol names on the hosted plane is a real change to the
  product's central promise. It is opt-in, allowlisted, tested and stated — or
  it is the encrypted option.
- **A competing hosted product** from Graphify Labs. Our differentiator is L2
  and the fleet view, neither of which a code graph vendor has.
