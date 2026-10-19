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
import { ask } from '@/lib/bridge/bridge';
import { cn } from '@/lib/utils';
import { t } from '@shared/i18n/translate';

// Types
import type { SettingsPaneProps } from '@/components/views/settings/shared/types';
import { ambientHexFor, ambientStopsFor, hueForAmbientHex } from '@shared/chrome/ambient';
import {
  START_PAGE_WIDGETS,
  THEME_IDS,
  type AppearanceId,
  type DensityId,
  type StartPageWidgetId,
  type ThemeId,
} from '@shared/types';

const APPEARANCE_LABELS: Record<AppearanceId, string> = {
  system: t('settings.appearance.interface.system'),
  light: t('settings.appearance.interface.light'),
  dark: t('settings.appearance.interface.dark'),
};
const DENSITY_LABELS: Record<DensityId, string> = {
  comfortable: t('settings.appearance.interface.density.comfortable'),
  compact: t('settings.appearance.interface.density.compact'),
};
const THEME_LABELS: Record<ThemeId, string> = {
  deep: t('settings.appearance.startPage.colour.deep'),
  slate: t('settings.appearance.startPage.colour.slate'),
  ember: t('settings.appearance.startPage.colour.ember'),
  moss: t('settings.appearance.startPage.colour.moss'),
  dusk: t('settings.appearance.startPage.colour.dusk'),
  sand: t('settings.appearance.startPage.colour.sand'),
};

const ZOOM_LEVELS = [0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2].map((level) => ({
  id: String(level),
  label: `${Math.round(level * 100)}%`,
}));

export function AppearancePane({ openPane }: SettingsPaneProps) {
  const settings = useBrowserStore((state) => state.settings);
  const zoomedSites = Object.keys(settings.zoomLevels).length;
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
      <SettingGroup title={t('settings.appearance.interface.title')}>
        <SettingRow
          label={t('settings.appearance.interface.appearance')}
          control={
            <SegmentedControl
              label={t('settings.appearance.interface.appearance')}
              options={labelledOptions(APPEARANCE_LABELS)}
              value={settings.appearance}
              onChange={(appearance) => updateSettings({ appearance })}
            />
          }
        />
        <SettingRow
          label={t('settings.appearance.interface.density.label')}
          help={t('settings.appearance.interface.density.help')}
          control={
            <SegmentedControl
              label={t('settings.appearance.interface.density.label')}
              options={labelledOptions(DENSITY_LABELS)}
              value={settings.density}
              onChange={(density) => updateSettings({ density })}
            />
          }
        />
      </SettingGroup>

      <SettingGroup title={t('settings.appearance.zoom.title')}>
        <SettingRow
          label={t('settings.appearance.zoom.default.label')}
          help={t('settings.appearance.zoom.default.help')}
          control={
            <Select
              label={t('settings.appearance.zoom.default.label')}
              options={ZOOM_LEVELS}
              value={String(settings.defaultZoomFactor)}
              onChange={(level) => updateSettings({ defaultZoomFactor: Number(level) })}
            />
          }
        />
        {zoomedSites > 0 && (
          <SettingRow
            label={t('settings.appearance.zoom.zoomedSites', { count: zoomedSites })}
            control={
              <Button size="sm" variant="ghost" onClick={() => openPane('sites')}>
                {t('settings.appearance.zoom.siteSettings')}
              </Button>
            }
          />
        )}
      </SettingGroup>

      <SettingGroup title={t('settings.appearance.startPage.title')}>
        <div className="flex flex-col gap-3 p-3.5">
          <AppearancePreview
            widgets={settings.startPageWidgets}
            wallpaper={settings.hasWallpaper ? wallpaper : null}
          />
        </div>
        <SettingRow
          label={t('settings.appearance.startPage.colour.label')}
          help={t('settings.appearance.startPage.colour.help')}
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
          label={t('settings.appearance.startPage.wallpaper.label')}
          help={
            wallpaperError || (settings.hasWallpaper ? t('settings.appearance.startPage.wallpaper.help') : undefined)
          }
          control={
            <>
              <Button size="sm" onClick={() => void chooseWallpaper()}>
                {settings.hasWallpaper
                  ? t('settings.appearance.startPage.wallpaper.change')
                  : t('settings.appearance.startPage.wallpaper.choose')}
              </Button>
              {settings.hasWallpaper && (
                <Button size="sm" variant="ghost" onClick={() => void removeWallpaper()}>
                  {t('settings.appearance.startPage.wallpaper.remove')}
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
    <div role="radiogroup" aria-label={t('settings.appearance.startPage.colour.group')} className="flex gap-1.5">
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
      label={t('settings.appearance.startPage.shade.label')}
      control={
        <>
          <input
            type="range"
            min={0}
            max={359}
            value={hue}
            aria-label={t('settings.appearance.startPage.shade.slider')}
            onChange={(event) => {
              setTyped(null);
              updateSettings({ ambientHue: Number(event.target.value) });
            }}
            className="w-36 accent-[var(--color-accent)]"
          />
          <TextField
            value={shown}
            spellCheck={false}
            aria-label={t('settings.appearance.startPage.shade.hex')}
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
                label={t('settings.appearance.startPage.widgets.moveUp', { widget: widget.label })}
                onClick={() => move(widget.id, -1)}
                disabled={index === 0}
              >
                <ChevronUp size={16} />
              </IconButton>
              <IconButton
                label={t('settings.appearance.startPage.widgets.moveDown', { widget: widget.label })}
                onClick={() => move(widget.id, 1)}
                disabled={index === shown.length - 1}
              >
                <ChevronDown size={16} />
              </IconButton>
              <IconButton
                label={t('settings.appearance.startPage.widgets.remove', { widget: widget.label })}
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
