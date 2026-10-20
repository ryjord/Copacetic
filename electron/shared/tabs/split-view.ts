import type { TabId } from '../types';

/** Two tabs shown side by side. The one in front is whichever of them is the active tab. */
export interface SplitView {
  leftId: TabId;
  rightId: TabId;
  /** The left pane's share of the width, from 0 to 1. */
  ratio: number;
}

export interface PaneBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const SPLIT_DIVIDER_WIDTH = 6;
/** Above each page, so which half has the keyboard can be drawn somewhere a page never covers. */
export const SPLIT_FOCUS_STRIP_HEIGHT = 2;
export const MIN_SPLIT_RATIO = 0.2;
export const MAX_SPLIT_RATIO = 0.8;
export const EVEN_SPLIT_RATIO = 0.5;

export function clampSplitRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) {
    return EVEN_SPLIT_RATIO;
  }
  return Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, ratio));
}

/** Shared by the main process, which places the pages, and the chrome, which draws what sits between them. */
export function splitPanes(content: PaneBounds, ratio: number): { left: PaneBounds; right: PaneBounds } {
  const usable = Math.max(0, content.width - SPLIT_DIVIDER_WIDTH);
  const leftWidth = Math.round(usable * clampSplitRatio(ratio));
  return {
    left: { x: content.x, y: content.y, width: leftWidth, height: content.height },
    right: {
      x: content.x + leftWidth + SPLIT_DIVIDER_WIDTH,
      y: content.y,
      width: usable - leftWidth,
      height: content.height,
    },
  };
}

export function pageWithinPane(pane: PaneBounds): PaneBounds {
  const strip = Math.min(SPLIT_FOCUS_STRIP_HEIGHT, pane.height);
  return { ...pane, y: pane.y + strip, height: pane.height - strip };
}

export function isInSplit(split: SplitView | null, id: TabId | null): boolean {
  return split !== null && id !== null && (split.leftId === id || split.rightId === id);
}

/** The split is on screen only while one of its two tabs is the one in front. */
export function shownSplit(split: SplitView | null, activeId: TabId | null): SplitView | null {
  return isInSplit(split, activeId) ? split : null;
}

export function partnerIn(split: SplitView, id: TabId): TabId {
  return split.leftId === id ? split.rightId : split.leftId;
}
