import { describe, expect, it } from 'vitest';

import { abilitiesOf } from '../../../../electron/shared/extensions/abilities';

describe('what an extension could do, in words', () => {
  it('says every site first, as Chrome warns of it', () => {
    expect(abilitiesOf(['tabs', 'storage'], ['<all_urls>'])).toEqual([
      'Read and change everything on every site you visit',
      'Read your browsing history',
    ]);
  });

  it('names a few sites, and counts the rest', () => {
    const sites = ['https://a.example/*', 'https://*.b.example/*', 'https://c.example/*', 'https://d.example/*'];
    expect(abilitiesOf([], sites)).toEqual([
      'Read and change everything on a.example, b.example, c.example and 1 more',
    ]);
  });

  it('says nothing for permissions that need no warning', () => {
    expect(abilitiesOf(['storage', 'alarms', 'scripting'], [])).toEqual([]);
  });

  it('says one sentence once, however many permissions lead to it', () => {
    expect(abilitiesOf(['tabs', 'webNavigation'], [])).toEqual(['Read your browsing history']);
  });
});
