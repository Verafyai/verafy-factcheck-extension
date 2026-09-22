# Verafy extension v0.3: change spec

Read `specs/extension.md` first. Every invariant there still applies. Build
these in the order below and stop for review after each one.

---

## 1. Per-claim truth score on hover

Every highlighted claim gets its own 0–100 score, shown in a hover tooltip.

**How the claim score is computed.** It is deterministic, derived from the
solver output in `grounded.js`. It is never a number the model supplies.

| Verdict | Range | Position within range |
|---|---|---|
| Supported | 70–100 | More surviving supporting arguments from distinct domains → higher. 1 source = 70, 2 = 85, 3+ = 95. +5 if nothing attacked them. Cap 100. |
| Contested | 35–65 | 50 ± 15 × (standing supports − standing refutes) / (total standing). |
| Refuted | 0–30 | More surviving refuting arguments from distinct domains → lower. 1 source = 30, 2 = 15, 3+ = 5. |
| Can't verify / not checked | no score | Tooltip says so. |

The page score becomes the importance-weighted mean of claim scores, replacing
the old 1 / 0.5 / 0 mapping. Update `test_grounded.mjs` with cases for each row.

**Tooltip.** It appears on hover, and on keyboard focus: marks get
`tabindex="0"`. It is built with the same shadow DOM approach as the current
popover. It shows:
- the claim score as a number and a mini Truth Pointer (§3),
- the verdict word,
- the one-line summary,
- counts of surviving supporting and refuting sources.

A click still opens the full popover with **See evidence in Verafy**.

Hover delay is 250 ms. The tooltip stays open while the cursor is over it and
never covers the highlighted text itself.

**Acceptance:** hovering any checked claim shows a score within 300 ms.
Unchecked claims show "Not checked yet" with no number.

---

## 2. Perspective Takes: exactly three

Add a **Takes** section at the top of the Perspectives tab, above
"Represented on this page" and "Missing from this page". It holds exactly three
takes on the page's central thesis:

- **Pro:** the strongest case for the thesis, as its supporters would make it.
- **Con:** the strongest case against it, as its critics would make it.
- **Neutral:** what a careful observer would conclude, taking into account the
  claim verdicts already computed.

**Rules**
- The thesis is stated once, above the three takes, in one sentence.
- Each take is 2–4 sentences, steelmanned, with no strawman and no loaded language.
- Each take cites at least one source: a claim from the page (with a link to it
  in the Claims tab) or a web search result, using the same filtering as
  `checkClaim`. A take with no citations is not shown. Show "Not enough
  evidence for a [Pro/Con] take" instead.
- The Neutral take is generated **after** claim checks finish and is given the
  verdicts as input. It must not contradict a verdict. It is still labeled as the
  model's reading, not a verdict. It never feeds any score.
- Implementation: one new API call, `takes()`, run after checks complete, with
  up to 2 web searches.

**Acceptance:** exactly three cards (Pro, Con, Neutral), each with at least one
working citation or an explicit "not enough evidence" state.

---

## 3. Truth Pointer

A gauge that points at the truth level. It replaces the verdict strip as the
main visual under the score number. Keep the strip as a thin row beneath the
gauge.

**Design**
- A horizontal scale from 0 to 100 with three zones in the verdict colors:
  refuted 0–30, contested 35–65, supported 70–100. The gaps between zones are
  neutral.
- A pointer (triangle plus hairline) marks the page score. It animates to its
  position only when the score changes, and respects
  `prefers-reduced-motion`.
- **Uncertainty band:** a translucent range around the pointer. Its width
  shrinks as more claims are scored: ±20 with 1–2 claims, ±10 with 3–5,
  ±5 with 6 or more. This keeps a score based on two claims from looking precise.
- While checks are running, the pointer is hollow. It becomes solid when
  everything has finished.
- A mini version (same component, 120 px wide, no labels) is used in the claim
  tooltip from §1.

