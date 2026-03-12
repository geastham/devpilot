# DevPilot Benchmark Suite

Three benchmark projects for evaluating and optimizing DevPilot's planning intelligence — wave decomposition, dependency sequencing, prompt construction, and agent orchestration.

## Benchmarks

| # | Project | Codename | Planning Challenge |
|---|---------|----------|--------------------|
| 01 | CLI Static Site Generator | **Forgepress** | Plugin parallelism, interface gating |
| 02 | REST API with Auth & Webhooks | **Taskforge** | Cross-cutting concerns (auth), converging critical paths |
| 03 | React Analytics Dashboard | **InsightBoard** | Multi-context (ETL + API + UI), horizontal vs. vertical strategy |

## Structure

```
benchmarks/
├── 00-common/
│   └── BENCHMARK-METHODOLOGY.md    # Scoring, metrics, execution protocol
├── 01-cli-static-site-gen/
│   ├── PRD.md                       # Full product requirements
│   ├── acceptance/
│   │   └── run-tests.sh            # Automated acceptance tests
│   ├── fixtures/                    # (defined inline in PRD)
│   └── specs/                       # Agent drops specs here
├── 02-rest-api-task-manager/
│   ├── PRD.md
│   ├── acceptance/
│   │   └── run-tests.sh
│   ├── fixtures/
│   │   └── seed.js
│   └── specs/
├── 03-react-analytics-dashboard/
│   ├── PRD.md
│   ├── acceptance/
│   │   └── run-tests.sh
│   ├── fixtures/
│   │   ├── products.csv
│   │   ├── customers.csv
│   │   └── orders.csv
│   └── specs/
└── README.md                        # This file
```

## Quick Start

1. Drop this folder into your DevPilot project's benchmarking directory
2. Read `00-common/BENCHMARK-METHODOLOGY.md` for scoring and execution protocol
3. Point the agent at any `PRD.md` as its sole input
4. Run the corresponding `acceptance/run-tests.sh` to validate output
5. Capture Game Film for analysis

## Execution Protocol

For each benchmark, run minimum 3 iterations:

- **Run A**: Baseline — agent uses default decomposition
- **Run B**: Guided — provide ground-truth dependency graph as hint
- **Run C**: Constrained — limit to 2 concurrent agent slots

Target: 5–10 minutes per full run.

## Scoring

Composite score (0–100) based on: acceptance test pass rate (30%), wave plan quality vs. ground truth (25%), first-attempt pass rate (20%), completion time (15%), rework ratio (10%).

See methodology doc for full rubric.
