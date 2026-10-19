/** Every keyboard shortcut, in one place, so what Settings shows and what the menu actually binds cannot drift apart. */

import { t } from '../i18n/translate';

export interface Shortcut {
  /** Stable across releases: overrides are stored against it. */
  id: string;
  accelerator: string;
  description: string;
}

export interface ShortcutGroup {
  title: string;
  /** False for keys that are not menu items, which cannot be moved. */
  isRebindable: boolean;
  shortcuts: Shortcut[];
}

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: t('main.shortcuts.groups.tabs'),
    isRebindable: true,
    shortcuts: [
      { accelerator: 'CmdOrCtrl+N', description: t('main.shortcuts.descriptions.newWindow'), id: 'new-window' },
      { accelerator: 'CmdOrCtrl+T', description: t('main.shortcuts.descriptions.newTab'), id: 'new-tab' },
      {
        accelerator: 'CmdOrCtrl+Shift+N',
        description: t('main.shortcuts.descriptions.newHushTab'),
        id: 'new-hush-tab',
      },
      { accelerator: 'CmdOrCtrl+W', description: t('main.shortcuts.descriptions.closeTab'), id: 'close-tab' },
      { accelerator: 'CmdOrCtrl+Shift+T', description: t('main.shortcuts.descriptions.reopen'), id: 'reopen' },
      { accelerator: 'Ctrl+Tab', description: t('main.shortcuts.descriptions.nextTab'), id: 'next-tab' },
      {
        accelerator: 'Ctrl+Shift+Tab',
        description: t('main.shortcuts.descriptions.previousTab'),
        id: 'previous-tab',
      },
      { accelerator: 'CmdOrCtrl+9', description: t('main.shortcuts.descriptions.lastTab'), id: 'last-tab' },
      { accelerator: 'CmdOrCtrl+Shift+A', description: t('main.shortcuts.descriptions.tabSearch'), id: 'tab-search' },
      {
        accelerator: 'CmdOrCtrl+Shift+E',
        description: t('main.shortcuts.descriptions.splitView'),
        id: 'split-view',
      },
      { accelerator: 'CmdOrCtrl+D', description: t('main.shortcuts.descriptions.bookmark'), id: 'bookmark' },
    ],
  },
  {
    title: t('main.shortcuts.groups.navigation'),
    isRebindable: true,
    shortcuts: [
      { accelerator: 'CmdOrCtrl+L', description: t('main.shortcuts.descriptions.address'), id: 'address' },
      { accelerator: 'CmdOrCtrl+K', description: t('main.shortcuts.descriptions.palette'), id: 'palette' },
      { accelerator: 'CmdOrCtrl+[', description: t('main.shortcuts.descriptions.back'), id: 'back' },
      { accelerator: 'CmdOrCtrl+]', description: t('main.shortcuts.descriptions.forward'), id: 'forward' },
      { accelerator: 'CmdOrCtrl+R', description: t('main.shortcuts.descriptions.reload'), id: 'reload' },
      {
        accelerator: 'CmdOrCtrl+Shift+R',
        description: t('main.shortcuts.descriptions.reloadHard'),
        id: 'reload-hard',
      },
      { accelerator: 'CmdOrCtrl+.', description: t('main.shortcuts.descriptions.stop'), id: 'stop' },
      { accelerator: 'CmdOrCtrl+Shift+H', description: t('main.shortcuts.descriptions.home'), id: 'home' },
    ],
  },
  {
    title: t('main.shortcuts.groups.thisPage'),
    isRebindable: true,
    shortcuts: [
      { accelerator: 'CmdOrCtrl+F', description: t('main.shortcuts.descriptions.find'), id: 'find' },
      { accelerator: 'CmdOrCtrl+G', description: t('main.shortcuts.descriptions.findNext'), id: 'find-next' },
      {
        accelerator: 'CmdOrCtrl+Shift+G',
        description: t('main.shortcuts.descriptions.findPrevious'),
        id: 'find-previous',
      },
      { accelerator: 'CmdOrCtrl+Plus', description: t('main.shortcuts.descriptions.zoomIn'), id: 'zoom-in' },
      { accelerator: 'CmdOrCtrl+-', description: t('main.shortcuts.descriptions.zoomOut'), id: 'zoom-out' },
      { accelerator: 'CmdOrCtrl+0', description: t('main.shortcuts.descriptions.zoomReset'), id: 'zoom-reset' },
      { accelerator: 'CmdOrCtrl+P', description: t('main.shortcuts.descriptions.print'), id: 'print' },
      { accelerator: 'CmdOrCtrl+S', description: t('main.shortcuts.descriptions.savePage'), id: 'save-page' },
      {
        accelerator: 'CmdOrCtrl+Shift+S',
        description: t('main.shortcuts.descriptions.screenshot'),
        id: 'screenshot',
      },
      { accelerator: 'CmdOrCtrl+U', description: t('main.shortcuts.descriptions.viewSource'), id: 'view-source' },
      {
        accelerator: 'CmdOrCtrl+Alt+R',
        description: t('main.shortcuts.descriptions.readerView'),
        id: 'reader-view',
      },
    ],
  },
  {
    title: t('main.shortcuts.groups.panels'),
    isRebindable: true,
    shortcuts: [
      { accelerator: 'CmdOrCtrl+Y', description: t('main.shortcuts.descriptions.history'), id: 'history' },
      { accelerator: 'CmdOrCtrl+Shift+J', description: t('main.shortcuts.descriptions.downloads'), id: 'downloads' },
      { accelerator: 'CmdOrCtrl+Shift+B', description: t('main.shortcuts.descriptions.bookmarks'), id: 'bookmarks' },
      { accelerator: 'CmdOrCtrl+,', description: t('main.shortcuts.descriptions.settings'), id: 'settings' },
    ],
  },
  {
    title: t('main.shortcuts.groups.withoutAMenuItem'),
    isRebindable: false,
    shortcuts: [
      { accelerator: 'CmdOrCtrl+1…8', description: t('main.shortcuts.descriptions.selectTab'), id: 'select-tab' },
      { accelerator: 'Arrows', description: t('main.shortcuts.descriptions.stripArrows'), id: 'strip-arrows' },
      { accelerator: 'Delete', description: t('main.shortcuts.descriptions.stripDelete'), id: 'strip-delete' },
      { accelerator: 'Escape', description: t('main.shortcuts.descriptions.escape'), id: 'escape' },
    ],
  },
];

