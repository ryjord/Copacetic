import { describe, expect, it, vi } from 'vitest';

// `updates.ts` imports electron for `app`, `net` and `shell`; the delivery
// decision under test touches none of them.
vi.mock('electron', () => ({ app: { isPackaged: false, getVersion: () => '1.1.0' }, net: {}, shell: {} }));

const { describeDelivery } = await import('../electron/main/updates');

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

  it('falls back to a manual download for a Linux package-managed build', () => {
    const result = on('linux', { isAppImage: false });
    expect(result.delivery).toBe('manual');
    expect(result.manualReason).toMatch(/package manager/i);
    // Must not imply apt will handle it: there is no repository for it to
    // pull from, so the only real path is a manual download.
    expect(result.manualReason).toMatch(/by hand|download/i);
  });

  it('never claims a manual platform can update itself', () => {
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
    expect(describeDelivery({ platform: 'win32', isPackaged: true, isAppImage: true }).delivery).toBe('automatic');
  });
});
