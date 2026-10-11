# Verafy — Sequential Decision Engine

Questions in, structured multi-model discussion over scraped evidence, verdicts
filed as Decision records, and a watcher that reopens them when the evidence
changes.

## Starting a new context

    cd verafy
    claude

First message:

    Read CLAUDE.md and specs/intent.md. Ask me the open questions at the
    bottom of intent.md. Then do Step 1 only — hand-write two Decision
    records as JSON so we can check the shape — and stop.

Work one step at a time. Say "next step" when the last one satisfies you.

## Layout

    CLAUDE.md                        standing rules, read every session
    specs/intent.md                  what v1 must accomplish, build order
    .claude/agents/research-ingest.md  research monitor subagent
    evidence/                        scraper
    panel/                           judge adapters + versioned prompts
    discussion/                      three-pass protocol
    scoring/                         pluggable aggregators
    registry/                        decision store, watchers, revisions
    research/cards/                  method cards from papers
    research/proposals/              candidate aggregators, unshipped
    data/decisions/                  the records
    data/gold/                       frozen labeled set

## The one-line pitch

Everyone scores answers once. Verafy tracks whether the answer survives.

## Prior art to read before Step 5

- Dependence-aware label aggregation via Ising models (Amazon, ICML 2026) — the
  coupling-matrix result and the proof that correlation-ignoring majority vote
  stays strictly suboptimal as the panel grows.
- RoPoLL (AWS) — robust aggregation, geometric median.
- CollabEval (AWS) — three-phase collaborative evaluation.
- Anthropic, "Demystifying evals for AI agents" — vocabulary: task, trial, grader,
  transcript, outcome, eval harness vs agent harness, capability vs regression.
