import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { inheritFromOpener } from '../../electron/shared/opening';

/**
 * Following a link out of a Hush tab used to open an ordinary, recorded one.
 *
 * Three separate findings — `window.open` and `target="_blank"`, "Open link in
 * new tab", and "Search for …" on a selection — with one cause: the flag was
 * passed at creation and never inherited, so every new way of opening a tab had
 * to remember, and none of them did. The address went to history, the icon to
 * the favicon cache and the certificate to certificates.json, all from a tab
 * whose entire promise is that none of that happens.
 */
describe('what a tab opened from another tab inherits', () => {
  it('is Hush when the tab it came from was', () => {
    expect(inheritFromOpener({ isHush: true, groupId: null })).toEqual({ hush: true, groupId: null });
  });

  it('is ordinary when the tab it came from was', () => {
    expect(inheritFromOpener({ isHush: false, groupId: null })).toEqual({ hush: false, groupId: null });
  });

  it('is ordinary when nothing opened it, which is someone typing an address', () => {
    expect(inheritFromOpener(null)).toEqual({ hush: false, groupId: null });
  });

  it('joins the group its opener is in, the way a link followed in place would', () => {
    expect(inheritFromOpener({ isHush: false, groupId: 'work' })).toEqual({ hush: false, groupId: 'work' });
  });

  /*
   * An explicit request wins, or "New Hush tab" pressed while an ordinary tab
   * is in front would open an ordinary tab.
   */
  it('lets an explicit Hush request through from an ordinary opener', () => {
    expect(inheritFromOpener({ isHush: false, groupId: null }, { hush: true }).hush).toBe(true);
  });

  it('lets a tab be put in no group on purpose', () => {
    expect(inheritFromOpener({ isHush: false, groupId: 'work' }, { groupId: null }).groupId).toBeNull();
  });

  /*
   * The counterweight to the one above: `groupId` left unsaid is a question for
   * the opener, and `groupId: null` is an answer. Reading them the same way
   * would mean no tab ever joined its opener's group.
   */
  it('tells an unset group apart from one set to none', () => {
    expect(inheritFromOpener({ isHush: false, groupId: 'work' }, {}).groupId).toBe('work');
    expect(inheritFromOpener({ isHush: false, groupId: 'work' }, { groupId: null }).groupId).toBeNull();
  });

  // Hush is never quietly dropped: an explicit `false` is the only way out.
  it('does not lose Hush to an unrelated option', () => {
    expect(inheritFromOpener({ isHush: true, groupId: 'work' }, { groupId: null })).toEqual({
      hush: true,
      groupId: null,
    });
  });
});

/**
 * The rule only works if callers say who opened the tab. Every item in the page
 * context menu opens something the page named, so every one of them has an
 * opener — and the three that did not are exactly the three findings.
 */
describe('every tab opened from page content names its opener', () => {
  const source = readFileSync('electron/main/menus/context-menu.ts', 'utf8').replace(/\s+/g, ' ');

  it('passes an opener on every tabs.create in the page context menu', () => {
    // Each call, from `tabs.create(` to the closing brace of its options.
    const calls = [...source.matchAll(/browser\.tabs\.create\([^;]*?\}\)/g)].map((match) => match[0]);
    // Link, background link, image, search selection, and the tab-strip's own
    // "New tab to the right" — which has no page behind it and takes none.
    expect(calls.length).toBeGreaterThanOrEqual(4);

    const fromPageContent = calls.filter((call) => !call.includes('create(undefined'));
    for (const call of fromPageContent) {
      expect(call).toContain('openerWebContentsId');
    }
  });
});
