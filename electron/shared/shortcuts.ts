/** Every keyboard shortcut, in one place, so what Settings shows and what the menu actually binds cannot drift apart. */

export interface ShortcutGroup {
  title: string;
  shortcuts: { accelerator: string; description: string }[];
}

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: 'Tabs',
    shortcuts: [
      { accelerator: 'CmdOrCtrl+T', description: 'New tab' },
      { accelerator: 'CmdOrCtrl+Shift+N', description: 'New Hush tab, which is not written down' },
      { accelerator: 'CmdOrCtrl+W', description: 'Close tab' },
      { accelerator: 'CmdOrCtrl+Shift+T', description: 'Reopen the last closed tab' },
      { accelerator: 'Ctrl+Tab', description: 'Next tab' },
      { accelerator: 'Ctrl+Shift+Tab', description: 'Previous tab' },
      { accelerator: 'CmdOrCtrl+9', description: 'Last tab' },
      { accelerator: 'CmdOrCtrl+D', description: 'Bookmark this page' },
    ],
  },
  {
    title: 'Navigation',
    shortcuts: [
      { accelerator: 'CmdOrCtrl+L', description: 'Focus the address bar' },
      { accelerator: 'CmdOrCtrl+K', description: 'Command palette' },
      { accelerator: 'CmdOrCtrl+[', description: 'Back' },
      { accelerator: 'CmdOrCtrl+]', description: 'Forward' },
      { accelerator: 'CmdOrCtrl+R', description: 'Reload' },
      { accelerator: 'CmdOrCtrl+Shift+R', description: 'Reload, ignoring the cache' },
      { accelerator: 'CmdOrCtrl+.', description: 'Stop loading' },
      { accelerator: 'CmdOrCtrl+Shift+H', description: 'Home' },
    ],
  },
  {
    title: 'This page',
    shortcuts: [
      { accelerator: 'CmdOrCtrl+F', description: 'Find on page' },
      { accelerator: 'CmdOrCtrl+G', description: 'Find next' },
      { accelerator: 'CmdOrCtrl+Shift+G', description: 'Find previous' },
      { accelerator: 'CmdOrCtrl+Plus', description: 'Zoom in' },
      { accelerator: 'CmdOrCtrl+-', description: 'Zoom out' },
      { accelerator: 'CmdOrCtrl+0', description: 'Reset zoom' },
      { accelerator: 'CmdOrCtrl+P', description: 'Print' },
    ],
  },
  {
    title: 'Panels',
    shortcuts: [
      { accelerator: 'CmdOrCtrl+Y', description: 'History' },
      { accelerator: 'CmdOrCtrl+Shift+J', description: 'Downloads' },
      { accelerator: 'CmdOrCtrl+Shift+B', description: 'Bookmarks' },
      { accelerator: 'Cmd+,', description: 'Settings' },
    ],
  },
  {
    title: 'Without a menu item',
    shortcuts: [
      { accelerator: 'CmdOrCtrl+1…8', description: 'Select tab by position' },
      { accelerator: 'Arrows', description: 'Move between tabs, once the strip has focus' },
      { accelerator: 'Delete', description: 'Close the focused tab' },
      { accelerator: 'Escape', description: 'Close the topmost panel' },
    ],
  },
];

/** Accelerators the menu binds but which are covered by a range above. */
export const SHORTCUTS_COVERED_BY_A_RANGE: readonly string[] = [
  'CmdOrCtrl+1',
  'CmdOrCtrl+2',
  'CmdOrCtrl+3',
  'CmdOrCtrl+4',
  'CmdOrCtrl+5',
  'CmdOrCtrl+6',
  'CmdOrCtrl+7',
  'CmdOrCtrl+8',
];

/** `CmdOrCtrl+Plus` is what Electron wants; `Cmd +` is what a person reads. */
export function readableAccelerator(accelerator: string, isMac: boolean): string {
  return accelerator
    .replace('CmdOrCtrl', isMac ? 'Cmd' : 'Ctrl')
    .replace(/\bCmd\b/g, isMac ? 'Cmd' : 'Ctrl')
    .replace('Plus', '+')
    .replace(/\+/g, ' + ')
    .replace(/\s+\+\s+\+\s+/, ' + + ')
    .replace('Escape', 'Esc')
    .trim();
}
