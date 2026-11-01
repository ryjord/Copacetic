/**
 * The languages Mozilla publishes models for, into and out of English, as of
 * October 2026. Shown without asking Mozilla anything; whether a model exists
 * is settled when someone translates and the records are read.
 */
const INTO_ENGLISH =
  'af ar az be bg bn bs ca cs da de el es et eu fa fi fr gl gu he hi hr hu id is it kn lt lv ml mr ms nb nl pl pt ro ru sk sl sq sr sv ta te th tl tr ug uk ur vi zh-Hant'.split(
    ' ',
  );
const FROM_ENGLISH =
  'af ar az be bg bn bs ca cs da de el es et eu fa fi fr gl gu he hi hr hu id is it ja kn lt lv ml mr ms nb nl pl pt ro sk sl sq sr sv ta te th tl tr ug uk ur vi zh-Hans zh-Hant'.split(
    ' ',
  );

export const ENGLISH = 'en';

/** Every language a translation can come from. */
export const SOURCE_LANGUAGES: readonly string[] = [ENGLISH, ...INTO_ENGLISH];
/** Every language a translation can go into. */
export const TARGET_LANGUAGES: readonly string[] = [ENGLISH, ...FROM_ENGLISH];

export function isSourceLanguage(value: unknown): value is string {
  return typeof value === 'string' && SOURCE_LANGUAGES.includes(value);
}

/** What a page in `from` is translated into: the reader's language, or English for a reader whose page is already in theirs. */
export function targetFor(from: string, reader: string): string | null {
  if (reader !== from) {
    return reader;
  }
  return from === ENGLISH ? null : ENGLISH;
}

export interface LanguagePair {
  from: string;
  to: string;
}

/**
 * The models a translation runs through: one when English is either end, two
 * through English otherwise, since every model Mozilla publishes has English on
 * one side. Empty when there is nothing to translate or no way to.
 */
export function routeFor(from: string, to: string): LanguagePair[] {
  if (from === to || !SOURCE_LANGUAGES.includes(from) || !TARGET_LANGUAGES.includes(to)) {
    return [];
  }
  if (from === ENGLISH || to === ENGLISH) {
    return [{ from, to }];
  }
  return [
    { from, to: ENGLISH },
    { from: ENGLISH, to },
  ];
}

const LANGUAGE_NAMES = new Intl.DisplayNames(['en'], { type: 'language' });

/** A language's name in English, like every other word Copacetic shows; the code itself where it has none. */
export function languageName(code: string): string {
  try {
    return LANGUAGE_NAMES.of(code) ?? code;
  } catch {
    return code;
  }
}

/** A page's declared language, as one this list names, or null: `pt-BR` is Portuguese, `zh-TW` traditional Chinese. */
export function languageOf(tag: string | null | undefined): string | null {
  const lowered = (tag ?? '').trim().toLowerCase();
  if (!lowered) {
    return null;
  }
  if (lowered.startsWith('zh')) {
    return /hant|tw|hk|mo/.test(lowered) ? 'zh-Hant' : 'zh-Hans';
  }
  const base = lowered.split(/[-_]/)[0] ?? '';
  const named = base === 'no' || base === 'nn' ? 'nb' : base;
  return SOURCE_LANGUAGES.includes(named) || TARGET_LANGUAGES.includes(named) ? named : null;
}
