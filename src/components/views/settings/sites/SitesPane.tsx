'use client';

// Libs
import { useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { SettingGroup, SettingRow } from '@/components/ui/SettingRow/SettingRow';
import { SearchField } from '@/components/ui/TextField/TextField';
import { Select } from '@/components/ui/Select/Select';
import { AddSiteRule } from '@/components/views/settings/sites/AddSiteRule';
import { StatusPill } from '@/components/ui/StatusPill/StatusPill';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { send } from '@/lib/bridge/bridge';
import { t } from '@shared/i18n/translate';
import { updateSettings } from '@/components/views/settings/shared/options';
import {
  PERMISSION_NAMES,
  type SiteSettings,
  answersFor,
  describeDefault,
  sitesFrom,
  summaryOf,
  withoutSite,
} from '@/components/views/settings/sites/siteSettings';

// Types
import { ASKABLE_PERMISSIONS, type AskablePermission, type PermissionDefault } from '@shared/types';

const DEFAULT_OPTIONS: readonly { id: PermissionDefault; label: string }[] = [
  { id: 'ask', label: t('settings.sites.defaults.ask') },
  { id: 'block', label: t('settings.sites.defaults.block') },
];

/** Everything kept about particular sites, one site at a time, in the one place it can all be changed. */
export function SitesPane() {
  const settings = useBrowserStore((state) => state.settings);
  const [query, setQuery] = useState('');
  const [openSite, setOpenSite] = useState<string | null>(null);
  const [kindShown, setKindShown] = useState<AskablePermission | null>(null);

  const sites = sitesFrom(settings);
  const needle = query.trim().toLowerCase();
  const shown = sites
    .filter((site) => !needle || site.site.includes(needle))
    .filter((site) => !kindShown || site.permissions.some((permission) => permission.kind === kindShown));

  if (sites.length === 0) {
    return (
      <>
        <PermissionDefaults sites={sites} onShowSites={setKindShown} />
        <AddSiteRule settings={settings} />
        <SettingGroup title={t('settings.sites.list.empty.title')}>
          <SettingRow label={t('settings.sites.list.empty.label')} help={t('settings.sites.list.empty.help')} />
        </SettingGroup>
      </>
    );
  }

  return (
    <>
      <PermissionDefaults sites={sites} onShowSites={setKindShown} />
      <AddSiteRule settings={settings} />
      <SearchField value={query} onChange={setQuery} label={t('settings.sites.list.search')} />
      {kindShown && (
        <SettingRow
          label={t('settings.sites.list.filtered', { permission: PERMISSION_NAMES[kindShown].toLowerCase() })}
          control={
            <Button size="sm" variant="ghost" onClick={() => setKindShown(null)}>
              {t('settings.sites.list.showEvery')}
            </Button>
          }
        />
      )}
      <SettingGroup title={t('settings.sites.list.title', { count: sites.length })}>
        {shown.length === 0 && <SettingRow label={t('settings.sites.list.noMatch')} />}
        {shown.map((site) => (
          <SiteRows
            key={site.site}
            site={site}
            isOpen={openSite === site.site}
            onToggle={() => setOpenSite((current) => (current === site.site ? null : site.site))}
            onReset={() => updateSettings(withoutSite(settings, site.site))}
          />
        ))}
      </SettingGroup>
    </>
  );
}

/** What a site you have not answered gets; a site you answered keeps its answer. */
function PermissionDefaults({
  sites,
  onShowSites,
}: {
  sites: SiteSettings[];
  onShowSites: (kind: AskablePermission) => void;
}) {
  const defaults = useBrowserStore((state) => state.settings.permissionDefaults);
  return (
    <SettingGroup title={t('settings.sites.defaults.title')}>
      {ASKABLE_PERMISSIONS.map((kind) => {
        const answers = answersFor(sites, kind);
        const hasAnswers = answers.allowed + answers.blocked > 0;
        return (
          <SettingRow
            key={kind}
            label={PERMISSION_NAMES[kind]}
            help={describeDefault(answers, defaults[kind] === 'block')}
            control={
              <>
                {hasAnswers && (
                  <Button size="sm" variant="ghost" onClick={() => onShowSites(kind)}>
                    {t('settings.sites.defaults.showSites')}
                  </Button>
                )}
                <Select
                  label={t('settings.sites.defaults.byDefault', { permission: PERMISSION_NAMES[kind] })}
                  options={DEFAULT_OPTIONS}
                  value={defaults[kind] ?? 'ask'}
                  onChange={(answer) => updateSettings({ permissionDefaults: { ...defaults, [kind]: answer } })}
                />
              </>
            }
          />
        );
      })}
    </SettingGroup>
  );
}

function SiteRows({
  site,
  isOpen,
  onToggle,
  onReset,
}: {
  site: SiteSettings;
  isOpen: boolean;
  onToggle: () => void;
  onReset: () => void;
}) {
  const settings = useBrowserStore((state) => state.settings);
  return (
    <>
      <SettingRow
        label={site.site}
        help={summaryOf(site)}
        control={
          <>
            <Button size="sm" variant="ghost" aria-expanded={isOpen} onClick={onToggle}>
              {isOpen ? t('settings.sites.site.done') : t('settings.sites.site.change')}
            </Button>
            <Button size="sm" onClick={onReset}>
              {t('settings.sites.site.reset')}
            </Button>
          </>
        }
      />
      {isOpen && (
        <>
          {site.permissions.map((permission) => (
            <SettingRow
              key={`${permission.origin}|${permission.kind}`}
              label={PERMISSION_NAMES[permission.kind]}
              help={permission.origin.replace(/^https?:\/\//, '')}
              control={
                <>
                  <StatusPill status={permission.decision === 'allow' ? 'secure' : 'danger'}>
                    {permission.decision === 'allow'
                      ? t('settings.sites.site.allowed')
                      : t('settings.sites.site.blocked')}
                  </StatusPill>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => send((api) => api.permissions.forget(permission.origin, permission.kind))}
                  >
                    {t('settings.sites.site.askAgain')}
                  </Button>
                </>
              }
            />
          ))}
          {site.zoomLevels.map((zoom) => (
            <SettingRow
              key={zoom.origin}
              label={t('settings.sites.site.zoom', { percent: Math.round(zoom.zoomFactor * 100) })}
              help={zoom.origin.replace(/^https?:\/\//, '')}
              control={
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    updateSettings({
                      zoomLevels: Object.fromEntries(
                        Object.entries(settings.zoomLevels).filter(([origin]) => origin !== zoom.origin),
                      ),
                    })
                  }
                >
                  {t('settings.sites.site.useDefault')}
                </Button>
              }
            />
          ))}
          {site.allowsTrackers && (
            <SettingRow
              label={t('settings.sites.trackersAllowed')}
              help={t('settings.sites.site.trackersHelp')}
              control={
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    updateSettings({
                      blockerAllowlist: settings.blockerAllowlist.filter((entry) => entry !== site.site),
                    })
                  }
                >
                  {t('settings.sites.site.blockAgain')}
                </Button>
              }
            />
          )}
        </>
      )}
    </>
  );
}
