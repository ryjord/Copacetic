import { describe, expect, it } from 'vitest';
import {
  anchoredHostOf,
  compileRegexFilter,
  compileUrlFilter,
  tokenOf,
  tokensIn,
  withEitherCase,
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

  // Matched in the main process as each request goes, so it must take time in proportion to the address, as RE2 does.
  it.each(['(a+)+$', '(a|aa)+$', '(\\w|\\d)+$'])(
    'matches %s in a straight line, however long the address',
    (source) => {
      const pattern = compileRegexFilter(source);
      const started = performance.now();
      expect(pattern?.test(`https://x.example/${'a'.repeat(20_000)}!`)).toBe(false);
      expect(performance.now() - started).toBeLessThan(500);
    },
  );

  it.each(['(a)\\1', '^(?=x)', '(?<!x)y'])('refuses %s, as RE2 does', (source) => {
    expect(compileRegexFilter(source)).toBeNull();
  });

  it('ignores case unless told not to, and keeps the case of what it captured', () => {
    expect(compileRegexFilter('^https://CDN\\.example\\.com/[A-Z]+')?.test('https://cdn.example.com/abc')).toBe(true);
    expect(
      compileRegexFilter('^https://cdn\\.example\\.com/[a-z]+$', true)?.test('https://cdn.example.com/ABC'),
    ).toBe(false);
    const pattern = compileRegexFilter('^https://cdn\\.example\\.com/(.*)');
    expect(pattern && 'https://cdn.example.com/Path/File.JS'.replace(pattern, '$1')).toBe('Path/File.JS');
  });

  it('refuses one longer than Chrome would compile', () => {
    expect(compileRegexFilter(`^${'a'.repeat(2048)}`)).toBeNull();
  });
});

describe('a pattern made to ignore case', () => {
  // \\W and \\w mean different things, so an escape is never folded; nor is a group's name.
  it('names both cases of each letter, and leaves escapes and group names alone', () => {
    expect(withEitherCase('a[b-dX]\\W(?<name>x)\\x41')).toBe('[aA][b-dB-DxX]\\W(?<name>[xX])\\x41');
  });
});

describe('the keys a rule is filed under', () => {
  it.each([
    ['||ads.example.com^', 'ads.example.com'],
    ['||Example.COM/path', 'example.com'],
    ['||*.example.com', null],
    ['/ads/', null],
    // Each of these also matches at hosts other than one: ads.example.com, google-analytics.com, example.com.au.
    ['||ads.', null],
    ['||google-analytics', null],
    ['||example.com', null],
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
