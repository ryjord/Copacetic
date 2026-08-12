'use client';

import { useEffect, useRef } from 'react';

// One Escape closes one thing.
type DismissHandler = () => void;

const layers: DismissHandler[] = [];

function handleKeyDown(event: KeyboardEvent): void {
  // A focused control that has already dealt with Escape — the address bar
  // cancelling an edit — marks the event handled, and keeps its layer open.
  if (event.key !== 'Escape' || event.defaultPrevented) {
    return;
  }

  const top = layers[layers.length - 1];
  if (!top) {
    return;
  }

  event.preventDefault();
  top();
}

function pushLayer(dismiss: DismissHandler): () => void {
  if (layers.length === 0) {
    document.addEventListener('keydown', handleKeyDown);
  }
  layers.push(dismiss);

  return () => {
    const index = layers.lastIndexOf(dismiss);
    if (index !== -1) {
      layers.splice(index, 1);
    }
    if (layers.length === 0) {
      document.removeEventListener('keydown', handleKeyDown);
    }
  };
}

/** Make `dismiss` the Escape target for as long as `isOpen` holds. */
export function useDismissLayer(isOpen: boolean, dismiss: DismissHandler): void {
  const latest = useRef(dismiss);

  useEffect(() => {
    latest.current = dismiss;
  }, [dismiss]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    return pushLayer(() => latest.current());
  }, [isOpen]);
}
