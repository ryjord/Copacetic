/** Each one is a dictionary to fetch and a word list every keystroke is checked against. */
export const MOST_SPELLCHECK_LANGUAGES = 2;

const LANGUAGE_CODE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,4})?$/;

/** What the settings pane needs to offer a choice, or to say why there is none. */
export interface SpellcheckChoices {
  /** False on macOS, where the system's own checker picks the language. */
  canChoose: boolean;
  available: string[];
  inUse: string[];
}

/** Only well-formed codes, once each, and no more than can be useful, from the renderer or from disk. */
export function readSpellcheckLanguages(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const codes = value.filter((code): code is string => typeof code === 'string' && LANGUAGE_CODE.test(code));
  return [...new Set(codes)].slice(0, MOST_SPELLCHECK_LANGUAGES);
}

/**
 * The languages to hand Chromium: the ones chosen that it knows, or else the
 * one closest to the system's, because an empty choice means "the language I
 * use", not "none".
 */
export function spellcheckLanguagesFor(
  chosen: readonly string[],
  available: readonly string[],
  locale: string,
): string[] {
  const usable = chosen.filter((code) => available.includes(code));
  if (usable.length > 0) {
    return usable;
  }
  const exact = available.find((code) => code.toLowerCase() === locale.toLowerCase());
  const language = locale.split('-')[0]?.toLowerCase() ?? '';
  const sameLanguage = available.find((code) => code.split('-')[0]?.toLowerCase() === language);
  const closest = exact ?? sameLanguage;
  return closest ? [closest] : [];
}
