import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { SettingsSurface } from '../../src/views/SettingsSurface/SettingsSurface';
import { SETTINGS_PANES } from '../../src/components/settings/shared/panes';

vi.mock('@/lib/bridge', () => ({
  send: () => {},
  ask: async (_action: unknown, fallback: unknown) => fallback,
  getBridge: () => null,
  isRunningInShell: () => false,
}));

afterEach(cleanup);

const PANES = SETTINGS_PANES.map((pane) => pane.label);

function openPane(label: string) {
  render(<SettingsSurface />);
  fireEvent.click(screen.getByRole('button', { name: label }));
}

/**
 * The whole of Settings was rewritten from one file into a pane per feature,
 * and the repeated markup replaced with shared controls. The functional tests
 * say the right things render; these say they are still operable by someone not
 * using a mouse.
 */
describe('every settings pane stays reachable without a mouse', () => {
  it.each(PANES)('%s gives every control an accessible name', (label) => {
    openPane(label);
    const unnamed = screen
      .getAllByRole('button')
      .filter((button) => (button.textContent ?? '').trim() === '' && !button.getAttribute('aria-label'));
    expect(unnamed).toEqual([]);
  });

  it.each(PANES)('%s names every group of settings with a heading', (label) => {
    openPane(label);
    for (const heading of document.querySelectorAll('h2, h3')) {
      expect((heading.textContent ?? '').trim().length).toBeGreaterThan(0);
    }
  });
});

describe('the section rail', () => {
  it('is a list, so a screen reader can say how many sections there are', () => {
    render(<SettingsSurface />);
    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    expect(within(nav).getAllByRole('listitem')).toHaveLength(SETTINGS_PANES.length);
  });

  // aria-current is what tells someone which section they are actually in;
  // the background colour that shows it is invisible to a screen reader.
  it('marks exactly one section as current at a time', () => {
    render(<SettingsSurface />);
    const marked = () => screen.getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'page');
    expect(marked()).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Privacy' }));
    expect(marked()).toHaveLength(1);
    expect(marked()[0]?.textContent).toBe('Privacy');
  });
});

/**
 * The choice groups replaced three hand-written sets of buttons. Selection
 * there is shown by a border and a background, neither of which a screen
 * reader can see, so aria-pressed is the only thing carrying it.
 */
describe('the choice groups say which option is chosen', () => {
  it('marks one density as pressed and not the other', () => {
    openPane('Appearance');
    const comfortable = screen.getByRole('button', { name: 'Comfortable' });
    const compact = screen.getByRole('button', { name: 'Compact' });
    expect([comfortable, compact].filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
  });

  it('marks exactly one search engine as pressed', () => {
    openPane('Search');
    const engines = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') !== null);
    expect(engines.filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
  });
});

describe('the start page widget list', () => {
  // Two buttons reading "Move up" tell a screen reader user nothing about what
  // they move, so each is named for its widget.
  it('names each reorder button for the widget it moves', () => {
    openPane('Appearance');
    const movers = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'))
      .filter((label): label is string => Boolean(label?.startsWith('Move ')));

    expect(movers.length).toBeGreaterThan(0);
    expect(new Set(movers).size).toBe(movers.length);
    for (const label of movers) {
      expect(label).toMatch(/^Move .+ (up|down)$/);
    }
  });

  it('disables the moves that would go nowhere', () => {
    openPane('Appearance');
    const buttons = screen.getAllByRole('button');
    const firstUp = buttons.find((b) => b.getAttribute('aria-label')?.endsWith(' up'));
    expect(firstUp?.hasAttribute('disabled')).toBe(true);
  });
});
