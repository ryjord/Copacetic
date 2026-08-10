'use client';

import { ArrowRight, Bookmark, Clock, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SEARCH_ENGINES, splitUrlForDisplay } from '../../../electron/shared/url';
import type { Suggestion, TabState } from '../../../electron/shared/types';
import { Favicon } from '@/components/ui/Favicon';
import { ask, send } from '@/lib/bridge';
import { cn } from '@/lib/utils';
import { useBrowserStore } from '@/store/useBrowserStore';
import { ConnectionBadge } from './ConnectionBadge';

interface OmniboxProps {
  tab: TabState | null;
}

/**
 * The address bar, and the one place in Copacetic where boldness is spent.
 *
 * Unfocused it is not a text field at all: it renders the address
 * semantically, so the registrable domain — the only part that tells you where
 * you actually are — is the only part at full contrast. Focused it becomes a
 * plain input, and the suggestion list below it is real chrome rather than a
 * floating popover, so the page is pushed down instead of covered.
 */
export function Omnibox({ tab }: OmniboxProps) {
  const settings = useBrowserStore((state) => state.settings);
  const focusToken = useBrowserStore((state) => state.omniboxFocusToken);

  const inputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [highlighted, setHighlighted] = useState(0);

  const committedUrl = tab?.displayUrl ?? '';
  const engineName = SEARCH_ENGINES[settings.searchEngine]?.name ?? 'your search engine';

  const beginEditing = useCallback(() => {
    setDraft(committedUrl);
    setIsEditing(true);
  }, [committedUrl]);

  const endEditing = useCallback(() => {
    setIsEditing(false);
    setHighlighted(0);
    inputRef.current?.blur();
  }, []);

  // Switching tabs by shortcut happens entirely in the main process, so it
  // never blurs this input the way clicking a tab does. Without this, a draft
  // typed against one tab stays on screen and Enter navigates whichever tab is
  // now active — the wrong one.
  //
  // This runs before the focus token below on purpose: opening a new tab
  // changes both, and the token must have the last word so Cmd+T still lands
  // in a focused address bar.
  const [editingTabId, setEditingTabId] = useState(tab?.id ?? null);
  if (tab?.id !== editingTabId) {
    setEditingTabId(tab?.id ?? null);
    setIsEditing(false);
    setDraft('');
    setHighlighted(0);
  }

  // Cmd+L, the menu and a new tab all raise the same focus token. Reacting to
  // it while rendering, rather than in an effect, avoids a second render pass
  // that would briefly show the unfocused address.
  const [seenFocusToken, setSeenFocusToken] = useState(focusToken);
  if (focusToken !== seenFocusToken) {
    setSeenFocusToken(focusToken);
    setDraft(committedUrl);
    setIsEditing(true);
  }

  // Focusing is a DOM effect, not state, so it belongs after paint.
  useEffect(() => {
    if (!isEditing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isEditing]);

  // Suggestions are ranked in the main process, where history lives.
  useEffect(() => {
    const query = draft.trim();
    if (!isEditing || !query) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      void ask((api) => api.omnibox.suggest(query), []).then((result) => {
        if (cancelled) return;
        setSuggestions(result);
        setHighlighted(0);
      });
    }, 60);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft, isEditing]);

  // Derived rather than cleared in an effect: an empty box shows no list, and
  // a stale list never flashes between keystrokes.
  const visibleSuggestions = isEditing && draft.trim() ? suggestions : [];

  const commit = useCallback(
    (value: string) => {
      const target = value.trim();
      if (!target || !tab) return;
      endEditing();
      send((api) => api.tabs.navigate(tab.id, target));
    },
    [endEditing, tab],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      endEditing();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (visibleSuggestions.length === 0) return;
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setHighlighted((current) => (current + delta + visibleSuggestions.length) % visibleSuggestions.length);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const chosen = visibleSuggestions[highlighted];
      commit(chosen ? chosen.target : draft);
    }
  };

  return (
    <div className="no-drag relative flex-1">
      <div
        className={cn(
          'flex h-8 items-center gap-2 rounded-field border px-2 transition-colors duration-150',
          isEditing
            ? 'border-line-strong bg-sunken'
            : 'border-transparent bg-raised hover:border-line hover:bg-hover',
        )}
      >
        <ConnectionBadge tab={tab} />

        {isEditing ? (
          <input
            ref={inputRef}
            value={draft}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            aria-label="Address and search"
            placeholder={`Search with ${engineName}, or type an address`}
            className="h-full w-full bg-transparent font-mono text-[12px] tracking-tight text-ink outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-ink-faint"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              // A blur caused by clicking a suggestion must not unmount the list
              // before the click lands.
              setTimeout(() => setIsEditing(false), 120);
            }}
          />
        ) : (
          <button
            type="button"
            onClick={beginEditing}
            className="h-full w-full truncate text-left"
            aria-label="Address and search"
          >
            <AddressDisplay url={committedUrl} engineName={engineName} />
          </button>
        )}
      </div>

      {visibleSuggestions.length > 0 && (
        <SuggestionList
          suggestions={visibleSuggestions}
          highlighted={highlighted}
          onChoose={commit}
          onHover={setHighlighted}
        />
      )}
    </div>
  );
}

