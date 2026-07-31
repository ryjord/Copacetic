import type { SearchEngine, SearchEngineId } from './types';

export const INTERNAL_SCHEME = 'copacetic';
export const START_PAGE_URL = `${INTERNAL_SCHEME}://start`;

/**
 * Schemes a tab is allowed to load.
 *
 * `data:`, `blob:`, `javascript:` and `filesystem:` are absent on purpose:
 * top-level navigation to them is a long-standing phishing and XSS vector, and
 * Chromium blocks most of it already. Copacetic blocks all of it, everywhere.
 */
export const NAVIGABLE_SCHEMES = new Set(['http:', 'https:', 'file:', `${INTERNAL_SCHEME}:`, 'about:']);

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

export function isInternalUrl(value: string): boolean {
  return value.startsWith(`${INTERNAL_SCHEME}://`);
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const HOST_WITH_PORT = /^([a-z0-9-]+(\.[a-z0-9-]+)*|\[[0-9a-f:]+\])(:\d{1,5})?$/i;

/**
 * Hosts that resolve without a dot and should never be treated as a search.
 */
const DOTLESS_HOSTS = new Set(['localhost']);

export type OmniboxResolution = { type: 'url'; target: string } | { type: 'search'; target: string; query: string };

/**
 * Turn whatever the user typed into something we can actually navigate to.
 *
 * The bias is towards searching. Guessing "url" when the user meant "search"
 * produces a DNS error page and loses their query; guessing "search" when they
 * meant a URL costs one extra keystroke. Only inputs that are unambiguously
 * addresses take the URL path.
 */
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

/**
 * Multi-label public suffixes common enough to be worth special-casing.
 *
 * This is a heuristic, not the IANA Public Suffix List. It only affects which
 * part of the host the omnibox renders in full contrast, so being wrong on an
 * exotic suffix is a cosmetic miss, never a security decision.
 */
const COMPOUND_SUFFIXES = new Set([
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'me.uk',
  'net.uk',
  'sch.uk',
  'com.au',
  'net.au',
  'org.au',
  'edu.au',
  'gov.au',
  'co.nz',
  'net.nz',
  'org.nz',
  'co.za',
  'org.za',
  'co.jp',
  'or.jp',
  'ne.jp',
  'ac.jp',
  'go.jp',
  'com.br',
  'net.br',
  'org.br',
  'com.cn',
  'net.cn',
  'org.cn',
  'gov.cn',
  'co.in',
  'net.in',
  'org.in',
  'com.mx',
  'com.sg',
  'com.hk',
  'com.tr',
  'co.kr',
  'com.tw',
]);

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

/**
 * Split a URL for the omnibox so the registrable domain can be the only part
 * rendered at full contrast.
 *
 * This is the anti-spoofing surface: `paypal.com.attacker.tld/login` must read
 * as `attacker.tld`, not as PayPal.
 */
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
  const lastTwo = labels.slice(-2).join('.');
  const takeCount = COMPOUND_SUFFIXES.has(lastTwo) ? 3 : 2;
  const registrableDomain = labels.slice(-takeCount).join('.');
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
