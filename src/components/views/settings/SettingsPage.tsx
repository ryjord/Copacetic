'use client';

// Libs
import { useEffect, useRef, useState } from 'react';

// Components
import { ConfirmDialog } from '@/components/ui/ConfirmDialog/ConfirmDialog';
import { IconButton } from '@/components/ui/IconButton/IconButton';
import { Menu } from '@/components/ui/Menu/Menu';
import { PageHeader } from '@/components/ui/PageHeader/PageHeader';
import { SearchField } from '@/components/ui/TextField/TextField';
import {
  NAV_GROUPS,
  PANE_SETTINGS,
  PANE_TITLES,
  SETTINGS_PANES,
  WIDE_PANES,
  type PaneId,
  matchesTerm,
  searchSettings,
} from '@/components/views/settings/shared/panes';
import { PageShell } from '@/components/shell/PageShell/PageShell';

// Icons
import { Ellipsis } from 'lucide-react';

// Utils
import { ask, send } from '@/lib/bridge/bridge';
import { DEFAULT_SETTINGS_SHAPE } from '@/lib/state/defaults';
import { cn } from '@/lib/utils';
import { updateSettings } from '@/components/views/settings/shared/options';
import { internalPageUrl } from '@shared/tabs/internal-pages';
import { t } from '@shared/i18n/translate';

// Types
import type { AppInfo } from '@shared/types';

/** Settings in a tab of its own; the pane is part of the tab's address, so it survives a restart. */
export function SettingsPage({ tabId, section }: { tabId: string; section: string | null }) {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const activePaneId: PaneId = SETTINGS_PANES.find((pane) => pane.id === section)?.id ?? 'general';
  const [query, setQuery] = useState('');
  // What a search result asked for, each request its own, so asking twice for the same row still lands.
  const [landing, setLanding] = useState<{ term: string; request: number } | null>(null);
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);
  const paneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void ask((api) => api.app.getInfo(), null).then(setInfo);
  }, []);

  const activePane = SETTINGS_PANES.find((pane) => pane.id === activePaneId) ?? SETTINGS_PANES[0];
  const ActivePane = activePane.Component;
  const matches = searchSettings(query);

  const openPane = (id: string, term?: string) => {
    const pane = SETTINGS_PANES.find((candidate) => candidate.id === id);
    if (pane) {
      send((api) => api.tabs.navigate(tabId, internalPageUrl('settings', pane.id)));
      setQuery('');
      setLanding((previous) => (term ? { term, request: (previous?.request ?? 0) + 1 } : null));
    }
  };

  // Lands on the row a search was for, so nobody has to read the pane again to find it.
  useEffect(() => {
    if (!landing) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const candidates = [...(paneRef.current?.querySelectorAll<HTMLElement>('[data-setting-row]') ?? [])];
      const target =
        candidates.find((row) => matchesTerm(row.textContent ?? '', landing.term)) ??
        [...(paneRef.current?.querySelectorAll<HTMLElement>('[data-setting-group]') ?? [])].find((group) =>
          matchesTerm(group.dataset.settingGroup ?? '', landing.term),
        );
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      target?.classList.add('animate-setting-landed');
      window.setTimeout(() => target?.classList.remove('animate-setting-landed'), 1_800);
    });
    return () => cancelAnimationFrame(frame);
  }, [landing, activePaneId]);

  const ownedSettings = PANE_SETTINGS[activePane.id];
  const resetPane = () => {
    if (ownedSettings) {
      updateSettings(Object.fromEntries(ownedSettings.map((key) => [key, DEFAULT_SETTINGS_SHAPE[key]])));
    }
  };
  const title = PANE_TITLES[activePane.id] ?? activePane.label;
  const isWide = WIDE_PANES.includes(activePane.id);

  return (
    <PageShell title={t('settings.surface.title')} scrolls={false}>
      <div className="flex min-h-0 flex-1">
        <nav
          aria-label={t('settings.surface.sections')}
          className="flex w-66 flex-none flex-col gap-3 border-r border-line bg-toolbar px-3 py-5"
        >
          <SearchField value={query} onChange={setQuery} label={t('settings.surface.search')} />
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="flex flex-col gap-0.5">
              <h3 className="px-2.5 pb-1 pt-1.5 text-caption font-semibold uppercase tracking-wide text-ink-faint">
                {group.label}
              </h3>
              <ul className="flex flex-col gap-0.5">
                {SETTINGS_PANES.filter((pane) => group.paneIds.includes(pane.id)).map((pane) => {
                  const Icon = pane.icon;
                  const isActive = pane.id === activePaneId && !query;
                  return (
                    <li key={pane.id}>
                      <button
                        type="button"
                        onClick={() => openPane(pane.id)}
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                          'flex min-h-[32px] w-full items-center gap-2.5 rounded-field px-2.5 py-1.5 text-left text-body font-medium transition-colors',
                          isActive
                            ? 'bg-accent-soft font-semibold text-accent'
                            : 'text-ink-dim hover:bg-hover hover:text-ink',
                        )}
                      >
                        <Icon size={16} strokeWidth={1.75} className="shrink-0" aria-hidden />
                        <span>{pane.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="scroll-thin relative min-h-0 flex-1 overflow-y-auto">
          <div
            ref={paneRef}
            className={cn(
              'mx-auto flex w-full flex-col gap-6 px-12 py-9',
              isWide && !query ? 'max-w-[960px]' : 'max-w-[760px]',
            )}
          >
            {query ? (
              <SearchResults query={query} matches={matches} onOpen={openPane} />
            ) : (
              <>
                <PageHeader
                  title={title}
                  actions={
                    ownedSettings && (
                      <Menu
                        trigger={
                          <IconButton label={t('settings.pageMenu.label')} size="sm">
                            <Ellipsis size={16} strokeWidth={1.75} />
                          </IconButton>
                        }
                        items={[{ label: t('settings.pageMenu.reset'), onSelect: () => setIsConfirmingReset(true) }]}
                      />
                    )
                  }
                />
                <ActivePane info={info} openPane={openPane} />
              </>
            )}
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={isConfirmingReset}
        onOpenChange={setIsConfirmingReset}
        title={t('settings.pageMenu.resetTitle', { page: title })}
        confirmLabel={t('settings.pageMenu.resetConfirm')}
        isDestructive
        onConfirm={resetPane}
      >
        {t('settings.pageMenu.resetBody')}
      </ConfirmDialog>
    </PageShell>
  );
}

function SearchResults({
  query,
  matches,
  onOpen,
}: {
  query: string;
  matches: ReturnType<typeof searchSettings>;
  onOpen: (id: string, term?: string) => void;
}) {
  return (
    <>
      <PageHeader title={t('settings.surface.results')} />
      {matches.length === 0 ? (
        <p className="text-body text-ink-dim">{t('settings.surface.noMatch', { query })}</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-raised">
          {matches.map((match) => (
            <li key={`${match.paneId}-${match.term}`}>
              <button
                type="button"
                onClick={() => onOpen(match.paneId, match.term)}
                className="flex w-full items-center justify-between gap-4 px-3.5 py-2.5 text-left hover:bg-hover"
              >
                <span className="text-body text-ink">{match.term}</span>
                <span className="text-body-sm text-ink-dim">{match.paneLabel}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
