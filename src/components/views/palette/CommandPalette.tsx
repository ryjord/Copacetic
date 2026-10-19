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
import { send } from '@/lib/bridge/bridge';
import { useDismissLayer } from '@/lib/layers/dismissLayer';
import { useFocusTrap } from '@/lib/layers/focusTrap';
import { rankByMatch } from '@/lib/text/fuzzy';
import { cn } from '@/lib/utils';
import { t } from '@shared/i18n/translate';

// Types
import { GROUP_COLOURS } from '@shared/tabs/tab-groups';
import { clampZoom } from '@shared/types';
import { nextZoomStep } from '@shared/tabs/zoom';
import { isInSplit } from '@shared/tabs/split-view';
import { acceleratorFor, isRebindable } from '@shared/chrome/shortcuts';

interface Command {
  id: string;
  label: string;
  /** The shortcut that does the same thing, so the palette teaches it. */
  accelerator?: string;
  group: 'tabs' | 'page' | 'goTo' | 'yourData' | 'appearance' | 'openTabs';
  /** Also matched, but not shown: a tab's address, for instance. */
  keywords?: string;
  run: () => void;
}

const GROUP_ORDER: readonly Command['group'][] = ['tabs', 'page', 'goTo', 'yourData', 'appearance', 'openTabs'];

/** One keystroke to reach anything, and a place to learn the shortcut for it. */
/** Every command and open tab, or, opened as tab search, the open tabs alone. */
export function CommandPalette({ scope = 'everything' }: { scope?: 'everything' | 'tabs' }) {
  const setSurface = useBrowserStore((state) => state.setSurface);
  const toggleSurface = useBrowserStore((state) => state.toggleSurface);
  const openSettings = useBrowserStore((state) => state.openSettings);
  const requestOmniboxFocus = useBrowserStore((state) => state.requestOmniboxFocus);
  const tabs = useBrowserStore((state) => state.orderedTabs);
  const activeTab = useBrowserStore((state) => state.activeTab);
  const hasClosedTabs = useBrowserStore((state) => state.hasClosedTabs);
  const split = useBrowserStore((state) => state.split);
  const appearance = useBrowserStore((state) => state.settings.appearance);
  const defaultZoomFactor = useBrowserStore((state) => state.settings.defaultZoomFactor);
  const shortcutOverrides = useBrowserStore((state) => state.settings.shortcutOverrides);

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

      if (!activeTab.isStartPage) {
        const zoomTo = (factor: number) => then(() => send((api) => api.tabs.setZoom(tabId, clampZoom(factor))));
        list.push(
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
        run: () => toggleSurface('history'),
      },
      {
        id: 'bookmarks',
        label: t('views.palette.commands.bookmarks'),
        accelerator: 'CmdOrCtrl+Shift+B',
        group: 'goTo',
        run: () => toggleSurface('bookmarks'),
      },
      {
        id: 'downloads',
        label: t('views.palette.commands.downloads'),
        accelerator: 'CmdOrCtrl+Shift+J',
        group: 'goTo',
        run: () => toggleSurface('downloads'),
      },
      {
        id: 'settings',
        label: t('views.palette.commands.settings'),
        accelerator: 'CmdOrCtrl+,',
        group: 'goTo',
        keywords: t('views.palette.keywords.settings'),
        run: () => toggleSurface('settings'),
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

    const sleepable = tabs.filter((tab) => tab.id !== activeTab?.id && !tab.isAsleep && !tab.isStartPage);
    if (sleepable.length > 0) {
      list.push({
        id: 'sleep-others',
        label: t('views.palette.commands.sleepOthers'),
        group: 'tabs',
        keywords: t('views.palette.keywords.sleepOthers'),
        run: then(() => sleepable.forEach((tab) => send((api) => api.tabs.sleep(tab.id)))),
      });
    }

    list.push(
      {
        id: 'clear-data',
        label: t('views.palette.commands.clearData'),
        group: 'yourData',
        keywords: t('views.palette.keywords.clearData'),
        run: () => openSettings('data'),
      },
      {
        id: 'import',
        label: t('views.palette.commands.import'),
        group: 'yourData',
        keywords: t('views.palette.keywords.import'),
        run: () => openSettings('data'),
      },
      {
        id: 'export',
        label: t('views.palette.commands.export'),
        group: 'yourData',
        keywords: t('views.palette.keywords.export'),
        run: () => openSettings('data'),
      },
    );

    const tabCommands = tabs
      .filter((tab) => scope === 'tabs' || tab.id !== activeTab?.id)
      .map<Command>((tab) => ({
        id: `switch:${tab.id}`,
        label: tab.isStartPage ? t('views.palette.commands.newTab') : tab.title || tab.url,
        group: 'openTabs',
        keywords: tab.url,
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
    openSettings,
    requestOmniboxFocus,
    setSurface,
    scope,
    shortcutOverrides,
    split,
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

  const placeholder = scope === 'tabs' ? t('views.palette.searchTabs') : t('views.palette.searchEverything');

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
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={matches.length > 0 ? `${listId}-${highlighted}` : undefined}
            className="h-full min-w-0 flex-1 bg-transparent text-title text-ink outline-none placeholder:text-ink-faint"
          />
        </div>

        {matches.length === 0 ? (
          <p className="px-4 py-8 text-center text-body text-ink-dim">
            {scope === 'tabs' ? t('views.palette.noTabMatches') : t('views.palette.noMatches')}
          </p>
        ) : (
          <ul
            id={listId}
            role="listbox"
            aria-label={t('views.palette.commandsList')}
            className="scroll-thin min-h-0 flex-1 overflow-y-auto p-1.5"
          >
            {matches.map((command, index) => {
              const isNewGroup = !query.trim() && command.group !== matches[index - 1]?.group;
              return (
                <li key={command.id} role="presentation">
                  {isNewGroup && (
                    <div className="label px-2.5 pb-1 pt-2.5">{t(`views.palette.groups.${command.group}`)}</div>
                  )}
                  <div
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === highlighted}
                    onMouseMove={() => setHighlighted(index)}
                    onClick={command.run}
                    className={cn(
                      'flex h-9 items-center gap-3 rounded-sm px-2.5',
                      index === highlighted ? 'bg-accent-soft text-ink' : 'text-ink',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate text-body">{command.label}</span>
                    {command.group === 'openTabs' && command.keywords && (
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
