import { PUBLIC_SUFFIX_EXCEPTIONS, PUBLIC_SUFFIX_RULES, PUBLIC_SUFFIX_WILDCARDS } from './public-suffix-list';
import type { SearchEngine, SearchEngineId } from './types';

export const INTERNAL_SCHEME = 'copacetic';
export const START_PAGE_URL = `${INTERNAL_SCHEME}://start`;

/** Schemes a tab is allowed to load when the *user* asks for it — typing an address, restoring a session, opening a bookmark. */
export const NAVIGABLE_SCHEMES = new Set(['http:', 'https:', 'file:', `${INTERNAL_SCHEME}:`, 'about:']);

/** Schemes a *page* is allowed to drive a tab to. */
export const PAGE_NAVIGABLE_SCHEMES = new Set(['http:', 'https:', `${INTERNAL_SCHEME}:`, 'about:']);

const SEARCH_ENGINE_LIST: SearchEngine[] = [
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    searchTemplate: 'https://duckduckgo.com/?q=%s',
    suggestHost: 'duckduckgo.com',
  },
  {
    id: 'google',
    name: 'Google',
    searchTemplate: 'https://www.google.com/search?q=%s',
    suggestHost: 'www.google.com',
  },
  {
    id: 'brave',
    name: 'Brave Search',
    searchTemplate: 'https://search.brave.com/search?q=%s',
    suggestHost: 'search.brave.com',
  },
  {
    id: 'startpage',
    name: 'Startpage',
    searchTemplate: 'https://www.startpage.com/sp/search?query=%s',
    suggestHost: null,
  },
  { id: 'bing', name: 'Bing', searchTemplate: 'https://www.bing.com/search?q=%s', suggestHost: 'www.bing.com' },
];

export const SEARCH_ENGINES: Record<SearchEngineId, SearchEngine> = Object.fromEntries(
  SEARCH_ENGINE_LIST.map((engine) => [engine.id, engine]),
) as Record<SearchEngineId, SearchEngine>;

export const SEARCH_ENGINE_OPTIONS: readonly SearchEngine[] = SEARCH_ENGINE_LIST;

export function buildSearchUrl(query: string, engineId: SearchEngineId): string {
  const engine = SEARCH_ENGINES[engineId] ?? SEARCH_ENGINES.duckduckgo;
  return engine.searchTemplate.replace('%s', encodeURIComponent(query));
}

