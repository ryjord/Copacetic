'use client';

// Libs
import { useEffect, useId, useMemo, useRef, useState } from 'react';

// Components
import { ClearBrowsingDialog } from '@/components/views/clearing/ClearBrowsingDialog';
import { Kbd } from '@/components/ui/Kbd/Kbd';

// Icons
import { Search } from 'lucide-react';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { ask, send } from '@/lib/bridge/bridge';
import { useDismissLayer } from '@/lib/layers/dismissLayer';
import { useFocusTrap } from '@/lib/layers/focusTrap';
import { rankByMatch } from '@/lib/text/fuzzy';
import { CLEAR_RANGES } from '@/lib/text/clearing';
import { SETTINGS_PANES, matchesTerm } from '@/components/views/settings/shared/panes';
import { cn } from '@/lib/utils';
import { t } from '@shared/i18n/translate';

// Types
import { GROUP_COLOURS } from '@shared/tabs/tab-groups';
import { clampZoom } from '@shared/types';
import { nextZoomStep } from '@shared/tabs/zoom';
import { isInSplit } from '@shared/tabs/split-view';
import { formatMemory, type TabMemory } from '@shared/tabs/tab-memory';
import { acceleratorFor, isRebindable } from '@shared/chrome/shortcuts';
import type { Bookmark, ClearRange, HistoryEntry } from '@shared/types';
import type { InternalPage } from '@shared/tabs/internal-pages';

interface Command {
  id: string;
  label: string;
  /** The shortcut that does the same thing, so the palette teaches it. */
  accelerator?: string;
  group:
    | 'tabs'
    | 'page'
    | 'goTo'
    | 'sessions'
    | 'yourData'
    | 'appearance'
    | 'openTabs'
    | 'bookmarks'
    | 'history'
    | 'settings';
  /** An address shown beside it, for a tab, bookmark or page of history. */
  address?: string;
  /** Also matched, but not shown: a tab's address, for instance. */
  keywords?: string;
  /** The open tab this switches to, for the figures shown beside it. */
  tabId?: string;
  run: () => void;
}

const GROUP_ORDER: readonly Command['group'][] = [
  'tabs',
  'page',
  'goTo',
  'sessions',
  'yourData',
  'appearance',
  'openTabs',
  'bookmarks',
  'history',
  'settings',
];

// Enough to find the one meant; the full lists are a surface away.
const MAX_FOUND = 5;

