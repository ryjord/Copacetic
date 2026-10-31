import { describe, expect, it } from 'vitest';
import { renderedTextOf, wholeWordFlags, wholeWordPosition } from '../../../../electron/main/tabs/whole-word';

describe('which occurrences are whole words', () => {
  it('stops at "cat" on its own, and not inside "concatenate" or "cats"', () => {
    expect(wholeWordFlags('cat, concatenate, cats and the cat.', 'cat', false)).toEqual([true, false, false, true]);
  });

  it('counts without overlap, as find in page does', () => {
    expect(wholeWordFlags('aaaa', 'aa', false)).toEqual([false, false]);
  });

  it('follows match case', () => {
    expect(wholeWordFlags('Cat cat', 'cat', true)).toEqual([true]);
    expect(wholeWordFlags('Cat cat', 'cat', false)).toEqual([true, true]);
  });

  // A word is letters and digits in any script, so an accented letter is part of one, not a break in it.
  it('reads letters from any script as part of a word', () => {
    expect(wholeWordFlags('naïve na ïve', 'na', false)).toEqual([false, true]);
  });
});

describe('the text a page shows, from a DOM snapshot', () => {
  it('joins every frame’s rendered text in order, leaving out boxes with none', () => {
    const snapshot = {
      strings: ['', 'Hello', 'world', 'framed'],
      documents: [{ layout: { text: [-1, 1, 2] } }, { layout: { text: [3, 0] } }],
    };
    expect(renderedTextOf(snapshot)).toBe('Hello\nworld\nframed');
  });

  it('is empty for anything that is not a snapshot', () => {
    expect(renderedTextOf(null)).toBe('');
    expect(renderedTextOf({ strings: 'no' })).toBe('');
  });
});

describe('where the active match lands among the whole words', () => {
  const flags = [false, true, false, true];

  it('counts only the whole words, and says whether the active one is', () => {
    expect(wholeWordPosition(flags, 2, 4)).toEqual({ isWhole: true, activeMatch: 1, totalMatches: 2 });
    expect(wholeWordPosition(flags, 3, 4)).toEqual({ isWhole: false, activeMatch: 1, totalMatches: 2 });
  });

  // A page whose text Chromium counts differently cannot be stepped through honestly.
  it('gives up when Chromium found a different number of matches', () => {
    expect(wholeWordPosition(flags, 1, 5)).toBeNull();
  });
});
