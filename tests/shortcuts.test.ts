import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { SHORTCUTS_COVERED_BY_A_RANGE, SHORTCUT_GROUPS, readableAccelerator } from '../electron/shared/shortcuts';

/**
 * The reference in Settings is only worth having if it is true, and the menu
 * is where accelerators are actually bound. Reading menu.ts as text is crude,
 * but it means a shortcut added there and forgotten here fails a test instead
 * of quietly making the reference wrong.
 */
// Relative to the project root, which is where vitest runs from. `import.meta`
// is not a file URL under the test transform.
const MENU_SOURCE = readFileSync('electron/main/menu.ts', 'utf8');
const BOUND = [...MENU_SOURCE.matchAll(/accelerator: '([^']+)'/g)].map((match) => match[1]!);

const LISTED = new Set([
  ...SHORTCUT_GROUPS.flatMap((group) => group.shortcuts.map((shortcut) => shortcut.accelerator)),
  ...SHORTCUTS_COVERED_BY_A_RANGE,
]);

describe('the shortcut reference matches the menu', () => {
  it('found accelerators to check', () => {
    expect(BOUND.length).toBeGreaterThan(20);
  });

  it.each([...new Set(BOUND)])('%s is listed for the user', (accelerator) => {
    expect(LISTED.has(accelerator)).toBe(true);
  });

  it('lists nothing the menu does not bind, except the documented extras', () => {
    const extras = new Set(
      SHORTCUT_GROUPS.find((group) => group.title === 'Without a menu item')?.shortcuts.map((s) => s.accelerator),
    );
    const bound = new Set(BOUND);
    for (const accelerator of LISTED) {
      if (extras.has(accelerator) || SHORTCUTS_COVERED_BY_A_RANGE.includes(accelerator)) {
        continue;
      }
      expect(bound.has(accelerator)).toBe(true);
    }
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
