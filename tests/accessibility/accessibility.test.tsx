import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { TabState } from '../../electron/shared/types';
import { Omnibox } from '@/components/shell/Omnibox/Omnibox';
import { SurfaceShell } from '@/components/shell/SurfaceShell/SurfaceShell';

vi.mock('@/lib/bridge/bridge', () => ({
  send: () => {},
  ask: async (_a: unknown, fallback: unknown) => fallback,
  getBridge: () => null,
  isRunningInShell: () => false,
}));

const tab = (): TabState => ({
  id: 'a',
  url: 'https://example.com/',
  displayUrl: 'https://example.com/',
  title: 'Example',
  faviconDataUrl: null,
  isLoading: false,
  canGoBack: false,
  canGoForward: false,
  isHush: false,
  isPinned: false,
  isAsleep: false,
  groupId: null,
  isAudible: false,
  isMuted: false,
  security: {
    level: 'secure',
    scheme: 'https',
    host: 'example.com',
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
});

afterEach(cleanup);

describe('the address bar announces itself as a combobox', () => {
  it('is a plain button until it is being edited', () => {
    render(<Omnibox tab={tab()} />);
    expect(screen.getByLabelText('Address and search').tagName).toBe('BUTTON');
  });

  it('becomes a combobox with a list attached', () => {
    render(<Omnibox tab={tab()} />);
    fireEvent.click(screen.getByLabelText('Address and search'));

    const input = screen.getByLabelText('Address and search');
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('aria-controls')).toBe('omnibox-suggestions');
    // Nothing is suggested yet, so it must not claim to be expanded.
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('a surface keeps the keyboard inside it', () => {
  it('is a modal dialog, named by its title', () => {
    render(
      <SurfaceShell title="History">
        <button type="button">Inside</button>
      </SurfaceShell>,
    );

    const dialog = screen.getByRole('dialog', { name: 'History' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  // Without this, Tab walks out of the panel into the page behind it, which is
  // hidden - focus disappears with no visible cause.
  it('moves focus into the panel when it opens', () => {
    render(
      <SurfaceShell title="History">
        <button type="button">Inside</button>
      </SurfaceShell>,
    );

    // The close control carries an icon and an aria-label rather than text, so
    // what matters is that focus is inside the panel and on something focusable.
    const dialog = screen.getByRole('dialog', { name: 'History' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.tagName).toBe('BUTTON');
  });

  it.each([
    ['Tab from the last control back to the first', false, 'last', 'first'],
    ['Shift+Tab from the first control back to the last', true, 'first', 'last'],
  ] as const)('wraps %s', (_caseName, shiftKey, startsAt, endsAt) => {
    render(
      <SurfaceShell title="History">
        <button type="button">Inside</button>
      </SurfaceShell>,
    );

    const dialog = screen.getByRole('dialog', { name: 'History' });
    const focusable = [...dialog.querySelectorAll('button')];
    const edges = { first: focusable[0]!, last: focusable[focusable.length - 1]! };
    edges[startsAt].focus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(edges[endsAt]);
  });

  it('pulls focus back if it somehow ends up outside', () => {
    render(
      <>
        <button type="button">Outside</button>
        <SurfaceShell title="History">
          <button type="button">Inside</button>
        </SurfaceShell>
      </>,
    );

    screen.getByText('Outside').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('dialog', { name: 'History' }).contains(document.activeElement)).toBe(true);
  });
});

describe('the live region says what happened elsewhere', () => {
  const announce = async () => {
    const { LiveAnnouncer } = await import('@/components/shell/LiveAnnouncer/LiveAnnouncer');
    const { useBrowserStore } = await import('@/store/useBrowserStore');
    return { LiveAnnouncer, useBrowserStore };
  };

  it('is polite, so it waits rather than interrupting', async () => {
    const { LiveAnnouncer } = await announce();
    const { container } = render(<LiveAnnouncer />);
    const region = container.querySelector('[aria-live]');

    expect(region?.getAttribute('aria-live')).toBe('polite');
    expect(region?.getAttribute('aria-atomic')).toBe('true');
  });
});
