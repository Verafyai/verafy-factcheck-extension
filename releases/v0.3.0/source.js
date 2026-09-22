// Source card (v0.3 amendment A): byline and publication at the top of the panel.
// Showing the card only reads the page's markup. Nothing is fetched and no model is
// called until the user clicks a Check button.

import { analyzePublication, checkClaim, ApiError, PUBLICATION_SEARCHES } from "./api.js";
import { SIGNALS, publicationScore, accuracySignal, overallLean } from "./profile.js";
import { readSourceMeta } from "./sourcemeta.js";
import { el, link } from "./dom.js";
import { iconCheck, iconX, iconDash } from "./icons.js";

const TTL = 7 * 24 * 3600 * 1000;
export const CACHE_PREFIX = "src:";   // "Clear source data" in Settings removes every key with this prefix
const pubKey = (domain) => `${CACHE_PREFIX}pub:${domain.toLowerCase()}`;
const LEAN_TEXT = { left: "Left", center: "Center", right: "Right" };

let deps = null;     // { loadSettings, keyNotice }
let meta = null;     // what the page says about itself
let token = 0;       // guards against a slow read for a page we've since left
let pub = { state: "idle" };   // idle | loading | done | error ; entry: { at, profile }
let accuracyStep = "idle";     // idle | confirm | running

const root = () => document.getElementById("source");

export function initSourceCard(d) { deps = d; }

export function hideSourceCard() {
  token++;
  meta = null;
  root().hidden = true;
  root().replaceChildren();
}

// statement: only show when the page has a byline or names its publication in metadata.
export async function showSourceCard(tabId, { statement = false } = {}) {
  const my = ++token;
  let m = null;
  try {
    [{ result: m }] = await chrome.scripting.executeScript({ target: { tabId }, func: readSourceMeta });
  } catch { /* page Chrome won't let us read */ }
  if (my !== token) return;
  if (!m || (statement && !m.authors.length && m.publicationFrom === "domain")) { hideSourceCard(); return; }
  meta = m;
  pub = { state: "idle" };
  accuracyStep = "idle";
  await render();
}

// ---------- Cache (chrome.storage.local only; never synced) ----------

async function cached(key) {
  const { [key]: entry } = await chrome.storage.local.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > TTL) { await chrome.storage.local.remove(key); return null; }
  return entry;
}
const store = (key, entry) => chrome.storage.local.set({ [key]: entry });

// ---------- Actions ----------

async function settingsWithKey() {
  const cfg = await deps.loadSettings();
  if (!cfg.apiKey) { deps.keyNotice(); return null; }
  return cfg;
}

async function checkPublication({ refresh = false } = {}) {
  const m = meta;
  if (!m || pub.state === "loading") return;
  if (!refresh) {
    const entry = await cached(pubKey(m.domain));
    if (entry) { pub = { state: "done", entry, fromCache: true }; await render(); return; }
  }
  const cfg = await settingsWithKey();
  if (!cfg) return;
  await chrome.storage.session.set({ sourceRunSeen: true });
  pub = { state: "loading" };
  accuracyStep = "idle";
  await render();
  try {
    const profile = await analyzePublication({ apiKey: cfg.apiKey, model: cfg.model, name: m.publication, domain: m.domain });
    const entry = { at: Date.now(), profile };
    await store(pubKey(m.domain), entry);
    if (meta === m) pub = { state: "done", entry };
  } catch (e) {
    if (meta === m) pub = { state: "error", error: e instanceof ApiError ? e.message : "The publication check failed. Try again." };
  }
  if (meta === m) await render();
}

async function runAccuracy() {
  const m = meta, entry = pub.entry;
  if (!m || !entry || accuracyStep === "running") return;
  const cfg = await settingsWithKey();
  if (!cfg) return;
  accuracyStep = "running";
  await render();
  const claims = entry.profile.claims;
  const checked = [];
  let i = 0;
  await Promise.all([0, 1].map(async () => {
    while (i < claims.length) {
      const c = claims[i++];
      let verdict = "unverifiable";
      try {
        ({ verdict } = await checkClaim({
          apiKey: cfg.apiKey, model: cfg.model, searchesPerClaim: cfg.searchesPerClaim,
          claim: { text: c.text, quote: c.quote }, page: { title: m.publication, url: c.url }
        }));
      } catch { /* counts as unverifiable */ }
      checked.push({ text: c.text, url: c.url, verdict });
    }
  }));
  entry.profile.signals.accuracy = accuracySignal(checked);
  await store(pubKey(m.domain), entry);
  accuracyStep = "idle";
  if (meta === m) await render();
}

