import { describe, expect, it, vi } from 'vitest';

const popups: { label?: string }[][] = [];
vi.mock('electron', () => ({
  Menu: { buildFromTemplate: (items: { label?: string }[]) => ({ popup: () => popups.push(items) }) },
  clipboard: { writeText: () => {} },
  dialog: { showMessageBox: async () => ({ response: 1 }) },
  shell: { openExternal: async () => {} },
}));

const { showFillMenu } = await import('../../../../electron/main/menus/context-menu');

function fakeBrowser(entries: { id: string; username: string }[]) {
  const filled: string[] = [];
  return {
    filled,
    browser: {
      window: {},
      passwords: {
        offerFor: () => ({ entries, refusal: '' }),
        fill: async (_tabId: string, entryId: string) => {
          filled.push(entryId);
          return '';
        },
      },
    } as never,
  };
}

describe('the key in the address bar', () => {
  it('fills the only saved password at once', async () => {
    const { browser, filled } = fakeBrowser([{ id: 'one', username: 'riley' }]);
    await showFillMenu(browser, 'tab', 0, 0);
    expect(filled).toEqual(['one']);
  });

  it('asks which, when the site has several', async () => {
    popups.length = 0;
    const { browser, filled } = fakeBrowser([
      { id: 'one', username: 'riley' },
      { id: 'two', username: 'work' },
    ]);
    await showFillMenu(browser, 'tab', 0, 0);
    expect(filled).toEqual([]);
    expect(popups[0]?.map((item) => item.label)).toEqual(['riley', 'work']);
  });
});
