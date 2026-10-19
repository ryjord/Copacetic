'use client';

// Libs
import { useEffect, useState } from 'react';

// Components
import { AppearancePreview } from '@/components/views/settings/appearance/AppearancePreview';
import { Button } from '@/components/ui/Button/Button';
import { IconButton } from '@/components/ui/IconButton/IconButton';
import { SegmentedControl } from '@/components/ui/SegmentedControl/SegmentedControl';
import { Select } from '@/components/ui/Select/Select';
import { SettingGroup, SettingRow } from '@/components/ui/SettingRow/SettingRow';
import { TextField } from '@/components/ui/TextField/TextField';

// Icons
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { labelledOptions, updateSettings } from '@/components/views/settings/shared/options';
import { ask } from '@/lib/bridge';
import { cn } from '@/lib/utils';

// Types
import { ambientHexFor, ambientStopsFor, hueForAmbientHex } from '@shared/ambient';
import {
  START_PAGE_WIDGETS,
  THEME_IDS,
  type AppearanceId,
  type DensityId,
  type StartPageWidgetId,
  type ThemeId,
} from '@shared/types';

const APPEARANCE_LABELS: Record<AppearanceId, string> = { system: 'System', light: 'Light', dark: 'Dark' };
const DENSITY_LABELS: Record<DensityId, string> = { comfortable: 'Comfortable', compact: 'Compact' };
const THEME_LABELS: Record<ThemeId, string> = { deep: 'Deep', slate: 'Slate', ember: 'Ember', moss: 'Moss' };

const ZOOM_LEVELS = [0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2].map((level) => ({
  id: String(level),
  label: `${Math.round(level * 100)}%`,
}));

export function AppearancePane() {
  const settings = useBrowserStore((state) => state.settings);
  const [wallpaper, setWallpaper] = useState<string | null>(null);
  const [wallpaperError, setWallpaperError] = useState('');
  const [wallpaperVersion, setWallpaperVersion] = useState(0);

  useEffect(() => {
    if (!settings.hasWallpaper) {
      return;
    }
    let isCurrent = true;
    void ask((api) => api.wallpaper.preview(), null).then((image) => {
      if (isCurrent) {
        setWallpaper(image);
      }
    });
    return () => {
      isCurrent = false;
    };
    // Bumped after a replacement, which leaves hasWallpaper true and would otherwise go unnoticed.
  }, [settings.hasWallpaper, wallpaperVersion]);

  const chooseWallpaper = async () => {
    setWallpaperError('');
    const failure = await ask((api) => api.wallpaper.choose(), '');
    if (failure) {
      setWallpaperError(failure);
      return;
    }
    // Choosing stages the image; there is no second step, so it is kept straight away.
    setWallpaperError(await ask((api) => api.wallpaper.keep(), ''));
    setWallpaperVersion((version) => version + 1);
  };

  const removeWallpaper = async () => {
    await ask((api) => api.wallpaper.remove(), undefined);
    setWallpaperError(await ask((api) => api.wallpaper.keep(), ''));
  };

  return (
    <>
      <SettingGroup title="Interface">
        <SettingRow
          label="Appearance"
          control={
            <SegmentedControl
              label="Appearance"
              options={labelledOptions(APPEARANCE_LABELS)}
              value={settings.appearance}
              onChange={(appearance) => updateSettings({ appearance })}
            />
          }
        />
        <SettingRow
          label="Density"
          help="How much room the tab strip and toolbar take."
          control={
            <SegmentedControl
              label="Density"
              options={labelledOptions(DENSITY_LABELS)}
              value={settings.density}
              onChange={(density) => updateSettings({ density })}
            />
          }
        />
      </SettingGroup>

      <SettingGroup title="Zoom">
        <SettingRow
          label="Default zoom"
          help="Sites you zoom yourself remember their own level."
          control={
            <Select
              label="Default zoom"
              options={ZOOM_LEVELS}
              value={String(settings.defaultZoomFactor)}
              onChange={(level) => updateSettings({ defaultZoomFactor: Number(level) })}
            />
          }
        />
        <SiteZoomRows levels={settings.zoomLevels} />
      </SettingGroup>

      <SettingGroup title="Start page">
        <div className="flex flex-col gap-3 p-3.5">
          <AppearancePreview
            widgets={settings.startPageWidgets}
            wallpaper={settings.hasWallpaper ? wallpaper : null}
          />
        </div>
        <SettingRow
          label="Colour"
          help="Applies to the start page only."
          control={
            <ThemeSwatches
              value={settings.theme}
              hue={settings.ambientHue}
              onChange={(theme) => updateSettings({ theme, ambientHue: 0 })}
            />
          }
        />
        <HueRow theme={settings.theme} hue={settings.ambientHue} />
        <SettingRow
          label="Wallpaper"
          help={wallpaperError || (settings.hasWallpaper ? 'A copy is kept in your profile.' : undefined)}
          control={
            <>
              <Button size="sm" onClick={() => void chooseWallpaper()}>
                {settings.hasWallpaper ? 'Change' : 'Choose'}
              </Button>
              {settings.hasWallpaper && (
                <Button size="sm" variant="ghost" onClick={() => void removeWallpaper()}>
                  Remove
                </Button>
              )}
            </>
          }
        />
        <WidgetRows
          widgets={settings.startPageWidgets}
          onChange={(startPageWidgets) => updateSettings({ startPageWidgets })}
        />
      </SettingGroup>
    </>
  );
}

