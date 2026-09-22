import { extractClaims, mapPage, checkClaim, ApiError, isAbort } from "./api.js";
import { truthScore, scoreLabel } from "./grounded.js";
import { el, safeHref, hostOf } from "./dom.js";
import { initSourceCard, showSourceCard, hideSourceCard } from "./source.js";
import { pageKey } from "./pageurl.js";
import { saveRuling, loadRuling, listRulings, deleteRuling, statementKey, paraSnippets, remapParagraphs } from "./history.js";

const $ = (id) => document.getElementById(id);
const DEFAULTS = { apiKey: "", model: "claude-sonnet-5", maxClaims: 6, searchesPerClaim: 3, fullReadClaims: 12 };
const VERDICT_TEXT = {
  supported: "Supported", contested: "Contested", refuted: "Refuted", unverifiable: "Can't verify",
  pending: "Checking", error: "Check failed", unchecked: "Not checked"
};
const KIND_TEXT = { fact: "Mostly facts", opinion: "Mostly opinion", mixed: "Facts and opinion" };

// Run state
let running = false;
let mode = null;            // "full" | "quick" | "statement"
let claims = [];
let map = null;             // { gist, sections, perspectives } in full mode
let page = null;
let tabId = null;
let cfg = null;

// The page the panel is showing, and the session bound to it. A session is replaced
// whenever the page changes or a new run starts; anything that finishes for an old
// session is dropped, and its API calls are aborted.
let shown = { tabId: null, url: null };
let windowId = null;
let session = { id: 0, ctrl: new AbortController() };
function newSession() {
  session.ctrl.abort();
  session = { id: session.id + 1, ctrl: new AbortController() };
  return session;
}
const live = (s) => s.id === session.id;
const sameUrl = (a, b) => (pageKey(a) ?? a) === (pageKey(b) ?? b);

// Identity of the saved record for what the panel shows:
// { key, startedAt, mode, url, title, paras (full mode), statement (statement mode) }
let current = null;

async function loadSettings() {
  return { ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) };
}
function setStatus(t) { $("status").textContent = t || ""; }
function showNotice(message, action) {
  const n = $("notice");
  n.replaceChildren(el("div", { text: message }));
  if (action) n.append(el("button", { text: action.label, onclick: action.run }));
  n.hidden = false;
}
function clearNotice() { $("notice").hidden = true; }
const keyNotice = () => showNotice("Add your Claude API key to start checking.", { label: "Open settings", run: () => chrome.runtime.openOptionsPage() });

// ---------- Saved rulings ----------

function startRecord(key, fields) { current = key ? { key, startedAt: Date.now(), ...fields } : null; }

// Partial until every queued claim has a verdict.
const statusNow = () => (claims.some((c) => c.verdict === "pending" || c.resume) ? "partial" : "complete");

// Saves the current state. Called after the claim map, after every verdict, and at the end.
function persist(s, status = statusNow(), error = "") {
  if (!live(s) || !current) return;
  const { score, basis } = truthScore(claims);
  saveRuling({
    ...current, extensionVersion: chrome.runtime.getManifest().version,
    updatedAt: Date.now(), status, score, basis, claims, map, error
  });
}

function ago(t) {
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} ${m === 1 ? "minute" : "minutes"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ${h === 1 ? "hour" : "hours"} ago`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? "day" : "days"} ago`;
}

// ---------- Page bridge (full mode) ----------

async function inPage(fn, ...args) {
  if (tabId == null) return null;
  try {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, args, func: fn });
    return result;
  } catch { return null; }
}
// Page writes check the session first, so a late result never marks a page it doesn't belong to.
const pageHighlight = (list, s = session) => (live(s) ? inPage((l) => window.__verafy?.highlight(l), list) : null);
const pageUpdate = (c, s = session) => (live(s) ? inPage((id, v, sm) => window.__verafy?.update(id, v, sm), c.id, c.verdict, c.summary || "") : null);
const pageClear = () => inPage(() => window.__verafy?.clear());
const pageFocus = (target) => inPage((t) => window.__verafy?.focus(t), target);

async function showOnPage(c) {
  if (mode === "full" && c.located && $("hlOn").checked) { await pageFocus({ claimId: c.id }); return; }
  if (!c.quote) return;
  await inPage((q) => { window.getSelection()?.removeAllRanges(); window.find(q, false, false, true); }, c.quote.slice(0, 80));
}

