# Verafy extension v0.4: amendment B (Debate)

This adds to `extension-v0.4-discussion.md` and reuses its engine. It builds
on the claim tooltip from v0.3 §1. Build it in `releases/v0.4.0`, after
Discussion steps 1–3.

It changes **one rule** from the Discussion spec: debate speakers get invented
names and illustrated avatars instead of plain role labels. The other honesty
rules still apply. See "Characters" below.

---

## Trigger

- A **Debate this** button on every checked claim's hover tooltip (v0.3 §1),
  next to "See evidence."
- The same button on each claim card in the Claims tab.
- Clicking it opens the side panel to the **Discussion** tab, filtered to that
  claim, and starts the debate. If the claim already has a debate, it's opened
  from cache instead of being regenerated.
- Before the first debate in a session, show a one-line estimate: "A debate
  runs about 6–10 model calls with web searches."

---

## Characters

Each debate gets a cast of **4 speakers** (3–5 in Settings), generated once per
debate:

| Field | Rule |
|---|---|
| Name | Invented first and last name. Never the name of a real public figure. If the model returns a recognizable real name, regenerate it. |
| Role | A discipline or stake in the claim, e.g. "Supply-chain analyst", "Data-center operator", "Economics professor", "Consumer advocate". |
| Stance | Pro, Con, or Neutral toward the claim. Every cast has at least one Pro, one Con, and one Neutral. |
| Avatar | Illustrated, not a photo: a geometric or initials-based avatar generated locally from a hash of the name (SVG). No photorealistic faces and no external image services. |

**Guardrails that stay**

1. Each speaker shows a small **AI** badge next to their name. Hovering the
   badge shows "Fictional AI speaker. Not a real person."
2. Viewpoints come from the role, never from a demographic identity. The model
   is told not to assign race, religion, nationality, gender, or politics as
   the basis for anyone's view. Names should vary, but a name never determines
   a stance.
3. **Export keeps the labels.** Markdown export writes every speaker as
   "Priya Anand (AI, Supply-chain analyst)" and adds a header line: "Generated
   debate. All speakers are fictional AI characters." There is no export option
   that strips these.
4. Nothing is posted to the real website (same as the Discussion spec).

---

## Debate format

Three rounds, each streamed into the thread as it's generated:

1. **Openings.** Each speaker states their position in 2–4 sentences, citing at
   least one source.
2. **Rebuttals.** Each speaker replies to one opposing speaker, quoting the
   point they're answering.
3. **Closings.** One sentence each: what would change their mind.

The Neutral speaker closes with a short summary of where the debate landed.

**Evidence rules** (same as `checkClaim`):
- Each turn may use up to 2 web searches.
- Every factual statement cites a search result. Citations are filtered
  against URLs the search actually returned.
- A turn whose citations are all dropped is not shown. It's replaced with
  "[Name] had no sourced response," so it's visible that the speaker had
  nothing to back their point.
- Speakers may concede, and should when the other side's source is stronger.

**Effect on the verdict**

- Each sourced point made in the debate becomes an argument in the claim's
  graph, and each rebuttal becomes an attack if it cites evidence.
- After the debate, `grounded.js` re-solves the claim.
- If the verdict or claim score changes, show the banner from the Discussion
  spec ("This debate changed the claim from Contested to Supported"), and update
  the page highlight, tooltip score, and Truth Pointer.

---

## Reading and joining

- The debate displays as a comment thread: avatar, name, AI badge, and role on
  each post. Rebuttals are nested under what they answer. Sources are shown
  with favicon and source-type badge (v0.3 §5).
- Each post shows its argument status (Standing, Unresolved, Knocked out)
  after the re-solve. No likes, no vote counts.
- The user can reply to any speaker with the Discussion composer. The
  addressed speaker answers first, then at most one other speaker.

---

## Settings

- Speakers per debate: 3–5 (default 4).
- Rounds: 2 or 3 (default 3). With 2 rounds, closings are skipped.
- Web searches per turn: 1–3 (default 2).
- Debates are cached with the Discussion thread for the page, 30 days.
  **Clear discussion** clears debates too.

---

## Acceptance

- Every checked claim's tooltip has a **Debate this** button that opens a
  debate for that claim.
- Every cast has a Pro, a Con, and a Neutral speaker with invented names,
  illustrated avatars, and AI badges.
- Every shown turn has at least one working source; unsourced turns are
  replaced by the "no sourced response" line.
- A debate that produces a winning sourced argument updates the verdict,
  and the banner, highlight, and Truth Pointer all change.
- Exported Markdown labels every speaker as AI and includes the header line.

## Build order (stop for review after each)

1. Cast generation, avatars, and badges. Show a debate's cast with no turns yet.
2. The three rounds, with evidence filtering and streaming.
3. Feeding points into the argument graph, re-solving, and the banner.
4. User replies, caching, settings, and export.
