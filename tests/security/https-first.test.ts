import { describe, expect, it } from 'vitest';
import { HttpsFirst } from '../../electron/main/security/https-first';

const page = (url: string, webContentsId = 1) => ({ url, method: 'GET', resourceType: 'mainFrame', webContentsId });

describe('upgrading a page to HTTPS', () => {
  it('upgrades a page reached by any route, not only a typed one', () => {
    expect(new HttpsFirst(true).upgradeFor(page('http://example.com/a?b=1'))).toBe('https://example.com/a?b=1');
  });

  it.each([
    ['a subresource', { ...page('http://example.com/x.js'), resourceType: 'script' }],
    ['a form post', { ...page('http://example.com/form'), method: 'POST' }],
    ['a page on your own network', page('http://192.168.1.1/')],
    ['a page already on HTTPS', page('https://example.com/')],
  ])('leaves %s alone', (_label, request) => {
    expect(new HttpsFirst(true).upgradeFor(request)).toBeNull();
  });

  it('does nothing when switched off', () => {
    expect(new HttpsFirst(false).upgradeFor(page('http://example.com/'))).toBeNull();
  });
});

describe('when the HTTPS version does not work', () => {
  it('offers the plain page it was upgraded from', () => {
    const httpsFirst = new HttpsFirst(true);
    httpsFirst.upgradeFor(page('http://plain.example/start'));
    expect(httpsFirst.fallbackFor(1, 'https://plain.example/start')).toBe('http://plain.example/start');
  });

  // A failure Copacetic did not cause gets the ordinary error page, with nothing to offer.
  it('offers nothing for a page it never upgraded', () => {
    expect(new HttpsFirst(true).fallbackFor(1, 'https://example.com/')).toBeNull();
  });

  it('offers nothing in another tab', () => {
    const httpsFirst = new HttpsFirst(true);
    httpsFirst.upgradeFor(page('http://plain.example/', 1));
    expect(httpsFirst.fallbackFor(2, 'https://plain.example/')).toBeNull();
  });

  // Chromium commits its error page with no status; that commit must not erase the way out.
  it('keeps the fallback through the error page committing', () => {
    const httpsFirst = new HttpsFirst(true);
    httpsFirst.upgradeFor(page('http://plain.example/'));
    httpsFirst.committed(1, 0);
    expect(httpsFirst.fallbackFor(1, 'https://plain.example/')).toBe('http://plain.example/');
  });

  it('forgets the upgrade once the HTTPS page has loaded', () => {
    const httpsFirst = new HttpsFirst(true);
    httpsFirst.upgradeFor(page('http://example.com/'));
    httpsFirst.committed(1, 200);
    expect(httpsFirst.fallbackFor(1, 'https://example.com/')).toBeNull();
  });

  it('stops upgrading a host once the person has chosen HTTP', () => {
    const httpsFirst = new HttpsFirst(true);
    expect(httpsFirst.allowPlain('http://plain.example/')).toBe(true);
    expect(httpsFirst.upgradeFor(page('http://plain.example/other'))).toBeNull();
    expect(httpsFirst.allowPlain('https://plain.example/')).toBe(false);
  });
});

describe('a site that sends HTTPS back to HTTP', () => {
  // Upgrading the redirect again would loop until Chromium gave up.
  it('lets the redirect through and stops asking that host', () => {
    const httpsFirst = new HttpsFirst(true);
    expect(httpsFirst.upgradeFor(page('http://downgrades.example/'))).toBe('https://downgrades.example/');
    expect(httpsFirst.upgradeFor(page('http://downgrades.example/'))).toBeNull();
    expect(httpsFirst.upgradeFor(page('http://downgrades.example/later'))).toBeNull();
  });

  it('still upgrades a later visit to a site that worked over HTTPS', () => {
    const httpsFirst = new HttpsFirst(true);
    httpsFirst.upgradeFor(page('http://example.com/'));
    httpsFirst.committed(1, 200);
    expect(httpsFirst.upgradeFor(page('http://example.com/next'))).toBe('https://example.com/next');
  });
});

describe('an address typed without https', () => {
  it('records the upgrade the address bar made, so a failure can offer HTTP', () => {
    const httpsFirst = new HttpsFirst(true);
    expect(httpsFirst.typed(1, 'plain.example', 'https://plain.example/')).toBe('https://plain.example/');
    expect(httpsFirst.fallbackFor(1, 'https://plain.example/')).toBe('http://plain.example/');
  });

  it('records nothing for an address typed with https', () => {
    const httpsFirst = new HttpsFirst(true);
    httpsFirst.typed(1, 'https://example.com', 'https://example.com/');
    expect(httpsFirst.fallbackFor(1, 'https://example.com/')).toBeNull();
  });

  it('goes straight to HTTP for a host the person already chose HTTP for', () => {
    const httpsFirst = new HttpsFirst(true);
    httpsFirst.allowPlain('http://plain.example/');
    expect(httpsFirst.typed(1, 'plain.example', 'https://plain.example/')).toBe('http://plain.example/');
  });
});