**Accessibility:** `role="meter"` with `aria-valuenow`, `aria-valuemin`,
`aria-valuemax`, and `aria-valuetext` (e.g. "71, mostly supported, based on 5
claims").

---

## 4. Author tag, bias indicator, and credibility by domain (opt-in)

This is the most sensitive feature in the product. Build it last and stick to
the limits below. It makes claims about a real person. If it's wrong, it hurts
someone, and it could be defamatory.

**Trigger.** It never runs automatically. In Full read, if the page has a
byline, show an author tag above the tabs: "By [name]" plus a **Check author**
button. Nothing about the author is fetched until the user clicks.

**Who it runs on**
- Only people publishing under a byline: journalists, columnists, bloggers,
  and authors of reports. Detect the author from `<meta name="author">`,
  schema.org `author`, `rel="author"`, or byline markup.
- Never run it on commenters or social-media posters, and never on anyone
  identified only by a username.
- If the author can't be identified with confidence, don't show the button.

**What it looks at**
- Only the author's **published work**: other articles under their byline,
  found with web search (an author page on the same publication is ideal).
- Never personal social media, never personal life, never anything outside
  their professional writing.
- The sample is 5–15 recent pieces, shown to the user with links.

**Output**

1. **Coverage lean.** For each topic the author covers often, describe the
   pattern in how they present it, e.g. "tends to present AI regulation
   favorably (7 of 9 pieces)". Each pattern links to the pieces behind it.
   - Topic-by-topic with counts and links. No single left/right label.
   - Never infer or state the author's personal political affiliation,
     religion, or any other protected attribute.
2. **Credibility by domain.** Score 0–100 for each of their 2–4 main areas of
   coverage. It is built only from checkable signals:
   - stated credentials in their bylines or author bio (e.g. "former
     cardiologist" for medicine),
   - how often they cite primary sources,
   - published corrections found on the author's pages,
   - optionally, a sample of their past factual claims run through
     `checkClaim`. Cap at 5 claims, and warn the user about the cost first.

   Each score lists the signals and evidence behind it. With fewer than 5
   pieces in a domain, show "Not enough work to score" instead of a number.
3. **Framing in the UI.** Title it "Author track record", not "bias score" or
   "credibility rating". Show a permanent note: "Based on N published pieces.
   A pattern in coverage is not proof of bad faith."

**Storage.** Cache results in `chrome.storage.local` for 7 days, keyed by
author and publication. Never sync them, share them, or send them anywhere
except the Claude API calls that produce them. Add a "Clear author data"
button in Settings.

**Acceptance:**
- No network call about an author happens before the click.
- Every lean and every score links to the underlying pieces.
- A byline-less page shows no author tag.

---

## 5. Icons on arguments

For each argument card in the evidence list:

- **Side icon** before the "Supports" / "Refutes" label. Use inline SVG, not
  emoji:
  - Supports: a check inside a circle, in the supported color.
  - Refutes: an X inside a circle, in the refuted color.
  - Both icons get `aria-hidden="true"`, since the text label already carries the
    meaning.
- **Source graphic** next to the source link:
  - The site's favicon via Chrome's built-in `_favicon` API. Add the `"favicon"`
    permission and use
    `chrome.runtime.getURL("/_favicon/?pageUrl=<url>&size=16")`.
  - Do **not** use Google's favicon service or any other third party, because
    that would leak the user's sources.
  - Next to it, a small source-type badge chosen by domain rules: Government,
    Academic, News, Encyclopedia, Company, Other. The rules live in one
    editable file.
- If Rex meant something different by "graphical icon", ask before building.

**Acceptance:** every argument card shows a side icon, a favicon (with a
generic fallback), and a source-type badge.

---

## Build order

1. Icons (§5). Smallest change, and a good warm-up in the codebase.
2. Claim scores and hover tooltip (§1), including solver tests.
3. Truth Pointer (§3), including the mini version for the tooltip.
4. Perspective Takes (§2).
5. Author track record (§4).

Bump the version to 0.3.0 when all five are done. Update the README.
