# Verafy: Truth Check (Chrome extension, v0.1)

Scores the claims on any web page against independent web evidence, and checks
any statement you select.

## Install (developer mode)

1. Unzip this folder.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `verafy-extension` folder.
4. Pin Verafy, click it, open **Settings**, and paste your Claude API key.
   Web search must be enabled for your organization in the Claude Console.

## Use

- **Whole page:** open an article, click the Verafy icon, then **Check this page**.
- **One statement:** select text, right-click, **Check "…" with Verafy**.

## How it works

1. **Extract.** Claude pulls up to N checkable factual claims from the page and
   rates each 1–3 by how central it is. Opinions are skipped.
2. **Argue.** For each claim, Claude searches the web (the page's own domain is
   blocked, so it can't cite itself) and writes arguments for and against.
   Each argument must quote a real search result.
3. **Filter.** Any argument whose source URL wasn't actually returned by the
   search tool is dropped. No evidence, no argument.
4. **Solve.** Claude marks which arguments attack which. A deterministic solver
   (`grounded.js`, grounded semantics) decides what survives. The model never
   picks the verdict.
5. **Score.** Supported = 1, contested = 0.5, refuted = 0, weighted by
   importance. Claims that can't be verified are excluded, and the panel says so.

Run `node test_grounded.mjs` to test the solver.

## Known limits in v0.1

- One model is the panel. Multi-provider judges come next.
- Page text is read from `<article>`, `<main>`, or the body, capped at 20k characters.
- Each claim costs one API call plus up to N web searches, so cost scales with claims per page and model choice.
- The API key sits in `chrome.storage.local`. Fine for personal use; a public
  release should route calls through a small backend instead.
