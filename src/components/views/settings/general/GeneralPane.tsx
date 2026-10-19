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
import { send } from '@/lib/bridge/bridge';
import { t } from '@shared/i18n/translate';
import { updateSettings } from '@/components/views/settings/shared/options';

// Types
import { SEARCH_ENGINE_OPTIONS } from '@shared/browsing/url';
import { isSleepAfterMinutes } from '@shared/types';

const SLEEP_OPTIONS = [
  { id: '0', label: t('settings.general.memory.sleep.never') },
  { id: '15', label: t('settings.general.memory.sleep.after15') },
  { id: '30', label: t('settings.general.memory.sleep.after30') },
  { id: '60', label: t('settings.general.memory.sleep.after60') },
  { id: '120', label: t('settings.general.memory.sleep.after120') },
];

const ENGINES = SEARCH_ENGINE_OPTIONS.map((engine) => ({ id: engine.id, label: engine.name }));

export function GeneralPane() {
  const settings = useBrowserStore((state) => state.settings);

  return (
    <>
      <SettingGroup title={t('settings.general.startup.title')}>
        <SettingRow
          label={t('settings.general.startup.reopenTabs')}
          control={
            <Switch
              label={t('settings.general.startup.reopenTabs')}
              checked={settings.restoreTabsOnLaunch}
              onChange={(restoreTabsOnLaunch) => updateSettings({ restoreTabsOnLaunch })}
            />
          }
        />
      </SettingGroup>

      <SettingGroup title={t('settings.general.search.title')}>
        <SettingRow
          label={t('settings.general.search.engine.label')}
          help={t('settings.general.search.engine.help')}
          control={
            <Select
              label={t('settings.general.search.engine.label')}
              options={ENGINES}
              value={settings.searchEngine}
              onChange={(searchEngine) => updateSettings({ searchEngine })}
            />
          }
        />
      </SettingGroup>

      <SettingGroup title={t('settings.general.memory.title')}>
        <SettingRow
          label={t('settings.general.memory.sleep.label')}
          help={t('settings.general.memory.sleep.help')}
          control={
            <Select
              label={t('settings.general.memory.sleep.label')}
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

      <SettingGroup title={t('settings.general.typing.title')}>
        <SettingRow
          label={t('settings.general.typing.spelling.label')}
          help={t('settings.general.typing.spelling.help')}
          control={
            <Switch
              label={t('settings.general.typing.spelling.label')}
              checked={settings.spellcheck}
              onChange={(spellcheck) => updateSettings({ spellcheck })}
            />
          }
        />
        {settings.spellcheck && <SpellcheckLanguagesRow chosen={settings.spellcheckLanguages} />}
      </SettingGroup>

      <SettingGroup title={t('settings.general.downloads.title')}>
        <SettingRow
          label={t('settings.general.downloads.saveTo.label')}
          help={settings.downloadDirectory ?? t('settings.general.downloads.saveTo.fallback')}
          control={
            <>
              {settings.downloadDirectory && (
                <Button size="sm" variant="ghost" onClick={() => updateSettings({ downloadDirectory: null })}>
                  {t('settings.general.downloads.saveTo.useDefault')}
                </Button>
              )}
              <Button size="sm" onClick={() => send((api) => api.downloads.chooseFolder())}>
                {t('settings.general.downloads.saveTo.change')}
              </Button>
            </>
          }
        />
        <SettingRow
          label={t('settings.general.downloads.ask.label')}
          help={t('settings.general.downloads.ask.help')}
          control={
            <Switch
              label={t('settings.general.downloads.ask.label')}
              checked={settings.askWhereToSave}
              onChange={(askWhereToSave) => updateSettings({ askWhereToSave })}
            />
          }
        />
      </SettingGroup>

      <SettingGroup title={t('settings.general.bookmarks.title')}>
        <SettingRow
          label={t('settings.general.bookmarks.showBar.label')}
          help={t('settings.general.bookmarks.showBar.help')}
          control={
            <Switch
              label={t('settings.general.bookmarks.showBar.label')}
              checked={settings.showBookmarksBar}
              onChange={(showBookmarksBar) => updateSettings({ showBookmarksBar })}
            />
          }
        />
      </SettingGroup>

      <SettingGroup title={t('settings.general.defaultBrowser.title')}>
        <DefaultBrowserRow />
      </SettingGroup>
    </>
  );
}
