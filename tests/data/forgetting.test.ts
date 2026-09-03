import { describe, expect, it } from 'vitest';
import {
  NOTHING,
  countTraces,
  describeRefused,
  describeTraces,
  sameSite,
  siteOf,
  type SiteTraces,
} from '../../electron/shared/forgetting';

const traces = (over: Partial<SiteTraces> = {}): SiteTraces => ({ ...NOTHING, ...over });

/**
 * A person forgetting example.com means the whole of it. Matching by origin
 * would leave `app.example.com` behind — the one subdomain they will not think
 * of until it turns up in a list they believed was empty.
 */
describe('which site an address belongs to', () => {
  it('reduces an address to its registrable domain', () => {
    expect(siteOf('https://www.example.com/page?q=1')).toBe('example.com');
    expect(siteOf('https://app.example.com/')).toBe('example.com');
  });

  it('takes a bare host, because some settings are keyed that way', () => {
    expect(siteOf('www.example.com')).toBe('example.com');
  });

  it('treats subdomains of one site as that site', () => {
    expect(sameSite('https://app.example.com/a', 'https://www.example.com/b')).toBe(true);
  });

  it('keeps different sites apart', () => {
    expect(sameSite('https://example.com/', 'https://example.org/')).toBe(false);
  });

  // Two things that are not addresses are not the same site as each other.
  it('does not match nothing against nothing', () => {
    expect(sameSite('', '')).toBe(false);
  });

  /*
   * An address is not a domain name. The registrable-domain algorithm keeps the
   * last two labels of anything it does not recognise, which turns every IPv4
   * address into its last two octets — so forgetting one machine on a network
   * would take every other machine whose address happens to end the same way.
   */
  it('keeps two unrelated addresses apart', () => {
    expect(sameSite('http://192.168.1.5/', 'http://10.20.1.5/')).toBe(false);
  });

  it('treats one address as itself', () => {
    expect(sameSite('http://192.168.1.5/a', 'http://192.168.1.5/b')).toBe(true);
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
   * as one, it matches nothing — so forgetting a site silently left every
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
  it('says nothing is kept when nothing is', () => {
    expect(describeTraces(NOTHING)).toBe('Nothing is kept about this site.');
  });

  it('names one thing on its own', () => {
    expect(describeTraces(traces({ visits: 1 }))).toBe('1 visit.');
  });

  it('counts properly', () => {
    expect(describeTraces(traces({ visits: 31 }))).toBe('31 visits.');
  });

  it('joins several with an and, the way a person would', () => {
    const message = describeTraces(traces({ visits: 31, icons: 1, zoom: 1 }));
    expect(message).toBe('31 visits, 1 cached icon and 1 zoom.');
  });

  /*
   * The one that was missing, and the one people actually mean. Forgetting a
   * site removed its history, icons, zoom, permissions and certificates and
   * left every cookie in place, so someone told the site was forgotten could
   * open it and still be signed in.
   */
  it('names the cookies, which are the part that kept you signed in', () => {
    expect(describeTraces(traces({ visits: 4, cookies: 12 }))).toBe('4 visits and 12 cookies.');
  });

  it('says one cookie properly', () => {
    expect(describeTraces(traces({ cookies: 1 }))).toBe('1 cookie.');
  });

  it('counts cookies towards what will go', () => {
    expect(countTraces(traces({ visits: 3, cookies: 12 }))).toBe(15);
  });

  /*
   * Offering to remove a permission nobody granted makes the rest of the
   * sentence untrustworthy, and this sentence exists to be trusted.
   */
  it('never names something that is not there', () => {
    const message = describeTraces(traces({ visits: 4 }));
    expect(message).not.toContain('permission');
    expect(message).not.toContain('certificate');
    expect(message).not.toContain('0');
  });

  it('adds up to what will actually go', () => {
    expect(countTraces(traces({ visits: 31, icons: 1, permissions: 2 }))).toBe(34);
  });
});

/**
 * The number that is easy to inflate, so the one to be careful with. One advert
 * is usually several requests, and most of these are trackers rather than
 * adverts at all.
 */
describe('how a refused count is said', () => {
  it('says none rather than zero, so a clean site does not read as a fault', () => {
    expect(describeRefused(0)).toBe('none');
    expect(describeRefused(-1)).toBe('none');
  });

  it('says requests, never adverts', () => {
    expect(describeRefused(64)).toBe('64 refused');
    expect(describeRefused(64)).not.toContain('ad');
  });

  it('groups a big number so it can be read', () => {
    expect(describeRefused(18204)).toContain(',');
  });
});
