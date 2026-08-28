import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
  await copacetic.waitForVisible();
  // A real page, so there is genuine page content for the panel to be lost behind.
  await copacetic.chrome.evaluate(async () => {
    const tabId = await window.copacetic.tabs.create('https://example.com');
    await window.copacetic.groups.create(tabId, 'Work', 'violet', false);
  });
  await new Promise((resolve) => setTimeout(resolve, 4000));
});
afterAll(async () => copacetic?.close());

const openPanel = async (name: RegExp) => {
  await copacetic.chrome.getByRole('button', { name }).first().click();
  await new Promise((resolve) => setTimeout(resolve, 600));
};

describe('the group panel', () => {
  /**
   * A WebContentsView paints above the renderer's HTML, so a panel floated over
   * the content rectangle is swallowed by the page rather than shown over it.
   * This measured 149px of 186 hidden when the panel was positioned `fixed`,
   * and nothing in the panel's own markup reveals the fault.
   */
  it('is not drawn behind the page', async () => {
    await openPanel(/Work/);
    const measured = await copacetic.chrome.evaluate(() => {
      const main = document.querySelector('main');
      const panel = document.querySelector('[role="dialog"][aria-label^="Group"]');
      if (!main || !panel) {
        return { panelFound: false, pxBehindThePageView: -1, panelHeight: 0 };
      }
      const page = main.getBoundingClientRect();
      const box = panel.getBoundingClientRect();
      return {
        panelFound: true,
        panelHeight: Math.round(box.height),
        pxBehindThePageView: Math.round(Math.max(0, box.bottom - Math.max(box.top, page.top))),
      };
    });
    expect(measured.panelFound).toBe(true);
    expect(measured.panelHeight).toBeGreaterThan(0);
    expect(measured.pxBehindThePageView).toBe(0);
  }, 90_000);

  // Driven by real typing and real clicks, and read back from disk: a change
  // that only moved component state would look identical in the DOM.
  it('renames and recolours the group it belongs to', async () => {
    await copacetic.chrome.keyboard.type('Client work');
    await copacetic.chrome.keyboard.press('Enter');
    await new Promise((resolve) => setTimeout(resolve, 800));

    await openPanel(/Client work/);
    await copacetic.chrome.locator('[role="dialog"] button[aria-label*="clay" i]').first().click();
    await new Promise((resolve) => setTimeout(resolve, 800));

    const stored = JSON.parse(readFileSync(path.join(copacetic.profile, 'groups.json'), 'utf8')) as Array<{
      name: string;
      colour: string;
    }>;
    expect(stored).toHaveLength(1);
    expect(stored[0]?.name).toBe('Client work');
    expect(stored[0]?.colour).toBe('clay');
  }, 90_000);
});
