// Components
import { Section } from '@/components/surfaces/settings/controls';
import { Toggle } from '@/components/ui/Toggle';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { updateSettings } from '@/components/surfaces/settings/options';

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
