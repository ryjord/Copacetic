// Libs
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';

// Components
import { TabStrip } from '@/components/shell/TabStrip/TabStrip';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Types
import type { TabState } from '@shared/types';

const activate = vi.fn();
const close = vi.fn();
const move = vi.fn();
const setForTab = vi.fn();
const openNewTabMenu = vi.fn();
const replaceSplitPane = vi.fn();

// The bridge is absent outside Electron, so stub it to record what the strip
// asks the main process to do.
vi.mock('@/lib/bridge/bridge', () => ({
  send: (action: (api: unknown) => void) =>
    action({
      tabs: { activate, close, create: vi.fn(), move, openNewTabMenu, replaceSplitPane },
      groups: { setForTab },
    }),
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
    isPinned: false,
    isAsleep: false,
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
    internalPage: null,
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
  openNewTabMenu.mockClear();
  replaceSplitPane.mockClear();
  useBrowserStore.setState({ split: null });
});

/** A drag event over a tab 100px wide, at a fraction of the way across it; jsdom lays nothing out and drops clientX. */
function dragAcross(element: HTMLElement, type: 'dragOver' | 'drop', fraction: number) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 100 } as DOMRect);
  const event = createEvent[type](element);
  Object.defineProperty(event, 'clientX', { value: fraction * 100 });
  fireEvent(element, event);
}

describe('dragging a tab into a split', () => {
  const showSplit = () => useBrowserStore.setState({ split: { leftId: 'one', rightId: 'two', ratio: 0.5 } });

  it('shows a tab dropped onto the middle of a split tab in that half', () => {
    showSplit();
    render(<TabStrip tabs={TABS} activeTabId="one" groups={[]} />);
    const pane = screen.getByRole('tab', { name: /Two/ });
    fireEvent.dragStart(screen.getByRole('tab', { name: /Three/ }));
    dragAcross(pane, 'dragOver', 0.5);
    dragAcross(pane, 'drop', 0.5);

    expect(replaceSplitPane).toHaveBeenCalledWith('two', 'three');
    expect(move).not.toHaveBeenCalled();
  });

  it('still just moves a tab dropped on the edge of a split tab', () => {
    showSplit();
    render(<TabStrip tabs={TABS} activeTabId="one" groups={[]} />);
    const pane = screen.getByRole('tab', { name: /Two/ });
    fireEvent.dragStart(screen.getByRole('tab', { name: /Three/ }));
    dragAcross(pane, 'drop', 0.1);

    expect(replaceSplitPane).not.toHaveBeenCalled();
    expect(move).toHaveBeenCalledWith('three', 1);
  });

  // One half dropped on the other has nowhere new to go; swapping them by accident would be a surprise.
  it('does not let a split tab take its partner’s half', () => {
    showSplit();
    render(<TabStrip tabs={TABS} activeTabId="one" groups={[]} />);
    fireEvent.dragStart(screen.getByRole('tab', { name: /One/ }));
    dragAcross(screen.getByRole('tab', { name: /Two/ }), 'drop', 0.5);

    expect(replaceSplitPane).not.toHaveBeenCalled();
  });

  it('does nothing special on the middle of a tab outside any split', () => {
    render(<TabStrip tabs={TABS} activeTabId="one" groups={[]} />);
    fireEvent.dragStart(screen.getByRole('tab', { name: /Three/ }));
    dragAcross(screen.getByRole('tab', { name: /Two/ }), 'drop', 0.5);

    expect(replaceSplitPane).not.toHaveBeenCalled();
    expect(move).toHaveBeenCalledWith('three', 1);
  });
});

/**
 * A drop only decides a tab's group because of where it comes to rest. A tab
 * dropped where it already was has not come to rest anywhere new, so nothing
 * about it may be re-decided - otherwise a tab deliberately left ungrouped
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
  // Roving tabindex: one stop for the strip, not one per tab. Thirty tabs must
  // not mean thirty presses to get past them.
  it('gives exactly one tab stop, on the selected tab', () => {
    render(<TabStrip tabs={TABS} groups={[]} activeTabId="two" />);
    const stops = screen.getAllByRole('tab').filter((el) => el.getAttribute('tabindex') === '0');
    expect(stops).toHaveLength(1);
    expect(stops[0]?.textContent).toContain('Two');
  });

  it.each([
    { key: 'ArrowRight', activeTabId: 'one', expected: 'two' },
    { key: 'ArrowLeft', activeTabId: 'one', expected: 'three' },
    { key: 'End', activeTabId: 'one', expected: 'three' },
    { key: 'Home', activeTabId: 'three', expected: 'one' },
    { key: 'ArrowRight', activeTabId: 'three', expected: 'one' },
  ])('moves selection to $expected with $key from $activeTabId', ({ key, activeTabId, expected }) => {
    render(<TabStrip tabs={TABS} groups={[]} activeTabId={activeTabId} />);
    fireEvent.keyDown(screen.getByRole('tablist'), { key });
    expect(activate).toHaveBeenCalledWith(expected);
  });

  it('closes the selected tab with Delete', () => {
    render(<TabStrip tabs={TABS} groups={[]} activeTabId="two" />);
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'Delete' });
    expect(close).toHaveBeenCalledWith('two');
  });

  it.each(['Enter', ' '])('activates on the %j key', (key) => {
    render(<TabStrip tabs={TABS} groups={[]} activeTabId="one" />);
    const third = screen.getAllByRole('tab')[2]!;
    fireEvent.keyDown(third, { key });
    expect(activate).toHaveBeenCalledWith('three');
  });
});

describe('a tab in the strip names its state', () => {
  // A compressed or dimmed tab shows little text, so the name has to carry what the tint shows.
  it.each([
    { state: 'Hush', flags: { isHush: true }, name: 'Mail, Hush tab' },
    { state: 'pinned', flags: { isPinned: true }, name: 'Mail, pinned' },
    { state: 'asleep', flags: { isAsleep: true }, name: 'Mail, asleep' },
  ])('says it is $state, not only in its look', ({ flags, name }) => {
    render(<TabStrip tabs={[{ ...tab('one', 'Mail'), ...flags }]} groups={[]} activeTabId="two" />);
    expect(screen.getByRole('tab', { name })).toBeTruthy();
  });
});

describe('the new tab button', () => {
  it('offers the other ways to open a tab on a right-click', () => {
    render(<TabStrip tabs={TABS} groups={[]} activeTabId="one" />);
    fireEvent.contextMenu(screen.getByRole('button', { name: 'New tab' }));
    expect(openNewTabMenu).toHaveBeenCalledTimes(1);
  });
});
