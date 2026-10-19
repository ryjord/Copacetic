import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IS_FOREGROUND_RUN, SmokeApp } from './support/harness';

let copacetic: SmokeApp;
const PAGE = 'https://example.com/fullscreen';

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
  await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), PAGE);
  await copacetic.inOpenPage(PAGE, 'document.readyState');
});
afterAll(async () => copacetic?.close());

/** The page's view rectangle and the window's content size, read from Electron. */
const geometry = () =>
  copacetic.read(({ BrowserWindow, webContents }, url) => {
    const window = BrowserWindow.getAllWindows()[0];
    const page = webContents.getAllWebContents().find((contents) => contents.getURL() === url);
    const view = window?.contentView.children.find(
      (child) => 'webContents' in child && (child as Electron.WebContentsView).webContents === page,
    ) as Electron.WebContentsView | undefined;
    const [width, height] = window?.getContentSize() ?? [0, 0];
    return { view: view?.getBounds() ?? null, width, height, isFullScreen: window?.isFullScreen() ?? false };
  }, PAGE);

const until = async (condition: () => Promise<boolean>, timeoutMs = 15_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
};

/**
 * Electron leaves a view where it was when its page goes fullscreen, so a
 * fullscreen video filled the rectangle under the chrome. The page should take
 * the whole window, and give it back afterwards.
 */
// A fullscreen window takes a Space of its own on macOS, so this runs only when asked to take the screen.
// CI's Linux display has no window manager to grant fullscreen, so Linux proves this on a desktop.
const hasNoWindowManager = process.platform === 'linux' && process.env.CI === 'true';
describe.skipIf(!IS_FOREGROUND_RUN || hasNoWindowManager)('a page that goes fullscreen', () => {
  it('takes the whole window', async () => {
    await copacetic.inOpenPage(PAGE, 'document.documentElement.requestFullscreen().then(() => true)', {
      userGesture: true,
    });
    expect(
      await until(async () => {
        const now = await geometry();
        return now.isFullScreen && now.view?.y === 0 && now.view.height === now.height;
      }),
    ).toBe(true);
  }, 60_000);

  it('gives the chrome its room back when it leaves', async () => {
    await copacetic.inOpenPage(PAGE, 'void document.exitFullscreen(), true');
    let last: Awaited<ReturnType<typeof geometry>> | null = null;
    const restored = await until(async () => {
      last = await geometry();
      return !last.isFullScreen && (last.view?.y ?? 0) > 0;
    });
    expect({ restored, last }).toMatchObject({ restored: true });
  }, 60_000);
});