export function isNavigableUrl(value: string): boolean {
  try {
    return NAVIGABLE_SCHEMES.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** True when page code may send a tab here. Stricter than `isNavigableUrl`. */
export function isPageNavigableUrl(value: string): boolean {
  try {
    return PAGE_NAVIGABLE_SCHEMES.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function isInternalUrl(value: string): boolean {
  return value.startsWith(`${INTERNAL_SCHEME}://`);
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const HOST_WITH_PORT = /^([a-z0-9-]+(\.[a-z0-9-]+)*|\[[0-9a-f:]+\])(:\d{1,5})?$/i;

// Hosts that resolve without a dot and should never be treated as a search.
const DOTLESS_HOSTS = new Set(['localhost']);

export type OmniboxResolution = { type: 'url'; target: string } | { type: 'search'; target: string; query: string };

/** Turn whatever the user typed into something we can actually navigate to. */
export function resolveOmniboxInput(
  rawInput: string,
  engineId: SearchEngineId,
  options: { httpsFirst?: boolean } = {},
): OmniboxResolution | null {
  const input = rawInput.trim();
  if (input.length === 0) return null;

  const httpsFirst = options.httpsFirst ?? true;
  const search = (): OmniboxResolution => ({
    type: 'search',
    target: buildSearchUrl(input, engineId),
    query: input,
  });

  // A leading `word:` is only a scheme if what follows is not just a port.
  // Without this, `localhost:3000` parses as the scheme `localhost:` and a
  // perfectly good address gets sent to a search engine.
  const schemeMatch = input.match(/^([a-z][a-z0-9+.-]*):(.*)$/i);
  const looksLikePort = schemeMatch ? /^\d{1,5}([/?#]|$)/.test(schemeMatch[2] ?? '') : false;

  if (schemeMatch && !looksLikePort) {
    // An explicit scheme is honoured only if it is one we allow. Anything else
    // (javascript:, data:, mailto: typed by hand) falls through to a search
    // rather than being navigated to.
    if (!isNavigableUrl(input)) return search();
    try {
      const url = new URL(input);
      if (httpsFirst && url.protocol === 'http:' && !isLoopbackHost(url.hostname)) {
        url.protocol = 'https:';
      }
      return { type: 'url', target: url.toString() };
    } catch {
      return search();
    }
  }

  // No scheme. Anything with whitespace is prose, not an address.
  if (/\s/.test(input)) return search();

  const [hostPart = ''] = input.split(/[/?#]/, 1);
  const bareHost = hostPart.replace(/:\d{1,5}$/, '');

  const looksLikeHost =
    HOST_WITH_PORT.test(hostPart) &&
    (DOTLESS_HOSTS.has(bareHost.toLowerCase()) ||
      IPV4.test(bareHost) ||
      bareHost.startsWith('[') ||
      (bareHost.includes('.') && !bareHost.endsWith('.') && hasPlausibleTld(bareHost)));

  if (!looksLikeHost) return search();

  // A bare host is always tried over https — that guess is free to make and
  // costs nothing when it is wrong. Loopback is the exception: a local dev
  // server almost never has a certificate.
  const scheme = isLoopbackHost(bareHost) ? 'http' : 'https';
  try {
    return { type: 'url', target: new URL(`${scheme}://${input}`).toString() };
  } catch {
    return search();
  }
}

function hasPlausibleTld(host: string): boolean {
  const tld = host.slice(host.lastIndexOf('.') + 1);
  // A TLD is at least two characters and never all-numeric (that would be an IP
  // fragment, e.g. someone typing a version number like "1.2.3").
  return tld.length >= 2 && /^[a-z]+$/i.test(tld);
}

export function isLoopbackHost(host: string): boolean {
  const bare = host.toLowerCase().replace(/^\[|\]$/g, '');
  return bare === 'localhost' || bare === '127.0.0.1' || bare === '::1' || bare.endsWith('.localhost');
}

/** Hosts that only exist inside the user's own network. */
export function isPrivateHost(host: string): boolean {
  const bare = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (bare === '' || isLoopbackHost(bare)) return true;
  // mDNS and the conventional suffix for internal-only names.
  if (bare.endsWith('.local') || bare.endsWith('.internal')) return true;

  if (bare.includes(':')) {
    // IPv6 unique-local (fc00::/7) and link-local (fe80::/10).
    return /^f[cd]/.test(bare) || /^fe[89ab]/.test(bare);
  }

  const octets = bare.split('.');
  if (octets.length !== 4) return false;
  const a = Number(octets[0]);
  const b = Number(octets[1]);
  if (!Number.isInteger(a) || !Number.isInteger(b)) return false;

  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  // Link-local, which is also where every cloud metadata endpoint lives.
  if (a === 169 && b === 254) return true;
  return false;
}

// Rules are stored punycoded, because a URL always reports its hostname that way.
function toAsciiHost(host: string): string {
  const lower = host.toLowerCase();
  if (!/[^\u0000-\u007f]/.test(lower)) return lower;
  try {
    return new URL(`https://${lower}`).hostname;
  } catch {
    return lower;
  }
}

/** How many labels of `host` form its public suffix. */
export function publicSuffixLabelCount(host: string): number {
  const labels = host.split('.');
  let prevailing = 0;

  for (let i = 0; i < labels.length; i += 1) {
    const candidate = labels.slice(i).join('.');
    const ruleLabels = labels.length - i;

    // An exception rule wins over everything, and its public suffix is the
    // rule with its leftmost label removed.
    if (PUBLIC_SUFFIX_EXCEPTIONS.has(candidate)) return ruleLabels - 1;

    if (PUBLIC_SUFFIX_RULES.has(candidate) && ruleLabels > prevailing) {
      prevailing = ruleLabels;
    }

    // `*.foo` matches `anything.foo`, so the wildcard is checked against the
    // candidate one label to the right.
    if (i > 0 && PUBLIC_SUFFIX_WILDCARDS.has(candidate) && ruleLabels + 1 > prevailing) {
      prevailing = ruleLabels + 1;
    }
  }

  // No rule at all: the implicit `*` rule makes the last label the suffix.
  return prevailing || 1;
}

/** The registrable domain — the public suffix plus the one label a person actually registered. */
export function registrableDomainOf(host: string): string | null {
  const bare = toAsciiHost(host).replace(/\.$/, '');
  if (!bare || bare.startsWith('.') || bare.includes('..')) return null;

  const labels = bare.split('.');
  const suffixLabels = publicSuffixLabelCount(bare);
  if (labels.length <= suffixLabels) return null;

  return labels.slice(labels.length - suffixLabels - 1).join('.');
}

/** Whether the main process should fetch a favicon a page asked for. */
export function isFetchableFavicon(pageUrl: string, faviconUrl: string): boolean {
  let favicon: URL;
  try {
    favicon = new URL(faviconUrl);
  } catch {
    return false;
  }

  if (favicon.protocol !== 'https:' && favicon.protocol !== 'http:') return false;
  if (!isPrivateHost(favicon.hostname)) return true;

  // A local page may point at its own local icon; a remote one may not.
  try {
    return isPrivateHost(new URL(pageUrl).hostname);
  } catch {
    return false;
  }
}

export interface DisplayUrlParts {
  scheme: string;
  /** Everything before the registrable domain, e.g. `docs.` — may be empty. */
  subdomain: string;
  /** The part a user should actually read to know where they are. */
  registrableDomain: string;
  /** Port and everything after the host. */
  path: string;
  isInternal: boolean;
}

/** Split a URL for the omnibox so the registrable domain can be the only part rendered at full contrast. */
export function splitUrlForDisplay(value: string): DisplayUrlParts | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const scheme = url.protocol.replace(/:$/, '');
  const isInternal = url.protocol === `${INTERNAL_SCHEME}:`;
  const path = `${url.port ? `:${url.port}` : ''}${url.pathname === '/' ? '' : url.pathname}${url.search}${url.hash}`;

  if (isInternal || url.protocol === 'file:' || url.protocol === 'about:') {
    return {
      scheme,
      subdomain: '',
      registrableDomain: url.hostname || url.pathname,
      path: url.hostname ? path : '',
      isInternal,
    };
  }

  const host = url.hostname;
  if (IPV4.test(host) || host.startsWith('[') || !host.includes('.')) {
    return { scheme, subdomain: '', registrableDomain: host, path, isInternal };
  }

  const labels = host.split('.');
  const registrableDomain = registrableDomainOf(host);
  // A host that is itself a public suffix has no registrable part, so the
  // whole thing is emphasised rather than inventing an owner for it.
  if (!registrableDomain) {
    return { scheme, subdomain: '', registrableDomain: host, path, isInternal };
  }

  const takeCount = registrableDomain.split('.').length;
  const subdomain = labels.slice(0, Math.max(0, labels.length - takeCount)).join('.');

  return {
    scheme,
    subdomain: subdomain ? `${subdomain}.` : '',
    registrableDomain,
    path,
    isInternal,
  };
}

export function hostOf(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return '';
  }
}

export function originOf(value: string): string {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return '';
  }
}

/** A short, human label for a URL — used for tab titles before one arrives. */
export function fallbackTitleFor(value: string): string {
  if (value === START_PAGE_URL) return 'New tab';
  const host = hostOf(value);
  if (host) return host.replace(/^www\./, '');
  return value;
}
