'use client';

// Libs
import { useEffect, useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { SettingGroup, SettingRow } from '@/components/ui/SettingRow/SettingRow';

// Utils
import { ask } from '@/lib/bridge/bridge';
import { formatBytes } from '@/lib/text/format';
import { t } from '@shared/i18n/translate';

/** The translation models kept on this machine, and the way to be rid of them. */
export function TranslationModels() {
  const [bytes, setBytes] = useState<number | null>(null);

  useEffect(() => {
    void ask((api) => api.translation.installedBytes(), 0).then(setBytes);
  }, []);

  const remove = async () => {
    await ask((api) => api.translation.removeModels(), undefined);
    setBytes(0);
  };

  return (
    <SettingGroup title={t('settings.data.translation.title')}>
      <SettingRow
        label={t('settings.data.translation.label')}
        help={
          bytes
            ? t('settings.data.translation.kept', { size: formatBytes(bytes) })
            : t('settings.data.translation.none')
        }
        control={
          <Button size="sm" disabled={!bytes} onClick={() => void remove()}>
            {t('settings.data.translation.remove')}
          </Button>
        }
      />
    </SettingGroup>
  );
}
