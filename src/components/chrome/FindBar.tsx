'use client';

import { CaseSensitive, ChevronDown, ChevronUp, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FindState } from '../../../electron/shared/types';
import { IconButton } from '@/components/ui/IconButton';
import { send } from '@/lib/bridge';
import { cn } from '@/lib/utils';

/** Find sits in the chrome column rather than floating over the page, because a WebContentsView always paints above the chrome's HTML. */
export function FindBar({ find }: { find: FindState }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(find.query);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => send((api) => api.find.start(draft)), 110);
    return () => clearTimeout(timer);
  }, [draft]);

  const hasQuery = draft.trim().length > 0;
  const hasMatches = find.totalMatches > 0;

  return (
    <div className="flex h-[34px] items-center gap-2 border-t border-line bg-raised px-2.5">
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
        placeholder="Find on page"
        aria-label="Find on page"
        spellCheck={false}
        className="h-6 w-64 rounded bg-sunken px-2 text-[12px] text-ink outline-none placeholder:text-ink-faint"
      />

      <span
        className={cn(
          'min-w-[64px] font-mono text-[11px] tabular-nums',
          hasQuery && !hasMatches ? 'text-alert' : 'text-ink-faint',
        )}
      >
        {hasQuery ? (hasMatches ? `${find.activeMatch} of ${find.totalMatches}` : 'No matches') : ''}
      </span>

      <IconButton
        label="Match case"
        size="sm"
        tone={find.matchCase ? 'active' : 'default'}
        onClick={() => send((api) => api.find.setMatchCase(!find.matchCase))}
      >
        <CaseSensitive size={14} />
      </IconButton>

      <IconButton
        label="Previous match"
        size="sm"
        disabled={!hasMatches}
        onClick={() => send((api) => api.find.previous())}
      >
        <ChevronUp size={14} />
      </IconButton>

      <IconButton label="Next match" size="sm" disabled={!hasMatches} onClick={() => send((api) => api.find.next())}>
        <ChevronDown size={14} />
      </IconButton>

      <IconButton label="Close find" size="sm" className="ml-auto" onClick={() => send((api) => api.find.stop())}>
        <X size={14} />
      </IconButton>
    </div>
  );
}
