// Components
import {
  ChoiceGroup,
  Note,
  RowAction,
  RowList,
  RowValue,
  Section,
  Subheading,
} from '@/components/surfaces/settings/controls';
import { Toggle } from '@/components/ui/Toggle';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { updateSettings } from '@/components/surfaces/settings/options';
import { send } from '@/lib/bridge';
import { cn } from '@/lib/utils';

// Types
import { DNS_RESOLVERS, describeDns, resolverFor } from '../../../../electron/shared/dns';
import { PERMISSION_LABELS, type PermissionKind } from '../../../../electron/shared/types';
import type { SettingsPaneProps } from '@/components/surfaces/settings/types';

export function PrivacyPane({ info }: SettingsPaneProps) {
  const settings = useBrowserStore((state) => state.settings);

  const trackerDescription = info
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
