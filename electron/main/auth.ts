import type { AuthPrompt } from '../shared/types';
import { sanitiseChromeText } from '../shared/chrome-text';

const MAX_REALM = 80;

/** The realm is a string the server chooses, shown to the user inside Copacetic's own chrome. */
export function sanitiseRealm(realm: string): string {
  return sanitiseChromeText(realm, MAX_REALM);
}

/** Whether this challenge is one a person can meaningfully answer. */
export function isPromptWorthy(input: { isProxy: boolean; challengeUrl: string; tabUrl: string | null }): boolean {
  if (input.isProxy) {
    return true;
  }
  if (!input.tabUrl) {
    return false;
  }

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
