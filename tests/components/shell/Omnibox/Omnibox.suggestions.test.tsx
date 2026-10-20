import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { TabState } from '../../../../electron/shared/types';

const remove = vi.fn();
const api = {
  history: { remove },
  omnibox: {
    showSuggestions: () => {},
    suggest: async () => [
      {
        id: 'resolve:search',
        kind: 'search',
        target: 'https://search.example/?q=ex',
        title: 'ex',
        subtitle: '',
        faviconDataUrl: null,
      },
      {
        id: 'h1',
        kind: 'history',
        target: 'https://example.com/',
        title: 'Example',
        subtitle: '',
        faviconDataUrl: null,
      },
    ],
  },
  vault: { countForTab: async () => 0 },
  tabs: { navigate: () => {} },
};
vi.mock('@/lib/bridge/bridge', () => ({
  send: (call: (bridge: typeof api) => unknown) => call(api),
  ask: async (call: (bridge: typeof api) => Promise<unknown>) => call(api),
  getBridge: () => null,
  isRunningInShell: () => false,
}));

const { Omnibox } = await import('@/components/shell/Omnibox/Omnibox');

function tab(id: string, url: string): TabState {
  return {
    id,
    url,
    displayUrl: url,
    title: url,
    faviconDataUrl: null,
    groupId: null,
    isHush: false,
    isPinned: false,
    isAsleep: false,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    isAudible: false,
    isMuted: false,
    security: {
      level: 'secure',
      scheme: 'https',
      host: 'example.com',
      detail: 'Encrypted.',
      certificate: null,
      certificateChange: 'none',
    },
    error: null,
    blockedCount: 0,
    loadMs: 120,
    zoomFactor: 1,
    isStartPage: false,
    isBookmarked: false,
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('forgetting a suggestion', () => {
  // A page that keeps coming up can be taken out of history from the list itself.
  it('removes a history suggestion on Shift+Delete, and only a history one', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<Omnibox tab={tab('t1', 'https://example.org/')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Address and search' }));
    const field = screen.getByRole('combobox');
    fireEvent.change(field, { target: { value: 'ex' } });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    fireEvent.keyDown(field, { key: 'Delete', shiftKey: true });
    expect(remove).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    fireEvent.keyDown(field, { key: 'Delete', shiftKey: true });
    expect(remove).toHaveBeenCalledWith('h1');
  });
});
