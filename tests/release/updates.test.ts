import { describe, expect, it, vi } from 'vitest';

// `updates.ts` imports electron for `app`, `net` and `shell`; the delivery
// decision under test touches none of them.
vi.mock('electron', () => ({ app: { isPackaged: false, getVersion: () => '1.1.0' }, net: {}, shell: {} }));

const { describeDelivery, pickAutoUpdater } = await import('../../electron/main/system/updates');

const on = (platform: NodeJS.Platform, extra: { isPackaged?: boolean; isAppImage?: boolean } = {}) =>
  describeDelivery({ platform, isPackaged: true, isAppImage: false, ...extra });

describe('describeDelivery', () => {
  it('installs updates itself on Windows', () => {
    expect(on('win32')).toEqual({ delivery: 'automatic', manualReason: null });
  });

  it('installs updates itself on a Linux AppImage', () => {
    expect(on('linux', { isAppImage: true })).toEqual({ delivery: 'automatic', manualReason: null });
  });

  // The two cases this whole split exists for. Both must be `manual` and both
  // must explain themselves, because a button that silently fails is worse
  // than no button.
  it('falls back to a manual download on macOS, because the build is unsigned', () => {
    const result = on('darwin');
    expect(result.delivery).toBe('manual');
    expect(result.manualReason).toMatch(/not code-signed/i);
  });

  // The .deb registers the signed apt repository when it installs, so the
  // system genuinely does handle it — while the app itself still must never
  // write over a file dpkg owns.
  it('hands a Linux package-managed build to the system', () => {
    const result = on('linux', { isAppImage: false });
    expect(result.delivery).toBe('system');
    expect(result.manualReason).toMatch(/package manager/i);
  });

  it('never claims a non-automatic platform can update itself', () => {
    for (const platform of ['darwin', 'linux'] as const) {
      const result = describeDelivery({ platform, isPackaged: true, isAppImage: false });
      expect(result.delivery).not.toBe('automatic');
      expect(result.manualReason).toBeTruthy();
    }
  });

  it('reports a development build as having nothing to update', () => {
    for (const platform of ['darwin', 'win32', 'linux'] as const) {
      const result = describeDelivery({ platform, isPackaged: false, isAppImage: false });
      expect(result.delivery).toBe('unsupported');
      expect(result.manualReason).toMatch(/development build/i);
    }
  });

  // An AppImage flag must not rescue macOS, and must not apply on Windows.
  it('only lets the AppImage flag matter on Linux', () => {
    expect(describeDelivery({ platform: 'darwin', isPackaged: true, isAppImage: true }).delivery).toBe('manual');
    expect(describeDelivery({ platform: 'linux', isPackaged: true, isAppImage: false }).delivery).toBe('system');
    expect(describeDelivery({ platform: 'win32', isPackaged: true, isAppImage: true }).delivery).toBe('automatic');
  });
});

/**
 * Automatic updates did nothing at all from 1.1.0 until this was found.
 * `electron-updater` is CommonJS, destructuring its namespace gave undefined,
 * and the first property set on it threw inside the try/catch around the
 * check — so it surfaced as a message rather than a crash, and every test
 * passed because they all covered the platform decision instead of the
 * updater itself.
 */
describe('loading the updater', () => {
  const usable = { autoDownload: false, quitAndInstall() {}, checkForUpdates: async () => ({}) };

  it('finds it on the namespace', () => {
    expect(pickAutoUpdater({ autoUpdater: usable })).toBe(usable);
  });

  // The shape that actually applies to electron-updater today.
  it('finds it on the default export', () => {
    expect(pickAutoUpdater({ default: { autoUpdater: usable } })).toBe(usable);
  });

  it('prefers the namespace when both are present', () => {
    const other = { ...usable };
    expect(pickAutoUpdater({ autoUpdater: usable, default: { autoUpdater: other } })).toBe(usable);
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
