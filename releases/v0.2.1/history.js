// Saved rulings: one record per page (normalized URL), kept in chrome.storage.local only.
// An index of small summaries makes History and eviction cheap; full records are read
// only when a page is restored.

const RECORD = "ruling:";          // RECORD + key -> full record
const INDEX = "rulings:index";      // { [key]: summary }
export const MAX_RULINGS = 200;

// FNV-1a, enough to tell two selected statements on one page apart.
export function textHash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export const statementKey = (pageKey, text) => `${pageKey}#stmt:${textHash(text.trim())}`;

export function verdictCounts(claims) {
  const out = {};
  for (const c of claims || []) out[c.verdict] = (out[c.verdict] || 0) + 1;
  return out;
}

// Paragraph fingerprints, so a restored page can be matched even if paragraph ids shift.
const snip = (t) => t.replace(/\s+/g, " ").trim().slice(0, 100);
export const paraSnippets = (paragraphs) => Object.fromEntries(paragraphs.map((p) => [p.id, snip(p.text)]));

// Old paragraph id -> new id, matched by text. Unmatched ids are left out.
export function remapParagraphs(saved, fresh) {
  const out = {}, used = new Set();
  for (const [pid, s] of Object.entries(saved || {})) {
    if (!s) continue;
    const hit = fresh.find((p) => !used.has(p.id) && snip(p.text).startsWith(s));
    if (hit) { out[pid] = hit.id; used.add(hit.id); }
  }
  return out;
}

// Keep the MAX newest entries; returns the keys to evict.
export function evictions(index, max = MAX_RULINGS) {
  const keys = Object.keys(index);
  if (keys.length <= max) return [];
  return keys.sort((a, b) => index[a].updatedAt - index[b].updatedAt).slice(0, keys.length - max);
}

// Saves run one at a time so concurrent claim verdicts can't clobber the index.
let chain = Promise.resolve();

export function saveRuling(record) {
  chain = chain.then(async () => {
    const { [INDEX]: index = {} } = await chrome.storage.local.get(INDEX);
    index[record.key] = {
      url: record.url, title: record.title, mode: record.mode, status: record.status,
      score: record.score, counts: verdictCounts(record.claims), updatedAt: record.updatedAt
    };
    const evict = evictions(index);
    for (const k of evict) delete index[k];
    await chrome.storage.local.set({ [RECORD + record.key]: record, [INDEX]: index });
    if (evict.length) await chrome.storage.local.remove(evict.map((k) => RECORD + k));
  }).catch(() => { /* a failed save must never break a run */ });
  return chain;
}

export async function loadRuling(key) {
  await chain;
  const { [RECORD + key]: r } = await chrome.storage.local.get(RECORD + key);
  return r || null;
}

// Newest first: [{ key, url, title, mode, status, score, counts, updatedAt }]
export async function listRulings() {
  await chain;
  const { [INDEX]: index = {} } = await chrome.storage.local.get(INDEX);
  return Object.entries(index).map(([key, v]) => ({ key, ...v })).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function deleteRuling(key) {
  chain = chain.then(async () => {
    const { [INDEX]: index = {} } = await chrome.storage.local.get(INDEX);
    delete index[key];
    await chrome.storage.local.set({ [INDEX]: index });
    await chrome.storage.local.remove(RECORD + key);
  }).catch(() => {});
  return chain;
}
