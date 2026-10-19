'use client';

// Libs
import { useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { SettingGroup, SettingRow } from '@/components/ui/SettingRow/SettingRow';
import { SearchField } from '@/components/ui/TextField/TextField';
import { Select } from '@/components/ui/Select/Select';
import { StatusPill } from '@/components/ui/StatusPill/StatusPill';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { send } from '@/lib/bridge';
import { updateSettings } from '@/components/views/settings/shared/options';
import {
  PERMISSION_NAMES,
  type SiteSettings,
  sitesFrom,
  summaryOf,
  withoutSite,
} from '@/components/views/settings/sites/siteSettings';

// Types
import { ASKABLE_PERMISSIONS, type PermissionDefault } from '@shared/types';

const DEFAULT_OPTIONS: readonly { id: PermissionDefault; label: string }[] = [
  { id: 'ask', label: 'Ask' },
  { id: 'block', label: 'Block' },
];

/** Everything kept about particular sites, one site at a time, in the one place it can all be changed. */
export function SitesPane() {
  const settings = useBrowserStore((state) => state.settings);
  const [query, setQuery] = useState('');
  const [openSite, setOpenSite] = useState<string | null>(null);

  const sites = sitesFrom(settings);
  const needle = query.trim().toLowerCase();
  const shown = needle ? sites.filter((site) => site.site.includes(needle)) : sites;

  if (sites.length === 0) {
    return (
      <>
        <PermissionDefaults />
        <SettingGroup title="Sites">
          <SettingRow
            label="Nothing is kept about any site yet"
            help="Permissions you answer with Remember, zoom levels you change and sites you let show trackers appear here."
          />
        </SettingGroup>
      </>
    );
  }

  return (
    <>
      <PermissionDefaults />
      <SearchField value={query} onChange={setQuery} label="Search sites" />
      <SettingGroup title={`Sites (${sites.length})`}>
        {shown.length === 0 && <SettingRow label="No site matches" />}
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
function PermissionDefaults() {
  const defaults = useBrowserStore((state) => state.settings.permissionDefaults);
  return (
    <SettingGroup title="When a site asks">
      {ASKABLE_PERMISSIONS.map((kind) => (
        <SettingRow
          key={kind}
          label={PERMISSION_NAMES[kind]}
          help={defaults[kind] === 'block' ? 'Refused without asking, unless you allowed the site.' : undefined}
          control={
            <Select
              label={`${PERMISSION_NAMES[kind]} by default`}
              options={DEFAULT_OPTIONS}
              value={defaults[kind] ?? 'ask'}
              onChange={(answer) => updateSettings({ permissionDefaults: { ...defaults, [kind]: answer } })}
            />
          }
        />
      ))}
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
              {isOpen ? 'Done' : 'Change'}
            </Button>
            <Button size="sm" onClick={onReset}>
              Reset
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
                    {permission.decision === 'allow' ? 'Allowed' : 'Blocked'}
                  </StatusPill>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => send((api) => api.permissions.forget(permission.origin, permission.kind))}
                  >
                    Ask again
                  </Button>
                </>
              }
            />
          ))}
          {site.zoomLevels.map((zoom) => (
            <SettingRow
              key={zoom.origin}
              label={`Zoom ${Math.round(zoom.zoomFactor * 100)}%`}
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
                  Use default
                </Button>
              }
            />
          ))}
          {site.allowsTrackers && (
            <SettingRow
              label="Trackers allowed"
              help="Turned off for this site, from its connection details."
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
                  Block again
                </Button>
              }
            />
          )}
        </>
      )}
    </>
  );
}
