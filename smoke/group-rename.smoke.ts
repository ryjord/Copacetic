import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
  await copacetic.waitForVisible();
  // A real page, so the content view is genuinely there to be disturbed.
  await copacetic.chrome.evaluate(async () => {
    const tabId = await window.copacetic.tabs.create('https://example.com');
    await window.copacetic.groups.create(tabId, 'Work', 'violet', false);
  });
  await new Promise((resolve) => setTimeout(resolve, 4000));
});
afterAll(async () => copacetic?.close());

const pageTop = () =>
  copacetic.chrome.evaluate(() => Math.round(document.querySelector('main')!.getBoundingClientRect().top));

describe('renaming a group', () => {
  /**
   * Renaming used to open a panel, which could not float over the page — a
   * WebContentsView paints above the renderer's HTML — so it was put in flow
   * and pushed the toolbar and the page down every time it opened. The field
   * is now the label itself, and the chrome must not move at all.
   */
  it('does not move the chrome or the page', async () => {
    const before = await pageTop();
    await copacetic.chrome.getByRole('button', { name: /Work/ }).first().click();
    await new Promise((resolve) => setTimeout(resolve, 500));
    const after = await pageTop();

    const editing = await copacetic.chrome.evaluate(() => {
      const field = document.activeElement as HTMLInputElement | null;
      const header = document.querySelector('header');
      if (!field || !header) {
        return { isField: false, value: null, selected: false, overflowsTheStrip: true };
      }
      const strip = header.getBoundingClientRect();
      const box = field.getBoundingClientRect();
      return {
        isField: field.tagName === 'INPUT',
        value: field.value,
        selected: field.selectionStart === 0 && field.selectionEnd === field.value.length,
        // The strip is a fixed height, so a field that outgrows it is clipped
        // rather than moving anything — invisible to the measurement above.
        overflowsTheStrip: box.top < strip.top - 1 || box.bottom > strip.bottom + 1,
      };
    });

    expect(editing.isField).toBe(true);
    expect(editing.value).toBe('Work');
    expect(editing.selected).toBe(true);
    expect(editing.overflowsTheStrip).toBe(false);
    expect(after).toBe(before);
  }, 90_000);

  // Clicking away from a field you have edited means you are done with it.
  it('keeps the new name when you click away', async () => {
    await copacetic.chrome.keyboard.type('Client work');
    await copacetic.chrome.locator('main').click({ position: { x: 40, y: 40 }, force: true });
    await new Promise((resolve) => setTimeout(resolve, 800));

    const stored = JSON.parse(readFileSync(path.join(copacetic.profile, 'groups.json'), 'utf8')) as Array<{
      name: string;
    }>;
    expect(stored[0]?.name).toBe('Client work');

    const stillEditing = await copacetic.chrome.evaluate(
      () => (document.activeElement as HTMLElement | null)?.tagName === 'INPUT',
    );
    expect(stillEditing).toBe(false);
  }, 90_000);

  // Escape is the one way out that keeps the old name, and the blur that
  // follows it must not put the typing back.
  it('discards the typing on Escape', async () => {
    await copacetic.chrome
      .getByRole('button', { name: /Client work/ })
      .first()
      .click();
    await new Promise((resolve) => setTimeout(resolve, 400));
    await copacetic.chrome.keyboard.type('Thrown away');
    await copacetic.chrome.keyboard.press('Escape');
    await new Promise((resolve) => setTimeout(resolve, 800));

    const stored = JSON.parse(readFileSync(path.join(copacetic.profile, 'groups.json'), 'utf8')) as Array<{
      name: string;
    }>;
    expect(stored[0]?.name).toBe('Client work');
  }, 90_000);
});
