# Changelog: Verafy Chrome extension

Each entry names the spec it implemented. Tagged folders under `releases/` are
frozen; see `specs/releases.md`.

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
