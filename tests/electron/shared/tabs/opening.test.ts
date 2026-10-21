import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { inheritFromOpener } from '../../../../electron/shared/tabs/opening';

/**
 * Following a link out of a Hush tab used to open an ordinary, recorded one.
 *
 * Three separate findings - `window.open` and `target="_blank"`, "Open link in
 * new tab", and "Search for …" on a selection - with one cause: the flag was
 * passed at creation and never inherited, so every new way of opening a tab had
 * to remember, and none of them did. The address went to history, the icon to
 * the favicon cache and the certificate to certificates.json, all from a tab
 * whose entire promise is that none of that happens.
 */
describe('what a tab opened from another tab inherits', () => {
  /*
   * An explicit request wins, or "New Hush tab" pressed while an ordinary tab
   * is in front would open an ordinary tab. Hush is never quietly dropped: an
   * explicit `false` is the only way out.
   */
  it.each([
    ['a Hush opener', { isHush: true, groupId: null }, undefined, { hush: true, groupId: null }],
    ['an ordinary opener', { isHush: false, groupId: null }, undefined, { hush: false, groupId: null }],
    ['no opener, which is someone typing an address', null, undefined, { hush: false, groupId: null }],
    [
      'an opener in a group, the way a link followed in place would',
      { isHush: false, groupId: 'work' },
      undefined,
      { hush: false, groupId: 'work' },
    ],
    [
      'an explicit Hush request from an ordinary opener',
      { isHush: false, groupId: null },
      { hush: true },
      { hush: true, groupId: null },
    ],
    [
      'a Hush opener and an unrelated option',
      { isHush: true, groupId: 'work' },
      { groupId: null },
      { hush: true, groupId: null },
    ],
  ])('inherits from %s', (_caseName, opener, options, expected) => {
    expect(inheritFromOpener(opener, options)).toEqual(expected);
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
 * opener - and the three that did not are exactly the three findings.
 */
describe('every tab opened from page content names its opener', () => {
  const source = readFileSync('electron/main/menus/context-menu.ts', 'utf8').replace(/\s+/g, ' ');

  it('passes an opener on every tabs.create in the page context menu', () => {
    // Each call, from `tabs.create(` to the closing brace of its options.
    const calls = [...source.matchAll(/browser\.tabs\.create\([^;]*?\}\)/g)].map((match) => match[0]);
    // Link, background link, Hush link, image, search selection, and the tab-strip's
    // own "New tab to the right" - which has no page behind it and takes none.
    // Exactly six: a looser bound would pass while the regex quietly stopped
    // matching one of them, which is the only way this check can rot.
    expect(calls).toHaveLength(6);

    // Anchored on the argument rather than on the word, so a future call whose
    // first argument merely starts with `undefined` is not skipped by accident.
    const fromPageContent = calls.filter((call) => !call.includes('create(undefined,'));
    expect(fromPageContent).toHaveLength(5);
    for (const call of fromPageContent) {
      expect(call).toContain('openerWebContentsId');
    }
  });
});
