'use client';

// Libs
import { useEffect, useRef, useState } from 'react';

// Components
import { IconButton } from '@/components/ui/IconButton/IconButton';

// Icons
import { CaseSensitive, ChevronDown, ChevronUp, WholeWord, X } from 'lucide-react';

// Utils
import { getBridge, send } from '@/lib/bridge/bridge';
import { cn } from '@/lib/utils';
import { t } from '@shared/i18n/translate';

// Types
import type { FindState } from '@shared/types';

/** Floats over the page's top-right corner in the trailing overlay, so opening it never moves the page. */
export function FindBar({ find }: { find: FindState }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(find.query);

  useEffect(() => {
    const focusField = () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    focusField();
    return getBridge()?.on.focusFind(focusField);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => send((api) => api.find.start(draft)), 110);
    return () => clearTimeout(timer);
  }, [draft]);

  const hasQuery = draft.trim().length > 0;
  const hasMatches = find.totalMatches > 0;

  return (
    <div
      role="search"
      aria-label={t('shell.overlay.findBar.label')}
      className="animate-pop flex h-11 w-95 items-center gap-1 rounded-lg border border-line bg-raised pl-3 pr-1.5 shadow-popover"
    >
      <input
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            send((api) => api.find.stop());
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            send((api) => (event.shiftKey ? api.find.previous() : api.find.next()));
          }
        }}
        placeholder={t('shell.overlay.findBar.label')}
        aria-label={t('shell.overlay.findBar.label')}
        spellCheck={false}
        className="h-full min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-faint"
      />
      <span
        role="status"
        title={find.isWholeWordUnavailable ? t('shell.overlay.findBar.wholeWordUnavailable') : undefined}
        className={cn(
          'shrink-0 px-1.5 text-body-sm tabular-nums',
          hasQuery && !hasMatches ? 'text-ink-dim' : 'text-ink-faint',
        )}
      >
        {hasQuery
          ? hasMatches
            ? t('shell.overlay.findBar.matchCount', { current: find.activeMatch, total: find.totalMatches })
            : t('shell.overlay.findBar.noMatches')
          : ''}
      </span>
      <IconButton
        label={t('shell.overlay.findBar.matchCase')}
        tone={find.matchCase ? 'active' : 'default'}
        aria-pressed={find.matchCase}
        onClick={() => send((api) => api.find.setMatchCase(!find.matchCase))}
      >
        <CaseSensitive size={16} strokeWidth={1.75} />
      </IconButton>
      <IconButton
        label={
          find.isWholeWordUnavailable
            ? t('shell.overlay.findBar.wholeWordUnavailable')
            : t('shell.overlay.findBar.wholeWord')
        }
        tone={find.wholeWord ? 'active' : 'default'}
        aria-pressed={find.wholeWord}
        onClick={() => send((api) => api.find.setWholeWord(!find.wholeWord))}
      >
        <WholeWord size={16} strokeWidth={1.75} />
      </IconButton>
      <IconButton
        label={t('shell.overlay.findBar.previous')}
        disabled={!hasMatches}
        onClick={() => send((api) => api.find.previous())}
      >
        <ChevronUp size={16} strokeWidth={1.75} />
      </IconButton>
      <IconButton
        label={t('shell.overlay.findBar.next')}
        disabled={!hasMatches}
        onClick={() => send((api) => api.find.next())}
      >
        <ChevronDown size={16} strokeWidth={1.75} />
      </IconButton>
      <IconButton label={t('shell.overlay.findBar.close')} onClick={() => send((api) => api.find.stop())}>
        <X size={16} strokeWidth={1.75} />
      </IconButton>
    </div>
  );
}
