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
                  Restart to update
                </Button>
              )}
              {status.state === 'available' && delivery === 'manual' && (
                <Button size="sm" variant="primary" onClick={() => send((api) => api.updates.openReleases())}>
                  Download {status.version}
                </Button>
              )}
              {delivery !== 'unsupported' && (
                <Button size="sm" disabled={isChecking || status.state === 'checking'} onClick={check}>
                  Check now
                </Button>
              )}
            </>
          }
        />
        {manualReason && <SettingRow label="How this build updates" help={manualReason} />}
        <SettingRow
          label="Check for updates automatically"
          help={`Asks ${new URL(releasesUrl).host} for the latest version number. Nothing about you is sent.`}
          control={
            <Switch
              label="Check for updates automatically"
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
      return 'Checking for updates…';
    case 'current':
      return 'Copacetic is up to date';
    case 'available':
      return `Version ${status.version} is available`;
    case 'downloading':
      return `Downloading the update… ${status.percent}%`;
    case 'ready':
      return `Version ${status.version} is ready to install`;
    case 'error':
      return `Could not check: ${status.message}`;
    default:
      return 'Not checked yet';
  }
}

// Colour only where it carries state: something to act on, or something wrong.
function StatusBadge({ status }: { status: UpdateStatus }) {
  if (status.state === 'available' || status.state === 'ready') {
    return <StatusPill status="warning">Update</StatusPill>;
  }
  if (status.state === 'error') {
    return <StatusPill status="danger">Failed</StatusPill>;
  }
  return null;
}

function describeLastCheck(at: number | null): string | undefined {
  if (!at) {
    return undefined;
  }
  const minutes = Math.floor((Date.now() - at) / MINUTE_IN_MS);
  if (minutes < 1) {
    return 'Checked just now';
  }
  if (minutes < MINUTES_PER_HOUR) {
    return `Checked ${minutes} minutes ago`;
  }
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  if (hours < HOURS_PER_DAY) {
    return `Checked ${hours} hours ago`;
  }
  return `Checked ${Math.floor(hours / HOURS_PER_DAY)} days ago`;
}
