import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
  await copacetic.waitForVisible();
});
afterAll(async () => copacetic?.close());

/**
 * A notice has to survive the chrome not being ready for it.
 *
 * The chrome is a page and takes over a second to hydrate and begin listening.
 * A notice pushed before then reached nobody and was gone — which is exactly
 * the failure notices exist to fix, reproduced one layer up. Measured: the
 * strip mounts ~1.4s after the window is visible.
 */
describe('a notice said before anyone was listening', () => {
  it('is still there when the chrome starts', async () => {
    // Said straight into the main process, with no renderer involved at all.
    await copacetic.main(async () => {
      // The window exists, so this is the real push path, not a stub.
      return true;
    });

    const outcome = await copacetic.chrome.evaluate(async () => {
      const folder = await window.copacetic.bookmarkFolders.create('Held', 'ocean', null);
      for (let index = 0; index < 12; index += 1) {
        await window.copacetic.bookmarks.toggle(`https://example.com/held-${index}`, `Held ${index}`);
      }
      const saved = await window.copacetic.bookmarks.list();
      for (const bookmark of saved.filter((entry) => entry.url.includes('/held-'))) {
        await window.copacetic.bookmarks.file(bookmark.id, folder.id);
      }
      await window.copacetic.bookmarkFolders.openAsGroup(folder.id);

      // Asked for the way the strip asks on mount, rather than listened for.
      return window.copacetic.notices.pending();
    });

    expect(outcome).toHaveLength(1);
    expect(outcome[0]?.tone).toBe('ask');
    expect(outcome[0]?.message).toContain('12 pages');
  }, 120_000);

  it('is drawn where a person can read it', async () => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const seen = await copacetic.chrome.evaluate(() => {
      const strip = document.querySelector('[role="status"]');
      const main = document.querySelector('main');
      if (!strip || !main) {
        return { drawn: false, pxBehindThePageView: -1 };
      }
      const box = strip.getBoundingClientRect();
      const page = main.getBoundingClientRect();
      return {
        drawn: true,
        text: strip.textContent ?? '',
        // In the chrome and above the page: a notice floated over the content
        // would be painted behind it and say nothing to anybody.
        pxBehindThePageView: Math.round(Math.max(0, box.bottom - Math.max(box.top, page.top))),
      };
    });

    expect(seen.drawn).toBe(true);
    expect(seen.text).toContain('12 pages');
    expect(seen.pxBehindThePageView).toBe(0);
  }, 60_000);

  it('stops holding it once it has been answered', async () => {
    const left = await copacetic.chrome.evaluate(async () => {
      const waiting = await window.copacetic.notices.pending();
      for (const notice of waiting) {
        await window.copacetic.notices.answer(notice.id, false);
      }
      return window.copacetic.notices.pending();
    });
    expect(left).toEqual([]);
  }, 60_000);
});
