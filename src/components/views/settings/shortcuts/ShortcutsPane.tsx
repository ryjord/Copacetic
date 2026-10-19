'use client';

// Components
import { Kbd } from '@/components/ui/Kbd/Kbd';
import { SettingGroup, SettingRow } from '@/components/ui/SettingRow/SettingRow';

// Types
import { SHORTCUT_GROUPS } from '@shared/shortcuts';

export function ShortcutsPane() {
  return (
    <>
      {SHORTCUT_GROUPS.map((group) => (
        <SettingGroup key={group.title} title={group.title}>
          {group.shortcuts.map((shortcut) => (
            <SettingRow
              key={shortcut.accelerator}
              label={shortcut.description}
              control={<Kbd accelerator={shortcut.accelerator} />}
            />
          ))}
        </SettingGroup>
      ))}
    </>
  );
}