// ---------- Rendering ----------

function ago(at) {
  const days = Math.floor((Date.now() - at) / 86400000);
  return days <= 0 ? "Checked today" : days === 1 ? "Checked yesterday" : `Checked ${days} days ago`;
}

function sourceLinks(sources, max = 4) {
  if (!sources?.length) return null;
  const shown = sources.slice(0, max);
  return el("span", { class: "src-links" },
    ...shown.flatMap((s, i) => [i ? document.createTextNode(" · ") : null, link(s.url, s.title)]).filter(Boolean),
    sources.length > max ? document.createTextNode(` · +${sources.length - max} more`) : null);
}

function statusIcon(status) {
  if (status === "found") return iconCheck("ok");
  if (status === "partial") return iconCheck("partial");
  if (status === "not_found") return iconX("no");
  return iconDash("unk");
}

function signalRow(sig, s, profile) {
  const li = el("li", { class: `sig ${s.status}` }, statusIcon(s.status),
    el("div", { class: "sig-body" },
      el("span", { class: "sig-label", text: sig.label }),
      el("span", { class: "sig-weight", text: ` (weight ${sig.weight})` }),
      s.finding ? el("p", { class: "sig-finding", text: s.finding }) : null,
      sourceLinks(s.sources)));

  if (sig.key === "accuracy" && s.status === "not_run") {
    const body = li.querySelector(".sig-body");
    const n = profile.claims.length;
    if (!n) body.append(el("p", { class: "sig-finding", text: "Optional. No checkable claims were found in the sampled articles." }));
    else if (accuracyStep === "running") body.append(el("p", { class: "sig-finding", text: `Checking ${n} ${n === 1 ? "claim" : "claims"}…` }));
    else if (accuracyStep === "confirm") {
      body.append(
        el("p", { class: "sig-finding", text: `This checks ${n} ${n === 1 ? "claim" : "claims"} from the sampled articles: ${n} more model ${n === 1 ? "call" : "calls"} and up to ${n * 3} web searches.` }),
        el("div", { class: "src-actions" },
          el("button", { class: "src-btn", text: "Run the check", onclick: runAccuracy }),
          el("button", { class: "link-btn", text: "Cancel", onclick: () => { accuracyStep = "idle"; render(); } })));
    } else {
      body.append(
        el("p", { class: "sig-finding", text: "Optional, off by default. Not counted in the score until run." }),
        el("button", { class: "src-btn", text: "Run accuracy sample", onclick: () => { accuracyStep = "confirm"; render(); } }));
    }
  }
  return li;
}

function leanScale(lean) {
  const conf = `${lean.confidence} confidence, based on ${lean.articles} ${lean.articles === 1 ? "article" : "articles"}`;
  if (!lean.position) {
    return el("div", { class: "lean" },
      el("p", { class: "lean-head", text: "Overall lean: Mixed or unclear" }),
      el("p", { class: "sig-finding", text: `Confidence ${conf}${lean.reason ? ` (${lean.reason})` : ""}.` }));
  }
  const scale = el("div", { class: "lean-scale", role: "img", "aria-label": `Overall coverage lean: ${LEAN_TEXT[lean.position]}, ${conf}` },
    el("span", { class: "lean-track" }),
    el("span", { class: `lean-mark at-${lean.position}` }));
  return el("div", { class: "lean" },
    el("p", { class: "lean-head", text: `Overall lean: ${LEAN_TEXT[lean.position]}` }),
    scale,
    el("div", { class: "lean-labels", "aria-hidden": "true" }, el("span", { text: "Left" }), el("span", { text: "Center" }), el("span", { text: "Right" })),
    el("p", { class: "sig-finding", text: `Confidence ${conf}. ${lean.topics} ${lean.topics === 1 ? "topic points" : "topics point"} the same way.` }));
}

