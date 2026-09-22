# Changelog: Verafy Chrome extension

Each entry names the spec it implemented. Tagged folders under `releases/` are
frozen; see `specs/releases.md`.

## 0.2.1 (`releases/v0.2.1`, tag `extension-v0.2.1`)

Spec: `specs/fixes-navigation-history-status.md`.

- **Navigation:** the panel follows its window's active tab. Changing page
  (including single-page-app routes) or tab cancels the in-flight run (every
  API call takes an abort signal), clears the panel and old highlights, and
  drops any late result.
- **Saved rulings and History:** each ruling is saved per normalized URL after
  the claim map, after every verdict, and at the end (statement checks keyed by
  page plus statement hash), in `chrome.storage.local` with
  `unlimitedStorage`, 200 pages kept. Returning restores the ruling and
  highlights with no API calls; paragraphs are re-matched by text. Partial runs
  offer Resume. History view with per-row delete; Clear history in Settings.
- **Scan status:** instant button state, Cancel (saves partial), staged
  progress line and bar, slow-stage notice, score spinner, and a thin on-page
  progress bar.
- README install step now names the release folder.

## 0.2.0 (`releases/v0.2.0`, tag `extension-v0.2.0`)

Spec: `specs/extension.md` (handoff). Built outside this repo; not yet run
against the live API.

- **Full read** mode: maps the page into sections, finds up to 40 claims,
  highlights them in place (`page.js`, `page.css`, `<verafy-mark>`), and checks
  the top N by importance.
- Shadow-DOM popover on highlighted claims.
- Side panel tabs: **Claims**, **Cliff notes**, **Perspectives**. Cliff notes
  and perspectives are labeled as the model's reading and never touch the score.
- **Quick score** and **Statement** modes carried over from 0.1.0.
- Clearing highlights restores the page DOM exactly.

## 0.1.0 (`releases/v0.1.0`, tag `extension-v0.1.0`)

Single-mode version: quick score of a page's main claims plus right-click
statement check. No on-page highlights, no tabs.
