'use client';

// Components
import { Button } from '@/components/ui/Button/Button';
import { SettingGroup, SettingRow } from '@/components/ui/SettingRow/SettingRow';

// Utils
import { send } from '@/lib/bridge';

// Types
import type { SettingsPaneProps } from '@/components/views/settings/shared/types';

const PLATFORMS: Record<string, string> = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' };

export function AboutPane({ info, openPane }: SettingsPaneProps) {
  return (
    <>
      <SettingGroup>
        <SettingRow label="Copacetic" control={<Version value={info?.version} />} />
        <SettingRow label="Chromium" control={<Version value={info?.chromeVersion} />} />
        <SettingRow label="Electron" control={<Version value={info?.electronVersion} />} />
        <SettingRow
          label="Platform"
          control={<Version value={info ? (PLATFORMS[info.platform] ?? info.platform) : undefined} />}
        />
      </SettingGroup>

      <SettingGroup>
        <SettingRow
          label="What Copacetic sends and keeps"
          help="Every request it makes, everything it stores, and what it does not do."
          control={
            <Button size="sm" onClick={() => openPane('transparency')}>
              Read
            </Button>
          }
        />
        <SettingRow
          label="Diagnostics log"
          help="A record of what Copacetic did, never of the pages you visited. It stays on this machine."
          control={
            <Button size="sm" onClick={() => send((api) => api.app.revealDiagnostics())}>
              Show
            </Button>
          }
        />
        <SettingRow
          label="Licences"
          help="Copacetic is MIT licensed. EasyList and EasyPrivacy are offered under the GPLv3 or CC BY-SA 3.0; the NOTICE file names them."
        />
      </SettingGroup>
    </>
  );
}

function Version({ value }: { value: string | undefined }) {
  return <span className="text-body-sm text-ink-dim tabular-nums select-text">{value ?? '…'}</span>;
}
