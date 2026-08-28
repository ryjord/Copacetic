import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
});
afterAll(async () => copacetic?.close());

describe('it writes where it says it writes', () => {
  it('keeps its files in the profile it was given', async () => {
    const dir = await copacetic.main(({ app }) => app.getPath('userData'));
    expect(dir).toBe(copacetic.profile);
  });

  it('writes settings into that profile, and they survive a read back', async () => {
    await copacetic.chrome.evaluate(() => window.copacetic.settings.update({ blockTrackers: false }));
    expect(await copacetic.waitForProfileFile('settings.json')).toBe(true);

    const written = JSON.parse(copacetic.readProfileFile('settings.json')) as { blockTrackers?: boolean };
    expect(written.blockTrackers).toBe(false);

    const readBack = await copacetic.chrome.evaluate(() => window.copacetic.chrome.getState());
    expect(readBack.settings.blockTrackers).toBe(false);
  });
});
