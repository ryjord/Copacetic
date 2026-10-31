// Types
import type { WebContents } from 'electron';

/** What a tab needs to give an extension's own page the API its popup has: the preload, and the bridge. */
export interface ExtensionPageHost {
  preload: string;
  wire(contents: WebContents): void;
}

/** Every extension loaded somewhere in the app, so the tab guards can let its own pages open and nothing else's. */
const loaded = new Map<string, ExtensionPageHost | null>();

export function markLoaded(id: string, host: ExtensionPageHost | null = null): void {
  loaded.set(id, host);
}

export function markUnloaded(id: string): void {
  loaded.delete(id);
}

const EXTENSION_PAGE = /^chrome-extension:\/\/([a-p]{32})\//;

/**
 * Whether an address is a page of an extension that is loaded now.
 *
 * Only the scheme and id are checked here. Which of its files a website may
 * open is the extension's own `web_accessible_resources`, and Chromium holds
 * every navigation to that.
 */
export function isLoadedExtensionPage(url: string): boolean {
  const id = EXTENSION_PAGE.exec(url)?.[1];
  return id !== undefined && loaded.has(id);
}

/** The extension an address is the page of, with what its tab needs; null for any other address. */
export function extensionPageOf(url: string): { id: string; host: ExtensionPageHost } | null {
  const id = EXTENSION_PAGE.exec(url)?.[1];
  const host = id === undefined ? null : loaded.get(id);
  return id !== undefined && host ? { id, host } : null;
}

/** Whether an address stays within that extension's own pages, where its preload may go on running. */
export function isOwnPage(extensionId: string, url: string): boolean {
  return url === 'about:blank' || EXTENSION_PAGE.exec(url)?.[1] === extensionId;
}
