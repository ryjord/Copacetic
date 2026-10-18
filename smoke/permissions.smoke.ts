import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
});
afterAll(async () => copacetic?.close());

const storedDecisions = () =>
  copacetic.chrome.evaluate(async () => (await window.copacetic.settings.get()).permissionDecisions);

const tabsAt = (fragment: string) =>
  copacetic.chrome.evaluate(
    async (needle) => (await window.copacetic.chrome.getState()).tabs.filter((tab) => tab.url.includes(needle)),
    fragment,
  );

/** Opens one tab at the address, ordinary or Hush, and waits until it has loaded there. */
async function openTab(url: string, isHush: boolean): Promise<string> {
  const tabId = await copacetic.chrome.evaluate(
    async ({ target, hush }) => {
      if (!hush) {
        return window.copacetic.tabs.create(target);
      }
      await window.copacetic.tabs.createHush();
      const state = await window.copacetic.chrome.getState();
      const id = state.activeTabId!;
      await window.copacetic.tabs.navigate(id, target);
      return id;
    },
    { target: url, hush: isHush },
  );
  await copacetic.inOpenPage(url, 'true');
  return tabId;
}

/** The page asks for notifications, and the prompt is answered the way the banner would answer it. */
async function askAndAnswer(url: string, remember: boolean): Promise<void> {
  // Not awaited in the page: the request only settles once it has been answered.
  await copacetic.inOpenPage(
    url,
    `Notification.requestPermission().then((value) => (window.answered = value)), true`,
  );
  expect(
    await copacetic.waitForChrome(
      async () => (await window.copacetic.chrome.getState()).permissionPrompts.length > 0,
    ),
  ).toBe(true);
  const promptId = await copacetic.chrome.evaluate(
    async () => (await window.copacetic.chrome.getState()).permissionPrompts.at(-1)!.id,
  );
  await copacetic.chrome.evaluate(
    ({ id, shouldRemember }) => window.copacetic.permissions.respond(id, 'allow', shouldRemember),
    { id: promptId, shouldRemember: remember },
  );
  expect(
    await copacetic.waitForChrome(
      async () => (await window.copacetic.chrome.getState()).permissionPrompts.length === 0,
    ),
  ).toBe(true);
  expect(await copacetic.inOpenPage(url, 'window.answered')).toBe('granted');
}

/**
 * "Remember this" was decoration. Every answer was kept whether it was ticked or
 * not, and a second path kept a ticked answer from a Hush tab too, which put the
 * site's name in settings.json. These drive a real page through the real
 * permission handler and read back what the browser kept.
 */
describe('answering a permission prompt', () => {
  it('keeps nothing when Remember is not ticked', async () => {
    await openTab('https://example.com/not-remembered', false);
    await askAndAnswer('https://example.com/not-remembered', false);
    expect(Object.keys(await storedDecisions())).toEqual([]);
  }, 120_000);

  it('keeps the answer when Remember is ticked', async () => {
    await openTab('https://example.net/remembered', false);
    await askAndAnswer('https://example.net/remembered', true);
    expect(await storedDecisions()).toMatchObject({ 'https://example.net|notifications': 'allow' });
  }, 120_000);

  it('keeps nothing from a Hush tab, even when Remember is ticked', async () => {
    await openTab('https://example.org/hush-asks', true);
    expect((await tabsAt('hush-asks')).map((tab) => tab.isHush)).toEqual([true]);

    await askAndAnswer('https://example.org/hush-asks', true);
    expect(Object.keys(await storedDecisions()).some((key) => key.startsWith('https://example.org'))).toBe(false);
  }, 120_000);
});

describe('duplicating a tab', () => {
  // A copy of a Hush tab was an ordinary tab, recorded in history like any other.
  it('keeps a Hush tab Hush', async () => {
    const [hush] = await tabsAt('hush-asks');
    expect(hush?.isHush).toBe(true);

    await copacetic.chrome.evaluate((id) => window.copacetic.tabs.duplicate(id), hush!.id);
    // Evaluated in the chrome, so it can only name what is there.
    expect(
      await copacetic.waitForChrome(
        async () =>
          (await window.copacetic.chrome.getState()).tabs.filter((tab) => tab.url.includes('hush-asks')).length === 2,
        20_000,
      ),
    ).toBe(true);
    expect((await tabsAt('hush-asks')).every((tab) => tab.isHush)).toBe(true);
  }, 120_000);
});
