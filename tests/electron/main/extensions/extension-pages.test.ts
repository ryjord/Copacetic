import { afterEach, describe, expect, it } from 'vitest';
import {
  extensionPageOf,
  isLoadedExtensionPage,
  isOwnPage,
  markLoaded,
  markUnloaded,
} from '../../../../electron/main/extensions/extension-pages';

const ID = 'a'.repeat(32);
const OTHER = 'b'.repeat(32);
const host = { preload: '/app/dist/electron/preload/extensions/page.js', wire: () => {} };
const otherHost = { preload: '/app/dist/electron/preload/extensions/page.js', wire: () => {} };
// Stand-ins for two profiles' sessions; only their identity matters here.
const SESSION = {};
const OTHER_SESSION = {};

afterEach(() => {
  [SESSION, OTHER_SESSION].forEach((where) => {
    markUnloaded(ID, where);
    markUnloaded(OTHER, where);
  });
});

describe("an extension's own pages", () => {
  it('are known only while the extension is loaded', () => {
    expect(isLoadedExtensionPage(`chrome-extension://${ID}/options.html`)).toBe(false);
    markLoaded(ID, SESSION, host);
    expect(isLoadedExtensionPage(`chrome-extension://${ID}/options.html`)).toBe(true);
    markUnloaded(ID, SESSION);
    expect(isLoadedExtensionPage(`chrome-extension://${ID}/options.html`)).toBe(false);
  });

  // A tab gets the preload only for an address that is the page of a loaded extension that has a host to give it.
  it('hand a tab the preload only for that extension, and never for a website', () => {
    markLoaded(ID, SESSION, host);
    markLoaded(OTHER, SESSION);
    expect(extensionPageOf(`chrome-extension://${ID}/dashboard.html`, SESSION)).toEqual({ id: ID, host });
    expect(extensionPageOf(`chrome-extension://${OTHER}/options.html`, SESSION)).toBeNull();
    expect(extensionPageOf('https://example.com/', SESSION)).toBeNull();
    expect(extensionPageOf(`https://example.com/chrome-extension://${ID}/`, SESSION)).toBeNull();
  });

  // Two profiles with the same extension each wire its page to their own host, with their own data.
  it("wire a page to its own profile's host, and keep the other's when one profile removes it", () => {
    markLoaded(ID, SESSION, host);
    markLoaded(ID, OTHER_SESSION, otherHost);
    expect(extensionPageOf(`chrome-extension://${ID}/options.html`, SESSION)?.host).toBe(host);
    expect(extensionPageOf(`chrome-extension://${ID}/options.html`, OTHER_SESSION)?.host).toBe(otherHost);
    markUnloaded(ID, OTHER_SESSION);
    expect(extensionPageOf(`chrome-extension://${ID}/options.html`, SESSION)?.host).toBe(host);
    expect(isLoadedExtensionPage(`chrome-extension://${ID}/options.html`)).toBe(true);
  });

  // Where a view with the preload may go on: its own pages, and the empty one a view is primed with.
  it("keep a view with the preload to that extension's pages", () => {
    expect(isOwnPage(ID, `chrome-extension://${ID}/logger.html#tab=1`)).toBe(true);
    expect(isOwnPage(ID, 'about:blank')).toBe(true);
    expect(isOwnPage(ID, `chrome-extension://${OTHER}/options.html`)).toBe(false);
    expect(isOwnPage(ID, 'https://example.com/')).toBe(false);
  });
});
