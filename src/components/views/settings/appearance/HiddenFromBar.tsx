'use client';

// Libs
import { useEffect, useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { SettingRow } from '@/components/ui/SettingRow/SettingRow';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { ask } from '@/lib/bridge/bridge';
import { updateSettings } from '@/components/views/settings/shared/options';
import { t } from '@shared/i18n/translate';

/** The bookmarks and folders left off the bar, each with the way back on. */
export function HiddenFromBar() {
  const hidden = useBrowserStore((state) => state.settings.hiddenFromBookmarksBar);
  const [names, setNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (hidden.length === 0) {
      return;
    }
    let isCurrent = true;
    void Promise.all([ask((api) => api.bookmarks.list(), []), ask((api) => api.bookmarkFolders.list(), [])]).then(
      ([bookmarks, folders]) => {
        if (isCurrent) {
          setNames(
            new Map([
              ...bookmarks.map((bookmark): [string, string] => [bookmark.id, bookmark.title || bookmark.url]),
              ...folders.map((folder): [string, string] => [folder.id, folder.name]),
            ]),
          );
        }
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [hidden]);

  // One deleted since it was hidden has nothing to show again.
  const shown = hidden.flatMap((id) => {
    const name = names.get(id);
    return name === undefined ? [] : [{ id, name }];
  });
  return shown.map(({ id, name }) => (
    <SettingRow
      key={id}
      label={t('settings.appearance.browser.bookmarksBar.hidden', { name })}
      control={
        <Button
          size="sm"
          variant="ghost"
          onClick={() => updateSettings({ hiddenFromBookmarksBar: hidden.filter((hiddenId) => hiddenId !== id) })}
        >
          {t('settings.appearance.browser.bookmarksBar.showAgain')}
        </Button>
      }
    />
  ));
}
