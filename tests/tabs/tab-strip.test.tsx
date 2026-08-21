import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { TabState } from '../../electron/shared/types';
import { TabStrip } from '../../src/components/chrome/TabStrip/TabStrip';

const activate = vi.fn();
const close = vi.fn();

// The bridge is absent outside Electron, so stub it to record what the strip
// asks the main process to do.
vi.mock('@/lib/bridge', () => ({
  send: (action: (api: unknown) => void) => action({ tabs: { activate, close, create: vi.fn(), move: vi.fn() } }),
  ask: async () => [],
  getBridge: () => null,
  isRunningInShell: () => false,
}));

function tab(id: string, title: string): TabState {
  return {
    id,
    url: `https://${id}.example/`,
    displayUrl: `https://${id}.example/`,
    title,
    faviconDataUrl: null,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    isAudible: false,
    isMuted: false,
    security: { level: 'secure', scheme: 'https', host: `${id}.example`, detail: '', certificate: null },
    error: null,
    blockedCount: 0,
    loadMs: null,
    zoomFactor: 1,
    isStartPage: false,
    isBookmarked: false,
  };
}

const TABS = [tab('one', 'One'), tab('two', 'Two'), tab('three', 'Three')];

afterEach(() => {
  cleanup();
  activate.mockClear();
  close.mockClear();
});

describe('the tab strip is reachable by keyboard', () => {
  it('is a tablist, so assistive technology knows what it is', () => {
    render(<TabStrip tabs={TABS} activeTabId="one" />);
    expect(screen.getByRole('tablist')).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  // Roving tabindex: one stop for the strip, not one per tab. Thirty tabs must
  // not mean thirty presses to get past them.
  it('gives exactly one tab stop, on the selected tab', () => {
    render(<TabStrip tabs={TABS} activeTabId="two" />);
    const stops = screen.getAllByRole('tab').filter((el) => el.getAttribute('tabindex') === '0');
    expect(stops).toHaveLength(1);
    expect(stops[0]?.textContent).toContain('Two');
  });

  it.each([
    ['ArrowRight', 'two'],
    ['ArrowLeft', 'three'],
    ['End', 'three'],
    ['Home', 'one'],
  ])('moves selection with %s', (key, expected) => {
    render(<TabStrip tabs={TABS} activeTabId="one" />);
    fireEvent.keyDown(screen.getByRole('tablist'), { key });
    expect(activate).toHaveBeenCalledWith(expected);
  });

  it('wraps around rather than stopping at the ends', () => {
    render(<TabStrip tabs={TABS} activeTabId="three" />);
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(activate).toHaveBeenCalledWith('one');
  });

  it('closes the selected tab with Delete', () => {
    render(<TabStrip tabs={TABS} activeTabId="two" />);
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'Delete' });
    expect(close).toHaveBeenCalledWith('two');
  });

  it('activates on Enter and Space', () => {
    render(<TabStrip tabs={TABS} activeTabId="one" />);
    const third = screen.getAllByRole('tab')[2]!;
    fireEvent.keyDown(third, { key: 'Enter' });
    expect(activate).toHaveBeenCalledWith('three');
  });

  it('does nothing on a key it does not handle', () => {
    render(<TabStrip tabs={TABS} activeTabId="one" />);
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'a' });
    expect(activate).not.toHaveBeenCalled();
  });
});