function ThemeSwatches({
  value,
  hue,
  onChange,
}: {
  value: ThemeId;
  hue: number;
  onChange: (theme: ThemeId) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Start page colour" className="flex gap-1.5">
      {THEME_IDS.map((theme) => {
        const { near, far } = ambientStopsFor(theme, theme === value ? hue : 0);
        const isChosen = theme === value;
        return (
          <button
            key={theme}
            type="button"
            role="radio"
            aria-checked={isChosen}
            aria-label={THEME_LABELS[theme]}
            title={THEME_LABELS[theme]}
            onClick={() => onChange(theme)}
            className={cn(
              'size-7 rounded-full border-2 transition-colors',
              isChosen ? 'border-accent' : 'border-transparent hover:border-line-strong',
            )}
            style={{ background: `linear-gradient(135deg, ${near}, ${far})` }}
          />
        );
      })}
    </div>
  );
}

/**
 * One value, two ways of saying it: the slider turns the colour, and the field
 * shows where it landed. Typing a colour works out the turn that lands there,
 * so the two cannot disagree.
 */
function HueRow({ theme, hue }: { theme: ThemeId; hue: number }) {
  const [typed, setTyped] = useState<string | null>(null);
  const shown = typed ?? ambientHexFor(theme, hue);

  return (
    <SettingRow
      label="Shade"
      control={
        <>
          <input
            type="range"
            min={0}
            max={359}
            value={hue}
            aria-label="Start page shade"
            onChange={(event) => {
              setTyped(null);
              updateSettings({ ambientHue: Number(event.target.value) });
            }}
            className="w-36 accent-[var(--color-accent)]"
          />
          <TextField
            value={shown}
            spellCheck={false}
            aria-label="Start page colour as hex"
            onChange={(event) => {
              setTyped(event.target.value);
              const turn = hueForAmbientHex(theme, event.target.value);
              if (turn !== null) {
                updateSettings({ ambientHue: turn });
              }
            }}
            onBlur={() => setTyped(null)}
            className="h-7 w-24 font-mono text-body-sm"
          />
        </>
      }
    />
  );
}

function SiteZoomRows({ levels }: { levels: Record<string, number> }) {
  const entries = Object.entries(levels);
  if (entries.length === 0) {
    return null;
  }
  return (
    <>
      {entries.map(([origin, level]) => (
        <SettingRow
          key={origin}
          label={origin.replace(/^https?:\/\//, '')}
          control={
            <>
              <span className="text-body-sm text-ink-dim tabular-nums">{Math.round(level * 100)}%</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const next = { ...levels };
                  delete next[origin];
                  updateSettings({ zoomLevels: next });
                }}
              >
                Reset
              </Button>
            </>
          }
        />
      ))}
    </>
  );
}

function WidgetRows({
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

  const shown = widgets
    .map((id) => START_PAGE_WIDGETS.find((candidate) => candidate.id === id))
    .filter((widget) => widget !== undefined);
  const hidden = START_PAGE_WIDGETS.filter((widget) => !widgets.includes(widget.id));

  return (
    <>
      {/* Buttons rather than dragging: a reorder that needs a mouse excludes half its users. */}
      {shown.map((widget, index) => (
        <SettingRow
          key={widget.id}
          label={widget.label}
          help={widget.description}
          control={
            <>
              <IconButton
                label={`Move ${widget.label} up`}
                onClick={() => move(widget.id, -1)}
                disabled={index === 0}
              >
                <ChevronUp size={16} />
              </IconButton>
              <IconButton
                label={`Move ${widget.label} down`}
                onClick={() => move(widget.id, 1)}
                disabled={index === shown.length - 1}
              >
                <ChevronDown size={16} />
              </IconButton>
              <IconButton
                label={`Remove ${widget.label}`}
                onClick={() => onChange(widgets.filter((entry) => entry !== widget.id))}
              >
                <X size={16} />
              </IconButton>
            </>
          }
        />
      ))}
      {hidden.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-3.5 py-2.5">
          {hidden.map((widget) => (
            <Button key={widget.id} size="sm" variant="ghost" onClick={() => onChange([...widgets, widget.id])}>
              <Plus size={14} />
              {widget.label}
            </Button>
          ))}
        </div>
      )}
    </>
  );
}
