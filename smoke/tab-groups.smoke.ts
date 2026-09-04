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

    // Waited for rather than slept through: the file is written on a debounce,
    // and a fixed pause is the same wait written badly — it passes here and
    // fails on a slower machine, saying the rename is broken when it means it
    // has not landed yet. A rename that never lands still fails.
    const stored = await copacetic.waitForProfileJson<Array<{ name: string }>>(
      'groups.json',
      (groups) => groups[0]?.name === 'Client work',
    );
    expect(stored?.[0]?.name).toBe('Client work');

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

/**
 * A collapsed group hides its tabs, and one of them may be the tab being looked
 * at. Its page stays on screen with nothing in the strip pointing at it, and
 * the only way back is to expand the group again — so activation steps out of
 * the group before it closes.
 */
describe('collapsing a group that holds the active tab', () => {
  const selectedIndex = () =>
    copacetic.chrome.evaluate(() =>
      Array.from(document.querySelectorAll('[role="tab"]')).findIndex(
        (tab) => tab.getAttribute('aria-selected') === 'true',
      ),
    );
  const visibleTabs = () => copacetic.chrome.evaluate(() => document.querySelectorAll('[role="tab"]').length);

  it('leaves the selected tab one you can still see', async () => {
    const groupId = await copacetic.chrome.evaluate(async () => {
      const first = await window.copacetic.tabs.create('https://example.com/a');
      const second = await window.copacetic.tabs.create('https://example.com/b');
      await window.copacetic.tabs.create('https://example.com/outside');
      const id = await window.copacetic.groups.create(first, 'Collapsing', 'ocean', false);
      await window.copacetic.groups.setForTab(second, id);
      await window.copacetic.tabs.activate(second);
      return id;
    });
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const before = { selected: await selectedIndex(), visible: await visibleTabs() };
    await copacetic.chrome.evaluate((id) => window.copacetic.groups.update(id, { collapsed: true }), groupId);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const after = { selected: await selectedIndex(), visible: await visibleTabs() };

    // The group's tabs are gone from the strip...
    expect(after.visible).toBeLessThan(before.visible);
    // ...and what is selected is not one of the tabs that went with them.
    expect(after.selected).toBeGreaterThanOrEqual(0);
    expect(after.selected).toBeLessThan(after.visible);
  }, 120_000);
});
