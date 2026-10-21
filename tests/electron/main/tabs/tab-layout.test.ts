import { describe, expect, it } from 'vitest';
import { contentBoundsWithin, normaliseInsets, shouldTabBeVisible } from '../../../../electron/main/tabs/tab-layout';

describe('where a tab sits inside the window', () => {
  it.each([
    [
      'takes the chrome out of the content area',
      { top: 88, left: 0, right: 0, bottom: 0 },
      { x: 0, y: 88, width: 1200, height: 712 },
    ],
    [
      'accounts for a sidebar on either edge',
      { top: 88, left: 300, right: 20, bottom: 10 },
      { x: 300, y: 88, width: 880, height: 702 },
    ],
  ])('%s', (_name, insets, expected) => {
    expect(contentBoundsWithin({ width: 1200, height: 800 }, insets)).toEqual(expected);
  });

  // A video that went fullscreen used to fill a rectangle under the chrome.
  it('gives a fullscreen page the whole window', () => {
    const bounds = contentBoundsWithin(
      { width: 1200, height: 800 },
      { top: 88, left: 300, right: 0, bottom: 0 },
      true,
    );
    expect(bounds).toEqual({ x: 0, y: 0, width: 1200, height: 800 });
  });

  // A negative size is not a smaller view, it is an Electron error.
  it('never returns a negative size when the chrome claims more than the window', () => {
    const bounds = contentBoundsWithin({ width: 100, height: 50 }, { top: 400, left: 200, right: 200, bottom: 0 });
    expect(bounds.width).toBe(0);
    expect(bounds.height).toBe(0);
  });

  it('rounds and floors what the renderer measured', () => {
    expect(normaliseInsets({ top: 87.6, left: -4, right: 0.2, bottom: 0 })).toEqual({
      top: 88,
      left: 0,
      right: 0,
      bottom: 0,
    });
  });
});

/**
 * A WebContentsView always paints above the chrome's HTML, so every one of
 * these is the difference between a panel covering the page and a page showing
 * straight through it.
 */
describe('whether a tab is shown at all', () => {
  const tab = { isActive: true, isInternalPage: false, hasError: false };

  it.each([
    ['shows the active tab when nothing covers it', {}, false, true],
    ['hides every tab that is not the active one', { isActive: false }, false, false],
    ['hides the page while an overlay is up', {}, true, false],
    ['hides the view on a page of ours, which the chrome draws itself', { isInternalPage: true }, false, false],
    ['hides the view behind an error page, so the failed load cannot show through', { hasError: true }, false, false],
  ])('%s', (_name, changes, isOverlayUp, expected) => {
    expect(shouldTabBeVisible({ ...tab, ...changes }, isOverlayUp)).toBe(expected);
  });
});
