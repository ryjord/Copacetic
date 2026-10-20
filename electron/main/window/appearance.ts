import { nativeTheme } from 'electron';
import type { AppearanceId, DensityId } from '../../shared/types';

/** What shows behind a page before it has painted, so nothing flashes the wrong colour. */
const SURFACE = { dark: '#121519', light: '#ffffff' } as const;
/** The tab strip's colour, which is also the window's own, and the system controls drawn on it. */
const GROUND = { dark: '#0e1114', light: '#eef0f2' } as const;
const CONTROL_SYMBOL = { dark: '#a3acb6', light: '#4f5863' } as const;
/** The tab strip's height, which the system's window controls on Windows and Linux are drawn to match. */
const TAB_STRIP_HEIGHT = { comfortable: 40, compact: 34 } as const;

/**
 * Light, dark, or whatever the operating system says.
 *
 * Set on Electron's native theme rather than passed to the renderer, so the
 * chrome's `prefers-color-scheme`, native menus, dialogs and scrollbars all
 * agree without being told separately.
 */
export function applyAppearance(appearance: AppearanceId): void {
  nativeTheme.themeSource = appearance;
}

export function surfaceColour(): string {
  return nativeTheme.shouldUseDarkColors ? SURFACE.dark : SURFACE.light;
}

export function groundColour(): string {
  return nativeTheme.shouldUseDarkColors ? GROUND.dark : GROUND.light;
}

/** The system's own minimise, maximise and close, on Windows and Linux, in the strip's colours and height. */
export function titleBarOverlayFor(density: DensityId): { color: string; symbolColor: string; height: number } {
  const isDark = nativeTheme.shouldUseDarkColors;
  return {
    color: isDark ? GROUND.dark : GROUND.light,
    symbolColor: isDark ? CONTROL_SYMBOL.dark : CONTROL_SYMBOL.light,
    height: TAB_STRIP_HEIGHT[density],
  };
}

/** Called whenever the effective appearance changes, from a setting or from the system. */
export function onAppearanceChange(listener: () => void): () => void {
  nativeTheme.on('updated', listener);
  return () => {
    nativeTheme.removeListener('updated', listener);
  };
}
