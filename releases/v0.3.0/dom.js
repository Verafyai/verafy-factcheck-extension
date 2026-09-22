// Small DOM helpers shared by the side panel modules.

export function el(tag, props = {}, ...children) {
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

export const safeHref = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };
export const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

// An external link, or plain text if the URL isn't http(s).
export function link(url, text, cls = "src") {
  const href = safeHref(url);
  return href ? el("a", { class: cls, href, target: "_blank", rel: "noopener noreferrer", text: text || hostOf(href) }) : el("span", { text: text || "" });
}
