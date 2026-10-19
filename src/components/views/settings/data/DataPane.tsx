'use client';

// Libs
import { useCallback, useEffect, useState } from 'react';

// Components
import { ClearBrowsingDialog } from '@/components/views/clearing/ClearBrowsingDialog';
import { Button } from '@/components/ui/Button/Button';
import { Select } from '@/components/ui/Select/Select';
import { SettingGroup, SettingRow } from '@/components/ui/SettingRow/SettingRow';

// Utils
import { ask, send } from '@/lib/bridge';
import { CLEAR_RANGES } from '@/lib/clearing';
import { t } from '@shared/i18n/translate';

// Types
import type { ClearRange, ExportKind, ImportSource } from '@shared/types';
import { KEPT_KINDS, type KeptAboutSites, describeKept } from '@shared/forgetting';

export function DataPane() {
  const [kept, setKept] = useState<KeptAboutSites | null>(null);
  const [range, setRange] = useState<ClearRange>('hour');
  const [isConfirming, setIsConfirming] = useState(false);
  const [message, setMessage] = useState('');
  const [sources, setSources] = useState<ImportSource[]>([]);
  const [chosenSourceId, setChosenSourceId] = useState<string | null>(null);

  const reload = useCallback(() => {
    void ask((api) => api.data.kept(), null).then(setKept);
  }, []);

  useEffect(reload, [reload]);

  useEffect(() => {
    void ask((api) => api.data.importSources(), []).then(setSources);
  }, []);

  const chosenSource = sources.find((source) => source.id === chosenSourceId) ?? sources[0];

  const exportData = (kind: ExportKind) => {
    setMessage('');
    void ask((api) => api.data.export(kind), '').then(setMessage);
  };

  const keptKinds = KEPT_KINDS.filter((entry) => (kept?.[entry.id] ?? 0) > 0);

  return (
    <>
      <SettingGroup title={t('settings.data.browsing.title')}>
        <SettingRow
          label={t('settings.data.browsing.label')}
          help={t('settings.data.browsing.help')}
          control={
            <>
              <Select
                label={t('settings.data.browsing.range')}
                options={CLEAR_RANGES}
                value={range}
                onChange={setRange}
              />
              <Button size="sm" variant="danger" onClick={() => setIsConfirming(true)}>
                {t('settings.data.browsing.action')}
              </Button>
            </>
          }
        />
      </SettingGroup>

      <SettingGroup title={t('settings.data.kept.title')}>
        {keptKinds.length === 0 ? (
          <SettingRow label={t('settings.data.kept.empty')} />
        ) : (
          keptKinds.map((entry) => (
            <SettingRow
              key={entry.id}
              label={describeKept(entry.id, kept?.[entry.id] ?? 0)}
              control={
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    send((api) => api.data.clearKept(entry.id));
                    reload();
                  }}
                >
                  {t('settings.data.kept.clear')}
                </Button>
              }
            />
          ))
        )}
      </SettingGroup>

      <SettingGroup title={t('settings.data.export.title')}>
        <SettingRow
          label={t('settings.data.export.bookmarks.label')}
          help={t('settings.data.export.bookmarks.help')}
          control={
            <Button size="sm" onClick={() => exportData('bookmarks')}>
              {t('settings.data.export.action')}
            </Button>
          }
        />
        <SettingRow
          label={t('settings.data.export.history.label')}
          help={t('settings.data.export.history.help')}
          control={
            <Button size="sm" onClick={() => exportData('history')}>
              {t('settings.data.export.action')}
            </Button>
          }
        />
      </SettingGroup>

      <SettingGroup title={t('settings.data.import.title')}>
        <SettingRow
          label={t('settings.data.import.bookmarks.label')}
          help={t('settings.data.import.bookmarks.help')}
          control={
            <Button
              size="sm"
              onClick={() => {
                setMessage('');
                void ask((api) => api.data.importBookmarks(), '').then(setMessage);
              }}
            >
              {t('settings.data.import.action')}
            </Button>
          }
        />
        <SettingRow
          label={t('settings.data.import.history.label')}
          help={t('settings.data.import.history.help')}
          control={
            <Button
              size="sm"
              onClick={() => {
                setMessage('');
                void ask((api) => api.data.importHistory(), '').then(setMessage);
              }}
            >
              {t('settings.data.import.action')}
            </Button>
          }
        />
        <SettingRow
          label={t('settings.data.import.browser.label')}
          help={chosenSource ? t('settings.data.import.browser.help') : t('settings.data.import.browser.none')}
          control={
            chosenSource && (
              <>
                <Select
                  label={t('settings.data.import.browser.choose')}
                  options={sources}
                  value={chosenSource.id}
                  onChange={setChosenSourceId}
                />
                <Button
                  size="sm"
                  onClick={() => {
                    setMessage('');
                    void ask((api) => api.data.importFromBrowser(chosenSource.id), '').then(setMessage);
                  }}
                >
                  {t('settings.data.import.action')}
                </Button>
              </>
            )
          }
        />
      </SettingGroup>

      {message && (
        <p className="px-0.5 text-body-sm text-ink-dim" role="status">
          {message}
        </p>
      )}

      <ClearBrowsingDialog
        key={range}
        range={range}
        open={isConfirming}
        onOpenChange={setIsConfirming}
        onConfirm={(choice) => {
          send((api) => api.history.clear(range, choice));
          reload();
        }}
      />
    </>
  );
}
