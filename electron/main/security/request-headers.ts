// Utils
import { isThirdParty, pageSiteOf, withoutHeader } from '../../shared/browsing/third-party';
import { applyHeaderChanges } from '../extensions/net-rules/outcome';

// Types
import type { Session } from 'electron';
import type { HeaderChange } from '../extensions/net-rules/rule';
import type { RequestDetails } from '../extensions/net-rules/request-context';

interface RequestHeaderRules {
  /** What this browser says about itself, sent to secure origins only, as Chrome does. */
  clientHints: Record<string, string>;
  /** Whether a page on this site keeps third-party cookies from reaching or being set. */
  blocksThirdPartyCookiesOn: (site: string) => boolean;
  /** What extensions' header rules change, where extensions run; absent in Hush. */
  extensionHeaderChanges?: (details: RequestDetails, stage: 'request' | 'response') => HeaderChange[];
}

const asLists = (headers: Record<string, string>) =>
  Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, [value]]));
// A request carries each header once, so a header appended to is joined as Chrome sends it.
const asSingles = (headers: Record<string, string[]>) =>
  Object.fromEntries(Object.entries(headers).map(([name, values]) => [name, values.join(', ')]));

/**
 * Everything this browser changes in a session's requests and responses, in one place.
 *
 * Electron keeps one listener per event per session, and a second registration
 * replaces the first without a word, so anything else that needs to change a
 * header joins these rather than registering its own.
 */
export function installRequestHeaders(session: Session, rules: RequestHeaderRules): void {
  // A service worker's request has no page, so the site it belongs to is the one that started it.
  const pageOf = (details: { webContents?: Electron.WebContents; initiatorOrigin?: string }) =>
    details.webContents?.getURL() || details.initiatorOrigin;
  const isBlockedThirdParty = (url: string, pageUrl: string | undefined, resourceType: string) => {
    const site = pageUrl ? pageSiteOf(pageUrl) : null;
    return site !== null && isThirdParty(url, pageUrl, resourceType) && rules.blocksThirdPartyCookiesOn(site);
  };

  session.webRequest.onBeforeSendHeaders((details, callback) => {
    let headers = details.url.startsWith('https://')
      ? { ...details.requestHeaders, ...rules.clientHints }
      : details.requestHeaders;
    if (isBlockedThirdParty(details.url, pageOf(details), details.resourceType)) {
      headers = withoutHeader(headers, 'Cookie');
    }
    const changes = rules.extensionHeaderChanges?.(details, 'request') ?? [];
    if (changes.length > 0) {
      headers = asSingles(applyHeaderChanges(asLists(headers), changes));
    }
    callback({ requestHeaders: headers });
  });

  session.webRequest.onHeadersReceived((details, callback) => {
    let headers = details.responseHeaders;
    if (headers && isBlockedThirdParty(details.url, pageOf(details), details.resourceType)) {
      headers = withoutHeader(headers, 'Set-Cookie');
    }
    const changes = rules.extensionHeaderChanges?.(details, 'response') ?? [];
    if (headers && changes.length > 0) {
      headers = applyHeaderChanges(headers, changes);
    }
    callback({ responseHeaders: headers });
  });
}
