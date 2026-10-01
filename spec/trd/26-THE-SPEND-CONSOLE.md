# TRD 26 — The Spend Console
## What one developer should see about what their agents cost, and what to do about it
### v0.1 · October 2026 · Status: DESIGN — §3 SHIPPED in CLI 0.6.0

---

## 1. Where this comes from

In August 2026 Uber published how it runs coding agents at company scale
(Uday Kiran Medisetty, "Running a Software Factory Efficiently at Uber Scale",
Uber Engineering Blog, 27 August 2026 —
https://www.uber.com/us/en/blog/efficient-software-factory/). The parts of it
that matter here:

- **A personal spend dashboard for every engineer**, plus a live cost counter
  in the terminal status line.
- **A cost equation** that separates growth they want from waste: "users ×
  sessions/user × turns/session × requests/turn × tokens/request ×
  price/token". The first two are adoption. Turns, requests and tokens are
  what the agent does on its own initiative.
- **Waste patterns flagged automatically.** The post says a skill analyses
  session traces and "flags 16 distinct anti-patterns", each with its financial
  impact and a fix. Four are named: the wrong model for the work, large MCP
  payloads persisting in context, expired prompt caches, and about 100K tokens
  loaded before the user types anything.
- **Tool-schema overhead.** With 100+ MCP tools, schemas added "approximately
  50K-70K tokens" to every session.
- **Results they report:** cost per 1,000 requests "down almost 34% from its
  peak" and cost per session "down 52% from its June peak".

Those figures are Uber's, about Uber's fleet, and are quoted here as theirs
from the post itself (read 2026-10-01). Nothing in this document, the product
or its marketing may restate them as something DevPilot delivers. A widely
shared summary of the post says weekly active users grew 9.4× and, elsewhere,
10×; the post says weekly active users "grew 7x" and weekly agentic *requests*
"grew 9.4x". That is the reason to quote the primary source or nothing.

**The observation that makes this a product decision:** what Uber built for
thousands of engineers is, piece for piece, what a single developer on a
subscription needs and cannot get. A company can staff a platform team to
build a dashboard. A person cannot. V1 of DevPilot is that console for one
developer, on their own machine, free.

---

## 2. What we already have against that list

| Uber's piece | DevPilot today | Gap |
|---|---|---|
| Personal dashboard: spend, sessions, cache hit rate | `/efficiency`: agent time, written work, tokens by kind, share served from cache, cost at API rates, per change, by harness and model | No cache-miss cost; no recommendations |
| Live counter in the status line | — | **Nothing. See §4.** |
| Cost equation | Sessions, model responses, tokens per session | Prompts per session and responses per prompt are not counted |
| Waste patterns with a price and a fix | — | **Nothing. See §5.** |
| Prompt-initialisation overhead | Measured once: 29,139 → 23,936 first-turn tokens under `--harness lean` | Not shown per session |
| MCP payload / schema overhead | `lean` drops MCP servers for dispatched agents | Not measured for sessions the developer runs by hand |
| Model routing | Tokens and cost by model | No "same tokens, next model down" figure |
| Subscription window used | — | **Not captured. See §4.** |
| Knowledge graph | — | TRD 27 |

So the dashboard exists and is the right shape. What is missing is the two
things that make a dashboard change behaviour: it is not where the developer
is looking (the terminal), and it does not say what to do.

---

## 3. Shipped in 0.6.0 (the substrate)

- Token usage counted once per model response, by kind and by model, for every
  session on the machine — including ones the developer starts by hand.
- Cost at API list prices, per model, labelled as an estimate everywhere.
- Readings grouped by harness and model, so a change can be compared with what
  it replaced.

Everything below is arithmetic over data the machine already reads, plus one
new source (§4).

---

## 4. The status line — the highest-value thing not yet built

### 4.1 What Claude Code makes available

Claude Code runs a configured command and passes it session JSON on stdin
(`statusLine` in settings; https://code.claude.com/docs/en/statusline).
Verified against the documentation on 2026-10-01, the input includes:

- `cost.total_cost_usd` — session cost at list price.
- `context_window.used_percentage`, `context_window_size`, and
  `current_usage` (fresh input, output, cache read, cache creation).
- **`rate_limits.five_hour.used_percentage` and
  `rate_limits.seven_day.used_percentage`, with `resets_at`** — for Pro and Max
  subscribers.
- **`prompt_cache`** (Claude Code 2.1.251+): `warm`, `ttl`, `expires_at`,
  `hit_ratio`, `misses`, and from 2.1.260 `last_miss_cause` and `miss_causes`
  with causes such as `tools_changed`, `system_prompt_changed` and
  `ttl_expired_5m`.

Two of these change what DevPilot can say. TRD 25 and `docs/EFFICIENCY.md`
both list **subscription-window utilisation** as "not measured, and not
available for sessions DevPilot only observes". It is available — through this
channel, for exactly those sessions. And cache misses arrive already diagnosed
by the client, with a cause, instead of having to be inferred from gaps in a
transcript.

### 4.2 `devpilot statusline`

One command, two jobs.

**It prints** one line, in this order, each segment omitted when its data is
absent:

```
opus-5-5 · ctx 41% · cache warm 4m · $2.18 this session · 5h 37% · 7d 12%
```

**It records.** Each invocation appends the reading to
`~/.devpilot/statusline/<session-id>.json` (last value wins; the file is a few
hundred bytes). The bridge's observer already knows the session id for every
transcript it follows, so it picks these up and sends them with the session's
reading:

| New field | From | Crosses to hosted? |
|---|---|---|
| `windowUsed5h`, `windowUsed7d` (percent at last reading) | `rate_limits` | Yes — two numbers |
| `windowDelta5h` (percentage points this session consumed) | first vs last reading | Yes — a number |
| `cacheMisses`, `cacheMissCauses` (counts by cause) | `prompt_cache` | Yes — counts and cause names from a fixed list |
| `contextPeakPct` | `context_window` | Yes — a number |

All of it is counts and names from a closed vocabulary: derived facts in the
sense the security statement already uses. It is still a new field class, so
the "what the hosted plane receives" list changes in the same PR.

**Constraints, from the documentation:**

- The status line renders in its own row and replaces most footer hints, and
  there is **no documented way to add one without replacing a user's existing
  one.** So `devpilot statusline install` must: read the current `statusLine`,
  and if one exists, wrap it — run the user's command, append DevPilot's
  segments — and write back a command that does both, keeping the original in
  `~/.devpilot/statusline/previous.json` so `uninstall` restores it exactly.
  Never overwrite silently.
- The command is debounced at 300 ms and runs on every assistant message; it
  must be fast (target: under 50 ms, no network, no model call).
- `rate_limits` is absent for API-key users and before the first response.
  Absent means the segment is not printed — not `0%`.

### 4.3 Why this is the piece to build first

The core promise is "make your subscription go further". Today the product
measures tokens and prices them at API rates nobody on a subscription pays.
The window percentage is the unit the subscriber actually runs out of. With
`windowDelta5h` per session, the Efficiency page can answer the question a
subscriber has — *which sessions ate my window* — in their own unit, and
per-change cost can be stated as "window points per written change".

---

## 5. Waste patterns — recommendations with a price

Uber's four named patterns, and what each needs here. All run on the machine,
over transcripts and the status-line readings; only the result (pattern name,
count, an estimate) crosses.

| Pattern | Detect from | Price it as | Honest limit |
|---|---|---|---|
| **Cache expiry** — resuming after a break rebuilds the prefix at full write price | `prompt_cache.miss_causes.ttl_expired_5m`; fallback: a response whose cache-read drops to near zero after a gap longer than the TTL | (tokens rewritten × write price) − (same tokens × read price) | Exact with the status line; an inference without it |
| **Context bloat** — a large tool result sits in context and is re-read every turn | Tool-result byte sizes by tool name (size only, never content), × turns it stayed resident | bytes ÷ 4 × read price × remaining turns | Byte-to-token ratio is approximate; say so |
| **Initialisation overhead** — tokens loaded before the first prompt | The first response's input-side tokens | Shown as a count and as a share of the session | A fact, not a saving: some of it is necessary |
| **Model routing** — a frontier model on work a cheaper one would have done | Tokens by model | "These tokens at the next model down: $X" | **Arithmetic only.** Whether the cheaper model would have succeeded was not tested, and the copy must not imply it was |

Rules for every recommendation:

1. It names the session, the pattern and a number, and links to the evidence.
2. The number is labelled as what it is: measured, or an estimate with its
   assumption stated.
3. A "potential savings" total is shown **only** as the sum of patterns whose
   price is measured (cache expiry with a diagnosed cause). Estimates are
   listed beside it, never added into it. A single headline figure that mixes
   the two is the vendor-number mistake this product already removed once.
4. A recommendation whose fix DevPilot can apply says so and links to it
   (`--harness lean` for initialisation overhead; `+compact-200k` for bloat).
   That is the honest bridge to Pro (TRD 25): the readings and the
   recommendations are free; the managed configuration that acts on them, with
   before-and-after evidence, is what is sold.

---

## 6. The cost equation, for one developer

Uber's equation without "users":

```
spend = sessions × prompts per session × responses per prompt × tokens per response × price
```

`responses per prompt` is the agent's trajectory — how much it does on its own
per thing asked. It is the term a harness, a plan or a code graph is supposed
to move, and it is not shown anywhere today.

- Count human prompts per session on the machine (a count; the adoption
  scanner already tells a human prompt from a tool result, to pick a title).
- Show the four factors on `/efficiency`, this period against the last, so a
  rise in spend can be read as "more sessions" (fine) or "more responses per
  prompt" (worth looking at).

---

## 7. What to showcase now, with what already exists

No new code:

- **A section and a guide post that say plainly what this is**: the personal
  agent-cost console large engineering organisations are building internally,
  for one developer, on your own machine, free. Cite the Uber post as the
  reference for what such a console contains. Claim nothing about savings.
- **Lead the Efficiency section with the cached share.** "98% of what your
  agents read came from cache" is the single most surprising true number the
  product shows, and it reframes where the cost is.
- **Show the lean-harness measurement as what it is**: 29,139 → 23,936 tokens
  before the first prompt, on one trivial task. Uber's equivalent figure is
  50–70K tokens of tool schema per session. Ours is a measurement of fixed
  overhead, not of a session.

---

## 8. Sequence

| # | Work | Size | Depends on |
|---|---|---|---|
| 1 | `devpilot statusline` (print + record), `install` that wraps an existing status line, `uninstall` that restores it | S | — |
| 2 | Observer sends window and cache-miss fields; additive hosted migration; security list updated | S | 1 |
| 3 | Efficiency page: window points per session and per change; cache-miss cost tile | S | 2 |
| 4 | Prompt count; the four-factor decomposition | S | — |
| 5 | Waste patterns on the machine: cache expiry, initialisation overhead (measured) | M | 1 |
| 6 | Context bloat and model-routing arithmetic (estimates, labelled) | M | 5 |
| 7 | Recommendations view with the measured/estimated split | M | 5, 6 |
| 8 | Guide post and home page section | S | — (can ship first) |

Steps 1–3 are the release after 0.6.0.

---

## 9. Risks

- **Goodhart.** A per-session spend number in the terminal invites optimising
  for a small number rather than for work done. Per-change figures, and the
  Conductor Score's weighting of throughput above cost, are the counterweight.
- **The status line is one slot.** Wrapping a user's existing command is the
  only safe install, and it must be reversible byte for byte.
- **API-key users have no window.** Everything in §4.3 is for subscribers; the
  cost-at-API-rates figures remain the unit for everyone else.
- **Estimates read as measurements.** The measured/estimated split in §5 is the
  design; a later "total potential savings" tile that ignores it would undo it.
