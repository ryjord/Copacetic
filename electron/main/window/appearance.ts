import { theme } from '../engine/system';
import type { AppearanceId, DensityId, HeaderLayoutId } from '../../shared/types';

/** What shows behind a page before it has painted, so nothing flashes the wrong colour. */
const SURFACE = { dark: '#121519', light: '#ffffff' } as const;
/** The tab strip's colour, which is also the window's own, and the system controls drawn on it. */
const GROUND = { dark: '#0e1114', light: '#eef0f2' } as const;
const CONTROL_SYMBOL = { dark: '#a3acb6', light: '#4f5863' } as const;
/** The top row's height, the tab strip's or the one holding tabs and address, which the window controls sit in. */
const TOP_ROW_HEIGHT: Record<HeaderLayoutId, Record<DensityId, number>> = {
  standard: { comfortable: 40, compact: 34 },
  'one-line': { comfortable: 46, compact: 40 },
};
// The macOS window buttons, centred in the top row; their left edge is the system's usual inset.
const WINDOW_BUTTON_SIZE = 12;
const WINDOW_BUTTON_INSET = 16;

/**
 * Light, dark, or whatever the operating system says.
 *
 * Set on Electron's native theme rather than passed to the renderer, so the
 * chrome's `prefers-color-scheme`, native menus, dialogs and scrollbars all
 * agree without being told separately.
 */
export function applyAppearance(appearance: AppearanceId): void {
  theme.setSource(appearance);
}

export function surfaceColour(): string {
  return theme.isDark() ? SURFACE.dark : SURFACE.light;
}

export function groundColour(): string {
  return theme.isDark() ? GROUND.dark : GROUND.light;
}

/** The system's own minimise, maximise and close, on Windows and Linux, in the top row's colours and height. */
export function titleBarOverlayFor(
  density: DensityId,
  layout: HeaderLayoutId,
): { color: string; symbolColor: string; height: number } {
  const isDark = theme.isDark();
  return {
    color: isDark ? GROUND.dark : GROUND.light,
    symbolColor: isDark ? CONTROL_SYMBOL.dark : CONTROL_SYMBOL.light,
    height: TOP_ROW_HEIGHT[layout][density],
  };
}

/** Where the macOS window buttons go, centred in the top row. */
export function windowButtonPositionFor(density: DensityId, layout: HeaderLayoutId): { x: number; y: number } {
  return { x: WINDOW_BUTTON_INSET, y: Math.round((TOP_ROW_HEIGHT[layout][density] - WINDOW_BUTTON_SIZE) / 2) };
}

/** Called whenever the effective appearance changes, from a setting or from the system. */
export function onAppearanceChange(listener: () => void): () => void {
  return theme.onChange(listener);
}
