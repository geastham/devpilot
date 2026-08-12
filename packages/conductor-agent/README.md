# @devpilot.sh/conductor-agent

The DevPilot conductor as a [LangGraph](https://github.com/langchain-ai/langgraphjs)
agent: **plan → score → refine → human review → dispatch → advance**, as one
resumable graph.

MIT. No dependency on DevPilot — implement six functions and it runs anywhere.

```bash
npm i @devpilot.sh/conductor-agent
```

---

## The idea

Most "agent orchestration" puts the model in charge of sequencing. This does the
opposite: **the graph owns control flow, the model only produces plans.** Which
wave runs next, when to refine, when to retry, when to stop and ask a human —
all of that is declared as edges, and none of it is left to a model to remember.

Effects live behind `ConductorPorts`, so the agent never touches your database,
your API keys, or your dispatch layer.

```
generate ─▶ score gate ─┬─(below threshold, budget left)─▶ refine ─┐
                        └─(good enough / out of budget)─▶ review ◀─┘
                                                            │
                     ┌────────(refine w/ constraints)───────┤
                     ▼                          (approve)   ▼
                  refine                                 persist
                                                            │
                                    ┌───────────────────────┘
                                    ▼
                                dispatch ─▶ awaitWave ─┬─(ok)─▶ advance ─┬─(more)─▶ dispatch
                                    ▲                  │                 └─(none)─▶ finish
                                    └──(retry)─────────┴─(failed)─▶ fail
```

---

## Usage

```ts
import { createConductorGraph, Command } from '@devpilot.sh/conductor-agent';
import { MemorySaver } from '@langchain/langgraph';

const graph = createConductorGraph({
  ports: {
    generatePlan: async (input) => ({ plan: await myPlanner(input), tokensUsed: 0 }),
    refinePlan:   async (input) => ({ plan: await myRefiner(input) }),
    scorePlan:    (plan) => ({ parallelizationScore: myScorer(plan) }),
    persistPlan:  async (plan) => ({ wavePlanId: await save(plan) }),
    dispatchWave: async (id, i) => myDispatcher(id, i),
    // waitForWave omitted → the graph interrupts and you resume it
  },
  config: { minParallelizationScore: 70, maxRefinementIterations: 3 },
  checkpointer: new MemorySaver(),
});

const cfg = { configurable: { thread_id: 'item-42' } };

// Runs until it needs a human.
const paused = await graph.invoke(
  { itemId: 'item-42', itemTitle: 'Add batch ops', repo: 'acme/widget', specContent: spec },
  cfg
);

paused.__interrupt__[0].value;   // → ReviewRequest: the plan, its score, why it stopped

// Resume with a decision.
await graph.invoke(new Command({ resume: { action: 'approve' } }), cfg);
```

The conductor can also send it back:

```ts
await graph.invoke(
  new Command({ resume: { action: 'refine', constraints: ['do not touch src/db'] } }),
  cfg
);
```

Those constraints land in state and re-enter the refinement prompt. The
refinement budget is deliberately *not* reset — a human who keeps rejecting
should hit review again, not spin the model indefinitely.

---

## Waiting for a wave

A wave is a fleet of coding agents that may run for hours. Two options:

- **Omit `waitForWave`** (recommended). The graph `interrupt()`s after dispatch
  and checkpoints. Resume it from your completion callbacks with
  `new Command({ resume: { state: 'complete' } })`. Survives a process restart.
- **Provide `waitForWave`** for tests or short synchronous runs, where holding a
  promise open is fine.

---

## Config

| Option | Default | Meaning |
|---|---|---|
| `minParallelizationScore` | `70` | Refinement stops once the score reaches this |
| `maxRefinementIterations` | `3` | Hard cap on refinement passes |
| `requireReview` | `true` | `false` dispatches a plan no human has seen |
| `failurePolicy` | `'halt'` | `'continue'` advances past a failed wave |
| `waveRetryLimit` | `1` | Re-dispatch attempts before the policy applies |

---

## Design notes

**A refinement is kept only if it scored better.** The model will happily return
a *different* plan that parallelises worse; accepting it because it is newer
turns the loop into a random walk. Iterations count up either way, so a run that
cannot improve still terminates.

**`scorePlan` must stay deterministic.** It is the gate the refinement loop
branches on. An LLM there makes the loop unfalsifiable.

**State is one serialisable object.** Every field the graph branches on lives in
the state channel, which is what lets a checkpointer suspend a run at any node
and resume it later.
