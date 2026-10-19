'use client';

// Libs
import { useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { SettingGroup, SettingRow } from '@/components/ui/SettingRow/SettingRow';
import { LicencesList } from '@/components/views/settings/about/LicencesList';

// Utils
import { ask, send } from '@/lib/bridge/bridge';
import { t } from '@shared/i18n/translate';

// Types
import type { SettingsPaneProps } from '@/components/views/settings/shared/types';

const PLATFORMS: Record<string, string> = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' };

export function AboutPane({ info, openPane }: SettingsPaneProps) {
  const [isShowingLicences, setIsShowingLicences] = useState(false);
  const [message, setMessage] = useState('');

  return (
    <>
      <SettingGroup>
        <SettingRow label="Copacetic" control={<Version value={info?.version} />} />
        <SettingRow label="Chromium" control={<Version value={info?.chromeVersion} />} />
        <SettingRow label="Electron" control={<Version value={info?.electronVersion} />} />
        <SettingRow
          label={t('about.platform')}
          control={<Version value={info ? (PLATFORMS[info.platform] ?? info.platform) : undefined} />}
        />
      </SettingGroup>

      <SettingGroup>
        <SettingRow
          label={t('about.transparency.label')}
          help={t('about.transparency.help')}
          control={
            <Button size="sm" onClick={() => openPane('transparency')}>
              {t('about.transparency.action')}
            </Button>
          }
        />
        <SettingRow
          label={t('about.diagnostics.label')}
          help={t('about.diagnostics.help')}
          control={
            <Button size="sm" onClick={() => send((api) => api.app.revealDiagnostics())}>
              {t('about.diagnostics.action')}
            </Button>
          }
        />
        <SettingRow
          label={t('about.licences.label')}
          help={t('about.licences.help')}
          control={
            <Button size="sm" onClick={() => setIsShowingLicences(!isShowingLicences)}>
              {isShowingLicences ? t('about.licences.hide') : t('about.licences.show')}
            </Button>
          }
        />
        <SettingRow
          label={t('about.chromiumLicences.label')}
          help={message || t('about.chromiumLicences.help')}
          control={
            <Button size="sm" onClick={() => void ask((api) => api.app.openChromiumLicences(), '').then(setMessage)}>
              {t('about.chromiumLicences.action')}
            </Button>
          }
        />
      </SettingGroup>

      {isShowingLicences && <LicencesList />}
    </>
  );
}

function Version({ value }: { value: string | undefined }) {
  return <span className="text-body-sm text-ink-dim tabular-nums select-text">{value ?? '…'}</span>;
}
