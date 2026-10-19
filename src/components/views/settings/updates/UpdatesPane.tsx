'use client';

// Libs
import { useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { SettingGroup, SettingRow } from '@/components/ui/SettingRow/SettingRow';
import { StatusPill } from '@/components/ui/StatusPill/StatusPill';
import { Switch } from '@/components/ui/Switch/Switch';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { updateSettings } from '@/components/views/settings/shared/options';
import { ask, send } from '@/lib/bridge';
import { t } from '@shared/i18n/translate';

// Types
import type { UpdateStatus } from '@shared/types';

const MINUTE_IN_MS = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

export function UpdatesPane() {
  const settings = useBrowserStore((state) => state.settings);
  const update = useBrowserStore((state) => state.update);
  const [isChecking, setIsChecking] = useState(false);

  const { status, delivery, manualReason, lastCheckedAt, releasesUrl } = update;

  const check = () => {
    setIsChecking(true);
    void ask(async (api) => api.updates.check(), undefined).finally(() => setIsChecking(false));
  };

  return (
    <>
      <SettingGroup>
        <SettingRow
          label={describeStatus(status)}
          help={status.state === 'checking' || isChecking ? undefined : describeLastCheck(lastCheckedAt)}
          control={
            <>
              <StatusBadge status={status} />
              {/* Two genuinely different paths: an Update button that silently failed would be worse than none. */}
              {status.state === 'ready' && delivery === 'automatic' && (
                <Button size="sm" variant="primary" onClick={() => send((api) => api.updates.install())}>
                  {t('settings.updates.restart')}
                </Button>
              )}
              {status.state === 'available' && delivery === 'manual' && (
                <Button size="sm" variant="primary" onClick={() => send((api) => api.updates.openReleases())}>
                  {t('settings.updates.download', { version: status.version })}
                </Button>
              )}
              {delivery !== 'unsupported' && (
                <Button size="sm" disabled={isChecking || status.state === 'checking'} onClick={check}>
                  {t('settings.updates.checkNow')}
                </Button>
              )}
            </>
          }
        />
        {manualReason && <SettingRow label={t('settings.updates.howItUpdates')} help={manualReason} />}
        <SettingRow
          label={t('settings.updates.automatic.label')}
          help={t('settings.updates.automatic.help', { host: new URL(releasesUrl).host })}
          control={
            <Switch
              label={t('settings.updates.automatic.label')}
              checked={settings.checkForUpdates}
              onChange={(checkForUpdates) => updateSettings({ checkForUpdates })}
            />
          }
        />
      </SettingGroup>
    </>
  );
}

function describeStatus(status: UpdateStatus): string {
  switch (status.state) {
    case 'checking':
      return t('settings.updates.status.checking');
    case 'current':
      return t('settings.updates.status.current');
    case 'available':
      return t('settings.updates.status.available', { version: status.version });
    case 'downloading':
      return t('settings.updates.status.downloading', { percent: status.percent });
    case 'ready':
      return t('settings.updates.status.ready', { version: status.version });
    case 'error':
      return t('settings.updates.status.error', { message: status.message });
    default:
      return t('settings.updates.status.unknown');
  }
}

// Colour only where it carries state: something to act on, or something wrong.
function StatusBadge({ status }: { status: UpdateStatus }) {
  if (status.state === 'available' || status.state === 'ready') {
    return <StatusPill status="warning">{t('settings.updates.badge.update')}</StatusPill>;
  }
  if (status.state === 'error') {
    return <StatusPill status="danger">{t('settings.updates.badge.failed')}</StatusPill>;
  }
  return null;
}

function describeLastCheck(at: number | null): string | undefined {
  if (!at) {
    return undefined;
  }
  const minutes = Math.floor((Date.now() - at) / MINUTE_IN_MS);
  if (minutes < 1) {
    return t('settings.updates.lastChecked.justNow');
  }
  if (minutes < MINUTES_PER_HOUR) {
    return t('settings.updates.lastChecked.minutes', { count: minutes });
  }
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  if (hours < HOURS_PER_DAY) {
    return t('settings.updates.lastChecked.hours', { count: hours });
  }
  return t('settings.updates.lastChecked.days', { count: Math.floor(hours / HOURS_PER_DAY) });
}
