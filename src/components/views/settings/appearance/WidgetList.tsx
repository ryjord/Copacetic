'use client';

// Libs
import { useEffect, useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { Switch } from '@/components/ui/Switch/Switch';

// Icons
import { GripVertical } from 'lucide-react';

// Utils
import { updateSettings } from '@/components/views/settings/shared/options';
import { ask, getBridge, send } from '@/lib/bridge/bridge';
import { cn } from '@/lib/utils';
import { t } from '@shared/i18n/translate';

// Types
import { START_PAGE_WIDGETS, type StartPageWidgetId } from '@shared/types';

/**
 * Every widget, shown ones first in their order, each with a switch.
 *
 * Reordered by dragging the handle or, with the handle focused, the up and
 * down arrow keys: a reorder that needs a mouse excludes half its users.
 */
export function WidgetList({ widgets }: { widgets: StartPageWidgetId[] }) {
  const [draggedId, setDraggedId] = useState<StartPageWidgetId | null>(null);
  const hiddenSiteCount = useHiddenSiteCount();

  const shown = widgets
    .map((id) => START_PAGE_WIDGETS.find((candidate) => candidate.id === id))
    .filter((widget) => widget !== undefined);
  const hidden = START_PAGE_WIDGETS.filter((widget) => !widgets.includes(widget.id));

  const moveTo = (id: StartPageWidgetId, to: number) => {
    const from = widgets.indexOf(id);
    if (from === -1 || to < 0 || to >= widgets.length || to === from) {
      return;
    }
    const next = [...widgets];
    next.splice(to, 0, ...next.splice(from, 1));
    updateSettings({ startPageWidgets: next });
  };

  return (
    <div data-setting-row className="flex flex-col gap-1 px-4 py-2.5">
      <div className="pb-1 text-reading font-medium text-ink">{t('settings.appearance.startPage.widgets.title')}</div>
      {[...shown, ...hidden].map((widget) => {
        const index = widgets.indexOf(widget.id);
        const isShown = index !== -1;
        return (
          <div
            key={widget.id}
            onDragOver={(event) => {
              if (draggedId && isShown) {
                event.preventDefault();
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (draggedId && isShown) {
                moveTo(draggedId, index);
              }
              setDraggedId(null);
            }}
            className={cn(
              'flex items-center gap-2.5 rounded-sm py-1.5 pr-1',
              draggedId === widget.id && 'opacity-50',
            )}
          >
            <button
              type="button"
              draggable={isShown}
              disabled={!isShown}
              aria-label={t('settings.appearance.startPage.widgets.reorder', { widget: widget.label })}
              title={t('settings.appearance.startPage.widgets.reorderHint')}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move';
                setDraggedId(widget.id);
              }}
              onDragEnd={() => setDraggedId(null)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                  event.preventDefault();
                  moveTo(widget.id, index + (event.key === 'ArrowUp' ? -1 : 1));
                }
              }}
              className="no-drag grid size-7 shrink-0 cursor-grab place-items-center rounded-sm text-ink-faint hover:bg-hover hover:text-ink disabled:invisible"
            >
              <GripVertical size={14} aria-hidden />
            </button>
            <div className="min-w-0 flex-1">
              <div className={cn('text-reading', isShown ? 'text-ink' : 'text-ink-dim')}>{widget.label}</div>
              <div className="text-body text-ink-dim">
                {widget.description}
                {widget.id === 'topSites' && hiddenSiteCount > 0 && (
                  <>
                    {' '}
                    {t('settings.appearance.startPage.widgets.hiddenSites', { count: hiddenSiteCount })}{' '}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-auto px-1 py-0 text-accent"
                      onClick={() => send((api) => api.startPage.showHiddenSites())}
                    >
                      {t('settings.appearance.startPage.widgets.showHidden')}
                    </Button>
                  </>
                )}
              </div>
            </div>
            <Switch
              checked={isShown}
              label={t('settings.appearance.startPage.widgets.show', { widget: widget.label })}
              onChange={(isChecked) =>
                updateSettings({
                  startPageWidgets: isChecked
                    ? [...widgets, widget.id]
                    : widgets.filter((entry) => entry !== widget.id),
                })
              }
            />
          </div>
        );
      })}
    </div>
  );
}

/** How many sites were taken off the tiles, asked again whenever the tiles change anywhere. */
function useHiddenSiteCount(): number {
  const [count, setCount] = useState(0);
  const [version, setVersion] = useState(0);

  useEffect(
    () =>
      getBridge()?.on.dataChanged((kind) => {
        if (kind === 'startTiles') {
          setVersion((current) => current + 1);
        }
      }),
    [],
  );

  useEffect(() => {
    let isCurrent = true;
    void ask((api) => api.startPage.hiddenSiteCount(), 0).then((next) => {
      if (isCurrent) {
        setCount(next);
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [version]);

  return count;
}
