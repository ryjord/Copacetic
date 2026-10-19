'use client';

// Utils
import { t } from '@shared/i18n/translate';

// Types
import type { StartPageWidgetId } from '@shared/types';

interface AppearancePreviewProps {
  widgets: StartPageWidgetId[];
  wallpaper: string | null;
}

/** The start page in miniature, painted from the same colours, so a change is seen as it is made. */
export function AppearancePreview({ widgets, wallpaper }: AppearancePreviewProps) {
  return (
    <div
      aria-label={t('settings.appearance.startPage.preview.label')}
      className="relative flex h-44 flex-col items-center justify-center gap-3 overflow-hidden rounded-md border border-line bg-void p-4"
    >
      {wallpaper ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={wallpaper} alt="" aria-hidden className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-base/65" aria-hidden />
        </>
      ) : (
        <div aria-hidden className="ambient-field absolute inset-0" />
      )}

      {widgets.length === 0 ? (
        <span className="relative text-caption text-ink-dim">{t('settings.appearance.startPage.preview.empty')}</span>
      ) : (
        widgets.map((widget) => (
          <div key={widget} className="relative flex w-full justify-center">
            {widget === 'clock' && <div className="text-heading font-light text-ink tabular-nums">21:48</div>}
            {widget === 'search' && <div className="h-6 w-1/2 rounded-full border border-line-strong bg-raised/70" />}
            {(widget === 'topSites' || widget === 'bookmarks') && (
              <div className="grid w-1/2 grid-cols-4 gap-1.5">
                {[0, 1, 2, 3].map((slot) => (
                  <div key={slot} className="grid h-7 place-items-center rounded-sm bg-raised/60">
                    <span className="size-2.5 rounded-xs bg-line-strong" />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
