// Components
import { Section } from '@/components/settings/shared/controls';
import { DefaultBrowserRow } from '@/components/settings/browsing/DefaultBrowserRow';
import { Toggle } from '@/components/ui/controls/Toggle';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { updateSettings } from '@/components/settings/shared/options';

export function BehaviourPane() {
  const settings = useBrowserStore((state) => state.settings);

  return (
    <>
      <Section title="On launch">
        <Toggle
          label="Reopen the tabs I had open"
          checked={settings.restoreTabsOnLaunch}
          onChange={(restoreTabsOnLaunch) => updateSettings({ restoreTabsOnLaunch })}
        />
      </Section>

      <Section title="Bookmarks">
        <Toggle
          label="Show a bookmarks bar under the toolbar"
          description="The folders at the top level, and anything filed nowhere. A folder opens as a menu."
          checked={settings.showBookmarksBar}
          onChange={(showBookmarksBar) => updateSettings({ showBookmarksBar })}
        />
      </Section>

      <Section title="Default browser">
        <DefaultBrowserRow />
      </Section>
    </>
  );
}
