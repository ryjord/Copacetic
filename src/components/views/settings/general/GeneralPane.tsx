'use client';

// Components
import { Button } from '@/components/ui/Button/Button';
import { DefaultBrowserRow } from '@/components/views/settings/general/DefaultBrowserRow';
import { Select } from '@/components/ui/Select/Select';
import { SettingGroup, SettingRow } from '@/components/ui/SettingRow/SettingRow';
import { SpellcheckLanguagesRow } from '@/components/views/settings/general/SpellcheckLanguagesRow';
import { Switch } from '@/components/ui/Switch/Switch';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { send } from '@/lib/bridge';
import { updateSettings } from '@/components/views/settings/shared/options';

// Types
import { SEARCH_ENGINE_OPTIONS } from '@shared/url';
import { isSleepAfterMinutes } from '@shared/types';

const SLEEP_OPTIONS = [
  { id: '0', label: 'Never' },
  { id: '15', label: 'After 15 minutes' },
  { id: '30', label: 'After 30 minutes' },
  { id: '60', label: 'After an hour' },
  { id: '120', label: 'After two hours' },
];

const ENGINES = SEARCH_ENGINE_OPTIONS.map((engine) => ({ id: engine.id, label: engine.name }));

export function GeneralPane() {
  const settings = useBrowserStore((state) => state.settings);

  return (
    <>
      <SettingGroup title="Startup">
        <SettingRow
          label="Reopen the tabs from last time"
          control={
            <Switch
              label="Reopen the tabs from last time"
              checked={settings.restoreTabsOnLaunch}
              onChange={(restoreTabsOnLaunch) => updateSettings({ restoreTabsOnLaunch })}
            />
          }
        />
      </SettingGroup>

      <SettingGroup title="Search">
        <SettingRow
          label="Search engine"
          help="Used when what you type is not an address. Suggestions come from your own history."
          control={
            <Select
              label="Search engine"
              options={ENGINES}
              value={settings.searchEngine}
              onChange={(searchEngine) => updateSettings({ searchEngine })}
            />
          }
        />
      </SettingGroup>

      <SettingGroup title="Memory">
        <SettingRow
          label="Put tabs to sleep"
          help="A tab left alone this long gives back its memory and comes back where it was when you return to it. Never one playing sound."
          control={
            <Select
              label="Put tabs to sleep"
              options={SLEEP_OPTIONS}
              value={String(settings.sleepTabsAfterMinutes)}
              onChange={(minutes) => {
                const sleepTabsAfterMinutes = Number(minutes);
                if (isSleepAfterMinutes(sleepTabsAfterMinutes)) {
                  updateSettings({ sleepTabsAfterMinutes });
                }
              }}
            />
          }
        />
      </SettingGroup>

      <SettingGroup title="Typing">
        <SettingRow
          label="Check spelling"
          help="Underlines misspelt words in what you type into pages. Checked on this machine."
          control={
            <Switch
              label="Check spelling"
              checked={settings.spellcheck}
              onChange={(spellcheck) => updateSettings({ spellcheck })}
            />
          }
        />
        {settings.spellcheck && <SpellcheckLanguagesRow chosen={settings.spellcheckLanguages} />}
      </SettingGroup>

      <SettingGroup title="Downloads">
        <SettingRow
          label="Save files to"
          help={settings.downloadDirectory ?? 'Your Downloads folder'}
          control={
            <>
              {settings.downloadDirectory && (
                <Button size="sm" variant="ghost" onClick={() => updateSettings({ downloadDirectory: null })}>
                  Use Downloads folder
                </Button>
              )}
              <Button size="sm" onClick={() => send((api) => api.downloads.chooseFolder())}>
                Change…
              </Button>
            </>
          }
        />
        <SettingRow
          label="Ask where to save each file"
          help="Each download asks for a place first, rather than going straight to the folder above."
          control={
            <Switch
              label="Ask where to save each file"
              checked={settings.askWhereToSave}
              onChange={(askWhereToSave) => updateSettings({ askWhereToSave })}
            />
          }
        />
      </SettingGroup>

      <SettingGroup title="Bookmarks">
        <SettingRow
          label="Show the bookmarks bar"
          help="Top-level bookmarks and folders, under the address bar."
          control={
            <Switch
              label="Show the bookmarks bar"
              checked={settings.showBookmarksBar}
              onChange={(showBookmarksBar) => updateSettings({ showBookmarksBar })}
            />
          }
        />
      </SettingGroup>

      <SettingGroup title="Default browser">
        <DefaultBrowserRow />
      </SettingGroup>
    </>
  );
}
