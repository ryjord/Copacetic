import { describe, expect, it } from 'vitest';
import {
  anchoredHostOf,
  compileRegexFilter,
  compileUrlFilter,
  tokenOf,
  tokensIn,
} from '../../../../../electron/main/extensions/net-rules/url-filter';

// Chrome's own examples, from the declarativeNetRequest reference, so the pattern means what an extension meant.
describe('a urlFilter', () => {
  it.each([
    ['abc', 'https://abcd.com', true],
    ['abc', 'https://example.com/abcd', true],
    ['abc', 'https://ab.com', false],
    ['abc*d', 'https://abcd.com', true],
    ['abc*d', 'https://example.com/abcxyzd', true],
    ['abc*d', 'https://abc.com', false],
    ['||a.example.com', 'https://a.example.com/', true],
    ['||a.example.com', 'https://b.a.example.com/xyz', true],
    ['||a.example.com', 'https://a.example.company', true],
    ['||a.example.com', 'https://example.com/', false],
    ['|https*', 'https://example.com', true],
    ['|https*', 'http://example.com/', false],
    ['|https*', 'http://https.com', false],
    ['example*^123|', 'https://example.com/123', true],
    ['example*^123|', 'http://abc.com/example?123', true],
    ['example*^123|', 'https://example.com/1234', false],
    ['example*^123|', 'https://abc.com/example0123', false],
  ])('%s against %s: %s', (filter, url, isMatch) => {
    expect(compileUrlFilter(filter).test(url)).toBe(isMatch);
  });

  it('ignores case unless told otherwise', () => {
    expect(compileUrlFilter('/Ads/').test('https://example.com/ads/x')).toBe(true);
    expect(compileUrlFilter('/Ads/', true).test('https://example.com/ads/x')).toBe(false);
  });

  // Characters that mean something in a regular expression are only themselves in a urlFilter.
  it('reads every other character literally', () => {
    expect(compileUrlFilter('a.b?c=(1)').test('https://x.com/a.b?c=(1)')).toBe(true);
    expect(compileUrlFilter('a.b').test('https://x.com/aXb')).toBe(false);
  });
});

describe('a regexFilter', () => {
  it('compiles when JavaScript can read it, which is what isRegexSupported answers', () => {
    expect(compileRegexFilter('^https://([a-z]+)\\.example\\.com/')?.test('https://cdn.example.com/x')).toBe(true);
    expect(compileRegexFilter('(unclosed')).toBeNull();
  });
});

describe('the keys a rule is filed under', () => {
  it.each([
    ['||ads.example.com^', 'ads.example.com'],
    ['||Example.COM/path', 'example.com'],
    ['||*.example.com', null],
    ['/ads/', null],
  ])('files %s under the host %s', (filter, host) => {
    expect(anchoredHostOf(filter)).toBe(host);
  });

  // "/ads" also matches "/adserver", so it cannot be filed under the whole word ads.
  it.each([
    ['/banner/ads/', 'banner'],
    ['/ads', null],
    ['ads/', null],
    ['*track*', null],
    ['|https://example.com/pixel|', 'example'],
    ['&utm_source=^', 'source'],
  ])('files %s under the token %s', (filter, token) => {
    expect(tokenOf(filter)).toBe(token);
  });

  it('reads every word of an address once', () => {
    expect([...tokensIn('https://cdn.Example.com/ads/ads.js')].sort()).toEqual([
      'ads',
      'cdn',
      'com',
      'example',
      'https',
    ]);
  });
});
