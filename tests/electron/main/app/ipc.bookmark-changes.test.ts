import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: () => {}, removeHandler: () => {} },
  app: { getPath: () => '/tmp' },
}));

const { asBookmarkChanges } = await import('../../../../electron/main/app/ipc');

describe('a bookmark edit from the renderer', () => {
  // Typed into the same kind of box as the address bar, so it is read the same way.
  it('reads a bare host as an address', () => {
    expect(asBookmarkChanges({ url: 'example.com/page' }).url).toBe('https://example.com/page');
  });

  // Saving a search results page in place of the address someone meant would look like it worked.
  it('turns words that read as a search into nothing, to be refused', () => {
    expect(asBookmarkChanges({ url: 'my favourite site' }).url).toBe('');
  });

  it('passes a title through and leaves out what was not sent', () => {
    expect(asBookmarkChanges({ title: 'Mail' })).toEqual({ title: 'Mail' });
  });

  it('ignores anything of the wrong shape', () => {
    expect(asBookmarkChanges('nonsense')).toEqual({});
    expect(asBookmarkChanges({ title: 4, url: null })).toEqual({});
  });
});
