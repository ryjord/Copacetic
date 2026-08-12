// Components
import { Section } from '@/components/surfaces/settings/controls';

// Types
import { SHORTCUT_GROUPS, readableAccelerator } from '../../../../electron/shared/shortcuts';
import type { SettingsPaneProps } from '@/components/surfaces/settings/types';

export function KeyboardPane({ info }: SettingsPaneProps) {
  const isMac = info?.platform === 'darwin';

  return (
    <Section title="Keyboard">
      <div className="space-y-4">
        {SHORTCUT_GROUPS.map((group) => (
          <div key={group.title}>
            <h3 className="label mb-1.5">{group.title}</h3>
            <dl className="divide-y divide-line rounded-field border border-line">
              {group.shortcuts.map((shortcut) => (
                <div key={shortcut.accelerator} className="flex items-center justify-between gap-4 px-3 py-1.5">
                  <dt className="min-w-0 flex-1 truncate text-[12px] text-ink-dim">{shortcut.description}</dt>
                  <dd className="shrink-0 font-mono text-[11.5px] text-ink-faint">
                    {readableAccelerator(shortcut.accelerator, isMac)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </Section>
  );
}
