// Libs
import type { ComponentType } from 'react';

// Components
import { AboutPane } from '@/components/views/settings/about/AboutPane';
import { AppearancePane } from '@/components/views/settings/appearance/AppearancePane';
import { BehaviourPane } from '@/components/views/settings/browsing/BehaviourPane';
import { DataPane } from '@/components/views/settings/data/DataPane';
import { KeyboardPane } from '@/components/views/settings/browsing/KeyboardPane';
import { PasswordsPane } from '@/components/views/settings/passwords/PasswordsPane';
import { PrivacyPane } from '@/components/views/settings/privacy/PrivacyPane';
import { SearchPane } from '@/components/views/settings/browsing/SearchPane';
import { UpdatesPane } from '@/components/views/settings/about/UpdatesPane';

// Types
import type { SettingsPaneProps } from '@/components/views/settings/shared/types';

interface SettingsPane {
  id: string;
  label: string;
  Component: ComponentType<SettingsPaneProps>;
}

export const SETTINGS_PANES = [
  { id: 'appearance', label: 'Appearance', Component: AppearancePane },
  { id: 'search', label: 'Search', Component: SearchPane },
  { id: 'privacy', label: 'Privacy', Component: PrivacyPane },
  { id: 'passwords', label: 'Passwords', Component: PasswordsPane },
  { id: 'behaviour', label: 'Behaviour', Component: BehaviourPane },
  { id: 'data', label: 'Your data', Component: DataPane },
  { id: 'keyboard', label: 'Keyboard', Component: KeyboardPane },
  { id: 'updates', label: 'Updates', Component: UpdatesPane },
  { id: 'about', label: 'About', Component: AboutPane },
] as const satisfies readonly SettingsPane[];

export type PaneId = (typeof SETTINGS_PANES)[number]['id'];
