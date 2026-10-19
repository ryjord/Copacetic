// Utils
import { routeFor } from '../../shared/translation/languages';

// Types
import type { TranslationEngine } from './translation-engine';
import type { TranslationModels } from './translation-models';

/** Translates text on this machine, fetching each model the first time a direction needs it. */
export class Translator {
  constructor(
    private readonly models: Pick<TranslationModels, 'buffersFor'>,
    private readonly engine: Pick<TranslationEngine, 'load' | 'isLoaded' | 'translate'>,
  ) {}

  async translate(from: string, to: string, texts: readonly string[]): Promise<string[]> {
    const route = routeFor(from, to);
    if (route.length === 0) {
      throw new Error(`Copacetic cannot translate ${from} into ${to}.`);
    }
    for (const pair of route) {
      if (!this.engine.isLoaded(pair)) {
        await this.engine.load(pair, await this.models.buffersFor(pair));
      }
    }
    return this.engine.translate(route, texts);
  }
}
