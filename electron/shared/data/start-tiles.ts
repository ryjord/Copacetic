/** A tile someone made or changed on the start page: kept by name, address and icon, and shown first. */
export interface StartShortcut {
  url: string;
  title: string;
  /** An image chosen for it, as a data URL; null shows the site's own icon. */
  icon: string | null;
}

export const MAX_SHORTCUT_TITLE = 40;
export const MAX_SHORTCUTS = 12;
/** An icon is a small picture on a tile; anything larger is not what anyone meant to choose. */
export const MAX_SHORTCUT_ICON_BYTES = 256 * 1024;

const ICON_TYPES = /^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

export function isShortcutIcon(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_SHORTCUT_ICON_BYTES * 1.4 && ICON_TYPES.test(value);
}
