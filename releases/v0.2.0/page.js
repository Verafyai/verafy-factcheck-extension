// Injected into the page for Full read mode. Runs in the extension's isolated world.
(() => {
  if (window.__verafy) return;

  const LABEL = {
    pending: "Checking\u2026", supported: "Supported", contested: "Contested", refuted: "Refuted",
    unverifiable: "Can't verify", unchecked: "Not checked yet", error: "Check failed"
  };
  const SKIP = "nav, footer, aside, form, [role=navigation], [role=complementary], [aria-hidden=true]";
  const info = {};
  let pop = null;

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  };

  function collect() {
    clear();
    const root = document.querySelector("article") || document.querySelector("main, [role=main]") || document.body;
    const out = [];
    let total = 0, n = 0;
    for (const el of root.querySelectorAll("h1, h2, h3, h4, p, li, blockquote, figcaption, dd")) {
      if (el.closest(SKIP)) continue;
      if (el.matches("li, blockquote") && el.querySelector("p")) continue;
      if (el.parentElement && el.parentElement.closest("p, li, dd")) continue;
      const text = (el.innerText || "").replace(/\s+/g, " ").trim();
      const heading = /^H\d$/.test(el.tagName);
      if (heading ? text.length < 3 : text.length < 40) continue;
      if (!visible(el)) continue;
      const id = `p${++n}`;
      el.setAttribute("data-verafy-pid", id);
      out.push({ id, tag: el.tagName.toLowerCase(), text: text.slice(0, 1500) });
      total += text.length;
      if (total > 30000) break;
    }
    return { title: document.title, url: location.href, paragraphs: out };
  }

  const fold = (c) => c.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').toLowerCase();

  // Find a quote inside an element across text nodes and wrap each piece in <verafy-mark>.
  function wrapQuote(el, quote, claimId) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const map = [];
    let full = "", prevSpace = true;
    for (let t; (t = walker.nextNode());) {
      const s = t.nodeValue;
      for (let i = 0; i < s.length; i++) {
        let c = s[i];
        if (/\s/.test(c)) { if (prevSpace) continue; c = " "; prevSpace = true; } else prevSpace = false;
        full += fold(c);
        map.push([t, i]);
      }
    }
    const q = fold(quote.replace(/\s+/g, " ").trim());
    let idx = full.indexOf(q), len = q.length;
    if (idx < 0 && q.length > 50) { len = 50; idx = full.indexOf(q.slice(0, 50)); }
    if (idx < 0 || !len) return false;

    const [sn, so] = map[idx];
    const [en, eo] = map[idx + len - 1];
    const range = document.createRange();
    range.setStart(sn, so);
    range.setEnd(en, eo + 1);
    const segs = [];
    const w2 = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t; (t = w2.nextNode());) if (range.intersectsNode(t)) segs.push(t);

    for (const t of segs) {
      const start = t === sn ? so : 0;
      const end = t === en ? eo + 1 : t.nodeValue.length;
      if (end <= start || !t.nodeValue.slice(start, end).trim()) continue;
      const r = document.createRange();
      r.setStart(t, start);
      r.setEnd(t, end);
      const mark = document.createElement("verafy-mark");
      mark.dataset.claim = claimId;
      mark.dataset.v = info[claimId]?.verdict || "pending";
      try { r.surroundContents(mark); } catch { /* crosses an element boundary; skip this piece */ }
    }
    return true;
  }

  function highlight(claims) {
    const located = {};
    for (const c of claims) {
      info[c.id] = { verdict: c.verdict, text: c.text, summary: c.summary || "" };
      const el = document.querySelector(`[data-verafy-pid="${CSS.escape(c.pid)}"]`);
      if (!el) { located[c.id] = false; continue; }
      let ok = c.quote ? wrapQuote(el, c.quote, c.id) : false;
      if (!ok) {
        // Couldn't match the exact words: mark the paragraph instead.
        el.classList.add("verafy-para");
        el.dataset.claim = c.id;
        el.dataset.v = c.verdict;
        ok = true;
      }
      located[c.id] = ok;
    }
    return located;
  }

  function update(id, verdict, summary) {
    info[id] = { ...(info[id] || {}), verdict, summary: summary || "" };
    document.querySelectorAll(`verafy-mark[data-claim="${CSS.escape(id)}"], .verafy-para[data-claim="${CSS.escape(id)}"]`)
      .forEach((m) => (m.dataset.v = verdict));
  }

  function clear() {
    hidePop();
    document.querySelectorAll("verafy-mark").forEach((m) => m.replaceWith(...m.childNodes));
    document.querySelectorAll(".verafy-para").forEach((p) => { p.classList.remove("verafy-para"); delete p.dataset.claim; delete p.dataset.v; });
    document.body.normalize();
  }

  function focus({ claimId, pid }) {
    const target = claimId
      ? document.querySelector(`verafy-mark[data-claim="${CSS.escape(claimId)}"], .verafy-para[data-claim="${CSS.escape(claimId)}"]`)
      : document.querySelector(`[data-verafy-pid="${CSS.escape(pid)}"]`);
    if (!target) return false;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.remove("verafy-flash");
    void target.offsetWidth;
    target.classList.add("verafy-flash");
    return true;
  }

  function hidePop() { if (pop) { pop.remove(); pop = null; } }

  function showPop(mark) {
    hidePop();
    const id = mark.dataset.claim;
    const d = info[id] || {};
    const host = document.createElement("div");
    host.style.cssText = "position:absolute;z-index:2147483647;";
    const root = host.attachShadow({ mode: "closed" });
    const v = mark.dataset.v;
    root.innerHTML = `
      <style>
        .p{font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:#18202b;background:#fff;border:1px solid #d9dee5;
           border-radius:8px;box-shadow:0 6px 24px rgba(20,30,50,.18);padding:12px 14px;width:300px}
        .v{font-weight:600;font-size:12px}
        .supported{color:#1e7a55}.contested{color:#b26b00}.refuted{color:#b3261e}.unverifiable,.unchecked,.pending,.error{color:#6b7480}
        .t{margin:6px 0 0;font-family:Charter,"Iowan Old Style",Georgia,serif;font-size:15px}
        .s{margin:6px 0 0;color:#5b6573}
        button{margin-top:10px;font:inherit;font-size:13px;border:0;background:#2f46c4;color:#fff;border-radius:6px;padding:6px 10px;cursor:pointer}
        @media (prefers-color-scheme: dark){.p{background:#1a2029;color:#e7ebf0;border-color:#2b3440}.s{color:#9aa4b2}
          .supported{color:#4cc08a}.contested{color:#e4a94a}.refuted{color:#f07167}button{background:#8fa2ff;color:#0d1330}}
      </style>
      <div class="p" role="dialog" aria-label="Verafy check">
        <div class="v"></div><p class="t"></p><p class="s"></p><button type="button">See evidence in Verafy</button>
      </div>`;
    const vEl = root.querySelector(".v");
    vEl.textContent = LABEL[v] || v;
    vEl.classList.add(v);
    root.querySelector(".t").textContent = d.text || "";
    const s = root.querySelector(".s");
    s.textContent = d.summary || "";
    if (!d.summary) s.remove();
    root.querySelector("button").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "verafy:focus", claimId: id }).catch(() => {});
      hidePop();
    });
    const r = mark.getBoundingClientRect();
    host.style.top = `${window.scrollY + r.bottom + 6}px`;
    host.style.left = `${Math.max(8, Math.min(window.scrollX + r.left, window.scrollX + document.documentElement.clientWidth - 320))}px`;
    document.body.append(host);
    pop = host;
  }

  document.addEventListener("click", (e) => {
    const mark = e.target.closest?.("verafy-mark, .verafy-para[data-claim]");
    if (mark) { e.preventDefault(); e.stopPropagation(); showPop(mark); return; }
    if (pop && !e.composedPath().includes(pop)) hidePop();
  }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hidePop(); });

  window.__verafy = { collect, highlight, update, clear, focus };
})();
