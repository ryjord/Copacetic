/** Every extension loaded somewhere in the app, so the tab guards can let its own pages open and nothing else's. */
const loaded = new Set<string>();

export function markLoaded(id: string): void {
  loaded.add(id);
}

export function markUnloaded(id: string): void {
  loaded.delete(id);
}

/**
 * Whether an address is a page of an extension that is loaded now.
 *
 * Only the scheme and id are checked here. Which of its files a website may
 * open is the extension's own `web_accessible_resources`, and Chromium holds
 * every navigation to that.
 */
export function isLoadedExtensionPage(url: string): boolean {
  const match = /^chrome-extension:\/\/([a-p]{32})\//.exec(url);
  return match !== null && loaded.has(match[1] ?? '');
}