// ---------- Rendering ----------

function renderScore() {
  const { score, basis, total } = truthScore(claims);
  $("scoreNum").textContent = score === null ? "\u2013" : String(score);
  $("scoreLabel").textContent = claims.length ? scoreLabel(score) : "Truth score";
  $("score").dataset.band = score === null ? "" : score >= 60 ? "high" : score >= 40 ? "mid" : "low";

  $("strip").replaceChildren(...claims.map((c) => {
    const seg = el("span", { class: `seg ${c.verdict}`, title: `${VERDICT_TEXT[c.verdict]}: ${c.text}` });
    seg.style.flexGrow = String(c.importance || 1);
    return seg;
  }));

  const count = (v) => claims.filter((c) => c.verdict === v).length;
  const pending = count("pending"), unverifiable = count("unverifiable"), unchecked = count("unchecked");
  let t;
  if (!total) t = "Check a page to see how its claims hold up against independent sources.";
  else if (pending) t = `${total - pending - unchecked} of ${total - unchecked} claims checked so far.`;
  else {
    t = basis ? `Based on ${basis} checked ${basis === 1 ? "claim" : "claims"}, weighted by how central each is.` : "No claim could be scored.";
    if (unverifiable) t += ` ${unverifiable} couldn't be verified.`;
    if (unchecked) t += ` ${unchecked} more ${unchecked === 1 ? "was" : "were"} found but not checked.`;
  }
  $("scoreBasis").textContent = t;
}

function renderArg(a, claim) {
  const attackers = (claim.attacks || []).filter((t) => t.to === a.id);
  const href = safeHref(a.url);
  return el("div", { class: `arg ${a.status === "OUT" ? "out" : ""}` },
    el("span", { class: `arg-side ${a.side}`, text: a.side === "supports" ? "Supports" : "Refutes" }),
    el("p", { text: a.text }),
    el("blockquote", { text: `\u201c${a.quote}\u201d` }),
    href ? el("a", { class: "src", href, target: "_blank", rel: "noopener noreferrer", text: `${a.title} (${hostOf(href)})` }) : null,
    attackers.length && a.status === "OUT"
      ? el("div", { class: "by", text: `Defeated: ${attackers.map((t) => t.reason || t.kind).join("; ")}` }) : null
  );
}

function renderClaims() {
  $("claims").replaceChildren(...claims.map((c) => {
    const li = el("li", { class: "claim", id: `claim-${c.id}` },
      el("div", { class: "claim-head" },
        el("span", { class: `verdict ${c.verdict}`, text: VERDICT_TEXT[c.verdict] }),
        c.importance === 3 ? el("span", { class: "weight", text: "Central claim" }) : null
      ),
      el("p", { class: "claim-text", text: c.text }),
      c.summary ? el("p", { class: "summary", text: c.summary }) : null,
      c.error ? el("p", { class: "summary", text: c.error }) : null,
      c.missing ? el("p", { class: "summary missing", text: "No longer found on this page" }) : null
    );
    if (c.quote && c.fromPage && !c.missing) {
      li.append(el("p", { class: "claim-quote" },
        document.createTextNode(`\u201c${c.quote}\u201d `),
        el("button", { class: "link-btn", text: "Show on page", onclick: () => showOnPage(c) })
      ));
    }
    if (c.verdict === "unchecked") {
      li.append(el("button", { class: "run-one", text: "Check this claim", onclick: () => checkOne(c) }));
    }
    if (c.args?.length) {
      const groups = [["IN", "Still standing"], ["UNDEC", "Unresolved"], ["OUT", "Knocked out"]];
      const d = el("details", { class: "args" }, el("summary", { text: `Evidence and arguments (${c.args.length})` }));
      for (const [status, label] of groups) {
        const list = c.args.filter((a) => a.status === status);
        if (list.length) d.append(el("div", { class: "arg-group" }, el("h3", { text: label }), ...list.map((a) => renderArg(a, c))));
      }
      li.append(d);
    }
    return li;
  }));
  renderScore();
  if (mode === "full") renderNotes();
}

