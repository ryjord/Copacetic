import { describe, expect, it, vi } from 'vitest';

// `updates.ts` imports electron for `app`, `net` and `shell`; the delivery
// decision under test touches none of them.
vi.mock('electron', () => ({ app: { isPackaged: false, getVersion: () => '1.1.0' }, net: {}, shell: {} }));

const { describeDelivery, newestRelease, pickAutoUpdater } = await import('../../../../electron/main/system/updates');

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
    const result = describeDelivery({ platform, isPackaged, isAppImage });
    expect(result.delivery).toBe(delivery);
    if (manualReason === null) {
      expect(result.manualReason).toBeNull();
    } else {
      expect(result.manualReason).toMatch(manualReason);
    }
  });
});

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

describe('the newest release', () => {
  const release = (tag: string, extra: Record<string, unknown> = {}) => ({
    tag_name: tag,
    body: '- Notes',
    html_url: `https://github.com/ryjord/Copacetic/releases/tag/${tag}`,
    prerelease: tag.includes('-'),
    draft: false,
    ...extra,
  });

  // The latest-release endpoint leaves betas out, which is how a beta never heard of the next one.
  it('includes betas only when they are wanted', () => {
    const list = [release('v1.4.1'), release('v2.0.0-beta.3'), release('v2.0.0-beta.2')];
    expect(newestRelease(list, true)?.version).toBe('2.0.0-beta.3');
    expect(newestRelease(list, false)?.version).toBe('1.4.1');
  });

  it('never offers a draft, and carries its notes and page', () => {
    const found = newestRelease([release('v2.0.0', { draft: true }), release('v1.4.1')], false);
    expect(found).toEqual({
      version: '1.4.1',
      notes: '· Notes',
      pageUrl: 'https://github.com/ryjord/Copacetic/releases/tag/v1.4.1',
    });
  });

  it('reads the single release the latest endpoint answers with', () => {
    expect(newestRelease(release('v1.4.1'), false)?.version).toBe('1.4.1');
    expect(newestRelease({ message: 'Not Found' }, false)).toBeNull();
  });
});
