// A letter, a digit or an underscore, in any script: what a word is made of.
const WORD_CHARACTER = /[\p{L}\p{N}_]/u;

/**
 * Every occurrence of the query in the text, in order and without overlap as
 * Chromium's find counts them, and whether each stands as a whole word. Find
 * in page highlights and steps through all of them; this says which to stop at.
 */
export function wholeWordFlags(text: string, query: string, matchCase: boolean): boolean[] {
  if (!query) {
    return [];
  }
  const haystack = matchCase ? text : text.toLocaleLowerCase();
  const needle = matchCase ? query : query.toLocaleLowerCase();
  const isWordAt = (index: number) => WORD_CHARACTER.test(text.charAt(index));
  const flags: boolean[] = [];
  let from = haystack.indexOf(needle);
  while (from !== -1) {
    flags.push(!isWordAt(from - 1) && !isWordAt(from + needle.length));
    from = haystack.indexOf(needle, from + needle.length);
  }
  return flags;
}

/** The text a page shows, from a DOMSnapshot.captureSnapshot answer: each frame's rendered text, one piece a line. */
export function renderedTextOf(snapshot: unknown): string {
  const strings: unknown = Reflect.get(Object(snapshot), 'strings');
  const documents: unknown = Reflect.get(Object(snapshot), 'documents');
  if (!Array.isArray(strings) || !Array.isArray(documents)) {
    return '';
  }
  return documents
    .flatMap((document: unknown) => {
      const texts: unknown = Reflect.get(Object(Reflect.get(Object(document), 'layout')), 'text');
      return Array.isArray(texts) ? texts : [];
    })
    .map((index: unknown) => (typeof index === 'number' && index >= 0 ? strings[index] : undefined))
    .filter((piece): piece is string => typeof piece === 'string' && piece.length > 0)
    .join('\n');
}

/** Where the active match lands among the whole-word ones, or null when Chromium's count and ours disagree. */
export function wholeWordPosition(
  flags: readonly boolean[],
  activeMatch: number,
  totalMatches: number,
): { isWhole: boolean; activeMatch: number; totalMatches: number } | null {
  if (flags.length !== totalMatches || activeMatch < 1 || activeMatch > totalMatches) {
    return null;
  }
  return {
    isWhole: flags[activeMatch - 1] === true,
    activeMatch: flags.slice(0, activeMatch).filter(Boolean).length,
    totalMatches: flags.filter(Boolean).length,
  };
}
