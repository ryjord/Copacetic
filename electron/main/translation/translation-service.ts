// Libs
import { app } from 'electron';
import path from 'node:path';

// Utils
import { TranslationEngine } from './translation-engine';
import { TranslationModels } from './translation-models';
import { Translator } from './translator';

// Types
import type { ModelFetch } from './translation-models';
import { t } from '../../shared/i18n/translate';

/** The response body, read only as far as the cap allows. */
async function readCapped(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.ok) {
    throw new Error(t('main.translation.mozillaAnswered', { status: response.status }));
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error(t('main.translation.mozillaSentNothing'));
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return Buffer.concat(chunks);
    }
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(t('main.translation.mozillaSentTooMuch'));
    }
    chunks.push(value);
  }
}

/*
 * Node's own fetch rather than Electron's: Mozilla's model CDN refuses a
 * request that says it is Chrome, and Electron will not let one request say
 * otherwise. So these say what they are, Copacetic, and carry no cookies.
 */
const mozillaFetch: ModelFetch = {
  bytes: async (url, maxBytes) =>
    readCapped(
      await fetch(url, {
        credentials: 'omit',
        redirect: 'error',
        headers: { Accept: 'application/json, */*', 'User-Agent': `Copacetic/${app.getVersion()}` },
      }),
      maxBytes,
    ),
};

/** One translator for the whole app, started the first time someone translates and not before. */
export class TranslationService {
  private translator: Translator | null = null;
  private engine: TranslationEngine | null = null;
  readonly models: TranslationModels;

  constructor(
    private readonly engineDirectory: string,
    modelsDirectory: string,
  ) {
    this.models = new TranslationModels(modelsDirectory, mozillaFetch);
  }

  translate(from: string, to: string, texts: readonly string[]): Promise<string[]> {
    this.engine ??= new TranslationEngine(this.engineDirectory);
    this.translator ??= new Translator(this.models, this.engine);
    return this.translator.translate(from, to, texts);
  }

  /** Models are large; deleting them also stops the engine holding them in memory. */
  removeModels(): void {
    this.dispose();
    this.models.removeAll();
  }

  dispose(): void {
    this.engine?.dispose();
    this.engine = null;
    this.translator = null;
  }
}

export function translationModelsDirectory(userData: string): string {
  return path.join(userData, 'translation-models');
}
