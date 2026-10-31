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

afterEach(() => {
  markUnloaded(ID);
  markUnloaded(OTHER);
});

describe("an extension's own pages", () => {
  it('are known only while the extension is loaded', () => {
    expect(isLoadedExtensionPage(`chrome-extension://${ID}/options.html`)).toBe(false);
    markLoaded(ID, host);
    expect(isLoadedExtensionPage(`chrome-extension://${ID}/options.html`)).toBe(true);
    markUnloaded(ID);
    expect(isLoadedExtensionPage(`chrome-extension://${ID}/options.html`)).toBe(false);
  });

  // A tab gets the preload only for an address that is the page of a loaded extension that has a host to give it.
  it('hand a tab the preload only for that extension, and never for a website', () => {
    markLoaded(ID, host);
    markLoaded(OTHER);
    expect(extensionPageOf(`chrome-extension://${ID}/dashboard.html`)).toEqual({ id: ID, host });
    expect(extensionPageOf(`chrome-extension://${OTHER}/options.html`)).toBeNull();
    expect(extensionPageOf('https://example.com/')).toBeNull();
    expect(extensionPageOf(`https://example.com/chrome-extension://${ID}/`)).toBeNull();
  });

  // Where a view with the preload may go on: its own pages, and the empty one a view is primed with.
  it("keep a view with the preload to that extension's pages", () => {
    expect(isOwnPage(ID, `chrome-extension://${ID}/logger.html#tab=1`)).toBe(true);
    expect(isOwnPage(ID, 'about:blank')).toBe(true);
    expect(isOwnPage(ID, `chrome-extension://${OTHER}/options.html`)).toBe(false);
    expect(isOwnPage(ID, 'https://example.com/')).toBe(false);
  });
});
