const DEFAULTS = { apiKey: "", model: "claude-sonnet-5", maxClaims: 6, searchesPerClaim: 3, fullReadClaims: 12 };
const ids = Object.keys(DEFAULTS);
const clamp = (v, lo, hi, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

chrome.storage.local.get(ids).then((s) => {
  const cfg = { ...DEFAULTS, ...s };
  for (const id of ids) document.getElementById(id).value = cfg[id];
});

document.getElementById("save").addEventListener("click", async () => {
  const v = (id) => document.getElementById(id).value;
  await chrome.storage.local.set({
    apiKey: v("apiKey").trim(),
    model: v("model"),
    maxClaims: clamp(v("maxClaims"), 2, 12, DEFAULTS.maxClaims),
    searchesPerClaim: clamp(v("searchesPerClaim"), 1, 5, DEFAULTS.searchesPerClaim),
    fullReadClaims: clamp(v("fullReadClaims"), 3, 30, DEFAULTS.fullReadClaims)
  });
  const s = document.getElementById("saved");
  s.textContent = "Settings saved";
  setTimeout(() => (s.textContent = ""), 2500);
});

// Removes every cached publication and author check (keys starting with "src:").
document.getElementById("clearSource").addEventListener("click", async () => {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith("src:"));
  await chrome.storage.local.remove(keys);
  const s = document.getElementById("cleared");
  s.textContent = keys.length ? `Cleared ${keys.length} saved ${keys.length === 1 ? "check" : "checks"}` : "Nothing to clear";
  setTimeout(() => (s.textContent = ""), 2500);
});
