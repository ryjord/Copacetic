'use client';

import { AlertCircle, ChevronDown, EyeOff, Lock, Plus, Volume2, VolumeX, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { TabState } from '@shared/types';
import { claimOf, colourOf, describeClaim, groupForDrop, segmentByGroup, type TabGroup } from '@shared/tab-groups';
import { Favicon } from '@/components/ui/media/Favicon';
import { IconButton } from '@/components/ui/controls/IconButton';
import { GroupPanel } from '@/components/chrome/TabStrip/GroupPanel';
import { getBridge, send } from '@/lib/bridge';
import { cn } from '@/lib/utils';

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
    if (dragId) {
      const from = tabs.findIndex((tab) => tab.id === dragId);
      // Where it lands decides which group it is in, not just where it sits.
      const groupId = from === -1 ? null : groupForDrop(tabs, from, index);
      send((api) => api.tabs.move(dragId, index));
      send((api) => api.groups.setForTab(dragId, groupId));
    }
    setDragId(null);
    setDropIndex(null);
  };

  return (
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
      className="hide-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
    >
      {segmentByGroup(tabs).map((run, runIndex) => {
        const group = run.groupId ? groups.find((candidate) => candidate.id === run.groupId) : undefined;
        const startsAt = tabs.indexOf(run.tabs[0] as TabState);

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

        if (!group) {
          return (
            <div key={`ungrouped-${runIndex}`} className="flex items-center gap-1">
              {rendered}
            </div>
          );
        }

        return (
          <GroupBand key={`${group.id}-${runIndex}`} group={group} holdsHush={run.tabs.some((tab) => tab.isHush)}>
            {rendered}
          </GroupBand>
        );
      })}

      <IconButton label="New tab" size="sm" className="ml-0.5" onClick={() => send((api) => api.tabs.create())}>
        <Plus size={14} />
      </IconButton>
      {/* A Hush tab was reachable by shortcut or menu bar only, which is no use to someone using a mouse. */}
      <IconButton label="More ways to open a tab" size="sm" onClick={() => send((api) => api.tabs.openNewTabMenu())}>
        <ChevronDown size={12} />
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
    if (element.parentElement?.contains(document.activeElement)) {
      element.focus();
    }
  }, [isActive]);

  return (
    <div
      ref={ref}
      className={cn(
        'no-drag group relative flex h-[var(--chrome-tab-height)] min-w-[var(--chrome-tab-min-width)] max-w-[220px] shrink-0 items-center gap-2 rounded-tab px-2.5 transition-[background-color,opacity] duration-150',
        isActive ? 'bg-raised' : 'hover:bg-raised/55',
        // The shape of the tab is what reads across a strip of eight. One small
        // glyph, the same size as the mute and close glyphs beside it, does not.
        tab.isHush && 'ring-1 ring-inset ring-active/45',
        tab.isHush && isActive && 'ring-active/75',
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
      aria-selected={isActive}
      // Only the selected tab is a tab stop; the rest are reached with arrows.
      tabIndex={isActive ? 0 : -1}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          send((api) => api.tabs.activate(tab.id));
        }
      }}
      title={
        tab.isHush
          ? `Hush tab — not written to this machine\n${tab.isStartPage ? '' : tab.url}`
          : tab.isStartPage
            ? 'New tab'
            : `${tab.title}\n${tab.url}`
      }
    >
      {tab.isLoading ? (
        <span
          aria-label="Loading"
          className="size-[15px] shrink-0 animate-spin rounded-full border-[1.5px] border-line-strong border-t-active"
        />
      ) : (
        <Favicon dataUrl={tab.faviconDataUrl} seed={tab.url} size={15} />
      )}

      {/*
        A Hush tab has to be obvious at a glance: the whole value depends on
        knowing which tab you are in, and mistaking a normal tab for one is the
        failure that matters.
      */}
      {tab.isHush && <EyeOff size={14} className="shrink-0 text-active" aria-label="Hush tab" />}
      <span className={cn('flex-1 truncate text-[12px]', isActive ? 'text-ink' : 'text-ink-dim')}>{title}</span>

      {tab.isAudible || tab.isMuted ? (
        <button
          type="button"
          aria-label={tab.isMuted ? 'Unmute tab' : 'Mute tab'}
          className="shrink-0 text-ink-dim hover:text-ink"
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
          'grid size-4 shrink-0 place-items-center rounded transition-opacity hover:bg-line-strong',
          isActive ? 'opacity-70' : 'opacity-0 group-hover:opacity-70',
        )}
        onClick={(event) => {
          event.stopPropagation();
          send((api) => api.tabs.close(tab.id));
        }}
      >
        <X size={11} />
      </button>
    </div>
  );
}

