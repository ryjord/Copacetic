import type { Session } from 'electron';
import { isThirdParty, pageSiteOf, withoutHeader } from '../../shared/browsing/third-party';

interface RequestHeaderRules {
  /** What this browser says about itself, sent to secure origins only, as Chrome does. */
  clientHints: Record<string, string>;
  /** Whether a page on this site keeps third-party cookies from reaching or being set. */
  blocksThirdPartyCookiesOn: (site: string) => boolean;
  /** Whether pages are told passkeys and security keys are unavailable, where there is no dialog to answer them. */
  refusesWebAuthn: boolean;
}

// Last, so it wins over the site's own value for these two when Chromium merges the header's lines.
const REFUSE_WEBAUTHN = 'publickey-credentials-get=(), publickey-credentials-create=()';

/** The response headers with WebAuthn refused, keeping whatever policy the site set for everything else. */
export function withWebAuthnRefused(headers: Record<string, string[]>): Record<string, string[]> {
  const existing = Object.entries(headers).find(([key]) => key.toLowerCase() === 'permissions-policy');
  return {
    ...withoutHeader(headers, 'Permissions-Policy'),
    'Permissions-Policy': [...(existing?.[1] ?? []), REFUSE_WEBAUTHN],
  };
}

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
    callback({ requestHeaders: headers });
  });

  session.webRequest.onHeadersReceived((details, callback) => {
    let headers = details.responseHeaders;
    if (headers && isBlockedThirdParty(details.url, pageOf(details), details.resourceType)) {
      headers = withoutHeader(headers, 'Set-Cookie');
    }
    const isDocument = details.resourceType === 'mainFrame' || details.resourceType === 'subFrame';
    if (headers && isDocument && rules.refusesWebAuthn) {
      headers = withWebAuthnRefused(headers);
    }
    callback({ responseHeaders: headers });
  });
}
