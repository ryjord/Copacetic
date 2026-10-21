import { describe, expect, it } from 'vitest';
import { requestContextFrom } from '../../../../../electron/main/extensions/net-rules/request-context';

const page = (url: string) => ({ getURL: () => url });

describe('a request as the rules see it', () => {
  it('names what it is for and how it was asked for as Chrome does', () => {
    const context = requestContextFrom({
      url: 'https://ads.tracker.example/p.js',
      method: 'GET',
      resourceType: 'script',
      webContentsId: 12,
      webContents: page('https://news.example.org/story'),
    });
    expect(context?.request).toEqual({
      url: 'https://ads.tracker.example/p.js',
      host: 'ads.tracker.example',
      method: 'get',
      resourceType: 'script',
      initiatorHost: 'news.example.org',
      tabId: 12,
      isThirdParty: true,
    });
    expect(context?.webContentsId).toBe(12);
  });

  it.each([
    ['xhr', 'xmlhttprequest'],
    ['mainFrame', 'main_frame'],
    ['webSocket', 'websocket'],
    ['cspReport', 'csp_report'],
    ['somethingNew', 'other'],
  ])('reads %s as %s', (electronType, chromeType) => {
    expect(
      requestContextFrom({ url: 'https://a.example/', method: 'GET', resourceType: electronType })?.request
        .resourceType,
    ).toBe(chromeType);
  });

  // A name before the host would let a rule anchored at tracker.example match the name instead of the site.
  it('drops a name and password from the address before matching it', () => {
    const context = requestContextFrom({
      url: 'https://tracker.example@good.example/',
      method: 'GET',
      resourceType: 'image',
    });
    expect(context?.request.url).toBe('https://good.example/');
    expect(context?.request.host).toBe('good.example');
  });

  it('gives a typed address no page that asked for it', () => {
    const context = requestContextFrom({
      url: 'https://news.example.org/',
      method: 'GET',
      resourceType: 'mainFrame',
      webContentsId: 3,
      webContents: page('https://previous.example/'),
    });
    expect(context?.request.initiatorHost).toBeNull();
  });

  it('counts a request on the same site as the page as first-party', () => {
    const context = requestContextFrom({
      url: 'https://static.example.org/a.css',
      method: 'GET',
      resourceType: 'stylesheet',
      initiatorOrigin: 'https://www.example.org',
    });
    expect(context?.request.isThirdParty).toBe(false);
  });

  // An extension's own requests are its business; no other extension's rules may change them.
  it('knows a request an extension made', () => {
    expect(
      requestContextFrom({
        url: 'https://api.example/',
        method: 'POST',
        resourceType: 'xhr',
        initiatorOrigin: `chrome-extension://${'a'.repeat(32)}`,
      })?.isFromExtension,
    ).toBe(true);
  });
});
