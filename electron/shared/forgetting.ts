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

/** What is kept about sites in general, for a pane that has to list it. */
export interface KeptAboutSites {
  zoom: number;
  permissions: number;
  blockingOff: number;
  certificates: number;
}

/** The kinds that can be cleared on their own, named as a person would say them. */
export const KEPT_KINDS = [
  { id: 'zoom', one: 'Zoom set on 1 site', many: 'Zoom set on {n} sites' },
  { id: 'permissions', one: 'Permissions decided for 1 site', many: 'Permissions decided for {n} sites' },
  { id: 'blockingOff', one: 'Blocking switched off on 1 site', many: 'Blocking switched off on {n} sites' },
  { id: 'certificates', one: 'Certificate remembered for 1 site', many: 'Certificates remembered for {n} sites' },
] as const;

export type KeptKind = (typeof KEPT_KINDS)[number]['id'];

export function describeKept(kind: KeptKind, count: number): string {
  const entry = KEPT_KINDS.find((candidate) => candidate.id === kind);
  if (!entry) {
    return '';
  }
  return count === 1 ? entry.one : entry.many.replace('{n}', String(count));
}

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
  /**
   * Cookies held for the site across every session.
   *
   * The one that made the rest of the sentence a lie. Forgetting a site removed
   * its history, its icons, its zoom, its permissions and its certificates, and
   * left the cookies exactly where they were — so someone who had just been
   * told the site was forgotten was still signed in to it.
   */
  cookies: number;
}

export const NOTHING: SiteTraces = {
  visits: 0,
  icons: 0,
  zoom: 0,
  permissions: 0,
  blockingOff: 0,
  certificates: 0,
  cookies: 0,
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
  // A permission is keyed `origin|kind`, which is not an address. Read as one
  // it matched nothing, so forgetting a site quietly left every permission it
  // had been granted exactly where it was.
  const withoutKind = address.split('|')[0] ?? '';

  try {
    const url = new URL(withoutKind);
    return authorityOf(url.hostname, url.port);
  } catch {
    // A bare host, which is how the blocking allowlist is already keyed.
    const [host = '', port = ''] = withoutKind.split(':');
    return host ? authorityOf(host, port) : '';
  }
}

/**
 * What counts as one site for a host that has no registrable domain.
 *
 * An address is not a domain name, and neither is `localhost`. The
 * registrable-domain algorithm keeps the last two labels of anything it does
 * not recognise, which turns every IPv4 address into its last two octets —
 * `192.168.1.5` and `10.20.1.5` become the same "site", and forgetting one
 * machine takes the other with it. For those, the host answers for itself, and
 * the port comes too: two things served from localhost on different ports are
 * two different projects.
 */
function authorityOf(host: string, port: string): string {
  // A cookie set with `Domain=example.com` is stored by Chromium as
  // `.example.com`, and that leading dot is a marker rather than part of the
  // host. Left on, `registrableDomainOf` refuses the whole string and the site
  // never matches itself — so forgetting a site skipped every cookie scoped
  // across its subdomains, which is exactly the kind that keeps you signed in.
  const lowered = host.toLowerCase().replace(/^\./, '');
  const isAddress = IPV4.test(lowered) || lowered.startsWith('[') || !lowered.includes('.');
  if (!isAddress) {
    return registrableDomainOf(lowered) ?? lowered;
  }
  return port ? `${lowered}:${port}` : lowered;
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

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
  add(traces.cookies, 'cookie', 'cookies');

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
