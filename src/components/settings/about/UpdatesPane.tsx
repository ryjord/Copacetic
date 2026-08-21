// Libs
import { useState } from 'react';

// Components
import { OutlineButton, Section } from '@/components/settings/shared/controls';
import { Toggle } from '@/components/ui/controls/Toggle';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { updateSettings } from '@/components/settings/shared/options';
import { ask, send } from '@/lib/bridge';

// Types
import type { UpdateStatus } from '@shared/types';

const MINUTE_IN_MS = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

export function UpdatesPane() {
  return (
    <Section title="Updates">
      <UpdatePanel />
    </Section>
  );
}

function UpdatePanel() {
  const settings = useBrowserStore((state) => state.settings);
  const update = useBrowserStore((state) => state.update);
  const [busy, setBusy] = useState(false);

  if (!update) {
    return null;
  }

  const { status, delivery, manualReason, lastCheckedAt, releasesUrl } = update;

  const check = () => {
    setBusy(true);
    void ask(async (api) => api.updates.check(), undefined).finally(() => setBusy(false));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <StatusLine status={status} />
        {status.state !== 'checking' && !busy && (
          <span className="text-[11.5px] text-ink-faint">{describeLastCheck(lastCheckedAt)}</span>
        )}
      </div>

      {manualReason && <p className="text-[12px] leading-relaxed text-ink-faint">{manualReason}</p>}

      {/* Two genuinely different paths: an Update button that silently failed would be worse than none. */}
      {delivery !== 'unsupported' && (
        <div className="flex flex-wrap gap-2">
          <OutlineButton onClick={check} disabled={busy || status.state === 'checking'}>
            Check now
          </OutlineButton>

          {status.state === 'ready' && delivery === 'automatic' && (
            <OutlineButton tone="clear" onClick={() => send((api) => api.updates.install())}>
              Restart and update
            </OutlineButton>
          )}

          {status.state === 'available' && delivery === 'manual' && (
            <OutlineButton tone="caution" onClick={() => send((api) => api.updates.openReleases())}>
              Download {status.version}
            </OutlineButton>
          )}
        </div>
      )}

      <Toggle
        label="Check for updates automatically"
        description={`Asks ${new URL(releasesUrl).host} for the latest version number, on launch and every few hours. Nothing about you is sent — it reads a number and compares it to this build.`}
        checked={settings.checkForUpdates}
        onChange={(checkForUpdates) => updateSettings({ checkForUpdates })}
      />
    </div>
  );
}

function StatusLine({ status }: { status: UpdateStatus }) {
  // Colour only where it carries state: something to act on, or something wrong.
  switch (status.state) {
    case 'checking':
      return <span className="text-[12.5px] text-ink-dim">Checking…</span>;
    case 'current':
      return <span className="text-[12.5px] text-ink-dim">Copacetic is up to date.</span>;
    case 'available':
      return <span className="text-[12.5px] text-caution">Version {status.version} is available.</span>;
    case 'downloading':
      return <span className="text-[12.5px] text-ink-dim">Downloading… {status.percent}%</span>;
    case 'ready':
      return <span className="text-[12.5px] text-clear">Version {status.version} is ready to install.</span>;
    case 'error':
      return <span className="text-[12.5px] text-alert">Could not check: {status.message}</span>;
    default:
      return <span className="text-[12.5px] text-ink-dim">Not checked yet.</span>;
  }
}

function describeLastCheck(at: number | null): string {
  if (!at) {
    return '';
  }
  const minutes = Math.floor((Date.now() - at) / MINUTE_IN_MS);
  if (minutes < 1) {
    return 'Checked just now';
  }
  if (minutes < MINUTES_PER_HOUR) {
    return `Checked ${minutes}m ago`;
  }
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  if (hours < HOURS_PER_DAY) {
    return `Checked ${hours}h ago`;
  }
  return `Checked ${Math.floor(hours / HOURS_PER_DAY)}d ago`;
}
