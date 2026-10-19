import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
});
afterAll(async () => copacetic?.close());

const PAGE = 'https://example.com/privacy-switches';

const openPage = async () => {
  await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), PAGE);
  await copacetic.inOpenPage(PAGE, 'true');
};

const update = (patch: Record<string, unknown>) =>
  copacetic.chrome.evaluate((changes) => window.copacetic.settings.update(changes), patch);

/** What Chromium itself was told for the open page, read in the main process rather than from a setting. */
const webRtcPolicyOfPage = () =>
  copacetic.read(
    ({ webContents }, url) =>
      webContents
        .getAllWebContents()
        .find((contents) => contents.getURL() === url)
        ?.getWebRTCIPHandlingPolicy() ?? null,
    PAGE,
  );

/**
 * A privacy switch is a promise about what the engine does, and the unit tests
 * only ever proved the setting was stored. These flip each one and read the
 * answer back from Chromium, or from a real page.
 */
describe('the privacy switches', () => {
  it('tells Chromium what WebRTC may reveal, in pages already open', async () => {
    await openPage();
    await update({ webRtcPolicy: 'proxiedOnly' });
    expect(
      await copacetic.until(async () => (await webRtcPolicyOfPage()) === 'disable_non_proxied_udp', 10_000),
    ).toBe(true);
    await update({ webRtcPolicy: 'publicOnly' });
    expect(
      await copacetic.until(async () => (await webRtcPolicyOfPage()) === 'default_public_interface_only', 10_000),
    ).toBe(true);
  }, 90_000);

  it('switches the spelling checker in the session, not only in the setting', async () => {
    const isChecking = () =>
      copacetic.read(({ session }) => session.fromPartition('persist:copacetic-web').isSpellCheckerEnabled());
    await update({ spellcheck: false });
    expect(await isChecking()).toBe(false);
    await update({ spellcheck: true });
    expect(await isChecking()).toBe(true);
  }, 60_000);

  // Blocking by default means no prompt at all: the page is refused, and nobody is asked.
  it('refuses a kind set to Block without asking anyone', async () => {
    await update({ permissionDefaults: { notifications: 'block' } });
    await openPage();
    expect(await copacetic.inOpenPage(PAGE, 'Notification.requestPermission()')).toBe('denied');
    const prompts = await copacetic.chrome.evaluate(
      async () => (await window.copacetic.chrome.getState()).permissionPrompts.length,
    );
    expect(prompts).toBe(0);
    await update({ permissionDefaults: {} });
  }, 90_000);

  // The page is asked for at the clean address, so the tracking never reaches the server or the history.
  it('takes tracking parameters off a link before the page loads, and leaves them when asked to', async () => {
    const tracked = 'https://example.com/landing?id=7&utm_source=mail&fbclid=abc';
    const finalUrlOf = async (url: string) => {
      const tabId = await copacetic.chrome.evaluate((target) => window.copacetic.tabs.create(target), url);
      expect(
        await copacetic.until(
          async () =>
            copacetic.chrome.evaluate(
              // The page's own title, since a tab whose load has not started is not loading either.
              async (id) => {
                const tab = (await window.copacetic.chrome.getState()).tabs.find((candidate) => candidate.id === id);
                return tab?.isLoading === false && Boolean(tab.title);
              },
              tabId,
            ),
          30_000,
        ),
      ).toBe(true);
      return copacetic.chrome.evaluate(
        async (id) => (await window.copacetic.chrome.getState()).tabs.find((tab) => tab.id === id)?.url ?? '',
        tabId,
      );
    };
    expect(await finalUrlOf(tracked)).toBe('https://example.com/landing?id=7');
    await update({ cleanLinks: false });
    expect(await finalUrlOf(tracked)).toBe(tracked);
    await update({ cleanLinks: true });
  }, 120_000);
});
