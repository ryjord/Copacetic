import { describe, expect, it } from 'vitest';
import { isThirdParty, withoutHeader } from '../../../../electron/shared/browsing/third-party';

describe('whether a request is third-party', () => {
  it('is, for a request to another site', () => {
    expect(isThirdParty('https://tracker.example.net/pixel', 'https://news.example.com/story', 'image')).toBe(true);
  });

  // A subdomain is the same site, as a cookie scoped to the site would be.
  it('is not, for a subdomain of the same site', () => {
    expect(isThirdParty('https://cdn.example.com/app.js', 'https://www.example.com/', 'script')).toBe(false);
  });

  it('is not, for the page itself navigating somewhere', () => {
    expect(isThirdParty('https://elsewhere.example.org/', 'https://news.example.com/', 'mainFrame')).toBe(false);
  });

  // Without a page to compare against, guessing would break a sign-in.
  it('is not, when there is no page to compare against', () => {
    expect(isThirdParty('https://tracker.example.net/', undefined, 'xhr')).toBe(false);
    expect(isThirdParty('https://tracker.example.net/', 'copacetic://start', 'xhr')).toBe(false);
  });
});

describe('removing a header', () => {
  it('removes it whatever case it arrived in, and nothing else', () => {
    expect(withoutHeader({ cookie: 'a=1', COOKIE: 'b=2', Accept: '*/*' }, 'Cookie')).toEqual({ Accept: '*/*' });
  });
});
