import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
});
afterAll(async () => copacetic?.close());

const isDark = () => copacetic.chrome.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches);

/** The setting reaches Electron's native theme, and the chrome follows it without being told separately. */
describe('choosing an appearance', () => {
  it.each([
    ['dark', true],
    ['light', false],
  ] as const)(
    '%s turns the chrome %s',
    async (appearance, expected) => {
      await copacetic.chrome.evaluate((value) => window.copacetic.settings.update({ appearance: value }), appearance);
      expect(
        await copacetic.waitForChrome(
          async () =>
            matchMedia('(prefers-color-scheme: dark)').matches ===
            (await window.copacetic.settings.get()).appearance.startsWith('d'),
        ),
      ).toBe(true);
      expect(await isDark()).toBe(expected);
    },
    60_000,
  );

  it('paints the window the same colour, so nothing flashes the other theme', async () => {
    await copacetic.chrome.evaluate(() => window.copacetic.settings.update({ appearance: 'dark' }));
    await new Promise((resolve) => setTimeout(resolve, 300));
    const colour = await copacetic.main(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.getBackgroundColor(),
    );
    expect(colour?.toLowerCase()).toBe('#0b0f14');
  }, 60_000);
});
