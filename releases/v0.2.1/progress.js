// Scan progress for Full read: the stage line and bar in the panel, mirrored by a thin
// bar across the top of the page.

const SLOW_MS = 30000;
const TEXT = {
  read: "Reading the page…",
  map: "Finding claims and building cliff notes…",
  done: "Done"
};

// Runs in the page (extension's isolated world) via executeScript, so it's self-contained.
// state: { mode: "indeterminate" | "determinate" | "remove", value?: 0..1 }
export function pageBar(state) {
  let bar = window.__verafyBar;
  if (state.mode === "remove") {
    bar?.host.remove();
    window.__verafyBar = null;
    return;
  }
  if (!bar || !bar.host.isConnected) {
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;top:0;left:0;right:0;height:3px;z-index:2147483647;pointer-events:none;";
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `<style>
      .t{position:absolute;inset:0;background:rgba(47,70,196,.15);overflow:hidden}
      .f{position:absolute;top:0;bottom:0;left:0;width:0;background:#2f46c4;transition:width .3s ease}
      .i .f{width:30%}
      @media (prefers-reduced-motion: no-preference){.i .f{animation:v 1.4s ease-in-out infinite}
        @keyframes v{0%{left:-30%}100%{left:100%}}}
      @media (prefers-reduced-motion: reduce){.f{transition:none}}
    </style><div class="t"><div class="f"></div></div>`;
    document.documentElement.append(host);
    bar = window.__verafyBar = { host, track: root.querySelector(".t"), fill: root.querySelector(".f") };
  }
  const ind = state.mode === "indeterminate";
  bar.track.classList.toggle("i", ind);
  bar.fill.style.width = ind ? "" : `${Math.round(100 * Math.max(0, Math.min(1, state.value || 0)))}%`;
}

// The panel's stage indicator. `onBar(state)` mirrors progress to the page.
export function createStage({ box, text, bar, fill, slow, onBar }) {
  let kind = null, slowTimer = 0, fadeTimer = 0;

  function show(next, detail = {}) {
    clearTimeout(fadeTimer);
    if (next !== kind) {
      clearTimeout(slowTimer);
      slow.hidden = true;
      if (next === "read" || next === "map" || next === "check") slowTimer = setTimeout(() => { slow.hidden = false; }, SLOW_MS);
    }
    kind = next;
    box.hidden = false;
    box.dataset.kind = next;

    if (next === "check") {
      const { done = 0, total = 0 } = detail;
      text.textContent = `Checking claims: ${done} of ${total}`;
      setBar("determinate", total ? done / total : 0, { now: done, max: total });
      onBar({ mode: "determinate", value: total ? done / total : 0 });
    } else if (next === "read" || next === "map") {
      text.textContent = TEXT[next];
      setBar("indeterminate");
      onBar({ mode: "indeterminate" });
    } else if (next === "done") {
      text.textContent = TEXT.done;
      setBar("determinate", 1, { now: 1, max: 1 });
      onBar({ mode: "remove" });
      fadeTimer = setTimeout(() => { box.classList.add("fading"); fadeTimer = setTimeout(hide, 400); }, 2000);
    } else {
      // "error" or "cancelled": the message replaces the bar.
      text.textContent = detail.message || "";
      bar.hidden = true;
      onBar({ mode: "remove" });
    }
  }

  function setBar(mode, value = 0, { now, max } = {}) {
    bar.hidden = false;
    bar.classList.toggle("indeterminate", mode === "indeterminate");
    fill.style.width = mode === "indeterminate" ? "" : `${Math.round(100 * value)}%`;
    if (mode === "indeterminate") { bar.removeAttribute("aria-valuenow"); bar.removeAttribute("aria-valuemax"); }
    else { bar.setAttribute("aria-valuemin", "0"); bar.setAttribute("aria-valuemax", String(max)); bar.setAttribute("aria-valuenow", String(now)); }
  }

  function hide() {
    clearTimeout(slowTimer);
    clearTimeout(fadeTimer);
    kind = null;
    box.hidden = true;
    box.classList.remove("fading");
    slow.hidden = true;
    text.textContent = "";
  }

  return { show, hide, get kind() { return kind; } };
}
