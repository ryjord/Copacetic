'use client';

// Libs
import { useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { DefaultBrowserRow } from '@/components/views/settings/general/DefaultBrowserRow';
import { PageAddressField } from '@/components/views/settings/general/PageAddressField';
import { SegmentedControl } from '@/components/ui/SegmentedControl/SegmentedControl';
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
import { isHistoryRetentionDays, isSleepAfterMinutes } from '@shared/types';

const SLEEP_OPTIONS = [
  { id: '0', label: t('settings.general.memory.sleep.never') },
  { id: '15', label: t('settings.general.memory.sleep.after15') },
  { id: '30', label: t('settings.general.memory.sleep.after30') },
  { id: '60', label: t('settings.general.memory.sleep.after60') },
  { id: '120', label: t('settings.general.memory.sleep.after120') },
];

const ENGINES = SEARCH_ENGINE_OPTIONS.map((engine) => ({ id: engine.id, label: engine.name }));

type StartupChoice = 'lastTabs' | 'startPage' | 'page';
type HomeChoice = 'startPage' | 'page';

const STARTUP_OPTIONS: readonly { id: StartupChoice; label: string }[] = [
  { id: 'lastTabs', label: t('settings.general.startup.opens.lastTabs') },
  { id: 'startPage', label: t('settings.general.startup.opens.startPage') },
  { id: 'page', label: t('settings.general.startup.opens.page') },
];
const HOME_OPTIONS: readonly { id: HomeChoice; label: string }[] = [
  { id: 'startPage', label: t('settings.general.startup.home.startPage') },
  { id: 'page', label: t('settings.general.startup.home.page') },
];
const RETENTION_OPTIONS: readonly { id: string; label: string }[] = [
  { id: '30', label: t('settings.general.history.keep.days30') },
  { id: '90', label: t('settings.general.history.keep.days90') },
  { id: '365', label: t('settings.general.history.keep.days365') },
  { id: '0', label: t('settings.general.history.keep.forever') },
];

export function GeneralPane() {
  const settings = useBrowserStore((state) => state.settings);
  // A page chosen before its address is typed; nothing is saved until there is one.
  const [isNamingStartupPage, setIsNamingStartupPage] = useState(false);
  const [isNamingHomePage, setIsNamingHomePage] = useState(false);

  const savedStartup: StartupChoice = settings.restoreTabsOnLaunch
    ? 'lastTabs'
    : settings.startupUrl
      ? 'page'
      : 'startPage';
  const startup = isNamingStartupPage ? 'page' : savedStartup;
  const home: HomeChoice = isNamingHomePage || settings.homeUrl ? 'page' : 'startPage';

  const chooseStartup = (choice: StartupChoice) => {
    setIsNamingStartupPage(choice === 'page' && !settings.startupUrl);
    if (choice === 'lastTabs') {
      updateSettings({ restoreTabsOnLaunch: true });
    } else if (choice === 'startPage') {
      updateSettings({ restoreTabsOnLaunch: false, startupUrl: null });
    } else if (settings.startupUrl) {
      updateSettings({ restoreTabsOnLaunch: false });
    }
  };

  const chooseHome = (choice: HomeChoice) => {
    setIsNamingHomePage(choice === 'page');
    if (choice === 'startPage') {
      updateSettings({ homeUrl: null });
    }
  };

  return (
    <>
      <SettingGroup title={t('settings.general.startup.title')}>
        <SettingRow
          label={t('settings.general.startup.opens.label')}
          control={
            <SegmentedControl
              label={t('settings.general.startup.opens.label')}
              options={STARTUP_OPTIONS}
              value={startup}
              onChange={chooseStartup}
            />
          }
        />
        {startup === 'page' && (
          <SettingRow
            label={t('settings.general.startup.startupPage.label')}
            control={
              <PageAddressField
                value={settings.startupUrl}
                label={t('settings.general.startup.startupPage.field')}
                onChange={(startupUrl) => {
                  setIsNamingStartupPage(false);
                  updateSettings({ restoreTabsOnLaunch: false, startupUrl });
                }}
              />
            }
          />
        )}
        <SettingRow
          label={t('settings.general.startup.home.label')}
          help={t('settings.general.startup.home.help')}
          control={
            <SegmentedControl
              label={t('settings.general.startup.home.label')}
              options={HOME_OPTIONS}
              value={home}
              onChange={chooseHome}
            />
          }
        />
        {home === 'page' && (
          <SettingRow
            label={t('settings.general.startup.home.field')}
            control={
              <PageAddressField
                value={settings.homeUrl}
                label={t('settings.general.startup.home.field')}
                onChange={(homeUrl) => {
                  setIsNamingHomePage(false);
                  updateSettings({ homeUrl });
                }}
              />
            }
          />
        )}
        <DefaultBrowserRow />
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

      <SettingGroup title={t('settings.general.history.title')}>
        <SettingRow
          label={t('settings.general.history.keep.label')}
          help={t('settings.general.history.keep.help')}
          control={
            <Select
              label={t('settings.general.history.keep.label')}
              options={RETENTION_OPTIONS}
              value={String(settings.historyRetentionDays)}
              onChange={(days) => {
                const historyRetentionDays = Number(days);
                if (isHistoryRetentionDays(historyRetentionDays)) {
                  updateSettings({ historyRetentionDays });
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
    </>
  );
}
