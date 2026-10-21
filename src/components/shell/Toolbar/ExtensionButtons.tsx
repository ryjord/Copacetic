'use client';

// Components
import { IconButton } from '@/components/ui/IconButton/IconButton';

// Icons
import { Puzzle } from 'lucide-react';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { send } from '@/lib/bridge/bridge';
import { useExtensions } from '@/lib/extensions/useExtensions';
import { cn } from '@/lib/utils';
import { t } from '@shared/i18n/translate';

// Types
import type { ExtensionAction, ExtensionSummary } from '@shared/extensions/extensions';

/** Where a popup or menu opens under a button: its sides, and just below it. */
function edgesOf(button: HTMLElement) {
  const box = button.getBoundingClientRect();
  return { left: Math.round(box.left), right: Math.round(box.right), bottom: Math.round(box.bottom + 4) };
}

/**
 * A button for each pinned extension that has one, beside the address bar,
 * and the extensions button, whose menu has every extension.
 *
 * Its popup opens as a view of its own, under the button: a page drawn here
 * would sit behind the tab's view, which always paints above the chrome.
 */
export function ExtensionButtons() {
  const activeTabId = useBrowserStore((state) => state.activeTabId);
  // Asked again for each tab, since an extension can give one tab a badge of its own.
  const extensions = useExtensions(true, activeTabId);

  const enabled = (extensions ?? []).filter((extension) => extension.isEnabled);
  if (enabled.length === 0) {
    return null;
  }

  return (
    <>
      {enabled
        .filter((extension) => extension.isPinned)
        .flatMap((extension) =>
          extension.action
            ? [<ExtensionButton key={extension.id} extension={extension} action={extension.action} />]
            : [],
        )}
      <IconButton
        label={t('shell.toolbar.extensions')}
        onClick={(event) => {
          const { left, right, bottom } = edgesOf(event.currentTarget);
          send((api) => api.extensions.openMenu(left, right, bottom));
        }}
      >
        <Puzzle size={16} strokeWidth={1.75} />
      </IconButton>
    </>
  );
}

function ExtensionButton({ extension, action }: { extension: ExtensionSummary; action: ExtensionAction }) {
  const icon = action.iconDataUrl ?? extension.iconDataUrl;
  return (
    <button
      type="button"
      aria-label={action.badgeText ? `${action.title} (${action.badgeText})` : action.title}
      title={action.title}
      disabled={!action.isEnabled}
      onClick={(event) => {
        const { left, right, bottom } = edgesOf(event.currentTarget);
        send((api) => api.extensions.press(extension.id, left, right, bottom));
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
}
