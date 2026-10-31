import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';
import { type LocalSite, startLocalSite } from './support/local-site';

let copacetic: SmokeApp;
let site: LocalSite;
const at = (path: string) => `${site.origin}${path}`;

beforeAll(async () => {
  site = await startLocalSite();
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
});
afterAll(async () => {
  await copacetic?.close();
  await site?.close();
});

interface PlacedPage {
  url: string;
  isVisible: boolean;
  x: number;
  width: number;
}

/** Where the window has actually put each page, asked of Electron rather than of the code that asked it to. */
const placedPages = (): Promise<PlacedPage[]> =>
  copacetic.read(({ BrowserWindow, WebContentsView }) =>
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
    const leftId = await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), at('/left'));
    const rightId = await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), at('/right'));
    await copacetic.until(
      async () => (await pageAt(at('/left'))) !== undefined && (await pageAt(at('/right'))) !== undefined,
      20_000,
    );

    await copacetic.chrome.evaluate((id) => window.copacetic.tabs.activate(id), leftId);
    await copacetic.chrome.evaluate((id) => window.copacetic.tabs.splitWith(id), rightId);
    await copacetic.until(async () => (await pageAt(at('/right')))?.isVisible === true, 5_000);

    const left = await pageAt(at('/left'));
    const right = await pageAt(at('/right'));
    expect(left?.isVisible).toBe(true);
    expect(right?.isVisible).toBe(true);
    expect((left?.x ?? 0) + (left?.width ?? 0)).toBeLessThan(right?.x ?? 0);

    // Dragged further than the divider goes; it stops where neither side is squeezed out.
    await copacetic.chrome.evaluate(() => window.copacetic.tabs.setSplitRatio(0.05));
    const narrowed = await pageAt(at('/left'));
    expect(narrowed?.width).toBeLessThan(left?.width ?? 0);
    expect(narrowed?.width).toBeGreaterThan(0);

    await copacetic.chrome.evaluate((id) => window.copacetic.tabs.close(id), rightId);
    await copacetic.until(async () => (await pageAt(at('/right'))) === undefined, 5_000);
    const alone = await pageAt(at('/left'));
    const state = await copacetic.chrome.evaluate(() => window.copacetic.chrome.getState());
    expect(state.split).toBeNull();
    expect(state.activeTabId).toBe(leftId);
    expect(alone?.isVisible).toBe(true);
    expect(alone?.width).toBeGreaterThan((left?.width ?? 0) + (right?.width ?? 0));
  }, 90_000);
});

describe('choosing what a split shows', () => {
  const state = () => copacetic.chrome.evaluate(() => window.copacetic.chrome.getState());

  // The empty half used to need an address pasted into it; an open tab can now go straight in.
  it('fills the new tab half with a tab already open, beside the other, and closes the empty one', async () => {
    const otherUrl = at('/already-open');
    const keptUrl = at('/kept-beside');
    const otherId = await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), otherUrl);
    const keptId = await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), keptUrl);
    await copacetic.until(async () => (await pageAt(otherUrl)) !== undefined, 20_000);

    await copacetic.chrome.evaluate((id) => window.copacetic.tabs.activate(id), keptId);
    await copacetic.chrome.evaluate(() => window.copacetic.tabs.splitWith(null));
    const emptyId = (await state()).split?.rightId ?? '';
    expect(emptyId).not.toBe('');

    await copacetic.chrome.evaluate(([pane, chosen]) => window.copacetic.tabs.replaceSplitPane(pane, chosen), [
      emptyId,
      otherId,
    ] as const);
    await copacetic.until(async () => (await pageAt(otherUrl))?.isVisible === true, 5_000);

    const after = await state();
    expect(after.split).toMatchObject({ leftId: keptId, rightId: otherId });
    expect(after.tabs.some((tab) => tab.id === emptyId)).toBe(false);
    const order = after.tabs.map((tab) => tab.id);
    expect(order.indexOf(otherId)).toBe(order.indexOf(keptId) + 1);
    const kept = await pageAt(keptUrl);
    const other = await pageAt(otherUrl);
    expect((kept?.x ?? 0) + (kept?.width ?? 0)).toBeLessThan(other?.x ?? 0);
  }, 90_000);

  it('ends the split when one of its tabs is dragged away from the other', async () => {
    const firstId = await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), at('/pair-a'));
    const secondId = await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), at('/pair-b'));
    await copacetic.chrome.evaluate((id) => window.copacetic.tabs.activate(id), firstId);
    await copacetic.chrome.evaluate((id) => window.copacetic.tabs.splitWith(id), secondId);
    expect((await state()).split).toMatchObject({ leftId: firstId, rightId: secondId });

    await copacetic.chrome.evaluate((id) => window.copacetic.tabs.move(id, 0), secondId);
    expect(await copacetic.until(async () => (await state()).split === null, 5_000)).toBe(true);
  }, 60_000);
});

describe('split view across a restart', () => {
  it('comes back as the pair it was, at the width it was', async () => {
    const first = await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), at('/kept-left'));
    const second = await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), at('/kept-right'));
    await copacetic.chrome.evaluate((id) => window.copacetic.tabs.activate(id), first);
    await copacetic.chrome.evaluate((id) => window.copacetic.tabs.splitWith(id), second);
    await copacetic.chrome.evaluate(() => window.copacetic.tabs.setSplitRatio(0.35));
    // The session is written on a debounce; closing before it lands tested the debounce, not the restore.
    const saved = await copacetic.waitForProfileJson<{ windows: Array<{ split?: { ratio: number } }> }>(
      'session.json',
      (session) => session.windows.some((snapshot) => snapshot.split?.ratio === 0.35),
    );
    expect(saved?.windows.some((snapshot) => snapshot.split?.ratio === 0.35)).toBe(true);

    const profile = copacetic.profile;
    await copacetic.close({ keepProfile: true });
    copacetic = await SmokeApp.launch({ profile });
    await copacetic.waitForReady();

    const restored = async () => {
      const state = await copacetic.chrome.evaluate(() => window.copacetic.chrome.getState());
      const urlOf = (id: string | undefined) => state.tabs.find((tab) => tab.id === id)?.url;
      return state.split
        ? { left: urlOf(state.split.leftId), right: urlOf(state.split.rightId), ratio: state.split.ratio }
        : null;
    };
    expect(await copacetic.until(async () => (await restored()) !== null, 20_000)).toBe(true);
    expect(await restored()).toEqual({
      left: at('/kept-left'),
      right: at('/kept-right'),
      ratio: 0.35,
    });
  }, 120_000);
});
