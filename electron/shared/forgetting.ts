import { registrableDomainOf } from './url';

/**
 * What this browser knows about a site, and what forgetting one has to mean.
 *
 * Clearing history clears history. Measured before this existed: afterwards
 * `settings.json` still named every site with a zoom, a permission or a
 * blocking exception, and the favicon cache still held an entry per origin
 * visited — a readable list of where someone had been, sitting on disk after
 * they asked the browser to forget. The record was gone and the evidence was
 * not.
 *
 * The split below is the whole design, and it is a judgement rather than a
 * technicality:
 *
 * - A **cache** is something the browser decided to keep. Nobody chooses a
 *   favicon, so it goes when the history that produced it goes.
 * - A **decision** is something a person made on purpose — a zoom they set, a
 *   permission they granted, a site where they turned blocking off. Throwing
 *   those away on a clear would be losing someone's work in the name of
 *   protecting them. They are kept, and they are *listed*, because they do name
 *   the sites and a list nobody is shown is a list nobody can act on.
 *
 * Forgetting one site is the other axis, and the one people actually want:
 * clearing by time is an afternoon, and what someone usually means is a site.
 */

/** Everything keyed by a site, in the order a person would think of them. */
export interface SiteTraces {
  /** History entries whose address belongs to the site. */
  visits: number;
  /** Cached icons, which nobody chose to keep. */
  icons: number;
  /** A zoom someone set for the site. */
  zoom: number;
  /** Permissions decided for it. */
  permissions: number;
  /** Whether blocking was switched off there. */
  blockingOff: number;
  /** A certificate accepted for it that nobody else would accept. */
  certificates: number;
}

export const NOTHING: SiteTraces = {
  visits: 0,
  icons: 0,
  zoom: 0,
  permissions: 0,
  blockingOff: 0,
  certificates: 0,
};

/** Whether two addresses belong to the same site, by registrable domain. */
export function sameSite(a: string, b: string): boolean {
  const left = siteOf(a);
  const right = siteOf(b);
  return left !== '' && left === right;
}

/**
 * The site an address belongs to.
 *
 * The registrable domain rather than the origin, because a person forgetting
 * `example.com` means the whole of it: `www.`, `app.`, and the one subdomain
 * they will not think of until it turns up in a list they thought was empty.
 */
export function siteOf(address: string): string {
  try {
    const { hostname } = new URL(address);
    return registrableDomainOf(hostname) ?? hostname;
  } catch {
    // Not an address. Some settings are keyed by bare host already.
    return registrableDomainOf(address) ?? address;
  }
}

export function countTraces(traces: SiteTraces): number {
  return Object.values(traces).reduce((total, count) => total + count, 0);
}

/**
 * What to say before removing them, counted rather than described.
 *
 * A thing that vanished quietly is indistinguishable from a thing that did not
 * work, so this is said before it happens and again afterwards. It names only
 * what is actually there: offering to remove a permission nobody granted makes
 * the whole sentence untrustworthy.
 */
export function describeTraces(traces: SiteTraces): string {
  const parts: string[] = [];
  const add = (count: number, one: string, many: string) => {
    if (count > 0) {
      parts.push(`${count} ${count === 1 ? one : many}`);
    }
  };

  add(traces.visits, 'visit', 'visits');
  add(traces.icons, 'cached icon', 'cached icons');
  add(traces.zoom, 'zoom', 'zooms');
  add(traces.permissions, 'permission', 'permissions');
  add(traces.blockingOff, 'blocking exception', 'blocking exceptions');
  add(traces.certificates, 'accepted certificate', 'accepted certificates');

  if (parts.length === 0) {
    return 'Nothing is kept about this site.';
  }
  if (parts.length === 1) {
    return `${parts[0]}.`;
  }
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}.`;
}

/**
 * How a page's refused-request count is said.
 *
 * "None" rather than "0": a column of zeroes reads as a broken feature rather
 * than as a clean site. And "requests", never "adverts" — one advert is usually
 * several requests and most of these are trackers, so the number that is easy
 * to inflate is the one to be careful with.
 */
export function describeRefused(count: number): string {
  if (count <= 0) {
    return 'none';
  }
  return `${count.toLocaleString()} refused`;
}
