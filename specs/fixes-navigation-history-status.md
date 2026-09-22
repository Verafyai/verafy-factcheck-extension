# Verafy extension: fixes (navigation, saved rulings, scan status)

**Where to build this:** in the current in-progress release folder. If
nothing is in progress, copy the latest tagged release to the next patch
version (e.g. `v0.2.0` → `v0.2.1`) per `specs/releases.md`.

Build in the order below and stop for review after each fix.

---

## Fix 1: Clear the panel when the page changes

**Bug:** navigating to a new page leaves the old page's score, claims,
cliff notes, and perspectives in the panel. Results that arrive late can also
land on the wrong page.

**Fix**

- **Track the page.** The panel keeps `{ tabId, url }` for the page it's showing.
- **Listen for changes:**
  - `chrome.tabs.onUpdated`: when `changeInfo.url` changes for the tracked tab.
    This covers normal loads and single-page-app route changes.
  - `chrome.tabs.onActivated`: the user switched to another tab.
  - `chrome.windows.onFocusChanged`: the user switched windows.
- **On any change:**
  1. Cancel the in-flight run. Pass an `AbortController` signal into every
     `fetch` in `api.js`, and abort it.
  2. Clear the panel back to the empty state.
  3. On a same-tab single-page-app URL change, call `window.__verafy.clear()`
     on the old DOM. A full page load clears it on its own.
  4. Load the saved ruling for the new URL, if one exists (Fix 2).
- **Stale-result guard.** Each run gets a `runId`. Every async result checks
  `runId === currentRunId` before touching state or the DOM, and is dropped
  otherwise. This also applies to `pageUpdate` and `pageHighlight` calls.

**Acceptance**
- Starting a Full read, then clicking a link mid-scan: the old results
  disappear within 500 ms, and no old verdict appears later.
- Switching tabs shows the right result for each tab.
- On a single-page-app site (e.g. a news site with client-side routing),
  changing articles clears the old highlights.

---

## Fix 2: Save every ruling and restore it on return

**Bug:** navigating away or closing the panel loses the analysis. There's no
record of past rulings.

**What gets saved.** One record per page, keyed by normalized URL: no `#hash`,
tracking parameters removed (`utm_*`, `fbclid`, `gclid`, `mc_cid`, `ref`), no
trailing slash.

```js
{
  url, title, mode,           // "full" | "quick" | "statement"
  extensionVersion,
  startedAt, updatedAt,
  status,                     // "complete" | "partial" | "failed"
  score, basis,               // page truth score at save time
  claims,                     // full claim objects incl. args, attacks, verdicts, scores
  map,                        // gist, sections, perspectives (full mode)
  takes, source               // later features, if present
}
```

**When it's saved**
- After the claim map is built.
- After **each** claim verdict. A half-finished run is never lost.
- On completion, with `status: "complete"`.
- Statement checks are saved too, keyed by the source page's URL plus a hash
  of the statement.

**Where it's saved**
- `chrome.storage.local`, with the `"unlimitedStorage"` permission added to
  the manifest.
- Keep the 200 most recently updated pages and evict the oldest.

**Restore**
- When the panel opens, the tab changes, or the URL changes, look up the
  normalized URL.
- If a record exists, render it immediately. Show a line under the score:
  "Checked 2 hours ago" with a **Re-check** link, which starts a fresh run.
- For Full read, re-inject `page.js`, re-collect paragraphs, and re-apply
  highlights. Paragraph ids may differ on reload, so match each claim's quote
  against **all** collected paragraphs, not just its saved `pid`. If the page
  has changed and a quote can't be found, list that claim with "No longer found
  on this page" and no highlight.
- If `status: "partial"`, show **Resume**. It checks only the claims still
  pending or unchecked.

**History**
- A **History** view, opened from a clock icon in the panel header. It lists
  past rulings, newest first, with title, domain, score, verdict counts, and
  date.
- Clicking an entry opens the page in a new tab, where the ruling is restored.
- Settings gets **Clear history**, and each history row has a delete control.
- History never leaves the browser.

**Acceptance**
- Finish a Full read, navigate away, come back: the score, claims, notes,
  perspectives, and highlights are all restored with no API calls.
- Navigate away mid-scan, then come back: the partial result is shown with
  **Resume**, and Resume checks only what's left.
- Close and reopen the side panel: the current page's ruling is restored.
- History lists every run and restores each one correctly.

---

## Fix 3: Show scanning status during Full read

**Bug:** after clicking **Read the whole page**, nothing visible happens until
the first model call returns.

**Fix.** Everything below appears within 100 ms of the click.

- **Button state.** Both run buttons are disabled. **Read the whole page**
  changes to "Scanning…" with a small spinner. A **Cancel** button appears,
  which aborts the run (Fix 1's mechanism) and saves what's done as partial.
- **Stage indicator.** Under the buttons, a status line with a progress bar
  that steps through:
  1. "Reading the page…"
  2. "Finding claims and building cliff notes…" (indeterminate bar; this is
     the longest wait)
  3. "Checking claims: 3 of 12" (determinate bar)
  4. "Done" (fades after 2 s), or an error message that replaces the bar
- **Slow-call notice.** If a stage runs longer than 30 s, add "Still
  working. Long pages take longer." Don't time out silently.
- **Truth Pointer / score.** While scanning, the score shows "…" and the
  pointer is hollow (v0.3 §3). Before v0.3, the score area shows the spinner.
- **On the page.** A thin progress bar fixed to the top of the page (inside
  the shadow root, `pointer-events: none`) mirrors the panel's progress and is
  removed when scanning ends or is cancelled. Pending highlights keep their
  dashed style.
- **Accessibility.** The status line is `role="status"`. The progress bar has
  `role="progressbar"` with `aria-valuenow` during checking. Spinners and
  shimmer respect `prefers-reduced-motion`.

**Acceptance**
- The stage indicator and on-page bar appear within 100 ms of the click.
- Every stage transition is visible.
- Cancel stops all API calls and saves a partial record.
- An error at any stage clears the spinner and shows a message.

---

## When all three are done

Bump the patch version, add a CHANGELOG entry referencing this file
(`specs/fixes-navigation-history-status.md`), zip, commit, and tag.
