// Libs
import { useEffect, useState } from 'react';

// Components
import { AppearancePreview } from '@/components/settings/appearance/AppearancePreview';
import { ChoiceGroup, Note, RowList, Section, Subheading } from '@/components/settings/shared/controls';
import { IconButton } from '@/components/ui/controls/IconButton';

// Icons
import { ChevronDown, ChevronUp } from 'lucide-react';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { labelledOptions, updateSettings } from '@/components/settings/shared/options';
import { ask, send } from '@/lib/bridge';

// Types
import { ambientHexFor, hueForAmbientHex } from '@shared/ambient';
import {
  START_PAGE_WIDGETS,
  type DensityId,
  type Settings,
  type StartPageWidgetId,
  type ThemeId,
} from '@shared/types';

const DENSITY_LABELS: Record<DensityId, string> = {
  comfortable: 'Comfortable',
  compact: 'Compact',
};

const THEME_LABELS: Record<ThemeId, string> = {
  deep: 'Deep',
  slate: 'Slate',
  ember: 'Ember',
  moss: 'Moss',
};

/** The settings this pane stages. Everything else it touches applies at once, and says so. */
type Draft = Pick<Settings, 'theme' | 'density' | 'ambientHue' | 'startPageWidgets'>;

const draftOf = (settings: Settings): Draft => ({
  theme: settings.theme,
  density: settings.density,
  ambientHue: settings.ambientHue,
  startPageWidgets: settings.startPageWidgets,
});

const same = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);

