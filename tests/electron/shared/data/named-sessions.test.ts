import { describe, expect, it } from 'vitest';
import { defaultSessionName } from '../../../../electron/shared/data/named-sessions';

describe('defaultSessionName', () => {
  it('is named after the first tab, and counts the rest', () => {
    expect(
      defaultSessionName([
        { url: 'https://github.com/', title: 'GitHub' },
        { url: 'https://example.com/', title: 'Example' },
        { url: 'https://example.org/', title: '' },
      ]),
    ).toBe('GitHub and 2 more');
  });

  it('falls back to the address when a page has no title', () => {
    expect(defaultSessionName([{ url: 'https://example.com/', title: '' }])).toBe('https://example.com/');
  });
});
