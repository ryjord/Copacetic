import { describe, expect, it } from 'vitest';

import { canReadEverySite, matchesPattern, webStoreIdFrom } from '../../../../electron/shared/extensions/extensions';

const DARK_READER = 'eimadpbcbfnmbkopoojfekhnkhdbieeh';

describe('the extension a pasted address names', () => {
  it.each([
    [`https://chromewebstore.google.com/detail/dark-reader/${DARK_READER}`],
    [`https://chromewebstore.google.com/detail/${DARK_READER}?hl=en`],
    [`https://chrome.google.com/webstore/detail/dark-reader/${DARK_READER}`],
    [`  ${DARK_READER}  `],
  ])('reads %s', (input) => {
    expect(webStoreIdFrom(input)).toBe(DARK_READER);
  });

  // A typo is never fetched as if it were an id, and nothing but the store is asked.
  it.each([
    ['a word', 'dark reader'],
    ['another site', `https://example.com/detail/${DARK_READER}`],
    ['plain HTTP', `http://chromewebstore.google.com/detail/x/${DARK_READER}`],
    ['an id one letter short', DARK_READER.slice(1)],
  ])('refuses %s', (_name, input) => {
    expect(webStoreIdFrom(input)).toBeNull();
  });
});

describe('a match pattern', () => {
  it.each([
    ['<all_urls>', 'https://example.com/', true],
    ['<all_urls>', 'chrome://settings/', false],
    ['*://*/*', 'http://example.com/a', true],
    ['https://*.example.com/*', 'https://example.com/', true],
    ['https://*.example.com/*', 'https://mail.example.com/inbox', true],
    ['https://*.example.com/*', 'https://example.org/', false],
    ['https://example.com/docs/*', 'https://example.com/docs/a?b=1', true],
    ['https://example.com/docs/*', 'https://example.com/other', false],
    ['http://example.com/*', 'https://example.com/', false],
  ])('%s against %s is %s', (pattern, address, expected) => {
    expect(matchesPattern(pattern, address)).toBe(expected);
  });

  it('knows which extensions may see every address', () => {
    expect(canReadEverySite(['tabs'], [])).toBe(true);
    expect(canReadEverySite([], ['<all_urls>'])).toBe(true);
    expect(canReadEverySite(['storage'], ['https://example.com/*'])).toBe(false);
  });
});
