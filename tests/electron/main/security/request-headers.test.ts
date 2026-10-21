import { describe, expect, it } from 'vitest';
import { installRequestHeaders } from '../../../../electron/main/security/request-headers';

type Listener = (details: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => void;

/** A session that keeps the listeners it is given, and a way to run a request through them. */
function fakeSession(blockedSites: string[] = ['example.com']) {
  const listeners: Record<string, Listener> = {};
  const session = {
    webRequest: {
      onBeforeSendHeaders: (listener: Listener) => (listeners.request = listener),
      onHeadersReceived: (listener: Listener) => (listeners.response = listener),
    },
  };
  installRequestHeaders(session as never, {
    clientHints: { 'Sec-CH-UA-Platform': '"macOS"' },
    blocksThirdPartyCookiesOn: (site) => blockedSites.includes(site),
  });
  const page = (url: string) => ({ getURL: () => url });
  const run = (listener: Listener, details: Record<string, unknown>) => {
    let result: Record<string, unknown> = {};
    listener(details, (answer) => (result = answer));
    return result;
  };
  return {
    request: (url: string, pageUrl: string, resourceType = 'image') =>
      run(listeners.request!, {
        url,
        resourceType,
        webContents: page(pageUrl),
        requestHeaders: { Cookie: 'id=123', Accept: '*/*' },
      }).requestHeaders as Record<string, string>,
    response: (
      url: string,
      pageUrl: string,
      resourceType = 'image',
      responseHeaders: Record<string, string[]> = { 'set-cookie': ['id=123'], 'content-type': ['image/png'] },
    ) =>
      run(listeners.response!, { url, resourceType, webContents: page(pageUrl), responseHeaders })
        .responseHeaders as Record<string, string[]>,
    // As a service worker's request arrives: no page, only the origin that made it.
    fromWorker: (url: string, initiatorOrigin: string) =>
      run(listeners.request!, {
        url,
        resourceType: 'xhr',
        initiatorOrigin,
        requestHeaders: { Cookie: 'id=123' },
      }).requestHeaders as Record<string, string>,
  };
}

describe('a third-party request from a page that blocks them', () => {
  it('goes without its cookie', () => {
    const headers = fakeSession().request('https://tracker.example.net/pixel', 'https://news.example.com/story');
    expect(headers).not.toHaveProperty('Cookie');
    expect(headers.Accept).toBe('*/*');
  });

  it('cannot set one', () => {
    const headers = fakeSession().response('https://tracker.example.net/pixel', 'https://news.example.com/story');
    expect(headers).not.toHaveProperty('set-cookie');
    expect(headers['content-type']).toEqual(['image/png']);
  });
});

describe("a service worker's request", () => {
  it('goes without its cookie to another site, judged by the origin that made it', () => {
    expect(
      fakeSession().fromWorker('https://tracker.example.net/pixel', 'https://news.example.com'),
    ).not.toHaveProperty('Cookie');
  });

  it("keeps the cookie for the worker's own site", () => {
    expect(fakeSession().fromWorker('https://api.example.com/feed', 'https://news.example.com').Cookie).toBe(
      'id=123',
    );
  });
});

describe('what it leaves alone', () => {
  it('keeps the cookie for the page’s own site', () => {
    expect(fakeSession().request('https://static.example.com/a.png', 'https://news.example.com/').Cookie).toBe(
      'id=123',
    );
  });

  it('keeps the cookie on the page itself navigating', () => {
    expect(fakeSession().request('https://other.example.org/', 'https://news.example.com/', 'mainFrame').Cookie).toBe(
      'id=123',
    );
  });

  // The site's tracker exception: a page whose sign-in needs them gets them.
  it('keeps the cookie on a page whose site is let off', () => {
    const headers = fakeSession([]).request('https://tracker.example.net/pixel', 'https://news.example.com/');
    expect(headers.Cookie).toBe('id=123');
  });

  // Sharing the one listener must not cost the client hints it used to have to itself.
  it('still sends the client hints, to secure origins only', () => {
    const session = fakeSession();
    expect(
      session.request('https://static.example.com/a.png', 'https://news.example.com/')['Sec-CH-UA-Platform'],
    ).toBe('"macOS"');
    expect(session.request('http://static.example.com/a.png', 'https://news.example.com/')).not.toHaveProperty(
      'Sec-CH-UA-Platform',
    );
  });
});
