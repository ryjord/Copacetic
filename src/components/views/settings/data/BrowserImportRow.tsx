'use client';

// Libs
import { useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { Select } from '@/components/ui/Select/Select';
import { SettingRow } from '@/components/ui/SettingRow/SettingRow';

// Utils
import { ask } from '@/lib/bridge/bridge';
import { t } from '@shared/i18n/translate';

// Types
import type { ImportPreview, ImportSource } from '@shared/types';

/** Another browser's bookmarks and history, counted and shown before anything is brought in. */
export function BrowserImportRow({
  sources,
  onResult,
}: {
  sources: ImportSource[];
  onResult: (message: string) => void;
}) {
  const [chosenSourceId, setChosenSourceId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [problem, setProblem] = useState('');
  const chosenSource = sources.find((source) => source.id === chosenSourceId) ?? sources[0];

  if (!chosenSource) {
    return (
      <SettingRow label={t('settings.data.import.browser.label')} help={t('settings.data.import.browser.none')} />
    );
  }

  const look = async () => {
    setProblem('');
    const found = await ask((api) => api.data.previewFromBrowser(chosenSource.id), null);
    if (!found) {
      setProblem(t('settings.data.import.browser.gone'));
      return;
    }
    setPreview(found);
  };

  const hasAnything = preview !== null && preview.bookmarks + preview.historyPages > 0;
  const found =
    preview === null
      ? null
      : hasAnything
        ? t('settings.data.import.browser.found', {
            bookmarks: t('settings.data.import.browser.bookmarks', { count: preview.bookmarks }),
            pages: t('settings.data.import.browser.pages', { count: preview.historyPages }),
            source: chosenSource.label,
          })
        : t('settings.data.import.browser.foundNothing', { source: chosenSource.label });

  return (
    <SettingRow
      label={t('settings.data.import.browser.label')}
      help={
        problem ? (
          <span className="text-alert">{problem}</span>
        ) : found ? (
          <span className="text-ink">{found}</span>
        ) : (
          t('settings.data.import.browser.help')
        )
      }
      control={
        preview === null ? (
          <>
            <Select
              label={t('settings.data.import.browser.choose')}
              options={sources}
              value={chosenSource.id}
              onChange={setChosenSourceId}
            />
            <Button size="sm" onClick={() => void look()}>
              {t('settings.data.import.browser.look')}
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>
              {t('settings.data.import.browser.cancel')}
            </Button>
            {hasAnything && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  setPreview(null);
                  void ask((api) => api.data.importFromBrowser(chosenSource.id), '').then(onResult);
                }}
              >
                {t('settings.data.import.action')}
              </Button>
            )}
          </>
        )
      }
    />
  );
}
