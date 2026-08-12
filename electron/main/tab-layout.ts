/** Chrome insets in CSS pixels, measured by the renderer. */
export interface ContentInsets {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export interface ContentBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowSize {
  width: number;
  height: number;
}

export const DEFAULT_INSETS: ContentInsets = { top: 88, left: 0, right: 0, bottom: 0 };

/** The renderer measures these, so they arrive as arbitrary numbers rather than trusted ones. */
export function normaliseInsets(insets: ContentInsets): ContentInsets {
  return {
    top: Math.max(0, Math.round(insets.top)),
    left: Math.max(0, Math.round(insets.left)),
    right: Math.max(0, Math.round(insets.right)),
    bottom: Math.max(0, Math.round(insets.bottom)),
  };
}

/** Where a tab's view sits inside the window, once the chrome has taken its share. */
export function contentBoundsWithin(windowSize: WindowSize, insets: ContentInsets): ContentBounds {
  return {
    x: insets.left,
    y: insets.top,
    width: Math.max(0, windowSize.width - insets.left - insets.right),
    height: Math.max(0, windowSize.height - insets.top - insets.bottom),
  };
}

/**
 * A native view always paints above the chrome's HTML, so anything that should
 * cover a page has to hide the view rather than sit on top of it.
 */
export function shouldTabBeVisible(
  tab: { isActive: boolean; isStartPage: boolean; hasError: boolean },
  isOverlayVisible: boolean,
): boolean {
  return tab.isActive && !isOverlayVisible && !tab.isStartPage && !tab.hasError;
}
