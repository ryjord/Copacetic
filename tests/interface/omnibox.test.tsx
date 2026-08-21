import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { TabState } from '../../electron/shared/types';
import { Omnibox } from '../../src/components/chrome/Omnibox/Omnibox';

// The bridge is absent outside Electron and every call is a no-op, so the
// component renders for real here — which is the point: these are the render
// paths that broke the whole chrome when they failed to converge.

function tab(id: string, url: string): TabState {
  return {
    id,
    url,
    displayUrl: url,
    title: url,
    faviconDataUrl: null,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    isAudible: false,
    isMuted: false,
    security: { level: 'secure', scheme: 'https', host: 'example.com', detail: 'Encrypted.' },
    error: null,
    blockedCount: 0,
    loadMs: 120,
    zoomFactor: 1,
    isStartPage: false,
    isBookmarked: false,
  };
}

afterEach(cleanup);

describe('Omnibox render stability', () => {
  // React error #301. Comparing a bare `tab?.id` against state normalised to
  // null made this loop until React gave up, and the chrome rendered nothing.
  it('renders with no active tab without exceeding the render limit', () => {
    expect(() => render(<Omnibox tab={null} />)).not.toThrow();
  });

  it('renders with an active tab', () => {
    render(<Omnibox tab={tab('a', 'https://example.com/')} />);
    expect(screen.getByLabelText('Address and search')).toBeTruthy();
  });

  it('survives switching between a tab and no tab repeatedly', () => {
    const { rerender } = render(<Omnibox tab={tab('a', 'https://example.com/')} />);
    expect(() => {
      for (let i = 0; i < 5; i += 1) {
        rerender(<Omnibox tab={null} />);
        rerender(<Omnibox tab={tab(`t${i}`, `https://site${i}.com/`)} />);
      }
    }).not.toThrow();
  });

  it('shows the address structurally until it is clicked, then becomes an input', () => {
    render(<Omnibox tab={tab('a', 'https://docs.example.com/guide')} />);

    // Unfocused it is a button, not a text field.
    const trigger = screen.getByLabelText('Address and search');
    expect(trigger.tagName).toBe('BUTTON');
    // The registrable domain is the part rendered at full contrast.
    expect(trigger.textContent).toContain('example.com');

    fireEvent.click(trigger);
    expect(screen.getByLabelText('Address and search').tagName).toBe('INPUT');
  });

  it('drops the draft when the active tab changes underneath it', () => {
    const { rerender } = render(<Omnibox tab={tab('a', 'https://example.com/')} />);

    fireEvent.click(screen.getByLabelText('Address and search'));
    const input = screen.getByLabelText('Address and search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'half-typed-address' } });
    expect((screen.getByLabelText('Address and search') as HTMLInputElement).value).toBe('half-typed-address');

    // A shortcut switched tabs in the main process. The draft belonged to the
    // old tab, so Enter must not send it to the new one.
    rerender(<Omnibox tab={tab('b', 'https://other.com/')} />);

    const after = screen.getByLabelText('Address and search');
    expect(after.tagName).toBe('BUTTON');
    expect(after.textContent).toContain('other.com');
  });
});
