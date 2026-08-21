import { describe, expect, it } from 'vitest';
import { crossedSites, describeChain, hostsInChain } from '../../electron/shared/download-provenance';

const CDN_CHAIN = [
  'https://get.example.com/installer',
  'https://redirect.example.com/abc',
  'https://d1a2b3.cloudfront.net/file.dmg',
];

describe('the hosts a download passed through', () => {
  it('lists them in order', () => {
    expect(hostsInChain(CDN_CHAIN)).toEqual(['get.example.com', 'redirect.example.com', 'd1a2b3.cloudfront.net']);
  });

  it('collapses a repeat rather than listing the same host twice', () => {
    const chain = ['https://a.test/one', 'https://a.test/two', 'https://b.test/three'];
    expect(hostsInChain(chain)).toEqual(['a.test', 'b.test']);
  });

  it.each([
    ['nothing', []],
    ['an unparseable url', ['not a url']],
  ])('copes with %s', (_name, chain) => {
    expect(hostsInChain(chain as string[])).toEqual([]);
  });
});

/**
 * A redirect inside one site is routine plumbing. A jump to another registrable
 * domain is the one you did not choose, and the only one worth showing.
 */
describe('whether it left the site you asked', () => {
  it('is false for a redirect within one domain', () => {
    expect(crossedSites(['https://www.example.com/a', 'https://downloads.example.com/b'])).toBe(false);
  });

  it('is true when the file came from somewhere else entirely', () => {
    expect(crossedSites(CDN_CHAIN)).toBe(true);
  });

  it('is false when there was no redirect at all', () => {
    expect(crossedSites(['https://example.com/file.dmg'])).toBe(false);
  });
});

describe('what the download list says', () => {
  it('says nothing when the file came straight from where you asked', () => {
    expect(describeChain(['https://example.com/file.dmg'])).toBe('');
  });

  it('names it as routine when it stayed on one site', () => {
    const detail = describeChain(['https://www.example.com/a', 'https://downloads.example.com/b']);
    expect(detail).toBe('Redirected within example.com.');
  });

  // The case worth showing: the thing you clicked and the thing you got are
  // served by different people.
  it('names both ends when the file came from elsewhere', () => {
    expect(describeChain(['https://get.example.com/x', 'https://cdn.other.test/file'])).toBe(
      'You asked get.example.com and the file came from cdn.other.test.',
    );
  });

  it('counts the hops in between', () => {
    expect(describeChain(CDN_CHAIN)).toContain('by way of 1 other host');
  });

  it('says hosts rather than host when there are several', () => {
    const long = ['https://a.test/1', 'https://b.test/2', 'https://c.test/3', 'https://d.test/4'];
    expect(describeChain(long)).toContain('by way of 2 other hosts');
  });
});
