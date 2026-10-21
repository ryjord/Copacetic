'use client';

// Libs
import { useEffect, useState } from 'react';

// Utils
import { ask, getBridge } from '@/lib/bridge/bridge';

// Types
import type { ExtensionSummary } from '@shared/extensions/extensions';

/**
 * Every extension, asked again whenever one changes and whenever `askAgainFor`
 * does; null until the first answer. Nothing is asked while `isWanted` is false.
 */
export function useExtensions(isWanted = true, askAgainFor: unknown = null): ExtensionSummary[] | null {
  const [extensions, setExtensions] = useState<ExtensionSummary[] | null>(null);

  useEffect(() => {
    if (!isWanted) {
      return;
    }
    let isCurrent = true;
    const reload = () => {
      void ask((api) => api.extensions.list(), []).then((listed) => {
        if (isCurrent) {
          setExtensions(listed);
        }
      });
    };
    reload();
    const stopListening = getBridge()?.on.extensionsChanged(reload);
    return () => {
      isCurrent = false;
      stopListening?.();
    };
  }, [isWanted, askAgainFor]);

  return extensions;
}
