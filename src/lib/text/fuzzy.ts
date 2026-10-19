/**
 * How well a label matches what was typed, or null when it does not.
 *
 * Whole words beat the start of a word, which beats letters in order: "set"
 * finds Settings first, "nht" still finds New Hush tab, and a substring buried
 * in the middle of a word ranks below both.
 */
export function matchScore(label: string, query: string): number | null {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return 0;
  }
  const haystack = label.toLowerCase();

  if (haystack.startsWith(needle)) {
    return 100 - haystack.length / 100;
  }
  const words = haystack.split(/[\s/.:-]+/);
  if (words.some((word) => word.startsWith(needle))) {
    return 80 - haystack.length / 100;
  }
  if (haystack.includes(needle)) {
    return 60 - haystack.indexOf(needle) / 10;
  }

  // Letters in order, with a bonus for each that starts a word: "nht" for New Hush tab.
  let position = 0;
  let starts = 0;
  for (const letter of needle) {
    const found = haystack.indexOf(letter, position);
    if (found === -1) {
      return null;
    }
    if (found === 0 || /[\s/.:-]/.test(haystack[found - 1] ?? '')) {
      starts += 1;
    }
    position = found + 1;
  }
  return 20 + starts * 5 - position / 100;
}

/** The items that match, best first, keeping their own order between equals. */
export function rankByMatch<Item>(items: readonly Item[], query: string, labelOf: (item: Item) => string): Item[] {
  return items
    .map((item, index) => ({ item, index, score: matchScore(labelOf(item), query) }))
    .filter((entry): entry is { item: Item; index: number; score: number } => entry.score !== null)
    .sort((aEntry, bEntry) => bEntry.score - aEntry.score || aEntry.index - bEntry.index)
    .map((entry) => entry.item);
}
