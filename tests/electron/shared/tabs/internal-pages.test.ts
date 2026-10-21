import { describe, expect, it } from 'vitest';
import {
  internalAddressOf,
  internalPageOf,
  internalPageTitle,
  internalPageUrl,
} from '../../../../electron/shared/tabs/internal-pages';

describe('the address of one of our pages', () => {
  it.each([
    ['copacetic://start', { page: 'start', section: null }],
    ['copacetic://settings', { page: 'settings', section: null }],
    ['copacetic://settings/sites', { page: 'settings', section: 'sites' }],
    ['copacetic://history?q=x#top', { page: 'history', section: null }],
    ['copacetic://downloads/', { page: 'downloads', section: null }],
  ])('reads %s', (url, expected) => {
    expect(internalAddressOf(url)).toEqual(expected);
  });

  // A section is a name, never a path: anything else is dropped rather than carried along.
  it.each(['copacetic://settings/../../etc', 'copacetic://settings/Sites', 'copacetic://settings/a1'])(
    'drops a section that is not a plain name in %s',
    (url) => {
      expect(internalAddressOf(url)?.section).toBeNull();
    },
  );

  it.each(['copacetic://nonsense', 'https://example.com/settings', 'about:blank', ''])(
    'is not one of ours for %s',
    (url) => {
      expect(internalPageOf(url)).toBeNull();
    },
  );

  it('is written the way it is read, and the start page has the one address', () => {
    expect(internalPageUrl('settings', 'privacy')).toBe('copacetic://settings/privacy');
    expect(internalPageUrl('history')).toBe('copacetic://history');
    expect(internalPageUrl('start', 'ignored')).toBe('copacetic://start');
    expect(internalPageUrl('settings', '../x')).toBe('copacetic://settings');
  });

  it.each(['start', 'settings', 'history', 'bookmarks', 'downloads'] as const)('names the tab for %s', (page) => {
    expect(internalPageTitle(page)).not.toBe('');
  });
});
