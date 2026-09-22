# Verafy extension v0.3: amendment A (Source panel)

This **replaces §4 of `extension-v0.3.md`**. Every limit in that section
still applies to the author half. This amendment adds the publication half and
moves both into one panel at the top.

---

## Placement

A **Source** card at the very top of the side panel, directly under the header
and above the truth score. It appears in Full read and Quick score, and in
Statement mode when the selection came from a page with a byline or a known
publication.

Collapsed state (default). It is shown immediately and costs nothing, since it
only reads the page:

```
Source
 By Jane Doe              [Check author]
 The Example Times        [Check publication]
                          [Check both]
```

- Author name comes from `<meta name="author">`, schema.org `author`,
  `rel="author"`, or byline markup. If none is found with confidence, the author
  row shows "No author listed" and has no button.
- Publication name comes from `og:site_name`, schema.org `publisher`, or,
  failing those, the domain.
- Nothing is fetched and no model call is made until a button is clicked.
- Before the first run in a session, show one line with the expected cost:
  "This runs about 6–10 web searches."

Expanded state: results appear inline under the row that was checked. Each
result section can be collapsed again. Results are cached (see Storage), so
reopening the same author or publication is instant and free. A cached result
shows "Checked 3 days ago" and a **Refresh** link.

---

## Author analysis ("Author track record")

The same rules as v0.3 §4. In short:

- Opt-in and bylined writers only. Never commenters, usernames, or social accounts.
- Only published work, a sample of 5–15 pieces, each linked.
- **Coverage lean by topic**, with counts and links. No single left/right
  label for a person, and never their personal politics or any protected attribute.
- **Credibility by domain** (0–100 for each of 2–4 areas), built only from
  checkable signals. Show "Not enough work to score" when a domain has fewer
  than 5 pieces.
- A permanent note: "Based on N published pieces. A pattern in coverage is not
  proof of bad faith."

---

## Publication analysis ("Publication profile")

Publications are organizations with public editorial standards, so this half
can be more direct than the author half. It still needs evidence behind every
statement.

**1. Credibility score (0–100)**

It is the weighted sum of these signals. Each signal is shown with what was
found and a link to it:

| Signal | Weight | How it's checked |
|---|---|---|
| Corrections policy published and used | 20 | Find the policy page, then find actual published corrections. |
| Ownership and funding disclosed | 15 | An About or ownership page naming owners and major funders. |
| Named editorial staff | 10 | A masthead or staff page with real names. |
| News and opinion clearly labeled | 15 | Check the sampled articles for opinion or analysis labels. |
| Primary sources cited | 20 | Share of the sampled articles that link to primary sources. |
| Claim accuracy sample | 20 | Optional: run up to 5 factual claims from recent articles through `checkClaim`. Off by default; warn about the cost before running. |

If a signal can't be determined, it's excluded, the remaining weights are
rescaled, and the panel shows which signals were excluded. With fewer than 3
signals determined, show "Not enough information to score" instead of a number.

**2. Potential bias**

- **Coverage lean by topic:** the same method as for authors, across 10–20
  recent articles from the publication's own pages. Topic-level patterns with
  counts and links.
- **Overall lean indicator:** a small left / center / right scale. Show it only
  when the topic patterns point the same way with at least moderate confidence.
  Otherwise show "Mixed or unclear." Always state the confidence and the number of
  articles it rests on.
- **Ownership and funding context:** who owns it and who funds it, as found on
  the publication's own pages or reputable reporting, with links. Facts only,
  no insinuation.
- **Independent assessments:** if web search turns up independent media
  ratings of the publication, link to them and name the rater. Don't copy their
  scores or text into the panel. Many are proprietary, and our score must stand
  on its own evidence.

**3. Framing**

- Title it "Publication profile".
- Show a permanent note: "Based on N recent articles and the publication's own
  policy pages. Lean describes coverage patterns, not intent."

---

## Visual

- Each score uses the mini Truth Pointer component from §3, with an
  uncertainty band based on sample size.
- The lean indicator uses a separate, neutral-colored scale. It must not use the
  red, amber, and green verdict colors, so lean never reads as right or wrong.
- Each signal row shows a check icon (found), an X icon (looked for and not
  found), or a dash (couldn't determine). Use the same inline SVG icons as §5.

---

## Implementation notes

- New API functions in `api.js`, each with web search:
  - `analyzeAuthor({ name, publication, pageUrl })`
  - `analyzePublication({ name, domain })`
- Both return structured JSON. Every statement carries source URLs, and those
  URLs are filtered against URLs the search actually returned, same as
  `checkClaim`. A statement whose sources are all dropped is removed.
- **Check both** runs the two in parallel.
- **Storage:** `chrome.storage.local`, 7-day cache, keyed by author plus
  publication or by domain. Never synced or shared. Settings gets a "Clear
  source data" button covering both.

## Acceptance

- The Source card shows author and publication names with zero network calls.
- No author or publication call happens until the matching button is clicked.
- Every score, signal, lean, and ownership statement links to its evidence.
- Low-evidence cases show the "not enough" states instead of numbers.
- The lean indicator never uses verdict colors.

## Build order change

This becomes **step 5** of `extension-v0.3.md`. Build the publication half first,
since it's lower risk, and stop for review. Then build the author half.
