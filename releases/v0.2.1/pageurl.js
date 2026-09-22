// Normalized page identity: no #hash, no tracking parameters, no trailing slash.
// Two URLs with the same key are the same page for Verafy's purposes.

const TRACKING = /^(utm_.*|fbclid|gclid|mc_cid|ref)$/i;

export function pageKey(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  u.hash = "";
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  u.searchParams.sort();
  const path = u.pathname.replace(/\/+$/, "");
  const query = u.searchParams.toString();
  return `${u.protocol}//${u.host.toLowerCase()}${path}${query ? `?${query}` : ""}`;
}
