'use client';

// Libs
import { useCallback, useEffect, useState } from 'react';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { ask, getBridge, send } from '@/lib/bridge/bridge';
import { cn } from '@/lib/utils';

// Types
import type { ExtensionSummary } from '@shared/extensions/extensions';

/**
 * A button for each extension that has one, beside the address bar.
 *
 * Its popup opens as a view of its own, under the button: a page drawn here
 * would sit behind the tab's view, which always paints above the chrome.
 */
export function ExtensionButtons() {
  const activeTabId = useBrowserStore((state) => state.activeTabId);
  const [extensions, setExtensions] = useState<ExtensionSummary[]>([]);

  const reload = useCallback(() => {
    void ask((api) => api.extensions.list(), []).then(setExtensions);
  }, []);

  // Asked again for each tab, since an extension can give one tab a badge of its own.
  useEffect(() => {
    reload();
  }, [reload, activeTabId]);

  useEffect(() => getBridge()?.on.extensionsChanged(reload), [reload]);

  const shown = extensions.filter((extension) => extension.isEnabled && extension.action !== null);
  if (shown.length === 0) {
    return null;
  }

  return shown.map((extension) => {
    const action = extension.action;
    if (!action) {
      return null;
    }
    const icon = action.iconDataUrl ?? extension.iconDataUrl;
    return (
      <button
        key={extension.id}
        type="button"
        aria-label={action.badgeText ? `${action.title} (${action.badgeText})` : action.title}
        title={action.title}
        disabled={!action.isEnabled}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          send((api) =>
            api.extensions.press(
              extension.id,
              Math.round(box.left),
              Math.round(box.right),
              Math.round(box.bottom + 4),
            ),
          );
        }}
        className={cn(
          'no-drag relative grid size-7 shrink-0 place-items-center rounded-sm transition-colors hover:bg-hover',
          !action.isEnabled && 'opacity-50',
        )}
      >
        {icon ? (
          // eslint-disable-next-line @next/next/no-img-element -- a data URL from the extension's own files, nothing to optimise
          <img src={icon} alt="" className="size-4" draggable={false} />
        ) : (
          <span className="grid size-4 place-items-center rounded-xs bg-hover text-caption font-semibold text-ink-dim">
            {extension.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        {/* After the icon, so it paints over it without any layering. */}
        {action.badgeText && (
          <span
            className="absolute right-0 bottom-0 min-w-3.5 rounded-xs px-0.5 text-center text-caption font-semibold text-white"
            style={{ background: action.badgeColour }}
          >
            {action.badgeText}
          </span>
        )}
      </button>
    );
  });
}
