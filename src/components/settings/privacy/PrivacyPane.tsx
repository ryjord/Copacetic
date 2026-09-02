import { useState } from 'react';
// Components
import {
  ChoiceGroup,
  Note,
  RowAction,
  RowList,
  RowValue,
  Section,
  Subheading,
} from '@/components/settings/shared/controls';
import { Toggle } from '@/components/ui/controls/Toggle';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { updateSettings } from '@/components/settings/shared/options';
import { ask, send } from '@/lib/bridge';
import { cn } from '@/lib/utils';

// Types
import { DNS_RESOLVERS, describeDns, resolverFor } from '@shared/dns';
import { PERMISSION_LABELS, type PermissionKind } from '@shared/types';
import type { SettingsPaneProps } from '@/components/settings/shared/types';

export function PrivacyPane({ info }: SettingsPaneProps) {
  const settings = useBrowserStore((state) => state.settings);

  const [checking, setChecking] = useState(false);
  const lists = info?.filterLists ?? [];
  const listedRules = lists.reduce((total, list) => total + list.rules, 0);
  const hosts = [...new Set(lists.map((list) => new URL(list.url).hostname))];

  const trackerDescription = listedRules
    ? `${listedRules.toLocaleString()} rules from the lists below, and ${info?.blockerRuleCount ?? 0} hostnames Copacetic keeps itself. The count in the address bar is the real number blocked on the page you are on.`
    : info
      ? `Blocks requests to ${info.blockerRuleCount} domains that exist only to follow you between sites. The count in the address bar is the real number blocked on the current page.`
      : 'Blocks requests to domains that exist only to follow you between sites.';

  return (
    <>
      <Section title="Privacy">
        <Toggle
          label="Upgrade addresses to HTTPS"
          description="Type example.com and Copacetic tries the encrypted version first. Loopback addresses are left alone."
          checked={settings.httpsFirst}
          onChange={(httpsFirst) => updateSettings({ httpsFirst })}
        />
        <Toggle
          label="Block known trackers"
          description={trackerDescription}
          checked={settings.blockTrackers}
          onChange={(blockTrackers) => updateSettings({ blockTrackers })}
        />
        <AllowlistedSites sites={settings.blockerAllowlist} />
        <PermissionList decisions={settings.permissionDecisions} />
      </Section>

      {lists.length > 0 && (
        <Section title="The lists">
          <Note>
            These came with this version of Copacetic and have not changed since. They will not change on their own:
            checking for a newer one is a request to a server, and this browser does not make those on a schedule
            without being asked.
          </Note>
          <RowList>
            {lists.map((list) => (
              <div key={list.name} className="flex items-baseline justify-between gap-4 py-2">
                <div className="min-w-0">
                  <p className="text-[13px] text-ink">{list.name}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-ink-faint">{list.describe}</p>
                </div>
                <RowValue>
                  {list.rules.toLocaleString()} rules
                  {list.lastModified ? ` · ${list.lastModified}` : ''}
                </RowValue>
              </div>
            ))}
          </RowList>

          <div className="mt-1 flex items-center gap-3">
            <button
              type="button"
              disabled={checking}
              onClick={async () => {
                setChecking(true);
                // The result arrives as a notice, said once, where everything
                // else the app finishes is said.
                await ask((api) => api.filters.update(), { ok: false, message: '' });
                setChecking(false);
              }}
              className="rounded-field border border-line px-3 py-1.5 text-[12.5px] text-ink-dim transition-colors hover:bg-raised hover:text-ink disabled:opacity-50"
            >
              {checking ? 'Checking…' : 'Check for newer lists'}
            </button>
            {/* Named before it is pressed. This is the one thing in the browser
                that contacts a server nobody navigated to. */}
            <span className="font-mono text-[11px] text-ink-faint">contacts {hosts.join(' and ')}, once</span>
          </div>

          <div className="h-3" aria-hidden />
          <Subheading>What this cannot do</Subheading>
          <Note>
            An advert served from the same address as the page cannot be told apart from the page. One inserted by the
            server is part of the document before it arrives. A sponsored post inside a feed is the feed. None of
            those are blocked here, and a number that implied otherwise would be flattering itself.
          </Note>
        </Section>
      )}

      <Section title="Where names are looked up">
        <Note>{describeDns(settings.dnsMode, settings.dnsResolverId)}</Note>
        <ChoiceGroup
          options={[
            { id: 'system', label: 'Your network' },
            { id: 'encrypted', label: 'Encrypted' },
          ]}
          selected={settings.dnsMode}
          onSelect={(dnsMode) => updateSettings({ dnsMode })}
        />
        {settings.dnsMode === 'encrypted' && (
          <div className="mt-3">
            <Subheading>Who answers</Subheading>
            <ChoiceGroup
              options={DNS_RESOLVERS.map((resolver) => ({ id: resolver.id, label: resolver.name }))}
              selected={settings.dnsResolverId}
              onSelect={(dnsResolverId) => updateSettings({ dnsResolverId })}
              layout="grid"
            />
            <p className="mt-2 text-[12px] leading-relaxed text-ink-faint">
              {resolverFor(settings.dnsResolverId)?.detail}
            </p>
          </div>
        )}
        {/* Chromium reads this once at startup; saying so beats appearing broken. */}
        <p className="mt-3 text-[12px] text-caution">This takes effect the next time Copacetic starts.</p>
      </Section>

      <Section title="Zoom">
        <Note>
          Zooming a site with <span className="font-mono">Cmd/Ctrl +</span> and <span className="font-mono">-</span>{' '}
          is remembered for that site, so you only set it once.
        </Note>
        <ZoomList levels={settings.zoomLevels} />
      </Section>
    </>
  );
}

