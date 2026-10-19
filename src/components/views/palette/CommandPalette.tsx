'use client';

// Libs
import { useEffect, useId, useMemo, useRef, useState } from 'react';

// Components
import { Kbd } from '@/components/ui/Kbd/Kbd';

// Icons
import { Search } from 'lucide-react';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { send } from '@/lib/bridge';
import { useDismissLayer } from '@/lib/dismissLayer';
import { useFocusTrap } from '@/lib/focusTrap';
import { rankByMatch } from '@/lib/fuzzy';
import { cn } from '@/lib/utils';

// Types
import { GROUP_COLOURS } from '@shared/tab-groups';
import { clampZoom } from '@shared/types';
import { nextZoomStep } from '@shared/zoom';

interface Command {
  id: string;
  label: string;
  /** The shortcut that does the same thing, so the palette teaches it. */
  accelerator?: string;
  group: 'Tabs' | 'Page' | 'Go to' | 'Your data' | 'Appearance' | 'Open tabs';
  /** Also matched, but not shown: a tab's address, for instance. */
  keywords?: string;
  run: () => void;
}

const GROUP_ORDER: readonly Command['group'][] = ['Tabs', 'Page', 'Go to', 'Your data', 'Appearance', 'Open tabs'];

/** One keystroke to reach anything, and a place to learn the shortcut for it. */
export function CommandPalette() {
  const setSurface = useBrowserStore((state) => state.setSurface);
  const toggleSurface = useBrowserStore((state) => state.toggleSurface);
  const openSettings = useBrowserStore((state) => state.openSettings);
  const requestOmniboxFocus = useBrowserStore((state) => state.requestOmniboxFocus);
  const tabs = useBrowserStore((state) => state.orderedTabs);
  const activeTab = useBrowserStore((state) => state.activeTab);
  const hasClosedTabs = useBrowserStore((state) => state.hasClosedTabs);
  const appearance = useBrowserStore((state) => state.settings.appearance);
  const defaultZoomFactor = useBrowserStore((state) => state.settings.defaultZoomFactor);

  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useDismissLayer(true, () => setSurface('none'));
  useFocusTrap(panelRef, true);

  const commands = useMemo<Command[]>(() => {
    const close = () => setSurface('none');
    const then = (action: () => void) => () => {
      close();
      action();
    };
    const list: Command[] = [
      {
        id: 'new-window',
        label: 'New window',
        accelerator: 'CmdOrCtrl+N',
        group: 'Tabs',
        run: then(() => send((api) => api.window.openNew())),
      },
      {
        id: 'new-tab',
        label: 'New tab',
        accelerator: 'CmdOrCtrl+T',
        group: 'Tabs',
        run: then(() => send((api) => api.tabs.create())),
      },
      {
        id: 'new-hush-tab',
        label: 'New Hush tab',
        accelerator: 'CmdOrCtrl+Shift+N',
        group: 'Tabs',
        keywords: 'private incognito',
        run: then(() => send((api) => api.tabs.createHush())),
      },
      {
        id: 'address',
        label: 'Go to an address',
        accelerator: 'CmdOrCtrl+L',
        group: 'Tabs',
        run: then(requestOmniboxFocus),
      },
    ];

    if (hasClosedTabs) {
      list.push({
        id: 'reopen',
        label: 'Reopen closed tab',
        accelerator: 'CmdOrCtrl+Shift+T',
        group: 'Tabs',
        run: then(() => send((api) => api.tabs.reopenClosed())),
      });
    }

    if (activeTab) {
      const tabId = activeTab.id;
      list.push({
        id: 'close-tab',
        label: 'Close tab',
        accelerator: 'CmdOrCtrl+W',
        group: 'Tabs',
        run: then(() => send((api) => api.tabs.close(tabId))),
      });
      list.push({
        id: 'duplicate',
        label: 'Duplicate tab',
        group: 'Tabs',
        run: then(() => send((api) => api.tabs.duplicate(tabId))),
      });
      list.push({
        id: 'pin',
        label: activeTab.isPinned ? 'Unpin tab' : 'Pin tab',
        group: 'Tabs',
        run: then(() => send((api) => api.tabs.setPinned(tabId, !activeTab.isPinned))),
      });
      if (activeTab.isAudible || activeTab.isMuted) {
        list.push({
          id: 'mute',
          label: activeTab.isMuted ? 'Unmute tab' : 'Mute tab',
          group: 'Tabs',
          keywords: 'sound audio',
          run: then(() => send((api) => api.tabs.setMuted(tabId, !activeTab.isMuted))),
        });
      }
      list.push(
        activeTab.groupId === null
          ? {
              id: 'group-new',
              label: 'Add tab to a new group',
              group: 'Tabs',
              run: then(() => send((api) => api.groups.create(tabId, 'Group', GROUP_COLOURS[0].id, false))),
            }
          : {
              id: 'group-remove',
              label: 'Remove tab from its group',
              group: 'Tabs',
              keywords: 'ungroup',
              run: then(() => send((api) => api.groups.setForTab(tabId, null))),
            },
      );

      if (!activeTab.isStartPage) {
        const zoomTo = (factor: number) => then(() => send((api) => api.tabs.setZoom(tabId, clampZoom(factor))));
        list.push(
          {
            id: 'reload',
            label: 'Reload page',
            accelerator: 'CmdOrCtrl+R',
            group: 'Page',
            run: then(() => send((api) => api.tabs.reload(tabId))),
          },
          {
            id: 'find',
            label: 'Find on page',
            accelerator: 'CmdOrCtrl+F',
            group: 'Page',
            run: then(() => send((api) => api.find.open())),
          },
          {
            id: 'bookmark',
            label: activeTab.isBookmarked ? 'Remove bookmark' : 'Bookmark this page',
            accelerator: 'CmdOrCtrl+D',
            group: 'Page',
            run: then(() => send((api) => api.bookmarks.toggle(activeTab.url, activeTab.title))),
          },
          {
            id: 'print',
            label: 'Print',
            accelerator: 'CmdOrCtrl+P',
            group: 'Page',
            run: then(() => send((api) => api.tabs.print(tabId))),
          },
          {
            id: 'zoom-in',
            label: 'Zoom in',
            accelerator: 'CmdOrCtrl+Plus',
            group: 'Page',
            run: zoomTo(nextZoomStep(activeTab.zoomFactor, 'in')),
          },
          {
            id: 'zoom-out',
            label: 'Zoom out',
            accelerator: 'CmdOrCtrl+-',
            group: 'Page',
            run: zoomTo(nextZoomStep(activeTab.zoomFactor, 'out')),
          },
          {
            id: 'zoom-reset',
            label: 'Actual size',
            accelerator: 'CmdOrCtrl+0',
            group: 'Page',
            keywords: 'reset zoom',
            run: zoomTo(defaultZoomFactor),
          },
          {
            id: 'devtools',
            label: 'Developer tools',
            group: 'Page',
            keywords: 'inspect console devtools',
            run: then(() => send((api) => api.tabs.toggleDevTools(tabId))),
          },
        );
      }
    }

    list.push(
      {
        id: 'history',
        label: 'History',
        accelerator: 'CmdOrCtrl+Y',
        group: 'Go to',
        run: () => toggleSurface('history'),
      },
      {
        id: 'bookmarks',
        label: 'Bookmarks',
        accelerator: 'CmdOrCtrl+Shift+B',
        group: 'Go to',
        run: () => toggleSurface('bookmarks'),
      },
      {
        id: 'downloads',
        label: 'Downloads',
        accelerator: 'CmdOrCtrl+Shift+J',
        group: 'Go to',
        run: () => toggleSurface('downloads'),
      },
      {
        id: 'settings',
        label: 'Settings',
        accelerator: 'CmdOrCtrl+,',
        group: 'Go to',
        keywords: 'preferences options',
        run: () => toggleSurface('settings'),
      },
      {
        id: 'appearance',
        label: appearance === 'dark' ? 'Use light appearance' : 'Use dark appearance',
        group: 'Appearance',
        keywords: 'theme mode',
        run: then(() => send((api) => api.settings.update({ appearance: appearance === 'dark' ? 'light' : 'dark' }))),
      },
      {
        id: 'appearance-system',
        label: 'Match the system appearance',
        group: 'Appearance',
        keywords: 'theme mode auto',
        run: then(() => send((api) => api.settings.update({ appearance: 'system' }))),
      },
    );

    const sleepable = tabs.filter((tab) => tab.id !== activeTab?.id && !tab.isAsleep && !tab.isStartPage);
    if (sleepable.length > 0) {
      list.push({
        id: 'sleep-others',
        label: 'Put other tabs to sleep',
        group: 'Tabs',
        keywords: 'memory discard',
        run: then(() => sleepable.forEach((tab) => send((api) => api.tabs.sleep(tab.id)))),
      });
    }

    list.push(
      {
        id: 'clear-data',
        label: 'Clear browsing data',
        group: 'Your data',
        keywords: 'history cookies cache delete',
        run: () => openSettings('data'),
      },
      {
        id: 'import',
        label: 'Import bookmarks and history',
        group: 'Your data',
        keywords: 'chrome firefox safari edge brave file',
        run: () => openSettings('data'),
      },
      {
        id: 'export',
        label: 'Export bookmarks or history',
        group: 'Your data',
        keywords: 'backup file',
        run: () => openSettings('data'),
      },
    );

    for (const tab of tabs) {
      if (tab.id === activeTab?.id) {
        continue;
      }
      list.push({
        id: `switch:${tab.id}`,
        label: tab.isStartPage ? 'New tab' : tab.title || tab.url,
        group: 'Open tabs',
        keywords: tab.url,
        run: then(() => send((api) => api.tabs.activate(tab.id))),
      });
    }

    return list;
  }, [
    activeTab,
    appearance,
    defaultZoomFactor,
    hasClosedTabs,
    openSettings,
    requestOmniboxFocus,
    setSurface,
    tabs,
    toggleSurface,
  ]);

  // Ranked by how well each matches, then laid out in group order, so headings never repeat.
  const ranked = rankByMatch(commands, query, (command) => `${command.label} ${command.keywords ?? ''}`);
  const matches = query.trim()
    ? ranked
    : GROUP_ORDER.flatMap((group) => ranked.filter((command) => command.group === group));

  // Adjusted during render rather than in an effect: the list and its highlight change together.
  const [seenQuery, setSeenQuery] = useState(query);
  if (seenQuery !== query) {
    setSeenQuery(query);
    setHighlighted(0);
  }

  useEffect(() => {
    document.getElementById(`${listId}-${highlighted}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [highlighted, listId]);

  const onKeyDown = (event: React.KeyboardEvent) => {
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
    <div
      className="animate-fade absolute inset-0 flex justify-center bg-void/60 pt-[12vh]"
      onMouseDown={(event) => {
        // A click on the backdrop, not on the panel, closes it.
        if (event.target === event.currentTarget) {
          setSurface('none');
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="animate-pop flex h-fit max-h-[64vh] w-full max-w-xl flex-col overflow-hidden rounded-lg bg-raised shadow-dialog"
      >
        <div className="flex h-12 flex-none items-center gap-2.5 border-b border-line px-4">
          <Search size={16} className="shrink-0 text-ink-faint" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search commands and open tabs"
            aria-label="Search commands and open tabs"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={matches.length > 0 ? `${listId}-${highlighted}` : undefined}
            className="h-full min-w-0 flex-1 bg-transparent text-title text-ink outline-none placeholder:text-ink-faint"
          />
        </div>

        {matches.length === 0 ? (
          <p className="px-4 py-8 text-center text-body text-ink-dim">No command or tab matches.</p>
        ) : (
          <ul
            id={listId}
            role="listbox"
            aria-label="Commands"
            className="scroll-thin min-h-0 flex-1 overflow-y-auto p-1.5"
          >
            {matches.map((command, index) => {
              const isNewGroup = !query.trim() && command.group !== matches[index - 1]?.group;
              return (
                <li key={command.id} role="presentation">
                  {isNewGroup && <div className="label px-2.5 pb-1 pt-2.5">{command.group}</div>}
                  <div
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === highlighted}
                    onMouseMove={() => setHighlighted(index)}
                    onClick={command.run}
                    className={cn(
                      'flex h-9 items-center gap-3 rounded-sm px-2.5',
                      index === highlighted ? 'bg-hover text-ink' : 'text-ink',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate text-body">{command.label}</span>
                    {command.group === 'Open tabs' && command.keywords && (
                      <span className="max-w-[40%] shrink-0 truncate text-body-sm text-ink-faint">
                        {hostFor(command.keywords)}
                      </span>
                    )}
                    {command.accelerator && <Kbd accelerator={command.accelerator} />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function hostFor(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
