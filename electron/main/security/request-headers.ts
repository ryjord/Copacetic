import type { Session } from 'electron';
import { isThirdParty, pageSiteOf, withoutHeader } from '../../shared/browsing/third-party';

interface RequestHeaderRules {
  /** What this browser says about itself, sent to secure origins only, as Chrome does. */
  clientHints: Record<string, string>;
  /** Whether a page on this site keeps third-party cookies from reaching or being set. */
  blocksThirdPartyCookiesOn: (site: string) => boolean;
}

/**
 * Everything this browser changes in a session's requests and responses, in one place.
 *
 * Electron keeps one listener per event per session, and a second registration
 * replaces the first without a word, so anything else that needs to change a
 * header joins these rather than registering its own.
 */
export function installRequestHeaders(session: Session, rules: RequestHeaderRules): void {
  const isBlockedThirdParty = (url: string, pageUrl: string | undefined, resourceType: string) => {
    const site = pageUrl ? pageSiteOf(pageUrl) : null;
    return site !== null && isThirdParty(url, pageUrl, resourceType) && rules.blocksThirdPartyCookiesOn(site);
  };

  session.webRequest.onBeforeSendHeaders((details, callback) => {
    let headers = details.url.startsWith('https://')
      ? { ...details.requestHeaders, ...rules.clientHints }
      : details.requestHeaders;
    if (isBlockedThirdParty(details.url, details.webContents?.getURL(), details.resourceType)) {
      headers = withoutHeader(headers, 'Cookie');
    }
    callback({ requestHeaders: headers });
  });

  session.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders;
    if (headers && isBlockedThirdParty(details.url, details.webContents?.getURL(), details.resourceType)) {
      callback({ responseHeaders: withoutHeader(headers, 'Set-Cookie') });
      return;
    }
    callback({ responseHeaders: headers });
  });
}
