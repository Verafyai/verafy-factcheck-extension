import { extractClaims, mapPage, checkClaim, ApiError } from "./api.js";
import { truthScore, scoreLabel } from "./grounded.js";
import { el, safeHref, hostOf } from "./dom.js";
import { initSourceCard, showSourceCard, hideSourceCard } from "./source.js";

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

// ---------- Page bridge (full mode) ----------

async function inPage(fn, ...args) {
  if (tabId == null) return null;
  try {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, args, func: fn });
    return result;
  } catch { return null; }
}
const pageHighlight = (list) => inPage((l) => window.__verafy?.highlight(l), list);
const pageUpdate = (c) => inPage((id, v, s) => window.__verafy?.update(id, v, s), c.id, c.verdict, c.summary || "");
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
      c.error ? el("p", { class: "summary", text: c.error }) : null
    );
    if (c.quote && c.fromPage) {
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

async function runCheck(c) {
  c.verdict = "pending";
  if (mode === "full") pageUpdate(c);
  try {
    Object.assign(c, await checkClaim({ apiKey: cfg.apiKey, model: cfg.model, claim: c, page, searchesPerClaim: cfg.searchesPerClaim }));
  } catch (e) {
    c.verdict = "unverifiable";
    c.error = e instanceof ApiError ? e.message : "This claim couldn't be checked.";
  }
  if (mode === "full") pageUpdate(c);
  renderClaims();
}

async function runChecks(list, concurrency) {
  let done = 0;
  await pool(list, concurrency, async (c) => {
    await runCheck(c);
    done++;
    setStatus(done < list.length ? `Checked ${done} of ${list.length} claims\u2026` : "");
  });
}

async function begin(newMode) {
  if (running) return false;
  cfg = await loadSettings();
  if (!cfg.apiKey) { keyNotice(); return false; }
  clearNotice();
  running = true;
  $("fullRead").disabled = $("checkPage").disabled = true;
  if (mode === "full") await pageClear();
  resetView(newMode);
  return true;
}
function finish() {
  running = false;
  $("fullRead").disabled = $("checkPage").disabled = false;
}
function fail(e) {
  setStatus("");
  showNotice(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
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
  if (!(await begin("full"))) return;
  try {
    const tab = await currentTab();
    tabId = tab.id;
    showSourceCard(tabId);
    try {
      await chrome.scripting.insertCSS({ target: { tabId }, files: ["page.css"] });
      await chrome.scripting.executeScript({ target: { tabId }, files: ["page.js"] });
    } catch { throw unreadable(); }
    page = await inPage(() => window.__verafy.collect());
    if (!page) throw unreadable();
    if (page.paragraphs.length < 2) throw new ApiError("This page doesn't have enough text to read.");
    setSubject(page.title);

    setStatus("Reading the whole page\u2026");
    map = await mapPage({ apiKey: cfg.apiKey, model: cfg.model, page, maxClaims: 40 });
    if (!map.claims.length && !map.sections.length) throw new ApiError("Couldn't find anything to analyze on this page.");

    // Check the most central claims now; the rest wait for an on-demand check.
    const ranked = [...map.claims].sort((a, b) => b.importance - a.importance);
    const toCheck = new Set(ranked.slice(0, cfg.fullReadClaims).map((c) => c.id));
    claims = map.claims.map((c) => ({ ...c, fromPage: true, verdict: toCheck.has(c.id) ? "pending" : "unchecked" }));

    const located = (await pageHighlight(claims)) || {};
    for (const c of claims) c.located = !!located[c.id];
    renderClaims();
    renderPerspectives();

    const queue = claims.filter((c) => c.verdict === "pending");
    setStatus(queue.length ? `Checking ${queue.length} claims against web sources\u2026` : "");
    await runChecks(queue, 3);
  } catch (e) { fail(e); } finally { finish(); }
}

async function quickScore() {
  if (!(await begin("quick"))) return;
  try {
    const tab = await currentTab();
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
    page = res;
    if (!page?.text || page.text.length < 200) throw new ApiError("This page doesn't have enough text to check.");
    setSubject(page.title);
    setStatus("Finding the main claims on this page\u2026");
    const found = await extractClaims({ apiKey: cfg.apiKey, model: cfg.model, page, maxClaims: cfg.maxClaims });
    if (!found.length) { setStatus(""); showNotice("No checkable factual claims found on this page."); return; }
    claims = found.map((c) => ({ ...c, verdict: "pending", fromPage: true }));
    renderClaims();
    setStatus(`Checking ${claims.length} claims against web sources\u2026`);
    await runChecks(claims, 2);
  } catch (e) { fail(e); } finally { finish(); }
}

async function checkStatement(p) {
  if (!p?.text?.trim() || !(await begin("statement"))) return;
  try {
    tabId = null;
    page = { title: p.title, url: p.url };
    // The card reads the page the selection came from, if that tab is still on it.
    if (p.tabId != null) {
      chrome.tabs.get(p.tabId).then((t) => { if (t?.url === p.url) showSourceCard(p.tabId, { statement: true }); }).catch(() => {});
    }
    setSubject(`Selected on ${p.title || hostOf(p.url)}`);
    claims = [{ id: "c1", text: p.text.trim(), quote: p.text.trim(), importance: 1, verdict: "pending", fromPage: false }];
    renderClaims();
    setStatus("Checking this statement against web sources\u2026");
    await runChecks(claims, 1);
  } catch (e) { fail(e); } finally { finish(); }
}

async function checkOne(c) {
  if (running) return;
  cfg = await loadSettings();
  if (!cfg.apiKey) { keyNotice(); return; }
  running = true;
  setStatus("Checking this claim\u2026");
  try { await runCheck(c); } finally { running = false; setStatus(""); }
}

async function takePending() {
  const { pending } = await chrome.storage.session.get("pending");
  if (!pending) return;
  await chrome.storage.session.remove("pending");
  if (Date.now() - pending.ts < 60_000) checkStatement(pending);
}

// ---------- Wiring ----------

$("fullRead").addEventListener("click", fullRead);
$("checkPage").addEventListener("click", quickScore);
$("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
for (const t of ["claims", "notes", "persp"]) $(`tab-${t}`).addEventListener("click", () => selectTab(t));
$("hlOn").addEventListener("change", async (e) => {
  if (e.target.checked) {
    const located = (await pageHighlight(claims)) || {};
    for (const c of claims) c.located = !!located[c.id];
  } else await pageClear();
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
takePending();
loadSettings().then((s) => { if (!s.apiKey) keyNotice(); });
