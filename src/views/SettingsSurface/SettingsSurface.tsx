'use client';

// Libs
import { useEffect, useState } from 'react';

// Components
import { SETTINGS_PANES, type PaneId } from '@/components/settings/shared/panes';
import { SurfaceShell } from '@/views/SurfaceShell/SurfaceShell';

// Utils
import { ask } from '@/lib/bridge';
import { cn } from '@/lib/utils';

// Types
import type { AppInfo } from '@shared/types';

export function SettingsSurface() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [activePaneId, setActivePaneId] = useState<PaneId>('appearance');

  useEffect(() => {
    void ask((api) => api.app.getInfo(), null).then(setInfo);
  }, []);

  const activePane = SETTINGS_PANES.find((pane) => pane.id === activePaneId) ?? SETTINGS_PANES[0];
  const ActivePane = activePane.Component;

  return (
    <SurfaceShell title="Settings" subtitle="Everything here is stored on this machine only.">
      <div className="mx-auto flex w-full max-w-4xl gap-6 px-6 py-6">
        <nav aria-label="Settings sections" className="w-40 shrink-0">
          <ul className="sticky top-0 flex flex-col gap-0.5">
            {SETTINGS_PANES.map((pane) => (
              <li key={pane.id}>
                <button
                  type="button"
                  onClick={() => setActivePaneId(pane.id)}
                  aria-current={pane.id === activePaneId ? 'page' : undefined}
                  className={cn(
                    'w-full rounded-field px-2.5 py-1.5 text-left text-[12.5px] transition-colors',
                    pane.id === activePaneId ? 'bg-hover text-ink' : 'text-ink-dim hover:bg-raised hover:text-ink',
                  )}
                >
                  {pane.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 flex-1">
          <ActivePane info={info} />
        </div>
      </div>
    </SurfaceShell>
  );
}
