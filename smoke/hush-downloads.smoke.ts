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

const written = (): { url: string }[] => {
  const file = path.join(copacetic.profile, 'downloads.json');
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { url: string }[]) : [];
};

const listed = () =>
  copacetic.chrome.evaluate(async () => {
    const state = await window.copacetic.chrome.getState();
    return state.downloads.map((entry) => ({
      url: entry.url,
      isHush: entry.isHush === true,
      status: entry.status,
      received: entry.receivedBytes,
    }));
  });

/**
 * The claim, in the README and on the Hush tab itself: nothing it does reaches
 * the disk, and closing it leaves nothing to delete because nothing was
 * written. A download was writing its address, its redirect chain and its time
 * into downloads.json — measured, not suspected.
 *
 * The file is on disk because it was asked for. The record of where it came
 * from is browsing, and a Hush tab keeps none of that.
 */
describe('a download started in a Hush tab', () => {
  it('is not written to disk', async () => {
    await copacetic.chrome.evaluate(() => window.copacetic.tabs.createHush());
    await new Promise((resolve) => setTimeout(resolve, 3500));

    const started = await copacetic.main(({ session, webContents }) => {
      const hush = session.fromPartition('copacetic-hush');
      const target = webContents.getAllWebContents().find((contents) => contents.session === hush);
      target?.downloadURL('https://example.com/');
      return Boolean(target);
    });
    expect(started).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 5000));

    expect(written()).toHaveLength(0);
  }, 120_000);

  // Not written is not the same as not there. It has to be usable while the
  // window is open, or the file someone just saved is one they cannot find.
  it('is still listed, and still finishes', async () => {
    const downloads = await listed();
    const hush = downloads.find((entry) => entry.isHush);
    expect(hush).toBeTruthy();
    expect(hush?.status).toBe('completed');
    // Progress and completion are patched somewhere else entirely for these, so
    // a download stuck at nought bytes is the shape this catches.
    expect(hush?.received).toBeGreaterThan(0);
  }, 60_000);

  /*
   * The counterweight. A change that stopped writing every download would pass
   * the first test and quietly break the feature for everyone else.
   */
  it('does not stop ordinary downloads being remembered', async () => {
    await copacetic.chrome.evaluate(() => window.copacetic.tabs.create('https://example.com'));
    await new Promise((resolve) => setTimeout(resolve, 4000));

    await copacetic.main(({ session, webContents }) => {
      const web = session.fromPartition('persist:copacetic-web');
      const target = webContents.getAllWebContents().find((contents) => contents.session === web);
      target?.downloadURL('https://example.com/');
      return Boolean(target);
    });
    await new Promise((resolve) => setTimeout(resolve, 5000));

    expect(written().length).toBeGreaterThan(0);
    const downloads = await listed();
    expect(downloads.some((entry) => !entry.isHush)).toBe(true);
  }, 120_000);
});
