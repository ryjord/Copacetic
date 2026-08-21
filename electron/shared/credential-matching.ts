// Which saved password may be offered to the page in front of you. Everything
// here errs towards offering nothing: a password filled into the wrong place is
// handed to whoever asked for it, and cannot be taken back.

import { isLoopbackHost, registrableDomainOf } from './url';

export interface MatchableEntry {
  id: string;
  origin: string;
  username: string;
}

export type RefusalReason = 'not-secure' | 'no-match' | 'unusable-page';

export interface FillOffer {
  entries: MatchableEntry[];
  /** Why nothing is offered, in the words shown to the user. Empty when entries were found. */
  refusal: string;
}

function siteOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return registrableDomainOf(parsed.hostname) ?? parsed.hostname ?? null;
  } catch {
    return null;
  }
}

/**
 * A password typed into a plain http page is readable by anyone on the network
 * and by anything between. Filling one there would be Copacetic putting it at
 * risk rather than the person choosing to. Loopback is exempt: it never leaves
 * the machine, and refusing it would make local development impossible.
 */
export function isFillablePage(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || (parsed.protocol === 'http:' && isLoopbackHost(parsed.hostname));
  } catch {
    return false;
  }
}

/**
 * Matched on the registrable domain rather than the exact origin, so a password
 * saved on the site works on its sign-in subdomain. The public suffix list is
 * what makes that safe: on a host like `someone.github.io` the registrable
 * domain is the whole thing, so one user's page cannot claim another's.
 */
export function entriesForPage(url: string, entries: readonly MatchableEntry[]): MatchableEntry[] {
  const site = siteOf(url);
  if (!site) {
    return [];
  }
  return entries.filter((entry) => {
    const entrySite = siteOf(entry.origin);
    return entrySite !== null && entrySite === site;
  });
}

/** What can be offered here, or why nothing can. */
export function offerFor(url: string, entries: readonly MatchableEntry[]): FillOffer {
  if (!siteOf(url)) {
    return { entries: [], refusal: 'There is no site here to fill a password into.' };
  }
  if (!isFillablePage(url)) {
    return {
      entries: [],
      refusal:
        'This page is not encrypted, so a password typed into it can be read by anyone on the network. Copacetic will not put one there for you.',
    };
  }

  const matches = entriesForPage(url, entries);
  if (matches.length === 0) {
    return { entries: [], refusal: 'Nothing saved for this site.' };
  }
  return { entries: matches, refusal: '' };
}