/**
 * A group's own mark, and the only place its colour appears.
 *
 * The colour never fills a tab. That keeps it out of the way of the state
 * colours, which say whether a connection is encrypted or a tab is Hush, and it
 * keeps a Hush outline the strongest thing inside a group — which is right,
 * because in a mixed group it is the only guarantee there is.
 */
function GroupBand({ group, holdsHush, children }: { group: TabGroup; holdsHush: boolean; children: ReactNode }) {
  const [panel, setPanel] = useState<{ left: number; top: number } | null>(null);
  const labelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const api = getBridge();
    return api?.on.openGroupPanel((id) => {
      if (id !== group.id) {
        return;
      }
      const box = labelRef.current?.getBoundingClientRect();
      setPanel(box ? { left: box.left, top: box.bottom + 4 } : { left: 80, top: 80 });
    });
  }, [group.id]);
  const claim = claimOf(group, holdsHush);
  const colour = colourOf(group.colour);

  return (
    <div
      className="relative flex items-center gap-1 rounded-t-[10px] px-1"
      style={{ borderTop: `2px solid ${colour}`, background: `${colour}1a` }}
      onContextMenu={(event) => {
        event.preventDefault();
        send((api) => api.groups.openContextMenu(group.id));
      }}
    >
      <button
        ref={labelRef}
        type="button"
        title={`${describeClaim(claim)}\n\nClick to rename, right-click for more`}
        // Click names it; the chevron collapses it. A click that hid the tabs
        // would make renaming the thing you cannot see.
        onClick={(event) => {
          if (panel) {
            setPanel(null);
            return;
          }
          const box = event.currentTarget.getBoundingClientRect();
          setPanel({ left: box.left, top: box.bottom + 4 });
        }}
        className="flex h-[var(--chrome-tab-height)] shrink-0 items-center gap-1.5 rounded px-2 text-[11.5px] transition-colors hover:bg-hover/60"
        style={{ color: colour }}
      >
        <span className="size-[7px] shrink-0 rounded-[2px]" style={{ background: colour }} />
        <span className="max-w-[14ch] truncate">{group.name}</span>
        {claim === 'separate' && <Lock size={11} aria-label="Keeps its own browsing" />}
        {/* A group holding a Hush tab cannot claim to be separate, because that
            would be true of only part of what it names. */}
        {claim === 'mixed' && <AlertCircle size={11} className="text-caution" aria-label="Mixed" />}
      </button>
      <button
        type="button"
        aria-label={group.collapsed ? `Expand ${group.name}` : `Collapse ${group.name}`}
        onClick={() => send((api) => api.groups.update(group.id, { collapsed: !group.collapsed }))}
        className="shrink-0 rounded px-0.5 text-ink-faint transition-colors hover:text-ink"
      >
        <ChevronDown size={11} className={cn('transition-transform', group.collapsed && '-rotate-90')} />
      </button>

      {!group.collapsed && children}

      {panel && <GroupPanel group={group} holdsHush={holdsHush} anchor={panel} onClose={() => setPanel(null)} />}
    </div>
  );
}
