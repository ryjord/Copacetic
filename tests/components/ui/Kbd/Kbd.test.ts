import { describe, expect, it } from 'vitest';
import { acceleratorKeys } from '../../../../electron/shared/chrome/shortcuts';

// The palette printed "Cmd T" on Windows, where the key is Ctrl.
describe('how a shortcut is printed', () => {
  it('uses glyphs in the Mac order on a Mac', () => {
    expect(acceleratorKeys('CmdOrCtrl+Shift+T', true)).toEqual(['⇧', '⌘', 'T']);
    expect(acceleratorKeys('CmdOrCtrl+Alt+I', true)).toEqual(['⌥', '⌘', 'I']);
  });

  it('uses words, Ctrl first, everywhere else', () => {
    expect(acceleratorKeys('CmdOrCtrl+Shift+T', false)).toEqual(['Ctrl', 'Shift', 'T']);
    expect(acceleratorKeys('CmdOrCtrl+Plus', false)).toEqual(['Ctrl', '+']);
  });
});
