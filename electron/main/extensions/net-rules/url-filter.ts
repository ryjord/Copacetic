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

// Chrome's limit is 2 KB once compiled; the source is the nearest thing to that here.
const MOST_REGEX_LENGTH = 2048;
const REPEATS = /[*+]|\{\d*,\d*\}|\{\d{2,}\}|\{[2-9]\}/;
// What a group can still end on after its last literal, which is what lets the next repetition start inside it.
const ENDS_OPEN = /(?:[*+?]|\})$/;
const INNERMOST_GROUP = /\((?:\?(?::|<[^>]+>))?([^()]*)\)([*+?]|\{\d*(?:,\d*)?\})?/;

/**
 * Whether a regular expression can backtrack without end, which Chrome's RE2
 * never does and JavaScript does: a repeated group whose inside repeats and is
 * not closed off by a literal, as `(a+)+` or `(\w+\s?)*`, or that holds a
 * wildcard. `(?:[a-z0-9-]+\.)*`, the usual shape for subdomains, is closed off
 * by its dot and is let through. Back-references and lookaround are refused
 * too, since RE2 refuses them.
 */
export function canBacktrackForever(source: string): boolean {
  if (/\\[1-9]|\\k<|\(\?<?[=!]/.test(source)) {
    return true;
  }
  let flattened = source.replace(/\\./g, 'x').replace(/\[[^\]]*\]/g, 'x');
  for (let found = INNERMOST_GROUP.exec(flattened); found; found = INNERMOST_GROUP.exec(flattened)) {
    const [whole, inside = '', after = ''] = found;
    const holdsRepetition = REPEATS.test(inside);
    const isRepeated = REPEATS.test(after);
    if (isRepeated && holdsRepetition && (ENDS_OPEN.test(inside) || /\.[*+]/.test(inside))) {
      return true;
    }
    flattened = flattened.replace(whole, holdsRepetition || isRepeated ? 'x+' : 'x');
  }
  return false;
}

/** A regexFilter as JavaScript reads it, or null when Chrome would not take it or it could hang the browser. */
export function compileRegexFilter(filter: string, isCaseSensitive = false): RegExp | null {
  if (filter.length > MOST_REGEX_LENGTH) {
    return null;
  }
  try {
    const pattern = new RegExp(filter, isCaseSensitive ? '' : 'i');
    return canBacktrackForever(filter) ? null : pattern;
  } catch {
    return null;
  }
}

/**
 * The host a || pattern starts with, when it names a whole one; such a rule can
 * only match at that host or below it. `||ads.` or `||example.com` with nothing
 * after it can match more hosts than one, such as example.com.au, so neither is.
 */
export function anchoredHostOf(filter: string): string | null {
  const host = /^\|\|([a-z0-9-]+(?:\.[a-z0-9-]+)*)[\^/:?|]/i.exec(filter)?.[1];
  return host ? host.toLowerCase() : null;
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
