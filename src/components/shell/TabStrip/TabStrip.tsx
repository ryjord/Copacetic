'use client';

// Libs
import { Fragment, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';

// Components
import { Favicon } from '@/components/ui/Favicon/Favicon';
import { IconButton } from '@/components/ui/IconButton/IconButton';
import { InlineRenameField } from '@/components/ui/InlineRenameField/InlineRenameField';

// Icons
import {
  AlertCircle,
  ChevronDown,
  Columns2,
  EyeOff,
  ListChevronsUpDown,
  Lock,
  Plus,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { ask, getBridge, send } from '@/lib/bridge/bridge';
import { cn } from '@/lib/utils';
import { t } from '@shared/i18n/translate';
import { isInSplit } from '@shared/tabs/split-view';
import { describeMemory } from '@shared/tabs/tab-memory';

// Types
import type { TabState } from '@shared/types';
import {
  claimOf,
  colourOf,
  tintOf,
  describeClaim,
  groupForDrop,
  segmentByGroup,
  type TabGroup,
} from '@shared/tabs/tab-groups';

const CROWDED_TAB_WIDTH = 72;
// Roughly the system's double-click interval: longer and folding feels slow, shorter and a double-click folds first.
const DOUBLE_CLICK_MS = 250;

interface TabStripProps {
  tabs: TabState[];
  activeTabId: string | null;
  groups: TabGroup[];
}

export function TabStrip({ tabs, activeTabId, groups }: TabStripProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const toggleSurface = useBrowserStore((state) => state.toggleSurface);
  // Crowded once a tab is too narrow for its title: past that, finding one by its icon alone is guesswork.
  const [isCrowded, setIsCrowded] = useState(false);

  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip) {
      return;
    }
    const measure = () =>
      setIsCrowded(
        strip.scrollWidth > strip.clientWidth || strip.clientWidth / Math.max(1, tabs.length) < CROWDED_TAB_WIDTH,
      );
    measure();
    const resizes = new ResizeObserver(measure);
    resizes.observe(strip);
    return () => resizes.disconnect();
  }, [tabs.length]);

  const handleDrop = (index: number) => {
    const from = dragId ? tabs.findIndex((tab) => tab.id === dragId) : -1;
    // A tab dropped where it already was has not been moved, so nothing about
    // it should be re-decided: a tab parked between two of a group's tabs would
    // otherwise be swallowed by the group on the smallest twitch of the mouse.
    if (dragId && from !== -1 && from !== index) {
      // Where it lands decides which group it is in, not just where it sits.
      const groupId = groupForDrop(tabs, from, index);
      send((api) => api.tabs.move(dragId, index));
      send((api) => api.groups.setForTab(dragId, groupId));
    }
    setDragId(null);
    setDropIndex(null);
  };

  // segmentByGroup has already visited every tab in order, so where each run
  // starts falls out of the run lengths - the strip does not need scanning
  // again for every run.
  const runs = segmentByGroup(tabs);
  const runStarts = startsOf(runs);

  return (
    <div className="flex h-full min-w-0 flex-1 items-end gap-0.5">
      {isCrowded && (
        <IconButton
          label={t('shell.tabStrip.everyTab', { count: tabs.length })}
          size="sm"
          className="mb-1"
          onClick={() => toggleSurface('tab-search')}
        >
          <ListChevronsUpDown size={14} strokeWidth={1.75} />
        </IconButton>
      )}
      <div
        ref={stripRef}
        role="tablist"
        aria-label={t('shell.tabStrip.openTabs')}
        // Roving tabindex: one stop for the whole strip, then arrows to move
        // within it. Every tab being individually tabbable would mean thirty
        // stops between the strip and the address bar.
        onKeyDown={(event) => {
          const current = tabs.findIndex((tab) => tab.id === activeTabId);
          if (current === -1) {
            return;
          }

          const go = (index: number) => {
            event.preventDefault();
            const next = tabs[(index + tabs.length) % tabs.length];
            if (next) {
              send((api) => api.tabs.activate(next.id));
            }
          };

          if (event.key === 'ArrowRight') {
            go(current + 1);
          } else if (event.key === 'ArrowLeft') {
            go(current - 1);
          } else if (event.key === 'Home') {
            go(0);
          } else if (event.key === 'End') {
            go(tabs.length - 1);
          } else if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            send((api) => api.tabs.close(tabs[current]!.id));
          }
        }}
        // A wheel moves up and down; a strip that only scrolls sideways should take that too.
        onWheel={(event) => {
          if (stripRef.current && event.deltaX === 0) {
            stripRef.current.scrollLeft += event.deltaY;
          }
        }}
        className="hide-scrollbar flex h-full min-w-0 items-end gap-0.5 overflow-x-auto"
      >
        {runs.map((run, runIndex) => {
          const group = run.groupId ? groups.find((candidate) => candidate.id === run.groupId) : undefined;
          const startsAt = runStarts[runIndex] ?? 0;

          const rendered = run.tabs.map((tab, offset) => {
            const index = startsAt + offset;
            return (
              <Tab
                key={tab.id}
                tab={tab}
                isActive={tab.id === activeTabId}
                isDragging={dragId === tab.id}
                showDropBefore={dropIndex === index && dragId !== tab.id}
                onDragStart={() => setDragId(tab.id)}
                onDragEnd={() => {
                  setDragId(null);
                  setDropIndex(null);
                }}
                onDragOver={() => setDropIndex(index)}
                onDrop={() => handleDrop(index)}
              />
            );
          });

          // Ungrouped tabs sit directly in the strip so they can shrink alongside each other.
          if (!group) {
            return <Fragment key={`ungrouped-${runIndex}`}>{rendered}</Fragment>;
          }

          return (
            <GroupRun key={`${group.id}-${runIndex}`} group={group} holdsHush={run.tabs.some((tab) => tab.isHush)}>
              {rendered}
            </GroupRun>
          );
        })}
      </div>
      {/* Outside the scroller, so it stays in reach however many tabs are open. */}
      <IconButton
        label={t('shell.tabStrip.newTab')}
        size="sm"
        // Level with the middle of the tabs, which sit on the bottom of the strip.
        className="mb-1"
        onClick={() => send((api) => api.tabs.create())}
        onContextMenu={(event) => {
          event.preventDefault();
          send((api) => api.tabs.openNewTabMenu());
        }}
      >
        <Plus size={16} strokeWidth={1.75} />
      </IconButton>
      {/* What the right-click opens, made visible: saved sessions and recently closed were only there to be found. */}
      <IconButton
        label={t('shell.tabStrip.newTabMenu')}
        size="sm"
        className="mb-1 -ml-1 w-5"
        onClick={() => send((api) => api.tabs.openNewTabMenu())}
      >
        <ChevronDown size={14} strokeWidth={1.75} />
      </IconButton>
    </div>
  );
}