function AllowlistedSites({ sites }: { sites: string[] }) {
  if (sites.length === 0) {
    return null;
  }

  return (
    <div className="mt-4">
      <Subheading>Trackers allowed on</Subheading>
      <RowList>
        {sites.map((site) => (
          <li key={site} className="flex items-center gap-3 px-3 py-2">
            <RowValue>{site}</RowValue>
            <RowAction
              label="Block again"
              onClick={() => updateSettings({ blockerAllowlist: sites.filter((entry) => entry !== site) })}
            />
          </li>
        ))}
      </RowList>
    </div>
  );
}

function ZoomList({ levels }: { levels: Record<string, number> }) {
  const entries = Object.entries(levels);
  if (entries.length === 0) {
    return <p className="text-[12px] text-ink-faint">No site is zoomed away from the default yet.</p>;
  }

  return (
    <RowList>
      {entries.map(([origin, level]) => (
        <li key={origin} className="flex items-center gap-3 px-3 py-2">
          <RowValue>{origin}</RowValue>
          <span className="shrink-0 font-mono text-[11.5px] text-ink-faint">{Math.round(level * 100)}%</span>
          <RowAction label="Reset" onClick={() => updateSettings({ zoomLevels: withoutOrigin(levels, origin) })} />
        </li>
      ))}
    </RowList>
  );
}

function withoutOrigin(levels: Record<string, number>, origin: string): Record<string, number> {
  const next = { ...levels };
  delete next[origin];
  return next;
}

function PermissionList({ decisions }: { decisions: Record<string, 'allow' | 'deny'> }) {
  const entries = Object.entries(decisions);
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="mt-4">
      <Subheading>Site permissions</Subheading>
      <RowList>
        {entries.map(([key, decision]) => {
          const [origin = '', kind = ''] = key.split('|');
          const permissionKind = kind as PermissionKind;
          return (
            <li key={key} className="flex items-center gap-3 px-3 py-2">
              <RowValue>{origin}</RowValue>
              <span className="shrink-0 text-[11.5px] text-ink-faint">
                {PERMISSION_LABELS[permissionKind] ?? kind}
              </span>
              <span className={cn('label shrink-0', decision === 'allow' ? 'text-clear' : 'text-alert')}>
                {decision === 'allow' ? 'Allowed' : 'Blocked'}
              </span>
              <RowAction
                label="Reset"
                onClick={() => send((api) => api.permissions.forget(origin, permissionKind))}
              />
            </li>
          );
        })}
      </RowList>
    </div>
  );
}
