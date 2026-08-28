// Utils
import { AMBIENT_FAR, AMBIENT_NEAR } from '@shared/ambient';

// Types
import type { DensityId, StartPageWidgetId, ThemeId } from '@shared/types';

/** The sizes the stylesheet gives each density, so the preview shrinks with the real thing. */
const CHROME: Record<DensityId, { header: number; tab: number; field: number }> = {
  comfortable: { header: 38, tab: 30, field: 32 },
  compact: { header: 32, tab: 25, field: 27 },
};

/**
 * A working miniature of the window, painted from a draft rather than from what
 * is saved. It exists so that a choice can be seen before it is made — every
 * appearance setting before this one was confirmed blind and inspected after.
 */
export function AppearancePreview({
  theme,
  density,
  ambientHue,
  widgets,
  wallpaper,
}: {
  theme: ThemeId;
  density: DensityId;
  ambientHue: number;
  widgets: StartPageWidgetId[];
  wallpaper: string | null;
}) {
  const size = CHROME[density];
  const near = AMBIENT_NEAR[theme] ?? AMBIENT_NEAR.deep;
  const far = AMBIENT_FAR[theme] ?? AMBIENT_FAR.deep;

  return (
    <div
      aria-label="Preview"
      className="flex w-full flex-col overflow-hidden rounded-panel border border-line-strong"
      style={{ aspectRatio: '16 / 10' }}
    >
      <div className="flex shrink-0 items-end gap-1.5 bg-void px-2.5" style={{ height: size.header }}>
        <div
          className="flex items-center gap-1.5 rounded-t-tab bg-raised px-2"
          style={{ height: size.tab, width: 96 }}
        >
          <span className="size-3 shrink-0 rounded-[3px] bg-hover" />
          <span className="truncate text-[11px] text-ink">New tab</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-t-tab px-2" style={{ height: size.tab, width: 96 }}>
          <span className="size-3 shrink-0 rounded-[3px] bg-hover" />
          <span className="truncate text-[11px] text-ink-dim">Copacetic</span>
        </div>
      </div>

      <div
        className="flex shrink-0 items-center border-b border-line bg-base px-2.5"
        style={{ height: size.header + 6 }}
      >
        <div className="flex flex-1 items-center rounded-field bg-raised px-3" style={{ height: size.field }}>
          <span className="text-[11px] text-ink-faint">Search, or type an address</span>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-hidden bg-sunken p-4">
        {wallpaper ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={wallpaper} alt="" aria-hidden className="absolute inset-0 size-full object-cover" />
            <div className="absolute inset-0 bg-base/70" aria-hidden />
          </>
        ) : (
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              filter: `hue-rotate(${ambientHue}deg)`,
              background: `radial-gradient(120% 90% at 18% 0%, ${near} 0%, transparent 55%), radial-gradient(110% 100% at 92% 100%, ${far} 0%, transparent 58%)`,
            }}
          />
        )}

        {widgets.length === 0 ? (
          <span className="relative text-[11px] text-ink-faint">Nothing but the page</span>
        ) : (
          widgets.map((widget) => (
            <div key={widget} className="relative w-full">
              {widget === 'clock' && (
                <div className="text-center font-mono text-[26px] font-light leading-none tracking-tight text-ink tabular-nums">
                  21:48
                </div>
              )}
              {widget === 'search' && (
                <div className="mx-auto flex h-7 w-2/3 items-center rounded-field border border-line-strong bg-base/55 px-3">
                  <span className="text-[10.5px] text-ink-dim">Search</span>
                </div>
              )}
              {(widget === 'topSites' || widget === 'bookmarks') && (
                <div className="mx-auto grid w-2/3 grid-cols-4 gap-1.5">
                  {[0, 1, 2, 3].map((slot) => (
                    <div
                      key={slot}
                      className="flex h-8 flex-col items-center justify-center gap-1 rounded-panel border border-line bg-base/50"
                    >
                      <span className="size-2.5 rounded-[2px] bg-hover" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
