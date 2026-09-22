# CLAUDE.md

Standing rules for Verafy. Claude Code reads this at the start of every session in
this directory.

## What Verafy is

A sequential decision engine. It takes a question, gathers evidence by scraping,
runs a structured multi-model discussion, scores the outcome, files it as a
**Decision**, and then keeps watching the world for evidence that should reopen it.

The product is not the score. The product is the **decision record and its revision
history**. Anyone can rate an answer once. Verafy tracks whether the answer survives.

## The thesis (do not lose this)

The original Verafy bet that tamper-evidence was the hard problem, and inscribed
verdicts immutably. That was wrong: immutability amplified verdicts there was no
basis to trust. The hard problems are **aggregation** (correlated judges are not
independent evidence) and **durability** (verdicts decay as the world changes).
Every design decision should serve one of those two.

## Core invariants

- A verdict that cites no evidence span is **invalid**, not merely low-confidence.
- Judges rule **independently first**. No judge sees another's verdict before its
  own is recorded. Cross-talk happens only in the critique pass, and only over
  reasoning, never verdicts.
- Every evidence item is stored with its source URL, fetch timestamp, and content
  hash. A decision is always reproducible against the evidence it actually had.
- Reopening never overwrites. It appends a revision. The original verdict stays
  readable forever.
- Panel composition is explicit and spans providers. Same-family models are treated
  as correlated by default, not independent.

## Architecture

    question ──► evidence gathering (scraper) ──► discussion ──► scoring ──► FILE
                        ▲                                                     │
                        └──────── watcher fires ◄──── reopen ◄────────────────┘

Five components, kept separate:

1. `evidence/`   — continuous scraper; fetches, hashes, stores, diffs
2. `panel/`      — judge adapters, one per provider; uniform interface
3. `discussion/` — the three-pass protocol (independent → critique → arbiter)
4. `scoring/`    — pluggable aggregators; majority, dependence-aware, robust
5. `registry/`   — decision store, watchers, revision history

The UI reads the registry. It never computes anything.

## Hard rules for the scraper

- Respect robots.txt. Rate limit 1 request per 2 seconds per domain, minimum.
- Descriptive User-Agent with contact info. No evasion, no CAPTCHA solving, no
  login-walled or paywalled content.
- Never collect personal information about private individuals. Questions about
  named private people are out of scope for this engine.

## Conventions

- Python 3.11+ backend. Records as JSON on disk under `data/decisions/<id>.json`
  until the shape stabilizes. No database in v1.
- Every LLM call emits an OpenTelemetry span. Verafy should be observable in Weave,
  Langfuse, Phoenix or LangSmith — it complements them, it does not compete.
- Prompts are versioned files under `panel/prompts/`, never inline strings.
- No aggregator ships without a benchmark result against the frozen gold set.

## Working style

- Smallest thing that runs end to end before anything scales.
- Show me 3 records before processing the rest.
- No new dependency without telling me what and why.
