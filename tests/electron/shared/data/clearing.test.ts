import { describe, expect, it } from 'vitest';

import { defaultClearChoice, readClearChoice } from '../../../../electron/shared/data/clearing';

describe('readClearChoice', () => {
  it('keeps three booleans and nothing else', () => {
    expect(readClearChoice({ history: false, siteData: true, cache: 'yes', extra: true }, 'all')).toEqual({
      history: false,
      siteData: true,
      cache: false,
    });
  });

  // An older caller sends only the range, and keeps what the range always meant.
  it('falls back to what the range always meant when no choice is sent', () => {
    expect(readClearChoice(undefined, 'day')).toEqual(defaultClearChoice('day'));
    expect(readClearChoice(null, 'all')).toEqual({ history: true, siteData: true, cache: true });
  });
});
