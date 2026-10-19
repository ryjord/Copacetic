'use client';

// Libs
import { useEffect, useState } from 'react';

// Components
import { PageHeader } from '@/components/ui/PageHeader/PageHeader';
import { SearchField } from '@/components/ui/TextField/TextField';
import { SETTINGS_PANES, type PaneId, searchSettings } from '@/components/views/settings/shared/panes';
import { SurfaceShell } from '@/components/shell/SurfaceShell/SurfaceShell';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { ask } from '@/lib/bridge';
import { cn } from '@/lib/utils';

// Types
import type { AppInfo } from '@shared/types';

export function SettingsSurface() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const requestedPane = useBrowserStore((state) => state.settingsPane);
  // Read once: the surface mounts each time it opens, and after that the nav is in charge.
  const [activePaneId, setActivePaneId] = useState<PaneId>(
    () => SETTINGS_PANES.find((pane) => pane.id === requestedPane)?.id ?? 'general',
  );
  const [query, setQuery] = useState('');

  useEffect(() => {
    void ask((api) => api.app.getInfo(), null).then(setInfo);
  }, []);

  const activePane = SETTINGS_PANES.find((pane) => pane.id === activePaneId) ?? SETTINGS_PANES[0];
  const ActivePane = activePane.Component;
  const matches = searchSettings(query);

  const openPane = (id: string) => {
    const pane = SETTINGS_PANES.find((candidate) => candidate.id === id);
    if (pane) {
      setActivePaneId(pane.id);
      setQuery('');
    }
  };

  return (
    <SurfaceShell title="Settings" scrolls={false}>
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Settings sections" className="flex w-60 flex-none flex-col gap-3 border-r border-line p-3">
          <SearchField value={query} onChange={setQuery} label="Search settings" />
          <ul className="flex flex-col gap-0.5">
            {SETTINGS_PANES.map((pane) => {
              const Icon = pane.icon;
              const isActive = pane.id === activePaneId && !query;
              return (
                <li key={pane.id}>
                  <button
                    type="button"
                    onClick={() => openPane(pane.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex min-h-8 w-full items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left text-body transition-colors',
                      isActive ? 'bg-hover text-ink' : 'text-ink-dim hover:bg-hover hover:text-ink',
                    )}
                  >
                    <Icon size={16} strokeWidth={1.75} className="shrink-0" aria-hidden />
                    <span>{pane.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="scroll-thin relative min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[680px] flex-col gap-6 px-8 py-8">
            {query ? (
              <SearchResults query={query} matches={matches} onOpen={openPane} />
            ) : (
              <>
                <PageHeader title={activePane.label} />
                <ActivePane info={info} openPane={openPane} />
              </>
            )}
          </div>
        </div>
      </div>
    </SurfaceShell>
  );
}

function SearchResults({
  query,
  matches,
  onOpen,
}: {
  query: string;
  matches: ReturnType<typeof searchSettings>;
  onOpen: (id: string) => void;
}) {
  return (
    <>
      <PageHeader title="Search results" />
      {matches.length === 0 ? (
        <p className="text-body text-ink-dim">No setting matches &ldquo;{query}&rdquo;.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-raised">
          {matches.map((match) => (
            <li key={`${match.paneId}-${match.term}`}>
              <button
                type="button"
                onClick={() => onOpen(match.paneId)}
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
