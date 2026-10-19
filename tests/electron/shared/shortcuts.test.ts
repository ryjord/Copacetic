import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  SHORTCUT_GROUPS,
  acceleratorFor,
  acceleratorFromKeys,
  conflictFor,
  isValidAccelerator,
  readShortcutOverrides,
  readableAccelerator,
} from '../../../electron/shared/shortcuts';

/**
 * The reference in Settings is only worth having if it is true, and the menu
 * is where accelerators are actually bound. Reading menu.ts as text is crude,
 * but it means a shortcut added there and forgotten here fails a test instead
 * of quietly making the reference wrong.
 */
// Relative to the project root, which is where vitest runs from. `import.meta`
// is not a file URL under the test transform.
const MENU_SOURCE = readFileSync('electron/main/menus/menu.ts', 'utf8');
// The menu binds through ids now, so a key someone moved is the key it binds.
const BOUND_IDS = [...MENU_SOURCE.matchAll(/key\('([^']+)'\)/g)].map((match) => match[1]!);
const REBINDABLE_IDS = SHORTCUT_GROUPS.filter((group) => group.isRebindable).flatMap((group) =>
  group.shortcuts.map((shortcut) => shortcut.id),
);

describe('the shortcut reference matches the menu', () => {
  it('found shortcuts to check', () => {
    expect(BOUND_IDS.length).toBeGreaterThan(20);
  });

  it.each([...new Set(BOUND_IDS)])('%s is listed for the user', (id) => {
    expect(REBINDABLE_IDS).toContain(id);
  });

  it.each(REBINDABLE_IDS)('%s is bound by the menu', (id) => {
    expect(BOUND_IDS).toContain(id);
  });

  it('gives every shortcut its own id', () => {
    const ids = SHORTCUT_GROUPS.flatMap((group) => group.shortcuts.map((shortcut) => shortcut.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('moving a shortcut to another key', () => {
  it('uses the override, the default, or nothing', () => {
    expect(acceleratorFor('new-tab', {})).toBe('CmdOrCtrl+T');
    expect(acceleratorFor('new-tab', { 'new-tab': 'Alt+CmdOrCtrl+T' })).toBe('Alt+CmdOrCtrl+T');
    expect(acceleratorFor('new-tab', { 'new-tab': '' })).toBeUndefined();
  });

  it.each([
    ['CmdOrCtrl+T', true],
    ['Alt+Shift+F5', true],
    ['F7', true],
    ['T', false],
    ['CmdOrCtrl+Shift', false],
    ['CmdOrCtrl+CmdOrCtrl+T', false],
    ['Super+T', false],
  ])('%s is a usable key: %s', (accelerator, isUsable) => {
    expect(isValidAccelerator(accelerator)).toBe(isUsable);
  });

  it('keeps only known shortcuts on well-formed keys', () => {
    expect(
      readShortcutOverrides({ 'new-tab': 'Alt+CmdOrCtrl+T', print: '', invented: 'CmdOrCtrl+J', find: 'nonsense' }),
    ).toEqual({ 'new-tab': 'Alt+CmdOrCtrl+T', print: '' });
  });

  // Two shortcuts on one key leave one unreachable, including the tab positions listed as a range.
  it('names what already answers to a key', () => {
    expect(conflictFor('print', 'CmdOrCtrl+T', {})).toBe('New tab');
    expect(conflictFor('print', 'CmdOrCtrl+3', {})).toBe('Select tab by position');
    expect(conflictFor('print', 'CmdOrCtrl+T', { 'new-tab': 'Alt+CmdOrCtrl+T' })).toBeNull();
    expect(conflictFor('new-tab', 'CmdOrCtrl+T', {})).toBeNull();
  });
});

describe('reading a key press', () => {
  const keys = (
    code: string,
    held: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {},
  ) => ({
    code,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...held,
  });

  it('spells Cmd on a Mac and Ctrl elsewhere as the same shortcut', () => {
    expect(acceleratorFromKeys(keys('KeyT', { metaKey: true }), true)).toBe('CmdOrCtrl+T');
    expect(acceleratorFromKeys(keys('KeyT', { ctrlKey: true }), false)).toBe('CmdOrCtrl+T');
  });

  // Option turns T into a dagger; the shortcut is the key, not the character.
  it('reads the key rather than what Option makes it type', () => {
    expect(acceleratorFromKeys(keys('KeyT', { metaKey: true, altKey: true }), true)).toBe('CmdOrCtrl+Alt+T');
  });

  it('waits while only modifiers are held', () => {
    expect(acceleratorFromKeys(keys('ShiftLeft', { shiftKey: true }), true)).toBeNull();
  });

  it('reads Shift and = as Plus, as the zoom shortcut is written', () => {
    expect(acceleratorFromKeys(keys('Equal', { metaKey: true, shiftKey: true }), true)).toBe('CmdOrCtrl+Plus');
  });
});

describe('readableAccelerator', () => {
  it('says Cmd on a Mac and Ctrl elsewhere', () => {
    expect(readableAccelerator('CmdOrCtrl+T', true)).toBe('Cmd + T');
    expect(readableAccelerator('CmdOrCtrl+T', false)).toBe('Ctrl + T');
  });

  it('turns the Electron spelling of plus into the key people press', () => {
    expect(readableAccelerator('CmdOrCtrl+Plus', true)).toContain('+');
    expect(readableAccelerator('CmdOrCtrl+Plus', true)).not.toContain('Plus');
  });

  it('leaves a shortcut with no modifier alone', () => {
    expect(readableAccelerator('Delete', true)).toBe('Delete');
    expect(readableAccelerator('Escape', true)).toBe('Esc');
  });
});
