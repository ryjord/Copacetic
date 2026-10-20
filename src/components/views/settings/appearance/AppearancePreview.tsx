'use client';

// Components
import { StartBackdrop } from '@/components/views/start/StartBackdrop';

// Utils
import { ambientPreviewStyle } from '@/components/views/settings/appearance/ambientPreview';
import { t } from '@shared/i18n/translate';

// Types
import type { StartPageWidgetId, ThemeId } from '@shared/types';

export type PreviewBackground =
  { kind: 'colour'; theme: ThemeId; hue: number } | { kind: 'photo'; photo: string; dim: number; isBlurred: boolean };

interface AppearancePreviewProps {
  widgets: StartPageWidgetId[];
  background: PreviewBackground;
}

/** The start page in miniature, painted from what is being chosen, so a change is seen before it is let go. */
export function AppearancePreview({ widgets, background }: AppearancePreviewProps) {
  const isColour = background.kind === 'colour';
  return (
    <div
      aria-label={t('settings.appearance.startPage.preview.label')}
      data-ambient-preview={isColour ? '' : undefined}
      style={isColour ? ambientPreviewStyle(background.theme, background.hue) : undefined}
      className="ambient-field relative flex h-44 flex-col items-center justify-center gap-3 overflow-hidden rounded-md border border-line p-4"
    >
      {background.kind === 'photo' && (
        <StartBackdrop photo={background.photo} dim={background.dim} isBlurred={background.isBlurred} />
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
