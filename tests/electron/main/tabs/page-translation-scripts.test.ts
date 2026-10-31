// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  COLLECT_PAGE_TEXT,
  RESTORE_PAGE_TEXT,
  applyTranslationsScript,
} from '../../../../electron/main/tabs/page-translation-scripts';

// Run as the page's isolated world would run them: in the document, with a global of their own.
const run = (code: string): unknown => (0, eval)(code);

beforeEach(() => {
  Reflect.deleteProperty(globalThis, 'copaceticPageText');
  document.documentElement.lang = 'fr';
  document.body.innerHTML = `
    <h1>Bonjour le monde</h1>
    <p>Une phrase, <b>en gras</b>.</p>
    <script>var secret = "ne pas lire";</script>
    <pre>code ici</pre>
    <textarea>tapé par quelqu'un</textarea>
    <p translate="no">Marque</p>
    <p>   </p>`;
});

describe('translating a page where it stands', () => {
  it('reads the visible text and the language, leaving scripts, code, forms and translate="no" alone', () => {
    expect(run(COLLECT_PAGE_TEXT)).toEqual({
      language: 'fr',
      // A piece with no letter in it, such as a full stop, has nothing to translate.
      texts: ['Bonjour le monde', 'Une phrase,', 'en gras'],
    });
  });

  it('puts each translation in its piece’s place, keeping the spaces around it', () => {
    run(COLLECT_PAGE_TEXT);
    expect(run(applyTranslationsScript(['Hello world', 'A sentence,', 'in bold']))).toBe(3);
    expect(document.body.querySelector('p')?.textContent).toBe('A sentence, in bold.');
    expect(document.body.querySelector('h1')?.textContent).toBe('Hello world');
  });

  it('puts the page back as it was', () => {
    run(COLLECT_PAGE_TEXT);
    run(applyTranslationsScript(['Hello world', 'A sentence,', 'in bold']));
    run(RESTORE_PAGE_TEXT);
    expect(document.body.querySelector('h1')?.textContent).toBe('Bonjour le monde');
    expect(document.body.querySelector('p')?.textContent).toBe('Une phrase, en gras.');
  });

  // Serialised as data, so a translation that looks like code stays text.
  it('treats a translation full of quotes and script as text', () => {
    run(COLLECT_PAGE_TEXT);
    run(applyTranslationsScript(['"); globalThis.hacked = true; ("', '`${globalThis.hacked = true}`', 'x']));
    expect(document.body.querySelector('h1')?.textContent).toBe('"); globalThis.hacked = true; ("');
    expect(Reflect.get(globalThis, 'hacked')).toBeUndefined();
  });
});
