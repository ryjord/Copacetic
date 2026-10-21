import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
  await copacetic.chrome.evaluate(async () => {
    await window.copacetic.tabs.create('https://example.com/first');
  });
  await new Promise((resolve) => setTimeout(resolve, 5000));
});
afterAll(async () => copacetic?.close());

const tabsNow = () =>
  copacetic.chrome.evaluate(async () =>
    (await window.copacetic.chrome.getState()).tabs.map((tab) => ({
      id: tab.id,
      url: tab.url,
      internalPage: tab.internalPage,
    })),
  );
const activeUrl = () =>
  copacetic.chrome.evaluate(async () => {
    const state = await window.copacetic.chrome.getState();
    return state.tabs.find((tab) => tab.id === state.activeTabId)?.url ?? null;
  });

// Each is a tab of its own, so the page in front stays where it was and closing one is closing its tab.
describe('history, settings and the lists', () => {
  it('open in a tab of their own and leave the page where it was', async () => {
    await copacetic.chooseMenuItem('Show all history');
    expect(await copacetic.until(async () => (await activeUrl()) === 'copacetic://history', 10_000)).toBe(true);
    expect(await copacetic.chrome.getByRole('region', { name: 'History' }).isVisible()).toBe(true);
    expect((await tabsNow()).some((tab) => tab.url === 'https://example.com/first')).toBe(true);
  }, 90_000);

  // Asked for again, the open one comes forward rather than a second copy.
  it('come forward when asked for again rather than opening twice', async () => {
    await copacetic.chrome.evaluate(async () => {
      const state = await window.copacetic.chrome.getState();
      const page = state.tabs.find((tab) => tab.url === 'https://example.com/first');
      if (page) {
        await window.copacetic.tabs.activate(page.id);
      }
    });
    await copacetic.chooseMenuItem('Show all history');
    expect(await copacetic.until(async () => (await activeUrl()) === 'copacetic://history', 10_000)).toBe(true);
    expect((await tabsNow()).filter((tab) => tab.internalPage === 'history')).toHaveLength(1);
  }, 90_000);

  it('stay open while they are being used', async () => {
    await copacetic.chrome.getByRole('searchbox', { name: /Search history/ }).fill('example');
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(await activeUrl()).toBe('copacetic://history');
  }, 60_000);

  // The pane is in the address, so it is what a restart or a reopened tab comes back to.
  it('open settings at the pane asked for, and keep it in the address', async () => {
    await copacetic.chrome.evaluate(() => window.copacetic.chrome.showPage('settings', 'sites'));
    expect(await copacetic.until(async () => (await activeUrl()) === 'copacetic://settings/sites', 10_000)).toBe(
      true,
    );
    await copacetic.chrome
      .getByRole('navigation', { name: 'Settings sections' })
      .getByRole('button', { name: 'General' })
      .click();
    expect(await copacetic.until(async () => (await activeUrl()) === 'copacetic://settings/general', 10_000)).toBe(
      true,
    );
  }, 90_000);

  it('close with their tab', async () => {
    const settings = (await tabsNow()).find((tab) => tab.internalPage === 'settings');
    await copacetic.chrome.evaluate((id) => window.copacetic.tabs.close(id), settings?.id ?? '');
    expect(
      await copacetic.until(async () => !(await tabsNow()).some((tab) => tab.internalPage === 'settings'), 10_000),
    ).toBe(true);
  }, 60_000);
});

describe('a website', () => {
  // A page may open a new tab, never Copacetic's own settings or history.
  it('cannot open one of our pages', async () => {
    const before = (await tabsNow()).length;
    await copacetic.inOpenPage(
      'https://example.com/first',
      "window.open('copacetic://settings/passwords'); 'asked'",
      {
        userGesture: true,
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const after = await tabsNow();
    expect(after.filter((tab) => tab.internalPage === 'settings')).toHaveLength(0);
    expect(after.length).toBe(before);
  }, 60_000);
});

describe('one of our pages and the tab it came from', () => {
  // A site reached from History opened in Hush must stay out of the record too.
  it('is Hush when asked for from a Hush tab', async () => {
    await copacetic.chrome.evaluate(() => window.copacetic.tabs.createHush());
    await new Promise((resolve) => setTimeout(resolve, 800));
    await copacetic.chrome.evaluate(() => window.copacetic.chrome.showPage('history'));
    const historyTab = await copacetic.until(async () => {
      const state = await copacetic.chrome.evaluate(() => window.copacetic.chrome.getState());
      return state.tabs.some((tab) => tab.internalPage === 'history' && tab.isHush);
    }, 10_000);
    expect(historyTab).toBe(true);
  }, 60_000);

  it('comes back once, not twice, when reopened while it is still open', async () => {
    await copacetic.chrome.evaluate(() => window.copacetic.chrome.showPage('downloads'));
    await new Promise((resolve) => setTimeout(resolve, 600));
    const first = (await tabsNow()).find((tab) => tab.internalPage === 'downloads');
    await copacetic.chrome.evaluate((id) => window.copacetic.tabs.close(id), first?.id ?? '');
    await copacetic.chrome.evaluate(() => window.copacetic.chrome.showPage('downloads'));
    await new Promise((resolve) => setTimeout(resolve, 600));
    await copacetic.chrome.evaluate(() => window.copacetic.tabs.reopenClosed());
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect((await tabsNow()).filter((tab) => tab.internalPage === 'downloads')).toHaveLength(1);
  }, 60_000);
});
