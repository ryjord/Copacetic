import { describe, expect, it } from 'vitest';
import { pickAutoUpdater } from '../../../../electron/main/engine/updater';

/**
 * Automatic updates did nothing at all from 1.1.0 until this was found.
 * `electron-updater` is CommonJS, destructuring its namespace gave undefined,
 * and the first property set on it threw inside the try/catch around the
 * check - so it surfaced as a message rather than a crash, and every test
 * passed because they all covered the platform decision instead of the
 * updater itself.
 */
describe('loading the updater', () => {
  const usable = { autoDownload: false, quitAndInstall() {}, checkForUpdates: async () => ({}) };

  // The default-export shape is the one that actually applies to electron-updater today.
  it.each([
    ['finds it on the namespace', { autoUpdater: usable }],
    ['finds it on the default export', { default: { autoUpdater: usable } }],
    ['prefers the namespace when both are present', { autoUpdater: usable, default: { autoUpdater: { ...usable } } }],
  ])('%s', (_name, shape) => {
    expect(pickAutoUpdater(shape)).toBe(usable);
  });

  // Throwing is right: it is caught and reported as an update error, which is
  // true, rather than silently doing nothing.
  it.each([{}, { default: {} }, { autoUpdater: null }, { autoUpdater: 'nope' }])(
    'refuses %o rather than handing back something unusable',
    (shape) => {
      expect(() => pickAutoUpdater(shape)).toThrow();
    },
  );
});
