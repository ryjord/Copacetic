import { describe, expect, it, vi } from 'vitest';
import { PageTranslation } from '../../../../electron/main/workflows/page-translation';
import {
  PAGE_TRANSLATION_WORLD,
  READ_PAGE_LANGUAGE,
  RESTORE_PAGE_TEXT,
} from '../../../../electron/main/tabs/page-translation-scripts';

// Types
import type { Notice } from '../../../../electron/shared/chrome/notices';

type Deps = ConstructorParameters<typeof PageTranslation>[0];

const PORTUGUESE =
  'O governo disse nesta terça-feira que a nova ponte não vai abrir antes da primavera, porque as obras na margem do rio demoraram mais do que o previsto. Os moradores que usam a travessia antiga todos os dias foram avisados de que haverá atrasos.';

interface Setup {
  language?: string;
  texts?: string[];
  reader?: string;
  url?: string;
  activeTabId?: string;
  settings?: Partial<ReturnType<Deps['settings']>>;
}

function setup({
  language = 'fr',
  texts = ['Bonjour', 'le monde'],
  reader = 'en',
  url = 'https://example.fr/',
  activeTabId = 'tab',
  settings = {},
}: Setup = {}) {
  const scripts: string[] = [];
  const page = {
    getURL: () => url,
    executeJavaScriptInIsolatedWorld: vi.fn(async (world: number, sources: { code: string }[]) => {
      expect(world).toBe(PAGE_TRANSLATION_WORLD);
      const code = sources[0]?.code ?? '';
      scripts.push(code);
      if (code === READ_PAGE_LANGUAGE) {
        return language;
      }
      // The first script reads the page; each one after writes a batch in, and says how many it put back.
      return scripts.filter((script) => script !== READ_PAGE_LANGUAGE).length === 1
        ? { language, texts }
        : Math.min(200, texts.length);
    }),
  };
  const notices: Notice[] = [];
  const answers = new Map<string, { confirm?: () => void; refuse?: () => void }>();
  const translate = vi.fn(async (_from: string, _to: string, batch: readonly string[]) =>
    batch.map((text) => `[${text}]`),
  );
  const neverOffer = vi.fn();
  const deps = {
    tabs: { livePageFor: () => page, snapshot: () => ({ activeTabId }) },
    translation: { translate },
    notices: {
      notify: (notice: Notice, confirm?: () => void, refuse?: () => void) => {
        notices.push(notice);
        answers.set(notice.id, { confirm, refuse });
      },
      withdraw: vi.fn(),
    },
    readerLanguage: () => reader,
    settings: () => ({ offerPageTranslation: true, neverOfferTranslationFrom: [], ...settings }),
    neverOffer,
    // Only what translating a page reaches is faked.
  } as unknown as Deps;
  const messages = () => notices.map((notice) => notice.message);
  return { translation: new PageTranslation(deps), scripts, notices, messages, answers, translate, neverOffer };
}