export function AppearancePane() {
  const settings = useBrowserStore((state) => state.settings);
  const saved = draftOf(settings);

  const [draft, setDraft] = useState<Draft>(saved);
  const [wallpaper, setWallpaper] = useState<string | null>(null);
  /** A wallpaper picked but not yet kept. It outranks the saved one in the preview. */
  const [pending, setPending] = useState<string | null>(null);
  /** A removal picked but not yet kept, which hides the saved one without deleting it. */
  const [removing, setRemoving] = useState(false);
  const [saveError, setSaveError] = useState('');

  /*
   * Anything that changes the saved settings from elsewhere — another window,
   * the menu — replaces an untouched draft rather than fighting it. A draft
   * with changes in it is left alone: they are the reason someone is here.
   */
  const [base, setBase] = useState(saved);
  if (!same(base, saved)) {
    setBase(saved);
    if (same(draft, base)) {
      setDraft(saved);
    }
  }

  const [reloads, setReloads] = useState(0);
  useEffect(() => {
    if (!settings.hasWallpaper) {
      return;
    }
    let cancelled = false;
    void ask((api) => api.wallpaper.preview(), null).then((image) => {
      if (!cancelled) {
        setWallpaper(image);
      }
    });
    return () => {
      cancelled = true;
    };
    // `reloads` is bumped after a keep: replacing one wallpaper with another
    // leaves the setting alone, so nothing else here would notice.
  }, [settings.hasWallpaper, reloads]);

  // Anything staged belongs to this pane. Leaving it is the same as discarding.
  useEffect(() => {
    return () => {
      send((api) => api.wallpaper.discard());
    };
  }, []);

  // Derived rather than cleared: removing a wallpaper should not need a render
  // to take effect, and a stale one must never outlive the setting.
  const shownWallpaper = removing ? null : (pending ?? (settings.hasWallpaper ? wallpaper : null));

  const changed = !same(draft, saved) || pending !== null || removing;
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  return (
    <>
      {/*
        Pinned, because a control that changes what the preview shows is no use
        while the preview is scrolled off the top — which is exactly what
        happened to the wallpaper picker at the bottom of this pane. The
        settings column is around 660px, so the preview cannot sit beside the
        controls without squeezing them; above and staying put is what fits.
      */}
      <div className="sticky top-0 z-10 -mx-1 mb-5 bg-base/95 px-1 pb-3 pt-1 backdrop-blur">
        <Note>Everything below shows here first. Nothing is kept until you keep it.</Note>

        <div className="mb-3 mt-3">
          <AppearancePreview
            theme={draft.theme}
            density={draft.density}
            ambientHue={draft.ambientHue}
            widgets={draft.startPageWidgets}
            wallpaper={shownWallpaper}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!changed}
            onClick={() => {
              updateSettings(draft);
              setSaveError('');
              if (pending || removing) {
                void ask((api) => api.wallpaper.keep(), '').then((failure) => {
                  setSaveError(failure);
                  if (!failure) {
                    setPending(null);
                    setRemoving(false);
                    setReloads((count) => count + 1);
                  }
                });
              }
            }}
            className="rounded-field bg-active px-3.5 py-1.5 text-[12.5px] font-medium text-void transition-opacity disabled:opacity-40"
          >
            Keep these
          </button>
          <button
            type="button"
            disabled={!changed}
            onClick={() => {
              setDraft(saved);
              setSaveError('');
              if (pending || removing) {
                send((api) => api.wallpaper.discard());
                setPending(null);
                setRemoving(false);
              }
            }}
            className="rounded-field border border-line px-3.5 py-1.5 text-[12.5px] text-ink-dim transition-colors hover:bg-raised hover:text-ink disabled:opacity-40"
          >
            Discard
          </button>
          <span className="text-[12px] text-ink-faint">{changed ? 'Not saved yet.' : 'This is what is saved.'}</span>
        </div>
        {saveError && <p className="mt-1.5 text-[12px] text-alert">{saveError}</p>}
      </div>

      <Section title="Wallpaper">
        <WallpaperControl
          hasWallpaper={settings.hasWallpaper && !removing}
          pending={pending !== null}
          onPicked={(image) => {
            setPending(image);
            setRemoving(false);
          }}
          onRemove={() => {
            setPending(null);
            setRemoving(true);
            send((api) => api.wallpaper.remove());
          }}
        />
      </Section>
      <Section title="Interface">
        <Note>
          How much room the chrome takes. This changes sizing only — colour in this interface means state, so nothing
          here touches it.
        </Note>
        <ChoiceGroup
          options={labelledOptions(DENSITY_LABELS)}
          selected={draft.density}
          onSelect={(density) => set({ density })}
        />
      </Section>

      <Section title="Atmosphere">
        <div className="mb-3">
          <ChoiceGroup
            options={labelledOptions(THEME_LABELS)}
            selected={draft.theme}
            onSelect={(theme) => set(theme === draft.theme ? {} : { theme, ambientHue: 0 })}
          />
        </div>
        <p className="mb-3 text-[12px] leading-relaxed text-ink-faint">
          The atmosphere only tints the start page. The rest of the interface stays monochrome so colour always means
          the same thing.
        </p>
        <HueControl theme={draft.theme} hue={draft.ambientHue} onChange={(ambientHue) => set({ ambientHue })} />
      </Section>

      <Section title="Start page">
        <WidgetManager widgets={draft.startPageWidgets} onChange={(startPageWidgets) => set({ startPageWidgets })} />
      </Section>
    </>
  );
}

/**
 * One value, two ways of saying it: the slider turns the theme's pair of
 * colours, and the field shows where the near one landed. Typing a colour works
 * out the turn that would land there, so the two cannot disagree.
 */
function HueControl({ theme, hue, onChange }: { theme: ThemeId; hue: number; onChange: (hue: number) => void }) {
  const [typed, setTyped] = useState<string | null>(null);
  const shown = typed ?? ambientHexFor(theme, hue);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={359}
          value={hue}
          aria-label="Atmosphere hue"
          onChange={(event) => {
            setTyped(null);
            onChange(Number(event.target.value));
          }}
          className="h-1 flex-1 accent-active"
        />
        <span className="w-10 shrink-0 text-right font-mono text-[11.5px] text-ink-faint tabular-nums">
          {hue}&deg;
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span
          className="size-6 shrink-0 rounded-field border border-line"
          style={{ background: shown }}
          aria-hidden
        />
        <input
          type="text"
          value={shown}
          spellCheck={false}
          aria-label="Atmosphere colour"
          onChange={(event) => {
            setTyped(event.target.value);
            const turn = hueForAmbientHex(theme, event.target.value);
            if (turn !== null) {
              onChange(turn);
            }
          }}
          onBlur={() => setTyped(null)}
          className="w-24 rounded-field border border-line bg-raised px-2 py-1 font-mono text-[12px] text-ink outline-none focus:border-line-strong"
        />
        <span className="text-[12px] text-ink-faint">
          Only the hue is taken — the depth belongs to the atmosphere.
        </span>
      </div>
    </div>
  );
}

