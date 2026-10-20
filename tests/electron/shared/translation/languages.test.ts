import { describe, expect, it } from 'vitest';
import { languageOf, routeFor } from '../../../../electron/shared/translation/languages';

describe('routeFor', () => {
  it('runs one model when English is either end, and two through English otherwise', () => {
    expect(routeFor('fr', 'en')).toEqual([{ from: 'fr', to: 'en' }]);
    expect(routeFor('en', 'de')).toEqual([{ from: 'en', to: 'de' }]);
    expect(routeFor('fr', 'de')).toEqual([
      { from: 'fr', to: 'en' },
      { from: 'en', to: 'de' },
    ]);
  });

  it('has no route to the same language, or to one with no model', () => {
    expect(routeFor('fr', 'fr')).toEqual([]);
    expect(routeFor('fr', 'klingon')).toEqual([]);
  });
});

describe('languageOf', () => {
  it('reads a page language down to the one a model is named for', () => {
    expect(languageOf('pt-BR')).toBe('pt');
    expect(languageOf('zh-TW')).toBe('zh-Hant');
    expect(languageOf('zh-CN')).toBe('zh-Hans');
    expect(languageOf('no')).toBe('nb');
    expect(languageOf('')).toBeNull();
    expect(languageOf('xx')).toBeNull();
  });
});
