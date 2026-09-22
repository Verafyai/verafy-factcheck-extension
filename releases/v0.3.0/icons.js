// Inline SVG status icons (v0.3 §5). Decorative: the adjacent text carries the meaning.

const NS = "http://www.w3.org/2000/svg";

function svg(cls, paths) {
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", "0 0 16 16");
  s.setAttribute("width", "14");
  s.setAttribute("height", "14");
  s.setAttribute("aria-hidden", "true");
  s.setAttribute("focusable", "false");
  s.setAttribute("class", `icon ${cls}`);
  for (const [tag, attrs] of paths) {
    const p = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) p.setAttribute(k, v);
    s.append(p);
  }
  return s;
}

const ring = ["circle", { cx: "8", cy: "8", r: "6.75", fill: "none", stroke: "currentColor", "stroke-width": "1.5" }];
const stroke = { fill: "none", stroke: "currentColor", "stroke-width": "1.75", "stroke-linecap": "round", "stroke-linejoin": "round" };

// Check inside a circle.
export const iconCheck = (cls = "") => svg(`icon-check ${cls}`, [ring, ["path", { d: "M5 8.2l2 2 4-4.4", ...stroke }]]);
// X inside a circle.
export const iconX = (cls = "") => svg(`icon-x ${cls}`, [ring, ["path", { d: "M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4", ...stroke }]]);
// Dash inside a circle: couldn't determine.
export const iconDash = (cls = "") => svg(`icon-dash ${cls}`, [ring, ["path", { d: "M5.5 8h5", ...stroke }]]);
