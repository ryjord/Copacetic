/**
 * Query parameters that exist to say where a click came from, and nothing
 * else: removing them never changes what the page shows. Matched exactly, or
 * by the prefix for the families that number or name their members.
 */
const TRACKING_PARAMETERS = new Set([
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'yclid',
  'twclid',
  'ttclid',
  'igshid',
  'li_fat_id',
  'mc_cid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
  'oly_anon_id',
  'oly_enc_id',
  'vero_id',
  'mkt_tok',
  '__s',
  'srsltid',
]);
const TRACKING_PREFIXES = ['utm_', 'hsa_', 'pk_'];

function isTrackingParameter(name: string): boolean {
  const lower = name.toLowerCase();
  return TRACKING_PARAMETERS.has(lower) || TRACKING_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/** The address without its tracking parameters, or null when it had none to remove. */
export function cleanUrl(address: string): string | null {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return null;
  }
  const tracked = [...url.searchParams.keys()].filter(isTrackingParameter);
  if (tracked.length === 0) {
    return null;
  }
  tracked.forEach((name) => url.searchParams.delete(name));
  return url.toString();
}
