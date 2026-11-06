import { describe, expect, it, vi } from 'vitest';

// `updates.ts` imports electron for `app`, `net` and `shell`; the delivery
// decision under test touches none of them.
vi.mock('electron', () => ({ app: { isPackaged: false, getVersion: () => '1.1.0' }, net: {}, shell: {} }));

const unsigned = { isStoreBuild: false, isSigned: false };

const { describeDelivery, newestRelease } = await import('../../../../electron/main/system/updates');

describe('describeDelivery', () => {
  // Unsigned macOS and the package-managed Linux build must both explain themselves, because a button that silently fails is worse than no button.
  // The .deb registers the signed apt repository, so the system handles it while the app must never write over a file dpkg owns.
  // An AppImage flag must not rescue macOS, and must not apply on Windows.
  it.each([
    ['installs itself on Windows', 'win32', true, false, 'automatic', null],
    ['installs itself on a Linux AppImage', 'linux', true, true, 'automatic', null],
    [
      'falls back to a manual download on macOS, because the build is unsigned',
      'darwin',
      true,
      false,
      'manual',
      /not code-signed/i,
    ],
    ['hands a Linux package-managed build to the system', 'linux', true, false, 'system', /package manager/i],
    ['ignores the AppImage flag on macOS', 'darwin', true, true, 'manual', /not code-signed/i],
    ['keeps Windows automatic whatever the AppImage flag says', 'win32', true, true, 'automatic', null],
    [
      'reports a development build on macOS as having nothing to update',
      'darwin',
      false,
      false,
      'unsupported',
      /development build/i,
    ],
    [
      'reports a development build on Windows as having nothing to update',
      'win32',
      false,
      false,
      'unsupported',
      /development build/i,
    ],
    [
      'reports a development build on Linux as having nothing to update',
      'linux',
      false,
      false,
      'unsupported',
      /development build/i,
    ],
  ] as const)('%s', (_name, platform, isPackaged, isAppImage, delivery, manualReason) => {
    const result = describeDelivery({ platform, isPackaged, isAppImage, ...unsigned });
    expect(result.delivery).toBe(delivery);
    if (manualReason === null) {
      expect(result.manualReason).toBeNull();
    } else {
      expect(result.manualReason).toMatch(manualReason);
    }
  });
});

describe('a copy that is signed, or from the Store', () => {
  // Signed and notarised, a Mac copy may replace itself as the Windows one does.
  it('installs itself on a signed Mac', () => {
    expect(
      describeDelivery({
        platform: 'darwin',
        isPackaged: true,
        isAppImage: false,
        isStoreBuild: false,
        isSigned: true,
      }),
    ).toEqual({ delivery: 'automatic', manualReason: null });
  });

  // Two updaters for one copy would fight; the Store's is the one that owns the files.
  it('leaves a Store copy to the Store', () => {
    const result = describeDelivery({
      platform: 'win32',
      isPackaged: true,
      isAppImage: false,
      isStoreBuild: true,
      isSigned: true,
    });
    expect(result.delivery).toBe('system');
    expect(result.manualReason).toMatch(/Microsoft Store/);
  });
});

describe('the newest release', () => {
  const release = (version: string) => ({
    version,
    isPrerelease: version.includes('-'),
    publishedAt: '2026-11-01T10:00:00Z',
    notes: '- Notes',
    pageUrl: `https://github.com/ryjord/Copacetic/releases/tag/v${version}`,
  });

  // A list of stable releases alone is how a beta never heard of the next one.
  it('includes betas only when they are wanted', () => {
    const list = [release('1.4.1'), release('2.0.0-beta.3'), release('2.0.0-beta.2')];
    expect(newestRelease(list, true)?.version).toBe('2.0.0-beta.3');
    expect(newestRelease(list, false)?.version).toBe('1.4.1');
  });

  it('carries its notes as plain text, and its page', () => {
    expect(newestRelease([release('1.4.1')], false)).toEqual({
      version: '1.4.1',
      notes: '· Notes',
      pageUrl: 'https://github.com/ryjord/Copacetic/releases/tag/v1.4.1',
    });
  });

  it('finds nothing in an empty list', () => {
    expect(newestRelease([], true)).toBeNull();
  });
});
