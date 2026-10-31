'use client';

// Libs
import { useEffect, useState } from 'react';

// Components
import { IconButton } from '@/components/ui/IconButton/IconButton';

// Icons
import { X } from 'lucide-react';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { ask, getBridge, send } from '@/lib/bridge/bridge';
import { cn } from '@/lib/utils';
import { t } from '@shared/i18n/translate';

// Types
import type { ReadingItem } from '@shared/data/reading-list';

// A start page, not an archive: unread first, so these are the ones worth reading next.
const SHOWN_AT_ONCE = 8;

/** Articles saved from reader view, unread first; each opens in reader view from what was kept, connection or not. */
export function StartReadingList() {
  const openReading = useBrowserStore((state) => state.openReading);
  const [items, setItems] = useState<ReadingItem[]>([]);

  useEffect(() => {
    const load = () => void ask((api) => api.readingList.list(), []).then(setItems);
    load();
    return getBridge()?.on.dataChanged((kind) => {
      if (kind === 'readingList') {
        load();
      }
    });
  }, []);

  return (
    <section aria-labelledby="reading-list-title" className="flex w-full flex-col gap-2">
      <h2 id="reading-list-title" className="px-1 text-body font-semibold text-ink-dim">
        {t('views.start.readingList.title')}
      </h2>
      {items.length === 0 ? (
        <p className="px-1 text-body text-ink-faint">{t('views.start.readingList.empty')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-md bg-raised/85">
          {items.slice(0, SHOWN_AT_ONCE).map((item) => (
            <li key={item.id} className="flex items-center gap-2 pl-3.5 pr-1.5">
              <button
                type="button"
                onClick={() => openReading(item.id)}
                className="flex min-w-0 flex-1 flex-col items-start py-2 text-left"
              >
                <span className={cn('w-full truncate text-body', item.isRead ? 'text-ink-dim' : 'text-ink')}>
                  {item.title}
                </span>
                <span className="text-body-sm text-ink-faint">
                  {item.siteName
                    ? t('views.start.readingList.minutes', { site: item.siteName, count: item.minutes })
                    : t('views.start.readingList.minutesNoSite', { count: item.minutes })}
                </span>
              </button>
              <IconButton
                label={t('views.start.readingList.remove', { title: item.title })}
                onClick={() => send((api) => api.readingList.remove(item.id))}
              >
                <X size={14} strokeWidth={1.75} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
