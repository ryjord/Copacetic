'use client';

// Libs
import { useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl/SegmentedControl';
import { SettingGroup, SettingRow } from '@/components/ui/SettingRow/SettingRow';
import { Switch } from '@/components/ui/Switch/Switch';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { updateSettings } from '@/components/views/settings/shared/options';
import { ask } from '@/lib/bridge';

// Types
import { DNS_RESOLVERS, describeDns, resolverFor } from '@shared/dns';
import type { SettingsPaneProps } from '@/components/views/settings/shared/types';
import type { WebRtcPolicy } from '@shared/types';

const DNS_MODES = [
  { id: 'system', label: 'System' },
  { id: 'encrypted', label: 'Encrypted' },
] as const;

const WEB_RTC_OPTIONS = [
  { id: 'publicOnly', label: 'Public only' },
  { id: 'default', label: 'All' },
  { id: 'proxiedOnly', label: 'Proxied only' },
] as const satisfies readonly { id: WebRtcPolicy; label: string }[];

/** What each choice lets a page learn, said where the choice is made. */
const WEB_RTC_HELP: Record<WebRtcPolicy, string> = {
  publicOnly:
    'Calls and video work, and a page can learn your public address but not the one on your home or office network.',
  default: 'A page can learn your local network address as well. Only for a call that will not connect otherwise.',
  proxiedOnly:
    'Calls go through your proxy or not at all, so nothing is revealed that the proxy does not already show.',
};

const PROVIDERS = DNS_RESOLVERS.map((resolver) => ({ id: resolver.id, label: resolver.name }));

export function PrivacyPane({ info, openPane }: SettingsPaneProps) {
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

      <SettingGroup title="Cookies">
        <SettingRow
          label="Block third-party cookies"
          help="A site other than the one you are on cannot send or set a cookie with what it loads into the page, which is how most tracking across sites works. A site you let show trackers is let through too. Cookies a third-party frame sets with script are not covered."
          control={
            <Switch
              label="Block third-party cookies"
              checked={settings.blockThirdPartyCookies}
              onChange={(blockThirdPartyCookies) => updateSettings({ blockThirdPartyCookies })}
            />
          }
        />
      </SettingGroup>

      <SettingGroup title="Calls and video">
        <SettingRow
          label="Addresses WebRTC may reveal"
          help={WEB_RTC_HELP[settings.webRtcPolicy]}
          control={
            <SegmentedControl
              label="Addresses WebRTC may reveal"
              options={WEB_RTC_OPTIONS}
              value={settings.webRtcPolicy}
              onChange={(webRtcPolicy) => updateSettings({ webRtcPolicy })}
            />
          }
        />
      </SettingGroup>

      <SettingGroup title="Sites">
        <SettingRow
          label="Site settings"
          help="Permissions, zoom levels and tracker exceptions, for each site."
          control={
            <Button size="sm" onClick={() => openPane('sites')}>
              Open
            </Button>
          }
        />
      </SettingGroup>
    </>
  );
}
