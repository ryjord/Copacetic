'use client';

// Libs
import { useLayoutEffect, useRef, useState } from 'react';

// Components
import { ErrorPage } from '@/components/views/error/ErrorPage';
import { InternalPage } from '@/components/shell/InternalPage/InternalPage';
import { SplitPanePicker } from '@/components/shell/SplitView/SplitPanePicker';

// Utils
import { send } from '@/lib/bridge/bridge';
import { cn } from '@/lib/utils';
import { t } from '@shared/i18n/translate';
import {
  EVEN_SPLIT_RATIO,
  MAX_SPLIT_RATIO,
  MIN_SPLIT_RATIO,
  SPLIT_DIVIDER_WIDTH,
  SPLIT_FOCUS_STRIP_HEIGHT,
  type PaneBounds,
  type SplitView as SplitViewState,
  clampSplitRatio,
  isInSplit,
  splitPanes,
} from '@shared/tabs/split-view';

// Types
import type { TabState } from '@shared/types';

const KEYBOARD_STEP = 0.05;

interface Props {
  split: SplitViewState;
  tabs: TabState[];
  activeTabId: string | null;
}

/** What the chrome draws of a split: the divider, which half has the keyboard, and any half that is not a page. */
export function SplitView({ split, tabs, activeTabId }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setSize({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) });
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The same arithmetic the main process uses to place the pages, so the two cannot drift apart.
  const panes = splitPanes({ x: 0, y: 0, ...size }, split.ratio);
  const leftTab = tabs.find((tab) => tab.id === split.leftId);
  const rightTab = tabs.find((tab) => tab.id === split.rightId);
  // Another empty new tab is no better than the one already showing.
  const candidates = tabs.filter((tab) => !isInSplit(split, tab.id) && tab.internalPage !== 'start');

  const setRatio = (ratio: number) => send((api) => api.tabs.setSplitRatio(clampSplitRatio(ratio)));

  const setRatioAt = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    const usable = (rect?.width ?? 0) - SPLIT_DIVIDER_WIDTH;
    if (!rect || usable <= 0) {
      return;
    }
    setRatio((clientX - rect.left - SPLIT_DIVIDER_WIDTH / 2) / usable);
  };

  return (
    <div ref={ref} className="absolute inset-0">
      <Pane tab={leftTab} bounds={panes.left} isFocused={activeTabId === split.leftId} candidates={candidates} />
      <Pane tab={rightTab} bounds={panes.right} isFocused={activeTabId === split.rightId} candidates={candidates} />
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t('shell.splitView.divider')}
        aria-valuemin={MIN_SPLIT_RATIO * 100}
        aria-valuemax={MAX_SPLIT_RATIO * 100}
        aria-valuenow={Math.round(split.ratio * 100)}
        tabIndex={0}
        className="absolute top-0 cursor-col-resize bg-ground transition-colors hover:bg-line-strong focus-visible:bg-accent"
        style={{ left: panes.left.width, width: SPLIT_DIVIDER_WIDTH, height: size.height }}
        onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            setRatioAt(event.clientX);
          }
        }}
        onDoubleClick={() => setRatio(EVEN_SPLIT_RATIO)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            setRatio(split.ratio + (event.key === 'ArrowLeft' ? -KEYBOARD_STEP : KEYBOARD_STEP));
          }
        }}
      />
    </div>
  );
}

interface PaneProps {
  tab: TabState | undefined;
  bounds: PaneBounds;
  isFocused: boolean;
  /** Open tabs this half could show instead, offered while it holds only a new tab. */
  candidates: TabState[];
}

function Pane({ tab, bounds, isFocused, candidates }: PaneProps) {
  return (
    <div
      className="absolute flex flex-col"
      style={{ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height }}
      onPointerDown={() => {
        if (tab && !isFocused) {
          send((api) => api.tabs.activate(tab.id));
        }
      }}
    >
      <div
        className={cn('flex-none transition-colors', isFocused ? 'bg-accent' : 'bg-line')}
        style={{ height: SPLIT_FOCUS_STRIP_HEIGHT }}
        aria-hidden
      />
      {tab?.internalPage === 'start' && candidates.length > 0 && (
        <SplitPanePicker paneId={tab.id} candidates={candidates} />
      )}
      <div className="relative min-h-0 flex-1">
        {tab?.internalPage && <InternalPage tab={tab} />}
        {tab?.error && <ErrorPage tabId={tab.id} error={tab.error} />}
      </div>
    </div>
  );
}
