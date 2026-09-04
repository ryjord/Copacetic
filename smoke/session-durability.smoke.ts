import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
});
afterAll(async () => copacetic?.close());

const savedTabs = (): { url: string }[] => {
  const file = path.join(copacetic.profile, 'session.json');
  if (!existsSync(file)) {
    return [];
  }
  const raw = JSON.parse(readFileSync(file, 'utf8')) as { tabs?: { url: string }[] };
  return raw.tabs ?? [];
};

/**
 * The tabs someone has open are the thing they notice losing, and the one thing
 * that cannot be reconstructed from anything else.
 *
 * The session was written once, on the way out, from `before-quit`. That covers
 * the polite exits and none of the others: a machine shutting down sends
 * SIGTERM, a crash sends nothing at all, and either way every open tab was
 * gone. This opens tabs, kills the process the way a shutdown would, and looks
 * at what reached the disk.
 */
describe('the tabs that are open', () => {
  it('are on disk before anything asks the app to quit', async () => {
    await copacetic.chrome.evaluate(async () => {
      await window.copacetic.tabs.create('https://example.com/kept-one');
      await window.copacetic.tabs.create('https://example.com/kept-two');
    });
    // Long enough for the session file's own debounce, and no quit anywhere.
    await new Promise((resolve) => setTimeout(resolve, 6000));

    const urls = savedTabs().map((tab) => tab.url);
    expect(urls.some((url) => url.includes('kept-one'))).toBe(true);
    expect(urls.some((url) => url.includes('kept-two'))).toBe(true);
  }, 120_000);

  /*
   * Killed while a write is still pending: the session file waits a second
   * before writing, and this kills the process well inside that window, so the
   * tab exists only in memory when SIGTERM arrives.
   *
   * What this does not do is say which mechanism saved it. Removing the signal
   * handler leaves this passing, which means Electron on macOS already runs its
   * own quit path for SIGTERM and `before-quit` fires anyway. The handler is
   * kept for the signals and platforms where that is not true, but it is not
   * load-bearing here and this spec is not evidence that it is. What the spec
   * does hold is the outcome: a kill mid-write does not cost you your tabs.
   */
  it('survives being killed with a write still pending', async () => {
    await copacetic.chrome.evaluate(() => window.copacetic.tabs.create('https://example.com/killed'));

    const pid = await copacetic.main(() => process.pid);
    // Well inside the session file's one-second debounce.
    await new Promise((resolve) => setTimeout(resolve, 250));
    process.kill(pid, 'SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const urls = savedTabs().map((tab) => tab.url);
    expect(urls.some((url) => url.includes('killed'))).toBe(true);
  }, 120_000);
});
