// Libs
import type { ComponentType } from 'react';

// Components
import { AboutPane } from '@/components/views/settings/about/AboutPane';
import { AppearancePane } from '@/components/views/settings/appearance/AppearancePane';
import { DataPane } from '@/components/views/settings/data/DataPane';
import { GeneralPane } from '@/components/views/settings/general/GeneralPane';
import { PasswordsPane } from '@/components/views/settings/passwords/PasswordsPane';
import { PrivacyPane } from '@/components/views/settings/privacy/PrivacyPane';
import { ProfilesPane } from '@/components/views/settings/profiles/ProfilesPane';
import { ShortcutsPane } from '@/components/views/settings/shortcuts/ShortcutsPane';
import { SitesPane } from '@/components/views/settings/sites/SitesPane';
import { TransparencyPane } from '@/components/views/settings/transparency/TransparencyPane';
import { UpdatesPane } from '@/components/views/settings/updates/UpdatesPane';

// Icons
import {
  Database,
  Download,
  Eye,
  Globe,
  Info,
  KeyRound,
  Keyboard,
  type LucideIcon,
  Palette,
  Settings2,
  ShieldCheck,
  Users,
} from 'lucide-react';

// Utils
import { t } from '@shared/i18n/translate';

// Types
import type { SettingsPaneProps } from '@/components/views/settings/shared/types';
import type { Settings } from '@shared/types';

interface SettingsPane {
  id: string;
  label: string;
  icon: LucideIcon;
  Component: ComponentType<SettingsPaneProps>;
  /** What someone might type to find a setting on this pane, in the words they would use. */
  terms: readonly string[];
}

export const SETTINGS_PANES = [
  {
    id: 'general',
    label: t('settings.nav.general'),
    icon: Settings2,
    Component: GeneralPane,
    terms: [
      t('settings.terms.general.reopenTabs'),
      t('settings.terms.general.startup'),
      t('settings.terms.general.searchEngine'),
      t('settings.terms.general.spelling'),
      t('settings.terms.general.spellcheck'),
      t('settings.terms.general.spellingLanguage'),
      t('settings.terms.general.dictionary'),
      t('settings.terms.general.downloads'),
      t('settings.terms.general.downloadFolder'),
      t('settings.terms.general.askWhereToSave'),
      t('settings.terms.general.sleepingTabs'),
      t('settings.terms.general.memory'),
      t('settings.terms.general.defaultBrowser'),
      t('settings.terms.general.homeButton'),
      t('settings.terms.general.homePage'),
      t('settings.terms.general.history'),
      t('settings.terms.general.keepHistory'),
    ],
  },
  {
    id: 'appearance',
    label: t('settings.nav.appearance'),
    icon: Palette,
    Component: AppearancePane,
    terms: [
      t('settings.terms.appearance.light'),
      t('settings.terms.appearance.dark'),
      t('settings.terms.appearance.theme'),
      t('settings.terms.appearance.accent'),
      t('settings.terms.appearance.textSize'),
      t('settings.terms.appearance.toolbar'),
      t('settings.terms.appearance.bookmarksBar'),
      t('settings.terms.appearance.density'),
      t('settings.terms.appearance.startPage'),
      t('settings.terms.appearance.wallpaper'),
      t('settings.terms.appearance.photo'),
      t('settings.terms.appearance.background'),
      t('settings.terms.appearance.colour'),
      t('settings.terms.appearance.clock'),
      t('settings.terms.appearance.widgets'),
    ],
  },
  {
    id: 'privacy',
    label: t('settings.nav.privacy'),
    icon: ShieldCheck,
    Component: PrivacyPane,
    terms: [
      t('settings.terms.privacy.https'),
      t('settings.terms.privacy.secureConnections'),
      t('settings.terms.privacy.trackers'),
      t('settings.terms.privacy.ads'),
      t('settings.terms.privacy.block'),
      t('settings.terms.privacy.filterLists'),
      t('settings.terms.privacy.dns'),
      t('settings.terms.privacy.secureDns'),
      t('settings.terms.privacy.cookies'),
      t('settings.terms.privacy.thirdPartyCookies'),
      t('settings.terms.privacy.webRtc'),
      t('settings.terms.privacy.ipAddress'),
      t('settings.terms.privacy.calls'),
    ],
  },
  {
    id: 'sites',
    label: t('settings.nav.sites'),
    icon: Globe,
    Component: SitesPane,
    terms: [
      t('settings.terms.sites.siteSettings'),
      t('settings.terms.sites.defaultZoom'),
      t('settings.terms.sites.zoom'),
      t('settings.terms.sites.permissions'),
      t('settings.terms.sites.whenASiteAsks'),
      t('settings.terms.sites.blockByDefault'),
      t('settings.terms.sites.camera'),
      t('settings.terms.sites.microphone'),
      t('settings.terms.sites.location'),
      t('settings.terms.sites.notifications'),
      t('settings.terms.sites.siteZoom'),
      t('settings.terms.sites.trackersAllowed'),
      t('settings.terms.sites.exceptions'),
    ],
  },
  {
    id: 'profiles',
    label: t('settings.nav.profiles'),
    icon: Users,
    Component: ProfilesPane,
    terms: [
      t('settings.terms.profiles.profiles'),
      t('settings.terms.profiles.people'),
      t('settings.terms.profiles.addProfile'),
      t('settings.terms.profiles.anotherPerson'),
      t('settings.terms.profiles.workProfile'),
      t('settings.terms.profiles.removeProfile'),
    ],
  },
  {
    id: 'passwords',
    label: t('settings.nav.passwords'),
    icon: KeyRound,
    Component: PasswordsPane,
    terms: [
      t('settings.terms.passwords.passwords'),
      t('settings.terms.passwords.vault'),
      t('settings.terms.passwords.lock'),
      t('settings.terms.passwords.fillPassword'),
      t('settings.terms.passwords.exportPasswords'),
      t('settings.terms.passwords.importPasswords'),
      t('settings.terms.passwords.generate'),
    ],
  },
  {
    id: 'data',
    label: t('settings.nav.data'),
    icon: Database,
    Component: DataPane,
    terms: [
      t('settings.terms.data.clearBrowsingData'),
      t('settings.terms.data.history'),
      t('settings.terms.data.cookies'),
      t('settings.terms.data.cache'),
      t('settings.terms.data.export'),
      t('settings.terms.data.importBookmarks'),
      t('settings.terms.data.importFromChrome'),
      t('settings.terms.data.importHistory'),
    ],
  },
  {
    id: 'shortcuts',
    label: t('settings.nav.shortcuts'),
    icon: Keyboard,
    Component: ShortcutsPane,
    terms: [
      t('settings.terms.shortcuts.keyboard'),
      t('settings.terms.shortcuts.shortcuts'),
      t('settings.terms.shortcuts.keys'),
    ],
  },
  {
    id: 'updates',
    label: t('settings.nav.updates'),
    icon: Download,
    Component: UpdatesPane,
    terms: [
      t('settings.terms.updates.update'),
      t('settings.terms.updates.version'),
      t('settings.terms.updates.checkForUpdates'),
    ],
  },
  {
    id: 'about',
    label: t('settings.nav.about'),
    icon: Info,
    Component: AboutPane,
    terms: [
      t('settings.terms.about.version'),
      t('settings.terms.about.licence'),
      t('settings.terms.about.licences'),
      t('settings.terms.about.openSource'),
      t('settings.terms.about.chromiumLicences'),
      t('settings.terms.about.diagnostics'),
      t('settings.terms.about.log'),
    ],
  },
  {
    id: 'transparency',
    label: t('settings.nav.transparency'),
    icon: Eye,
    Component: TransparencyPane,
    terms: [
      t('settings.terms.transparency.telemetry'),
      t('settings.terms.transparency.tracking'),
      t('settings.terms.transparency.privacyPolicy'),
      t('settings.terms.transparency.data'),
      t('settings.terms.transparency.hush'),
      t('settings.terms.transparency.audit'),
      t('settings.terms.transparency.signed'),
      t('settings.terms.transparency.extensions'),
      t('settings.terms.transparency.netflix'),
    ],
  },
] as const satisfies readonly SettingsPane[];