interface TabProps {
  tab: TabState;
  isActive: boolean;
  isDragging: boolean;
  showDropBefore: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDrop: () => void;
}

// One pass: rebuilding the list with a spread at every run made this grow with the square of the tabs.
function startsOf(runs: readonly { tabs: readonly unknown[] }[]): number[] {
  const starts: number[] = [];
  runs.reduce((start, run) => {
    starts.push(start);
    return start + run.tabs.length;
  }, 0);
  return starts;
}

function Tab({ tab, isActive, isDragging, showDropBefore, onDragStart, onDragEnd, onDragOver, onDrop }: TabProps) {
  const title = tab.isStartPage ? t('shell.tabStrip.newTab') : tab.title;
  const ref = useRef<HTMLDivElement>(null);
  const isSplit = useBrowserStore((state) => isInSplit(state.split, tab.id));
  const [memoryLine, setMemoryLine] = useState<string | null>(null);

  // Measured as the pointer arrives, so the tooltip it is about to show is current.
  const measureMemory = () => {
    if (tab.isStartPage) {
      return;
    }
    void ask((api) => api.tabs.memoryUse(), {}).then((measured) => {
      const own = measured[tab.id];
      setMemoryLine(own ? describeMemory(own) : null);
    });
  };

  // With a roving tabindex the previously selected tab stops being a tab stop
  // the moment selection moves, so focus has to move with it or it is lost to
  // the document. Only when focus was already in the strip: arrowing through
  // tabs should follow the keyboard, but clicking a tab or pressing Cmd+2 must
  // not yank focus out of the page or the address bar.
  useEffect(() => {
    const element = ref.current;
    if (!isActive || !element || element === document.activeElement) {
      return;
    }
    element.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    if (element.closest('[role="tablist"]')?.contains(document.activeElement)) {
      element.focus();
    }
  }, [isActive]);

  return (
    <div
      ref={ref}
      className={cn(
        // A set width, not a basis: container queries zero its natural width. Shrinks to its icon before scrolling.
        // The active tab joins the toolbar below it, so only its top corners are rounded.
        'no-drag group @container relative h-[var(--chrome-tab-height)] rounded-t-tab transition-[background-color,opacity] duration-150',
        // Pinned: always just its icon, which the compact rules below give it without a separate layout.
        tab.isPinned ? 'w-9 shrink-0' : 'w-55 min-w-9 shrink',
        tab.isHush
          ? isActive
            ? 'bg-hush/14 shadow-[inset_0_2px_0_var(--color-hush)]'
            : 'bg-hush/8 hover:bg-hush/12'
          : isActive
            ? 'bg-toolbar'
            : 'hover:bg-hover/70',
        tab.isAsleep && !isActive && 'opacity-60',
        isDragging && 'opacity-40',
        showDropBefore &&
          'before:absolute before:-left-[3px] before:top-1 before:bottom-1 before:w-0.5 before:rounded-full before:bg-active',
      )}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        event.preventDefault();
        onDragOver();
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
      onClick={() => send((api) => api.tabs.activate(tab.id))}
      onAuxClick={(event) => {
        // Middle-click closes, as it does in every other browser.
        if (event.button === 1) {
          send((api) => api.tabs.close(tab.id));
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        send((api) => api.tabs.openContextMenu(tab.id));
      }}
      role="tab"
      aria-label={[
        title,
        tab.isPinned ? t('shell.tabStrip.pinned') : null,
        tab.isAsleep ? t('shell.tabStrip.asleep') : null,
        tab.isHush ? t('shell.tabStrip.hushTab') : null,
        isSplit ? t('shell.tabStrip.inSplit') : null,
      ]
        .filter(Boolean)
        .join(', ')}
      aria-selected={isActive}
      // Only the selected tab is a tab stop; the rest are reached with arrows.
      tabIndex={isActive ? 0 : -1}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          send((api) => api.tabs.activate(tab.id));
        }
      }}
      onPointerEnter={measureMemory}
      title={tab.isStartPage ? title : [tab.title, tab.url, memoryLine].filter(Boolean).join('\n')}
    >
      <div className="flex h-full items-center gap-2 px-2.5 @max-[72px]:justify-center @max-[72px]:px-0">
        {tab.isLoading ? (
          <span
            aria-label={t('shell.tabStrip.loading')}
            className="size-[15px] shrink-0 animate-spin rounded-full border-[1.5px] border-line-strong border-t-active"
          />
        ) : (
          <Favicon dataUrl={tab.faviconDataUrl} seed={tab.url} size={15} />
        )}

        {tab.isHush && (
          <EyeOff size={14} strokeWidth={1.75} className="shrink-0 text-hush @max-[72px]:hidden" aria-hidden />
        )}
        {isSplit && (
          <Columns2 size={13} strokeWidth={1.75} className="shrink-0 text-ink-faint @max-[72px]:hidden" aria-hidden />
        )}
        <span
          className={cn('flex-1 truncate text-body-sm @max-[72px]:hidden', isActive ? 'text-ink' : 'text-ink-dim')}
        >
          {title}
        </span>

        {tab.isAudible || tab.isMuted ? (
          <button
            type="button"
            aria-label={tab.isMuted ? t('shell.tabStrip.unmute') : t('shell.tabStrip.mute')}
            className="shrink-0 text-ink-dim hover:text-ink @max-[72px]:hidden"
            onClick={(event) => {
              event.stopPropagation();
              send((api) => api.tabs.setMuted(tab.id, !tab.isMuted));
            }}
          >
            {tab.isMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
          </button>
        ) : null}

        <button
          type="button"
          aria-label={t('shell.tabStrip.close', { title })}
          className={cn(
            'grid size-4 shrink-0 place-items-center rounded transition-opacity hover:bg-line-strong @max-[72px]:hidden',
            isActive ? 'opacity-70' : 'opacity-0 group-hover:opacity-70',
          )}
          onClick={(event) => {
            event.stopPropagation();
            send((api) => api.tabs.close(tab.id));
          }}
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}

