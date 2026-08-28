import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;
beforeAll(async () => {
  copacetic = await SmokeApp.launch();
});
afterAll(async () => copacetic?.close());

/**
 * A WebContentsView paints above the renderer's HTML, so a panel floated over
 * the content rectangle is swallowed by the page rather than shown over it.
 * This measured 149px of 186 hidden when the panel was positioned `fixed`;
 * it stays here because nothing about the panel's own markup reveals the fault.
 */
describe('the group panel', () => {
  it('is not drawn behind the page', async () => {
    await copacetic.chrome.evaluate(async () => {
      const tabId = await window.copacetic.tabs.create('about:blank');
      await window.copacetic.groups.create(tabId, 'Work', 'violet', false);
    });
    await new Promise((r) => setTimeout(r, 2000));
    const measured = await copacetic.chrome.evaluate(async () => {
      const label = Array.from(document.querySelectorAll('button')).find((button) =>
        button.textContent?.trim().startsWith('Work'),
      );
      if (!label) {
        return { labelFound: false };
      }
      (label as HTMLElement).click();
      await new Promise((r) => setTimeout(r, 600));
      const main = document.querySelector('main');
      const panel = document.querySelector('[role="dialog"][aria-label^="Group"]');
      if (!main || !panel) {
        return { labelFound: true, panelFound: false };
      }
      const m = main.getBoundingClientRect();
      const p = panel.getBoundingClientRect();
      return {
        labelFound: true,
        panelFound: true,
        pageViewStartsAtY: Math.round(m.top),
        panelTop: Math.round(p.top),
        panelBottom: Math.round(p.bottom),
        panelHeight: Math.round(p.height),
        pxBehindThePageView: Math.round(Math.max(0, p.bottom - Math.max(p.top, m.top))),
      };
    });
    expect(measured.labelFound).toBe(true);
    expect(measured.panelFound).toBe(true);
    expect(measured.panelHeight).toBeGreaterThan(0);
    expect(measured.pxBehindThePageView).toBe(0);
  }, 90_000);
});