function renderNotes() {
  const panel = $("panel-notes");
  if (!map) { panel.replaceChildren(); return; }
  const byPid = {};
  for (const c of claims) (byPid[c.pid] ||= []).push(c);
  panel.replaceChildren(
    map.gist ? el("p", { class: "gist", text: map.gist }) : null,
    ...map.sections.map((s) => {
      const sc = s.paragraphs.flatMap((p) => byPid[p] || []);
      return el("div", { class: "section" },
        el("h3", { text: s.title }),
        el("div", { class: "section-meta" },
          el("span", { class: `kind ${s.kind}`, text: KIND_TEXT[s.kind] }),
          sc.length ? el("span", { class: "dots", title: sc.map((c) => `${VERDICT_TEXT[c.verdict]}: ${c.text}`).join("\n") },
            ...sc.map((c) => el("span", { class: `dot ${c.verdict}` }))) : null,
          sc.length ? el("span", { text: `${sc.length} ${sc.length === 1 ? "claim" : "claims"}` }) : null,
          s.paragraphs.length ? el("button", { class: "link-btn", text: "Go to section", onclick: () => pageFocus({ pid: s.paragraphs[0] }) }) : null
        ),
        s.summary ? el("p", { text: s.summary }) : null
      );
    })
  );
}

function renderPerspectives() {
  const panel = $("panel-persp");
  if (!map) { panel.replaceChildren(); return; }
  const { present, missing } = map.perspectives;
  panel.replaceChildren(
    el("div", { class: "persp-group" },
      el("h3", { text: "Represented on this page" }),
      ...(present.length ? present.map((p) => el("div", { class: "persp" },
        el("strong", { text: p.who }),
        p.stance ? el("p", { text: p.stance }) : null,
        p.pids.length ? el("button", { class: "link-btn", text: "Show on page", onclick: () => pageFocus({ pid: p.pids[0] }) }) : null
      )) : [el("p", { class: "empty", text: "The page doesn't clearly represent any viewpoint beyond the author's." })])
    ),
    el("div", { class: "persp-group" },
      el("h3", { text: "Missing from this page" }),
      ...(missing.length ? missing.map((p) => el("div", { class: "persp missing" },
        el("strong", { text: p.who }),
        p.would_argue ? el("p", { text: p.would_argue }) : null
      )) : [el("p", { class: "empty", text: "No obvious missing viewpoints." })])
    )
  );
}

function selectTab(name) {
  for (const t of ["claims", "notes", "persp"]) {
    $(`tab-${t}`).setAttribute("aria-selected", String(t === name));
    $(`panel-${t}`).hidden = t !== name;
  }
}

function resetView(newMode) {
  mode = newMode;
  hideSourceCard();
  claims = [];
  map = null;
  current = null;
  $("savedLine").hidden = true;
  $("tabs").hidden = newMode !== "full";
  $("hlToggle").hidden = newMode !== "full";
  $("hlOn").checked = true;
  selectTab("claims");
  renderClaims();
  renderNotes();
  renderPerspectives();
}

// ---------- Pipeline ----------

async function pool(items, limit, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx]); }
  }));
}

async function runCheck(c, s) {
  if (!live(s)) return;
  delete c.resume;
  c.verdict = "pending";
  if (mode === "full") pageUpdate(c, s);
  try {
    const result = await checkClaim({ apiKey: cfg.apiKey, model: cfg.model, claim: c, page, searchesPerClaim: cfg.searchesPerClaim, signal: s.ctrl.signal });
    if (!live(s)) return;
    Object.assign(c, result);
  } catch (e) {
    if (!live(s) || isAbort(e)) return;
    c.verdict = "unverifiable";
    c.error = e instanceof ApiError ? e.message : "This claim couldn't be checked.";
  }
  if (mode === "full") pageUpdate(c, s);
  renderClaims();
  persist(s);
}

async function runChecks(list, concurrency, s) {
  let done = 0;
  await pool(list, concurrency, async (c) => {
    if (!live(s)) return;
    await runCheck(c, s);
    done++;
    if (live(s)) setStatus(done < list.length ? `Checked ${done} of ${list.length} claims\u2026` : "");
  });
}

