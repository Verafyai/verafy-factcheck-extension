// Publication profile: evidence filtering, credibility score, and lean indicator.
// The model reports what it found and cites URLs. This code keeps only statements
// whose sources the search or fetch tools actually returned, and computes every
// number with fixed rules. The model never supplies a score.

export const SIGNALS = [
  { key: "corrections", label: "Corrections policy published and used", weight: 20 },
  { key: "ownership", label: "Ownership and funding disclosed", weight: 15 },
  { key: "staff", label: "Named editorial staff", weight: 10 },
  { key: "labeling", label: "News and opinion clearly labeled", weight: 15 },
  { key: "primary", label: "Primary sources cited", weight: 20 },
  { key: "accuracy", label: "Claim accuracy sample", weight: 20 }
];

const MIN_SIGNALS = 3;          // fewer determined signals: no score
const MIN_LABEL_ARTICLES = 2;   // opinion/analysis pieces actually read
const MIN_PRIMARY_ARTICLES = 3; // articles actually read
const MIN_TOPIC_ARTICLES = 3;   // articles on a topic before describing a pattern
const MIN_PATTERN_ARTICLES = 2; // articles showing the pattern
const MIN_LEAN_ARTICLES = 10;   // sample size before any overall lean is shown

const str = (v) => (typeof v === "string" ? v.trim() : "");
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
export const onDomain = (url, domain) => { const h = hostOf(url), d = domain.toLowerCase(); return !!h && (h === d || h.endsWith(`.${d}`)); };

// resolve(url) -> { url, title } if a tool returned it, else null.
function sourcesOf(urls, resolve) {
  const out = [], seen = new Set();
  for (const u of [].concat(urls || [])) {
    const s = typeof u === "string" ? resolve(u) : null;
    if (s && !seen.has(s.url)) { seen.add(s.url); out.push(s); }
  }
  return out;
}

const share = (n, d) => (d ? n / d : 0);

// parsed: the model's JSON. ctx: { resolve, isFetched, name, domain }.
export function buildPublicationProfile(parsed, { resolve, isFetched, name, domain }) {
  const p = parsed || {};

  // Articles: only the publication's own pages, only URLs a tool returned.
  const articles = [];
  const seen = new Set();
  for (const a of p.articles || []) {
    const src = a && resolve(str(a.url));
    if (!src || !onDomain(src.url, domain) || seen.has(src.url)) continue;
    seen.add(src.url);
    const fetched = isFetched(src.url);
    articles.push({
      url: src.url,
      title: str(a.title) || src.title,
      topic: str(a.topic).toLowerCase(),
      kind: ["news", "opinion", "analysis"].includes(a.kind) ? a.kind : "news",
      // Page-level observations only count when the page itself was read.
      labeled: fetched && typeof a.labeled === "boolean" ? a.labeled : null,
      cites_primary: fetched && typeof a.cites_primary === "boolean" ? a.cites_primary : null,
      fetched
    });
    if (articles.length >= 20) break;
  }
  const byUrl = new Map(articles.map((a) => [a.url, a]));

  // Signals reported by the model: found / partial / not_found need a surviving source.
  const reported = (key) => {
    const s = p.signals?.[key] || {};
    const sources = sourcesOf(s.source_urls, resolve);
    let status = ["found", "partial", "not_found"].includes(s.status) ? s.status : "unknown";
    if (key !== "corrections" && status === "partial") status = "found";
    if (!sources.length) status = "unknown";
    const value = { found: 1, partial: 0.5, not_found: 0 }[status];
    return { status, value: value ?? null, finding: str(s.finding), sources };
  };

  // Signals computed from the articles that were actually read.
  const opinion = articles.filter((a) => a.kind !== "news" && a.labeled !== null);
  const labeledCount = opinion.filter((a) => a.labeled).length;
  const labeling = opinion.length >= MIN_LABEL_ARTICLES
    ? {
        status: share(labeledCount, opinion.length) >= 0.5 ? "found" : "not_found",
        value: share(labeledCount, opinion.length),
        finding: `${labeledCount} of ${opinion.length} opinion or analysis pieces read were labeled as such.`,
        sources: opinion.map((a) => ({ url: a.url, title: a.title }))
      }
    : { status: "unknown", value: null, finding: "Too few opinion or analysis pieces were read to tell.", sources: [] };

  const read = articles.filter((a) => a.cites_primary !== null);
  const citing = read.filter((a) => a.cites_primary).length;
  const primary = read.length >= MIN_PRIMARY_ARTICLES
    ? {
        status: share(citing, read.length) >= 0.5 ? "found" : "not_found",
        value: share(citing, read.length),
        finding: `${citing} of ${read.length} articles read link to primary sources.`,
        sources: read.map((a) => ({ url: a.url, title: a.title }))
      }
    : { status: "unknown", value: null, finding: "Too few articles were read to tell.", sources: [] };

  const signals = {
    corrections: reported("corrections"),
    ownership: reported("ownership"),
    staff: reported("staff"),
    labeling,
    primary,
    accuracy: { status: "not_run", value: null, finding: "", sources: [] }
  };

  // Coverage patterns: counts come from surviving articles, not from the model.
  const topics = [];
  for (const t of p.topics || []) {
    const topic = str(t?.topic).toLowerCase();
    const pattern = str(t?.pattern);
    if (!topic || !pattern) continue;
    const shown = sourcesOf(t.article_urls, resolve).map((s) => byUrl.get(s.url)).filter(Boolean);
    const onTopic = new Set(articles.filter((a) => a.topic === topic).map((a) => a.url));
    for (const a of shown) onTopic.add(a.url);
    if (shown.length < MIN_PATTERN_ARTICLES || onTopic.size < MIN_TOPIC_ARTICLES) continue;
    topics.push({
      topic, pattern,
      lean: ["left", "right", "center"].includes(t.lean) ? t.lean : "none",
      articles: shown.map((a) => ({ url: a.url, title: a.title })),
      k: shown.length, n: onTopic.size
    });
  }

  const statements = (list, key = "text") => (list || [])
    .map((x) => ({ text: str(x?.[key]), sources: sourcesOf(x?.source_urls, resolve) }))
    .filter((x) => x.text && x.sources.length);

  // Independent ratings: name and link only, never on the publication's own site.
  const assessments = [];
  for (const a of p.assessments || []) {
    const src = a && resolve(str(a.url));
    const rater = str(a?.rater);
    if (src && rater && !onDomain(src.url, domain) && !assessments.some((x) => x.url === src.url)) assessments.push({ rater, url: src.url });
  }

  // Candidate claims for the optional accuracy sample: from sampled articles only.
  const claims = (p.claims || [])
    .map((c) => ({ text: str(c?.text), quote: str(c?.quote), url: resolve(str(c?.article_url))?.url }))
    .filter((c) => c.text && c.url && byUrl.has(c.url))
    .slice(0, 5);

  return { name, domain, signals, articles, topics, ownership: statements(p.ownership), assessments, claims };
}

