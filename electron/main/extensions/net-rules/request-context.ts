// Utils
import { hostOf, registrableDomainOf } from '../../../shared/browsing/url';
import { REQUEST_METHODS, type RequestMethod, type ResourceType } from './rule';

// Types
import type { NetRequest } from './rule-index';

/** A request as the network hands it over, with where it came from. */
export interface RequestContext {
  request: NetRequest;
  /** The page it belongs to, which keeps allow-everything and the blocked count per page. */
  webContentsId: number | null;
  /** Made by an extension, which no extension's rules may change. */
  isFromExtension: boolean;
}

/** The parts of Electron's request details the rules are matched on. */
export interface RequestDetails {
  url: string;
  method: string;
  resourceType: string;
  webContentsId?: number;
  initiatorOrigin?: string;
  webContents?: { getURL(): string };
}

// Electron's names for what a request is for, as Chrome's rules spell them.
const RESOURCE_TYPES: Record<string, ResourceType> = {
  mainFrame: 'main_frame',
  subFrame: 'sub_frame',
  stylesheet: 'stylesheet',
  script: 'script',
  image: 'image',
  font: 'font',
  object: 'object',
  xhr: 'xmlhttprequest',
  ping: 'ping',
  cspReport: 'csp_report',
  media: 'media',
  webSocket: 'websocket',
  other: 'other',
};

// A name and password before the host would let a rule anchored at a domain match the name instead.
function withoutCredentials(url: string): URL | null {
  try {
    const parsed = new URL(url);
    parsed.username = '';
    parsed.password = '';
    return parsed;
  } catch {
    return null;
  }
}

/** A request as the rules see it, or null for one with no address they could match. */
export function requestContextFrom(details: RequestDetails): RequestContext | null {
  const parsed = withoutCredentials(details.url);
  if (!parsed) {
    return null;
  }
  const resourceType = RESOURCE_TYPES[details.resourceType] ?? 'other';
  const lowered = details.method.toLowerCase();
  const method: RequestMethod = REQUEST_METHODS.find((candidate) => candidate === lowered) ?? 'other';
  // A page loaded from the address bar has no page that asked for it; anything a page loads was asked for by that page.
  const asker =
    details.initiatorOrigin ?? (resourceType === 'main_frame' ? undefined : details.webContents?.getURL());
  const initiatorHost = (asker && hostOf(asker)) || null;
  const host = parsed.hostname;
  const isThirdParty = initiatorHost !== null && registrableDomainOf(host) !== registrableDomainOf(initiatorHost);
  return {
    request: {
      url: parsed.href,
      host,
      method,
      resourceType,
      initiatorHost,
      tabId: details.webContentsId ?? -1,
      isThirdParty,
    },
    webContentsId: details.webContentsId ?? null,
    isFromExtension:
      details.url.startsWith('chrome-extension://') || (asker?.startsWith('chrome-extension://') ?? false),
  };
}