describe('translating the page in front', () => {
  it('translates from the language the page says into the reader’s, and puts it in place', async () => {
    const { translation, scripts, translate, messages } = setup();
    await translation.toggle('tab');
    expect(translate).toHaveBeenCalledWith('fr', 'en', ['Bonjour', 'le monde']);
    expect(scripts[1]).toContain('[Bonjour]');
    expect(translation.isTranslated('tab')).toBe(true);
    expect(messages().at(-1)).toBe('Translated from French into English. Choose Show original to put it back.');
  });

  it('puts the original back when chosen again', async () => {
    const { translation, scripts } = setup();
    await translation.toggle('tab');
    await translation.toggle('tab');
    expect(scripts.at(-1)).toBe(RESTORE_PAGE_TEXT);
    expect(translation.isTranslated('tab')).toBe(false);
  });

  // Guessing from a few words would translate English as if it were Dutch.
  it('says so, and changes nothing, when the page does not say its language and has too little text to tell', async () => {
    const { translation, translate, messages } = setup({ language: '' });
    await translation.toggle('tab');
    expect(translate).not.toHaveBeenCalled();
    expect(messages().at(-1)).toContain('does not say what language');
  });

  it('reads the language from the text of a page that does not say it', async () => {
    const { translation, translate } = setup({ language: '', texts: [PORTUGUESE] });
    await translation.toggle('tab');
    expect(translate).toHaveBeenCalledWith('pt', 'en', [PORTUGUESE]);
  });

  // publico.pt says lang="en" on pages written in Portuguese.
  it('believes the text over a page that says the wrong language', async () => {
    const { translation, translate } = setup({ language: 'en', texts: [PORTUGUESE] });
    await translation.toggle('tab');
    expect(translate).toHaveBeenCalledWith('pt', 'en', [PORTUGUESE]);
  });

  it('leaves an English page alone for an English reader, and translates it for a French one', async () => {
    const english = setup({ language: 'en', reader: 'en' });
    await english.translation.toggle('tab');
    expect(english.translate).not.toHaveBeenCalled();
    const french = setup({ language: 'en', reader: 'fr' });
    await french.translation.toggle('tab');
    expect(french.translate).toHaveBeenCalledWith('en', 'fr', ['Bonjour', 'le monde']);
  });

  it('works through a long page in batches, writing each in where it belongs as it arrives', async () => {
    const texts = Array.from({ length: 450 }, (_unused, index) => `Phrase ${index}`);
    const { translation, translate, scripts } = setup({ texts });
    await translation.toggle('tab');
    expect(translate.mock.calls.map((call) => call[2].length)).toEqual([200, 200, 50]);
    const writes = scripts.slice(1);
    expect(writes).toHaveLength(3);
    expect(writes.map((script) => /const offset = (\d+);/.exec(script)?.[1])).toEqual(['0', '200', '400']);
  });

  // The engine can take a minute on a long page or a first download; a notice that times out reads as nothing happening.
  it('says it is working until it finishes, with how far it has got', async () => {
    const texts = Array.from({ length: 450 }, (_unused, index) => `Phrase ${index}`);
    const { translation, notices } = setup({ texts });
    await translation.toggle('tab');
    expect(notices.map((notice) => notice.tone)).toEqual(['progress', 'progress', 'progress', 'done']);
    expect(notices[1]?.message).toContain('44% done');
  });

  it('stops between batches when Show original is chosen while it works', async () => {
    const texts = Array.from({ length: 450 }, (_unused, index) => `Phrase ${index}`);
    const { translation, translate } = setup({ texts });
    translate.mockImplementationOnce(async (_from, _to, batch) => {
      void translation.toggle('tab');
      return batch.map((text) => `[${text}]`);
    });
    await translation.toggle('tab');
    expect(translate).toHaveBeenCalledTimes(1);
    expect(translation.isTranslated('tab')).toBe(false);
  });

  it('forgets a translation once the tab goes to a new page', async () => {
    const { translation } = setup();
    await translation.toggle('tab');
    translation.pageChanged('tab', 'committed');
    expect(translation.isTranslated('tab')).toBe(false);
  });
});

describe('offering to translate a page', () => {
  const offersIn = (notices: Notice[]) => notices.filter((notice) => notice.key === 'page-translation-offer');

  it('offers once a page in another language has loaded, without taking the keyboard, and translates on yes', async () => {
    const { translation, notices, answers, translate, scripts } = setup({ language: 'pt-BR', texts: [PORTUGUESE] });
    translation.pageChanged('tab', 'loaded');
    await vi.waitFor(() => expect(offersIn(notices)).toHaveLength(1));
    const [offer] = offersIn(notices);
    expect(offer).toMatchObject({ tone: 'ask', isOffer: true, confirm: 'Translate' });
    expect(offer?.message).toBe('This page is in Portuguese. Translate it into English, on this machine?');
    // Only the declared language is read to make the offer.
    expect(scripts).toEqual([READ_PAGE_LANGUAGE]);

    answers.get(offer?.id ?? '')?.confirm?.();
    await vi.waitFor(() => expect(translate).toHaveBeenCalledWith('pt', 'en', [PORTUGUESE]));
  });

  it('offers a page once, however many times it reports loading', async () => {
    const { translation, notices } = setup({ language: 'de' });
    translation.pageChanged('tab', 'loaded');
    translation.pageChanged('tab', 'loaded');
    await vi.waitFor(() => expect(offersIn(notices)).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(offersIn(notices)).toHaveLength(1);
  });

  it('never offers that language again once the offer is turned down', async () => {
    const { translation, notices, answers, neverOffer } = setup({ language: 'de' });
    translation.pageChanged('tab', 'loaded');
    await vi.waitFor(() => expect(offersIn(notices)).toHaveLength(1));
    answers.get(offersIn(notices)[0]?.id ?? '')?.refuse?.();
    expect(neverOffer).toHaveBeenCalledWith('de');
  });

  it.each<[string, Setup]>([
    ['offers are turned off', { language: 'de', settings: { offerPageTranslation: false } }],
    ['the language was turned down before', { language: 'de', settings: { neverOfferTranslationFrom: ['de'] } }],
    ['the page is in the reader’s language', { language: 'en-GB' }],
    ['the page says no language', { language: '' }],
    ['the language cannot be translated here', { language: 'ko' }],
    ['the tab is not the one in front', { language: 'de', activeTabId: 'other' }],
    ['the page is one of Copacetic’s own', { language: 'de', url: 'copacetic://settings' }],
  ])('offers nothing when %s', async (_name, options) => {
    const { translation, notices } = setup(options);
    translation.pageChanged('tab', 'loaded');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(offersIn(notices)).toEqual([]);
  });
});