/** Bookmarks read once as the palette opens, and history asked for as the query changes. */
function useFoundElsewhere(query: string, isSearchingEverything: boolean) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const needle = query.trim();

  useEffect(() => {
    if (!isSearchingEverything) {
      return;
    }
    let isCurrent = true;
    void ask((api) => api.bookmarks.list(), []).then((found) => {
      if (isCurrent) {
        setBookmarks(found);
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [isSearchingEverything]);

  useEffect(() => {
    if (!isSearchingEverything || needle.length < 2) {
      return;
    }
    let isCurrent = true;
    const timer = setTimeout(() => {
      void ask((api) => api.history.list(needle), { entries: [], total: 0 }).then((page) => {
        if (isCurrent) {
          setHistory(page.entries.slice(0, MAX_FOUND));
        }
      });
    }, 120);
    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [needle, isSearchingEverything]);

  const lowered = needle.toLowerCase();
  return {
    bookmarks:
      needle.length < 2
        ? []
        : bookmarks
            .filter((bookmark) => `${bookmark.title} ${bookmark.url}`.toLowerCase().includes(lowered))
            .slice(0, MAX_FOUND),
    history: needle.length < 2 ? [] : history,
  };
}

/** One keystroke to reach anything, and a place to learn its shortcut: every command and open tab, or the open tabs alone as tab search. */
export function CommandPalette({ scope = 'everything' }: { scope?: 'everything' | 'tabs' }) {
  const setSurface = useBrowserStore((state) => state.setSurface);
  const requestOmniboxFocus = useBrowserStore((state) => state.requestOmniboxFocus);
  const tabs = useBrowserStore((state) => state.orderedTabs);
  const activeTab = useBrowserStore((state) => state.activeTab);
  const hasClosedTabs = useBrowserStore((state) => state.hasClosedTabs);
  const split = useBrowserStore((state) => state.split);
  const namedSessions = useBrowserStore((state) => state.namedSessions);
  const [memory, setMemory] = useState<Record<string, TabMemory>>({});

  // Once, as the palette opens: a figure that moved while you read it would be noise.
  useEffect(() => {
    let isCurrent = true;
    void ask((api) => api.tabs.memoryUse(), {}).then((measured) => {
      if (isCurrent) {
        setMemory(measured);
      }
    });
    return () => {
      isCurrent = false;
    };
  }, []);
  const appearance = useBrowserStore((state) => state.settings.appearance);
  const defaultZoomFactor = useBrowserStore((state) => state.settings.defaultZoomFactor);
  const shortcutOverrides = useBrowserStore((state) => state.settings.shortcutOverrides);

  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const [clearing, setClearing] = useState<ClearRange | null>(null);
  const [result, setResult] = useState('');
  const found = useFoundElsewhere(query, scope === 'everything');
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  // Stood down while the clear dialog is open: it keeps its own keyboard, and Escape should close only it.
  useDismissLayer(clearing === null, () => setSurface('none'));
  useFocusTrap(panelRef, clearing === null);

  const commands = useMemo<Command[]>(() => {
    const close = () => setSurface('none');
    const then = (action: () => void) => () => {
      close();
      action();
    };
    const showPage = (page: InternalPage, section: string | null = null) =>
      then(() => send((api) => api.chrome.showPage(page, section)));
    const list: Command[] = [
      {
        id: 'new-window',
        label: t('views.palette.commands.newWindow'),
        accelerator: 'CmdOrCtrl+N',
        group: 'tabs',
        run: then(() => send((api) => api.window.openNew())),
      },
      {
        id: 'new-tab',
        label: t('views.palette.commands.newTab'),
        accelerator: 'CmdOrCtrl+T',
        group: 'tabs',
        run: then(() => send((api) => api.tabs.create())),
      },
      {
        id: 'new-hush-tab',
        label: t('views.palette.commands.newHushTab'),
        accelerator: 'CmdOrCtrl+Shift+N',
        group: 'tabs',
        keywords: t('views.palette.keywords.newHushTab'),
        run: then(() => send((api) => api.tabs.createHush())),
      },
      {
        id: 'address',
        label: t('views.palette.commands.address'),
        accelerator: 'CmdOrCtrl+L',
        group: 'tabs',
        run: then(requestOmniboxFocus),
      },
    ];

    if (hasClosedTabs) {
      list.push({
        id: 'reopen',
        label: t('views.palette.commands.reopen'),
        accelerator: 'CmdOrCtrl+Shift+T',
        group: 'tabs',
        run: then(() => send((api) => api.tabs.reopenClosed())),
      });
    }

    if (activeTab) {
      const tabId = activeTab.id;
      list.push({
        id: 'close-tab',
        label: t('views.palette.commands.closeTab'),
        accelerator: 'CmdOrCtrl+W',
        group: 'tabs',
        run: then(() => send((api) => api.tabs.close(tabId))),
      });
      list.push({
        id: 'duplicate',
        label: t('views.palette.commands.duplicate'),
        group: 'tabs',
        run: then(() => send((api) => api.tabs.duplicate(tabId))),
      });
      list.push({
        id: 'pin',
        label: activeTab.isPinned ? t('views.palette.commands.unpin') : t('views.palette.commands.pin'),
        group: 'tabs',
        run: then(() => send((api) => api.tabs.setPinned(tabId, !activeTab.isPinned))),
      });
      list.push(
        isInSplit(split, tabId)
          ? {
              id: 'leave-split',
              label: t('views.palette.commands.leaveSplit'),
              group: 'tabs',
              run: then(() => send((api) => api.tabs.leaveSplit())),
            }
          : {
              id: 'split-view',
              label: t('views.palette.commands.split'),
              accelerator: 'CmdOrCtrl+Shift+E',
              group: 'tabs',
              keywords: t('views.palette.keywords.split'),
              run: then(() => send((api) => api.tabs.splitWith(null))),
            },
      );
      if (activeTab.isAudible || activeTab.isMuted) {
        list.push({
          id: 'mute',
          label: activeTab.isMuted ? t('views.palette.commands.unmute') : t('views.palette.commands.mute'),
          group: 'tabs',
          keywords: t('views.palette.keywords.mute'),
          run: then(() => send((api) => api.tabs.setMuted(tabId, !activeTab.isMuted))),
        });
      }
      list.push(
        activeTab.groupId === null
          ? {
              id: 'group-new',
              label: t('views.palette.commands.groupNew'),
              group: 'tabs',
              run: then(() =>
                send((api) => api.groups.create(tabId, t('views.palette.newGroupName'), GROUP_COLOURS[0].id, false)),
              ),
            }
          : {
              id: 'group-remove',
              label: t('views.palette.commands.groupRemove'),
              group: 'tabs',
              keywords: t('views.palette.keywords.groupRemove'),
              run: then(() => send((api) => api.groups.setForTab(tabId, null))),
            },
      );

      if (activeTab.internalPage === null) {
        const zoomTo = (factor: number) => then(() => send((api) => api.tabs.setZoom(tabId, clampZoom(factor))));
        list.push(
          {
            id: 'reader-view',
            label: t('views.palette.commands.reader'),
            group: 'page',
            keywords: t('views.palette.keywords.reader'),
            run: () => setSurface('reader'),
          },
          {
            id: 'reload',
            label: t('views.palette.commands.reload'),
            accelerator: 'CmdOrCtrl+R',
            group: 'page',
            run: then(() => send((api) => api.tabs.reload(tabId))),
          },
          {
            id: 'find',
            label: t('views.palette.commands.find'),
            accelerator: 'CmdOrCtrl+F',
            group: 'page',
            run: then(() => send((api) => api.find.open())),
          },
          {
            id: 'bookmark',
            label: activeTab.isBookmarked
              ? t('views.palette.commands.removeBookmark')
              : t('views.palette.commands.bookmark'),
            accelerator: 'CmdOrCtrl+D',
            group: 'page',
            run: then(() => send((api) => api.bookmarks.toggle(activeTab.url, activeTab.title))),
          },
          {
            id: 'save-page',
            label: t('views.palette.commands.savePage'),
            group: 'page',
            keywords: t('views.palette.keywords.savePage'),
            run: then(() => send((api) => api.tabs.savePage(tabId))),
          },
          {
            id: 'screenshot',
            label: t('views.palette.commands.screenshot'),
            group: 'page',
            keywords: t('views.palette.keywords.screenshot'),
            run: then(() => send((api) => api.tabs.saveScreenshot(tabId))),
          },
          {
            id: 'view-source',
            label: t('views.palette.commands.viewSource'),
            group: 'page',
            keywords: t('views.palette.keywords.viewSource'),
            run: then(() => send((api) => api.tabs.viewSource(tabId))),
          },
          {
            id: 'print',
            label: t('views.palette.commands.print'),
            accelerator: 'CmdOrCtrl+P',
            group: 'page',
            run: then(() => send((api) => api.tabs.print(tabId))),
          },
          {
            id: 'zoom-in',
            label: t('views.palette.commands.zoomIn'),
            accelerator: 'CmdOrCtrl+Plus',
            group: 'page',
            run: zoomTo(nextZoomStep(activeTab.zoomFactor, 'in')),
          },
          {
            id: 'zoom-out',
            label: t('views.palette.commands.zoomOut'),
            accelerator: 'CmdOrCtrl+-',
            group: 'page',
            run: zoomTo(nextZoomStep(activeTab.zoomFactor, 'out')),
          },
          {
            id: 'zoom-reset',
            label: t('views.palette.commands.zoomReset'),
            accelerator: 'CmdOrCtrl+0',
            group: 'page',
            keywords: t('views.palette.keywords.zoomReset'),
            run: zoomTo(defaultZoomFactor),
          },
          {
            id: 'devtools',
            label: t('views.palette.commands.devtools'),
            group: 'page',
            keywords: t('views.palette.keywords.devtools'),
            run: then(() => send((api) => api.tabs.toggleDevTools(tabId))),
          },
        );
      }
    }

    list.push(
      {
        id: 'history',
        label: t('views.palette.commands.history'),
        accelerator: 'CmdOrCtrl+Y',
        group: 'goTo',
        run: showPage('history'),
      },
      {
        id: 'bookmarks',
        label: t('views.palette.commands.bookmarks'),
        accelerator: 'CmdOrCtrl+Shift+B',
        group: 'goTo',
        run: showPage('bookmarks'),
      },
      {
        id: 'downloads',
        label: t('views.palette.commands.downloads'),
        accelerator: 'CmdOrCtrl+Shift+J',
        group: 'goTo',
        run: showPage('downloads'),
      },
      {
        id: 'settings',
        label: t('views.palette.commands.settings'),
        accelerator: 'CmdOrCtrl+,',
        group: 'goTo',
        keywords: t('views.palette.keywords.settings'),
        run: showPage('settings'),
      },
      {
        id: 'appearance',
        label: appearance === 'dark' ? t('views.palette.commands.useLight') : t('views.palette.commands.useDark'),
        group: 'appearance',
        keywords: t('views.palette.keywords.appearance'),
        run: then(() => send((api) => api.settings.update({ appearance: appearance === 'dark' ? 'light' : 'dark' }))),
      },
      {
        id: 'appearance-system',
        label: t('views.palette.commands.matchSystem'),
        group: 'appearance',
        keywords: t('views.palette.keywords.appearanceSystem'),
        run: then(() => send((api) => api.settings.update({ appearance: 'system' }))),
      },
    );

    const sleepable = tabs.filter((tab) => tab.id !== activeTab?.id && !tab.isAsleep && tab.internalPage === null);
    if (sleepable.length > 0) {
      list.push({
        id: 'sleep-others',
        label: t('views.palette.commands.sleepOthers'),
        group: 'tabs',
        keywords: t('views.palette.keywords.sleepOthers'),
        run: then(() => sleepable.forEach((tab) => send((api) => api.tabs.sleep(tab.id)))),
      });
    }

    // These do the thing rather than opening Settings at it; the answer is said here, where it was asked.
    const report = (action: Promise<string>) => void action.then(setResult);
    list.push(
      ...CLEAR_RANGES.map<Command>((range) => ({
        id: `clear-data-${range.id}`,
        label: t('views.palette.commands.clearData', { range: range.label.toLowerCase() }),
        group: 'yourData',
        keywords: t('views.palette.keywords.clearData'),
        run: () => setClearing(range.id),
      })),
      {
        id: 'import-bookmarks',
        label: t('views.palette.commands.importBookmarks'),
        group: 'yourData',
        keywords: t('views.palette.keywords.import'),
        run: () => report(ask((api) => api.data.importBookmarks(), '')),
      },
      {
        id: 'import-from-browser',
        label: t('views.palette.commands.importFromBrowser'),
        group: 'yourData',
        keywords: t('views.palette.keywords.import'),
        // A browser has to be chosen and what it holds looked at first, which is the Data pane's job.
        run: showPage('settings', 'data'),
      },
      {
        id: 'export-bookmarks',
        label: t('views.palette.commands.exportBookmarks'),
        group: 'yourData',
        keywords: t('views.palette.keywords.export'),
        run: () => report(ask((api) => api.data.export('bookmarks'), '')),
      },
      {
        id: 'export-history',
        label: t('views.palette.commands.exportHistory'),
        group: 'yourData',
        keywords: t('views.palette.keywords.export'),
        run: () => report(ask((api) => api.data.export('history'), '')),
      },
    );

    list.push(
      {
        id: 'save-session',
        label: t('views.palette.commands.saveSession'),
        group: 'sessions',
        keywords: t('views.palette.keywords.session'),
        run: then(() => send((api) => api.sessions.save())),
      },
      ...namedSessions.map<Command>((session) => ({
        id: `session:${session.id}`,
        label: t('views.palette.commands.openSession', { name: session.name }),
        group: 'sessions',
        keywords: t('views.palette.keywords.session'),
        run: then(() => send((api) => api.sessions.open(session.id))),
      })),
    );

    const tabCommands = tabs
      .filter((tab) => scope === 'tabs' || tab.id !== activeTab?.id)
      .map<Command>((tab) => ({
        id: `switch:${tab.id}`,
        tabId: tab.id,
        label: tab.title || tab.url,
        group: 'openTabs',
        keywords: tab.url,
        address: tab.url,
        run: then(() => send((api) => api.tabs.activate(tab.id))),
      }));
    if (scope === 'tabs') {
      return tabCommands;
    }
    list.push(...tabCommands);

    // Taught as they are bound now, which may not be where they started.
    return list.map((command) =>
      isRebindable(command.id) ? { ...command, accelerator: acceleratorFor(command.id, shortcutOverrides) } : command,
    );
  }, [
    activeTab,
    appearance,
    defaultZoomFactor,
    hasClosedTabs,
    requestOmniboxFocus,
    setSurface,
    scope,
    namedSessions,
    shortcutOverrides,
    split,
    tabs,
  ]);

  // Opened where the person is looking, as a bookmark or a history entry would be from its own list.
  const openHere = (url: string) => {
    setSurface('none');
    if (activeTab) {
      send((api) => api.tabs.navigate(activeTab.id, url));
    } else {
      send((api) => api.tabs.create(url));
    }
  };
  const elsewhere: Command[] =
    scope === 'tabs'
      ? []
      : [
          ...found.bookmarks.map<Command>((bookmark) => ({
            id: `bookmark:${bookmark.id}`,
            label: bookmark.title || bookmark.url,
            group: 'bookmarks',
            keywords: `${bookmark.url} ${t('views.palette.keywords.bookmark')}`,
            address: bookmark.url,
            run: () => openHere(bookmark.url),
          })),
          ...found.history
            .filter((entry) => !found.bookmarks.some((bookmark) => bookmark.url === entry.url))
            .map<Command>((entry) => ({
              id: `history:${entry.id}`,
              label: entry.title || entry.url,
              group: 'history',
              keywords: `${entry.url} ${t('views.palette.keywords.historyEntry')}`,
              address: entry.url,
              run: () => openHere(entry.url),
            })),
          ...SETTINGS_PANES.filter(
            (pane) => query.trim() && matchesTerm(`${pane.label} ${pane.terms.join(' ')}`, query),
          ).map<Command>((pane) => ({
            id: `settings:${pane.id}`,
            label: t('views.palette.commands.openSettingsPane', { pane: pane.label }),
            group: 'settings',
            keywords: pane.terms.join(' '),
            run: () => {
              setSurface('none');
              send((api) => api.chrome.showPage('settings', pane.id));
            },
          })),
        ];

  // Ranked by how well each matches, then laid out in group order, so headings never repeat.
  const ranked = rankByMatch(
    [...commands, ...elsewhere],
    query,
    (command) => `${command.label} ${command.keywords ?? ''}`,
  );
  const isSearching = query.trim() !== '';
  const matches = isSearching
    ? ranked
    : GROUP_ORDER.flatMap((group) => ranked.filter((command) => command.group === group));
  // Searched, the best match leads whatever its group; otherwise each group is listed under its name.
  const indexed = matches.map((command, index) => ({ command, index }));
  const sections = isSearching
    ? [{ group: null, entries: indexed }]
    : GROUP_ORDER.map((group) => ({
        group,
        entries: indexed.filter((entry) => entry.command.group === group),
      })).filter((section) => section.entries.length > 0);

  // Adjusted during render rather than in an effect: the list and its highlight change together.
  const [seenQuery, setSeenQuery] = useState(query);
  if (seenQuery !== query) {
    setSeenQuery(query);
    setHighlighted(0);
  }
  // The list can shrink without the query changing, as a tab closes, and the highlight must stay on something listed.
  const shownHighlight = Math.min(highlighted, Math.max(0, matches.length - 1));

  useEffect(() => {
    document.getElementById(`${listId}-${shownHighlight}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [shownHighlight, listId]);

  const placeholder = scope === 'tabs' ? t('views.palette.searchTabs') : t('views.palette.searchEverything');

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (matches.length === 0) {
        return;
      }
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setHighlighted((shownHighlight + delta + matches.length) % matches.length);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      matches[shownHighlight]?.run();
    }
  };

  const renderOption = ({ command, index }: { command: Command; index: number }) => (
    <div
      key={command.id}
      id={`${listId}-${index}`}
      role="option"
      aria-selected={index === shownHighlight}
      onMouseMove={() => setHighlighted(index)}
      onClick={command.run}
      className={cn(
        'flex h-9 items-center gap-3 rounded-sm px-2.5',
        index === shownHighlight ? 'bg-accent-soft text-ink outline-2 -outline-offset-2 outline-accent' : 'text-ink',
      )}
    >
      <span className="min-w-0 flex-1 truncate text-body">{command.label}</span>
      {command.address && (
        <span className="max-w-[40%] shrink-0 truncate text-body-sm text-ink-faint">{hostFor(command.address)}</span>
      )}
      {command.tabId && memory[command.tabId] && (
        <span className="shrink-0 text-body-sm tabular-nums text-ink-faint">
          {formatMemory(memory[command.tabId]?.kilobytes ?? 0)}
        </span>
      )}
      {command.accelerator && <Kbd accelerator={command.accelerator} />}
    </div>
  );

  return (
    <div
      className="animate-fade absolute inset-0 flex justify-center bg-scrim pt-[12vh]"
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
        aria-label={scope === 'tabs' ? t('views.palette.tabSearch') : t('views.palette.label')}
        className="animate-pop flex h-fit max-h-[64vh] w-full max-w-xl flex-col overflow-hidden rounded-lg bg-raised shadow-dialog"
      >
        <div className="flex h-12 flex-none items-center gap-2.5 border-b border-line px-4">
          <Search size={16} className="shrink-0 text-ink-faint" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-label={placeholder}
            role="combobox"
            aria-expanded={matches.length > 0}
            aria-controls={listId}
            aria-activedescendant={matches.length > 0 ? `${listId}-${shownHighlight}` : undefined}
            className="h-full min-w-0 flex-1 bg-transparent text-title text-ink outline-none placeholder:text-ink-faint"
          />
        </div>

        {matches.length === 0 ? (
          <p className="px-4 py-8 text-center text-body text-ink-dim">
            {scope === 'tabs' ? t('views.palette.noTabMatches') : t('views.palette.noMatches')}
          </p>
        ) : (
          <div
            id={listId}
            role="listbox"
            aria-label={t('views.palette.commandsList')}
            className="scroll-thin min-h-0 flex-1 overflow-y-auto p-1.5"
          >
            {sections.map((section) =>
              section.group === null ? (
                section.entries.map(renderOption)
              ) : (
                <div key={section.group} role="group" aria-labelledby={`${listId}-group-${section.group}`}>
                  <div id={`${listId}-group-${section.group}`} className="label px-2.5 pb-1 pt-2.5">
                    {t(`views.palette.groups.${section.group}`)}
                  </div>
                  {section.entries.map(renderOption)}
                </div>
              ),
            )}
          </div>
        )}
        {result && (
          <p role="status" className="border-t border-line px-4 py-2.5 text-body-sm text-ink-dim">
            {result}
          </p>
        )}
      </div>

      {clearing && (
        <ClearBrowsingDialog
          key={clearing}
          range={clearing}
          open
          onOpenChange={(isOpen) => !isOpen && setClearing(null)}
          onConfirm={(choice) => {
            setClearing(null);
            setSurface('none');
            send((api) => api.history.clear(clearing, choice));
          }}
        />
      )}
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
