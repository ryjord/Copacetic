// Libs
import type { ComponentType } from 'react';

// Components
import { AboutPane } from '@/components/surfaces/settings/AboutPane';
import { AppearancePane } from '@/components/surfaces/settings/AppearancePane';
import { BehaviourPane } from '@/components/surfaces/settings/BehaviourPane';
import { DataPane } from '@/components/surfaces/settings/DataPane';
import { KeyboardPane } from '@/components/surfaces/settings/KeyboardPane';
import { PasswordsPane } from '@/components/surfaces/settings/PasswordsPane';
import { PrivacyPane } from '@/components/surfaces/settings/PrivacyPane';
import { SearchPane } from '@/components/surfaces/settings/SearchPane';
import { UpdatesPane } from '@/components/surfaces/settings/UpdatesPane';

// Types
import type { SettingsPaneProps } from '@/components/surfaces/settings/types';

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
