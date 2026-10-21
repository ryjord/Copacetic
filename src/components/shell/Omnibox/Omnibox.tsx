'use client';

// Libs
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// Components
import { IconButton } from '@/components/ui/IconButton/IconButton';
import { AddToCopacetic } from '@/components/shell/Omnibox/AddToCopacetic';
import { ConnectionBadge } from '@/components/shell/ConnectionBadge/ConnectionBadge';

// Icons
import { BookOpen, KeyRound, Star } from 'lucide-react';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { ask, getBridge, send } from '@/lib/bridge/bridge';
import { cn } from '@/lib/utils';
import { t } from '@shared/i18n/translate';

// Types
import type { Suggestion, TabId, TabState } from '@shared/types';
import { splitUrlForDisplay } from '@shared/browsing/url';
import { formatZoom, isZoomedFrom } from '@shared/tabs/zoom';

const PLACEHOLDER = t('shell.omnibox.placeholder');
// One empty list, so not editing is the same value on every render and the overlay is told once.
const NO_SUGGESTIONS: Suggestion[] = [];

interface OmniboxProps {
  tab: TabState | null;
}

/** The address bar, and the one place in Copacetic where boldness is spent. */
export function Omnibox({ tab }: OmniboxProps) {
  const setSurface = useBrowserStore((state) => state.setSurface);
  const focusToken = useBrowserStore((state) => state.omniboxFocusToken);

  const inputRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [highlighted, setHighlighted] = useState(0);

  const committedUrl = tab?.displayUrl ?? '';

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
  // now active - the wrong one.
  //
  // This runs before the focus token below on purpose: opening a new tab
  // changes both, and the token must have the last word so Cmd+T still lands
  // in a focused address bar.
  // Both sides are normalised to null: comparing a bare `tab?.id` against this
  // makes `undefined !== null` true on every render with no active tab, and
  // because setting the same value bails out the condition never clears.
  const activeTabId = tab?.id ?? null;
  const [editingTabId, setEditingTabId] = useState<TabId | null>(activeTabId);
  if (activeTabId !== editingTabId) {
    setEditingTabId(activeTabId);
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
    if (!isEditing) {
      return;
    }
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isEditing]);

  // Suggestions are ranked in the main process, where history lives.
  useEffect(() => {
    const query = draft.trim();
    if (!isEditing || !query) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void ask((api) => api.omnibox.suggest(query), []).then((result) => {
        if (cancelled) {
          return;
        }
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
  const visibleSuggestions = isEditing && draft.trim() ? suggestions : NO_SUGGESTIONS;

  const commit = useCallback(
    (value: string) => {
      const target = value.trim();
      if (!target || !tab) {
        return;
      }
      endEditing();
      send((api) => api.tabs.navigate(tab.id, target));
    },
    [endEditing, tab],
  );

  // Drawn by the leading overlay, so the list floats over the page instead of pushing it down while you type.
  useEffect(() => {
    const field = fieldRef.current?.getBoundingClientRect();
    const page = document.querySelector('main')?.getBoundingClientRect();
    const view =
      visibleSuggestions.length > 0 && field && page
        ? { suggestions: visibleSuggestions, highlighted, left: field.left - page.left, width: field.width }
        : null;
    send((api) => api.omnibox.showSuggestions(view));
  }, [visibleSuggestions, highlighted]);

  // A click on the overlay's list comes back here, so it commits exactly as Enter does.
  useEffect(() => getBridge()?.on.omniboxChosen(commit), [commit]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      endEditing();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (visibleSuggestions.length === 0) {
        return;
      }
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setHighlighted((current) => (current + delta + visibleSuggestions.length) % visibleSuggestions.length);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const chosen = visibleSuggestions[highlighted];
      commit(chosen ? chosen.target : draft);
      return;
    }
    // A page from history that keeps coming up can be forgotten from the list, with Undo.
    const highlightedSuggestion = visibleSuggestions[highlighted];
    if (event.key === 'Delete' && event.shiftKey && highlightedSuggestion?.kind === 'history') {
      event.preventDefault();
      send((api) => api.history.remove(highlightedSuggestion.id));
      setSuggestions((current) => current.filter((suggestion) => suggestion.id !== highlightedSuggestion.id));
      setHighlighted((current) => Math.max(0, Math.min(current, visibleSuggestions.length - 2)));
    }
  };

  return (
    <div className="no-drag relative min-w-0 flex-1">
      <div
        ref={fieldRef}
        className={cn(
          'flex h-[var(--chrome-field-height)] items-center gap-2 rounded-[10px] border pr-1.5 pl-1 transition-colors duration-150',
          isEditing ? 'border-accent bg-raised' : 'border-line bg-raised hover:border-line-strong',
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
            aria-label={t('shell.omnibox.addressAndSearch')}
            // Announced as what it is: a text field with a list attached, and
            // a way to say which item the arrow keys are currently on. Without
            // this the suggestions are invisible to a screen reader, which
            // makes the arrow keys look broken rather than absent.
            role="combobox"
            aria-expanded={visibleSuggestions.length > 0}
            aria-controls="omnibox-suggestions"
            aria-autocomplete="list"
            aria-activedescendant={visibleSuggestions.length > 0 ? `omnibox-suggestion-${highlighted}` : undefined}
            placeholder={PLACEHOLDER}
            className="h-full w-full bg-transparent font-mono text-body-sm tracking-tight text-ink outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-ink-faint"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => setIsEditing(false)}
          />
        ) : (
          <button
            type="button"
            onClick={beginEditing}
            className="h-full w-full min-w-0 truncate text-left"
            aria-label={t('shell.omnibox.addressAndSearch')}
          >
            <AddressDisplay url={committedUrl} />
          </button>
        )}

        {tab && tab.internalPage === null && (
          <>
            <AddToCopacetic tab={tab} />
            <ZoomChip tab={tab} />
            {/* Offered on every web page rather than guessed at: finding the article means reading the whole page. */}
            {/^https?:/.test(tab.url) && (
              <IconButton label={t('shell.omnibox.readerView')} size="sm" onClick={() => setSurface('reader')}>
                <BookOpen size={14} strokeWidth={1.75} />
              </IconButton>
            )}
            <PasswordKey tab={tab} />
            <BookmarkStar tab={tab} />
          </>
        )}
      </div>

      {/* The visible list is in another document, which aria-activedescendant cannot reach, so this one is for screen readers. */}
      {visibleSuggestions.length > 0 && (
        <ul id="omnibox-suggestions" role="listbox" aria-label={t('shell.omnibox.suggestions')} className="sr-only">
          {visibleSuggestions.map((suggestion, index) => (
            <li
              key={suggestion.id}
              id={`omnibox-suggestion-${index}`}
              role="option"
              aria-selected={index === highlighted}
            >
              {t('shell.omnibox.suggestion', { title: suggestion.title, subtitle: suggestion.subtitle })}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// The address, rendered as structure rather than as a string.
function AddressDisplay({ url }: { url: string }) {
  const parts = useMemo(() => (url ? splitUrlForDisplay(url) : null), [url]);

  if (!parts) {
    return <span className="text-body-sm text-ink-faint">{PLACEHOLDER}</span>;
  }

  return (
    <span className="flex min-w-0 items-baseline truncate font-mono text-body-sm tracking-tight">
      {parts.scheme !== 'https' && <span className="mr-1 text-ink-faint">{parts.scheme}://</span>}
      {parts.subdomain && <span className="text-ink-faint">{parts.subdomain}</span>}
      <span className="font-semibold text-ink">{parts.registrableDomain}</span>
      {parts.path && <span className="truncate text-ink-dim">{parts.path}</span>}
    </span>
  );
}

/** Shown only while the page is off your default zoom, so the one click that undoes it is where you look. */
function ZoomChip({ tab }: { tab: TabState }) {
  const defaultZoomFactor = useBrowserStore((state) => state.settings.defaultZoomFactor);
  if (!isZoomedFrom(tab.zoomFactor, defaultZoomFactor)) {
    return null;
  }
  const shown = formatZoom(tab.zoomFactor);
  return (
    <button
      type="button"
      aria-label={t('shell.omnibox.zoomReset', { zoom: shown, defaultZoom: formatZoom(defaultZoomFactor) })}
      title={t('shell.omnibox.resetZoom')}
      onClick={() => send((api) => api.tabs.setZoom(tab.id, defaultZoomFactor))}
      className="flex h-6 shrink-0 items-center rounded-sm bg-hover px-2 text-body-sm tabular-nums text-ink-dim hover:text-ink"
    >
      {shown}
    </button>
  );
}

/**
 * On a site with a saved password, the way to fill it with one click. Asked
 * for once per address, and the count is all that crosses: which accounts
 * exist stays in the main process until one is chosen.
 */
function PasswordKey({ tab }: { tab: TabState }) {
  const [loaded, setLoaded] = useState<{ url: string; count: number } | null>(null);

  useEffect(() => {
    let isCurrent = true;
    void ask((api) => api.vault.countForTab(tab.id), 0).then((count) => {
      if (isCurrent) {
        setLoaded({ url: tab.url, count });
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [tab.id, tab.url]);

  if (loaded?.url !== tab.url || loaded.count === 0) {
    return null;
  }
  return (
    <IconButton
      label={t('shell.omnibox.fillPassword')}
      size="sm"
      onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        send((api) => api.vault.fillForTab(tab.id, Math.round(box.left), Math.round(box.bottom + 4)));
      }}
    >
      <KeyRound size={14} strokeWidth={1.75} />
    </IconButton>
  );
}

/** Saving the page belongs to the page's address, so it sits at the end of it. */
function BookmarkStar({ tab }: { tab: TabState }) {
  // A Hush page could still be unbookmarked if it was saved from an ordinary tab, but never saved from this one.
  const isRefused = tab.isHush && !tab.isBookmarked;
  const label = tab.isBookmarked ? t('shell.omnibox.removeBookmark') : t('shell.omnibox.addBookmark');
  return (
    <IconButton
      label={isRefused ? t('shell.omnibox.noHushBookmark') : label}
      size="sm"
      disabled={isRefused}
      tone={tab.isBookmarked ? 'active' : 'default'}
      onClick={() => send((api) => api.bookmarks.toggle(tab.url, tab.title))}
    >
      <Star size={14} strokeWidth={1.75} fill={tab.isBookmarked ? 'currentColor' : 'none'} />
    </IconButton>
  );
}
