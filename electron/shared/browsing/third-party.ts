import { hostOf, registrableDomainOf } from './url';

/** The site an address belongs to, or null for one with no site to compare, such as an internal page. */
function siteOf(url: string): string | null {
  const host = hostOf(url);
  return host ? registrableDomainOf(host) : null;
}

/**
 * Whether a request is to a site other than the page that made it.
 *
 * A navigation of the page itself is never third-party: it is where the person
 * is going. Anything without a page to compare against is left alone rather
 * than guessed at, because a wrong guess breaks a sign-in.
 */
export function isThirdParty(requestUrl: string, pageUrl: string | undefined, resourceType: string): boolean {
  if (resourceType === 'mainFrame' || !pageUrl) {
    return false;
  }
  const requestSite = siteOf(requestUrl);
  const pageSite = siteOf(pageUrl);
  return requestSite !== null && pageSite !== null && requestSite !== pageSite;
}

/** The site of the page, for asking whether it has been let off. */
export function pageSiteOf(pageUrl: string): string | null {
  return siteOf(pageUrl);
}

/** A copy of the headers without the one named, whatever case it arrived in. */
export function withoutHeader<Value>(headers: Record<string, Value>, name: string): Record<string, Value> {
  const lower = name.toLowerCase();
  return Object.fromEntries(Object.entries(headers).filter(([key]) => key.toLowerCase() !== lower));
}