export type PaneId = (typeof SETTINGS_PANES)[number]['id'];

/** The panes in the order they are shown, under four short headings. */
export const NAV_GROUPS: readonly { label: string; paneIds: readonly PaneId[] }[] = [
  { label: t('settings.navGroups.browser'), paneIds: ['general', 'appearance', 'shortcuts'] },
  { label: t('settings.navGroups.privacy'), paneIds: ['privacy', 'sites', 'passwords'] },
  { label: t('settings.navGroups.you'), paneIds: ['profiles', 'data'] },
  { label: t('settings.navGroups.copacetic'), paneIds: ['updates', 'about', 'transparency'] },
];

/** Panes that are mostly a list, given the room a list needs. */
export const WIDE_PANES: readonly PaneId[] = ['sites', 'passwords', 'shortcuts'];

/** A pane's heading where its name in the list is shortened to fit. */
export const PANE_TITLES: Partial<Record<PaneId, string>> = {
  transparency: t('settings.nav.transparencyTitle'),
};

/** The settings each pane owns, which Reset this page puts back to how Copacetic starts. */
export const PANE_SETTINGS: Partial<Record<PaneId, readonly (keyof Settings)[]>> = {
  general: [
    'restoreTabsOnLaunch',
    'startupUrl',
    'homeUrl',
    'historyRetentionDays',
    'searchEngine',
    'sleepTabsAfterMinutes',
    'spellcheck',
    'spellcheckLanguages',
    'askWhereToSave',
  ],
  appearance: [
    'appearance',
    'accentColour',
    'interfaceTextSize',
    'density',
    'toolbarItems',
    'showBookmarksBar',
    'theme',
    'ambientHue',
    'wallpaperDim',
    'wallpaperBlur',
    'startPageWidgets',
  ],
  privacy: [
    'httpsFirst',
    'blockTrackers',
    'dnsMode',
    'dnsResolverId',
    'blockThirdPartyCookies',
    'hideCookieBanners',
    'cleanLinks',
    'webRtcPolicy',
  ],
  shortcuts: ['shortcutOverrides'],
  updates: ['checkForUpdates', 'updateChannel'],
};

/** Whether a row or group is the one a search term was looking for: every word of the term appears in it. */
export function matchesTerm(text: string, term: string): boolean {
  const haystack = text.toLowerCase();
  const words = term
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2);
  return words.length > 0 && words.every((word) => haystack.includes(word));
}

export interface SettingsMatch {
  paneId: PaneId;
  paneLabel: string;
  term: string;
}

/** Every setting whose name contains what was typed, with the pane it lives on. */
export function searchSettings(query: string): SettingsMatch[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  return SETTINGS_PANES.flatMap((pane) =>
    [pane.label, ...pane.terms]
      .filter((term) => term.toLowerCase().includes(needle))
      .map((term) => ({ paneId: pane.id, paneLabel: pane.label, term })),
  );
}
