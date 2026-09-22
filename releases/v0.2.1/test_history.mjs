import assert from "node:assert/strict";

// In-memory chrome.storage.local
const mem = {};
globalThis.chrome = { storage: { local: {
  get: async (k) => (k === null ? { ...mem } : Object.fromEntries([].concat(k).filter((x) => x in mem).map((x) => [x, structuredClone(mem[x])]))),
  set: async (o) => { for (const [k, v] of Object.entries(o)) mem[k] = structuredClone(v); },
  remove: async (k) => { for (const x of [].concat(k)) delete mem[x]; }
} } };

const H = await import("./history.js");

// Keys
assert.equal(H.statementKey("https://a.com/x", " Hello "), H.statementKey("https://a.com/x", "Hello"));
assert.notEqual(H.statementKey("https://a.com/x", "Hello"), H.statementKey("https://a.com/x", "Hello!"));

// Paragraph remap survives shifted ids; unmatched paragraphs drop out.
const saved = H.paraSnippets([{ id: "p1", text: "Intro text here" }, { id: "p2", text: "The  main claim paragraph" }, { id: "p3", text: "Removed later" }]);
const fresh = [{ id: "p1", text: "New banner" }, { id: "p2", text: "Intro text here" }, { id: "p3", text: "The main claim paragraph, now longer" }];
assert.deepEqual(H.remapParagraphs(saved, fresh), { p1: "p2", p2: "p3" });

// Concurrent saves (one per verdict) all land, and the index summarizes the latest.
const rec = (key, t, extra = {}) => ({ key, url: `https://s.com/${key}`, title: key, mode: "full", status: "partial", score: 50, claims: [{ verdict: "supported" }], updatedAt: t, ...extra });
await Promise.all([1, 2, 3].map((i) => H.saveRuling(rec("a", i, { claims: Array(i).fill({ verdict: "refuted" }) }))));
let list = await H.listRulings();
assert.equal(list.length, 1);
assert.deepEqual(list[0].counts, { refuted: 3 });
assert.equal((await H.loadRuling("a")).claims.length, 3);

// Newest first; delete removes record and index entry.
await H.saveRuling(rec("b", 10, { status: "complete" }));
list = await H.listRulings();
assert.deepEqual(list.map((r) => r.key), ["b", "a"]);
await H.deleteRuling("a");
assert.equal(await H.loadRuling("a"), null);
assert.deepEqual((await H.listRulings()).map((r) => r.key), ["b"]);

// Eviction keeps the MAX most recently updated.
for (let i = 0; i < H.MAX_RULINGS + 5; i++) await H.saveRuling(rec(`k${i}`, 100 + i));
list = await H.listRulings();
assert.equal(list.length, H.MAX_RULINGS);
assert.equal(await H.loadRuling("b"), null);            // oldest (t=10) evicted
assert.equal(await H.loadRuling("k4"), null);
assert.ok(await H.loadRuling("k5"));
assert.equal(Object.keys(mem).filter((k) => k.startsWith("ruling:")).length, H.MAX_RULINGS);

console.log("history tests pass");