/** A chosen key for a shortcut, by id; an empty string means it has none. */
export type ShortcutOverrides = Record<string, string>;

const REBINDABLE = SHORTCUT_GROUPS.filter((group) => group.isRebindable).flatMap((group) => group.shortcuts);
const FIXED = SHORTCUT_GROUPS.filter((group) => !group.isRebindable).flatMap((group) => group.shortcuts);

export function isRebindable(id: string): boolean {
  return REBINDABLE.some((shortcut) => shortcut.id === id);
}

/** The key a shortcut is on now: its override, or its default. Undefined when it has been given none. */
export function acceleratorFor(id: string, overrides: ShortcutOverrides): string | undefined {
  const fallback = REBINDABLE.find((shortcut) => shortcut.id === id)?.accelerator;
  const chosen = Object.hasOwn(overrides, id) ? overrides[id] : fallback;
  return chosen || undefined;
}

const MODIFIERS = ['CmdOrCtrl', 'Ctrl', 'Alt', 'Shift'];
const NAMED_KEYS = [
  'Plus',
  'Space',
  'Tab',
  'Up',
  'Down',
  'Left',
  'Right',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Backspace',
  'Delete',
];
const SINGLE_KEY = /^[A-Z0-9\-=,./[\];'`]$/;
const FUNCTION_KEY = /^F([1-9]|1[0-9]|2[0-4])$/;

/** One key, held with at least one modifier unless it is a function key, which can stand alone. */
export function isValidAccelerator(accelerator: string): boolean {
  const parts = accelerator.split('+');
  const key = parts.at(-1) ?? '';
  const modifiers = parts.slice(0, -1);
  const isKnownKey = SINGLE_KEY.test(key) || FUNCTION_KEY.test(key) || NAMED_KEYS.includes(key);
  const areModifiersKnown = modifiers.every((modifier) => MODIFIERS.includes(modifier));
  const isUnique = new Set(modifiers).size === modifiers.length;
  return isKnownKey && areModifiersKnown && isUnique && (modifiers.length > 0 || FUNCTION_KEY.test(key));
}

/** Only known shortcuts on well-formed keys survive, from the renderer or from disk. */
export function readShortcutOverrides(value: unknown): ShortcutOverrides {
  if (typeof value !== 'object' || value === null) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      ([id, accelerator]) =>
        isRebindable(id) &&
        typeof accelerator === 'string' &&
        (accelerator === '' || isValidAccelerator(accelerator)),
    ),
  );
}

