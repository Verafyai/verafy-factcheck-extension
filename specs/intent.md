# intent.md — Verafy: Sequential Decision Engine

## Goal

Ship a public, demonstrable v1 of Verafy as a decision engine: questions go in,
structured multi-model discussion happens over scraped evidence, verdicts are filed
as Decision records, and a continuous watcher reopens decisions when the evidence
underneath them changes.

The release is a working artifact people can click through — not a README.

## Why this exists

State this plainly in the launch post and the docs:

> Verafy v1 assumed tamper-evidence was the hard problem. It wasn't. Inscribing a
> verdict immutably just made a verdict permanent that there was no basis to trust.
> The hard problems are aggregating correlated judges and keeping verdicts alive as
> the world changes. v2 is built on that correction.

## Definition of done (v1)

1. 15–20 seeded questions in a single domain, filed as Decision records.
2. A panel of 3 judges spanning at least 2 providers, ruling independently.
3. Three-pass discussion protocol implemented and visible in every record.
4. At least two aggregators implemented, with a benchmark showing they disagree.
5. At least one watcher that has actually fired and produced a revision.
6. A public web page showing the decision list, one decision in full, and a
   timeline of its revisions.
7. Every decision reproducible: given its stored evidence set, re-running produces
   the same verdict.

## The Decision record

The single most important artifact. Fields:

    id                  stable identifier
    question            stated so it can be falsified
    domain              topic bucket
    opened_at           ISO timestamp
    evidence[]          { url, fetched_at, sha256, excerpt, source_type }
    panel[]             { model_id, provider, role, prompt_version }
    discussion          { independent[], critique[], arbiter }
    judgments[]         { model_id, verdict, confidence, evidence_span_ids[], rationale }
    aggregation         { method, result, dissent, coupling_estimate }
    verdict             the filed answer
    confidence          0..1
    watch_conditions[]  { description, source_url, check_type, last_checked }
    status              open | stale | revised | retired
    revisions[]         { at, trigger, previous_verdict, new_verdict, diff_summary }

Rules:
- `judgments[].evidence_span_ids` must be non-empty or the judgment is rejected.
- `revisions` is append-only. Never mutate a prior verdict.
- `coupling_estimate` records which judges agreed suspiciously often.

## The three-pass discussion protocol

**Pass 1 — Independent.** Each judge receives the question and the evidence set.
No judge sees any other's output. Judgments recorded immediately. This pass is what
protects independence; nothing may leak into it.

**Pass 2 — Critique.** Each judge sees the other judges' *rationales* with verdicts
stripped, and must identify the weakest claim and say why. No verdict revision here.

**Pass 3 — Arbiter.** A separate model reads everything and produces the filed
verdict. It may only resolve disagreement where the evidence supports it, and must
cite evidence spans. Where evidence is insufficient, it must return `unresolved`
rather than pick a side. Dissent is preserved in the record, never discarded.

## Aggregation

Pluggable. Ship at least two of:

- **Majority / weighted vote** — the baseline, included so it can be shown losing.
- **Dependence-aware** — estimate the judge coupling matrix from the gold set and
  apply the corrected decision rule. Same-provider judges are expected to be
  strongly coupled; surface that estimate to the user.
- **Robust** — geometric-median style aggregation, for when one judge is drifting
  or compromised.

No aggregator ships without a benchmark against the frozen gold set.

## Calibration

- A frozen, human-labeled gold set. Additions are versioned (v2 alongside v1),
  never silent replacements.
- Per-judge agreement rate with human labels. This is the calibration number.
- Pairwise agreement between judges, to detect correlation.
- Drift check: re-run the gold set on a schedule to catch silent provider updates.

## The watcher

- Each decision declares watch conditions at filing time: what would change my mind.
- The scraper re-checks those sources on a schedule and compares content hashes.
- On change: mark the decision `stale`, queue it for re-adjudication, and on
  completion append a revision with the trigger recorded.
- The headline metric this unlocks: **decision survival rate** — what fraction of
  filed verdicts survive contact with new evidence, sliced by domain, by aggregator,
  and by panel composition. Nobody publishes this. It is the reason to care.

## The visual

One page, three views:

1. **Board** — all decisions as cards. Status colour-coded. Stale ones visibly
   flagged. Sortable by confidence, age, revision count.
2. **Decision detail** — question at top, evidence cards with timestamps, the three
   passes rendered as parallel columns converging on the arbiter, verdict with
   dissent shown, aggregation method and coupling estimate visible.
3. **Timeline** — every revision, what triggered it, what changed.

The demo that sells it is watching one decision flip.

## Build order

Do not start a step until the previous one runs.

- **Step 1** — Decision record schema + storage. Hand-write two records as JSON.
  Get the shape right before writing any code that produces them.
- **Step 2** — One judge, one question, one evidence item, end to end. Record filed.
- **Step 3** — Panel of three across two providers, independent pass only, majority
  vote. This is already useful.
- **Step 4** — Gold set (50 examples) + calibration reporting.
- **Step 5** — Second aggregator + benchmark against #3. This is the release-worthy
  moment; it is the first thing nobody else has.
- **Step 6** — Full three-pass discussion protocol.
- **Step 7** — Scraper + watchers + re-adjudication + revisions.
- **Step 8** — The public visual.

Steps 1–5 are the minimum for a credible public release. 6–8 make it a product.

## Non-goals for v1

- No blockchain, no inscription, no token. The original mistake was leading with
  permanence. Permanence can come back later, applied to revision history rather
  than verdicts — but not in v1 and not in the launch narrative.
- No fine-tuning. Prompted judges only.
- No database, no auth, no multi-user.
- No real-time. Batch runs on a schedule are fine.
- No political-opinion questions in the seed set. Pick a domain with checkable
  ground truth so calibration means something.

## Open questions to ask me before building

- Which domain for the seed questions?
- Which providers do I have working API keys for right now?
- Local models via Ollama for any of the panel, or all API?
- Is the public artifact a hosted page, a repo, or both?

## Constraint to respect

Verafy is personally owned, disclosed to prospective employers, and currently not
under active development during employment discussions. Visible work on this should
land before an offer is signed, or under an explicit carve-out negotiated at signing.
Do not let scope creep past what has been disclosed.
