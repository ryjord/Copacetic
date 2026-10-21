import { describe, expect, it } from 'vitest';
import { crossedSites, describeChain, hostsInChain } from '../../../../electron/shared/downloads/download-provenance';

const CDN_CHAIN = [
  'https://get.example.com/installer',
  'https://redirect.example.com/abc',
  'https://d1a2b3.cloudfront.net/file.dmg',
];

describe('the hosts a download passed through', () => {
  it.each([
    ['in order', CDN_CHAIN, ['get.example.com', 'redirect.example.com', 'd1a2b3.cloudfront.net']],
    [
      'once, collapsing a repeat',
      ['https://a.test/one', 'https://a.test/two', 'https://b.test/three'],
      ['a.test', 'b.test'],
    ],
  ])('lists them %s', (_caseName, chain, expected) => {
    expect(hostsInChain(chain)).toEqual(expected);
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
  it.each([
    [
      'is false for a redirect within one domain',
      ['https://www.example.com/a', 'https://downloads.example.com/b'],
      false,
    ],
    ['is true when the file came from somewhere else entirely', CDN_CHAIN, true],
    ['is false when there was no redirect at all', ['https://example.com/file.dmg'], false],
  ])('%s', (_caseName, chain, expected) => {
    expect(crossedSites(chain)).toBe(expected);
  });
});

describe('what the download list says', () => {
  // The case worth showing is the file served by different people from the thing you clicked.
  it.each([
    ['nothing when the file came straight from where you asked', ['https://example.com/file.dmg'], ''],
    [
      'it as routine when it stayed on one site',
      ['https://www.example.com/a', 'https://downloads.example.com/b'],
      'Redirected within example.com.',
    ],
    [
      'both ends when the file came from elsewhere',
      ['https://get.example.com/x', 'https://cdn.other.test/file'],
      'You asked get.example.com and the file came from cdn.other.test.',
    ],
    ['the hops in between', CDN_CHAIN, expect.stringContaining('by way of 1 other host')],
    [
      'hosts rather than host when there are several',
      ['https://a.test/1', 'https://b.test/2', 'https://c.test/3', 'https://d.test/4'],
      expect.stringContaining('by way of 2 other hosts'),
    ],
  ])('says %s', (_caseName, chain, expected) => {
    expect(describeChain(chain)).toEqual(expected);
  });
});
