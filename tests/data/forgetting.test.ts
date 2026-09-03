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
