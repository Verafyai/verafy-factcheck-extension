import { buildPublicationProfile, publicationScore, accuracySignal, overallLean } from "./profile.js";
import assert from "node:assert/strict";

const D = "example.com";
const returned = new Set([
  "https://example.com/about", "https://example.com/corrections", "https://example.com/masthead",
  ...Array.from({ length: 12 }, (_, i) => `https://example.com/a${i}`),
  "https://rater.org/example"
]);
const fetched = new Set(["https://example.com/a0", "https://example.com/a1", "https://example.com/a2", "https://example.com/a3"]);
const ctx = {
  name: "Example", domain: D,
  resolve: (u) => (returned.has(u) ? { url: u, title: u } : null),
  isFetched: (u) => fetched.has(u)
};
const art = (i, extra = {}) => ({ url: `https://example.com/a${i}`, title: `A${i}`, topic: i < 6 ? "energy" : "courts", kind: "news", labeled: true, cites_primary: true, ...extra });

const parsed = {
  signals: {
    corrections: { status: "partial", finding: "Policy page, no corrections found", source_urls: ["https://example.com/corrections"] },
    ownership: { status: "found", finding: "Owned by X", source_urls: ["https://made-up.net/owner"] }, // source never returned
    staff: { status: "not_found", finding: "Staff page lists no names", source_urls: ["https://example.com/masthead"] }
  },
  articles: [
    art(0), art(1, { cites_primary: false }), art(2, { kind: "opinion", labeled: true }), art(3, { kind: "analysis", labeled: false }),
    ...[4, 5, 6, 7, 8, 9, 10, 11].map((i) => art(i)),
    { url: "https://other.com/x", title: "off-site", topic: "energy" }, // not the publication's own page
    { url: "https://example.com/never-returned", title: "hallucinated" }
  ],
  topics: [
    { topic: "Energy", pattern: "tends to present solar favorably", lean: "left", article_urls: ["https://example.com/a0", "https://example.com/a1", "https://example.com/a4"] },
    { topic: "courts", pattern: "one piece only", lean: "right", article_urls: ["https://example.com/a6"] } // below pattern minimum
  ],
  ownership: [{ text: "Owned by X", source_urls: ["https://made-up.net/owner"] }, { text: "Funded by readers", source_urls: ["https://example.com/about"] }],
  assessments: [{ rater: "Rater", url: "https://rater.org/example" }, { rater: "Self", url: "https://example.com/about" }],
  claims: [{ text: "C1", article_url: "https://example.com/a0" }, { text: "C2", article_url: "https://other.com/x" }]
};

const P = buildPublicationProfile(parsed, ctx);

// Articles: off-site and never-returned URLs dropped; page-level fields only for fetched pages.
assert.equal(P.articles.length, 12);
assert.equal(P.articles.find((a) => a.url.endsWith("/a5")).cites_primary, null);
// A signal whose only source was never returned becomes "unknown".
assert.equal(P.signals.ownership.status, "unknown");
assert.equal(P.signals.corrections.value, 0.5);
assert.equal(P.signals.staff.value, 0);
// Labeling: 1 of 2 fetched opinion/analysis pieces labeled -> 0.5.
assert.equal(P.signals.labeling.value, 0.5);
// Primary: 3 of 4 fetched articles cite primary sources.
assert.equal(P.signals.primary.value, 0.75);
// Topics: counts come from surviving articles; thin patterns dropped.
assert.equal(P.topics.length, 1);
assert.deepEqual([P.topics[0].k, P.topics[0].n], [3, 6]);
// Statements and ratings need a returned source not on the publication's own site.
assert.deepEqual(P.ownership.map((o) => o.text), ["Funded by readers"]);
assert.deepEqual(P.assessments.map((a) => a.rater), ["Rater"]);
assert.deepEqual(P.claims.map((c) => c.text), ["C1"]);

// Score: 4 determined signals (corrections .5, staff 0, labeling .5, primary .75), weights rescaled.
let s = publicationScore(P.signals);
assert.deepEqual(s.used, ["corrections", "staff", "labeling", "primary"]);
assert.equal(s.score, Math.round((100 * (20 * 0.5 + 10 * 0 + 15 * 0.5 + 20 * 0.75)) / 65));
// Fewer than 3 determined signals: no number.
assert.equal(publicationScore({ corrections: { value: 1 }, staff: { value: 1 } }).score, null);

// Accuracy sample.
const acc = accuracySignal([
  { text: "a", url: "u1", verdict: "supported" }, { text: "b", url: "u2", verdict: "refuted" }, { text: "c", url: "u3", verdict: "unverifiable" }
]);
assert.equal(acc.value, 0.5);
assert.equal(accuracySignal([{ text: "a", url: "u", verdict: "supported" }]).value, null);

// Lean: one agreeing topic is too thin; three agreeing topics with enough pieces is high.
assert.equal(overallLean(P.topics, P.articles.length).position, null);
const T = (lean, k) => ({ lean, k });
assert.equal(overallLean([T("left", 4), T("left", 3), T("left", 3)], 15).confidence, "high");
assert.equal(overallLean([T("left", 3), T("left", 3)], 12).position, "left");
assert.equal(overallLean([T("left", 4), T("right", 4)], 15).position, null);
assert.equal(overallLean([T("left", 5), T("left", 5)], 8).position, null); // sample under 10
assert.equal(overallLean([T("none", 5), T("center", 3), T("center", 3)], 12).position, "center");

console.log("profile tests pass");
