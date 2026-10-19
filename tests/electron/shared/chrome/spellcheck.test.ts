import { describe, expect, it } from 'vitest';

import { readSpellcheckLanguages, spellcheckLanguagesFor } from '../../../../electron/shared/chrome/spellcheck';

const AVAILABLE = ['en-GB', 'en-US', 'fr', 'de-DE', 'pt-BR'];

describe('readSpellcheckLanguages', () => {
  it('keeps well-formed codes once each, up to two', () => {
    expect(readSpellcheckLanguages(['en-GB', 'en-GB', 'fr', 'de-DE'])).toEqual(['en-GB', 'fr']);
  });

  it('drops anything that is not a language code', () => {
    expect(readSpellcheckLanguages(['en-GB', 42, '../../etc', '', 'english'])).toEqual(['en-GB']);
    expect(readSpellcheckLanguages('en-GB')).toEqual([]);
  });
});

describe('spellcheckLanguagesFor', () => {
  it('uses the languages chosen that Chromium knows', () => {
    expect(spellcheckLanguagesFor(['fr', 'xx-YY'], AVAILABLE, 'en-GB')).toEqual(['fr']);
  });

  it('falls back to the system language when nothing usable was chosen', () => {
    expect(spellcheckLanguagesFor([], AVAILABLE, 'en-GB')).toEqual(['en-GB']);
    expect(spellcheckLanguagesFor([], AVAILABLE, 'pt-PT')).toEqual(['pt-BR']);
  });

  it('chooses nothing when the system language has no dictionary', () => {
    expect(spellcheckLanguagesFor([], AVAILABLE, 'ja')).toEqual([]);
  });
});
