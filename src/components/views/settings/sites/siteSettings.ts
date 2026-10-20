// Utils
import { t } from '@shared/i18n/translate';

// Types
import { PERMISSION_LABELS, type PermissionDecision, type PermissionKind } from '@shared/types';
import { siteOfOrigin, type SiteKeys } from '@shared/data/site-settings';
import type { OpenTarget } from '@shared/tabs/open-rules';

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
  opensIn: OpenTarget | null;
}

/** What each permission is called in a list of them, where the full sentence would not fit. */
export const PERMISSION_NAMES: Record<PermissionKind, string> = {
  geolocation: t('settings.sites.permissions.geolocation'),
  notifications: t('settings.sites.permissions.notifications'),
  media: t('settings.sites.permissions.media'),
  'clipboard-read': t('settings.sites.permissions.clipboardRead'),
  'display-capture': t('settings.sites.permissions.displayCapture'),
  midi: t('settings.sites.permissions.midi'),
  pointerLock: t('settings.sites.permissions.pointerLock'),
  fullscreen: t('settings.sites.permissions.fullscreen'),
  openExternal: t('settings.sites.permissions.openExternal'),
};

/** What someone typed as a site, as the origin decisions are kept under; null when it is not a web address. */
export function originFromInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.includes('.') ? url.origin : null;
  } catch {
    return null;
  }
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
    const fresh: SiteSettings = { site, permissions: [], zoomLevels: [], allowsTrackers: false, opensIn: null };
    bySite.set(site, fresh);
    return fresh;
  };

  permissionsFrom(settings.permissionDecisions).forEach((permission) =>
    entryFor(siteOfOrigin(permission.origin)).permissions.push(permission),
  );
  Object.entries(settings.zoomLevels).forEach(([origin, zoomFactor]) =>
    entryFor(siteOfOrigin(origin)).zoomLevels.push({ origin, zoomFactor }),
  );
  // Kept by site already, which is what the blocker matches against.
  settings.blockerAllowlist.forEach((site) => {
    entryFor(site).allowsTrackers = true;
  });
  Object.entries(settings.openRules).forEach(([site, target]) => {
    entryFor(site).opensIn = target;
  });

  return [...bySite.values()].sort((aSite, bSite) => aSite.site.localeCompare(bSite.site));
}

/** How many sites have each answer for one kind, so a default can be read against what it leaves alone. */
export function answersFor(sites: SiteSettings[], kind: PermissionKind): { allowed: number; blocked: number } {
  const decisions = sites.map((site) => site.permissions.find((permission) => permission.kind === kind)?.decision);
  return {
    allowed: decisions.filter((decision) => decision === 'allow').length,
    blocked: decisions.filter((decision) => decision === 'deny').length,
  };
}

/** One line for a kind's row: what the default means, and the sites that answered for themselves. */
export function describeDefault(
  answers: { allowed: number; blocked: number },
  isBlocking: boolean,
): string | undefined {
  const parts = [
    ...(isBlocking ? [t('settings.sites.summary.refused')] : []),
    ...(answers.allowed > 0
      ? [t('settings.sites.summary.allowedOn', { sites: t('settings.sites.siteCount', { count: answers.allowed }) })]
      : []),
    ...(answers.blocked > 0
      ? [t('settings.sites.summary.blockedOn', { sites: t('settings.sites.siteCount', { count: answers.blocked }) })]
      : []),
  ];
  if (parts.length === 0) {
    return undefined;
  }
  const sentence = parts.join(', ');
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

/** One line saying what is kept, for a row that has room for one. */
export function summaryOf(site: SiteSettings): string {
  const parts = [
    ...site.permissions.map((permission) =>
      t(
        permission.decision === 'allow'
          ? 'settings.sites.summary.permissionAllowed'
          : 'settings.sites.summary.permissionBlocked',
        { permission: PERMISSION_NAMES[permission.kind] },
      ),
    ),
    ...site.zoomLevels.map((zoom) =>
      t('settings.sites.summary.zoom', { percent: Math.round(zoom.zoomFactor * 100) }),
    ),
    ...(site.allowsTrackers ? [t('settings.sites.trackersAllowed')] : []),
    ...(site.opensIn === 'hush' ? [t('settings.sites.summary.opensInHush')] : []),
  ];
  return parts.join(' · ');
}
