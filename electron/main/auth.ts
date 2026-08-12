import type { AuthPrompt } from '../shared/types';

// The realm is a string the server chooses, and it is shown to the user inside Copacetic's own chrome.
const CONTROL_CHARACTERS = new RegExp('[\\u0000-\\u001f\\u007f]', 'g');
/** The bidi overrides that let text render right-to-left and reorder itself. */
const BIDI_OVERRIDES = new RegExp('[\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069]', 'g');
const MAX_REALM = 80;

export function sanitiseRealm(realm: string): string {
  const cleaned = realm
    // Whitespace controls become a space before the rest are removed: dropping
    // a newline outright would run the words either side of it together and
    // change what the realm says.
    .replace(/[\t\n\r\f\v]/g, ' ')
    .replace(CONTROL_CHARACTERS, '')
    .replace(BIDI_OVERRIDES, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length <= MAX_REALM) return cleaned;
  return `${cleaned.slice(0, MAX_REALM - 1)}…`;
}

/** Whether this challenge is one a person can meaningfully answer. */
export function isPromptWorthy(input: { isProxy: boolean; challengeUrl: string; tabUrl: string | null }): boolean {
  if (input.isProxy) return true;
  if (!input.tabUrl) return false;

  const challengeOrigin = originOrNull(input.challengeUrl);
  return challengeOrigin !== null && challengeOrigin === originOrNull(input.tabUrl);
}

function originOrNull(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function describeAuthPrompt(input: {
  id: string;
  tabId: string | null;
  isProxy: boolean;
  host: string;
  port: number;
  realm: string;
  scheme: string;
}): AuthPrompt {
  return {
    id: input.id,
    tabId: input.tabId,
    isProxy: input.isProxy,
    // Port is only worth showing when it is not the default for the scheme.
    host: input.port && input.port !== 80 && input.port !== 443 ? `${input.host}:${input.port}` : input.host,
    realm: sanitiseRealm(input.realm ?? ''),
    scheme: input.scheme ?? '',
  };
}
