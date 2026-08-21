// Libs
import { useEffect, useState } from 'react';

// Components
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
import { START_PAGE_WIDGETS, type DensityId, type StartPageWidgetId, type ThemeId } from '@shared/types';

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

export function AppearancePane() {
  const settings = useBrowserStore((state) => state.settings);

  return (
    <>
      <Section title="Interface">
        <Note>
          How much room the chrome takes. This changes sizing only — colour in this interface means state, so nothing
          here touches it.
        </Note>
        <ChoiceGroup
          options={labelledOptions(DENSITY_LABELS)}
          selected={settings.density}
          onSelect={(density) => updateSettings({ density })}
        />
      </Section>

      <Section title="Start page">
        <div className="mb-3">
          <ChoiceGroup
            options={labelledOptions(THEME_LABELS)}
            selected={settings.theme}
            onSelect={(theme) => updateSettings({ theme })}
          />
        </div>
        <p className="mb-1 text-[12px] leading-relaxed text-ink-faint">
          The atmosphere only tints the start page. The rest of the interface stays monochrome so colour always means
          the same thing.
        </p>
        <WallpaperControl hasWallpaper={settings.hasWallpaper} />
        <WidgetManager
          widgets={settings.startPageWidgets}
          onChange={(startPageWidgets) => updateSettings({ startPageWidgets })}
        />
      </Section>
    </>
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

function WallpaperControl({ hasWallpaper }: { hasWallpaper: boolean }) {
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!hasWallpaper) {
      return;
    }
    let cancelled = false;
    void ask((api) => api.wallpaper.preview(), null).then((image) => {
      if (!cancelled) {
        setPreview(image);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [hasWallpaper]);

  const visible = hasWallpaper ? preview : null;

  return (
    <div className="mb-3">
      {visible && (
        <div className="mb-2 overflow-hidden rounded-panel border border-line">
          {/* A data URL already in memory, in a static export with no image loader. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={visible} alt="The current start page wallpaper" className="h-28 w-full object-cover" />
          {/* Dimmed exactly as the start page dims it, so this is a preview and not a flattering portrait. */}
          <div className="relative -mt-28 h-28 w-full bg-base/70" aria-hidden />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setMessage('');
            void ask((api) => api.wallpaper.choose(), '').then(setMessage);
          }}
          className="rounded-field border border-line px-3 py-1.5 text-[12.5px] text-ink-dim transition-colors hover:bg-raised hover:text-ink"
        >
          {hasWallpaper ? 'Change wallpaper' : 'Choose a wallpaper'}
        </button>
        {hasWallpaper && (
          <button
            type="button"
            onClick={() => send((api) => api.wallpaper.clear())}
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