// Returns the new run's session, or null if the run can't start.
async function begin(newMode) {
  if (running) return null;
  cfg = await loadSettings();
  if (!cfg.apiKey) { keyNotice(); return null; }
  clearNotice();
  running = true;
  $("fullRead").disabled = $("checkPage").disabled = true;
  if (mode === "full") await pageClear();
  const s = newSession();
  resetView(newMode);
  return s;
}
function finish(s) {
  if (!live(s)) return;
  running = false;
  $("fullRead").disabled = $("checkPage").disabled = false;
}
function fail(e, s) {
  if (!live(s) || isAbort(e)) return;
  const msg = e instanceof ApiError ? e.message : "Something went wrong. Try again.";
  setStatus("");
  showNotice(msg);
  persist(s, claims.length ? statusNow() : "failed", msg);
}
function setSubject(text) {
  $("subjectRow").hidden = false;
  $("subject").textContent = text;
}

async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new ApiError("Open a web page first.");
  return tab;
}
const unreadable = () => new ApiError("Chrome doesn't let extensions read this page. Open a regular web page and try again.");

async function fullRead() {
  const s = await begin("full");
  if (!s) return;
  try {
    const tab = await currentTab();
    if (!live(s)) return;
    tabId = tab.id;
    showSourceCard(tabId);
    try {
      await chrome.scripting.insertCSS({ target: { tabId }, files: ["page.css"] });
      await chrome.scripting.executeScript({ target: { tabId }, files: ["page.js"] });
    } catch { throw unreadable(); }
    if (!live(s)) return;
    page = await inPage(() => window.__verafy.collect());
    if (!live(s)) return;
    if (!page) throw unreadable();
    startRecord(pageKey(page.url), { mode: "full", url: page.url, title: page.title, paras: paraSnippets(page.paragraphs) });
    if (page.paragraphs.length < 2) throw new ApiError("This page doesn't have enough text to read.");
    setSubject(page.title);

    setStatus("Reading the whole page\u2026");
    const mapped = await mapPage({ apiKey: cfg.apiKey, model: cfg.model, page, maxClaims: 40, signal: s.ctrl.signal });
    if (!live(s)) return;
    map = mapped;
    if (!map.claims.length && !map.sections.length) throw new ApiError("Couldn't find anything to analyze on this page.");

    // Check the most central claims now; the rest wait for an on-demand check.
    const ranked = [...map.claims].sort((a, b) => b.importance - a.importance);
    const toCheck = new Set(ranked.slice(0, cfg.fullReadClaims).map((c) => c.id));
    claims = map.claims.map((c) => ({ ...c, fromPage: true, verdict: toCheck.has(c.id) ? "pending" : "unchecked" }));

    const located = (await pageHighlight(claims, s)) || {};
    if (!live(s)) return;
    applyLocated(located);
    renderClaims();
    renderPerspectives();
    persist(s);

    const queue = claims.filter((c) => c.verdict === "pending");
    setStatus(queue.length ? `Checking ${queue.length} claims against web sources\u2026` : "");
    await runChecks(queue, 3, s);
    persist(s);
  } catch (e) { fail(e, s); } finally { finish(s); }
}

async function quickScore() {
  const s = await begin("quick");
  if (!s) return;
  try {
    const tab = await currentTab();
    if (!live(s)) return;
    tabId = tab.id;
    showSourceCard(tabId);
    let res;
    try {
      [{ result: res }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const root = document.querySelector("article") || document.querySelector("main, [role=main]") || document.body;
          const text = (root.innerText || "").replace(/\n{3,}/g, "\n\n").replace(/[ \t]+/g, " ").trim();
          return { title: document.title, url: location.href, text: text.slice(0, 20000) };
        }
      });
    } catch { throw unreadable(); }
    if (!live(s)) return;
    page = res;
    if (page?.url) startRecord(pageKey(page.url), { mode: "quick", url: page.url, title: page.title });
    if (!page?.text || page.text.length < 200) throw new ApiError("This page doesn't have enough text to check.");
    setSubject(page.title);
    setStatus("Finding the main claims on this page\u2026");
    const found = await extractClaims({ apiKey: cfg.apiKey, model: cfg.model, page, maxClaims: cfg.maxClaims, signal: s.ctrl.signal });
    if (!live(s)) return;
    if (!found.length) { setStatus(""); showNotice("No checkable factual claims found on this page."); return; }
    claims = found.map((c) => ({ ...c, verdict: "pending", fromPage: true }));
    renderClaims();
    persist(s);
    setStatus(`Checking ${claims.length} claims against web sources\u2026`);
    await runChecks(claims, 2, s);
    persist(s);
  } catch (e) { fail(e, s); } finally { finish(s); }
}

