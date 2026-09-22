// Reads the byline and publication name from the page's own markup. Runs in the page via
// chrome.scripting.executeScript({ func: readSourceMeta }), so it must stay self-contained.
// It only reads the DOM: no network, no model call.

export function readSourceMeta() {
  const clean = (s) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "");
  const host = location.hostname.replace(/^www\./, "");

  // ---- JSON-LD ----
  const ld = [];
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    ld.push(node);
    if (node["@graph"]) walk(node["@graph"]);
  };
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try { walk(JSON.parse(s.textContent)); } catch { /* malformed JSON-LD: ignore */ }
  }
  const types = (n) => [].concat(n["@type"] || []).map(String);
  const isWork = (n) => types(n).some((t) => /Article|Posting|Report|CreativeWork|WebPage/i.test(t));
  const works = ld.filter(isWork);

  // ---- Publication ----
  let publication = "", publicationFrom = "domain";
  const og = clean(document.querySelector('meta[property="og:site_name"]')?.content);
  if (og) { publication = og; publicationFrom = "og:site_name"; }
  if (!publication) {
    for (const w of works) {
      const p = [].concat(w.publisher || [])[0];
      const name = clean(typeof p === "string" ? p : p?.name);
      if (name) { publication = name; publicationFrom = "schema.org publisher"; break; }
    }
  }
  if (!publication) publication = host;

  // ---- Author ----
  // Commenters, social embeds, and usernames never count as a byline.
  const inComments = (el) => !!el.closest('[id*="comment" i], [class*="comment" i], [class*="reply" i], .twitter-tweet, [class*="social" i]');
  const bad = /^(staff|editors?|editorial board|the editors|admin|news desk|newsroom|contributor|guest|anonymous|associated press|reuters|ap|afp)$/i;
  const valid = (raw) => {
    let n = clean(raw).replace(/^by\s+/i, "").replace(/[,|·•].*$/, "").trim();
    if (!n || n.length < 4 || n.length > 60) return null;
    if (/[@#\d/\\:]|https?|\.(com|org|net)\b/i.test(n)) return null;
    if (bad.test(n) || n.toLowerCase() === publication.toLowerCase() || n.toLowerCase() === host) return null;
    const words = n.split(" ");
    if (words.length < 2 || words.length > 5) return null;
    // Each word looks like part of a personal name: "Jane", "O'Neil", "de", "J."
    if (!words.every((w) => /^[\p{Lu}][\p{L}'’.-]*$/u.test(w) || /^(de|da|del|della|di|du|la|le|van|von|der|den|bin|al|y)$/i.test(w))) return null;
    return n;
  };

  const found = [];   // { name, from }
  const add = (raw, from) => { const n = valid(raw); if (n && !found.some((f) => f.name.toLowerCase() === n.toLowerCase())) found.push({ name: n, from }); };

  for (const w of works) {
    for (const a of [].concat(w.author || [])) {
      if (typeof a === "string") add(a, "schema.org author");
      else if (a && !types(a).some((t) => /Organization/i.test(t))) add(a.name, "schema.org author");
    }
  }
  for (const m of document.querySelectorAll('meta[name="author"]')) add(m.content, "meta author");
  for (const a of document.querySelectorAll('a[rel~="author"], [itemprop="author"]')) {
    if (inComments(a)) continue;
    add(a.querySelector('[itemprop="name"]')?.textContent || a.textContent, a.matches("a") ? "rel=author" : "itemprop=author");
  }

  // Byline markup is the weakest signal: only trust it alone if it reads "By Name".
  if (!found.length) {
    const bylines = [...document.querySelectorAll('[class*="byline" i], [class*="author-name" i], [data-testid*="byline" i]')].filter((b) => !inComments(b));
    for (const b of bylines.slice(0, 5)) {
      const t = clean(b.textContent);
      const m = t.match(/^by\s+(.+?)(?:\s+(?:and|&)\s+(.+))?$/i);
      if (m) { add(m[1], "byline"); if (m[2]) add(m[2], "byline"); }
    }
  }

  return {
    url: location.href,
    domain: host,
    publication,
    publicationFrom,
    authors: found.slice(0, 3)
  };
}