/**
 * The address, rendered as structure rather than as a string.
 *
 * `paypal.com.example.net/login` must read as `example.net`, so everything
 * outside the registrable domain is dimmed — that is the whole point.
 */
function AddressDisplay({ url, engineName }: { url: string; engineName: string }) {
  const parts = useMemo(() => (url ? splitUrlForDisplay(url) : null), [url]);

  if (!parts) {
    return <span className="text-[12px] text-ink-faint">Search with {engineName}, or type an address</span>;
  }

  return (
    <span className="flex items-baseline truncate font-mono text-[12px] tracking-tight">
      {parts.scheme !== 'https' && <span className="mr-1 text-ink-faint">{parts.scheme}://</span>}
      {parts.subdomain && <span className="text-ink-faint">{parts.subdomain}</span>}
      <span className="text-ink">{parts.registrableDomain}</span>
      {parts.path && <span className="truncate text-ink-dim">{parts.path}</span>}
    </span>
  );
}

const SUGGESTION_ICONS = {
  url: ArrowRight,
  search: Search,
  history: Clock,
  bookmark: Bookmark,
} as const;

function SuggestionList({
  suggestions,
  highlighted,
  onChoose,
  onHover,
}: {
  suggestions: Suggestion[];
  highlighted: number;
  onChoose: (target: string) => void;
  onHover: (index: number) => void;
}) {
  return (
    <ul
      // Part of the chrome column, not an overlay: the content area below is
      // measured after this renders, so the page moves down to make room.
      className="animate-fade mt-1.5 overflow-hidden rounded-panel border border-line bg-raised shadow-[0_18px_40px_-12px_rgb(0_0_0/0.75)]"
      role="listbox"
    >
      {suggestions.map((suggestion, index) => {
        const Icon = SUGGESTION_ICONS[suggestion.kind];
        const isActive = index === highlighted;
        return (
          <li key={suggestion.id} role="option" aria-selected={isActive}>
            <button
              type="button"
              onMouseEnter={() => onHover(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onChoose(suggestion.target)}
              className={cn(
                'flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors',
                isActive ? 'bg-hover' : 'hover:bg-hover/60',
              )}
            >
              {suggestion.faviconDataUrl ? (
                <Favicon dataUrl={suggestion.faviconDataUrl} seed={suggestion.subtitle} size={14} />
              ) : (
                <Icon size={14} className="shrink-0 text-ink-faint" />
              )}
              <span className="truncate text-[12.5px] text-ink">{suggestion.title}</span>
              <span className="ml-auto truncate pl-4 font-mono text-[11px] text-ink-faint">
                {suggestion.subtitle}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
