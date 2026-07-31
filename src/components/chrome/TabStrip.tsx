'use client';

import { Plus, Volume2, VolumeX, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { TabState } from '../../../electron/shared/types';
import { Favicon } from '@/components/ui/Favicon';
import { IconButton } from '@/components/ui/IconButton';
import { send } from '@/lib/bridge';
import { cn } from '@/lib/utils';

interface TabStripProps {
  tabs: TabState[];
  activeTabId: string | null;
}

export function TabStrip({ tabs, activeTabId }: TabStripProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  const handleDrop = (index: number) => {
    if (dragId) send((api) => api.tabs.move(dragId, index));
    setDragId(null);
    setDropIndex(null);
  };

  return (
    <div ref={stripRef} className="hide-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
      {tabs.map((tab, index) => (
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
      ))}

      <IconButton label="New tab" size="sm" className="ml-0.5" onClick={() => send((api) => api.tabs.create())}>
        <Plus size={14} />
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

  return (
    <div
      className={cn(
        'no-drag group relative flex h-[30px] min-w-[112px] max-w-[220px] shrink-0 items-center gap-2 rounded-tab px-2.5 transition-[background-color,opacity] duration-150',
        isActive ? 'bg-raised' : 'hover:bg-raised/55',
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
        if (event.button === 1) send((api) => api.tabs.close(tab.id));
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        send((api) => api.tabs.openContextMenu(tab.id));
      }}
      role="tab"
      aria-selected={isActive}
      tabIndex={-1}
      title={tab.isStartPage ? 'New tab' : `${tab.title}\n${tab.url}`}
    >
      {tab.isLoading ? (
        <span
          aria-label="Loading"
          className="size-[15px] shrink-0 animate-spin rounded-full border-[1.5px] border-line-strong border-t-active"
        />
      ) : (
        <Favicon dataUrl={tab.faviconDataUrl} seed={tab.url} size={15} />
      )}

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
