'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { send } from '@/lib/bridge';
import { cn } from '@/lib/utils';
import { useBrowserStore } from '@/store/useBrowserStore';

interface Command {
  id: string;
  label: string;
  /** The shortcut that does the same thing, so the palette teaches it. */
  hint?: string;
  group: string;
  run: () => void;
}

/** One keystroke to reach anything, and a place to discover the shortcut for it. */
export function CommandPalette() {
  const setSurface = useBrowserStore((state) => state.setSurface);
  const toggleSurface = useBrowserStore((state) => state.toggleSurface);
  const requestOmniboxFocus = useBrowserStore((state) => state.requestOmniboxFocus);
  const tabs = useBrowserStore((state) => state.orderedTabs);
  const activeTab = useBrowserStore((state) => state.activeTab);
  const hasClosedTabs = useBrowserStore((state) => state.hasClosedTabs);

  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commands = useMemo<Command[]>(() => {
    const close = () => setSurface('none');
    const list: Command[] = [
      {
        id: 'new-tab',
        label: 'New tab',
        hint: 'Cmd T',
        group: 'Tabs',
        run: () => {
          close();
          send((api) => api.tabs.create());
        },
      },
      {
        id: 'address',
        label: 'Go to address',
        hint: 'Cmd L',
        group: 'Tabs',
        run: () => {
          close();
          requestOmniboxFocus();
        },
      },
    ];

    if (activeTab) {
      list.push(
        {
          id: 'reload',
          label: 'Reload page',
          hint: 'Cmd R',
          group: 'Page',
          run: () => {
            close();
            send((api) => api.tabs.reload(activeTab.id));
          },
        },
        {
          id: 'find',
          label: 'Find on page',
          hint: 'Cmd F',
          group: 'Page',
          run: () => {
            close();
            send((api) => api.find.start(''));
          },
        },
        {
          id: 'close-tab',
          label: 'Close this tab',
          hint: 'Cmd W',
          group: 'Tabs',
          run: () => {
            close();
            send((api) => api.tabs.close(activeTab.id));
          },
        },
      );

      if (!activeTab.isStartPage) {
        list.push({
          id: 'bookmark',
          label: activeTab.isBookmarked ? 'Remove bookmark' : 'Bookmark this page',
          hint: 'Cmd D',
          group: 'Page',
          run: () => {
            close();
            send((api) => api.bookmarks.toggle(activeTab.url, activeTab.title));
          },
        });
      }
    }

    if (hasClosedTabs) {
      list.push({
        id: 'reopen',
        label: 'Reopen last closed tab',
        hint: 'Cmd Shift T',
        group: 'Tabs',
        run: () => {
          close();
          send((api) => api.tabs.reopenClosed());
        },
      });
    }

    list.push(
      {
        id: 'history',
        label: 'Open history',
        hint: 'Cmd Y',
        group: 'Browser',
        run: () => toggleSurface('history'),
      },
      {
        id: 'bookmarks',
        label: 'Open bookmarks',
        hint: 'Cmd Shift B',
        group: 'Browser',
        run: () => toggleSurface('bookmarks'),
      },
      {
        id: 'downloads',
        label: 'Open downloads',
        hint: 'Cmd Shift J',
        group: 'Browser',
        run: () => toggleSurface('downloads'),
      },
      {
        id: 'settings',
        label: 'Open settings',
        hint: 'Cmd ,',
        group: 'Browser',
        run: () => toggleSurface('settings'),
      },
    );

    for (const tab of tabs) {
      if (tab.id === activeTab?.id) {
        continue;
      }
      list.push({
        id: `switch:${tab.id}`,
        label: `Switch to ${tab.isStartPage ? 'New tab' : tab.title}`,
        group: 'Open tabs',
        run: () => {
          close();
          send((api) => api.tabs.activate(tab.id));
        },
      });
    }

    return list;
  }, [activeTab, hasClosedTabs, requestOmniboxFocus, setSurface, tabs, toggleSurface]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return commands;
    }
    return commands.filter((command) => command.label.toLowerCase().includes(needle));
  }, [commands, query]);

  // Adjusting during render rather than in an effect: the list and its
  // highlight change together, so there is no frame where they disagree.
  const [seenQuery, setSeenQuery] = useState(query);
  if (seenQuery !== query) {
    setSeenQuery(query);
    setHighlighted(0);
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setSurface('none');
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (matches.length === 0) {
        return;
      }
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setHighlighted((current) => (current + delta + matches.length) % matches.length);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      matches[highlighted]?.run();
    }
  };

  return (
    <div className="animate-fade absolute inset-0 z-50 flex justify-center bg-void/70 pt-[12vh] backdrop-blur-sm">
      <div
        className="animate-rise h-fit max-h-[60vh] w-full max-w-lg overflow-hidden rounded-panel border border-line bg-raised shadow-[0_28px_70px_-16px_rgb(0_0_0/0.85)]"
        role="dialog"
        aria-label="Command palette"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a command"
          aria-label="Type a command"
          className="h-11 w-full border-b border-line bg-transparent px-4 text-[13.5px] text-ink outline-none placeholder:text-ink-faint"
        />

        {matches.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12.5px] text-ink-faint">No command matches that.</p>
        ) : (
          <ul className="scroll-thin max-h-[46vh] overflow-y-auto py-1" role="listbox">
            {matches.map((command, index) => (
              <li key={command.id} role="option" aria-selected={index === highlighted}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={command.run}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-2 text-left transition-colors',
                    index === highlighted ? 'bg-hover' : 'hover:bg-hover/60',
                  )}
                >
                  <span className="label w-20 shrink-0">{command.group}</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{command.label}</span>
                  {command.hint && (
                    <span className="shrink-0 font-mono text-[11px] text-ink-faint">{command.hint}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