/** A group's own mark, and the only place its colour appears: never filling a tab keeps Hush the strongest tint. */
function GroupRun({ group, holdsHush, children }: { group: TabGroup; holdsHush: boolean; children: ReactNode }) {
  const [isRenaming, setIsRenaming] = useState(false);
  const foldTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(foldTimer.current), []);

  useEffect(() => {
    const api = getBridge();
    return api?.on.renameGroup((id) => {
      if (id === group.id) {
        setIsRenaming(true);
      }
    });
  }, [group.id]);

  const claim = claimOf(group, holdsHush);
  const colour = colourOf(group.colour);
  const tint = tintOf(group.colour);

  // No wrapper around the tabs: as direct children of the strip they shrink alongside every other tab.
  return (
    <>
      <div
        role="presentation"
        className="flex shrink-0 items-center gap-0.5"
        onContextMenu={(event) => {
          event.preventDefault();
          send((api) => api.groups.openContextMenu(group.id));
        }}
      >
        {isRenaming ? (
          <div
            className="flex h-6 shrink-0 items-center rounded-full px-2.5"
            style={{ color: colour, background: tint }}
          >
            <InlineRenameField
              value={group.name}
              label={group.name}
              onCommit={(next) => send((api) => api.groups.update(group.id, { name: next }))}
              onCancel={() => setIsRenaming(false)}
            />
          </div>
        ) : (
          <button
            type="button"
            // Named for what it does, not just what it says: pressing it folds the group away.
            aria-label={
              group.collapsed
                ? t('shell.tabStrip.expandGroup', { name: group.name })
                : t('shell.tabStrip.collapseGroup', { name: group.name })
            }
            aria-expanded={!group.collapsed}
            title={t('shell.tabStrip.groupHint', { claim: describeClaim(claim) })}
            onClick={(event) => {
              // Held for a moment, so the first click of a double-click never folds the group out from under the rename.
              if (event.detail > 1) {
                return;
              }
              clearTimeout(foldTimer.current);
              foldTimer.current = setTimeout(
                () => send((api) => api.groups.update(group.id, { collapsed: !group.collapsed })),
                DOUBLE_CLICK_MS,
              );
            }}
            onDoubleClick={() => {
              clearTimeout(foldTimer.current);
              setIsRenaming(true);
            }}
            className="flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-caption font-medium transition-[filter] hover:brightness-110"
            style={{ color: colour, background: tint }}
          >
            <span className="max-w-[14ch] truncate">{group.name}</span>
            {claim === 'separate' && <Lock size={11} aria-label={t('shell.tabStrip.keepsOwnBrowsing')} />}
            {/* A group holding a Hush tab cannot claim to be separate, because that
              would be true of only part of what it names. */}
            {claim === 'mixed' && (
              <AlertCircle size={11} className="text-caution" aria-label={t('shell.tabStrip.mixed')} />
            )}
            <ChevronDown
              size={11}
              aria-hidden
              className={cn('shrink-0 opacity-70 transition-transform', group.collapsed && '-rotate-90')}
            />
          </button>
        )}
      </div>
      {!group.collapsed && children}
    </>
  );
}
