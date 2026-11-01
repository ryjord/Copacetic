'use client';

// Libs
import { useCallback, useEffect, useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { SettingGroup, SettingRow } from '@/components/ui/SettingRow/SettingRow';

// Utils
import { ask, send } from '@/lib/bridge/bridge';
import { t } from '@shared/i18n/translate';

// Types
import type { InstalledApp } from '@shared/data/installed-apps';

/** Sites installed as apps: each opens in a window of its own, from a shortcut beside the system's other apps. */
export function AppsPane() {
  const [apps, setApps] = useState<InstalledApp[]>([]);

  const refresh = useCallback(() => {
    void ask((api) => api.apps.list(), []).then(setApps);
  }, []);

  useEffect(refresh, [refresh]);

  return (
    <SettingGroup title={t('settings.apps.title')} description={t('settings.apps.description')}>
      {apps.length === 0 && <SettingRow label={t('settings.apps.empty')} />}
      {apps.map((installed) => (
        <SettingRow
          key={installed.id}
          label={installed.name}
          help={installed.url}
          control={
            <div className="flex gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => send((api) => api.apps.open(installed.id))}>
                {t('settings.apps.open')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void ask((api) => api.apps.remove(installed.id), undefined).then(refresh)}
              >
                {t('settings.apps.remove')}
              </Button>
            </div>
          }
        />
      ))}
    </SettingGroup>
  );
}
