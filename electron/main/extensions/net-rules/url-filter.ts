/** Chrome's urlFilter patterns as regular expressions, with the keys a rule is filed under so most are never tried. */

// Libs
import { setFlagsFromString } from 'node:v8';

// Before any rule is compiled: without it the l flag below is refused, and every rule with it.
setFlagsFromString('--enable-experimental-regexp-engine');

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
  return linear(`${start}${source}${end}`, isCaseSensitive);
}

// Chrome's limit is 2 KB once compiled; the source is the nearest thing to that here.
const MOST_REGEX_LENGTH = 2048;
const ESCAPE = /^\\(?:x[0-9a-fA-F]{2}|u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|c[a-zA-Z]|[pPk](?:\{[^}]*\}|<[^>]*>)|.)/;
const GROUP_NAME = /^\(\?<(?![=!])[^>]*>/;
const LETTER_RANGE = /^([a-z]-[a-z]|[A-Z]-[A-Z])/;
const isLetter = (character: string) => /^[a-zA-Z]$/.test(character);

/**
 * The source with every letter it names matching either case. The linear
 * engine cannot take the i flag, and Chrome's rules ignore case unless told.
 */
export function withEitherCase(source: string): string {
  let folded = '';
  let isInClass = false;
  for (let index = 0; index < source.length; index += 1) {
    const rest = source.slice(index);
    const character = source.charAt(index);
    // Copied whole: \W and \w mean different things, and a group's name is not matched against anything.
    const kept = character === '\\' ? ESCAPE.exec(rest)?.[0] : isInClass ? undefined : GROUP_NAME.exec(rest)?.[0];
    const range = isInClass ? LETTER_RANGE.exec(rest)?.[0] : undefined;
    if (kept) {
      folded += kept;
      index += kept.length - 1;
    } else if (range) {
      const other = range === range.toLowerCase() ? range.toUpperCase() : range.toLowerCase();
      folded += `${range}${other}`;
      index += range.length - 1;
    } else if (isLetter(character)) {
      const bothCases = `${character.toLowerCase()}${character.toUpperCase()}`;
      folded += isInClass ? bothCases : `[${bothCases}]`;
    } else {
      if (character === '[' || character === ']') {
        isInClass = character === '[';
      }
      folded += character;
    }
  }
  return folded;
}

/**
 * V8's linear-time engine, which matches in time proportional to the address
 * as Chrome's RE2 does, so no rule can hang the browser, and which refuses
 * what RE2 refuses, such as back-references and lookaround.
 */
function linear(source: string, isCaseSensitive: boolean): RegExp {
  return new RegExp(isCaseSensitive ? source : withEitherCase(source), 'l');
}

/** A regexFilter as Chrome would match it, or null when Chrome would not take it. */
export function compileRegexFilter(filter: string, isCaseSensitive = false): RegExp | null {
  if (filter.length > MOST_REGEX_LENGTH) {
    return null;
  }
  try {
    return linear(filter, isCaseSensitive);
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
