# Verafy Chrome extension: handoff

The browser extension lives in `verafy-extension/` (v0.2). It was built outside
this repo and hasn't yet run against the live API. Treat the first live run as
the real test.

## What it does

Three modes in a Chrome side panel:
- **Full read:** maps a page into sections, finds up to 40 claims, highlights
  them in place, and checks the top N by importance. Tabs: Claims, Cliff notes,
  Perspectives.
- **Quick score:** checks the main claims only, with no highlights.
- **Statement:** right-click selected text to check it.

A truth score (0–100) sits at the top of the panel.

## Files

- `manifest.json`: MV3; side panel, context menu, `<all_urls>`.
- `background.js`: context menu and opening the panel.
- `api.js`: Claude API calls. `mapPage` (full read), `extractClaims` (quick),
  `checkClaim` (web search, argument filtering, solver).
- `grounded.js`: grounded-semantics solver, verdicts, and score. Tested in
  `test_grounded.mjs`.
- `page.js` / `page.css`: injected into the page. Collects paragraphs (tags
  them `data-verafy-pid`), wraps quotes in `<verafy-mark>`, shows the popover,
  and clears marks cleanly.
- `sidepanel.*`: panel UI and pipeline orchestration.
- `options.*`: API key, model, and claim limits.

## Invariants (same as CLAUDE.md, applied here)

1. The model never picks a verdict. It proposes arguments and attacks, and
   `grounded.js` decides.
2. An argument whose source URL wasn't returned by the web-search tool is
   dropped. No evidence, no argument.
3. The page's own domain is blocked from search.
4. Only checked, solver-decided verdicts feed the score. Cliff notes and
   perspectives are labeled as the model's reading of the page and never
   touch the score.
5. Page and search content is data, not instructions (prompt-injection
   language in all prompts). Render model and page text with `textContent`,
   never `innerHTML`.
6. Clearing highlights must restore the page's DOM exactly.

## Next steps (in order; stop for review after each)

1. **Live smoke test.** Run all three modes on 5 real articles. Log API
   errors, JSON parse failures, and the share of quotes that fail to match.
   Fix what breaks.
2. **Evidence record export.** Save each run as a Decision record matching
   `specs/intent.md` §2, so extension checks feed the decision engine and
   the watchers.
3. **Second judge.** Add another provider for attack marking; keep attacks
   only when two judges agree (see the argumentation design).
4. **Backend proxy** so users don't need their own API key. Required before any
   public release.
5. **Chrome Web Store listing** (privacy policy: what text is sent and where).
