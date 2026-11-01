// Utils
import {
  COLLECT_PAGE_TEXT,
  MOST_PIECES,
  PAGE_TRANSLATION_WORLD,
  READ_PAGE_LANGUAGE,
  RESTORE_PAGE_TEXT,
  applyTranslationsScript,
} from '../tabs/page-translation-scripts';
import { isWebUrl } from '../../shared/browsing/url';
import { languageName, languageOf, routeFor, targetFor } from '../../shared/translation/languages';
import { detectLanguage } from '../../shared/translation/language-detection';
import { t } from '../../shared/i18n/translate';

// Types
import type { PageChange } from '../tabs/tab-events';
import type { Settings, TabId } from '../../shared/types';
import type { NoticeCentre } from '../notices/notice-centre';
import type { TabManager } from '../tabs/tabs';

interface PageTranslationDeps {
  tabs: Pick<TabManager, 'livePageFor' | 'snapshot'>;
  translation: { translate(from: string, to: string, texts: readonly string[]): Promise<string[]> };
  notices: Pick<NoticeCentre, 'notify' | 'withdraw'>;
  /** The language to translate into: the one the system is set to, as the translation list names it. */
  readerLanguage: () => string;
  settings: () => Pick<Settings, 'offerPageTranslation' | 'neverOfferTranslationFrom'>;
  /** Remembers that pages in this language are never offered again. */
  neverOffer: (language: string) => void;
}

// Enough pieces at once for the engine to work through without one request holding the whole page.
const PIECES_A_BATCH = 200;

/**
 * The page in front translated where it stands, on this machine, as reader view
 * translates an article; chosen again it puts the original back. The language
 * comes from the page's own text where that is plain, and from what the page
 * says it is in otherwise.
 */
export class PageTranslation {
  private readonly translated = new Set<TabId>();
  /** Counts each tab's new documents, so a translation that finishes after the page moved on is dropped. */
  private readonly documents = new Map<TabId, number>();
  /** The translation under way in each tab, so choosing again or leaving stops it between batches. */
  private readonly working = new Map<TabId, number>();
  /** Documents already offered, by tab and document, so a page is offered once. */
  private readonly offered = new Set<string>();
  private nextRun = 1;

  constructor(private readonly deps: PageTranslationDeps) {}

  isTranslated(tabId: TabId): boolean {
    return this.translated.has(tabId) || this.working.has(tabId);
  }

  /** A new document has text of its own, so nothing is translated any more; a loaded one may be offered. */
  pageChanged(tabId: TabId, change: PageChange): void {
    if (change === 'committed') {
      this.translated.delete(tabId);
      this.stop(tabId);
      this.documents.set(tabId, this.documentOf(tabId) + 1);
      this.deps.notices.withdraw(this.offerId(tabId));
    }
    if (change === 'loaded') {
      void this.offer(tabId);
    }
  }

  async toggle(tabId: TabId): Promise<void> {
    if (this.isTranslated(tabId)) {
      await this.showOriginal(tabId);
    } else {
      await this.translate(tabId);
    }
  }

  private documentOf(tabId: TabId): number {
    return this.documents.get(tabId) ?? 0;
  }

  private noticeId(tabId: TabId): string {
    return `page-translation-${tabId}`;
  }

  private offerId(tabId: TabId): string {
    return `page-translation-offer-${tabId}`;
  }

  private say(tabId: TabId, message: string, tone: 'info' | 'done' | 'progress' = 'info'): void {
    this.deps.notices.notify({ id: this.noticeId(tabId), tone, key: 'page-translation', message });
  }

  private stop(tabId: TabId): void {
    if (this.working.delete(tabId)) {
      this.deps.notices.withdraw(this.noticeId(tabId));
    }
  }

