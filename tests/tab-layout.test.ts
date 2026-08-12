import { describe, expect, it } from 'vitest';
import { contentBoundsWithin, normaliseInsets, shouldTabBeVisible } from '../electron/main/tab-layout';

describe('where a tab sits inside the window', () => {
  it('takes the chrome out of the content area', () => {
    const bounds = contentBoundsWithin({ width: 1200, height: 800 }, { top: 88, left: 0, right: 0, bottom: 0 });
    expect(bounds).toEqual({ x: 0, y: 88, width: 1200, height: 712 });
  });

  it('accounts for a sidebar on either edge', () => {
    const bounds = contentBoundsWithin({ width: 1200, height: 800 }, { top: 88, left: 300, right: 20, bottom: 10 });
    expect(bounds).toEqual({ x: 300, y: 88, width: 880, height: 702 });
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
  const tab = { isActive: true, isStartPage: false, hasError: false };

  it('shows the active tab when nothing covers it', () => {
    expect(shouldTabBeVisible(tab, false)).toBe(true);
  });

  it('hides every tab that is not the active one', () => {
    expect(shouldTabBeVisible({ ...tab, isActive: false }, false)).toBe(false);
  });

  it('hides the page while an overlay is up', () => {
    expect(shouldTabBeVisible(tab, true)).toBe(false);
  });

  it('hides the view on the start page, which the chrome draws itself', () => {
    expect(shouldTabBeVisible({ ...tab, isStartPage: true }, false)).toBe(false);
  });

  it('hides the view behind an error page, so the failed load cannot show through', () => {
    expect(shouldTabBeVisible({ ...tab, hasError: true }, false)).toBe(false);
  });
});
