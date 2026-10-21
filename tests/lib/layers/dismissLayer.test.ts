import { describe, expect, it, vi } from 'vitest';
import { fireEvent, renderHook } from '@testing-library/react';

import { useDismissLayer } from '@/lib/layers/dismissLayer';

function pressEscape(): void {
  fireEvent.keyDown(document, { key: 'Escape' });
}

describe('what Escape closes', () => {
  it('closes an open layer', () => {
    const dismiss = vi.fn();
    renderHook(() => useDismissLayer(true, dismiss));
    pressEscape();
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('leaves a layer that is not open alone', () => {
    const dismiss = vi.fn();
    renderHook(() => useDismissLayer(false, dismiss));
    pressEscape();
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('ignores every key except Escape', () => {
    const dismiss = vi.fn();
    renderHook(() => useDismissLayer(true, dismiss));
    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('stops listening once the layer has gone', () => {
    const dismiss = vi.fn();
    const { unmount } = renderHook(() => useDismissLayer(true, dismiss));
    unmount();
    pressEscape();
    expect(dismiss).not.toHaveBeenCalled();
  });
});

// One Escape closes one thing: the layer opened last, then the one beneath it.
describe('layers stacked on top of each other', () => {
  it('closes only the top one for each press', () => {
    const lower = vi.fn();
    const upper = vi.fn();
    renderHook(() => useDismissLayer(true, lower));
    const { rerender } = renderHook(({ isOpen }) => useDismissLayer(isOpen, upper), {
      initialProps: { isOpen: true },
    });

    pressEscape();
    expect(upper).toHaveBeenCalledTimes(1);
    expect(lower).not.toHaveBeenCalled();

    rerender({ isOpen: false });
    pressEscape();
    expect(lower).toHaveBeenCalledTimes(1);
    expect(upper).toHaveBeenCalledTimes(1);
  });

  it('keeps the order layers opened in when a lower one is given a new handler', () => {
    const upper = vi.fn();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ dismiss }) => useDismissLayer(true, dismiss), {
      initialProps: { dismiss: first },
    });
    renderHook(() => useDismissLayer(true, upper));

    rerender({ dismiss: second });
    pressEscape();
    expect(upper).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  it('calls the latest handler rather than the one it opened with', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ dismiss }) => useDismissLayer(true, dismiss), {
      initialProps: { dismiss: first },
    });
    rerender({ dismiss: second });
    pressEscape();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('an Escape that something else has dealt with', () => {
  // The address bar cancelling an edit marks the event handled, and keeps its layer open.
  it('is left alone when it has already been handled', () => {
    const dismiss = vi.fn();
    renderHook(() => useDismissLayer(true, dismiss));
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    event.preventDefault();
    document.dispatchEvent(event);
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('is marked as handled once a layer has taken it', () => {
    renderHook(() => useDismissLayer(true, vi.fn()));
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
