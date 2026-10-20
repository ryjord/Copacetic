// Utils
import { hostOf, registrableDomainOf } from '../browsing/url';

// Types
import type { Settings } from '../types';

/** The settings kept per site, which a site's reset forgets and its undo puts back. */
export type SiteKeys = Pick<Settings, 'permissionDecisions' | 'zoomLevels' | 'blockerAllowlist' | 'openRules'>;

/** The site an origin belongs to, so a subdomain is listed with the site rather than as a stranger. */
export function siteOfOrigin(origin: string): string {
  const host = hostOf(origin);
  return registrableDomainOf(host) ?? (host || origin);
}

// The kind never holds a bar and the origin might, so the key is split at the last one.
function originOfDecision(key: string): string {
  return key.slice(0, key.lastIndexOf('|'));
}

/** The patch that forgets everything kept about one site, and nothing about any other. */
export function withoutSite(settings: SiteKeys, site: string): SiteKeys {
  return {
    permissionDecisions: Object.fromEntries(
      Object.entries(settings.permissionDecisions).filter(([key]) => siteOfOrigin(originOfDecision(key)) !== site),
    ),
    zoomLevels: Object.fromEntries(
      Object.entries(settings.zoomLevels).filter(([origin]) => siteOfOrigin(origin) !== site),
    ),
    blockerAllowlist: settings.blockerAllowlist.filter((entry) => entry !== site),
    openRules: Object.fromEntries(Object.entries(settings.openRules).filter(([key]) => key !== site)),
  };
}

/**
 * What was kept about one site put back over what is kept now, so an undo
 * restores that site without undoing anything changed elsewhere since.
 */
export function withSiteRestored(current: SiteKeys, before: SiteKeys, site: string): SiteKeys {
  const ofSite = (key: string) => siteOfOrigin(key) === site;
  return {
    permissionDecisions: {
      ...current.permissionDecisions,
      ...Object.fromEntries(
        Object.entries(before.permissionDecisions).filter(([key]) => ofSite(originOfDecision(key))),
      ),
    },
    zoomLevels: {
      ...current.zoomLevels,
      ...Object.fromEntries(Object.entries(before.zoomLevels).filter(([origin]) => ofSite(origin))),
    },
    blockerAllowlist: [
      ...current.blockerAllowlist.filter((entry) => entry !== site),
      ...before.blockerAllowlist.filter((entry) => entry === site),
    ],
    openRules: {
      ...current.openRules,
      ...Object.fromEntries(Object.entries(before.openRules).filter(([key]) => key === site)),
    },
  };
}
