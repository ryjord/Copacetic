// Libs
import { type KeyboardEvent, Menu, type MenuItemConstructorOptions, nativeImage } from 'electron';

// Utils
import { electronWindowOf } from './native';

// Types
import type { EngineWindow } from './windows';

export type MenuEntry = MenuItemConstructorOptions;
export type MenuKeyboardEvent = KeyboardEvent;

export interface MenuPlacement {
  window: EngineWindow;
  x?: number;
  y?: number;
  onClosed?: () => void;
}

/** Shows a menu over a window, at the pointer unless a position is given. */
export function popupMenu(entries: MenuEntry[], placement: MenuPlacement): void {
  Menu.buildFromTemplate(entries).popup({
    window: electronWindowOf(placement.window),
    x: placement.x,
    y: placement.y,
    callback: placement.onClosed,
  });
}

/** Sets the menu bar, which on macOS is the one at the top of the screen. */
export function setApplicationMenu(entries: MenuEntry[]): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(entries));
}

/** A menu item's icon from an image's data URL, at the size menus draw it. */
export function menuIconFrom(dataUrl: string, size: number): MenuEntry['icon'] {
  return nativeImage.createFromDataURL(dataUrl).resize({ width: size, height: size });
}
