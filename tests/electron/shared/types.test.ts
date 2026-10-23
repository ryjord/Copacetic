import { describe, expect, it } from 'vitest';
import { readToolbarItems } from '../../../electron/shared/types';

describe('the toolbar buttons someone chose', () => {
  // Reader view moved to the address bar alone; a choice saved before that is read without it.
  it('drops one the toolbar no longer offers, and keeps the rest in the toolbar’s order', () => {
    expect(readToolbarItems(['downloads', 'reader', 'home'])).toEqual(['home', 'downloads']);
  });

  it('is nothing to read from something that is not a list', () => {
    expect(readToolbarItems('reader')).toBeNull();
  });
});
