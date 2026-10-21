/** Chrome's urlFilter patterns as regular expressions, with the keys a rule is filed under so most are never tried. */

// Anything that is not a letter, a digit or one of _ - . %, or the end of the address.
const SEPARATOR = '(?:[^a-zA-Z0-9_.%-]|$)';
// The start of the host, or of any name within it, for a pattern that begins with ||.
const DOMAIN_ANCHOR = '^[a-z][a-z0-9+.-]*:\\/\\/(?:[^/?#]*\\.)?';

const escapeLiteral = (text: string) => text.replace(/[.+?${}()[\]\\|/]/g, '\\$&');

/** The pattern as a regular expression, matched against a request's whole address. */
export function compileUrlFilter(filter: string, isCaseSensitive = false): RegExp {
  let body = filter;
  let start = '';
  let end = '';
  if (body.startsWith('||')) {
    start = DOMAIN_ANCHOR;
    body = body.slice(2);
  } else if (body.startsWith('|')) {
    start = '^';
    body = body.slice(1);
  }
  if (body.endsWith('|')) {
    end = '$';
    body = body.slice(0, -1);
  }
  const source = body
    .split('*')
    .map((part) => part.split('^').map(escapeLiteral).join(SEPARATOR))
    .join('.*');
  return new RegExp(`${start}${source}${end}`, isCaseSensitive ? '' : 'i');
}

/** A regexFilter as JavaScript reads it, or null when it will not compile, which is what isRegexSupported answers. */
export function compileRegexFilter(filter: string, isCaseSensitive = false): RegExp | null {
  try {
    return new RegExp(filter, isCaseSensitive ? '' : 'i');
  } catch {
    return null;
  }
}

/** The host a || pattern starts with, when it names one outright; such a rule can only match at that host or below it. */
export function anchoredHostOf(filter: string): string | null {
  if (!filter.startsWith('||')) {
    return null;
  }
  const host = filter.slice(2).split(/[\^/|?:]/)[0] ?? '';
  return host !== '' && !host.includes('*') ? host.toLowerCase() : null;
}

const TOKEN = /[a-z0-9%]{3,}/g;
const TOKEN_CHARACTER = /[a-z0-9%]/;

/**
 * The longest run of plain characters in a pattern that the pattern bounds on
 * both sides, so an address without that whole run cannot match: "/ads" matches
 * "/adserver", so it is filed under no token at all.
 */
export function tokenOf(filter: string): string | null {
  const pattern = filter.toLowerCase();
  // An unanchored edge of the pattern bounds nothing; an anchor is a | in the pattern, which does.
  const isBoundary = (index: number) => {
    const beside = pattern[index];
    return beside !== undefined && beside !== '*' && !TOKEN_CHARACTER.test(beside);
  };
  const tokens = [...pattern.matchAll(TOKEN)]
    .filter((found) => isBoundary(found.index - 1) && isBoundary(found.index + found[0].length))
    .map((found) => found[0]);
  return tokens.toSorted((aToken, bToken) => bToken.length - aToken.length)[0] ?? null;
}

/** Every token in an address, for finding the rules filed under one of them. */
export function tokensIn(url: string): Set<string> {
  return new Set(url.toLowerCase().match(TOKEN) ?? []);
}
