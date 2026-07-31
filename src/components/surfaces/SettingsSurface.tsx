'use client';

import { useEffect, useState } from 'react';
import type { AppInfo, PermissionKind, Settings, ThemeId } from '../../../electron/shared/types';
import { SEARCH_ENGINE_OPTIONS } from '../../../electron/shared/url';
import { Toggle } from '@/components/ui/Toggle';
import { ask, send } from '@/lib/bridge';
import { cn } from '@/lib/utils';
import { useBrowserStore } from '@/store/useBrowserStore';
import { SurfaceShell } from './SurfaceShell';

const THEMES: { id: ThemeId; label: string }[] = [
  { id: 'deep', label: 'Deep' },
  { id: 'slate', label: 'Slate' },
  { id: 'ember', label: 'Ember' },
  { id: 'moss', label: 'Moss' },
];

export function SettingsSurface() {
  const settings = useBrowserStore((state) => state.settings);
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    void ask((api) => api.app.getInfo(), null).then(setInfo);
  }, []);

  const update = (patch: Partial<Settings>) => send((api) => api.settings.update(patch));

  return (
    <SurfaceShell title="Settings" subtitle="Everything here is stored on this machine only.">
      <div className="mx-auto w-full max-w-2xl px-6 py-6">
        <Section title="Search">
          <p className="mb-3 text-[12px] leading-relaxed text-ink-faint">
            Typing something that is not an address sends it here. Copacetic never contacts a search engine for
            suggestions as you type — the list under the address bar comes from your own history.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {SEARCH_ENGINE_OPTIONS.map((engine) => (
              <button
                key={engine.id}
                type="button"
                onClick={() => update({ searchEngine: engine.id })}
                className={cn(
                  'rounded-field border px-3 py-2 text-left text-[12.5px] transition-colors',
                  settings.searchEngine === engine.id
                    ? 'border-line-strong bg-hover text-ink'
                    : 'border-line text-ink-dim hover:bg-raised hover:text-ink',
                )}
              >
                {engine.name}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Privacy">
          <Toggle
            label="Upgrade addresses to HTTPS"
            description="Type example.com and Copacetic tries the encrypted version first. Loopback addresses are left alone."
            checked={settings.httpsFirst}
            onChange={(httpsFirst) => update({ httpsFirst })}
          />
          <Toggle
            label="Block known trackers"
            description={
              info
                ? `Blocks requests to ${info.blockerRuleCount} domains that exist only to follow you between sites. The count in the address bar is the real number blocked on the current page.`
                : 'Blocks requests to domains that exist only to follow you between sites.'
            }
            checked={settings.blockTrackers}
            onChange={(blockTrackers) => update({ blockTrackers })}
          />
          <PermissionList decisions={settings.permissionDecisions} />
        </Section>

        <Section title="Start page">
          <div className="mb-3 flex gap-2">
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                onClick={() => update({ theme: theme.id })}
                aria-pressed={settings.theme === theme.id}
                className={cn(
                  'flex-1 rounded-field border px-3 py-2 text-[12.5px] transition-colors',
                  settings.theme === theme.id
                    ? 'border-line-strong bg-hover text-ink'
                    : 'border-line text-ink-dim hover:bg-raised hover:text-ink',
                )}
              >
                {theme.label}
              </button>
            ))}
          </div>
          <p className="mb-1 text-[12px] leading-relaxed text-ink-faint">
            The atmosphere only tints the start page. The rest of the interface stays monochrome so colour always
            means the same thing.
          </p>
          <Toggle
            label="Show the clock"
            checked={settings.showStartPageClock}
            onChange={(showStartPageClock) => update({ showStartPageClock })}
          />
          <Toggle
            label="Show most-visited sites"
            description="Ranked from how often you actually visit them."
            checked={settings.showTopSites}
            onChange={(showTopSites) => update({ showTopSites })}
          />
        </Section>

        <Section title="On launch">
          <Toggle
            label="Reopen the tabs I had open"
            checked={settings.restoreTabsOnLaunch}
            onChange={(restoreTabsOnLaunch) => update({ restoreTabsOnLaunch })}
          />
        </Section>

        <Section title="Browsing data">
          <p className="mb-3 text-[12px] leading-relaxed text-ink-faint">
            History older than 90 days is dropped automatically. Clearing everything also empties cookies, site
            storage and the cache.
          </p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { range: 'hour', label: 'Last hour' },
                { range: 'day', label: 'Last 24 hours' },
                { range: 'week', label: 'Last 7 days' },
                { range: 'all', label: 'Everything' },
              ] as const
            ).map((option) => (
              <button
                key={option.range}
                type="button"
                onClick={() => send((api) => api.history.clear(option.range))}
                className={cn(
                  'rounded-field border border-line px-3 py-1.5 text-[12.5px] transition-colors hover:bg-raised',
                  option.range === 'all' ? 'text-alert hover:border-alert/40' : 'text-ink-dim hover:text-ink',
                )}
              >
                Clear {option.label.toLowerCase()}
              </button>
            ))}
          </div>
        </Section>

        {info && (
          <Section title="About">
            <dl className="space-y-1.5 font-mono text-[11.5px]">
              <InfoRow label="Copacetic" value={info.version} />
              <InfoRow label="Electron" value={info.electronVersion} />
              <InfoRow label="Chromium" value={info.chromeVersion} />
              <InfoRow label="Platform" value={info.platform} />
            </dl>
            <p className="mt-4 text-[12px] leading-relaxed text-ink-faint">
              Copacetic renders pages with Chromium. It is a browser interface, not a browser engine — the rendering,
              networking and sandboxing are Chromium&apos;s.
            </p>
          </Section>
        )}
      </div>
    </SurfaceShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line py-6 first:pt-0 last:border-b-0">
      <h2 className="label mb-3">{title}</h2>
      {children}
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="text-ink-dim">{value}</dd>
    </div>
  );
}

/** Sites that have already been given, or refused, a capability. */
function PermissionList({ decisions }: { decisions: Record<string, 'allow' | 'deny'> }) {
  const entries = Object.entries(decisions);
  if (entries.length === 0) return null;

  return (
    <div className="mt-4">
      <h3 className="label mb-2">Site permissions</h3>
      <ul className="divide-y divide-line rounded-field border border-line">
        {entries.map(([key, decision]) => {
          const [origin = '', kind = ''] = key.split('|');
          return (
            <li key={key} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink-dim">{origin}</span>
              <span className="shrink-0 text-[11.5px] text-ink-faint">{kind}</span>
              <span className={cn('label shrink-0', decision === 'allow' ? 'text-clear' : 'text-alert')}>
                {decision === 'allow' ? 'Allowed' : 'Blocked'}
              </span>
              <button
                type="button"
                onClick={() => send((api) => api.permissions.forget(origin, kind as PermissionKind))}
                className="shrink-0 rounded px-2 py-0.5 text-[11.5px] text-ink-faint transition-colors hover:bg-hover hover:text-ink"
              >
                Reset
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
