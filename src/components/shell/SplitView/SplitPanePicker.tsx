'use client';

// Libs
import { useState } from 'react';

// Components
import { Favicon } from '@/components/ui/Favicon/Favicon';
import { SearchField } from '@/components/ui/TextField/TextField';

// Utils
import { send } from '@/lib/bridge/bridge';
import { cn } from '@/lib/utils';
import { t } from '@shared/i18n/translate';

// Types
import type { KeyboardEvent } from 'react';
import type { TabState } from '@shared/types';

// Enough to find the tab just left without the list becoming one to scroll; a search reaches the rest.
const MOST_SHOWN = 8;

/** The open tabs matching every word typed, by title or address, most recently used first. */
export function tabsToOffer(candidates: readonly TabState[], query: string): TabState[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return candidates
    .filter((candidate) => {
      const text = `${candidate.title} ${candidate.url}`.toLowerCase();
      return words.every((word) => text.includes(word));
    })
    .sort((aTab, bTab) => bTab.lastActiveAt - aTab.lastActiveAt);
}

/** The open tabs this half of a split could show instead, so filling it is a search and a click rather than a pasted address. */
export function SplitPanePicker({ paneId, candidates }: { paneId: string; candidates: TabState[] }) {
  const [query, setQuery] = useState('');
  const headingId = `split-picker-${paneId}`;
  const matching = tabsToOffer(candidates, query);
  const shown = matching.slice(0, MOST_SHOWN);
  const hidden = matching.length - shown.length;
  const choose = (tabId: string) => send((api) => api.tabs.replaceSplitPane(paneId, tabId));

  const moveFocus = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }
    const buttons = [...(event.currentTarget.closest('section')?.querySelectorAll('li button') ?? [])];
    const current = buttons.indexOf(document.activeElement ?? document.body);
    const next = event.key === 'ArrowDown' ? current + 1 : current - 1;
    const target = buttons[next];
    if (target instanceof HTMLElement) {
      event.preventDefault();
      target.focus();
    }
  };

  return (
    <section
      aria-labelledby={headingId}
      className="flex max-h-[40%] flex-none flex-col gap-2 border-b border-line bg-raised px-4 py-3"
      onKeyDown={moveFocus}
    >
      <h2 id={headingId} className="text-body-sm font-medium text-ink-dim">
        {t('shell.splitView.pickTab')}
      </h2>
      <SearchField
        value={query}
        onChange={setQuery}
        label={t('shell.splitView.findTab')}
        onKeyDown={(event) => {
          const first = shown[0];
          if (event.key === 'Enter' && first) {
            event.preventDefault();
            choose(first.id);
          }
        }}
      />
      {shown.length === 0 ? (
        <p className="px-2 py-1.5 text-body-sm text-ink-faint">{t('shell.splitView.noMatch')}</p>
      ) : (
        <ul className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
          {shown.map((candidate, index) => (
            <li key={candidate.id}>
              <button
                type="button"
                onClick={() => choose(candidate.id)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-body-sm text-ink-dim transition-colors hover:bg-hover hover:text-ink focus-visible:bg-hover focus-visible:text-ink',
                  // What Enter in the search field picks.
                  index === 0 && query.trim() !== '' && 'bg-hover text-ink',
                )}
              >
                <Favicon dataUrl={candidate.faviconDataUrl} seed={candidate.url} size={14} />
                <span className="min-w-0 flex-1 truncate">{candidate.title || candidate.url}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 && (
        <p className="px-2 text-body-sm text-ink-faint">{t('shell.splitView.moreMatching', { count: hidden })}</p>
      )}
    </section>
  );
}
