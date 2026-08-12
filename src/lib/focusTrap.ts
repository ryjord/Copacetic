'use client';

import { useEffect, type RefObject } from 'react';

// Keeping the keyboard inside a panel that covers the page.

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableWithin(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    // Deliberately not a layout check. `offsetParent` looks like the obvious
    // way to skip hidden controls, but it is also null for anything
    // position-fixed — which would quietly drop real, visible controls out of
    // the trap. These three cover what actually makes something unfocusable.
    (element) =>
      !element.hasAttribute('hidden') &&
      element.getAttribute('aria-hidden') !== 'true' &&
      element.closest('[inert]') === null,
  );
}

/** Traps Tab within `ref` while `isActive`, and puts focus back where it was on the way out — leaving someone's focus stranded on a panel that no longer exists is its own small failure. */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, isActive: boolean): void {
  useEffect(() => {
    const container = ref.current;
    if (!isActive || !container) {
      return;
    }

    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Focus the first real control, or the panel itself when it has none, so
    // the keyboard starts inside rather than wherever it happened to be.
    const initial = focusableWithin(container)[0];
    if (initial) {
      initial.focus();
    } else {
      container.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') {
        return;
      }

      const focusable = focusableWithin(container);
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;

      // Only the ends need handling; everything between them is the browser's
      // own tab order doing the right thing already.
      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!container.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      // Only if focus is still inside the panel; if the user has deliberately
      // clicked elsewhere, moving them again would be rude.
      if (container.contains(document.activeElement)) {
        returnTo?.focus();
      }
    };
  }, [ref, isActive]);
}
