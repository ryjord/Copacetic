// A download URL is often not where the file came from. Redirects, CDNs and
// shorteners sit in between, and a download list that shows only the last hop
// is showing you the least interesting one.

import { hostOf, registrableDomainOf } from './url';

export interface Provenance {
  /** Every URL the download passed through, first to last. */
  urlChain: string[];
  /** SHA-256 of what actually arrived, so it can be checked against a published one. */
  sha256: string | null;
}

/** The distinct hosts a download passed through, in order, without repeats. */
export function hostsInChain(urlChain: readonly string[]): string[] {
  const hosts: string[] = [];
  for (const url of urlChain) {
    const host = hostOf(url);
    if (host && host !== hosts[hosts.length - 1]) {
      hosts.push(host);
    }
  }
  return hosts;
}

/**
 * True when the file ended up somewhere other than where it started. A redirect
 * within one site is routine plumbing; a jump to another registrable domain is
 * the thing worth seeing, because it is the one you did not choose.
 */
export function crossedSites(urlChain: readonly string[]): boolean {
  const domains = hostsInChain(urlChain)
    .map((host) => registrableDomainOf(host) ?? host)
    .filter((domain, index, all) => all.indexOf(domain) === index);
  return domains.length > 1;
}

/** What to say about the route, or nothing when there is nothing to say. */
export function describeChain(urlChain: readonly string[]): string {
  const hosts = hostsInChain(urlChain);
  if (hosts.length <= 1) {
    return '';
  }

  const first = hosts[0] as string;
  const last = hosts[hosts.length - 1] as string;
  const between = hosts.length - 2;

  if (!crossedSites(urlChain)) {
    return `Redirected within ${registrableDomainOf(first) ?? first}.`;
  }
  if (between <= 0) {
    return `You asked ${first} and the file came from ${last}.`;
  }
  return `You asked ${first} and the file came from ${last}, by way of ${between} other ${between === 1 ? 'host' : 'hosts'}.`;
}
