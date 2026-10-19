'use client';

// Libs
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';

// Components
import { Favicon } from '@/components/ui/Favicon/Favicon';
import { IconButton } from '@/components/ui/IconButton/IconButton';
import { InlineRenameField } from '@/components/ui/InlineRenameField/InlineRenameField';

// Icons
import { AlertCircle, ChevronDown, EyeOff, Lock, Plus, Volume2, VolumeX, X } from 'lucide-react';

// Utils
import { getBridge, send } from '@/lib/bridge';
import { cn } from '@/lib/utils';

// Types
import type { TabState } from '@shared/types';
import { claimOf, colourOf, describeClaim, groupForDrop, segmentByGroup, type TabGroup } from '@shared/tab-groups';

interface TabStripProps {
  tabs: TabState[];
  activeTabId: string | null;
  groups: TabGroup[];
}

export function TabStrip({ tabs, activeTabId, groups }: TabStripProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);

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
  // starts falls out of the run lengths — the strip does not need scanning
  // again for every run.
  const runs = segmentByGroup(tabs);
  const runStarts = runs.reduce<number[]>(
    (starts, run, index) => [...starts, (starts[index - 1] ?? 0) + (runs[index - 1]?.tabs.length ?? 0)],
    [],
  );

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <div
        ref={stripRef}
        role="tablist"
        aria-label="Open tabs"
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
        className="hide-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto"
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
        label="New tab"
        size="sm"
        onClick={() => send((api) => api.tabs.create())}
        onContextMenu={(event) => {
          event.preventDefault();
          send((api) => api.tabs.openNewTabMenu());
        }}
      >
        <Plus size={16} strokeWidth={1.75} />
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

function Tab({ tab, isActive, isDragging, showDropBefore, onDragStart, onDragEnd, onDragOver, onDrop }: TabProps) {
  const title = tab.isStartPage ? 'New tab' : tab.title;
  const ref = useRef<HTMLDivElement>(null);

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
        'no-drag group @container relative h-[var(--chrome-tab-height)] w-55 min-w-9 shrink rounded-tab transition-[background-color,opacity] duration-150',
        tab.isHush
          ? isActive
            ? 'bg-hush/20'
            : 'bg-hush/8 hover:bg-hush/14'
          : isActive
            ? 'bg-raised'
            : 'hover:bg-raised/55',
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
      aria-label={tab.isHush ? `${title}, Hush tab` : title}
      aria-selected={isActive}
      // Only the selected tab is a tab stop; the rest are reached with arrows.
      tabIndex={isActive ? 0 : -1}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          send((api) => api.tabs.activate(tab.id));
        }
      }}
      title={tab.isStartPage ? title : `${tab.title}\n${tab.url}`}
    >
      <div className="flex h-full items-center gap-2 px-2.5 @max-[72px]:justify-center @max-[72px]:px-0">
        {tab.isLoading ? (
          <span
            aria-label="Loading"
            className="size-[15px] shrink-0 animate-spin rounded-full border-[1.5px] border-line-strong border-t-active"
          />
        ) : (
          <Favicon dataUrl={tab.faviconDataUrl} seed={tab.url} size={15} />
        )}

        {tab.isHush && (
          <EyeOff size={14} strokeWidth={1.75} className="shrink-0 text-hush @max-[72px]:hidden" aria-hidden />
        )}
        <span
          className={cn('flex-1 truncate text-body-sm @max-[72px]:hidden', isActive ? 'text-ink' : 'text-ink-dim')}
        >
          {title}
        </span>

        {tab.isAudible || tab.isMuted ? (
          <button
            type="button"
            aria-label={tab.isMuted ? 'Unmute tab' : 'Mute tab'}
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
          aria-label={`Close ${title}`}
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
            style={{ color: colour, background: `${colour}26` }}
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
            // Named for what it does, not just what it says. The tooltip is a
            // mouse-only hint; without this the accessible name is the group's
            // name alone, which does not suggest that pressing it renames.
            aria-label={`Rename ${group.name}`}
            title={`${describeClaim(claim)}\n\nClick to rename, right-click for more`}
            // Click names it; the chevron collapses it. A click that hid the tabs
            // would make renaming the thing you cannot see.
            onClick={() => setIsRenaming(true)}
            className="flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-caption font-medium transition-[filter] hover:brightness-110"
            style={{ color: colour, background: `${colour}26` }}
          >
            <span className="max-w-[14ch] truncate">{group.name}</span>
            {claim === 'separate' && <Lock size={11} aria-label="Keeps its own browsing" />}
            {/* A group holding a Hush tab cannot claim to be separate, because that
              would be true of only part of what it names. */}
            {claim === 'mixed' && <AlertCircle size={11} className="text-caution" aria-label="Mixed" />}
          </button>
        )}
        <button
          type="button"
          aria-label={group.collapsed ? `Expand ${group.name}` : `Collapse ${group.name}`}
          onClick={() => send((api) => api.groups.update(group.id, { collapsed: !group.collapsed }))}
          className="shrink-0 rounded px-0.5 text-ink-faint transition-colors hover:text-ink"
        >
          <ChevronDown size={11} className={cn('transition-transform', group.collapsed && '-rotate-90')} />
        </button>
      </div>
      {!group.collapsed && children}
    </>
  );
}
