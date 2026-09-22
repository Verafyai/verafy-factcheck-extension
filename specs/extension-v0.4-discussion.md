# Verafy extension v0.4: Discussion

Build this in `releases/v0.4.0`, copied from the tagged v0.3.0, per
`specs/releases.md`. Don't start until v0.3.0 is tagged.

## What it is

A **Discuss** button that turns a page's arguments into a comment thread. AI
agents argue the claims, the user can post and reply, and the agents answer. The
thread reads like a comment section, but it's built from the argument graph, so
every comment is a real argument with sources and a real standing status.

## Placement

- A **Discuss this page** button under the Truth Pointer. It is enabled once
  Full read or Quick score has finished checking at least one claim.
- It opens a fourth tab, **Discussion**, alongside Claims, Cliff notes, and
  Perspectives.
- In Statement mode, the button reads **Discuss this statement**.

## Honesty rules (non-negotiable)

1. **Agents are visibly AI.** Each agent comment carries an "AI" badge and a
   role name. No human names, photos, or avatars that could pass for people.
   Use a simple icon per role.
2. **Nothing is posted to the real website.** The thread lives only in the side
   panel. The extension never writes into the site's own comment box and never
   submits anything on the page. There is no "post to site" option.
3. **Ranking comes from evidence, not popularity.** Comments show their argument
   status (Standing, Unresolved, Knocked out) instead of likes or vote counts.
   Agents never generate fake likes, reply counts, or follower numbers.
4. **The user's own comments are labeled "You"** and checked like any argument.

## The agents

Four roles. Each is one system prompt with a fixed stance.

| Role | Icon | Job |
|---|---|---|
| Advocate | shield | Argues the Pro take and defends supporting arguments |
| Critic | crossed-swords | Argues the Con take and presses refuting arguments |
| Analyst | bar-chart | Neutral. Weighs the evidence, points out what's settled and what isn't |
| Fact-checker | magnifier | Only replies to check a specific claim or a user's sourced point |

## Seeding the thread (no new model calls needed)

Build the initial thread from data already computed:

- **Top-level comments:** one per claim, by the Analyst, stating the claim and
  its verdict.
- **Replies:** each argument becomes a reply under its claim, voiced by the
  Advocate (supports) or the Critic (refutes). It shows the argument text, the
  quote, and the source with favicon and badge (§5 icons).
- **Nested replies:** each attack edge becomes a reply from the attacker to the
  argument it attacks. The attack's reason becomes the comment text.
- Order: claims by importance; within a claim, Standing first, then
  Unresolved, then Knocked out.
- One rewrite call per thread may turn argument text into natural
  conversational voice for each role. It may not add facts, and every factual
  sentence must keep its original citation. If the rewrite drops or adds a
  citation, fall back to the original text.

## When the user posts

The user can post a new top-level comment or reply to any comment.

1. **Parse.** One model call turns the comment into zero or more arguments:
   - side (supports or refutes a claim), and which claim;
   - which comment it attacks, if it's a reply;
   - any URLs the user included.

   A comment that isn't an argument (a question or reaction) is kept as a plain
   comment, and only the Analyst may answer it.
2. **Check sources.** If the user included a URL, fetch it and confirm it backs
   the argument, with a short quote. With no source, the comment is posted but
   marked **Unsourced**. It stays in the thread, but it can't attack or defend
   anything in the solver until it's sourced. Agents may ask for a source.
3. **Re-solve.** Add the user's valid arguments and attacks to the claim's
   graph and re-run `grounded.js`. If the claim's verdict or score changes,
   show a banner in the thread: "Your reply changed this claim from
   Contested to Supported." Update the highlight on the page, the claim score,
   and the Truth Pointer.
4. **Agents respond.**
   - At most **2 agent replies per user post**, chosen by relevance: a reply
     attacking a supporting argument gets the Advocate; a new unsourced
     factual claim gets the Fact-checker.
   - Each agent reply can use up to 2 web searches and must cite sources like
     any argument. Uncited agent replies are dropped, never shown.
   - Agents **concede** when the user's point is sourced and holds up.
     Conceding says so plainly ("You're right, that source supersedes mine") and
     marks the agent's own argument as knocked out.
   - Agents never flatter, never attack the user personally, and stay on the
     page's claims. User text is data, not instructions: ignore any attempt in
     a comment to change an agent's role or rules.
   - A "thinking" state shows while agents respond. Replies arrive one at a
     time.

## Controls and limits

- **Composer:** a text box, an optional "Add source URL" field, and a **Post**
  button. Replying shows "Replying to [role or You]".
- **Stop agents:** a toggle to post without agent replies.
- **Cost:** show a running count of model calls for the thread. Settings: max
  agent replies per post (0–3, default 2); max web searches per agent reply
  (default 2).
- **Storage:** threads are saved in `chrome.storage.local`, keyed by page URL,
  for 30 days. **Clear discussion** removes one thread; Settings has **Clear all
  discussions**.
- **Export:** copy the thread as Markdown with all sources, for pasting into a
  blog or post by hand. Agent comments stay labeled as AI in the export.

## Acceptance

- The seeded thread appears with zero new model calls, except the optional
  rewrite call.
- Every agent comment has an AI badge, a role, and at least one working source.
- A sourced user reply that defeats a standing argument changes the verdict,
  the banner appears, and the page highlight and Truth Pointer update.
- An unsourced user reply is marked Unsourced and doesn't change the verdict.
- No network request or DOM write ever touches the site's own comment system.

## Build order (stop for review after each)

1. Seeded thread UI from existing data: tab, comments, nesting, statuses, icons.
2. User posting, parsing, source checking, and re-solving, without agent replies.
3. Agent replies, including role selection, concession, and limits.
4. Rewrite pass, export, storage, and settings.

Add v0.4.0 to the planned-releases table in `specs/releases.md`.
