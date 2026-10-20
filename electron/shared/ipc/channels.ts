/**
 * What the main process pushes to the chrome. What the chrome calls is in
 * ipc-contract.ts.
 */

/** Pushes from main to the chrome renderer. */
export const PUSH = {
  state: 'push:state',
  /** Fired when the main process wants the chrome to focus the omnibox. */
  focusOmnibox: 'push:focus-omnibox',
  /** Fired when a menu item or shortcut wants the chrome to open a surface. */
  openSurface: 'push:open-surface',
  /** Settings, at one pane, asked for from a menu or the site card. */
  openSettingsPane: 'push:open-settings-pane',
  /** A native menu cannot hold a text field, so renaming asks the chrome to make the group's label editable. */
  renameGroup: 'push:rename-group',
  /** Saved bookmarks or folders changed. No tab changes when one is filed, so the tab snapshot cannot say it. */
  bookmarksChanged: 'push:bookmarks-changed',
  /** Extensions were added, removed or switched, or one changed its toolbar button. */
  extensionsChanged: 'push:extensions-changed',
  /** Something the app finished, or a question it has to ask before finishing. */
  notice: 'push:notice',
  /** A notice is finished with. Said so the layer drawing it can stop. */
  noticeSettled: 'push:notice-settled',
  /** The suggestions under the address field, or null when there are none, for the leading overlay to draw. */
  omniboxSuggestions: 'push:omnibox-suggestions',
  /** A suggestion was clicked in the overlay, for the address field to commit. */
  omniboxChosen: 'push:omnibox-chosen',
  /** Find was asked for again while open, so its field should take the keyboard and select what it holds. */
  focusFind: 'push:focus-find',
  /** The same, for a bookmark folder: a native menu cannot hold a text field. */
  renameBookmarkFolder: 'push:rename-bookmark-folder',
  /** Kept data changed outside the view showing it, such as an undo, so the view asks again. */
  dataChanged: 'push:data-changed',
} as const;

/** The kinds of kept data a view refetches when told it changed. */
export type DataKind = 'history' | 'startTiles';

export type PushChannel = (typeof PUSH)[keyof typeof PUSH];

/** Chrome surfaces that cover the page content and therefore hide the tab view. */
export type ChromeSurface =
  'settings' | 'downloads' | 'history' | 'bookmarks' | 'palette' | 'tab-search' | 'reader' | 'none';
