// Libs
import type { ComponentType } from 'react';

// Components
import { AboutPane } from '@/components/views/settings/about/AboutPane';
import { AppearancePane } from '@/components/views/settings/appearance/AppearancePane';
import { DataPane } from '@/components/views/settings/data/DataPane';
import { GeneralPane } from '@/components/views/settings/general/GeneralPane';
import { PasswordsPane } from '@/components/views/settings/passwords/PasswordsPane';
import { PrivacyPane } from '@/components/views/settings/privacy/PrivacyPane';
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
} from 'lucide-react';

// Types
import type { SettingsPaneProps } from '@/components/views/settings/shared/types';

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
    label: 'General',
    icon: Settings2,
    Component: GeneralPane,
    terms: ['Reopen tabs', 'Startup', 'Search engine', 'Bookmarks bar', 'Default browser'],
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: Palette,
    Component: AppearancePane,
    terms: [
      'Light',
      'Dark',
      'Theme',
      'Density',
      'Zoom',
      'Default zoom',
      'Start page',
      'Wallpaper',
      'Colour',
      'Clock',
    ],
  },
  {
    id: 'privacy',
    label: 'Privacy and security',
    icon: ShieldCheck,
    Component: PrivacyPane,
    terms: ['HTTPS', 'Secure connections', 'Trackers', 'Ads', 'Block', 'Filter lists', 'DNS', 'Secure DNS'],
  },
  {
    id: 'sites',
    label: 'Site settings',
    icon: Globe,
    Component: SitesPane,
    terms: [
      'Site settings',
      'Permissions',
      'Camera',
      'Microphone',
      'Location',
      'Notifications',
      'Site zoom',
      'Trackers allowed',
      'Exceptions',
    ],
  },
  {
    id: 'passwords',
    label: 'Passwords',
    icon: KeyRound,
    Component: PasswordsPane,
    terms: ['Passwords', 'Vault', 'Lock', 'Fill password', 'Export passwords', 'Import passwords', 'Generate'],
  },
  {
    id: 'data',
    label: 'Your data',
    icon: Database,
    Component: DataPane,
    terms: ['Clear browsing data', 'History', 'Cookies', 'Cache', 'Export', 'Import bookmarks'],
  },
  {
    id: 'shortcuts',
    label: 'Shortcuts',
    icon: Keyboard,
    Component: ShortcutsPane,
    terms: ['Keyboard', 'Shortcuts', 'Keys'],
  },
  {
    id: 'updates',
    label: 'Updates',
    icon: Download,
    Component: UpdatesPane,
    terms: ['Update', 'Version', 'Check for updates'],
  },
  {
    id: 'about',
    label: 'About',
    icon: Info,
    Component: AboutPane,
    terms: ['Version', 'Licence', 'Diagnostics', 'Log'],
  },
  {
    id: 'transparency',
    label: 'What Copacetic sends and keeps',
    icon: Eye,
    Component: TransparencyPane,
    terms: ['Telemetry', 'Tracking', 'Privacy policy', 'Data', 'Hush', 'Audit', 'Signed', 'Extensions', 'Netflix'],
  },
] as const satisfies readonly SettingsPane[];

export type PaneId = (typeof SETTINGS_PANES)[number]['id'];

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