async function checkStatement(p) {
  if (!p?.text?.trim()) return;
  const s = await begin("statement");
  if (!s) return;
  try {
    tabId = null;
    page = { title: p.title, url: p.url };
    // The card reads the page the selection came from, if that tab is still on it.
    if (p.tabId != null) {
      chrome.tabs.get(p.tabId).then((t) => { if (t?.url === p.url) showSourceCard(p.tabId, { statement: true }); }).catch(() => {});
    }
    setSubject(`Selected on ${p.title || hostOf(p.url)}`);
    const pk = pageKey(p.url);
    startRecord(pk && statementKey(pk, p.text), { mode: "statement", url: p.url, title: p.title, statement: p.text.trim() });
    claims = [{ id: "c1", text: p.text.trim(), quote: p.text.trim(), importance: 1, verdict: "pending", fromPage: false }];
    renderClaims();
    persist(s);
    setStatus("Checking this statement against web sources\u2026");
    await runChecks(claims, 1, s);
    persist(s);
  } catch (e) { fail(e, s); } finally { finish(s); }
}

async function checkOne(c) {
  if (running) return;
  cfg = await loadSettings();
  if (!cfg.apiKey) { keyNotice(); return; }
  running = true;
  const s = session;
  setStatus("Checking this claim\u2026");
  try { await runCheck(c, s); } finally { if (live(s)) { running = false; setStatus(""); } }
}

async function takePending() {
  const { pending } = await chrome.storage.session.get("pending");
  if (!pending) return;
  await chrome.storage.session.remove("pending");
  if (Date.now() - pending.ts < 60_000) checkStatement(pending);
}

// ---------- Page changes ----------

// The panel always follows the active tab of its own window. When that page changes,
// the in-flight run is cancelled and the panel goes back to the empty state.
function onPageChange(tab) {
  const old = shown;
  const hadHighlights = mode === "full";
  shown = { tabId: tab?.id ?? null, url: tab?.url ?? null };
  newSession();
  running = false;
  $("fullRead").disabled = $("checkPage").disabled = false;
  setStatus("");
  clearNotice();
  // A full load wipes the old DOM by itself; a single-page-app route change doesn't.
  // Clearing is a no-op on a fresh document, so do it for any page that had highlights.
  if (hadHighlights && old.tabId != null) {
    chrome.scripting.executeScript({ target: { tabId: old.tabId }, func: () => window.__verafy?.clear() }).catch(() => {});
  }
  tabId = null;
  page = null;
  $("subjectRow").hidden = true;
  resetView(null);
  restoreFor(tab, session);
}

async function activeTabOfWindow() {
  const [tab] = await chrome.tabs.query({ active: true, windowId });
  return tab || null;
}

async function followActiveTab() {
  const tab = await activeTabOfWindow();
  if (!tab) return;
  if (tab.id !== shown.tabId || !sameUrl(tab.url, shown.url)) onPageChange(tab);
}

chrome.tabs.onUpdated.addListener((id, info, tab) => {
  if (id !== shown.tabId || !info.url) return;
  if (sameUrl(info.url, shown.url)) { shown.url = info.url; return; }  // hash or tracking-param change only
  onPageChange(tab);
});
chrome.tabs.onActivated.addListener(({ windowId: w }) => { if (w === windowId) followActiveTab(); });
// Each window has its own panel. When focus comes back to this one, make sure it still
// matches its active tab; focusing another window doesn't clear this panel.
chrome.windows.onFocusChanged.addListener((w) => { if (w === windowId) followActiveTab(); });

// ---------- Restore, resume, re-check ----------

// A claim's page position as reported by page.js: the paragraph id it was marked in.
function applyLocated(located) {
  for (const c of claims) {
    const at = located[c.id];
    c.located = !!at;
    if (typeof at === "string") c.pid = at;
  }
}

