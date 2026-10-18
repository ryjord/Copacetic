import { nativeTheme } from 'electron';
import type { AppearanceId } from '../../shared/types';

/** What shows behind the chrome and a page before either has painted, so nothing flashes the wrong colour. */
const SURFACE = { dark: '#0b0f14', light: '#f6f7f9' } as const;

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

/** Called whenever the effective appearance changes, from a setting or from the system. */
export function onAppearanceChange(listener: () => void): () => void {
  nativeTheme.on('updated', listener);
  return () => {
    nativeTheme.removeListener('updated', listener);
  };
}
