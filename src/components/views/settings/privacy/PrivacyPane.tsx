'use client';

// Libs
import { useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl/SegmentedControl';
import { SettingGroup, SettingRow } from '@/components/ui/SettingRow/SettingRow';
import { StatusPill } from '@/components/ui/StatusPill/StatusPill';
import { Switch } from '@/components/ui/Switch/Switch';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { updateSettings } from '@/components/views/settings/shared/options';
import { ask, send } from '@/lib/bridge';

// Types
import { DNS_RESOLVERS, describeDns, resolverFor } from '@shared/dns';
import { PERMISSION_LABELS, type PermissionDecision, type PermissionKind } from '@shared/types';
import type { SettingsPaneProps } from '@/components/views/settings/shared/types';

const DNS_MODES = [
  { id: 'system', label: 'System' },
  { id: 'encrypted', label: 'Encrypted' },
] as const;

const PROVIDERS = DNS_RESOLVERS.map((resolver) => ({ id: resolver.id, label: resolver.name }));

export function PrivacyPane({ info }: SettingsPaneProps) {
  const settings = useBrowserStore((state) => state.settings);
  const [isChecking, setIsChecking] = useState(false);

  const lists = info?.filterLists ?? [];
  const listedRules = lists.reduce((total, list) => total + list.rules, 0);
  const listHosts = [...new Set(lists.map((list) => new URL(list.url).hostname))];

  // Counted from the blocker, never written out: a number in copy goes stale silently.
  const trackerHelp = info
    ? listedRules > 0
      ? `${listedRules.toLocaleString()} rules from EasyList and EasyPrivacy, plus ${info.blockerRuleCount} domains Copacetic blocks itself.`
      : `Blocks ${info.blockerRuleCount} domains that exist to follow you between sites.`
    : 'Blocks domains that exist to follow you between sites.';

  // The result is announced as a notice, where everything else the browser finishes is said.
  const checkForNewerLists = () => {
    setIsChecking(true);
    void ask((api) => api.filters.update(), { ok: false, message: '' }).finally(() => setIsChecking(false));
  };

  return (
    <>
      <SettingGroup title="Browsing">
        <SettingRow
          label="Always use secure connections"
          help="Tries HTTPS first, and asks before falling back to HTTP. Your own network is left alone."
          control={
            <Switch
              label="Always use secure connections"
              checked={settings.httpsFirst}
              onChange={(httpsFirst) => updateSettings({ httpsFirst })}
            />
          }
        />
        <SettingRow
          label="Block trackers and ads"
          help={trackerHelp}
          control={
            <Switch
              label="Block trackers and ads"
              checked={settings.blockTrackers}
              onChange={(blockTrackers) => updateSettings({ blockTrackers })}
            />
          }
        />
      </SettingGroup>

      {lists.length > 0 && (
        <SettingGroup title="Filter lists">
          {lists.map((list) => (
            <SettingRow
              key={list.name}
              label={list.name === 'easylist' ? 'EasyList' : list.name === 'easyprivacy' ? 'EasyPrivacy' : list.name}
              help={list.describe}
              control={
                <span className="text-body-sm text-ink-dim tabular-nums">
                  {list.rules.toLocaleString()} rules{list.lastModified ? ` · ${list.lastModified}` : ''}
                </span>
              }
            />
          ))}
          <SettingRow
            label="Check for newer lists"
            help={`Contacts ${listHosts.join(' and ')} once. Lists never update on their own.`}
            control={
              <Button size="sm" disabled={isChecking} onClick={checkForNewerLists}>
                {isChecking ? 'Checking…' : 'Check now'}
              </Button>
            }
          />
        </SettingGroup>
      )}

      <AllowlistGroup sites={settings.blockerAllowlist} />

      <SettingGroup title="Secure DNS">
        <SettingRow
          label="Look up sites"
          help={describeDns(settings.dnsMode, settings.dnsResolverId)}
          control={
            <SegmentedControl
              label="DNS"
              options={DNS_MODES}
              value={settings.dnsMode}
              onChange={(dnsMode) => updateSettings({ dnsMode })}
            />
          }
        />
        {settings.dnsMode === 'encrypted' && (
          <SettingRow
            label="Provider"
            help={resolverFor(settings.dnsResolverId)?.detail}
            control={
              <SegmentedControl
                label="DNS provider"
                options={PROVIDERS}
                value={settings.dnsResolverId}
                onChange={(dnsResolverId) => updateSettings({ dnsResolverId })}
              />
            }
          />
        )}
      </SettingGroup>

      <PermissionGroup decisions={settings.permissionDecisions} />
    </>
  );
}

function AllowlistGroup({ sites }: { sites: string[] }) {
  if (sites.length === 0) {
    return null;
  }
  return (
    <SettingGroup title="Sites allowed to show trackers">
      {sites.map((site) => (
        <SettingRow
          key={site}
          label={site}
          control={
            <Button
              size="sm"
              variant="ghost"
              onClick={() => updateSettings({ blockerAllowlist: sites.filter((entry) => entry !== site) })}
            >
              Block again
            </Button>
          }
        />
      ))}
    </SettingGroup>
  );
}

function PermissionGroup({ decisions }: { decisions: Record<string, PermissionDecision> }) {
  const entries = Object.entries(decisions)
    .map(([key, decision]) => {
      const [origin = '', kind = ''] = key.split('|');
      return { key, origin, kind, decision };
    })
    .filter((entry): entry is typeof entry & { kind: PermissionKind } => entry.kind in PERMISSION_LABELS);

  return (
    <SettingGroup title="Site permissions">
      {entries.length === 0 ? (
        <SettingRow label="No site has been allowed or blocked yet" help="Sites ask when they need something." />
      ) : (
        entries.map((entry) => (
          <SettingRow
            key={entry.key}
            label={entry.origin.replace(/^https?:\/\//, '')}
            help={PERMISSION_LABELS[entry.kind]}
            control={
              <>
                <StatusPill status={entry.decision === 'allow' ? 'secure' : 'danger'}>
                  {entry.decision === 'allow' ? 'Allowed' : 'Blocked'}
                </StatusPill>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => send((api) => api.permissions.forget(entry.origin, entry.kind))}
                >
                  Reset
                </Button>
              </>
            }
          />
        ))
      )}
    </SettingGroup>
  );
}
