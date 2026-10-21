import { describe, expect, it } from 'vitest';
import { isThirdParty, withoutHeader } from '../../../../electron/shared/browsing/third-party';

describe('whether a request is third-party', () => {
  // A subdomain is the same site, as a cookie scoped to the site would be. Without a page to compare against, guessing would break a sign-in.
  it.each([
    [
      'a request to another site',
      'https://tracker.example.net/pixel',
      'https://news.example.com/story',
      'image',
      true,
    ],
    ['a subdomain of the same site', 'https://cdn.example.com/app.js', 'https://www.example.com/', 'script', false],
    [
      'the page itself navigating somewhere',
      'https://elsewhere.example.org/',
      'https://news.example.com/',
      'mainFrame',
      false,
    ],
    ['no page to compare against', 'https://tracker.example.net/', undefined, 'xhr', false],
    ['an internal page to compare against', 'https://tracker.example.net/', 'copacetic://start', 'xhr', false],
  ] as const)('answers for %s', (_caseName, requestUrl, pageUrl, type, expected) => {
    expect(isThirdParty(requestUrl, pageUrl, type)).toBe(expected);
  });
});

describe('removing a header', () => {
  it('removes it whatever case it arrived in, and nothing else', () => {
    expect(withoutHeader({ cookie: 'a=1', COOKIE: 'b=2', Accept: '*/*' }, 'Cookie')).toEqual({ Accept: '*/*' });
  });
});
