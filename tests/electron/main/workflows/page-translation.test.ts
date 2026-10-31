import { describe, expect, it, vi } from 'vitest';
import { PageTranslation } from '../../../../electron/main/workflows/page-translation';
import { PAGE_TRANSLATION_WORLD, RESTORE_PAGE_TEXT } from '../../../../electron/main/tabs/page-translation-scripts';

type Deps = ConstructorParameters<typeof PageTranslation>[0];

function setup({ language = 'fr', texts = ['Bonjour', 'le monde'], reader = 'en' } = {}) {
  const scripts: string[] = [];
  const page = {
    executeJavaScriptInIsolatedWorld: vi.fn(async (world: number, sources: { code: string }[]) => {
      expect(world).toBe(PAGE_TRANSLATION_WORLD);
      scripts.push(sources[0]?.code ?? '');
      // The first script reads the page; the next writes translations in, and says how many it put back.
      return scripts.length === 1 ? { language, texts } : texts.length;
    }),
  };
  const notices: string[] = [];
  const translate = vi.fn(async (_from: string, _to: string, batch: readonly string[]) =>
    batch.map((text) => `[${text}]`),
  );
  const deps = {
    tabs: { livePageFor: () => page },
    translation: { translate },
    notices: { notify: ({ message }: { message: string }) => notices.push(message) },
    readerLanguage: () => reader,
    // Only what translating a page reaches is faked.
  } as unknown as Deps;
  return { translation: new PageTranslation(deps), scripts, notices, translate };
}

describe('translating the page in front', () => {
  it('translates from the language the page says into the reader’s, and puts it in place', async () => {
    const { translation, scripts, translate, notices } = setup();
    await translation.toggle('tab');
    expect(translate).toHaveBeenCalledWith('fr', 'en', ['Bonjour', 'le monde']);
    expect(scripts[1]).toContain('[Bonjour]');
    expect(translation.isTranslated('tab')).toBe(true);
    expect(notices.at(-1)).toBe('Translated from French into English. Choose Show original to put it back.');
  });

  it('puts the original back when chosen again', async () => {
    const { translation, scripts } = setup();
    await translation.toggle('tab');
    await translation.toggle('tab');
    expect(scripts.at(-1)).toBe(RESTORE_PAGE_TEXT);
    expect(translation.isTranslated('tab')).toBe(false);
  });

  // Guessing the language would translate English as if it were Dutch; reader view lets someone choose.
  it('says so, and changes nothing, when the page does not say its language', async () => {
    const { translation, translate, notices } = setup({ language: '' });
    await translation.toggle('tab');
    expect(translate).not.toHaveBeenCalled();
    expect(notices.at(-1)).toContain('does not say what language');
  });

  it('leaves an English page alone for an English reader, and translates it for a French one', async () => {
    const english = setup({ language: 'en', reader: 'en' });
    await english.translation.toggle('tab');
    expect(english.translate).not.toHaveBeenCalled();
    const french = setup({ language: 'en', reader: 'fr' });
    await french.translation.toggle('tab');
    expect(french.translate).toHaveBeenCalledWith('en', 'fr', ['Bonjour', 'le monde']);
  });

  it('works through a long page in batches', async () => {
    const texts = Array.from({ length: 450 }, (_unused, index) => `Phrase ${index}`);
    const { translation, translate } = setup({ texts });
    await translation.toggle('tab');
    expect(translate.mock.calls.map((call) => call[2].length)).toEqual([200, 200, 50]);
  });

  it('forgets a translation once the tab goes to a new page', async () => {
    const { translation } = setup();
    await translation.toggle('tab');
    translation.pageChanged('tab', 'committed');
    expect(translation.isTranslated('tab')).toBe(false);
  });
});
