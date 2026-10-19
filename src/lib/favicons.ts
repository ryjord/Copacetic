'use client';

import { useEffect, useState } from 'react';
import { ask } from '@/lib/bridge';

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

/**
 * Icons the main process has already fetched, for the sites in a list.
 *
 * Asked for by origin and only when the set of sites changes, so a list of a
 * hundred pages from ten sites fetches ten icons once. The chrome never
 * requests an icon from a site itself.
 */
export function useFavicons(urls: readonly string[]): Record<string, string> {
  const [icons, setIcons] = useState<Record<string, string>>({});
  const origins = [...new Set(urls.map(originOf).filter(Boolean))].sort().join('\n');

  useEffect(() => {
    if (!origins) {
      return;
    }
    let isCurrent = true;
    void ask((api) => api.favicons.forUrls(origins.split('\n').map((origin) => `${origin}/`)), {}).then((found) => {
      if (isCurrent) {
        setIcons(found);
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [origins]);

  return icons;
}

/** The icon for a page, or null for the letter tile. */
export function iconFor(icons: Record<string, string>, url: string): string | null {
  return icons[originOf(url)] ?? null;
}
