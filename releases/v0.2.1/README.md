# Verafy: Truth Check (Chrome extension, v0.2.1)

A truth filter for the web. Read any page with every checkable claim
highlighted in place and checked against independent sources, plus cliff
notes and a map of which perspectives are present and missing.

## Install (developer mode)

1. Unzip this folder.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and choose this folder (`releases/v0.2.1`).
   Upgrading from an earlier version: remove the old Verafy card first, or
   load this folder over it and click the reload icon.
4. Click the Verafy icon, open **Settings**, and paste your Claude API key.
   Web search must be enabled for your organization in the Claude Console.

## Three modes

- **Read the whole page:** maps the page into sections, finds every checkable
  claim (up to 40), and highlights each one on the page. The most central claims
  (12 by default) are checked right away, and highlights change color as
  verdicts come in. Click a highlight for the verdict; click **See evidence** to
  jump to it in the panel. Tabs: **Claims**, **Cliff notes** (the gist plus a
  per-section summary marked facts or opinion, with that section's verdicts),
  and **Perspectives** (who the page represents and what's missing).
  Claims beyond the limit show dotted underlines and can be checked one at a time.
- **Quick score:** checks the page's main claims only (6 by default). No highlights.
- **One statement:** select text, right-click, **Check "…" with Verafy**.

While a full read runs, the panel shows each stage (reading, finding claims,
checking N of M) with a progress bar, and a thin bar runs across the top of the
page. **Cancel** stops the run and keeps what's been checked.

## Saved rulings and History

Every ruling is saved in this browser as it's made, one per page. Come back to a
page, switch tabs, or reopen the panel, and the last ruling (with highlights) is
restored without any API calls. **Re-check** starts a fresh run; if a run was
interrupted, **Resume** checks only the claims that were left. The clock icon
opens **History**: past rulings, newest first. The 200 most recently updated
pages are kept. **Clear history** is in Settings. Nothing here leaves the browser.

Moving to another page or tab stops the current run and clears the panel.

Highlight colors: green supported, amber contested, red refuted, grey dotted
can't verify or not checked yet.

## How verdicts are made

1. **Argue.** For each claim, Claude searches the web (the page's own site is
   blocked, so it can't cite itself) and writes arguments for and against, each
   quoting a search result.
2. **Filter.** Arguments whose source wasn't actually returned by the search
   are dropped. No evidence, no argument.
3. **Solve.** Claude marks which arguments attack which. `grounded.js` decides
   what survives with a fixed rule (grounded semantics). The model never picks
   the verdict.
4. **Score.** Supported = 1, contested = 0.5, refuted = 0, weighted by how
   central each claim is. Unverifiable and unchecked claims don't count, and the
   panel says how many were left out.

Cliff notes and perspectives are the model's reading of the page. They aren't
fact-checked, and the panel says so.

Run `node test_grounded.mjs` to test the solver, and the other `test_*.mjs` files
for saved rulings, URL handling, and scan progress.

## Cost

A full read is one page-reading call plus one call (with up to N searches) per
checked claim. Lower "Claims checked in a full read" or pick a cheaper model in
Settings to reduce cost.

## Known limits

- One model is the panel. Multi-provider judges come next.
- Pages that load text lazily or live inside iframes may be partly missed.
- If a quote can't be matched word for word, the whole paragraph gets a colored
  left bar instead of an inline highlight.
- Clicking highlighted link text opens the Verafy popover, not the link.
- The API key is stored in the browser. A public release should route calls
  through a backend.