// Tab positions are bound by the menu but listed as one range.
const POSITION_KEYS = Array.from({ length: 8 }, (_unused, index) => `CmdOrCtrl+${index + 1}`);

/** What already answers to a key, so a new binding cannot quietly take another's place. */
export function conflictFor(id: string, accelerator: string, overrides: ShortcutOverrides): string | null {
  if (POSITION_KEYS.includes(accelerator)) {
    return t('main.shortcuts.descriptions.selectTab');
  }
  const taken = REBINDABLE.find(
    (shortcut) => shortcut.id !== id && acceleratorFor(shortcut.id, overrides) === accelerator,
  );
  const fixed = FIXED.find((shortcut) => shortcut.accelerator === accelerator);
  return taken?.description ?? fixed?.description ?? null;
}

const CODE_KEYS: Record<string, string> = {
  Minus: '-',
  Equal: '=',
  Comma: ',',
  Period: '.',
  Slash: '/',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Space: 'Space',
  Tab: 'Tab',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Backspace: 'Backspace',
  Delete: 'Delete',
};

export interface PressedKeys {
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * The accelerator a key press spells, or null while only modifiers are down.
 *
 * Read from the physical key, not the character: Option on a Mac turns letters
 * into symbols, and the shortcut is the key, not what it would type.
 */
export function acceleratorFromKeys(pressed: PressedKeys, isMac: boolean): string | null {
  const letter = /^Key([A-Z])$/.exec(pressed.code)?.[1];
  const digit = /^Digit([0-9])$/.exec(pressed.code)?.[1];
  const functionKey = FUNCTION_KEY.test(pressed.code) ? pressed.code : undefined;
  const named = pressed.code === 'Equal' && pressed.shiftKey ? 'Plus' : CODE_KEYS[pressed.code];
  const key = letter ?? digit ?? functionKey ?? named;
  if (!key) {
    return null;
  }
  const isCommand = isMac ? pressed.metaKey : pressed.ctrlKey;
  const modifiers = [
    ...(isCommand ? ['CmdOrCtrl'] : []),
    ...(isMac && pressed.ctrlKey ? ['Ctrl'] : []),
    ...(pressed.altKey ? ['Alt'] : []),
    // Plus already means Shift and =.
    ...(pressed.shiftKey && key !== 'Plus' ? ['Shift'] : []),
  ];
  return [...modifiers, key].join('+');
}

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

const MAC_GLYPHS: Record<string, string> = { Cmd: '⌘', CmdOrCtrl: '⌘', Ctrl: '⌃', Alt: '⌥', Option: '⌥', Shift: '⇧' };
const WORDS: Record<string, string> = { CmdOrCtrl: 'Ctrl', Cmd: 'Ctrl', Option: 'Alt', Escape: 'Esc', Plus: '+' };

/**
 * The keys of a shortcut, one per cap, the way each platform prints them:
 * `⇧⌘T` on a Mac, `Ctrl` `Shift` `T` elsewhere. Modifiers first, in the
 * platform's own order.
 */
export function acceleratorKeys(accelerator: string, isMac: boolean): string[] {
  const parts = accelerator.split('+').filter(Boolean);
  const order = isMac
    ? ['Ctrl', 'Alt', 'Option', 'Shift', 'Cmd', 'CmdOrCtrl']
    : ['Cmd', 'CmdOrCtrl', 'Ctrl', 'Alt', 'Option', 'Shift'];
  const modifiers = parts
    .filter((part) => order.includes(part))
    .sort((aPart, bPart) => order.indexOf(aPart) - order.indexOf(bPart));
  const keys = parts.filter((part) => !order.includes(part));
  const label = (part: string) => (isMac ? (MAC_GLYPHS[part] ?? WORDS[part] ?? part) : (WORDS[part] ?? part));
  return [...modifiers, ...keys].map(label);
}
