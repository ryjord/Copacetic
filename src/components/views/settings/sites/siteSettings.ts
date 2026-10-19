// Types
import { PERMISSION_LABELS, type PermissionDecision, type PermissionKind, type Settings } from '@shared/types';
import { hostOf, registrableDomainOf } from '@shared/url';

export interface SitePermission {
  origin: string;
  kind: PermissionKind;
  decision: PermissionDecision;
}

/** Everything kept about one site, gathered from the three places it is kept. */
export interface SiteSettings {
  site: string;
  permissions: SitePermission[];
  zoomLevels: { origin: string; zoomFactor: number }[];
  allowsTrackers: boolean;
}

type SiteKeys = Pick<Settings, 'permissionDecisions' | 'zoomLevels' | 'blockerAllowlist'>;

/** What each permission is called in a list of them, where the full sentence would not fit. */
export const PERMISSION_NAMES: Record<PermissionKind, string> = {
  geolocation: 'Location',
  notifications: 'Notifications',
  media: 'Camera and microphone',
  'clipboard-read': 'Clipboard',
  'display-capture': 'Screen recording',
  midi: 'MIDI devices',
  pointerLock: 'Pointer lock',
  fullscreen: 'Fullscreen',
  openExternal: 'Opening other apps',
};

/** The site an origin belongs to, so a subdomain is listed with the site rather than as a stranger. */
export function siteOf(origin: string): string {
  const host = hostOf(origin);
  return registrableDomainOf(host) ?? (host || origin);
}

function permissionsFrom(decisions: SiteKeys['permissionDecisions']): SitePermission[] {
  return Object.entries(decisions)
    .map(([key, decision]) => {
      // The kind never holds a bar and the origin might, so the key is split at the last one.
      const separator = key.lastIndexOf('|');
      return { origin: key.slice(0, separator), kind: key.slice(separator + 1), decision };
    })
    .filter((entry): entry is SitePermission => entry.origin !== '' && entry.kind in PERMISSION_LABELS);
}

/** Every site something is kept about, alphabetically, with what is kept. */
export function sitesFrom(settings: SiteKeys): SiteSettings[] {
  const bySite = new Map<string, SiteSettings>();
  const entryFor = (site: string) => {
    const existing = bySite.get(site);
    if (existing) {
      return existing;
    }
    const fresh: SiteSettings = { site, permissions: [], zoomLevels: [], allowsTrackers: false };
    bySite.set(site, fresh);
    return fresh;
  };

  permissionsFrom(settings.permissionDecisions).forEach((permission) =>
    entryFor(siteOf(permission.origin)).permissions.push(permission),
  );
  Object.entries(settings.zoomLevels).forEach(([origin, zoomFactor]) =>
    entryFor(siteOf(origin)).zoomLevels.push({ origin, zoomFactor }),
  );
  // Kept by site already, which is what the blocker matches against.
  settings.blockerAllowlist.forEach((site) => {
    entryFor(site).allowsTrackers = true;
  });

  return [...bySite.values()].sort((aSite, bSite) => aSite.site.localeCompare(bSite.site));
}

/** The patch that forgets everything kept about one site, and nothing about any other. */
export function withoutSite(settings: SiteKeys, site: string): SiteKeys {
  return {
    permissionDecisions: Object.fromEntries(
      Object.entries(settings.permissionDecisions).filter(
        ([key]) => siteOf(key.slice(0, key.lastIndexOf('|'))) !== site,
      ),
    ),
    zoomLevels: Object.fromEntries(Object.entries(settings.zoomLevels).filter(([origin]) => siteOf(origin) !== site)),
    blockerAllowlist: settings.blockerAllowlist.filter((entry) => entry !== site),
  };
}

/** One line saying what is kept, for a row that has room for one. */
export function summaryOf(site: SiteSettings): string {
  const parts = [
    ...site.permissions.map(
      (permission) =>
        `${PERMISSION_NAMES[permission.kind]} ${permission.decision === 'allow' ? 'allowed' : 'blocked'}`,
    ),
    ...site.zoomLevels.map((zoom) => `Zoom ${Math.round(zoom.zoomFactor * 100)}%`),
    ...(site.allowsTrackers ? ['Trackers allowed'] : []),
  ];
  return parts.join(' · ');
}
