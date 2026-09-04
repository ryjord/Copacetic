import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { TabState } from '../../electron/shared/types';
import { TabStrip } from '../../src/components/chrome/TabStrip/TabStrip';

const activate = vi.fn();
const close = vi.fn();
const move = vi.fn();
const setForTab = vi.fn();

// The bridge is absent outside Electron, so stub it to record what the strip
// asks the main process to do.
vi.mock('@/lib/bridge', () => ({
  send: (action: (api: unknown) => void) =>
    action({ tabs: { activate, close, create: vi.fn(), move }, groups: { setForTab } }),
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
    isHush: false,
    isAudible: false,
    isMuted: false,
    security: {
      level: 'secure',
      scheme: 'https',
      host: `${id}.example`,
      detail: '',
      certificate: null,
      certificateChange: 'none',
    },
    error: null,
    blockedCount: 0,
    loadMs: null,
    zoomFactor: 1,
    isStartPage: false,
    isBookmarked: false,
    groupId: null,
  };
}

const grouped = (id: string, title: string, groupId: string | null): TabState => ({
  ...tab(id, title),
  groupId,
});

const TABS = [tab('one', 'One'), tab('two', 'Two'), tab('three', 'Three')];

afterEach(() => {
  cleanup();
  activate.mockClear();
  close.mockClear();
  move.mockClear();
  setForTab.mockClear();
});

/**
 * A drop only decides a tab's group because of where it comes to rest. A tab
 * dropped where it already was has not come to rest anywhere new, so nothing
 * about it may be re-decided — otherwise a tab deliberately left ungrouped
 * between two of a group's tabs is swallowed by the smallest twitch of a mouse.
 */
describe('dropping a tab where it already was', () => {
  const between = [grouped('one', 'One', 'g1'), grouped('two', 'Two', null), grouped('three', 'Three', 'g1')];

  it('does not move it and does not change its group', () => {
    render(<TabStrip tabs={between} activeTabId="two" groups={[]} />);
    const parked = screen.getByRole('tab', { name: /Two/ });
    fireEvent.dragStart(parked);
    fireEvent.dragOver(parked);
    fireEvent.drop(parked);

    expect(move).not.toHaveBeenCalled();
    expect(setForTab).not.toHaveBeenCalled();
  });

  it('still joins a group when it is dropped somewhere else', () => {
    render(<TabStrip tabs={between} activeTabId="three" groups={[]} />);
    fireEvent.dragStart(screen.getByRole('tab', { name: /Three/ }));
    fireEvent.drop(screen.getByRole('tab', { name: /Two/ }));

    expect(move).toHaveBeenCalledWith('three', 1);
    expect(setForTab).toHaveBeenCalledWith('three', null);
  });
});

describe('the tab strip is reachable by keyboard', () => {
  it('is a tablist, so assistive technology knows what it is', () => {
    render(<TabStrip tabs={TABS} groups={[]} activeTabId="one" />);
    expect(screen.getByRole('tablist')).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  // Roving tabindex: one stop for the strip, not one per tab. Thirty tabs must
  // not mean thirty presses to get past them.
  it('gives exactly one tab stop, on the selected tab', () => {
    render(<TabStrip tabs={TABS} groups={[]} activeTabId="two" />);
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
    render(<TabStrip tabs={TABS} groups={[]} activeTabId="one" />);
    fireEvent.keyDown(screen.getByRole('tablist'), { key });
    expect(activate).toHaveBeenCalledWith(expected);
  });

  it('wraps around rather than stopping at the ends', () => {
    render(<TabStrip tabs={TABS} groups={[]} activeTabId="three" />);
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(activate).toHaveBeenCalledWith('one');
  });

  it('closes the selected tab with Delete', () => {
    render(<TabStrip tabs={TABS} groups={[]} activeTabId="two" />);
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'Delete' });
    expect(close).toHaveBeenCalledWith('two');
  });

  it('activates on Enter and Space', () => {
    render(<TabStrip tabs={TABS} groups={[]} activeTabId="one" />);
    const third = screen.getAllByRole('tab')[2]!;
    fireEvent.keyDown(third, { key: 'Enter' });
    expect(activate).toHaveBeenCalledWith('three');
  });

  it('does nothing on a key it does not handle', () => {
    render(<TabStrip tabs={TABS} groups={[]} activeTabId="one" />);
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'a' });
    expect(activate).not.toHaveBeenCalled();
  });
});