  /** Offers to translate a page that says it is in another language, once, in the tab in front. */
  private async offer(tabId: TabId): Promise<void> {
    const settings = this.deps.settings();
    const contents = this.deps.tabs.livePageFor(tabId);
    const document = this.documentOf(tabId);
    const offerKey = `${tabId}:${document}`;
    if (
      !settings.offerPageTranslation ||
      !contents ||
      this.deps.tabs.snapshot().activeTabId !== tabId ||
      this.isTranslated(tabId) ||
      this.offered.has(offerKey) ||
      !isWebUrl(contents.getURL())
    ) {
      return;
    }
    this.offered.add(offerKey);
    let declared: unknown = '';
    try {
      declared = await contents.executeJavaScriptInIsolatedWorld(PAGE_TRANSLATION_WORLD, [
        { code: READ_PAGE_LANGUAGE },
      ]);
    } catch {
      // A page that went before answering is not offered.
    }
    const from = languageOf(typeof declared === 'string' ? declared : '');
    const to = from ? targetFor(from, this.deps.readerLanguage()) : null;
    if (!from || !to || routeFor(from, to).length === 0 || settings.neverOfferTranslationFrom.includes(from)) {
      return;
    }
    if (this.documentOf(tabId) !== document) {
      return;
    }
    this.deps.notices.notify(
      {
        id: this.offerId(tabId),
        tone: 'ask',
        isOffer: true,
        key: 'page-translation-offer',
        message: t('main.pageTranslation.offer', { language: languageName(from), to: languageName(to) }),
        confirm: t('main.pageTranslation.translate'),
      },
      () => void this.translate(tabId),
      () => this.deps.neverOffer(from),
    );
  }

  private async translate(tabId: TabId): Promise<void> {
    this.deps.notices.withdraw(this.offerId(tabId));
    const contents = this.deps.tabs.livePageFor(tabId);
    if (!contents) {
      this.say(tabId, t('main.pageTranslation.noPage'));
      return;
    }
    const document = this.documentOf(tabId);
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
    if (texts.length === 0) {
      this.say(tabId, t('main.pageTranslation.noText'));
      return;
    }
    const languageTag: unknown = Reflect.get(Object(found), 'language');
    // The text is read before the tag: many sites keep a template's lang="en" whatever they publish.
    const from = detectLanguage(texts) ?? languageOf(typeof languageTag === 'string' ? languageTag : '');
    if (!from) {
      this.say(tabId, t('main.pageTranslation.noLanguage'));
      return;
    }
    const to = targetFor(from, this.deps.readerLanguage());
    if (!to || routeFor(from, to).length === 0) {
      this.say(tabId, t('main.pageTranslation.unsupported', { language: languageName(from) }));
      return;
    }
    const run = this.nextRun;
    this.nextRun += 1;
    this.working.set(tabId, run);
    const names = { from: languageName(from), to: languageName(to) };
    this.say(tabId, t('main.pageTranslation.working', names), 'progress');
    const isStillWanted = () =>
      this.working.get(tabId) === run &&
      this.deps.tabs.livePageFor(tabId) === contents &&
      this.documentOf(tabId) === document;
    try {
      let applied = 0;
      // One batch at a time, written in as it comes, so the top of a long page changes in seconds rather than minutes.
      for (let offset = 0; offset < texts.length; offset += PIECES_A_BATCH) {
        const translations = await this.deps.translation.translate(
          from,
          to,
          texts.slice(offset, offset + PIECES_A_BATCH),
        );
        // The page in the tab may have changed while the engine worked; writing into another would be wrong.
        if (!isStillWanted()) {
          if (this.working.get(tabId) === run) {
            this.stop(tabId);
          }
          return;
        }
        const written: unknown = await contents.executeJavaScriptInIsolatedWorld(PAGE_TRANSLATION_WORLD, [
          { code: applyTranslationsScript(translations, offset) },
        ]);
        applied += typeof written === 'number' ? written : 0;
        const done = Math.min(offset + PIECES_A_BATCH, texts.length);
        if (done < texts.length) {
          this.say(
            tabId,
            t('main.pageTranslation.workingPart', { ...names, percent: Math.round((done / texts.length) * 100) }),
            'progress',
          );
        }
      }
      this.working.delete(tabId);
      if (applied === 0) {
        this.say(tabId, t('main.pageTranslation.failed'));
        return;
      }
      this.translated.add(tabId);
      this.say(tabId, t('main.pageTranslation.done', names), 'done');
    } catch (error) {
      if (this.working.get(tabId) === run) {
        this.working.delete(tabId);
        this.say(tabId, error instanceof Error ? error.message : t('main.pageTranslation.failed'));
      }
    }
  }

  private async showOriginal(tabId: TabId): Promise<void> {
    this.translated.delete(tabId);
    this.stop(tabId);
    try {
      await this.deps.tabs
        .livePageFor(tabId)
        ?.executeJavaScriptInIsolatedWorld(PAGE_TRANSLATION_WORLD, [{ code: RESTORE_PAGE_TEXT }]);
    } catch {
      // A page that went meanwhile is its original already.
    }
  }
}
