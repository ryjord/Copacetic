import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
});
afterAll(async () => copacetic?.close());

describe('the app keeps a record of what it did', () => {
  it('writes a log into the profile', async () => {
    expect(await copacetic.waitForProfileFile('diagnostics.log')).toBe(true);
  });

  it('records that it started, and what it is', async () => {
    await copacetic.waitForProfileFile('diagnostics.log');
    const written = copacetic.readProfileFile('diagnostics.log');
    expect(written).toContain('INFO started');
    expect(written).toMatch(/version=\d+\.\d+\.\d+/);
  });

  /**
   * The rule the whole thing depends on, checked against a real run rather than
   * a unit test: a log that names the sites someone visited is browsing history
   * under another name, and would make the file unsafe to send to anyone.
   */
  it('records that a page failed without recording which page', async () => {
    // An address that cannot resolve, so the failure path runs for certain.
    await copacetic.chrome.evaluate(() => window.copacetic.tabs.create('https://nowhere.invalid/a-private-page'));
    await new Promise((resolve) => setTimeout(resolve, 4000));

    const written = copacetic.readProfileFile('diagnostics.log');

    // It happened, and was written down...
    expect(written).toContain('a page failed to load');
    expect(written).toContain('url=https://<address>');
    // ...without saying where.
    expect(written).not.toContain('nowhere.invalid');
    expect(written).not.toContain('a-private-page');
  });
});
