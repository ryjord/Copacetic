'use client';

// Libs
import { useEffect } from 'react';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

/** Density, accent and text size, set on the document by every page that draws the interface, overlays included. */
export function useInterfaceTokens() {
  const density = useBrowserStore((state) => state.settings.density);
  const accentColour = useBrowserStore((state) => state.settings.accentColour);
  const interfaceTextSize = useBrowserStore((state) => state.settings.interfaceTextSize);

  useEffect(() => {
    const root = document.documentElement.dataset;
    root.density = density;
    root.accent = accentColour;
    root.textSize = interfaceTextSize;
  }, [density, accentColour, interfaceTextSize]);
}
