import { describe, expect, it } from 'vitest';
import { millisecondsFromChromiumTime } from '../../../../electron/main/import/chromium-time';

describe("reading Chromium's clock", () => {
  // 2024-01-01T00:00:00Z, as Chromium writes it in a Bookmarks file.
  it('turns microseconds since 1601 into milliseconds since 1970', () => {
    expect(millisecondsFromChromiumTime('13348540800000000')).toBe(Date.UTC(2024, 0, 1));
  });

  it.each(['', '0', 'soon', null, undefined, -5])('gives nothing for %s', (value) => {
    expect(millisecondsFromChromiumTime(value)).toBeNull();
  });
});
