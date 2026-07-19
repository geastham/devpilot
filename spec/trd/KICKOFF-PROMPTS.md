# Copy-Paste Kickoff Prompts — One Per Phase
## v1.0 · July 2026

> Paste one prompt below into a fresh coding-agent session (Claude Code or similar)
> to execute that phase end-to-end. Prompts assume the agent has the repo checked
> out. Run them in dependency order: **01 first**, then 02 ∥ 03 ∥ 13, then 10 ∥ 11 ∥
> 12 ∥ 14. Each prompt is self-contained — the TRD carries all design decisions.

---

## Shared preamble (already baked into every prompt below)

Every prompt instructs the agent to: read `spec/trd/00-PROGRAM-OVERVIEW.md` §2–3
(execution protocol, binding decisions, contract registry) before its TRD; execute
the TRD's Implementation Plan wave-by-wave, dispatching each wave's tasks to
parallel sub-agents (tasks are file-disjoint by construction); verify every task's
done-check before advancing a wave; commit once per wave as `<TRD-id> wave N:
<summary>`; and finish by running the TRD's Testing Strategy and walking every
Acceptance Criterion.

---

## Phase 01 — Tier 1: Close the Execution Loop

```
You are the conductor agent for DevPilot TRD 01. Work on a new branch
`trd/01-execution-loop` off the latest default branch.

1. Read spec/trd/00-PROGRAM-OVERVIEW.md sections 2 and 3 (wave protocol, binding
   decisions, contract registry). Then read spec/trd/01-TIER1-EXECUTION-LOOP.md
   in full.
2. Execute its Implementation Plan wave by wave (4 waves, 17 tasks, IDs T1-W1-T1
   through T1-W4-T3). Within a wave, dispatch each task to a parallel sub-agent
   with: the task row (files, description, done-check), the TRD sections it needs,
   and the constraint that it may only touch its listed files.
3. Verify every done-check before starting the next wave. A failed check: re-run
   the task with failure context (max 2 retries), then stop and report.
4. Commit per wave: "TRD-01 wave N: <summary>". After wave 4: run the Testing
   Strategy section, then walk acceptance criteria T1-AC-01..14 and report each
   as PASS/FAIL with evidence.
5. Definition of done is 00-PROGRAM-OVERVIEW.md section 3.5 — including pnpm build
   green and docs/API-REFERENCE.md updated for the new/changed routes.

Do not redesign anything the TRD already decides (orchestrator hosting, the
claude-session contract, ensureColumn migrations). If the code contradicts the
TRD in a way that blocks a task, stop and report rather than improvising.
```

## Phase 02 — Tier 2: Spec Completion  *(requires 01 merged)*

```
You are the conductor agent for DevPilot TRD 02. Work on a new branch
`trd/02-spec-completion` off the latest default branch (must include TRD-01).

1. Read spec/trd/00-PROGRAM-OVERVIEW.md sections 2-3, then
   spec/trd/02-TIER2-SPEC-COMPLETION.md in full.
2. Execute its Implementation Plan wave by wave (5 waves, 29 tasks, T2-W1-T1 …
   T2-W5-T4), dispatching each wave's file-disjoint tasks to parallel sub-agents
   with their task row + relevant TRD sections.
3. Verify done-checks per task before advancing; max 2 retries then stop/report.
4. Commit per wave: "TRD-02 wave N: <summary>". Then run the Testing Strategy and
   walk T2-AC-01..16, reporting PASS/FAIL with evidence.
5. Respect binding decisions: reuse TRD-01's ensureColumn helper for new columns;
   chat SSE polls planner_chat_messages directly (never widen the activity_events
   CHECK); score becomes six-dimensional with total = min(1000, sum); keep the
   existing wave-layered SVG DAG approach (no dagre/d3-dag).
```

## Phase 03 — Tier 3: Hardening  *(items 11–14 can run parallel to 01/02; item 10 needs 01)*

```
You are the conductor agent for DevPilot TRD 03. Work on a new branch
`trd/03-hardening` off the latest default branch.

1. Read spec/trd/00-PROGRAM-OVERVIEW.md sections 2-3, then
   spec/trd/03-TIER3-HARDENING.md in full, including its parallelism table —
   it states which items may proceed before TRD-01 lands.
2. Execute its Implementation Plan wave by wave (4 waves, 24 tasks, T3-W1-T1 …
   T3-W4-T5) via parallel file-disjoint sub-agent dispatch.
3. Verify done-checks; max 2 retries then stop/report. Commit per wave:
   "TRD-03 wave N: <summary>". Then run the Testing Strategy and walk
   T3-AC-01..12 with evidence.
4. Destructive-change guardrails: before deleting apps/web and packages/ui,
   run the TRD's verification greps proving nothing imports them; the pnpm
   workspace and root package.json dependency changes must leave `pnpm install`
   and `pnpm build` green in the same wave.
5. integrationConfigs becomes the single home for provider credentials —
   migrate the Linear in-memory config there exactly as specced.
```

## Phase 10 — CI-Gated Wave Auto-Advance  *(requires 01–03)*

```
You are the conductor agent for DevPilot TRD 10. Work on a new branch
`trd/10-ci-gated-advance` off the latest default branch (must include TRD-01..03).

1. Read spec/trd/00-PROGRAM-OVERVIEW.md sections 2-3 — especially 3.3, the
   claude-session contract extension registry — then
   spec/trd/10-CI-GATED-WAVE-ADVANCE.md in full.
2. Execute its Implementation Plan wave by wave (5 waves, 24 tasks, CI-W1-T1 …
   CI-W5-T7) via parallel file-disjoint sub-agent dispatch.
3. Contract discipline: extend orchestrator/types.ts ONLY with the optional
   fields the TRD specifies (TaskSpec.git, CompletionReport.branchName/prNumber).
   GitHub credentials persist in integrationConfigs (TRD-03's table), and GitHub
   webhook verification mirrors the Linear pattern.
4. Verify done-checks; max 2 retries then stop/report. Commit per wave:
   "TRD-10 wave N: <summary>". Then run the Testing Strategy and walk
   CI-AC-01..17 with evidence. If running concurrently with TRD 11 or 12,
   rebase before waves that touch orchestrator/types.ts or sqlite.ts DDL.
```