function profileView(entry) {
  const p = entry.profile;
  const { score, used, excluded } = publicationScore(p.signals);
  const labelOf = (k) => SIGNALS.find((s) => s.key === k).label;
  const lean = overallLean(p.topics, p.articles.length);

  const d = el("details", { class: "src-result", open: "" }, el("summary", { text: "Publication profile" }));
  d.append(
    el("div", { class: "src-score" },
      score === null
        ? el("p", { class: "src-none", text: "Not enough information to score" })
        : el("p", { class: "src-num" }, el("strong", { text: String(score) }), document.createTextNode(" /100 credibility"))),
    el("p", { class: "sig-finding", text:
      `${used.length} of ${SIGNALS.length} signals determined.` +
      (excluded.length ? ` Not counted: ${excluded.map(labelOf).join("; ")}.` : "") +
      (score === null ? " A score needs at least 3." : "") }),

    el("h4", { text: "Signals" }),
    el("ul", { class: "sigs" }, ...SIGNALS.map((sig) => signalRow(sig, p.signals[sig.key], p))),

    el("h4", { text: "Potential bias" }),
    leanScale(lean),
    p.topics.length
      ? el("ul", { class: "topics" }, ...p.topics.map((t) => el("li", {},
          el("p", { text: `${t.pattern} (${t.k} of ${t.n} pieces on ${t.topic})` }),
          sourceLinks(t.articles))))
      : el("p", { class: "sig-finding", text: "No topic had enough sampled articles to describe a pattern." }),

    el("h4", { text: "Ownership and funding" }),
    p.ownership.length
      ? el("ul", { class: "facts" }, ...p.ownership.map((o) => el("li", {}, el("p", { text: o.text }), sourceLinks(o.sources))))
      : el("p", { class: "sig-finding", text: "No sourced ownership or funding information was found." }),

    el("h4", { text: "Independent assessments" }),
    p.assessments.length
      ? el("ul", { class: "facts" }, ...p.assessments.map((a) => el("li", {}, document.createTextNode(`${a.rater}: `), link(a.url, "their assessment"))))
      : el("p", { class: "sig-finding", text: "None found." }),

    el("details", { class: "sample" },
      el("summary", { text: `Articles sampled (${p.articles.length})` }),
      el("ul", { class: "facts" }, ...p.articles.map((a) => el("li", {}, link(a.url, a.title), a.fetched ? el("span", { class: "sig-weight", text: " (read)" }) : null)))),

    el("p", { class: "src-note", text: `Based on ${p.articles.length} recent articles and the publication's own policy pages. Lean describes coverage patterns, not intent.` }),
    el("p", { class: "src-meta" },
      document.createTextNode(`${ago(entry.at)} · `),
      el("button", { class: "link-btn", text: "Refresh", onclick: () => checkPublication({ refresh: true }) }))
  );
  return d;
}

async function render() {
  const card = root();
  if (!meta) { card.hidden = true; return; }
  const { sourceRunSeen } = await chrome.storage.session.get("sourceRunSeen");

  const authorRow = el("div", { class: "src-row" },
    el("span", { class: "src-name", text: meta.authors.length ? `By ${meta.authors.map((a) => a.name).join(", ")}` : "No author listed" }));

  const pubBtn = el("button", { class: "src-btn", text: pub.state === "loading" ? "Checking…" : "Check publication", onclick: () => checkPublication() });
  if (pub.state === "loading") pubBtn.disabled = true;
  const pubRow = el("div", { class: "src-row" }, el("span", { class: "src-name", text: meta.publication }), pubBtn);

  const pubResult = el("div", { class: "src-out", "aria-live": "polite" });
  if (pub.state === "loading") pubResult.append(el("p", { class: "sig-finding", text: `Researching ${meta.publication}. This can take a minute.` }));
  if (pub.state === "error") pubResult.append(el("p", { class: "src-err", text: pub.error }));
  if (pub.state === "done") pubResult.append(profileView(pub.entry));

  card.replaceChildren(
    el("h2", { class: "src-title", text: "Source" }),
    authorRow,
    pubRow,
    pubResult,
    sourceRunSeen ? null : el("p", { class: "src-cost", text: `This runs about 6–${PUBLICATION_SEARCHES + 2} web searches.` })
  );
  card.hidden = false;
}
