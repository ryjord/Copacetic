import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';
import pkg from '../package.json' with { type: 'json' };

let copacetic: SmokeApp;

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
});
afterAll(async () => copacetic?.close());

describe('the app starts', () => {
  it('opens a window', () => {
    expect(copacetic.chrome).toBeTruthy();
  });

  // `show: false` until it is ready to paint, so a window that never becomes
  // visible is a real failure rather than a slow start.
  it('shows the window rather than leaving it hidden', async () => {
    expect(await copacetic.waitForVisible()).toBe(true);
  });

  it('draws its own chrome rather than an empty document', async () => {
    await copacetic.chrome.waitForSelector('body', { timeout: 30_000 });
    const painted = await copacetic.chrome.evaluate(() => document.body.innerHTML.length);
    expect(painted).toBeGreaterThan(0);
  });

  it('reports the version this build actually is', async () => {
    const info = await copacetic.chrome.evaluate(() => window.copacetic.app.getInfo());
    expect(info.version).toBe(pkg.version);
  });

  it('starts with no error dialog and one window', async () => {
    expect(await copacetic.main(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  });
});
