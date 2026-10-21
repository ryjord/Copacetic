import { describe, expect, it } from 'vitest';
import {
  NOTHING,
  countTraces,
  describeTraces,
  sameSite,
  siteOf,
  type SiteTraces,
} from '../../../../electron/shared/data/forgetting';

const traces = (over: Partial<SiteTraces> = {}): SiteTraces => ({ ...NOTHING, ...over });

/**
 * A person forgetting example.com means the whole of it. Matching by origin
 * would leave `app.example.com` behind - the one subdomain they will not think
 * of until it turns up in a list they believed was empty.
 */
describe('which site an address belongs to', () => {
  // A bare host is taken as well, because some settings are keyed that way.
  it.each([
    ['https://www.example.com/page?q=1', 'example.com'],
    ['https://app.example.com/', 'example.com'],
    ['www.example.com', 'example.com'],
  ])('reduces %s to its registrable domain', (address, expected) => {
    expect(siteOf(address)).toBe(expected);
  });

  /*
   * A cookie set with `Domain=example.com` is stored by Chromium as
   * `.example.com`. Read as a host, the leading dot made the registrable-domain
   * algorithm refuse the whole string, so the site did not match itself - and
   * forgetting a site skipped every cookie scoped across its subdomains, which
   * is the kind that keeps you signed in. The fix for cookies was written and
   * then tested with host-only cookies, which never carry the dot.
   */
  it('reads a cookie domain, which carries a leading dot', () => {
    expect(siteOf('.example.com')).toBe('example.com');
    expect(sameSite('.example.com', 'example.com')).toBe(true);
    expect(sameSite('.www.example.com', 'example.com')).toBe(true);
  });

  // Two things that are not addresses are not the same site as each other.
  it.each([
    ['a dotted domain from another site', '.example.org', 'example.com', false],
    ['subdomains of one site', 'https://app.example.com/a', 'https://www.example.com/b', true],
    ['different sites', 'https://example.com/', 'https://example.org/', false],
    ['nothing against nothing', '', '', false],
    ['one address against itself', 'http://192.168.1.5/a', 'http://192.168.1.5/b', true],
  ])('compares %s', (_caseName, firstAddress, secondAddress, expected) => {
    expect(sameSite(firstAddress, secondAddress)).toBe(expected);
  });

  /*
   * An address is not a domain name. The registrable-domain algorithm keeps the
   * last two labels of anything it does not recognise, which turns every IPv4
   * address into its last two octets - so forgetting one machine on a network
   * would take every other machine whose address happens to end the same way.
   */
  it('keeps two unrelated addresses apart', () => {
    expect(sameSite('http://192.168.1.5/', 'http://10.20.1.5/')).toBe(false);
  });

  /*
   * Two things served from localhost on different ports are two different
   * projects, and forgetting one has no business touching the other.
   */
  it('keeps two local servers apart by port', () => {
    expect(sameSite('http://localhost:3000/', 'http://localhost:8080/')).toBe(false);
    expect(sameSite('http://localhost:3000/a', 'http://localhost:3000/b')).toBe(true);
  });

  /*
   * Permission decisions are keyed `origin|kind`, which is not an address. Read
   * as one, it matches nothing - so forgetting a site silently left every
   * permission it had been granted exactly where it was.
   */
  it('reads a permission key, which is an origin with a kind stuck on it', () => {
    expect(siteOf('https://www.example.com|geolocation')).toBe('example.com');
    expect(sameSite('https://www.example.com|camera', 'https://example.com/')).toBe(true);
  });
});

/**
 * Said before it happens and again afterwards, because something that vanished
 * quietly is indistinguishable from something that did not work.
 */
describe('what is said before forgetting a site', () => {
  /*
   * The cookies are the one that was missing, and the one people actually mean.
   * Forgetting a site removed its history, icons, zoom, permissions and
   * certificates and left every cookie in place, so someone told the site was
   * forgotten could open it and still be signed in.
   */
  it.each([
    ['nothing is kept', NOTHING, 'Nothing is kept about this site.'],
    ['one thing on its own', traces({ visits: 1 }), '1 visit.'],
    ['a count properly', traces({ visits: 31 }), '31 visits.'],
    ['several joined with an and', traces({ visits: 31, icons: 1, zoom: 1 }), '31 visits, 1 cached icon and 1 zoom.'],
    ['the cookies', traces({ visits: 4, cookies: 12 }), '4 visits and 12 cookies.'],
    ['one cookie properly', traces({ cookies: 1 }), '1 cookie.'],
  ])('says %s', (_caseName, kept, expected) => {
    expect(describeTraces(kept)).toBe(expected);
  });

  it('adds up to what will actually go, cookies included', () => {
    expect(countTraces(traces({ visits: 3, cookies: 12 }))).toBe(15);
    expect(countTraces(traces({ visits: 31, icons: 1, permissions: 2 }))).toBe(34);
  });
});
