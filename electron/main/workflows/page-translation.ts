// Utils
import {
  COLLECT_PAGE_TEXT,
  MOST_PIECES,
  PAGE_TRANSLATION_WORLD,
  RESTORE_PAGE_TEXT,
  applyTranslationsScript,
} from '../tabs/page-translation-scripts';
import { ENGLISH, languageOf, routeFor } from '../../shared/translation/languages';
import { t } from '../../shared/i18n/translate';

// Types
import type { PageChange } from '../tabs/tab-events';
import type { TabId } from '../../shared/types';
import type { NoticeCentre } from '../notices/notice-centre';
import type { TabManager } from '../tabs/tabs';

interface PageTranslationDeps {
  tabs: TabManager;
  translation: { translate(from: string, to: string, texts: readonly string[]): Promise<string[]> };
  notices: NoticeCentre;
  /** The language to translate into: the one the system is set to, as the translation list names it. */
  readerLanguage: () => string;
}

// Enough pieces at once for the engine to work through without one request holding the whole page.
const PIECES_A_BATCH = 200;

/** A language's name for a notice, in English like every other word Copacetic shows. */
function nameOf(language: string): string {
  return new Intl.DisplayNames(['en'], { type: 'language' }).of(language) ?? language;
}

/**
 * The page in front translated where it stands, on this machine, as reader view
 * translates an article; chosen again it puts the original back. The language
 * comes from what the page says it is in.
 */
export class PageTranslation {
  private readonly translated = new Set<TabId>();

  constructor(private readonly deps: PageTranslationDeps) {}

  isTranslated(tabId: TabId): boolean {
    return this.translated.has(tabId);
  }

  /** A new document has text of its own, so nothing is translated any more. */
  pageChanged(tabId: TabId, change: PageChange): void {
    if (change === 'committed') {
      this.translated.delete(tabId);
    }
  }

  async toggle(tabId: TabId): Promise<void> {
    if (this.translated.has(tabId)) {
      await this.showOriginal(tabId);
    } else {
      await this.translate(tabId);
    }
  }

  private say(tabId: TabId, message: string, tone: 'info' | 'done' = 'info'): void {
    this.deps.notices.notify({ id: `page-translation-${tabId}`, tone, key: 'page-translation', message });
  }

  private async translate(tabId: TabId): Promise<void> {
    const contents = this.deps.tabs.livePageFor(tabId);
    if (!contents) {
      this.say(tabId, t('main.pageTranslation.noPage'));
      return;
    }
    let found: unknown = null;
    try {
      found = await contents.executeJavaScriptInIsolatedWorld(PAGE_TRANSLATION_WORLD, [{ code: COLLECT_PAGE_TEXT }]);
    } catch {
      // A page that went before answering has nothing to translate.
    }
    const rawTexts: unknown = Reflect.get(Object(found), 'texts');
    const texts = Array.isArray(rawTexts)
      ? rawTexts.slice(0, MOST_PIECES).map((text) => (typeof text === 'string' ? text : ''))
      : [];
    const languageTag: unknown = Reflect.get(Object(found), 'language');
    const from = languageOf(typeof languageTag === 'string' ? languageTag : '');
    if (texts.length === 0) {
      this.say(tabId, t('main.pageTranslation.noText'));
      return;
    }
    if (!from) {
      this.say(tabId, t('main.pageTranslation.noLanguage'));
      return;
    }
    const reader = this.deps.readerLanguage();
    const to = reader === from ? (from === ENGLISH ? null : ENGLISH) : reader;
    if (!to || routeFor(from, to).length === 0) {
      this.say(tabId, t('main.pageTranslation.unsupported', { language: nameOf(from) }));
      return;
    }
    this.say(tabId, t('main.pageTranslation.working', { from: nameOf(from), to: nameOf(to) }));
    try {
      const translations = await this.translateInBatches(from, to, texts);
      // The page in the tab may have changed while the engine worked; writing into another would be wrong.
      if (this.deps.tabs.livePageFor(tabId) !== contents) {
        return;
      }
      await contents.executeJavaScriptInIsolatedWorld(PAGE_TRANSLATION_WORLD, [
        { code: applyTranslationsScript(translations) },
      ]);
      this.translated.add(tabId);
      this.say(tabId, t('main.pageTranslation.done', { from: nameOf(from), to: nameOf(to) }), 'done');
    } catch (error) {
      this.say(tabId, error instanceof Error ? error.message : t('main.pageTranslation.failed'));
    }
  }

  private async translateInBatches(from: string, to: string, texts: readonly string[]): Promise<string[]> {
    const batches = Array.from({ length: Math.ceil(texts.length / PIECES_A_BATCH) }, (_unused, index) =>
      texts.slice(index * PIECES_A_BATCH, (index + 1) * PIECES_A_BATCH),
    );
    const translated: string[] = [];
    // One batch at a time, so the first use's model download happens once and the engine is not flooded.
    for (const batch of batches) {
      translated.push(...(await this.deps.translation.translate(from, to, batch)));
    }
    return translated;
  }

  private async showOriginal(tabId: TabId): Promise<void> {
    this.translated.delete(tabId);
    try {
      await this.deps.tabs
        .livePageFor(tabId)
        ?.executeJavaScriptInIsolatedWorld(PAGE_TRANSLATION_WORLD, [{ code: RESTORE_PAGE_TEXT }]);
    } catch {
      // A page that went meanwhile is its original already.
    }
  }
}
