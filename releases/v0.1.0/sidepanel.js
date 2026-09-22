import { extractClaims, checkClaim, ApiError } from "./api.js";
import { truthScore, scoreLabel } from "./grounded.js";

const $ = (id) => document.getElementById(id);
const DEFAULTS = { apiKey: "", model: "claude-sonnet-5", maxClaims: 6, searchesPerClaim: 3 };
const VERDICT_TEXT = {
  supported: "Supported", contested: "Contested", refuted: "Refuted",
  unverifiable: "Can't verify", pending: "Checking", error: "Check failed"
};

let running = false;
let claims = [];

function el(tag, props = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of children) if (c) n.append(c);
  return n;
}

const safeHref = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

async function settings() {
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

function renderScore() {
  const { score, basis, total } = truthScore(claims);
  const s = $("score");
  $("scoreNum").textContent = score === null ? "\u2013" : String(score);
  $("scoreLabel").textContent = claims.length ? scoreLabel(score) : "Truth score";
  s.dataset.band = score === null ? "" : score >= 60 ? "high" : score >= 40 ? "mid" : "low";

  const strip = $("strip");
  strip.replaceChildren(...claims.map((c) => {
    const seg = el("span", { class: `seg ${c.verdict}`, title: `${VERDICT_TEXT[c.verdict]}: ${c.text}` });
    seg.style.flexGrow = String(c.importance || 1);
    return seg;
  }));

  const pending = claims.filter((c) => c.verdict === "pending").length;
  if (!claims.length) {
    $("scoreBasis").textContent = "Check a page to see how its claims hold up against independent sources.";
  } else if (pending) {
    $("scoreBasis").textContent = `${total - pending} of ${total} claims checked so far.`;
  } else {
    const skipped = total - basis;
    $("scoreBasis").textContent =
      `Based on ${basis} of ${total} claims, weighted by how central each is.` +
      (skipped ? ` ${skipped} couldn't be verified and ${skipped === 1 ? "doesn't" : "don't"} count.` : "");
  }
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
      ? el("div", { class: "by", text: `Defeated: ${attackers.map((t) => t.reason || t.kind).join("; ")}` })
      : null
  );
}

function renderClaims() {
  $("claims").replaceChildren(...claims.map((c) => {
    const li = el("li", { class: "claim" },
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
        el("button", { class: "link-btn", text: "Show on page", onclick: () => showOnPage(c.quote) })
      ));
    }
    if (c.args?.length) {
      const standing = c.args.filter((a) => a.status === "IN");
      const undecided = c.args.filter((a) => a.status === "UNDEC");
      const out = c.args.filter((a) => a.status === "OUT");
      const d = el("details", { class: "args" }, el("summary", { text: `Evidence and arguments (${c.args.length})` }));
      if (standing.length) d.append(el("div", { class: "arg-group" }, el("h3", { text: "Still standing" }), ...standing.map((a) => renderArg(a, c))));
      if (undecided.length) d.append(el("div", { class: "arg-group" }, el("h3", { text: "Unresolved" }), ...undecided.map((a) => renderArg(a, c))));
      if (out.length) d.append(el("div", { class: "arg-group" }, el("h3", { text: "Knocked out" }), ...out.map((a) => renderArg(a, c))));
      li.append(d);
    }
    return li;
  }));
  renderScore();
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function readPage(tab) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const root = document.querySelector("article") || document.querySelector("main, [role=main]") || document.body;
      const text = (root.innerText || "").replace(/\n{3,}/g, "\n\n").replace(/[ \t]+/g, " ").trim();
      return { title: document.title, url: location.href, text: text.slice(0, 20000) };
    }
  });
  return result;
}

async function showOnPage(quote) {
  const tab = await activeTab();
  if (!tab) return;
  const needle = quote.slice(0, 80);
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    args: [needle],
    func: (q) => { window.getSelection()?.removeAllRanges(); window.find(q, false, false, true); }
  }).catch(() => {});
}

async function pool(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx]); }
  });
  await Promise.all(workers);
}

async function runChecks(page, cfg) {
  let done = 0;
  await pool(claims, 2, async (c) => {
    try {
      Object.assign(c, await checkClaim({ apiKey: cfg.apiKey, model: cfg.model, claim: c, page, searchesPerClaim: cfg.searchesPerClaim }));
    } catch (e) {
      c.verdict = "error";
      c.error = e instanceof ApiError ? e.message : "This claim couldn't be checked.";
    }
    done++;
    setStatus(done < claims.length ? `Checked ${done} of ${claims.length} claims\u2026` : "");
    renderClaims();
  });
  // Failed checks don't count toward the score.
  for (const c of claims) if (c.verdict === "error") c.verdict = "unverifiable";
  renderClaims();
}

async function begin() {
  const cfg = await settings();
  if (!cfg.apiKey) {
    showNotice("Add your Claude API key to start checking.", { label: "Open settings", run: () => chrome.runtime.openOptionsPage() });
    return null;
  }
  clearNotice();
  running = true;
  $("checkPage").disabled = true;
  claims = [];
  renderClaims();
  return cfg;
}

function finish() {
  running = false;
  $("checkPage").disabled = false;
}

async function checkPage() {
  if (running) return;
  const cfg = await begin();
  if (!cfg) return;
  try {
    const tab = await activeTab();
    let page;
    try { page = await readPage(tab); }
    catch { throw new ApiError("Chrome doesn't let extensions read this page. Open a regular web page and try again."); }
    if (!page?.text || page.text.length < 200) throw new ApiError("This page doesn't have enough text to check.");

    $("subject").hidden = false;
    $("subject").textContent = page.title;
    setStatus("Finding the claims on this page\u2026");
    const found = await extractClaims({ apiKey: cfg.apiKey, model: cfg.model, page, maxClaims: cfg.maxClaims });
    if (!found.length) { setStatus(""); showNotice("No checkable factual claims found on this page."); return; }
    claims = found.map((c) => ({ ...c, verdict: "pending", fromPage: true }));
    renderClaims();
    setStatus(`Checking ${claims.length} claims against web sources\u2026`);
    await runChecks(page, cfg);
  } catch (e) {
    setStatus("");
    showNotice(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
  } finally { finish(); }
}

async function checkStatement(p) {
  if (running || !p?.text?.trim()) return;
  const cfg = await begin();
  if (!cfg) return;
  try {
    $("subject").hidden = false;
    $("subject").textContent = `Selected on ${p.title || hostOf(p.url)}`;
    claims = [{ id: "c1", text: p.text.trim(), quote: p.text.trim(), importance: 1, verdict: "pending", fromPage: false }];
    renderClaims();
    setStatus("Checking this statement against web sources\u2026");
    await runChecks({ title: p.title, url: p.url }, cfg);
  } finally { finish(); }
}

async function takePending() {
  const { pending } = await chrome.storage.session.get("pending");
  if (!pending) return;
  await chrome.storage.session.remove("pending");
  if (Date.now() - pending.ts < 60_000) checkStatement(pending);
}

$("checkPage").addEventListener("click", checkPage);
$("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
chrome.storage.session.onChanged.addListener((changes) => { if (changes.pending?.newValue) takePending(); });

renderClaims();
takePending();
settings().then((cfg) => {
  if (!cfg.apiKey) showNotice("Add your Claude API key to start checking.", { label: "Open settings", run: () => chrome.runtime.openOptionsPage() });
});