async function whenLoaded(id, s) {
  for (let i = 0; i < 40; i++) {
    if (!live(s)) return false;
    const t = await chrome.tabs.get(id).catch(() => null);
    if (!t) return false;
    if (t.status === "complete") return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function restoreFor(tab, s) {
  const pk = pageKey(tab?.url);
  if (!pk || running) return;
  let key = pk;
  // Opening a statement ruling from History restores that statement, not the page.
  const { restoreHint } = await chrome.storage.session.get("restoreHint");
  if (restoreHint?.page === pk) { key = restoreHint.key; await chrome.storage.session.remove("restoreHint"); }
  const r = await loadRuling(key);
  if (!r || !live(s) || running) return;
  await showRuling(r, tab, s);
}

async function showRuling(r, tab, s) {
  resetView(r.mode);
  current = { key: r.key, startedAt: r.startedAt, mode: r.mode, url: r.url, title: r.title, paras: r.paras, statement: r.statement };
  page = { title: r.title, url: r.url };
  tabId = r.mode === "statement" ? null : tab.id;
  map = r.map || null;
  // Claims that were still being checked when the run stopped wait for Resume.
  claims = (r.claims || []).map((c) => (c.verdict === "pending" ? { ...c, verdict: "unchecked", resume: true } : { ...c }));
  setSubject(r.mode === "statement" ? `Selected on ${r.title || hostOf(r.url)}` : r.title);
  if (r.mode !== "statement") showSourceCard(tab.id);
  renderClaims();
  renderPerspectives();
  renderSaved(r);
  if (r.mode === "full" && claims.length) await restoreHighlights(tab.id, s);
}

// Re-inject page.js on the (possibly reloaded) page, match paragraphs by text, and re-mark claims.
async function restoreHighlights(id, s) {
  if (!(await whenLoaded(id, s))) return;
  try {
    await chrome.scripting.insertCSS({ target: { tabId: id }, files: ["page.css"] });
    await chrome.scripting.executeScript({ target: { tabId: id }, files: ["page.js"] });
  } catch { return; }
  if (!live(s)) return;
  const fresh = await inPage(() => window.__verafy.collect());
  if (!live(s) || !fresh || !current) return;
  const remap = remapParagraphs(current.paras, fresh.paragraphs);
  const to = (pid) => remap[pid] ?? null;
  for (const c of claims) c.pid = to(c.pid);
  if (map) {
    map.sections = map.sections.map((sec) => ({ ...sec, paragraphs: sec.paragraphs.map(to).filter(Boolean) }));
    map.perspectives.present = map.perspectives.present.map((p) => ({ ...p, pids: p.pids.map(to).filter(Boolean) }));
  }
  current.paras = paraSnippets(fresh.paragraphs);
  const located = (await pageHighlight(claims, s)) || {};
  if (!live(s)) return;
  applyLocated(located);
  for (const c of claims) c.missing = !c.located;
  renderClaims();
  renderPerspectives();
}

function renderSaved(r) {
  const line = $("savedLine");
  const btn = (text, run) => el("button", { class: "link-btn", text, onclick: run });
  const sep = () => document.createTextNode(" \u00b7 ");
  const canResume = r.status === "partial" && claims.some((c) => c.resume);
  line.replaceChildren(...[
    document.createTextNode(r.status === "failed" ? `Last check failed ${ago(r.updatedAt)}` : `Checked ${ago(r.updatedAt)}`),
    r.status === "partial" ? document.createTextNode(", stopped before finishing") : null,
    sep(), btn("Re-check", () => recheck(r)),
    canResume ? sep() : null,
    canResume ? btn("Resume", resume) : null
  ].filter(Boolean));
  line.hidden = false;
}

function recheck(r) {
  if (r.mode === "full") fullRead();
  else if (r.mode === "quick") quickScore();
  else checkStatement({ text: r.statement, url: r.url, title: r.title });
}

// Checks only the claims that were queued when the run stopped.
async function resume() {
  if (running) return;
  cfg = await loadSettings();
  if (!cfg.apiKey) { keyNotice(); return; }
  const s = session;
  const queue = claims.filter((c) => c.resume);
  if (!queue.length) return;
  running = true;
  $("fullRead").disabled = $("checkPage").disabled = true;
  $("savedLine").hidden = true;
  for (const c of queue) { delete c.resume; c.verdict = "pending"; }
  renderClaims();
  setStatus(`Checking ${queue.length} remaining ${queue.length === 1 ? "claim" : "claims"}\u2026`);
  try {
    await runChecks(queue, mode === "full" ? 3 : 2, s);
    persist(s);
  } finally { finish(s); }
}

// ---------- History ----------

const MODE_TEXT = { full: "Full read", quick: "Quick score", statement: "Statement" };

function closeHistory() { $("historyView").hidden = true; $("mainView").hidden = false; }
async function openHistory() { $("mainView").hidden = true; $("historyView").hidden = false; await renderHistory(); }

async function renderHistory() {
  const list = await listRulings();
  $("historyView").replaceChildren(
    el("div", { class: "history-head" },
      el("h2", { text: "History" }),
      el("button", { class: "link-btn", text: "Back", onclick: closeHistory })),
    el("p", { class: "hint", text: "Rulings are saved in this browser only. The 200 most recently updated pages are kept." }),
    list.length ? el("ol", { class: "history" }, ...list.map(historyRow)) : el("p", { class: "empty", text: "No saved rulings yet." })
  );
}

function historyRow(r) {
  const counts = ["supported", "contested", "refuted"].filter((v) => r.counts?.[v]).map((v) => `${r.counts[v]} ${v}`).join(" \u00b7 ");
  const status = r.status === "partial" ? "Unfinished" : r.status === "failed" ? "Failed" : "";
  const date = new Date(r.updatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const band = r.score == null ? "" : r.score >= 60 ? "high" : r.score >= 40 ? "mid" : "low";
  const title = r.title || hostOf(r.url);
  return el("li", { class: "history-row" },
    el("button", { class: "history-open", onclick: () => openRuling(r) },
      el("span", { class: `history-score ${band}`, text: r.score == null ? "\u2013" : String(r.score) }),
      el("span", { class: "history-body" },
        el("span", { class: "history-title", text: title }),
        el("span", { class: "history-meta", text: [hostOf(r.url), MODE_TEXT[r.mode], status, date].filter(Boolean).join(" \u00b7 ") }),
        counts ? el("span", { class: "history-meta", text: counts }) : null)),
    el("button", {
      class: "icon-btn history-del", title: "Delete", "aria-label": `Delete saved ruling for ${title}`, text: "\u00d7",
      onclick: async () => { await deleteRuling(r.key); renderHistory(); }
    }));
}

async function openRuling(r) {
  await chrome.storage.session.set({ restoreHint: { page: pageKey(r.url), key: r.key } });
  closeHistory();
  await chrome.tabs.create({ url: r.url, windowId: windowId ?? undefined });
}

// ---------- Wiring ----------

$("fullRead").addEventListener("click", fullRead);
$("checkPage").addEventListener("click", quickScore);
$("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
$("history").addEventListener("click", () => ($("historyView").hidden ? openHistory() : closeHistory()));
for (const t of ["claims", "notes", "persp"]) $(`tab-${t}`).addEventListener("click", () => selectTab(t));
$("hlOn").addEventListener("change", async (e) => {
  if (e.target.checked) applyLocated((await pageHighlight(claims)) || {});
  else await pageClear();
});

chrome.storage.session.onChanged.addListener((changes) => { if (changes.pending?.newValue) takePending(); });
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== "verafy:focus" || sender.tab?.id !== tabId) return;
  selectTab("claims");
  const li = $(`claim-${msg.claimId}`);
  if (!li) return;
  li.querySelector("details")?.setAttribute("open", "");
  li.scrollIntoView({ behavior: "smooth", block: "start" });
  li.classList.add("flash");
  setTimeout(() => li.classList.remove("flash"), 1600);
});

initSourceCard({ loadSettings, keyNotice });
resetView(null);
chrome.windows.getCurrent().then(async (w) => {
  windowId = w.id;
  const tab = await activeTabOfWindow();
  shown = { tabId: tab?.id ?? null, url: tab?.url ?? null };
  if (tab) restoreFor(tab, session);   // reopening the panel restores the current page's ruling
});
takePending();
loadSettings().then((s) => { if (!s.apiKey) keyNotice(); });