function WidgetManager({
  widgets,
  onChange,
}: {
  widgets: StartPageWidgetId[];
  onChange: (next: StartPageWidgetId[]) => void;
}) {
  const move = (id: StartPageWidgetId, delta: number) => {
    const from = widgets.indexOf(id);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= widgets.length) {
      return;
    }
    const next = [...widgets];
    next.splice(to, 0, ...next.splice(from, 1));
    onChange(next);
  };

  const toggle = (id: StartPageWidgetId) => {
    onChange(widgets.includes(id) ? widgets.filter((entry) => entry !== id) : [...widgets, id]);
  };

  const shown = widgets
    .map((id) => START_PAGE_WIDGETS.find((candidate) => candidate.id === id))
    .filter((widget) => widget !== undefined);
  const hidden = START_PAGE_WIDGETS.filter((widget) => !widgets.includes(widget.id));

  return (
    <div className="mt-1">
      <Subheading>On the start page</Subheading>
      <RowList>
        {/* Buttons rather than dragging: a reorder that needs a mouse excludes half its users. */}
        {shown.map((widget, index) => (
          <li key={widget.id} className="flex items-center gap-2 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] text-ink">{widget.label}</span>
              <span className="block text-[11.5px] text-ink-faint">{widget.description}</span>
            </span>
            <IconButton label={`Move ${widget.label} up`} onClick={() => move(widget.id, -1)} disabled={index === 0}>
              <ChevronUp size={14} />
            </IconButton>
            <IconButton
              label={`Move ${widget.label} down`}
              onClick={() => move(widget.id, 1)}
              disabled={index === shown.length - 1}
            >
              <ChevronDown size={14} />
            </IconButton>
            <button
              type="button"
              onClick={() => toggle(widget.id)}
              className="shrink-0 rounded px-2 py-0.5 text-[11.5px] text-ink-faint transition-colors hover:bg-hover hover:text-ink"
            >
              Remove
            </button>
          </li>
        ))}
      </RowList>

      {widgets.length === 0 && (
        <p className="mt-2 text-[12px] text-ink-faint">
          A start page with nothing on it is allowed, if that is what you want.
        </p>
      )}

      {hidden.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[11.5px] text-ink-faint">Add:</span>
          {hidden.map((widget) => (
            <button
              key={widget.id}
              type="button"
              onClick={() => toggle(widget.id)}
              className="rounded-field border border-line px-2.5 py-1 text-[11.5px] text-ink-dim transition-colors hover:bg-raised hover:text-ink"
            >
              {widget.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The picker and nothing else. What a wallpaper looks like is answered by the
 * preview at the top of the pane, which shows it dimmed exactly as the start
 * page dims it — a second, smaller picture here said the same thing worse.
 */
function WallpaperControl({
  hasWallpaper,
  pending,
  onPicked,
  onRemove,
}: {
  hasWallpaper: boolean;
  pending: boolean;
  onPicked: (image: string | null) => void;
  onRemove: () => void;
}) {
  const [message, setMessage] = useState('');

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setMessage('');
            void ask((api) => api.wallpaper.choose(), '').then(async (error) => {
              setMessage(error);
              if (!error) {
                onPicked(await ask((api) => api.wallpaper.staged(), null));
              }
            });
          }}
          className="rounded-field border border-line px-3 py-1.5 text-[12.5px] text-ink-dim transition-colors hover:bg-raised hover:text-ink"
        >
          {hasWallpaper || pending ? 'Change wallpaper' : 'Choose a wallpaper'}
        </button>
        {(hasWallpaper || pending) && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-field border border-line px-3 py-1.5 text-[12.5px] text-ink-faint transition-colors hover:bg-raised hover:text-ink"
          >
            Remove
          </button>
        )}
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-ink-faint">
        Copied into your profile and resized, so moving the original later does not blank it. The start page dims it
        slightly so the clock and search field stay readable.
      </p>
      {message && <p className="mt-1 text-[12px] text-alert">{message}</p>}
    </div>
  );
}