// Weighted mean over determined signals, weights rescaled. Null with too few signals.
export function publicationScore(signals) {
  let num = 0, den = 0;
  const used = [], excluded = [];
  for (const { key, weight } of SIGNALS) {
    const s = signals[key];
    if (s && typeof s.value === "number") { num += weight * s.value; den += weight; used.push(key); }
    else excluded.push(key);
  }
  return { score: used.length >= MIN_SIGNALS ? Math.round((100 * num) / den) : null, used, excluded };
}

// Accuracy signal from checked claims: supported 1, contested 0.5, refuted 0.
export function accuracySignal(checked) {
  const V = { supported: 1, contested: 0.5, refuted: 0 };
  const scored = checked.filter((c) => c.verdict in V);
  const sources = checked.map((c) => ({ url: c.url, title: c.text }));
  if (scored.length < 2) {
    return { status: "unknown", value: null, finding: `Only ${scored.length} of ${checked.length} sampled claims could be verified.`, sources, checked };
  }
  const value = scored.reduce((s, c) => s + V[c.verdict], 0) / scored.length;
  const count = (v) => scored.filter((c) => c.verdict === v).length;
  return {
    status: value >= 0.5 ? "found" : "not_found",
    value,
    finding: `Of ${scored.length} claims checked: ${count("supported")} supported, ${count("contested")} contested, ${count("refuted")} refuted.`,
    sources, checked
  };
}

// Overall lean: shown only when topic patterns agree with at least moderate confidence.
export function overallLean(topics, articleCount) {
  const directional = topics.filter((t) => t.lean !== "none");
  const sides = new Set(directional.map((t) => t.lean));
  const base = { articles: articleCount, topics: directional.length };
  if (articleCount < MIN_LEAN_ARTICLES) return { ...base, position: null, confidence: "low", reason: "too few articles" };
  if (sides.size !== 1) return { ...base, position: null, confidence: "low", reason: sides.size ? "topics point different ways" : "no directional pattern" };
  const pieces = directional.reduce((s, t) => s + t.k, 0);
  const confidence = directional.length >= 3 && pieces >= 10 ? "high" : directional.length >= 2 && pieces >= 6 ? "moderate" : "low";
  if (confidence === "low") return { ...base, position: null, confidence, reason: "pattern too thin" };
  return { ...base, position: [...sides][0], confidence, pieces };
}
