# Releases: folder structure and rules

## Starting point on Rex's machine

- `~/Desktop/verafy/verafy-extension/`: **v0.1.0** (manifest says 0.1.0).
  Single mode: quick score and statement check.
- `incoming/verafy-extension-v0.2.0/` (from the bundle): **v0.2.0**. Adds
  Full read, on-page highlights (`page.js`, `page.css`), the shadow-DOM popover,
  and the Claims / Cliff notes / Perspectives tabs.
- No git repo yet.

v0.2.0 has never been run against the live API.

## Step 0: set up the repo and `releases/` (run in `~/Desktop/verafy/`)

1. `git init`. Commit everything as found: "Baseline: v0.1.0 as found, plus the
   v0.2.0 bundle".
2. `mkdir releases`, then `git mv verafy-extension releases/v0.1.0`.
   Confirm its manifest says 0.1.0. Commit, then tag `extension-v0.1.0`.
3. `git mv incoming/verafy-extension-v0.2.0 releases/v0.2.0`.
   Confirm its manifest says 0.2.0 and that `page.js` exists. Remove the empty
   `incoming/`. Commit, then tag `extension-v0.2.0`.
4. In `specs/`, update any path that points at `verafy-extension/` so it
   points at the new layout. The current release is `releases/v0.2.0`.
5. Create `releases/CHANGELOG.md` with entries for:
   - 0.1.0: quick score and statement check,
   - 0.2.0: Full read, highlights, tabs (summary in `specs/extension.md`).

   Commit.
6. Stop and report.

## Step 1: live smoke test of v0.2.0 (before any v0.3 work)

Follow "Next steps, 1" in `specs/extension.md`: load `releases/v0.2.0`
unpacked, run all three modes on 5 real articles, and log what breaks.
Fixes go in `releases/v0.2.1`, copied from v0.2.0 (never edit a tagged
folder). Tag it when it works. v0.3 is built on the latest working 0.2.x.

## How each follow-on release is made

1. Copy the **latest tagged** release to a new folder, e.g.
   `cp -r releases/v0.2.1 releases/v0.3.0`.
2. Build the spec in the new folder only, following its build order and
   stopping for review after each step.
3. When done:
   - bump `version` in `manifest.json`,
   - update the folder's `README.md`,
   - add a CHANGELOG entry naming the spec file it implemented,
   - zip the folder to `releases/verafy-extension-vX.Y.Z.zip`,
   - commit and tag `extension-vX.Y.Z`.

## Rules

- **A tagged release folder is frozen.** A fix is a new patch version.
- Only one untagged, in-progress folder at a time.
- Version numbers: **minor** for a new spec's features, **patch** for fixes.
- Every release folder is self-contained and loads directly with **Load
  unpacked**.
- Specs live in `specs/`, never inside release folders.

## Planned releases

| Version | Source |
|---|---|
| v0.1.0 | Found on disk (frozen) |
| v0.2.0 | Bundle (frozen) |
| v0.2.x | Smoke-test fixes, if needed |
| v0.3.0 | `specs/extension-v0.3.md` + `specs/extension-v0.3-source-panel.md` (amendment A replaces §4) |
| v0.4.0 | `specs/extension-v0.4-discussion.md` + `specs/extension-v0.4-debate.md` (amendment B, after Discussion steps 1–3) |
