import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;
const LEFT = 'https://example.com/left';
const RIGHT = 'https://example.com/right';

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
});
afterAll(async () => copacetic?.close());

interface PlacedPage {
  url: string;
  isVisible: boolean;
  x: number;
  width: number;
}

/** Where the window has actually put each page, asked of Electron rather than of the code that asked it to. */
const placedPages = (): Promise<PlacedPage[]> =>
  copacetic.main(({ BrowserWindow, WebContentsView }) =>
    BrowserWindow.getAllWindows()
      .flatMap((window) => window.contentView.children)
      .filter((view) => view instanceof WebContentsView)
      .map((view) => ({
        url: view.webContents.getURL(),
        isVisible: view.getVisible(),
        x: view.getBounds().x,
        width: view.getBounds().width,
      })),
  );

const pageAt = async (url: string) => (await placedPages()).find((page) => page.url === url);

describe('split view', () => {
  it('shows two pages side by side, and one again when either closes', async () => {
    const leftId = await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), LEFT);
    const rightId = await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), RIGHT);
    await copacetic.until(
      async () => (await pageAt(LEFT)) !== undefined && (await pageAt(RIGHT)) !== undefined,
      20_000,
    );

    await copacetic.chrome.evaluate((id) => window.copacetic.tabs.activate(id), leftId);
    await copacetic.chrome.evaluate((id) => window.copacetic.tabs.splitWith(id), rightId);
    await copacetic.until(async () => (await pageAt(RIGHT))?.isVisible === true, 5_000);

    const left = await pageAt(LEFT);
    const right = await pageAt(RIGHT);
    expect(left?.isVisible).toBe(true);
    expect(right?.isVisible).toBe(true);
    expect((left?.x ?? 0) + (left?.width ?? 0)).toBeLessThan(right?.x ?? 0);

    // Dragged further than the divider goes; it stops where neither side is squeezed out.
    await copacetic.chrome.evaluate(() => window.copacetic.tabs.setSplitRatio(0.05));
    const narrowed = await pageAt(LEFT);
    expect(narrowed?.width).toBeLessThan(left?.width ?? 0);
    expect(narrowed?.width).toBeGreaterThan(0);

    await copacetic.chrome.evaluate((id) => window.copacetic.tabs.close(id), rightId);
    await copacetic.until(async () => (await pageAt(RIGHT)) === undefined, 5_000);
    const alone = await pageAt(LEFT);
    const state = await copacetic.chrome.evaluate(() => window.copacetic.chrome.getState());
    expect(state.split).toBeNull();
    expect(state.activeTabId).toBe(leftId);
    expect(alone?.isVisible).toBe(true);
    expect(alone?.width).toBeGreaterThan((left?.width ?? 0) + (right?.width ?? 0));
  }, 90_000);
});
