import type { ConnectionEntry } from '../types';

/** Everything a page contacted, in a shape anyone can read and check without Copacetic. */
export interface PageReport {
  page: string;
  title: string;
  madeAt: string;
  madeBy: string;
  isBlocking: boolean;
  summary: { hosts: number; requests: number; blockedHosts: number; blockedRequests: number };
  hosts: { host: string; requests: number; blocked: number; isKnownTracker: boolean; blockedBy: string | null }[];
}

export function pageReportFrom(details: {
  url: string;
  title: string;
  now: number;
  version: string;
  isBlocking: boolean;
  entries: readonly ConnectionEntry[];
}): PageReport {
  const hosts = details.entries
    .map((entry) => ({
      host: entry.host,
      requests: entry.requests,
      blocked: entry.blocked,
      isKnownTracker: entry.isTracker,
      // A rule when a list rule caught it, the hostname otherwise; nothing when it went through.
      blockedBy: entry.blocked > 0 ? (entry.rule ?? 'hostname') : null,
    }))
    .toSorted((aHost, bHost) => bHost.requests - aHost.requests || aHost.host.localeCompare(bHost.host));
  return {
    page: details.url,
    title: details.title,
    madeAt: new Date(details.now).toISOString(),
    madeBy: `Copacetic ${details.version}`,
    isBlocking: details.isBlocking,
    summary: {
      hosts: hosts.length,
      requests: hosts.reduce((total, host) => total + host.requests, 0),
      blockedHosts: hosts.filter((host) => host.blocked > 0).length,
      blockedRequests: hosts.reduce((total, host) => total + host.blocked, 0),
    },
    hosts,
  };
}

/** Named for the site and the day, so a folder of them sorts into something readable. */
export function pageReportFileName(url: string, now: number): string {
  let host = 'page';
  try {
    host = new URL(url).hostname.replace(/^www\./, '') || host;
  } catch {
    // An address that does not parse is still a page; it just gets the plain name.
  }
  return `${host}-connections-${new Date(now).toISOString().slice(0, 10)}.json`;
}
