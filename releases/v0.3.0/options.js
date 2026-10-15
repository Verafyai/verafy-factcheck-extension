const DEFAULTS = { apiKey: "", typesafeApiKey: "", model: "claude-sonnet-5", extractModel: "claude-haiku-4-5-20251001", maxClaims: 4, searchesPerClaim: 2, fullReadClaims: 8 };
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
    typesafeApiKey: v("typesafeApiKey").trim(),
    model: v("model"),
    extractModel: v("extractModel") || "claude-haiku-4-5-20251001",
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
  const keys = Object.keys(all).filter((k) => k.startsWith("src:") || k.startsWith("claimCache:"));
  await chrome.storage.local.remove(keys);
  const s = document.getElementById("cleared");
  s.textContent = keys.length ? `Cleared ${keys.length} saved ${keys.length === 1 ? "check" : "checks"}` : "Nothing to clear";
  setTimeout(() => (s.textContent = ""), 2500);
});

// Removes every saved ruling and the History index (see history.js).
document.getElementById("clearHistory").addEventListener("click", async () => {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith("ruling:") || k === "rulings:index");
  await chrome.storage.local.remove(keys);
  const n = keys.filter((k) => k.startsWith("ruling:")).length;
  const s = document.getElementById("historyCleared");
  s.textContent = n ? `Cleared ${n} saved ${n === 1 ? "ruling" : "rulings"}` : "Nothing to clear";
  setTimeout(() => (s.textContent = ""), 2500);
});
