// Deterministic argument solver (Dung's grounded semantics).
// The model proposes arguments and attacks; this code decides what survives.

export function groundedLabels(argIds, attacks) {
  const attackersOf = Object.fromEntries(argIds.map((id) => [id, []]));
  for (const { from, to } of attacks) {
    if (from in attackersOf && to in attackersOf && from !== to) attackersOf[to].push(from);
  }
  const label = {};
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of argIds) {
      if (label[id]) continue;
      const atk = attackersOf[id];
      if (atk.every((a) => label[a] === "OUT")) { label[id] = "IN"; changed = true; }
      else if (atk.some((a) => label[a] === "IN")) { label[id] = "OUT"; changed = true; }
    }
  }
  for (const id of argIds) if (!label[id]) label[id] = "UNDEC";
  return label;
}

// supported | refuted | contested | unverifiable
export function verdictFor(args, labels) {
  if (!args.length) return "unverifiable";
  const standing = (side) => args.some((a) => a.side === side && labels[a.id] === "IN");
  const sup = standing("supports");
  const ref = standing("refutes");
  if (sup && !ref) return "supported";
  if (ref && !sup) return "refuted";
  return "contested";
}

const VALUE = { supported: 1, contested: 0.5, refuted: 0 };

// Importance-weighted score over claims that reached a verdict. Unverifiable claims are excluded.
export function truthScore(claims) {
  let num = 0, den = 0, basis = 0;
  for (const c of claims) {
    if (!(c.verdict in VALUE)) continue;
    const w = c.importance || 1;
    num += w * VALUE[c.verdict];
    den += w;
    basis += 1;
  }
  return { score: den ? Math.round((100 * num) / den) : null, basis, total: claims.length };
}

export function scoreLabel(score) {
  if (score === null) return "Not enough checkable claims yet";
  if (score >= 80) return "Well supported";
  if (score >= 60) return "Mostly supported";
  if (score >= 40) return "Mixed evidence";
  if (score >= 20) return "Mostly unsupported";
  return "Contradicted by evidence";
}