## Phase 11 — Dispatch Cost Budgets  *(requires 01–03)*

```
You are the conductor agent for DevPilot TRD 11. Work on a new branch
`trd/11-cost-budgets` off the latest default branch (must include TRD-01..03).

1. Read spec/trd/00-PROGRAM-OVERVIEW.md sections 2-3 (note 3.3, the contract
   extension registry), then spec/trd/11-DISPATCH-COST-BUDGETS.md in full.
2. Execute its Implementation Plan wave by wave (4 waves, 24 tasks, CB-W1-T1 …
   CB-W4-T8) via parallel file-disjoint sub-agent dispatch.
3. Dependency direction is binding: pricing/cost logic lives in
   packages/core/src/cost/; packages/benchmarks re-exports core's pricing
   table, never the reverse. Usage lands on StatusUpdate/CompletionReport only
   as the optional fields specced.
4. Verify done-checks; max 2 retries then stop/report. Commit per wave:
   "TRD-11 wave N: <summary>". Then run the Testing Strategy and walk
   CB-AC-01..18 with evidence. Rebase before waves touching
   orchestrator/types.ts, sqlite.ts DDL, or fleet/state if TRD 10/12 run
   concurrently.
```

## Phase 12 — Session Transcript Viewer  *(requires 01–03)*

```
You are the conductor agent for DevPilot TRD 12. Work on a new branch
`trd/12-transcript-viewer` off the latest default branch (must include TRD-01..03).

1. Read spec/trd/00-PROGRAM-OVERVIEW.md sections 2-3, then
   spec/trd/12-SESSION-TRANSCRIPT-VIEWER.md in full.
2. Execute its Implementation Plan wave by wave (5 waves, 16 tasks, TV-W1-T1 …
   TV-W5-T2) via parallel file-disjoint sub-agent dispatch.
3. Contract discipline: only the optional CreateSessionParams.transcriptCallbackUrl
   and CompletionReport.transcript extensions; ingestion is batched and idempotent
   on (session_id, seq); honor the 64 KB payload cap and 30-day retention specced.
4. Verify done-checks; max 2 retries then stop/report. Commit per wave:
   "TRD-12 wave N: <summary>". Then run the Testing Strategy and walk
   TV-AC-01..12 with evidence. Rebase before waves touching
   orchestrator/types.ts or sqlite.ts DDL if TRD 10/11 run concurrently.
```

## Phase 13 — Benchmarks in CI  *(requires 01 only; may start early)*

```
You are the conductor agent for DevPilot TRD 13. Work on a new branch
`trd/13-benchmarks-ci` off the latest default branch (TRD-01 merged is
sufficient; the baseline scenario has zero tier dependencies).

1. Read spec/trd/00-PROGRAM-OVERVIEW.md sections 2-3, then
   spec/trd/13-BENCHMARKS-IN-CI.md in full.
2. Execute its Implementation Plan wave by wave (4 waves, 11 tasks, BC-W1-T1 …
   BC-W4-T2) via parallel file-disjoint sub-agent dispatch. The precondition
   task fixing the benchmark ID mismatch (normalizeBenchmarkId) comes first.
3. Cost guardrails are part of the spec: BudgetGuard env caps, no per-PR
   trigger, 90-minute job cap, [skip ci] on the index commit. Do not "improve"
   the workflow into running on every PR.
4. Verify done-checks; max 2 retries then stop/report. Commit per wave:
   "TRD-13 wave N: <summary>". Then run the Testing Strategy and walk
   BC-AC-01..12 with evidence. Note: the workflow itself can only be fully
   verified on GitHub — report which ACs need a live run and stop there.
```

## Phase 14 — AI-Driven Assist Panel  *(requires 01–03)*

```
You are the conductor agent for DevPilot TRD 14. Work on a new branch
`trd/14-ai-assist` off the latest default branch (must include TRD-01..03).

1. Read spec/trd/00-PROGRAM-OVERVIEW.md sections 2-3, then
   spec/trd/14-AI-ASSIST-PANEL.md in full.
2. Execute its Implementation Plan wave by wave (5 waves, 15 tasks, AP-W1-T1 …
   AP-W5-T2) via parallel file-disjoint sub-agent dispatch.
3. Non-negotiables from the TRD: trigger detection stays deterministic
   (server-side TriggerEngine) — only suggestion GENERATION calls the Anthropic
   API; suggested actions come from the 5-kind whitelist, are validated
   server-side, executed client-side, never auto-run; without ANTHROPIC_API_KEY
   the panel degrades to today's useAssistTriggers() heuristics unmodified.
4. Verify done-checks; max 2 retries then stop/report. Commit per wave:
   "TRD-14 wave N: <summary>". Then run the Testing Strategy and walk
   AP-AC-01..13 with evidence.
```

---

## Resume prompt (any phase, interrupted mid-way)

```
You are resuming as conductor agent for DevPilot TRD <NN> on branch <branch>.
Read spec/trd/00-PROGRAM-OVERVIEW.md sections 2-3 and spec/trd/<NN-...>.md.
Inspect git log on this branch to determine the last completed wave (commits are
"TRD-<NN> wave N: ..."). Re-verify the done-checks of the last committed wave
before assuming it passed. Then continue the wave protocol from the next
incomplete task. Do not restart completed waves.
```
