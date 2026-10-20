'use client';

// Libs
import { useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { IconButton } from '@/components/ui/IconButton/IconButton';
import { Menu } from '@/components/ui/Menu/Menu';
import { SettingGroup, SettingRow } from '@/components/ui/SettingRow/SettingRow';
import { SearchField } from '@/components/ui/TextField/TextField';
import { SegmentedControl } from '@/components/ui/SegmentedControl/SegmentedControl';
import { Select } from '@/components/ui/Select/Select';
import { AddSiteRule } from '@/components/views/settings/sites/AddSiteRule';
import { StatusPill } from '@/components/ui/StatusPill/StatusPill';

// Icons
import { Ellipsis } from 'lucide-react';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { send } from '@/lib/bridge/bridge';
import { t } from '@shared/i18n/translate';
import { groupIdOf } from '@shared/tabs/open-rules';
import { updateSettings } from '@/components/views/settings/shared/options';
import {
  PERMISSION_NAMES,
  type SiteSettings,
  answersFor,
  describeDefault,
  sitesFrom,
  summaryOf,
} from '@/components/views/settings/sites/siteSettings';

// Types
import { ASKABLE_PERMISSIONS, type AskablePermission, type PermissionDefault } from '@shared/types';

const ZOOM_LEVELS = [0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2].map((level) => ({
  id: String(level),
  label: `${Math.round(level * 100)}%`,
}));

type SiteFilter = 'all' | 'permissions' | 'zoom' | 'trackers' | 'opensIn';

const FILTER_OPTIONS: readonly { id: SiteFilter; label: string }[] = [
  { id: 'all', label: t('settings.sites.list.filters.all') },
  { id: 'permissions', label: t('settings.sites.list.filters.permissions') },
  { id: 'zoom', label: t('settings.sites.list.filters.zoom') },
  { id: 'trackers', label: t('settings.sites.list.filters.trackers') },
  { id: 'opensIn', label: t('settings.sites.list.filters.opensIn') },
];

function matchesFilter(site: SiteSettings, filter: SiteFilter): boolean {
  switch (filter) {
    case 'permissions':
      return site.permissions.length > 0;
    case 'zoom':
      return site.zoomLevels.length > 0;
    case 'trackers':
      return site.allowsTrackers;
    case 'opensIn':
      return site.opensIn !== null;
    case 'all':
      return true;
  }
}

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
  const [filter, setFilter] = useState<SiteFilter>('all');

  const sites = sitesFrom(settings);
  const needle = query.trim().toLowerCase();
  const shown = sites
    .filter((site) => !needle || site.site.includes(needle))
    .filter((site) => !kindShown || site.permissions.some((permission) => permission.kind === kindShown))
    .filter((site) => matchesFilter(site, filter));

  if (sites.length === 0) {
    return (
      <>
        <PermissionDefaults sites={sites} onShowSites={setKindShown} />
        <DefaultZoom />
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
      <DefaultZoom />
      <AddSiteRule settings={settings} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-56 flex-1">
          <SearchField value={query} onChange={setQuery} label={t('settings.sites.list.search')} />
        </div>
        <SegmentedControl
          label={t('settings.sites.list.filters.label')}
          options={FILTER_OPTIONS}
          value={filter}
          onChange={setFilter}
        />
      </div>
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
            onReset={() => send((api) => api.settings.resetSite(site.site))}
          />
        ))}
      </SettingGroup>
    </>
  );
}

/** Beside the sites that have their own zoom, which is where someone looking for it goes. */
function DefaultZoom() {
  const defaultZoomFactor = useBrowserStore((state) => state.settings.defaultZoomFactor);
  return (
    <SettingGroup title={t('settings.sites.zoom.title')}>
      <SettingRow
        label={t('settings.sites.zoom.default.label')}
        help={t('settings.sites.zoom.default.help')}
        control={
          <Select
            label={t('settings.sites.zoom.default.label')}
            options={ZOOM_LEVELS}
            value={String(defaultZoomFactor)}
            onChange={(level) => updateSettings({ defaultZoomFactor: Number(level) })}
          />
        }
      />
    </SettingGroup>
  );
}

/** What a site you have not answered gets, one line per kind; a site you answered keeps its answer. */
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
      <table className="w-full text-reading">
        <thead className="sr-only">
          <tr>
            <th scope="col">{t('settings.sites.defaults.columns.kind')}</th>
            <th scope="col">{t('settings.sites.defaults.columns.answered')}</th>
            <th scope="col">{t('settings.sites.defaults.columns.default')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {ASKABLE_PERMISSIONS.map((kind) => {
            const answers = answersFor(sites, kind);
            const answered = answers.allowed + answers.blocked;
            const description = describeDefault(answers, defaults[kind] === 'block');
            return (
              <tr key={kind} data-setting-row>
                <th scope="row" className="px-4 py-2 text-left font-medium text-ink">
                  {PERMISSION_NAMES[kind]}
                  {description && <div className="text-body font-normal text-ink-dim">{description}</div>}
                </th>
                <td className="px-2 py-2 text-right">
                  {answered > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => onShowSites(kind)}>
                      {t('settings.sites.siteCount', { count: answered })}
                    </Button>
                  )}
                </td>
                <td className="w-0 py-2 pr-4">
                  <Select
                    label={t('settings.sites.defaults.byDefault', { permission: PERMISSION_NAMES[kind] })}
                    options={DEFAULT_OPTIONS}
                    value={defaults[kind] ?? 'ask'}
                    onChange={(answer) => updateSettings({ permissionDefaults: { ...defaults, [kind]: answer } })}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
  const groups = useBrowserStore((state) => state.groups);
  const opensInGroupId = site.opensIn ? groupIdOf(site.opensIn) : null;
  const opensInGroup = groups.find((group) => group.id === opensInGroupId);
  return (
    <>
      <SettingRow
        label={site.site}
        help={summaryOf(site)}
        control={
          <>
            <Button size="sm" aria-expanded={isOpen} onClick={onToggle}>
              {isOpen ? t('settings.sites.site.done') : t('settings.sites.site.change')}
            </Button>
            {/* Out of the row's reach: forgetting a site is one click from a menu, with Undo after. */}
            <Menu
              trigger={
                <IconButton label={t('settings.sites.site.more', { site: site.site })}>
                  <Ellipsis size={16} />
                </IconButton>
              }
              items={[{ label: t('settings.sites.site.reset'), isDestructive: true, onSelect: onReset }]}
            />
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
          {site.opensIn && (
            <SettingRow
              label={
                site.opensIn === 'hush'
                  ? t('settings.sites.site.opensInHush')
                  : opensInGroup
                    ? t('settings.sites.site.opensInGroup', { group: opensInGroup.name })
                    : t('settings.sites.site.opensGroupGone')
              }
              help={t('settings.sites.site.opensHelp')}
              control={
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    updateSettings({
                      openRules: Object.fromEntries(
                        Object.entries(settings.openRules).filter(([key]) => key !== site.site),
                      ),
                    })
                  }
                >
                  {t('settings.sites.site.openAnywhere')}
                </Button>
              }
            />
          )}
        </>
      )}
    </>
  );
}
