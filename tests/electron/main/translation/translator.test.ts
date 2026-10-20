import { describe, expect, it } from 'vitest';
import { Translator } from '../../../../electron/main/translation/translator';

const fakes = () => {
  const loaded = new Set<string>();
  const fetched: string[] = [];
  const empty = { model: Buffer.alloc(0), shortlist: Buffer.alloc(0), vocabs: [] };
  return {
    fetched,
    models: {
      buffersFor: async ({ from, to }: { from: string; to: string }) => (fetched.push(`${from}-${to}`), empty),
    },
    engine: {
      isLoaded: ({ from, to }: { from: string; to: string }) => loaded.has(`${from}-${to}`),
      load: async ({ from, to }: { from: string; to: string }) => void loaded.add(`${from}-${to}`),
      translate: async (route: readonly { from: string; to: string }[], texts: readonly string[]) =>
        texts.map((text) => `${route.map((pair) => pair.to).join('>')}:${text}`),
    },
  };
};

describe('Translator', () => {
  it('goes through English between two other languages, fetching each model once', async () => {
    const { models, engine, fetched } = fakes();
    const translator = new Translator(models, engine);
    expect(await translator.translate('fr', 'de', ['Bonjour'])).toEqual(['en>de:Bonjour']);
    await translator.translate('fr', 'de', ['Encore']);
    expect(fetched).toEqual(['fr-en', 'en-de']);
  });

  it('refuses a pair it has no way to translate', async () => {
    const { models, engine } = fakes();
    await expect(new Translator(models, engine).translate('fr', 'fr', ['x'])).rejects.toThrow();
  });
});
