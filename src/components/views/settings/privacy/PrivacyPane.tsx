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
import { ask } from '@/lib/bridge/bridge';
import { t } from '@shared/i18n/translate';

// Types
import { DNS_RESOLVERS, describeDns, resolverFor } from '@shared/browsing/dns';
import type { SettingsPaneProps } from '@/components/views/settings/shared/types';
import type { WebRtcPolicy } from '@shared/types';

const DNS_MODES = [
  { id: 'system', label: t('settings.privacy.dns.system') },
  { id: 'encrypted', label: t('settings.privacy.dns.encrypted') },
] as const;

const WEB_RTC_OPTIONS = [
  { id: 'publicOnly', label: t('settings.privacy.calls.publicOnly') },
  { id: 'default', label: t('settings.privacy.calls.all') },
  { id: 'proxiedOnly', label: t('settings.privacy.calls.proxiedOnly') },
] as const satisfies readonly { id: WebRtcPolicy; label: string }[];

/** What each choice lets a page learn, said where the choice is made. */
const WEB_RTC_HELP: Record<WebRtcPolicy, string> = {
  publicOnly: t('settings.privacy.calls.publicOnlyHelp'),
  default: t('settings.privacy.calls.allHelp'),
  proxiedOnly: t('settings.privacy.calls.proxiedOnlyHelp'),
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
      ? t('settings.privacy.browsing.blockTrackers.helpWithLists', {
          rules: listedRules.toLocaleString(),
          domains: info.blockerRuleCount,
        })
      : t('settings.privacy.browsing.blockTrackers.helpOwnOnly', { domains: info.blockerRuleCount })
    : t('settings.privacy.browsing.blockTrackers.helpUnknown');

  // The result is announced as a notice, where everything else the browser finishes is said.
  const checkForNewerLists = () => {
    setIsChecking(true);
    void ask((api) => api.filters.update(), { ok: false, message: '' }).finally(() => setIsChecking(false));
  };

  return (
    <>
      <SettingGroup title={t('settings.privacy.browsing.title')}>
        <SettingRow
          label={t('settings.privacy.browsing.httpsFirst.label')}
          help={t('settings.privacy.browsing.httpsFirst.help')}
          control={
            <Switch
              label={t('settings.privacy.browsing.httpsFirst.label')}
              checked={settings.httpsFirst}
              onChange={(httpsFirst) => updateSettings({ httpsFirst })}
            />
          }
        />
        <SettingRow
          label={t('settings.privacy.browsing.blockTrackers.label')}
          help={trackerHelp}
          control={
            <Switch
              label={t('settings.privacy.browsing.blockTrackers.label')}
              checked={settings.blockTrackers}
              onChange={(blockTrackers) => updateSettings({ blockTrackers })}
            />
          }
        />
      </SettingGroup>

      {lists.length > 0 && (
        <SettingGroup title={t('settings.privacy.filterLists.title')}>
          {lists.map((list) => (
            <SettingRow
              key={list.name}
              label={list.name === 'easylist' ? 'EasyList' : list.name === 'easyprivacy' ? 'EasyPrivacy' : list.name}
              help={list.describe}
              control={
                <span className="text-body-sm text-ink-dim tabular-nums">
                  {list.lastModified
                    ? t('settings.privacy.filterLists.rulesModified', {
                        rules: list.rules.toLocaleString(),
                        modified: list.lastModified,
                      })
                    : t('settings.privacy.filterLists.rules', { rules: list.rules.toLocaleString() })}
                </span>
              }
            />
          ))}
          <SettingRow
            label={t('settings.privacy.filterLists.check.label')}
            help={t('settings.privacy.filterLists.check.help', { hosts: listHosts.join(' and ') })}
            control={
              <Button size="sm" disabled={isChecking} onClick={checkForNewerLists}>
                {isChecking
                  ? t('settings.privacy.filterLists.check.checking')
                  : t('settings.privacy.filterLists.check.action')}
              </Button>
            }
          />
        </SettingGroup>
      )}

      <SettingGroup title={t('settings.privacy.dns.title')}>
        <SettingRow
          label={t('settings.privacy.dns.lookUp')}
          help={describeDns(settings.dnsMode, settings.dnsResolverId)}
          control={
            <SegmentedControl
              label={t('settings.privacy.dns.group')}
              options={DNS_MODES}
              value={settings.dnsMode}
              onChange={(dnsMode) => updateSettings({ dnsMode })}
            />
          }
        />
        {settings.dnsMode === 'encrypted' && (
          <SettingRow
            label={t('settings.privacy.dns.provider')}
            help={resolverFor(settings.dnsResolverId)?.detail}
            control={
              <SegmentedControl
                label={t('settings.privacy.dns.providerGroup')}
                options={PROVIDERS}
                value={settings.dnsResolverId}
                onChange={(dnsResolverId) => updateSettings({ dnsResolverId })}
              />
            }
          />
        )}
      </SettingGroup>

      <SettingGroup title={t('settings.privacy.cookies.title')}>
        <SettingRow
          label={t('settings.privacy.cookies.thirdParty.label')}
          help={t('settings.privacy.cookies.thirdParty.help')}
          control={
            <Switch
              label={t('settings.privacy.cookies.thirdParty.label')}
              checked={settings.blockThirdPartyCookies}
              onChange={(blockThirdPartyCookies) => updateSettings({ blockThirdPartyCookies })}
            />
          }
        />
        <SettingRow
          label={t('settings.privacy.links.label')}
          help={t('settings.privacy.links.help')}
          control={
            <Switch
              label={t('settings.privacy.links.label')}
              checked={settings.cleanLinks}
              onChange={(cleanLinks) => updateSettings({ cleanLinks })}
            />
          }
        />
      </SettingGroup>

      <SettingGroup title={t('settings.privacy.calls.title')}>
        <SettingRow
          label={t('settings.privacy.calls.label')}
          help={WEB_RTC_HELP[settings.webRtcPolicy]}
          control={
            <SegmentedControl
              label={t('settings.privacy.calls.label')}
              options={WEB_RTC_OPTIONS}
              value={settings.webRtcPolicy}
              onChange={(webRtcPolicy) => updateSettings({ webRtcPolicy })}
            />
          }
        />
      </SettingGroup>

      <SettingGroup title={t('settings.privacy.sites.title')}>
        <SettingRow
          label={t('settings.privacy.sites.label')}
          help={t('settings.privacy.sites.help')}
          control={
            <Button size="sm" onClick={() => openPane('sites')}>
              {t('settings.privacy.sites.action')}
            </Button>
          }
        />
      </SettingGroup>
    </>
  );
}
