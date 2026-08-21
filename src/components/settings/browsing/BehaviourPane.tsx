// Components
import { Section } from '@/components/settings/shared/controls';
import { Toggle } from '@/components/ui/controls/Toggle';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { updateSettings } from '@/components/settings/shared/options';

export function BehaviourPane() {
  const settings = useBrowserStore((state) => state.settings);

  return (
    <Section title="On launch">
      <Toggle
        label="Reopen the tabs I had open"
        checked={settings.restoreTabsOnLaunch}
        onChange={(restoreTabsOnLaunch) => updateSettings({ restoreTabsOnLaunch })}
      />
    </Section>
  );
}
